import express from 'express';
import fs from 'fs';
import path from 'path';
import * as db from '../db.js';
import { safeMessage } from '../errorText.js';

const router = express.Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Render's free disk is wiped on redeploy while the Mongo row survives, so a clip can be a record
 * of a file that no longer exists. The player would show a black rectangle; this says why instead.
 */
function mediaExists(fileUrl?: string): boolean {
  if (!fileUrl) return false;
  // Remote or in-browser sources (https, data:, blob:) are not files this server can stat.
  if (!fileUrl.startsWith('/uploads/')) return true;
  return [path.join(UPLOADS_DIR, path.basename(fileUrl)), path.join(process.cwd(), fileUrl)].some((p) =>
    fs.existsSync(p)
  );
}

// Every query below is filtered by req.userId, which the auth gate has already verified.

// List all videos
router.get('/', async (req, res) => {
  try {
    const videos = await db.listVideos(req.userId);
    res.json({ success: true, data: videos.map((v) => ({ ...v, media_available: mediaExists(v.file_url) })) });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to list videos') });
  }
});

// Create or register a video asset in library
router.post('/', async (req, res) => {
  try {
    // Field-by-field, not `{...req.body}`: a caller must not be able to plant arbitrary keys on
    // the stored row, and every value has to be the type the player and the ledger assume.
    const body = req.body || {};
    const asText = (value: unknown, limit: number, fallback = '') =>
      typeof value === 'string' && value.length <= limit ? value.trim() : fallback;
    const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    const video = await db.createVideo({
      id: asText(body.id, 200) || undefined,
      user_id: req.userId,
      title: asText(body.title, 200, 'Untitled recording'),
      description: asText(body.description, 4000),
      file_url: asText(body.file_url, 2000),
      thumbnail_url: asText(body.thumbnail_url, 2000),
      duration: asNumber(body.duration),
      file_size: asNumber(body.file_size),
      aspect_ratio: asText(body.aspect_ratio, 10, '9:16'),
      status: 'uploading',
    });
    res.json({ success: true, data: video });
  } catch (err: any) {
    res.status(500).json({ error: 'Could not add that clip to your library. Please try again.' });
  }
});

// Get video by ID
router.get('/:id', async (req, res) => {
  try {
    const video = await db.getVideo(req.params.id, req.userId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    const subtitles = await db.getSubtitles(video.id, req.userId);
    const caption = await db.getCaption(video.id, 'instagram', req.userId);

    res.json({
      success: true,
      data: {
        ...video,
        media_available: mediaExists(video.file_url),
        subtitles,
        caption,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to get video') });
  }
});

// Inspect video specs (Instagram Reels compatibility check: 1080x1920, 9:16 aspect ratio)
router.post('/:id/inspect', async (req, res) => {
  try {
    const video = await db.getVideo(req.params.id, req.userId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Determine Instagram compatibility
    const isVertical = video.aspect_ratio === '9:16';
    const isDurationOk = (video.duration || 0) <= 90; // Instagram Reels max recommended 90s

    const compliance = {
      isCompatible: isVertical && isDurationOk,
      aspectRatio: video.aspect_ratio || '9:16',
      targetAspectRatio: '9:16 (1080x1920)',
      isVertical,
      duration: video.duration || 0,
      maxRecommendedDuration: 90,
      fileSizeMb: video.file_size ? (video.file_size / (1024 * 1024)).toFixed(2) : 'Unknown',
      recommendations: [] as string[],
    };

    if (!isVertical) {
      compliance.recommendations.push(
        'Video is horizontal or square. Instagram Reels recommends 9:16 (1080x1920) vertical format.'
      );
    }
    if ((video.duration || 0) > 90) {
      compliance.recommendations.push(
        'Video exceeds standard 90s Reels recommendation.'
      );
    }

    res.json({
      success: true,
      data: compliance,
    });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to inspect video') });
  }
});

// Update video status or details
router.patch('/:id', async (req, res) => {
  try {
    const { status, title, description, aspectRatio, duration } = req.body;
    const updated = await db.updateVideoStatus(req.params.id, status || 'ready', {
      title,
      description,
      aspect_ratio: aspectRatio,
      duration: duration ? Number(duration) : undefined,
    }, req.userId);
    if (!updated) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to update video') });
  }
});

// Delete video and its associated media files (the stored clip goes with the record).
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await db.deleteVideo(req.params.id, req.userId);
    res.json({ success: deleted, message: deleted ? 'Video deleted' : 'Video not found' });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to delete video') });
  }
});

export default router;
