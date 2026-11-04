import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import * as db from './db.js';
import { resetCutEngineProbe } from './mediaCut.js';
import * as store from './repurposeStore.js';
import repurposeRouter from './routes/repurpose.js';
import videosRouter from './routes/videos.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'repurpose-cut-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

/** The server cuts out of the real uploads directory, so that is where the fixture has to live. */
const uploadsDir = path.join(process.cwd(), 'uploads');
const made: string[] = [];

function tool(name: string): boolean {
  try {
    return spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}
const hasFfmpeg = tool('ffmpeg');

let server: Server;
let base = '';

const PASSWORD = 'a-creator-sized-passphrase';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/repurpose', repurposeRouter);
  app.use('/api/videos', videosRouter);
  return app;
}

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  process.env.GEMINI_API_KEY = '';

  server = buildApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  for (const file of made) fs.rmSync(file, { force: true });
});

function cookieFrom(res: Response): string | null {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw ? raw.split(';')[0] : null;
}

async function signup(email: string) {
  const res = await call('POST', '/api/auth/signup', {
    email,
    full_name: 'Cut Creator',
    password: PASSWORD,
  });
  const body = await json(res);
  return { cookie: cookieFrom(res), userId: body.data?.id as string };
}

function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', route: string, body?: unknown, cookie?: string | null) {
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

