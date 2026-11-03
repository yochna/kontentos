import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as db from '../db.js';
import type { Video } from '../../src/types.js';
import { safeMessage } from '../errorText.js';

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
  /**
   * The creator who opened the session. Chunk ids are unguessable but not proof of ownership, and
   * a re-linked upload writes over an existing clip, so every later request has to match this.
   */
  userId: string;
  fileName: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  totalSize: number;
  /** Bytes actually accepted so far — the declared totalSize is the sender's own claim. */
  receivedBytes: number;
  createdAt: number;
  /** When a chunk last arrived. An upload that stops answering is abandoned, not slow. */
  lastActivityAt: number;
  /** Set when this upload re-attaches media to a record that already exists. See relinkTarget. */
  videoId?: string;
}

const activeSessions = new Map<string, UploadSession>();

/** The session, but only if this creator is the one who opened it. */
function ownSession(uploadId: unknown, userId: string): UploadSession | null {
  const id = typeof uploadId === 'string' ? uploadId : '';
  const session = activeSessions.get(id) || null;
  return session && session.userId === userId ? session : null;
}

// ---- Upload hardening -------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv']);
const MAX_TOTAL_CHUNKS = 2000; // ~10 GB at 5 MB/chunk
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB per video
const MAX_DIRECT_BYTES = 100 * 1024 * 1024; // 100 MB for /direct
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // abandoned sessions expire after 6h
/** An upload that stops sending chunks is gone; six hours of held bytes would be only a disk leak. */
const SESSION_IDLE_MS = 30 * 60 * 1000;
/** /init followed by nothing is a page reload, not an upload. It cannot hold a slot for long. */
const NEVER_STARTED_MS = 5 * 60 * 1000;
/**
 * Chunks wait on this container's disk until they are merged, and Render's free disk is shared by
 * every creator. One account opening session after session — each allowed to hold 2 GB — fills it,
 * and the whole workspace goes down with it.
 */
const MAX_SESSIONS_PER_USER = 3;

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
export function sweepExpiredSessions() {
  const now = Date.now();
  for (const [id, s] of activeSessions) {
    const abandoned =
      now - s.createdAt > SESSION_TTL_MS ||
      now - s.lastActivityAt > SESSION_IDLE_MS ||
      (s.receivedChunks.size === 0 && now - s.createdAt > NEVER_STARTED_MS);
    if (abandoned) {
      fs.rmSync(path.join(CHUNKS_DIR, id), { recursive: true, force: true });
      activeSessions.delete(id);
    }
  }
}
setInterval(sweepExpiredSessions, 30 * 60 * 1000).unref();

/** Sessions this creator still holds open, after anything abandoned has been cleared away. */
function liveSessionsFor(userId: string): number {
  sweepExpiredSessions();
  let count = 0;
  for (const session of activeSessions.values()) {
    if (session.userId === userId) count++;
  }
  return count;
}

/**
 * Render's free disk is wiped on every redeploy while the Mongo row survives, so a creator can end up
 * holding a cut with captions, a queue position and Studio shorts attached to a file that is gone.
 * Re-uploading it has to land on that same row — minting a new id would orphan all of that work. An
 * upload with no `videoId` is the ordinary new-clip path and returns null.
 */
