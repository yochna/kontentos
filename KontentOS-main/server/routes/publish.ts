import express from 'express';
import crypto from 'crypto';
import * as db from '../db.js';

const router = express.Router();

// Get connection status (standalone mode - no platform logins required)
router.get(['/status', '/instagram/status'], async (req, res) => {
  res.json({
    success: true,
    standalone: true,
    message: 'KontentOS is running in standalone creator mode with no OAuth required.',
  });
});

// Save / Export Reel record to library & history
router.post(['/reels', '/instagram', '/save'], async (req, res) => {
  try {
    const { videoId, captionText, hashtags = [] } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    let video = await db.getVideo(videoId);
    if (!video) {
      video = await db.createVideo({
        id: videoId,
        title: 'Uploaded Creator Footage',
        file_name: 'footage.mp4',
        file_url: '/uploads/footage.mp4',
        status: 'ready',
        file_size: 1024 * 1024 * 15,
        duration: 30,
      });
    }

    // Format final caption with hashtags
    const formattedTags = Array.isArray(hashtags)
      ? hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
      : '';

    const fullCaption = `${captionText || ''}\n\n${formattedTags}`.trim();

    // Check character count constraint
    if (fullCaption.length > 2200) {
      return res.status(400).json({
        error: `Caption exceeds Instagram maximum limit of 2,200 characters (currently ${fullCaption.length})`,
      });
    }

    const postId = `reel_${crypto.randomUUID().slice(0, 10)}`;
    const postUrl = `https://www.instagram.com/reel/${postId.slice(5)}/`;

    const record = await db.recordPublish({
      video_id: videoId,
      platform: 'instagram',
      platform_post_id: postId,
      url: postUrl,
      status: 'saved',
    });

    // Mark caption as approved
    const caption = await db.getCaption(videoId, 'instagram');
    if (caption) {
      await db.updateCaption(caption.id, { approved: true });
    }

    res.json({
      success: true,
      data: record,
      postUrl,
      message: 'Reel and caption saved to library successfully!',
    });
  } catch (err: any) {
    console.error('Error in /api/publish/reels:', err);
    res.status(500).json({ error: err.message || 'Saving failed' });
  }
});

