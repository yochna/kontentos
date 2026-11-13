import express from 'express';
import rateLimit from 'express-rate-limit';
import * as db from '../db.js';
import * as store from '../pressStore.js';
import { buildRepurposeJob, findMoments, scoreMoment, type Moment, type TranscriptSegment } from '../repurposeEngine.js';
import { generateDeck } from './staticCardAi.js';
import { deckFromTranscript } from '../transcriptDeck.js';
import { safeMessage } from '../errorText.js';
import { spanCaptions, spanCues, spanVtt, srtTimestamp, type CaptionCue } from '../../src/lib/captionFiles.js';
import {
  PRESS_STYLES,
  pressSteps,
  pressStyle,
  pressTimecode,
  type PressStep,
  type PressStepId,
  type PressStepState,
  type PressStyle,
} from '../../src/lib/press.js';

const router = express.Router();

const startPressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'That is a lot of presses. Give the engine a few minutes before starting another.' },
});

const text = (value: unknown, limit: number): string =>
  String(value ?? '')
    .trim()
    .slice(0, limit);

const round = (seconds: number): number => Math.round(seconds * 100) / 100;

function setStep(steps: PressStep[], id: PressStepId, state: PressStepState, detail: string): PressStep[] {
  return steps.map((step) => (step.id === id ? { ...step, state, detail } : step));
}

router.get('/', async (req, res) => {
  try {
    res.json({ success: true, data: await store.listJobs(req.userId) });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to list presses.') });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await store.getJob(req.userId, req.params.id);
    if (!job) return res.status(404).json({ error: 'Press not found.' });
    res.json({ success: true, data: job });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to read the press.') });
  }
});

router.post('/', startPressLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const style = pressStyle(body.style);
    if (!style) {
      return res.status(422).json({
        error: `Unknown press style “${text(body.style, 40)}”. The bench offers ${PRESS_STYLES.map((s) => s.id).join(', ')}.`,
      });
    }

    const videoId = text(body.videoId, 100);
    const source = await db.getVideo(videoId, req.userId);
    if (!source) return res.status(404).json({ error: 'That cut is not in your vault.' });
    if (source.status === 'processing' || source.status === 'uploading') {
      return res.status(409).json({ error: `“${source.title}” is still arriving. Wait for it to finish, then press.` });
    }
    if (source.media_available === false || !String(source.file_url || '').startsWith('/uploads/')) {
      return res.status(410).json({
        error: `“${source.title}” has no file on this server to cut from. Re-upload it from the Intake station before pressing.`,
      });
    }

    const subtitles = await db.getSubtitles(videoId, req.userId);
    const cues = (subtitles?.segments || []) as CaptionCue[];
    if (cues.length < 2) {
      return res.status(422).json({
        error: `“${source.title}” has no caption cues, so there is no moment in it to find. Transcribe it on the Intake station, or paste its script, and press again.`,
      });
    }

    const transcript =
      text(subtitles?.transcript_text, 400_000) ||
      cues.map((cue) => String(cue.text || '').trim()).filter(Boolean).join(' ');

    const sourceSeconds = Number(source.duration) || 0;
    const { moments, timecodesExact } = findMoments(cues as TranscriptSegment[], transcript, 1, {
      minSeconds: style.minSeconds,
      maxSeconds: style.maxSeconds,
    });
    const moment = moments[0];
    if (!moment || !timecodesExact || !(moment.end > moment.start)) {
      return res.status(422).json({
        error: 'Nothing in those cues reads as one complete thought at that length. A longer take, or a script with sentences in it, gives the press something to find.',
      });
    }

    // The span is fitted to the film that exists, not to the cues: a transcript does not know how
    // long the upload turned out to be.
    const start = round(moment.start);
    const shortened = sourceSeconds > 0 && moment.end > sourceSeconds;
    const end = round(shortened ? sourceSeconds : moment.end);
    if (sourceSeconds > 0 && start >= sourceSeconds) {
      return res.status(422).json({
        error: `The moment the press found starts at ${pressTimecode(start)}, but “${source.title}” only runs for ${pressTimecode(
          sourceSeconds
        )} — those cues do not match this file. Re-transcribe it before pressing.`,
      });
    }
    const duration = round(end - start);
    if (duration < 1) {
      return res.status(422).json({ error: 'The moment the press found is under a second of film. Pick a longer take.' });
    }

    const job = await store.createJob({
      userId: req.userId,
      styleId: style.id,
      sourceVideoId: videoId,
      sourceTitle: source.title,
      plan: {
        span: { start, end },
        duration,
        targetAspect: '9:16',
        source: {
          videoId,
          fileUrl: source.file_url,
          fileSize: Number(source.file_size) || 0,
          duration: sourceSeconds,
          aspectRatio: source.aspect_ratio,
        },
        shortened,
      },
      steps: setStep(pressSteps(), 'reel', 'waiting', `Waiting for this tab to encode ${pressTimecode(duration)}`),
    });

    const writing = {
      tone: text(body.tone, 120) || style.tone,
      brandVoice: text(body.context, 4000),
      model: typeof body.model === 'string' ? body.model : undefined,
    };
    // The writing runs on its own clock; the response does not wait for an engine that may be saturated.
    void writePress(job.id, req.userId, style, cues, { start, end }, writing).catch((err) => {
      console.error('[press] the writing stopped mid-sentence:', err);
    });

    res.json({ success: true, data: job });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to start the press.') });
  }
});

