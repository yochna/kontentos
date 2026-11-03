import express from 'express';
import crypto from 'crypto';
import * as db from '../db.js';
import { checkCaption, platformSpec } from '../../src/lib/platforms.js';
import { asId } from '../safeId.js';
import { safeMessage } from '../errorText.js';

const router = express.Router();

/** What the platform's composer will actually receive: the caption plus the tags appended under it. */
function composedPost(text: string, tags: string[]): string {
  const normalised = tags.map((t) => (String(t).startsWith('#') ? String(t) : `#${String(t)}`));
  return [String(text || '').trim(), normalised.join(' ').trim()].filter(Boolean).join('\n\n');
}

const LIVE_URL = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i;

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
    const { videoId: sentVideoId, captionText, hashtags = [] } = req.body;
    const videoId = asId(sentVideoId);
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    // The clip has to already exist in this creator's workspace. Inventing a placeholder
    // row here filled the library with a phantom 15MB "Uploaded Creator Footage" that no
    // upload ever produced, and skewed every count built on it.
    const video = await db.getVideo(videoId, req.userId);
    if (!video) {
      return res.status(404).json({ error: 'That clip is not in your workspace. Upload it first.' });
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

    // KontentOS records the post but does not upload to Instagram (no API integration yet),
    // so there is no real permalink and no real platform post id to store. Fabricating either
    // sends creators to a URL that does not exist or implies a post Instagram never saw.
    const record = await db.recordPublish({
      video_id: videoId,
      platform: 'instagram',
      status: 'saved',
    }, req.userId);

    // Mark caption as approved
    const caption = await db.getCaption(videoId, 'instagram', req.userId);
    if (caption) {
      await db.updateCaption(caption.id, { approved: true }, req.userId);
    }

    res.json({
      success: true,
      data: record,
      message: 'Saved to your library as a ready-to-post draft. KontentOS does not upload to Instagram yet.',
    });
  } catch (err: any) {
    console.error('Error in /api/publish/reels:', err);
    res.status(500).json({ error: safeMessage(err, 'Saving failed') });
  }
});