/** A clip row plus a file of its own, which is what the cut reads. */
async function sourceTake(userId: string, seconds: number, real: boolean) {
  const id = `vid_cut-test-${Math.random().toString(36).slice(2, 10)}`;
  const file = path.join(uploadsDir, `${id}.mp4`);
  if (real) {
    const make = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `testsrc=duration=${seconds}:size=320x240:rate=25`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${seconds}`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        file,
      ],
      { encoding: 'utf8' }
    );
    expect(make.status).toBe(0);
  } else {
    fs.writeFileSync(file, 'not really a video, but the server only asks whether bytes are here');
  }
  made.push(file);
  const row = await db.createVideo({
    user_id: userId,
    id,
    title: 'Take on the server',
    file_url: `/uploads/${id}.mp4`,
    duration: seconds,
    file_size: fs.statSync(file).size,
    status: 'ready',
  });
  return row;
}

/** A job holding one short over the span the test asks for. */
async function jobWith(userId: string, videoId: string, start: number, end: number, sourceKind: 'video' | 'paste') {
  return store.createJob({
    userId,
    title: 'Cuttable job',
    sourceKind,
    videoId: sourceKind === 'video' ? videoId : '',
    transcript: 'x'.repeat(500),
    engineModel: 'test',
    engineSource: 'local',
    clips: [
      {
        id: 'clip-0-0',
        start,
        end,
        startLabel: '00:00:00',
        endLabel: '00:00:05',
        spanSeconds: end - start,
        score: 80,
        title: 'The one short',
        hook: 'Watch this.',
        excerpt: 'An excerpt long enough to stand.',
        beats: [],
        caption: 'A caption.',
        cardHeadline: 'Headline',
        platform: 'instagram',
        status: 'draft',
      },
    ],
  });
}

describe('POST /api/repurpose/jobs/:jobId/clips/:clipId/cut', () => {
  it('refuses an anonymous caller before any encode starts', async () => {
    const res = await call('POST', '/api/repurpose/jobs/rj_x/clips/clip-0-0/cut');
    expect(res.status).toBe(401);
  });

  it('refuses a job that came from pasted words, because there is nothing to cut', async () => {
    const { cookie, userId } = await signup('cut-paste@test.example');
    const job = await jobWith(userId, '', 0, 5, 'paste');
    const res = await call('POST', `/api/repurpose/jobs/${job.id}/clips/clip-0-0/cut`, undefined, cookie);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatch(/pasted words/);
  });

  it('refuses a recording whose file is not on this server, and says the disk is the reason', async () => {
    const { cookie, userId } = await signup('cut-offline@test.example');
    const ghostId = 'vid_cut-test-no-file';
    const row = await db.createVideo({
      user_id: userId,
      id: ghostId,
      title: 'Row without bytes',
      file_url: `/uploads/${ghostId}.mp4`,
      duration: 30,
      status: 'ready',
    });
    const job = await jobWith(userId, row.id, 0, 5, 'video');
    const res = await call('POST', `/api/repurpose/jobs/${job.id}/clips/clip-0-0/cut`, undefined, cookie);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatch(/not on this server/i);
  });

  it('refuses a span that starts after the recording runs out', async () => {
    const { cookie, userId } = await signup('cut-past@test.example');
    const row = await sourceTake(userId, 12, false);
    const job = await jobWith(userId, row.id, 200, 240, 'video');
    const res = await call('POST', `/api/repurpose/jobs/${job.id}/clips/clip-0-0/cut`, undefined, cookie);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatch(/only 12s long/);
  });

  it('refuses a span longer than the server will encode and points at the browser cut', async () => {
    const { cookie, userId } = await signup('cut-long@test.example');
    const row = await sourceTake(userId, 600, false);
    const job = await jobWith(userId, row.id, 0, 300, 'video');
    const res = await call('POST', `/api/repurpose/jobs/${job.id}/clips/clip-0-0/cut`, undefined, cookie);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatch(/120s/);
  });

  it('will not read another creator’s job', async () => {
    const { cookie, userId } = await signup('cut-owner@test.example');
    const row = await sourceTake(userId, 20, false);
    const job = await jobWith(userId, row.id, 0, 5, 'video');
    const other = await signup('cut-looker@test.example');
    const res = await call('POST', `/api/repurpose/jobs/${job.id}/clips/clip-0-0/cut`, undefined, other.cookie);
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!hasFfmpeg)('a cut that really runs', () => {
  it('answers 202 with a clip row, then reports the file once the encode lands', async () => {
    const { cookie, userId } = await signup('cut-real@test.example');
    const row = await sourceTake(userId, 10, true);
    const job = await jobWith(userId, row.id, 3, 5, 'video');

    const res = await call('POST', `/api/repurpose/jobs/${job.id}/clips/clip-0-0/cut`, undefined, cookie);
    expect(res.status).toBe(202);
    const started = await json(res);
    expect(started.data.video.status).toBe('processing');
    expect(started.data.video.file_url).toMatch(/^\/uploads\/vid_[a-z0-9-]+\.mp4$/);
    expect(started.data.span).toEqual({ start: 3, duration: 2, shortOfSpan: false });
    made.push(path.join(uploadsDir, path.basename(started.data.video.file_url)));

    const cutId: string = started.data.video.id;
    let verdict = await json(await call('GET', `/api/repurpose/cuts/${cutId}`, undefined, cookie));
    const deadline = Date.now() + 60_000;
    while (verdict.data.status === 'encoding' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      verdict = await json(await call('GET', `/api/repurpose/cuts/${cutId}`, undefined, cookie));
    }

    expect(verdict.data.status).toBe('ready');
    expect(verdict.data.video.file_size).toBeGreaterThan(0);
    expect(verdict.data.video.duration).toBeCloseTo(2, 1);

    // The short is in the vault the bench lists, not only in the response.
    const inVault = await json(await call('GET', '/api/videos', undefined, cookie));
    const listed = inVault.data.find((v: any) => v.id === cutId);
    expect(listed).toBeTruthy();
    expect(listed.status).toBe('ready');
    expect(listed.media_available).toBe(true);

    // A second account cannot poll somebody else’s cut.
    const stranger = await signup('cut-stranger@test.example');
    expect((await call('GET', `/api/repurpose/cuts/${cutId}`, undefined, stranger.cookie)).status).toBe(404);
  }, 120_000);
});

/**
 * Run with an empty PATH so the probe cannot find ffmpeg, whatever the machine it is running on has
 * installed. The probe caches, so the cache is cleared on both sides of the callback.
 */
async function withoutFfmpeg<T>(run: () => Promise<T>): Promise<T> {
  const realPath = process.env.PATH;
  resetCutEngineProbe();
  process.env.PATH = '';
  try {
    return await run();
  } finally {
    process.env.PATH = realPath;
    resetCutEngineProbe();
  }
}

describe('a server with no cut engine', () => {
  it('refuses before writing a clip row that could only ever fail', async () =>
    withoutFfmpeg(async () => {
      const { cookie, userId } = await signup('cut-nobinary@test.example');
      const row = await sourceTake(userId, 10, false);
      const job = await jobWith(userId, row.id, 1, 4, 'video');

      const res = await call('POST', `/api/repurpose/jobs/${job.id}/clips/clip-0-0/cut`, undefined, cookie);
      expect(res.status).toBe(503);
      expect((await json(res)).error).toMatch(/no cut engine/i);

      // The refusal happens before the row, so the vault cannot fill up with doomed cuts.
      const rows = (await json(await call('GET', '/api/videos', undefined, cookie))).data as any[];
      expect(rows.some((v) => v.status === 'processing')).toBe(false);
    }));
});