async function writePress(
  jobId: string,
  userId: string,
  style: PressStyle,
  cues: CaptionCue[],
  span: { start: number; end: number },
  writing: { tone: string; brandVoice: string; model?: string }
): Promise<void> {
  // Spoken inside the span, in span time — the same numbers the caption files are written from, so
  // the words on the cards and the words in the reel cannot disagree about what was said.
  const spoken = spanCues(cues, span.start, span.end);
  const excerpt = spoken.map((cue) => cue.text).join(' ');

  const captioned = await store.patchJob(userId, jobId, {
    steps: [
      {
        id: 'captions',
        state: spoken.length ? 'done' : 'failed',
        detail: spoken.length
          ? `${spoken.length} cues · ${pressTimecode(0)}–${pressTimecode(span.end - span.start)}`
          : 'That span holds no speech, so there is nothing to caption.',
      },
    ],
    bundle: {
      srt: spanCaptions(cues, span.start, span.end),
      vtt: spanVtt(cues, span.start, span.end),
    },
  });
  if (!captioned) return;

  await store.patchJob(userId, jobId, {
    steps: [{ id: 'copy', state: 'running', detail: 'Writing the hook and the post…' }],
  });

  const moment: Moment = { index: 0, start: span.start, end: span.end, excerpt, score: scoreMoment(excerpt) };
  const copy = await buildRepurposeJob({
    // The span's own cues, not the take's: the copy describes the reel being pressed, and the
    // moment handed to it is the one the browser is about to cut.
    transcript: excerpt,
    segments: spoken,
    clipCount: 1,
    tone: writing.tone,
    brandVoice: writing.brandVoice,
    temperature: 0.7,
    model: writing.model,
    moments: [moment],
  });
  const clip = copy.clips[0];
  await store.patchJob(userId, jobId, {
    steps: [
      {
        id: 'copy',
        state: clip?.title ? 'done' : 'failed',
        detail: clip?.title
          ? copy.engineSource === 'engine'
            ? `Written by ${copy.engineModel}`
            : 'Written from the transcript — no engine answered'
          : 'Nothing came back for this span.',
      },
    ],
    bundle: {
      engineModel: copy.engineModel,
      engineSource: copy.engineSource,
      title: clip?.title || '',
      hook: clip?.hook || '',
      caption: clip?.caption || '',
    },
  });

  await store.patchJob(userId, jobId, {
    steps: [{ id: 'deck', state: 'running', detail: `Writing ${style.slides} cards…` }],
  });

  const engineDeck = await generateDeck({
    prompt: excerpt.slice(0, 6000),
    slideCount: style.slides,
    tone: writing.tone,
    context: writing.brandVoice,
    model: writing.model,
  });
  // No engine answered: cut the cards from the creator's own sentences rather than ship a bundle
  // with no carousel. The step says plainly which of the two it got, and the cards stay editable.
  const deck = engineDeck ?? deckFromTranscript(excerpt, style.slides);
  const fromTranscript = !engineDeck && !!deck;
  await store.patchJob(userId, jobId, {
    steps: [
      {
        id: 'deck',
        state: deck ? 'done' : 'failed',
        detail: deck
          ? fromTranscript
            ? `${deck.slides.length} cards · built from the transcript, no engine answered`
            : `${deck.slides.length} cards · ${deck.modelUsed}`
          : 'No copy engine answered, and this span holds too little speech to build cards from.',
      },
    ],
    bundle: {
      deck: deck ? { slides: deck.slides, socialCaption: deck.socialCaption, modelUsed: deck.modelUsed } : null,
    },
  });
}

const MAX_HEADLINE = 220;
const MAX_SUPPORT = 600;