// Get Publishing History
router.get('/history', async (req, res) => {
  try {
    const history = await db.listPublishingHistory(req.userId);
    // One read per table instead of two per row: a creator with a long ledger would otherwise make
    // this page wait on hundreds of round trips before it shows a single entry.
    const wanted: typeof history = [];
    const seen = new Set<string>();
    for (const item of history) {
      const key = `${item.video_id}::${item.platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      wanted.push(item);
    }
    const [videos, captions] = await Promise.all([
      db.listVideos(req.userId),
      Promise.all(wanted.map((item) => db.getCaption(item.video_id, item.platform, req.userId))),
    ]);
    const videoById = new Map(videos.map((video) => [video.id, video]));
    const captionByKey = new Map(
      wanted.map((item, index) => [`${item.video_id}::${item.platform}`, captions[index]])
    );
    const enriched = history.map((item) => {
      const caption = captionByKey.get(`${item.video_id}::${item.platform}`);
      return {
        ...item,
        video_title: videoById.get(item.video_id)?.title || 'Reel Post',
        caption_text: caption?.caption_text || '',
        hashtags: caption?.hashtags || [],
      };
    });
    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

// Delete a publishing history record
router.delete('/history/:id', async (req, res) => {
  try {
    const deleted = await db.deletePublishingRecord(req.params.id, req.userId);
    res.json({ success: deleted, message: deleted ? 'Record deleted' : 'Record not found' });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

// ==========================================
// Scheduled Posts API Endpoints
// ==========================================

// GET /api/publish/schedule - Get all scheduled posts
router.get('/schedule', async (req, res) => {
  try {
    const posts = await db.listScheduledPosts(req.userId);
    // Enrich with video titles/thumbnails if missing
    const userId = req.userId;
    const enriched = await Promise.all(
      posts.map(async (p) => {
        if (!p.video_title && p.video_id) {
          const video = await db.getVideo(p.video_id, userId);
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
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

// POST /api/publish/schedule - Create or update a scheduled post with Multi-Platform Cross-Posting
router.post('/schedule', async (req, res) => {
  try {
    const {
      id: sentId,
      videoId: sentVideoId,
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
    const id = asId(sentId);
    const videoId = asId(sentVideoId);

    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    const video = await db.getVideo(videoId, req.userId);

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
      const updated = await db.updateScheduledPost(id, postData, req.userId);
      if (updated) {
        return res.json({ success: true, data: updated, message: 'Scheduled post updated successfully!' });
      }
      // The row they were editing is not on this account — deleted, or somebody else's id. Writing a
      // fresh one here would leave the calendar with two entries for one edit.
      return res.status(404).json({ error: 'No scheduled post with that id is on your account.' });
    }

    // Determine target platforms for cross-posting
    const requestedPlatforms = Array.isArray(platforms) ? platforms.map(asId).filter(Boolean) : [];
    const targetPlatforms: string[] = requestedPlatforms.length > 0
      ? requestedPlatforms
      : [asId(platform) || 'instagram'];

    // A queued post the destination cannot accept is a lie on the calendar: X refuses more than
    // 280 characters, so the row would sit "scheduled" forever and never be publishable as written.
    const rejected = targetPlatforms
      .map((p) => {
        const custom = platformCustomizations[p] || {};
        const text = custom.captionText !== undefined ? custom.captionText : captionText || '';
        const tags = Array.isArray(custom.hashtags) ? custom.hashtags : (Array.isArray(hashtags) ? hashtags : []);
        const verdict = checkCaption(composedPost(text, tags.map(String)), p);
        return verdict.ok ? null : { platform: p, notes: verdict.notes };
      })
      .filter(Boolean) as { platform: string; notes: string[] }[];

    if (rejected.length > 0) {
      return res.status(400).json({
        error: rejected
          .map((r) => `${platformSpec(r.platform).label}: ${r.notes[0] || 'copy is over the platform limit'}`)
          .join(' · '),
      });
    }

    const crossPostGroupId = targetPlatforms.length > 1 ? `cross_${crypto.randomUUID().slice(0, 10)}` : undefined;
    const baseTime = scheduledAt ? new Date(scheduledAt).getTime() : Date.now() + 86400000;
    const staggerMs = Math.max(0, Number(staggerMinutes) || 0) * 60 * 1000;

    const createdPosts = [];
    const userId = req.userId;
    for (let i = 0; i < targetPlatforms.length; i++) {
      const targetPlat = targetPlatforms[i];
      const custom = platformCustomizations[targetPlat] || {};
      
      // Compute staggered time per platform if specified
      const platTime = custom.scheduledAt || new Date(baseTime + (i * staggerMs)).toISOString();
      const platCaption = custom.captionText !== undefined ? custom.captionText : (captionText || '');
      const platHashtags = Array.isArray(custom.hashtags) ? custom.hashtags : (Array.isArray(hashtags) ? hashtags : []);

      const newPostData = {
        id: (targetPlatforms.length === 1 && req.body.id) ? req.body.id : undefined,
        user_id: userId,
        video_id: videoId,
        video_title: videoTitle || video?.title || 'Creator Reel',
        file_url: fileUrl || req.body.file_url || video?.file_url || '',
        thumbnail_url: thumbnailUrl || req.body.thumbnail_url || video?.thumbnail_url || '',
        platform: targetPlat as any,
        caption_text: platCaption,
        hashtags: platHashtags,
        scheduled_at: platTime,
        status: (req.body.status || 'scheduled') as any,
        published_at: req.body.status === 'published' ? (req.body.publishedAt || new Date().toISOString()) : undefined,
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
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

// POST /api/publish/schedule/:id/crosspost - Cross-post an existing post to additional platforms
router.post('/schedule/:id/crosspost', async (req, res) => {
  try {
    const existing = await db.getScheduledPost(req.params.id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Source post not found' });
    }

    const { targetPlatforms: sentTargets = [], staggerMinutes = 0, customCaptions: sentCustom = {} } = req.body;
    const customCaptions = sentCustom && typeof sentCustom === 'object' ? sentCustom : {};
    const targetPlatforms = (Array.isArray(sentTargets) ? sentTargets : []).map(asId).filter(Boolean);
    if (targetPlatforms.length === 0) {
      return res.status(400).json({ error: 'No target platforms specified for cross-posting' });
    }

    const crossPostGroupId = existing.cross_post_group_id || `cross_${crypto.randomUUID().slice(0, 10)}`;
    
    // Update existing post with crossPostGroupId if it doesn't have one
    if (!existing.cross_post_group_id) {
      await db.updateScheduledPost(existing.id, { cross_post_group_id: crossPostGroupId }, req.userId);
    }

    const baseTime = new Date(existing.scheduled_at).getTime();
    const staggerMs = Math.max(0, Number(staggerMinutes) || 0) * 60 * 1000;
    const createdPosts = [];
    const userId = req.userId;

    for (let i = 0; i < targetPlatforms.length; i++) {
      const plat = targetPlatforms[i];
      if (plat === existing.platform) continue; // Skip source platform

      const platCaption = Object.prototype.hasOwnProperty.call(customCaptions, plat)
        ? customCaptions[plat]
        : existing.caption_text;
      const platTime = new Date(baseTime + ((i + 1) * staggerMs)).toISOString();

      const newPost = await db.createScheduledPost({
        user_id: userId,
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
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

// PATCH /api/publish/schedule/:id - Update post fields (e.g., date, time, caption, title)
router.patch('/schedule/:id', async (req, res) => {
  try {
    const { videoTitle, platform, captionText, hashtags, scheduledAt, status, postUrl } = req.body;
    const updates: any = {};
    if (videoTitle !== undefined) updates.video_title = videoTitle;
    if (platform !== undefined) updates.platform = platform;
    if (captionText !== undefined) updates.caption_text = captionText;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (scheduledAt !== undefined) updates.scheduled_at = scheduledAt;
    if (status !== undefined) updates.status = status;
    if (typeof postUrl === 'string') {
      const link = postUrl.trim().slice(0, 2048);
      if (link && !LIVE_URL.test(link)) {
        return res.status(400).json({ error: 'That does not look like a link yet.' });
      }
      updates.post_url = link;
    }

    const updated = await db.updateScheduledPost(req.params.id, updates, req.userId);
    if (!updated) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }
    res.json({ success: true, data: updated, message: 'Post updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
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

    const updated = await db.updateScheduledPost(req.params.id, updates, req.userId);
    if (!updated) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }
    res.json({ success: true, data: updated, message: 'Post updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

// POST /api/publish/schedule/:id/publish-now - Record that the creator posted this themselves.
// No channel API is wired up, so KontentOS cannot mint a link: the creator pastes the one the
// platform gave them and it is stored verbatim. Analytics' "View live post" then points at a real
// page instead of nothing at all. A bare https URL is all that is required — refusing a link because
// its host is not on a hard-coded list would block a re-hosted or branded short URL.
router.post('/schedule/:id/publish-now', async (req, res) => {
  try {
    const body = req.body || {};
    const postUrl = typeof body.postUrl === 'string' ? body.postUrl.trim().slice(0, 2048) : '';
    if (postUrl && !LIVE_URL.test(postUrl)) {
      return res.status(400).json({
        error: 'That does not look like a link yet. Paste the address bar of the post you just published.',
      });
    }

    const when =
      typeof body.publishedAt === 'string' && !Number.isNaN(Date.parse(body.publishedAt))
        ? new Date(body.publishedAt).toISOString()
        : new Date().toISOString();

    const updated = await db.updateScheduledPost(
      req.params.id,
      {
        status: 'published',
        published_at: when,
        ...(postUrl ? { post_url: postUrl } : {}),
      },
      req.userId
    );

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
    }, req.userId);

    res.json({ success: true, data: updated, message: 'Marked as published in KontentOS.' });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

// DELETE /api/publish/schedule/:id - Delete / cancel scheduled post
router.delete('/schedule/:id', async (req, res) => {
  try {
    const deleted = await db.deleteScheduledPost(req.params.id, req.userId);
    res.json({ success: deleted, message: deleted ? 'Scheduled post cancelled' : 'Not found' });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Could not complete that. Please try again.') });
  }
});

export default router;