// Get Publishing History
router.get('/history', async (req, res) => {
  try {
    const history = await db.listPublishingHistory();
    // Join with video info
    const enriched = await Promise.all(
      history.map(async (item) => {
        const video = await db.getVideo(item.video_id);
        const caption = await db.getCaption(item.video_id, item.platform);
        return {
          ...item,
          video_title: video?.title || 'Reel Post',
          caption_text: caption?.caption_text || '',
          hashtags: caption?.hashtags || [],
        };
      })
    );
    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a publishing history record
router.delete('/history/:id', async (req, res) => {
  try {
    const deleted = await db.deletePublishingRecord(req.params.id);
    res.json({ success: deleted, message: deleted ? 'Record deleted' : 'Record not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Scheduled Posts API Endpoints
// ==========================================

// GET /api/publish/schedule - Get all scheduled posts
router.get('/schedule', async (req, res) => {
  try {
    const posts = await db.listScheduledPosts();
    // Enrich with video titles/thumbnails if missing
    const enriched = await Promise.all(
      posts.map(async (p) => {
        if (!p.video_title && p.video_id) {
          const video = await db.getVideo(p.video_id);
          if (video) {
            p.video_title = video.title;
            p.thumbnail_url = video.thumbnail_url || p.thumbnail_url;
            p.file_url = video.file_url || p.file_url;
          }
        }
        return p;
      })
    );
    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/publish/schedule - Create or update a scheduled post with Multi-Platform Cross-Posting
router.post('/schedule', async (req, res) => {
  try {
    const {
      id,
      videoId,
      videoTitle,
      fileUrl,
      thumbnailUrl,
      platform,
      platforms,
      captionText,
      hashtags,
      scheduledAt,
      staggerMinutes = 0,
      platformCustomizations = {},
    } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    const video = await db.getVideo(videoId);

    // If single ID update
    if (id) {
      const postData = {
        video_id: videoId,
        video_title: videoTitle || video?.title || 'Creator Reel',
        file_url: fileUrl || req.body.file_url || video?.file_url || '',
        thumbnail_url: thumbnailUrl || req.body.thumbnail_url || video?.thumbnail_url || '',
        platform: platform || 'instagram',
        caption_text: captionText || '',
        hashtags: Array.isArray(hashtags) ? hashtags : [],
        scheduled_at: scheduledAt || new Date(Date.now() + 86400000).toISOString(),
      };
      const updated = await db.updateScheduledPost(id, postData);
      if (updated) {
        return res.json({ success: true, data: updated, message: 'Scheduled post updated successfully!' });
      }
    }

    // Determine target platforms for cross-posting
    const targetPlatforms: string[] = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : [platform || 'instagram'];

    const crossPostGroupId = targetPlatforms.length > 1 ? `cross_${crypto.randomUUID().slice(0, 10)}` : undefined;
    const baseTime = scheduledAt ? new Date(scheduledAt).getTime() : Date.now() + 86400000;
    const staggerMs = Math.max(0, Number(staggerMinutes) || 0) * 60 * 1000;

    const createdPosts = [];
    for (let i = 0; i < targetPlatforms.length; i++) {
      const targetPlat = targetPlatforms[i];
      const custom = platformCustomizations[targetPlat] || {};
      
      // Compute staggered time per platform if specified
      const platTime = custom.scheduledAt || new Date(baseTime + (i * staggerMs)).toISOString();
      const platCaption = custom.captionText !== undefined ? custom.captionText : (captionText || '');
      const platHashtags = Array.isArray(custom.hashtags) ? custom.hashtags : (Array.isArray(hashtags) ? hashtags : []);

      const newPostData = {
        id: (targetPlatforms.length === 1 && req.body.id) ? req.body.id : undefined,
        video_id: videoId,
        video_title: videoTitle || video?.title || 'Creator Reel',
        file_url: fileUrl || req.body.file_url || video?.file_url || '',
        thumbnail_url: thumbnailUrl || req.body.thumbnail_url || video?.thumbnail_url || '',
        platform: targetPlat as any,
        caption_text: platCaption,
        hashtags: platHashtags,
        scheduled_at: platTime,
        status: 'scheduled' as const,
        cross_post_group_id: crossPostGroupId,
      };
      const created = await db.createScheduledPost(newPostData);
      createdPosts.push(created);
    }

    const platformNames = targetPlatforms.map(p => p.toUpperCase()).join(', ');
    res.json({
      success: true,
      data: createdPosts.length === 1 ? createdPosts[0] : createdPosts,
      total: createdPosts.length,
      crossPostGroupId,
      message: createdPosts.length > 1
        ? `✨ Multi-Platform Cross-Post scheduled across ${createdPosts.length} platforms (${platformNames})!`
        : '✨ Post scheduled successfully!',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/publish/schedule/:id/crosspost - Cross-post an existing post to additional platforms
router.post('/schedule/:id/crosspost', async (req, res) => {
  try {
    const existing = await db.getScheduledPost(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Source post not found' });
    }

    const { targetPlatforms = [], staggerMinutes = 0, customCaptions = {} } = req.body;
    if (!Array.isArray(targetPlatforms) || targetPlatforms.length === 0) {
      return res.status(400).json({ error: 'No target platforms specified for cross-posting' });
    }

    const crossPostGroupId = existing.cross_post_group_id || `cross_${crypto.randomUUID().slice(0, 10)}`;
    
    // Update existing post with crossPostGroupId if it doesn't have one
    if (!existing.cross_post_group_id) {
      await db.updateScheduledPost(existing.id, { cross_post_group_id: crossPostGroupId });
    }

    const baseTime = new Date(existing.scheduled_at).getTime();
    const staggerMs = Math.max(0, Number(staggerMinutes) || 0) * 60 * 1000;
    const createdPosts = [];

    for (let i = 0; i < targetPlatforms.length; i++) {
      const plat = targetPlatforms[i];
      if (plat === existing.platform) continue; // Skip source platform

      const platCaption = customCaptions[plat] !== undefined ? customCaptions[plat] : existing.caption_text;
      const platTime = new Date(baseTime + ((i + 1) * staggerMs)).toISOString();

      const newPost = await db.createScheduledPost({
        video_id: existing.video_id,
        video_title: existing.video_title,
        file_url: existing.file_url,
        thumbnail_url: existing.thumbnail_url,
        platform: plat as any,
        caption_text: platCaption,
        hashtags: existing.hashtags || [],
        scheduled_at: platTime,
        status: 'scheduled',
        cross_post_group_id: crossPostGroupId,
      });
      createdPosts.push(newPost);
    }

    res.json({
      success: true,
      data: createdPosts,
      total: createdPosts.length,
      crossPostGroupId,
      message: `✨ Successfully cross-posted to ${createdPosts.length} additional platforms!`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/publish/schedule/:id - Update post fields (e.g., date, time, caption, title)
router.patch('/schedule/:id', async (req, res) => {
  try {
    const { videoTitle, platform, captionText, hashtags, scheduledAt, status } = req.body;
    const updates: any = {};
    if (videoTitle !== undefined) updates.video_title = videoTitle;
    if (platform !== undefined) updates.platform = platform;
    if (captionText !== undefined) updates.caption_text = captionText;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (scheduledAt !== undefined) updates.scheduled_at = scheduledAt;
    if (status !== undefined) updates.status = status;

    const updated = await db.updateScheduledPost(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }
    res.json({ success: true, data: updated, message: 'Post updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/publish/schedule/:id - Full post update
router.put('/schedule/:id', async (req, res) => {
  try {
    const { videoTitle, platform, captionText, hashtags, scheduledAt, status } = req.body;
    const updates: any = {
      video_title: videoTitle,
      platform,
      caption_text: captionText,
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      scheduled_at: scheduledAt,
    };
    if (status) updates.status = status;

    const updated = await db.updateScheduledPost(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }
    res.json({ success: true, data: updated, message: 'Post updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/publish/schedule/:id/publish-now - Trigger immediate publishing
router.post('/schedule/:id/publish-now', async (req, res) => {
  try {
    const updated = await db.updateScheduledPost(req.params.id, {
      status: 'published',
      published_at: new Date().toISOString(),
      platform_post_id: `live_${crypto.randomUUID().slice(0, 8)}`,
      post_url: `https://kontentos.ai/posts/${req.params.id}`,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    // Also record in publishing_history
    await db.recordPublish({
      video_id: updated.video_id,
      platform: updated.platform,
      platform_post_id: updated.platform_post_id,
      url: updated.post_url,
      status: 'published',
    });

    res.json({ success: true, data: updated, message: 'Post published immediately!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/publish/schedule/:id - Delete / cancel scheduled post
router.delete('/schedule/:id', async (req, res) => {
  try {
    const deleted = await db.deleteScheduledPost(req.params.id);
    res.json({ success: deleted, message: deleted ? 'Scheduled post cancelled' : 'Not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
