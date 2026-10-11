import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
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

// Initialize Supabase Client
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const supabase =
  supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    : null;

// In-flight chunk uploads tracking
interface UploadSession {
  uploadId: string;
  fileName: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  totalSize: number;
  mimeType: string;
  createdAt: number;
}

const activeSessions = new Map<string, UploadSession>();

// Initialize a chunked upload session
router.post('/init', async (req, res) => {
  try {
    const { fileName, totalChunks, totalSize, mimeType } = req.body;
    if (!fileName || !totalChunks) {
      return res.status(400).json({ error: 'Missing fileName or totalChunks' });
    }

    const uploadId = `upl_${crypto.randomUUID()}`;
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    activeSessions.set(uploadId, {
      uploadId,
      fileName,
      totalChunks: parseInt(totalChunks, 10),
      receivedChunks: new Set<number>(),
      totalSize: parseInt(totalSize, 10) || 0,
      mimeType: mimeType || 'video/mp4',
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

    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}`);

    // chunkData can be base64 string
    const buffer = Buffer.from(chunkData, 'base64');
    fs.writeFileSync(chunkPath, buffer);

    session.receivedChunks.add(Number(chunkIndex));

    const progress = Math.round((session.receivedChunks.size / session.totalChunks) * 100);

    res.json({
      success: true,
      chunkIndex: Number(chunkIndex),
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
    const { uploadId, title, description, aspectRatio } = req.body;
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
    const fileExt = path.extname(session.fileName) || '.mp4';
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
    let publicUrl = `/uploads/${finalFileName}`;

    // Upload assembled file buffer to Supabase Storage if configured
    if (supabase) {
      try {
        const fileBuffer = fs.readFileSync(finalFilePath);
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('videos')
          .upload(finalFileName, fileBuffer, {
            contentType: session.mimeType || 'video/mp4',
            upsert: true,
          });

        if (!uploadErr && uploadData) {
          const { data: urlData } = supabase.storage
            .from('videos')
            .getPublicUrl(finalFileName);

          if (urlData?.publicUrl) {
            publicUrl = urlData.publicUrl;
          }
        } else if (uploadErr) {
          console.warn('Supabase storage upload error:', uploadErr.message);
        }
      } catch (sbErr: any) {
        console.warn('Supabase storage upload exception:', sbErr?.message);
      }
    }

    // Record in database
    const video = await db.createVideo({
      id: videoId,
      title: title || session.fileName.replace(/\.[^/.]+$/, ''),
      description: description || '',
      file_url: publicUrl,
      file_size: fileStats.size,
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
    const { fileName, fileData, mimeType, title, aspectRatio } = req.body;
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing fileData or fileName' });
    }

    const videoId = `vid_${crypto.randomUUID()}`;
    const fileExt = path.extname(fileName) || '.mp4';
    const finalFileName = `${videoId}${fileExt}`;
    const finalFilePath = path.join(UPLOADS_DIR, finalFileName);

    const cleanBase64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(finalFilePath, buffer);

    const fileStats = fs.statSync(finalFilePath);
    let publicUrl = `/uploads/${finalFileName}`;

    if (supabase) {
      try {
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('videos')
          .upload(finalFileName, buffer, {
            contentType: mimeType || 'video/mp4',
            upsert: true,
          });

        if (!uploadErr && uploadData) {
          const { data: urlData } = supabase.storage
            .from('videos')
            .getPublicUrl(finalFileName);

          if (urlData?.publicUrl) {
            publicUrl = urlData.publicUrl;
          }
        } else if (uploadErr) {
          console.warn('Supabase storage upload error:', uploadErr.message);
        }
      } catch (sbErr: any) {
        console.warn('Supabase storage upload exception:', sbErr?.message);
      }
    }

    const video = await db.createVideo({
      id: videoId,
      title: title || fileName.replace(/\.[^/.]+$/, ''),
      file_url: publicUrl,
      file_size: fileStats.size,
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
