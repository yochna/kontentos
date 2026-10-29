import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as db from '../db.js';

const router = express.Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const CHUNKS_DIR = path.join(process.cwd(), 'uploads', '.chunks');

// Ensure upload directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

// In-flight chunk uploads tracking
interface UploadSession {
  uploadId: string;
  fileName: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  totalSize: number;
  createdAt: number;
}

const activeSessions = new Map<string, UploadSession>();

// ---- Upload hardening -------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv']);
const MAX_TOTAL_CHUNKS = 2000; // ~10 GB at 5 MB/chunk
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB per video
const MAX_DIRECT_BYTES = 100 * 1024 * 1024; // 100 MB for /direct
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // abandoned sessions expire after 6h

/** Returns a safe, lower-cased extension from a user-supplied filename, or null if not allowed. */
function safeExtension(fileName: unknown): string | null {
  if (typeof fileName !== 'string') return null;
  const ext = path.extname(path.basename(fileName)).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : null;
}

/** Parses a strict non-negative integer; returns null for anything else ("../x", "1e3", "-1", 1.5). */
function parseIndex(value: unknown): number | null {
  const s = String(value);
  if (!/^\d{1,6}$/.test(s)) return null;
  return Number(s);
}

/** Removes sessions (and their chunk folders) that were never completed. */
function sweepExpiredSessions() {
  const now = Date.now();
  for (const [id, s] of activeSessions) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      fs.rmSync(path.join(CHUNKS_DIR, id), { recursive: true, force: true });
      activeSessions.delete(id);
    }
  }
}
setInterval(sweepExpiredSessions, 30 * 60 * 1000).unref();

