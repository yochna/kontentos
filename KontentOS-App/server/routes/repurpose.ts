import express from 'express';
import rateLimit from 'express-rate-limit';
import { PLATFORMS } from '../../src/lib/platforms.js';
import * as db from '../db.js';
import * as store from '../repurposeStore.js';
import { buildRepurposeJob, type TranscriptSegment } from '../repurposeEngine.js';

const router = express.Router();

/** The ids the Studio may retarget a short to, mapped to the spelling we store. */
const PLATFORM_IDS = new Map(PLATFORMS.map((p) => [p.id, p.id]));

/**
 * Only starting a job costs engine calls, so only that route carries the tight cap. Reads and
 * edits sit under the general /api limiter — a creator browsing the Shelf should not spend the
 * budget that cuts the shorts.
 */
const startJobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Cutting shorts uses the engine. Wait a few minutes before starting another job.' },
});

/**
 * Below this many words there is no argument to cut, only a sentence — the engine would return
 * one clip dressed up as several, so the request is refused with the reason instead.
 */
const MIN_TRANSCRIPT_CHARS = 400;
const MAX_TITLE_CHARS = 200;

const text = (value: unknown, limit: number): string =>
  String(value ?? '')
    .trim()
    .slice(0, limit);

router.post('/jobs', startJobLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const transcript = text(body.transcript, 400_000);
    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      return res.status(422).json({
        error: `That transcript is too short to cut into separate shorts (${transcript.length} characters — need ${MIN_TRANSCRIPT_CHARS}). Record or paste a full take and try again.`,
      });
    }
    const videoId = text(body.videoId, 100);
    const sourceKind = body.sourceKind === 'video' || videoId ? 'video' : 'paste';

    // Timecodes come from the stored transcript, not from the browser: a client cannot forge a
    // clip boundary for a video the server has cues for.
    let segments: TranscriptSegment[] = [];
    if (videoId) {
      const subtitles = await db.getSubtitles(videoId, req.userId);
      if (subtitles?.segments?.length) segments = subtitles.segments;
    }

    const result = await buildRepurposeJob({
      transcript,
      segments,
      clipCount: Number(body.clipCount) || 5,
      tone: text(body.tone, 120) || 'direct',
      brandVoice: text(body.context, 4000),
      temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
      model: typeof body.model === 'string' ? body.model : undefined,
      platform: text(body.platform, 40),
    });

    if (!result.clips.length) {
      return res.status(422).json({
        error: segments.length
          ? 'The stored cues are too sparse to find complete thoughts in. Re-transcribe the video on the bench, or paste the transcript here instead.'
          : 'Nothing in that transcript reads as a standalone moment. Paste a longer take.',
      });
    }

    const job = await store.createJob({
      userId: req.userId,
      title: text(body.title, MAX_TITLE_CHARS) || 'Untitled recording',
      sourceKind,
      videoId,
      transcript,
      engineModel: result.engineModel,
      engineSource: result.engineSource,
      clips: result.clips,
    });
    res.json({ success: true, data: job });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to start the repurpose job.' });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    res.json({ success: true, data: await store.listJobs(req.userId) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to list repurpose jobs.' });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await store.getJob(req.userId, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ success: true, data: job });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to read the job.' });
  }
});

router.patch('/jobs/:jobId/clips/:clipId', async (req, res) => {
  try {
    const body = req.body || {};
    // Only fields that actually arrived are written — an absent key must leave the stored text alone.
    const changes: store.ClipChanges = {};
    if (typeof body.title === 'string') changes.title = text(body.title, MAX_TITLE_CHARS);
    if (typeof body.hook === 'string') changes.hook = text(body.hook, 500);
    if (typeof body.caption === 'string') changes.caption = text(body.caption, 4000);
    if (typeof body.cardHeadline === 'string') changes.cardHeadline = text(body.cardHeadline, 300);
    if (['draft', 'saved', 'shipped'].includes(body.status)) changes.status = body.status;
    // Retargeting a short changes which composer it is measured against, so an unknown id has to be
    // refused rather than stored — the Studio would then render a meter with no limits behind it.
    if (body.platform !== undefined) {
      const platform = PLATFORM_IDS.get(String(body.platform));
      if (!platform) return res.status(400).json({ error: `“${String(body.platform)}” is not a platform KontentOS knows.` });
      changes.platform = platform;
    }

    const clip = await store.updateClip(req.userId, req.params.jobId, req.params.clipId, changes);
    if (!clip) return res.status(404).json({ error: 'Clip not found in this job.' });
    res.json({ success: true, data: clip });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save the clip.' });
  }
});

router.delete('/jobs/:id', async (req, res) => {
  try {
    const removed = await store.deleteJob(req.userId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Job not found.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete the job.' });
  }
});

export default router;