// The creator fixing a card: a misheard name, a clumsy line. Same cards, same count — only the words move.
router.put('/:id/deck', async (req, res) => {
  try {
    const job = await store.getJob(req.userId, req.params.id);
    if (!job) return res.status(404).json({ error: 'Press not found.' });
    const deck = job.bundle?.deck;
    if (!deck) return res.status(409).json({ error: 'This press has no carousel to edit.' });

    const incoming = req.body?.slides;
    if (!Array.isArray(incoming) || incoming.length !== deck.slides.length) {
      return res.status(400).json({ error: `Send all ${deck.slides.length} cards, in order.` });
    }

    const slides = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const headline = String(incoming[i]?.headline ?? '').trim();
      const supportingText = String(incoming[i]?.supportingText ?? '').trim();
      if (!headline) return res.status(400).json({ error: `Card ${i + 1} needs a headline.` });
      if (headline.length > MAX_HEADLINE || supportingText.length > MAX_SUPPORT) {
        return res.status(400).json({
          error: `Card ${i + 1} is too long: keep the headline under ${MAX_HEADLINE} characters and the text under ${MAX_SUPPORT}.`,
        });
      }
      slides.push({ id: i + 1, headline, supportingText });
    }

    const updated = await store.patchJob(req.userId, job.id, {
      bundle: { deck: { ...deck, slides, edited: true } },
    });
    if (!updated) return res.status(404).json({ error: 'Press not found.' });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to save the carousel.') });
  }
});

// Read encoded metadata from the vault, not the browser's settlement payload.
router.post('/:id/reel', async (req, res) => {
  try {
    const job = await store.getJob(req.userId, req.params.id);
    if (!job) return res.status(404).json({ error: 'Press not found.' });
    if (job.bundle?.clipVideoId) return res.status(409).json({ error: 'This press already has its reel.' });

    const failure = text(req.body?.error, 400);
    if (failure) {
      const updated = await store.patchJob(req.userId, job.id, {
        steps: [{ id: 'reel', state: 'failed', detail: failure }],
      });
      return res.json({ success: true, data: updated ?? job });
    }

    const clipVideoId = text(req.body?.clipVideoId, 100);
    const clip = await db.getVideo(clipVideoId, req.userId);
    if (!clip) {
      const error = 'The encoded file never landed in your vault.';
      const updated = await store.patchJob(req.userId, job.id, {
        steps: [{ id: 'reel', state: 'failed', detail: error }],
      });
      return res.status(404).json({ error, data: updated ?? job });
    }
    // Reject the source before saving a rebased track: its original captions must stay intact.
    if (clip.id === job.sourceVideoId) {
      return res.status(422).json({ error: 'Upload the encoded reel, not the source video.' });
    }
    if (clip.status !== 'ready') {
      return res.status(409).json({ error: 'The encoded reel is not ready. Wait for its upload to finish.' });
    }
    if (clip.media_available === false || !String(clip.file_url || '').startsWith('/uploads/')) {
      return res.status(410).json({ error: 'The encoded reel has no file on this server. Upload it again.' });
    }

    // Rebuild from source cues because the writing task may not have filed the bundle yet.
    const subtitles = await db.getSubtitles(job.sourceVideoId, req.userId);
    const cues = (subtitles?.segments || []) as CaptionCue[];
    const span = job.plan.span;
    const rebased = spanCues(cues, span.start, span.end);
    const srt = spanCaptions(cues, span.start, span.end);
    const vtt = spanVtt(cues, span.start, span.end);

    const filed = await db.saveSubtitles(
      {
        video_id: clip.id,
        srt_content: srt,
        vtt_content: vtt,
        transcript_text: rebased.map((cue) => cue.text).join(' '),
        language: subtitles?.language || 'English',
        segments: rebased.map((cue, i) => ({
          id: i + 1,
          // Stored as an SRT clock, the way the transcribe routes write cues: the reel's own caption
          // track then reads like every other one in the vault.
          start: srtTimestamp(cue.start),
          end: srtTimestamp(cue.end),
          text: cue.text,
        })),
      },
      req.userId
    );

    const titled = await db.updateVideoStatus(
      clip.id,
      undefined,
      {
        title: job.bundle?.title || `${job.sourceTitle} · ${pressStyle(job.styleId)?.label || 'press'}`,
        aspect_ratio: job.plan.targetAspect,
      },
      req.userId
    );

    const seconds = Number(titled?.duration) || job.plan.duration;
    const bytes = Number(titled?.file_size) || 0;

    const steps: NonNullable<store.PressProgress['steps']> = [
      {
        id: 'reel',
        state: 'done',
        detail: [
          pressTimecode(seconds),
          bytes ? `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB` : '',
          job.plan.targetAspect,
        ]
          .filter(Boolean)
          .join(' · '),
      },
    ];
    if (!filed && rebased.length) {
      steps.push({
        id: 'captions',
        state: 'failed',
        detail: 'The reel is in your vault, but its caption track could not be filed against it.',
      });
    }

    const updated = await store.patchJob(req.userId, job.id, {
      steps,
      bundle: {
        clipVideoId: clip.id,
        fileUrl: titled?.file_url || clip.file_url,
        duration: round(seconds),
        bytes,
        aspectRatio: job.plan.targetAspect,
        srt,
        vtt,
      },
    });
    res.json({ success: true, data: updated ?? job });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to file the press reel.') });
  }
});

export default router;
