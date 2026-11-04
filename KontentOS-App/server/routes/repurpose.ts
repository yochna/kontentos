import express from 'express';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { PLATFORMS } from '../../src/lib/platforms.js';
import * as db from '../db.js';
import * as store from '../repurposeStore.js';
import { buildRepurposeJob, type TranscriptSegment } from '../repurposeEngine.js';
import { safeMessage } from '../errorText.js';
import {
  MAX_CONCURRENT_CUTS,
  beginCut,
  clipPathOnDisk,
  countFor,
  hasCutEngine,
  inFlight,
  newClipId,
  planSpan,
  reconcile,
} from '../mediaCut.js';

const router = express.Router();

/** The ids the Studio may retarget a short to, mapped to the spelling we store. */
/** Client-supplied platform ids arrive as strings; only ones the shared table knows are stored. */
const PLATFORM_IDS = new Map<string, (typeof PLATFORMS)[number]['id']>(
  PLATFORMS.map((p) => [p.id, p.id])
);

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
    res.status(500).json({ error: safeMessage(err, 'Failed to start the repurpose job.') });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    res.json({ success: true, data: await store.listJobs(req.userId) });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to list repurpose jobs.') });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await store.getJob(req.userId, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ success: true, data: job });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to read the job.') });
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
    res.status(500).json({ error: safeMessage(err, 'Failed to save the clip.') });
  }
});

router.delete('/jobs/:id', async (req, res) => {
  try {
    const removed = await store.deleteJob(req.userId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Job not found.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to delete the job.') });
  }
});

/**
 * An encode is CPU work, not an engine call, so it gets its own cap: on the free plan's tenth of a
 * core, a creator who queues four shorts at once slows everybody else's encodes down with them.
 */
const cutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'The server has cut enough shorts for now. Wait a few minutes and try again.' },
});

async function filePresent(filePath: string | null): Promise<boolean> {
  if (!filePath) return false;
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/** The row is the job, so the encode has to write its own ending. */
async function settleCutRow(videoId: string, userId: string, outcome: { ok: true; bytes: number } | { ok: false }): Promise<void> {
  try {
    await db.updateVideoStatus(
      videoId,
      outcome.ok ? 'ready' : 'failed',
      { file_size: outcome.ok ? outcome.bytes : 0 },
      userId
    );
  } catch {
    // The row stays `processing`, and the read below reports it as the failure it is.
  }
}

router.post('/jobs/:jobId/clips/:clipId/cut', cutLimiter, async (req, res) => {
  try {
    const job = await store.getJob(req.userId, req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const clip = job.clips.find((c) => c.id === req.params.clipId);
    if (!clip) return res.status(404).json({ error: 'Clip not found in this job.' });

    if (job.sourceKind !== 'video' || !job.videoId) {
      return res
        .status(422)
        .json({ error: 'This job came from pasted words, so there is no recording on the server to cut.' });
    }
    const source = await db.getVideo(job.videoId, req.userId);
    if (!source) {
      return res.status(404).json({ error: 'The recording this job was written from is not in your vault.' });
    }
    const srcPath = clipPathOnDisk(source.file_url);
    if (!srcPath) {
      return res
        .status(422)
        .json({ error: 'That recording is not a file this server reads from, so nothing can be cut from it here.' });
    }
    if (!(await filePresent(srcPath))) {
      return res.status(422).json({
        error: 'The recording is on your list but its file is not on this server, so it cannot be cut here. Cut it in your browser instead, or re-upload the take.',
      });
    }

    const planned = planSpan(clip.start, clip.end, Number(source.duration));
    if (!planned.ok) return res.status(422).json({ error: planned.reason });

    if (countFor(req.userId) >= MAX_CONCURRENT_CUTS) {
      return res
        .status(429)
        .json({ error: `You already have ${MAX_CONCURRENT_CUTS} cuts running. Let one finish before asking for another.` });
    }

    // Last check before the row exists: an image built without ffmpeg cannot cut anything, and a
    // clip row written here could only ever settle as a failure in the creator's vault.
    if (!hasCutEngine()) {
      return res
        .status(503)
        .json({ error: 'This server has no cut engine installed, so it cannot cut a span. Cut it in your browser instead.' });
    }

    const videoId = newClipId();
    const fileUrl = `/uploads/${videoId}.mp4`;
    const outPath = clipPathOnDisk(fileUrl);
    if (!outPath) return res.status(500).json({ error: 'The cut could not be started.' });

    const row = await db.createVideo({
      id: videoId,
      user_id: req.userId,
      title: `${clip.title || 'Untitled short'} (server cut)`.slice(0, 200),
      file_url: fileUrl,
      duration: Math.round(planned.span.duration * 100) / 100,
      file_size: 0,
      aspect_ratio: source.aspect_ratio || '9:16',
      status: 'processing',
    });

    beginCut({
      videoId,
      userId: req.userId,
      span: planned.span,
      srcPath,
      outPath,
      settle: (outcome) => void settleCutRow(videoId, req.userId, outcome),
    });

    res.status(202).json({
      success: true,
      data: { video: row, span: planned.span, shortOfSpan: planned.span.shortOfSpan },
    });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to start the server cut.') });
  }
});

router.get('/cuts/:videoId', async (req, res) => {
  try {
    const video = await db.getVideo(req.params.videoId, req.userId);
    if (!video) return res.status(404).json({ error: 'Clip not found.' });

    const mediaAvailable = await filePresent(clipPathOnDisk(video.file_url));
    const live = inFlight(video.id);

    if (video.status === 'processing' && !live) {
      // Only this endpoint writes `processing`, so a row left there with no process behind it is
      // what a restart leaves: an encode nobody is running any more.
      const verdict = reconcile(video.status, mediaAvailable);
      await db.updateVideoStatus(video.id, 'failed', { file_size: 0 }, req.userId);
      return res.json({ success: true, data: { status: 'failed', reason: verdict.reason, video: { ...video, status: 'failed' } } });
    }

    if (live) {
      return res.json({ success: true, data: { status: 'encoding', fraction: live.fraction, video } });
    }

    const verdict = reconcile(video.status, mediaAvailable);
    return res.json({
      success: true,
      data: {
        status: verdict.state,
        reason: verdict.reason,
        fraction: verdict.state === 'ready' ? 1 : 0,
        video: verdict.state === 'ready' && video.status !== 'ready' ? { ...video, status: 'ready' } : video,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to read the cut.') });
  }
});

export default router;
