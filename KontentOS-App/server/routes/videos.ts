import express from 'express';
import fs from 'fs';
import path from 'path';
import * as db from '../db.js';

const router = express.Router();

// List all videos
router.get('/', async (req, res) => {
  try {
    const videos = await db.listVideos();
    res.json({ success: true, data: videos });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list videos' });
  }
});

// Create or register a video asset in library
router.post('/', async (req, res) => {
  try {
    const video = await db.createVideo(req.body);
    res.json({ success: true, data: video });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create video record' });
  }
});

// Get video by ID
router.get('/:id', async (req, res) => {
  try {
    const video = await db.getVideo(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    const subtitles = await db.getSubtitles(video.id);
    const caption = await db.getCaption(video.id, 'instagram');

    res.json({
      success: true,
      data: {
        ...video,
        subtitles,
        caption,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get video' });
  }
});

// Inspect video specs (Instagram Reels compatibility check: 1080x1920, 9:16 aspect ratio)
router.post('/:id/inspect', async (req, res) => {
  try {
    const video = await db.getVideo(req.params.id);
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
    res.status(500).json({ error: err.message || 'Failed to inspect video' });
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
    });
    if (!updated) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update video' });
  }
});

// Delete video and its associated media files
router.delete('/:id', async (req, res) => {
  try {
    const video = await db.getVideo(req.params.id);
    if (video && video.file_url.startsWith('/uploads/')) {
      const localFilePath = path.join(process.cwd(), video.file_url);
      if (fs.existsSync(localFilePath)) {
        try {
          fs.unlinkSync(localFilePath);
        } catch (e) {
          console.warn('Could not delete local file:', e);
        }
      }
    }

    const deleted = await db.deleteVideo(req.params.id);
    res.json({ success: deleted, message: deleted ? 'Video deleted' : 'Video not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete video' });
  }
});

export default router;