// Initialize a chunked upload session
router.post('/init', async (req, res) => {
  try {
    const { fileName, totalChunks, totalSize } = req.body;
    if (!fileName || !totalChunks) {
      return res.status(400).json({ error: 'Missing fileName or totalChunks' });
    }
    if (!safeExtension(fileName)) {
      return res.status(400).json({
        error: `Unsupported file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      });
    }
    const chunkCount = parseIndex(totalChunks);
    if (chunkCount === null || chunkCount < 1 || chunkCount > MAX_TOTAL_CHUNKS) {
      return res.status(400).json({ error: `totalChunks must be an integer between 1 and ${MAX_TOTAL_CHUNKS}` });
    }
    if ((parseInt(totalSize, 10) || 0) > MAX_FILE_BYTES) {
      return res.status(413).json({ error: 'File too large (max 2 GB)' });
    }

    const uploadId = `upl_${crypto.randomUUID()}`;
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    activeSessions.set(uploadId, {
      uploadId,
      fileName,
      totalChunks: chunkCount,
      receivedChunks: new Set<number>(),
      totalSize: parseInt(totalSize, 10) || 0,
      createdAt: Date.now(),
    });

    res.json({
      success: true,
      uploadId,
      message: 'Upload session initialized',
    });
  } catch (err: any) {
    console.error('Error in /api/upload/init:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Upload an individual 5MB chunk (Base64 or Raw Binary)
router.post('/chunk', async (req, res) => {
  try {
    const { uploadId, chunkIndex, chunkData } = req.body;

    if (!uploadId || chunkIndex === undefined || !chunkData) {
      return res.status(400).json({ error: 'Missing uploadId, chunkIndex, or chunkData' });
    }

    const session = activeSessions.get(uploadId);
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found or expired' });
    }

    // SECURITY: chunkIndex must be a plain integer inside the declared range.
    // Previously it was interpolated straight into a file path ("../../x" escaped the folder).
    const idx = parseIndex(chunkIndex);
    if (idx === null || idx >= session.totalChunks) {
      return res.status(400).json({ error: `chunkIndex must be an integer from 0 to ${session.totalChunks - 1}` });
    }
    if (typeof chunkData !== 'string') {
      return res.status(400).json({ error: 'chunkData must be a base64 string' });
    }

    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    const chunkPath = path.join(sessionDir, `chunk_${idx}`);
    // Defense in depth: the resolved path must stay inside this session's folder.
    if (!path.resolve(chunkPath).startsWith(path.resolve(sessionDir) + path.sep)) {
      return res.status(400).json({ error: 'Invalid chunk path' });
    }

    // chunkData can be base64 string
    const buffer = Buffer.from(chunkData, 'base64');
    fs.writeFileSync(chunkPath, buffer);

    session.receivedChunks.add(idx);

    const progress = Math.round((session.receivedChunks.size / session.totalChunks) * 100);

    res.json({
      success: true,
      chunkIndex: idx,
      receivedChunks: session.receivedChunks.size,
      totalChunks: session.totalChunks,
      progress,
    });
  } catch (err: any) {
    console.error('Error in /api/upload/chunk:', err);
    res.status(500).json({ error: err.message || 'Failed to process chunk' });
  }
});

// Complete and reassemble chunks into single video file
router.post('/complete', async (req, res) => {
  try {
    const { uploadId, title, description, aspectRatio, duration } = req.body;
    const session = activeSessions.get(uploadId);

    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    if (session.receivedChunks.size < session.totalChunks) {
      return res.status(400).json({
        error: `Incomplete upload: received ${session.receivedChunks.size} of ${session.totalChunks} chunks`,
      });
    }

    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    const fileExt = safeExtension(session.fileName) || '.mp4';
    const videoId = `vid_${crypto.randomUUID()}`;
    const finalFileName = `${videoId}${fileExt}`;
    const finalFilePath = path.join(UPLOADS_DIR, finalFileName);

    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      if (fs.existsSync(chunkPath)) {
        const chunkBuf = fs.readFileSync(chunkPath);
        writeStream.write(chunkBuf);
      }
    }
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', (err) => reject(err));
    });

    // Cleanup chunks
    fs.rmSync(sessionDir, { recursive: true, force: true });
    activeSessions.delete(uploadId);

    const fileStats = fs.statSync(finalFilePath);
    // The assembled clip stays in this container's uploads directory; only its record is
    // durable when MONGODB_URI is set. See the storage note in /api/db/status.
    const publicUrl = `/uploads/${finalFileName}`;

    // Record in database
    const video = await db.createVideo({
      id: videoId,
      title: title || session.fileName.replace(/\.[^/.]+$/, ''),
      description: description || '',
      file_url: publicUrl,
      file_size: fileStats.size,
      duration: duration ? Number(duration) : 0,
      aspect_ratio: aspectRatio || '9:16',
      status: 'ready',
    });

    res.json({
      success: true,
      video,
      message: 'Video successfully assembled and ready',
    });
  } catch (err: any) {
    console.error('Error in /api/upload/complete:', err);
    res.status(500).json({ error: err.message || 'Failed to finalize video' });
  }
});

// Single Direct Upload route (for smaller drag-and-drops / previews)
router.post('/direct', async (req, res) => {
  try {
    const { fileName, fileData, title, aspectRatio, duration } = req.body;
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing fileData or fileName' });
    }

    const fileExt = safeExtension(fileName);
    if (!fileExt) {
      return res.status(400).json({
        error: `Unsupported file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      });
    }
    if (typeof fileData !== 'string') {
      return res.status(400).json({ error: 'fileData must be a base64 string' });
    }

    const videoId = `vid_${crypto.randomUUID()}`;
    const finalFileName = `${videoId}${fileExt}`;
    const finalFilePath = path.join(UPLOADS_DIR, finalFileName);

    const cleanBase64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length > MAX_DIRECT_BYTES) {
      return res.status(413).json({ error: 'File too large for direct upload (max 100 MB). Use chunked upload.' });
    }
    fs.writeFileSync(finalFilePath, buffer);

    const fileStats = fs.statSync(finalFilePath);
    const publicUrl = `/uploads/${finalFileName}`;

    const video = await db.createVideo({
      id: videoId,
      title: title || fileName.replace(/\.[^/.]+$/, ''),
      file_url: publicUrl,
      file_size: fileStats.size,
      duration: duration ? Number(duration) : 0,
      aspect_ratio: aspectRatio || '9:16',
      status: 'ready',
    });

    res.json({
      success: true,
      video,
      message: 'Video uploaded directly',
    });
  } catch (err: any) {
    console.error('Error in /api/upload/direct:', err);
    res.status(500).json({ error: err.message || 'Direct upload failed' });
  }
});

export default router;