async function findRelinkRow(
  videoId: unknown,
  userId: string
): Promise<{ video: Video } | { error: string; status: number } | null> {
  if (videoId === undefined || videoId === null || videoId === '') return null;
  // The id is reused as the stored filename, so it only ever goes through in our own shape.
  if (typeof videoId !== 'string' || !/^vid_[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return { error: 'That is not a clip id KontentOS issued.', status: 400 };
  }
  const video = await db.getVideo(videoId, userId);
  return video ? { video } : { error: 'No clip with that id is on your account.', status: 404 };
}

// Initialize a chunked upload session
router.post('/init', async (req, res) => {
  try {
    const { fileName, totalChunks, totalSize, videoId } = req.body;
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

    // Reject a bad re-link here rather than after the creator has sent every chunk.
    const relink = await findRelinkRow(videoId, req.userId);
    if (relink && 'error' in relink) {
      return res.status(relink.status).json({ error: relink.error });
    }

    if (liveSessionsFor(req.userId) >= MAX_SESSIONS_PER_USER) {
      return res.status(429).json({
        error: `You already have ${MAX_SESSIONS_PER_USER} uploads in flight. Let one finish before starting another.`,
      });
    }

    const uploadId = `upl_${crypto.randomUUID()}`;
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    activeSessions.set(uploadId, {
      uploadId,
      userId: req.userId,
      fileName,
      totalChunks: chunkCount,
      receivedChunks: new Set<number>(),
      totalSize: parseInt(totalSize, 10) || 0,
      receivedBytes: 0,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      videoId: relink?.video.id,
    });

    res.json({
      success: true,
      uploadId,
      message: 'Upload session initialized',
    });
  } catch (err: any) {
    console.error('Error in /api/upload/init:', err);
    res.status(500).json({ error: safeMessage(err, 'Internal server error') });
  }
});

// Upload an individual 5MB chunk (Base64 or Raw Binary)
router.post('/chunk', async (req, res) => {
  try {
    const { uploadId, chunkIndex, chunkData } = req.body;

    if (!uploadId || chunkIndex === undefined || !chunkData) {
      return res.status(400).json({ error: 'Missing uploadId, chunkIndex, or chunkData' });
    }

    const session = ownSession(uploadId, req.userId);
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

    const sessionDir = path.join(CHUNKS_DIR, session.uploadId);
    const chunkPath = path.join(sessionDir, `chunk_${idx}`);
    // Defense in depth: the resolved path must stay inside this session's folder.
    if (!path.resolve(chunkPath).startsWith(path.resolve(sessionDir) + path.sep)) {
      return res.status(400).json({ error: 'Invalid chunk path' });
    }

    // chunkData can be base64 string
    const buffer = Buffer.from(chunkData, 'base64');
    // The declared totalSize is only a promise; a session that keeps sending past the ceiling
    // would fill the disk every creator shares.
    if (!session.receivedChunks.has(idx)) {
      const nextBytes = session.receivedBytes + buffer.length;
      if (nextBytes > MAX_FILE_BYTES) {
        return res.status(413).json({ error: 'This upload has grown past the 2 GB limit for one clip.' });
      }
      session.receivedBytes = nextBytes;
    }
    fs.writeFileSync(chunkPath, buffer);

    session.receivedChunks.add(idx);
    session.lastActivityAt = Date.now();

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
    res.status(500).json({ error: safeMessage(err, 'Failed to process chunk') });
  }
});

// Complete and reassemble chunks into single video file
router.post('/complete', async (req, res) => {
  try {
    const { uploadId, title, description, aspectRatio, duration } = req.body;
    const session = ownSession(uploadId, req.userId);

    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    if (session.receivedChunks.size < session.totalChunks) {
      return res.status(400).json({
        error: `Incomplete upload: received ${session.receivedChunks.size} of ${session.totalChunks} chunks`,
      });
    }

    // The row could have been deleted between /init and now; confirm it is still this creator's
    // before overwriting anything, and treat it as a fresh clip if it has gone.
    const relink = session.videoId ? await findRelinkRow(session.videoId, req.userId) : null;
    if (relink && 'error' in relink) {
      fs.rmSync(path.join(CHUNKS_DIR, session.uploadId), { recursive: true, force: true });
      activeSessions.delete(session.uploadId);
      return res.status(relink.status).json({ error: relink.error });
    }
    const existing = relink?.video;

    const sessionDir = path.join(CHUNKS_DIR, session.uploadId);
    const fileExt = safeExtension(session.fileName) || '.mp4';
    const videoId = existing?.id || `vid_${crypto.randomUUID()}`;
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
    activeSessions.delete(session.uploadId);

    const fileStats = fs.statSync(finalFilePath);
    // The assembled clip stays in this container's uploads directory; only its record is
    // durable when MONGODB_URI is set. See the storage note in /api/db/status.
    const publicUrl = `/uploads/${finalFileName}`;

    let video: Video;
    if (existing) {
      // The replacement is on disk, so the file the row used to point at is now dead weight.
      if (existing.file_url && existing.file_url !== publicUrl) {
        db.removeUploadedVideoFile(existing.file_url);
      }
      const updated = await db.updateVideoStatus(
        videoId,
        'ready',
        {
          file_url: publicUrl,
          file_size: fileStats.size,
          duration: duration ? Number(duration) : existing.duration,
        },
        req.userId
      );
      if (!updated) {
        return res.status(404).json({ error: 'No clip with that id is on your account.' });
      }
      video = updated;
    } else {
      video = await db.createVideo({
        id: videoId,
        user_id: req.userId,
        title: title || session.fileName.replace(/\.[^/.]+$/, ''),
        description: description || '',
        file_url: publicUrl,
        file_size: fileStats.size,
        duration: duration ? Number(duration) : 0,
        aspect_ratio: aspectRatio || '9:16',
        status: 'ready',
      });
    }

    res.json({
      success: true,
      video,
      message: existing ? 'Clip re-attached to the record you already had' : 'Video successfully assembled and ready',
    });
  } catch (err: any) {
    console.error('Error in /api/upload/complete:', err);
    res.status(500).json({ error: safeMessage(err, 'Failed to finalize video') });
  }
});

// Single Direct Upload route (for smaller drag-and-drops / previews)
router.post('/direct', async (req, res) => {
  try {
    const { fileName, fileData, title, aspectRatio, duration, videoId } = req.body;
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

    const relink = await findRelinkRow(videoId, req.userId);
    if (relink && 'error' in relink) {
      return res.status(relink.status).json({ error: relink.error });
    }
    const existing = relink?.video;

    const videoIdFinal = existing?.id || `vid_${crypto.randomUUID()}`;
    const finalFileName = `${videoIdFinal}${fileExt}`;
    const finalFilePath = path.join(UPLOADS_DIR, finalFileName);

    const cleanBase64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length > MAX_DIRECT_BYTES) {
      return res.status(413).json({ error: 'File too large for direct upload (max 100 MB). Use chunked upload.' });
    }
    fs.writeFileSync(finalFilePath, buffer);

    const fileStats = fs.statSync(finalFilePath);
    const publicUrl = `/uploads/${finalFileName}`;

    let video: Video;
    if (existing) {
      if (existing.file_url && existing.file_url !== publicUrl) {
        db.removeUploadedVideoFile(existing.file_url);
      }
      const updated = await db.updateVideoStatus(
        videoIdFinal,
        'ready',
        {
          file_url: publicUrl,
          file_size: fileStats.size,
          duration: duration ? Number(duration) : existing.duration,
        },
        req.userId
      );
      if (!updated) {
        return res.status(404).json({ error: 'No clip with that id is on your account.' });
      }
      video = updated;
    } else {
      video = await db.createVideo({
        id: videoIdFinal,
        user_id: req.userId,
        title: title || fileName.replace(/\.[^/.]+$/, ''),
        file_url: publicUrl,
        file_size: fileStats.size,
        duration: duration ? Number(duration) : 0,
        aspect_ratio: aspectRatio || '9:16',
        status: 'ready',
      });
    }

    res.json({
      success: true,
      video,
      message: existing ? 'Clip re-attached to the record you already had' : 'Video uploaded directly',
    });
  } catch (err: any) {
    console.error('Error in /api/upload/direct:', err);
    res.status(500).json({ error: safeMessage(err, 'Direct upload failed') });
  }
});

export default router;
