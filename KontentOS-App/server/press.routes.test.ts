import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import * as db from './db.js';
import { srtTimestamp } from '../src/lib/captionFiles.js';
import pressRouter from './routes/press.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'press-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

// The real router, the real auth gate and the real JSON store — but never the whole server.ts.
let server: Server;
let base = '';

const PASSWORD = 'a-creator-sized-passphrase';
const SENTENCES = [
  'Why does most content flop? Stop publishing first drafts.',
  'Here is the mistake I made for two years and called it growth.',
  'I shipped forty posts and got three replies back.',
  'Actually the problem was the hook, never the idea.',
  'So we rewrote only the first line for a month.',
  'The reach doubled without changing anything else.',
  'Never judge a piece by how it felt to write it.',
  'The number that matters is how many people stayed.',
  'That is the whole lesson: the idea is not the bottleneck.',
  'The first seven seconds are the bottleneck.',
  'Fix the opening and the rest of the film gets to breathe.',
  'Publishing a draft is a decision, not a milestone.',
];
const TRANSCRIPT = SENTENCES.join(' ');

/** Twelve five-second cues on a real SRT clock: 12 cues × 5s = 60s of speech. */
function timedCues(count = 12, fromSeconds = 0) {
  return Array.from({ length: count }, (_, i) => {
    const start = fromSeconds + i * 5;
    return {
      id: i + 1,
      start: srtTimestamp(start),
      end: srtTimestamp(start + 5),
      text: SENTENCES[i % SENTENCES.length],
    };
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/press', pressRouter);
  return app;
}

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  // An unreachable engine is the honest default here: the press has to say so instead of inventing a deck.
  process.env.GEMINI_API_KEY = '';

  server = buildApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

function cookieFrom(res: Response): string | null {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw ? raw.split(';')[0] : null;
}

async function signup(email: string) {
  const res = await call('POST', '/api/auth/signup', {
    email,
    full_name: 'Test Creator',
    password: PASSWORD,
  });
  const body = await json(res);
  return { cookie: cookieFrom(res), userId: body.data?.id as string };
}

function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown, cookie?: string | null) {
  return fetch(base + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<any> {
  return (await res.json()) as any;
}

/** The `{ success, data }` envelope every route answers with. */
async function dataOf(res: Response): Promise<any> {
  return (await json(res)).data;
}

/** The press is created while the copy and the deck are still being written; this waits for them. */
async function readUntilWritten(cookie: string | null, id: string): Promise<any> {
  for (let attempt = 0; attempt < 150; attempt++) {
    const job = await dataOf(await call('GET', `/api/press/${id}`, undefined, cookie));
    const pending = job.steps.filter(
      (step: any) => step.id !== 'reel' && (step.state === 'waiting' || step.state === 'running')
    );
    if (!pending.length) return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the press never finished writing');
}

async function seedClip(
  userId: string,
  over: {
    title?: string;
    duration?: number;
    file_url?: string;
    status?: 'ready' | 'uploading' | 'processing' | 'failed';
    media_available?: boolean;
  } = {},
  cues: ReturnType<typeof timedCues> | null = timedCues()
) {
  const video = await db.createVideo({
    user_id: userId,
    title: 'Studio take',
    file_url: '/uploads/take_test.mp4',
    file_size: 12 * 1024 * 1024,
    duration: 60,
    aspect_ratio: '16:9',
    status: 'ready',
    ...over,
  });
  if (cues) {
    await db.saveSubtitles(
      {
        video_id: video.id,
        srt_content: '',
        vtt_content: '',
        transcript_text: TRANSCRIPT,
        language: 'English',
        segments: cues,
      },
      userId
    );
  }
  return video;
}

describe('press endpoints', () => {
  it('refuses an anonymous caller before a job exists', async () => {
    const res = await call('POST', '/api/press', { videoId: 'vid_whatever', style: 'hook' });
    expect(res.status).toBe(401);
  });

  it('refuses a style the table does not know and names the ones it does', async () => {
    const { cookie } = await signup('press-style@test.example');
    const res = await call('POST', '/api/press', { videoId: 'vid_missing', style: 'banger' }, cookie);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error).toContain('hook, explainer, story');
    expect(await dataOf(await call('GET', '/api/press', undefined, cookie))).toHaveLength(0);
  });

  it('refuses a clip that is not in the vault, still arriving, or has no bytes to cut', async () => {
    const { cookie, userId } = await signup('press-source@test.example');

    expect((await call('POST', '/api/press', { videoId: 'vid_gone', style: 'hook' }, cookie)).status).toBe(404);

    const arriving = await seedClip(userId, { title: 'Still uploading', status: 'uploading' });
    const busy = await call('POST', '/api/press', { videoId: arriving.id, style: 'hook' }, cookie);
    expect(busy.status).toBe(409);
    expect((await json(busy)).error).toMatch(/still arriving/i);

    const noBytes = await seedClip(userId, { title: 'Gone from disk', file_url: '', media_available: false });
    const offline = await call('POST', '/api/press', { videoId: noBytes.id, style: 'hook' }, cookie);
    expect(offline.status).toBe(410);
    expect((await json(offline)).error).toMatch(/no file on this server/i);
  });

  it('refuses a take with no cues, because there is no moment in it to find', async () => {
    const { cookie, userId } = await signup('press-nocues@test.example');
    const video = await seedClip(userId, { title: 'Silent on the timeline' }, null);

    const res = await call('POST', '/api/press', { videoId: video.id, style: 'hook' }, cookie);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatch(/no caption cues/i);
  });

  it('refuses cues that do not belong to the film it has', async () => {
    const { cookie, userId } = await signup('press-drift@test.example');
    // Cues from 70s onward on a 40s recording: the press would cut a span that is not in the file.
    const video = await seedClip(userId, { title: 'Drifted transcript', duration: 40 }, timedCues(8, 70));

    const res = await call('POST', '/api/press', { videoId: video.id, style: 'hook' }, cookie);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatch(/do not match this file/i);
    expect(await dataOf(await call('GET', '/api/press', undefined, cookie))).toHaveLength(0);
  });

  it('answers a press with the plan the tab has to encode, and says the deck was built from the transcript', async () => {
    const { cookie, userId } = await signup('press-plan@test.example');
    const video = await seedClip(userId, { title: 'The hook take', duration: 60 });

    const res = await call('POST', '/api/press', { videoId: video.id, style: 'hook' }, cookie);
    expect(res.status).toBe(200);
    const job = await dataOf(res);

    expect(job.styleId).toBe('hook');
    expect(job.status).toBe('running');
    expect(job.sourceVideoId).toBe(video.id);
    expect(job.plan.targetAspect).toBe('9:16');
    // 5s cues × the hook bounds (18–34s): six cues, 0 → 30s, no shortening needed.
    expect(job.plan.span).toEqual({ start: 0, end: 30 });
    expect(job.plan.duration).toBe(30);
    expect(job.plan.shortened).toBe(false);
    expect(job.plan.source).toMatchObject({
      videoId: video.id,
      fileUrl: '/uploads/take_test.mp4',
      fileSize: 12 * 1024 * 1024,
      duration: 60,
      aspectRatio: '16:9',
    });
    // The reel is the one thing this process cannot do: it is the tab's job, and the job says so.
    expect(job.steps.find((step: any) => step.id === 'reel')).toMatchObject({
      state: 'waiting',
      detail: 'Waiting for this tab to encode 0:30',
    });

    const written = await readUntilWritten(cookie, job.id);
    expect(written.steps.find((step: any) => step.id === 'captions')).toMatchObject({
      state: 'done',
      detail: '6 cues · 0:00–0:30',
    });
    expect(written.steps.find((step: any) => step.id === 'copy').state).toBe('done');
    expect(written.steps.find((step: any) => step.id === 'copy').detail).toMatch(/no engine answered/i);
    // No engine answered, so the carousel is cut from the span's own sentences — and says so.
    expect(written.steps.find((step: any) => step.id === 'deck')).toMatchObject({
      state: 'done',
      detail: '4 cards · built from the transcript, no engine answered',
    });
    expect(written.bundle.engineSource).toBe('local');
    expect(written.bundle.deck.modelUsed).toBe('transcript');
    expect(written.bundle.deck.slides).toHaveLength(4);
    const spoken = written.bundle.deck.slides
      .map((slide: any) => `${slide.headline} ${slide.supportingText}`.trim())
      .join(' ')
      .replace(/[\[\]]/g, '');
    // Every word on a card was said in the span: the first six sentences, nothing else.
    expect(spoken.replace(/\s+/g, ' ')).toBe(SENTENCES.slice(0, 6).join(' '));
    expect(written.bundle.caption.length).toBeGreaterThan(0);
    // The files are the span's own clock, not the middle of the take.
    expect(written.bundle.srt).toContain('00:00:00,000 --> 00:00:05,000');
    expect(written.bundle.vtt).toContain('00:00:00.000 --> 00:00:05.000');
    expect(written.bundle.srt).not.toContain('00:00:35,000');
  });

  it('lets the creator edit the carousel text, and nothing else about it', async () => {
    const { cookie, userId } = await signup('press-edit@test.example');
    const video = await seedClip(userId, { title: 'The edit take', duration: 60 });
    const job = await dataOf(await call('POST', '/api/press', { videoId: video.id, style: 'hook' }, cookie));
    const written = await readUntilWritten(cookie, job.id);
    const slides = written.bundle.deck.slides.map((slide: any) => ({
      headline: slide.headline,
      supportingText: slide.supportingText,
    }));

    slides[0] = { headline: 'Why most [content] flops on Swapiki', supportingText: '  Fixed the product name.  ' };
    const saved = await call('PUT', `/api/press/${job.id}/deck`, { slides }, cookie);
    expect(saved.status).toBe(200);
    const edited = await dataOf(saved);
    expect(edited.bundle.deck.slides[0]).toEqual({
      id: 1,
      headline: 'Why most [content] flops on Swapiki',
      supportingText: 'Fixed the product name.',
    });
    expect(edited.bundle.deck.edited).toBe(true);
    expect(edited.bundle.deck.modelUsed).toBe('transcript');
    // The captions and copy the edit did not touch are still there.
    expect(edited.bundle.srt).toBe(written.bundle.srt);
    expect(edited.bundle.hook).toBe(written.bundle.hook);

    const reread = await dataOf(await call('GET', `/api/press/${job.id}`, undefined, cookie));
    expect(reread.bundle.deck.slides[0].headline).toBe('Why most [content] flops on Swapiki');

    const tooFew = await call('PUT', `/api/press/${job.id}/deck`, { slides: slides.slice(1) }, cookie);
    expect(tooFew.status).toBe(400);
    const blank = await call('PUT', `/api/press/${job.id}/deck`, { slides: slides.map((s: any, i: number) => (i === 2 ? { ...s, headline: '   ' } : s)) }, cookie);
    expect(blank.status).toBe(400);
    expect((await json(blank)).error).toMatch(/Card 3 needs a headline/);
    const huge = await call('PUT', `/api/press/${job.id}/deck`, { slides: slides.map((s: any, i: number) => (i === 1 ? { ...s, supportingText: 'x'.repeat(601) } : s)) }, cookie);
    expect(huge.status).toBe(400);
  });

  it('shortens the span to the film that exists instead of promising frames that are not there', async () => {
    const { cookie, userId } = await signup('press-short@test.example');
    const video = await seedClip(userId, { title: 'Only 22 seconds of it', duration: 22 });

    const job = await dataOf(await call('POST', '/api/press', { videoId: video.id, style: 'hook' }, cookie));
    expect(job.plan.shortened).toBe(true);
    expect(job.plan.span).toEqual({ start: 0, end: 22 });
    expect(job.plan.duration).toBe(22);
  });

  it('marks the press failed when the reel never lands, and says what the tab reported', async () => {
    const { cookie, userId } = await signup('press-badclip@test.example');
    const video = await seedClip(userId, { title: 'Reel that missed' });
    const job = await dataOf(await call('POST', '/api/press', { videoId: video.id, style: 'hook' }, cookie));

    const missing = await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: 'vid_never_uploaded' }, cookie);
    expect(missing.status).toBe(404);
    const lost = await dataOf(missing);
    expect(lost.steps.find((step: any) => step.id === 'reel')).toMatchObject({
      state: 'failed',
      detail: 'The encoded file never landed in your vault.',
    });
    expect(lost.status).toBe('failed');
    expect(lost.error).toBe('The encoded file never landed in your vault.');

    const triedAgain = await dataOf(
      await call('POST', `/api/press/${lost.id}/reel`, { error: 'The browser blocked the encoder.' }, cookie)
    );
    expect(triedAgain.steps.find((step: any) => step.id === 'reel').detail).toBe(
      'The browser blocked the encoder.'
    );
  });

  it('files the reel the tab encoded, reading the truth off the vault and keeping the writing intact', async () => {
    const { cookie, userId } = await signup('press-reel@test.example');
    const source = await seedClip(userId, { title: 'Full take', duration: 60 });
    const sourceCaptions = await db.getSubtitles(source.id, userId);
    const clip = await db.createVideo({
      user_id: userId,
      title: 'kontentos_press.mp4',
      file_url: '/uploads/pressed_reel.mp4',
      file_size: 5 * 1024 * 1024,
      duration: 12,
      aspect_ratio: '9:16',
      status: 'ready',
    });

    const job = await dataOf(await call('POST', '/api/press', { videoId: source.id, style: 'hook' }, cookie));
    // Settled before the writing has answered: whichever of the two writers goes second, neither may
    // erase the other's fields.
    const settled = await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: clip.id }, cookie);
    expect(settled.status).toBe(200);

    const final = await readUntilWritten(cookie, job.id);
    expect(final.status).toBe('complete');
    expect(final.error).toBe('');
    expect(final.steps.find((step: any) => step.id === 'reel')).toMatchObject({ state: 'done' });
    expect(final.steps.find((step: any) => step.id === 'deck').state).toBe('done');
    expect(final.steps.find((step: any) => step.id === 'captions').state).toBe('done');

    // The reel step reports the vault's numbers, not the plan's: a 12s file is 12s.
    expect(final.bundle.duration).toBe(12);
    expect(final.bundle.bytes).toBe(5 * 1024 * 1024);
    expect(final.bundle.fileUrl).toBe('/uploads/pressed_reel.mp4');
    expect(final.bundle.clipVideoId).toBe(clip.id);
    expect(final.steps.find((step: any) => step.id === 'reel').detail).toBe('0:12 · 5 MB · 9:16');

    // The cut travels with its own caption track, re-timed to its own zero.
    const filed = await db.getSubtitles(clip.id, userId);
    expect(filed?.segments).toHaveLength(6);
    expect(filed?.segments?.[0]).toMatchObject({ start: '00:00:00,000', end: '00:00:05,000' });
    expect(filed?.srt_content).toContain('00:00:00,000 --> 00:00:05,000');
    expect((await db.getVideo(clip.id, userId))?.aspect_ratio).toBe('9:16');
    expect((await db.getVideo(clip.id, userId))?.title).toBeTruthy();
    expect(await db.getSubtitles(source.id, userId)).toEqual(sourceCaptions);

    const twice = await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: clip.id }, cookie);
    expect(twice.status).toBe(409);
  });

  it('keeps one creator’s press out of the next one’s reach', async () => {
    const owner = await signup('press-owner@test.example');
    const intruder = await signup('press-intruder@test.example');
    const source = await seedClip(owner.userId, { title: 'Private take' });
    const job = await dataOf(
      await call('POST', '/api/press', { videoId: source.id, style: 'hook' }, owner.cookie)
    );

    expect((await call('GET', `/api/press/${job.id}`, undefined, intruder.cookie)).status).toBe(404);
    expect((await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: source.id }, intruder.cookie)).status).toBe(
      404
    );
    expect(await dataOf(await call('GET', '/api/press', undefined, intruder.cookie))).toHaveLength(0);
    // Nor is the carousel theirs to edit.
    expect((await call('PUT', `/api/press/${job.id}/deck`, { slides: [] }, intruder.cookie)).status).toBe(404);

    const sourceCaptions = await db.getSubtitles(source.id, owner.userId);
    const original = await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: source.id }, owner.cookie);
    expect(original.status).toBe(422);
    expect((await json(original)).error).toMatch(/not the source video/i);
    expect(await db.getSubtitles(source.id, owner.userId)).toEqual(sourceCaptions);
    expect(await db.getVideo(source.id, owner.userId)).toEqual(source);

    const foreign = await seedClip(intruder.userId, { title: 'Someone else’s reel' });
    const foreignCaptions = await db.getSubtitles(foreign.id, intruder.userId);
    const stolen = await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: foreign.id }, owner.cookie);
    expect(stolen.status).toBe(404);
    expect(await db.getVideo(foreign.id, intruder.userId)).toEqual(foreign);
    expect(await db.getSubtitles(foreign.id, intruder.userId)).toEqual(foreignCaptions);
    const final = await readUntilWritten(owner.cookie, job.id);
    expect(final.bundle.clipVideoId).toBe('');
    expect(final.steps.find((step: any) => step.id === 'reel').state).toBe('failed');
    expect(final.status).toBe('failed');
    expect(final.error).toBe('The encoded file never landed in your vault.');
  });

  it('rejects nonready and fileless reels without changing any caption tracks', async () => {
    const { cookie, userId } = await signup('press-unready-reel@test.example');
    const source = await seedClip(userId);
    const sourceCaptions = await db.getSubtitles(source.id, userId);
    const job = await dataOf(await call('POST', '/api/press', { videoId: source.id, style: 'hook' }, cookie));
    const written = await readUntilWritten(cookie, job.id);

    for (const status of ['uploading', 'processing', 'failed'] as const) {
      const clip = await seedClip(userId, { status });
      const captions = await db.getSubtitles(clip.id, userId);
      const response = await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: clip.id }, cookie);
      expect(response.status).toBe(409);
      expect(await db.getVideo(clip.id, userId)).toEqual(clip);
      expect(await db.getSubtitles(clip.id, userId)).toEqual(captions);
    }

    for (const fileUrl of ['', 'https://example.com/reel.mp4', '/uploads/missing.mp4']) {
      const clip = await seedClip(userId, { file_url: fileUrl });
      if (fileUrl.startsWith('/uploads/')) {
        await db.updateVideoStatus(clip.id, undefined, { media_available: false }, userId);
      }
      const before = await db.getVideo(clip.id, userId);
      const captions = await db.getSubtitles(clip.id, userId);
      const response = await call('POST', `/api/press/${job.id}/reel`, { clipVideoId: clip.id }, cookie);
      expect(response.status).toBe(410);
      expect(await db.getVideo(clip.id, userId)).toEqual(before);
      expect(await db.getSubtitles(clip.id, userId)).toEqual(captions);
    }

    expect(await db.getSubtitles(source.id, userId)).toEqual(sourceCaptions);
    expect(await dataOf(await call('GET', `/api/press/${job.id}`, undefined, cookie))).toEqual(written);
  });
});
