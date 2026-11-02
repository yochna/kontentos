import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import * as db from './db.js';
import repurposeRouter from './routes/repurpose.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'repurpose-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

// The real router, the real auth gate and the real JSON store — but never the whole server.ts.
let server: Server;
let base = '';

const PASSWORD = 'a-creator-sized-passphrase';
const LONG_ENOUGH =
  'Why does most content flop? Stop publishing first drafts. Here is the mistake I made for two years. ' +
  'I shipped forty posts and got three replies and called it growth. Actually the problem was the hook. ' +
  'So we rewrote only the first line for a month and the reach doubled without changing anything else. ' +
  'Never judge a piece by how it felt to write. The number that matters is how many people stayed. ' +
  'That is the whole lesson: the idea is not the bottleneck, the first seven seconds are.';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/repurpose', repurposeRouter);
  return app;
}

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
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
  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name: 'Test Creator', password: PASSWORD }),
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

/** The `{ success, data }` envelope every route answers with. */
async function dataOf(res: Response): Promise<any> {
  return (await json(res)).data;
}

describe('repurpose endpoints', () => {
  it('refuses an anonymous caller before spending an engine call', async () => {
    const res = await call('POST', '/api/repurpose/jobs', { transcript: LONG_ENOUGH, title: 'x' });
    expect(res.status).toBe(401);
  });

  it('refuses a transcript with nothing to cut, and says why', async () => {
    const { cookie } = await signup('repurpose-short@test.example');
    const res = await call('POST', '/api/repurpose/jobs', { transcript: 'One sentence.', title: 'Thin' }, cookie);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error).toMatch(/too short/i);
  });

  it('builds a job from a pasted transcript and labels the source honestly', async () => {
    const { cookie, userId } = await signup('repurpose-paste@test.example');
    const res = await call(
      'POST',
      '/api/repurpose/jobs',
      { transcript: LONG_ENOUGH, title: '  Hooks over ideas  ', clipCount: 3 },
      cookie
    );
    expect(res.status).toBe(200);
    const job = await dataOf(res);

    expect(job.userId).toBe(userId);
    expect(job.sourceKind).toBe('paste');
    expect(job.title).toBe('Hooks over ideas');
    expect(job.engineSource).toBe('local');
    expect(job.clips.length).toBeGreaterThan(0);
    expect(job.clips.length).toBeLessThanOrEqual(3);
    // A pasted transcript has no cues, so the timecodes must be reported as unknown rather than guessed.
    expect(job.clips[0].startLabel).toBe('—:—');
  });

  it('takes timecodes from the stored cues, not from the browser', async () => {
    const { cookie, userId } = await signup('repurpose-cues@test.example');
    const video = await db.createVideo({ user_id: userId, title: 'Studio recording' });
    await db.saveSubtitles(
      {
        video_id: video.id,
        srt_content: '',
        vtt_content: '',
        transcript_text: LONG_ENOUGH,
        segments: Array.from({ length: 12 }, (_, i) => ({
          id: i,
          start: `00:00:${String(i * 5).padStart(2, '0')},000`,
          end: `00:00:${String((i + 1) * 5).padStart(2, '0')},000`,
          text: i % 2 === 0
            ? 'Why does most content flop? Stop publishing first drafts — here is the reason it keeps repeating.'
            : 'We carried on with the next part of the run and had very little to say about it that week.',
        })),
      },
      userId
    );

    const res = await call(
      'POST',
      '/api/repurpose/jobs',
      { transcript: LONG_ENOUGH, videoId: video.id, sourceKind: 'video', title: 'Cued take' },
      cookie
    );
    const job = await dataOf(res);
    expect(job.sourceKind).toBe('video');
    expect(job.clips[0].start).toBeGreaterThanOrEqual(0);
    expect(job.clips[0].startLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(job.clips[0].end).toBeGreaterThan(job.clips[0].start);
  });

  it('does not borrow cues from another creator’s video', async () => {
    const owner = await signup('repurpose-owner@test.example');
    const intruder = await signup('repurpose-intruder@test.example');

    const video = await db.createVideo({ user_id: owner.userId, title: 'Private recording' });
    await db.saveSubtitles(
      {
        video_id: video.id,
        srt_content: '',
        vtt_content: '',
        transcript_text: LONG_ENOUGH,
        // Twelve timed cues: if they leaked across accounts the intruder's clips would carry
        // real timecodes instead of the unknown marker.
        segments: Array.from({ length: 12 }, (_, i) => ({
          id: i,
          start: `00:00:${String(i * 5).padStart(2, '0')},000`,
          end: `00:00:${String((i + 1) * 5).padStart(2, '0')},000`,
          text: 'Why does most content flop? Stop publishing first drafts and look at the number instead.',
        })),
      },
      owner.userId
    );

    const res = await call(
      'POST',
      '/api/repurpose/jobs',
      { transcript: LONG_ENOUGH, videoId: video.id, title: 'Borrowed cues' },
      intruder.cookie
    );
    const job = await dataOf(res);
    expect(job.clips[0].start).toBe(-1);
    expect(await listJobsFor(intruder.cookie)).toHaveLength(1);
    expect(await listJobsFor(owner.cookie)).toHaveLength(0);
  });

  it('keeps edits on the fields they touch and reflects them on reload', async () => {
    const { cookie } = await signup('repurpose-edit@test.example');
    const job = await dataOf(
      await call('POST', '/api/repurpose/jobs', { transcript: LONG_ENOUGH, title: 'Edit me', clipCount: 3 }, cookie)
    );
    const clipId = job.clips[0].id;

    const patched = await dataOf(
      await call(
        'PATCH',
        `/api/repurpose/jobs/${job.id}/clips/${clipId}`,
        { caption: 'Only the caption.', status: 'saved' },
        cookie
      )
    );
    expect(patched.caption).toBe('Only the caption.');
    expect(patched.status).toBe('saved');
    expect(patched.title).toBe(job.clips[0].title);

    const reloaded = await dataOf(await call('GET', `/api/repurpose/jobs/${job.id}`, undefined, cookie));
    expect(reloaded.clips.find((c: any) => c.id === clipId).caption).toBe('Only the caption.');
    expect(reloaded.clips.find((c: any) => c.id === clipId).title).toBe(job.clips[0].title);
  });

  it('stamps the destination the Studio picked and keeps it on reload', async () => {
    const { cookie } = await signup('repurpose-platform@test.example');
    const job = await dataOf(
      await call(
        'POST',
        '/api/repurpose/jobs',
        { transcript: LONG_ENOUGH, title: 'For TikTok', platform: 'tiktok' },
        cookie
      )
    );
    expect(job.clips.every((c: any) => c.platform === 'tiktok')).toBe(true);

    const reloaded = await dataOf(await call('GET', `/api/repurpose/jobs/${job.id}`, undefined, cookie));
    expect(reloaded.clips[0].platform).toBe('tiktok');
  });

  it('retargets one short without disturbing the others, and refuses a platform that does not exist', async () => {
    const { cookie } = await signup('repurpose-retarget@test.example');
    const job = await dataOf(
      await call('POST', '/api/repurpose/jobs', { transcript: LONG_ENOUGH, title: 'Mixed' }, cookie)
    );

    const patched = await dataOf(
      await call(
        'PATCH',
        `/api/repurpose/jobs/${job.id}/clips/${job.clips[1].id}`,
        { platform: 'linkedin' },
        cookie
      )
    );
    expect(patched.platform).toBe('linkedin');
    expect(patched.caption).toBe(job.clips[1].caption);

    const refused = await call(
      'PATCH',
      `/api/repurpose/jobs/${job.id}/clips/${job.clips[2].id}`,
      { platform: 'myspace' },
      cookie
    );
    expect(refused.status).toBe(400);
    expect((await json(refused)).error).toMatch(/not a platform/i);

    const reloaded = await dataOf(await call('GET', `/api/repurpose/jobs/${job.id}`, undefined, cookie));
    expect(reloaded.clips[1].platform).toBe('linkedin');
    expect(reloaded.clips[0].platform).toBe('instagram');
    expect(reloaded.clips[2].platform).toBe('instagram');
  });

  it('hides, then deletes, exactly the job that was asked for', async () => {
    const owner = await signup('repurpose-delete@test.example');
    const other = await signup('repurpose-other@test.example');

    const job = await dataOf(
      await call('POST', '/api/repurpose/jobs', { transcript: LONG_ENOUGH, title: 'Temporary' }, owner.cookie)
    );

    expect((await call('GET', `/api/repurpose/jobs/${job.id}`, undefined, other.cookie)).status).toBe(404);
    expect((await call('PATCH', `/api/repurpose/jobs/${job.id}/clips/${job.clips[0].id}`, { title: 'hijack' }, other.cookie)).status).toBe(404);

    expect((await call('DELETE', `/api/repurpose/jobs/${job.id}`, undefined, other.cookie)).status).toBe(404);
    expect((await listJobsFor(owner.cookie)).map((j) => j.id)).toContain(job.id);

    expect((await call('DELETE', `/api/repurpose/jobs/${job.id}`, undefined, owner.cookie)).status).toBe(200);
    expect(await listJobsFor(owner.cookie)).toHaveLength(0);
    expect((await call('DELETE', `/api/repurpose/jobs/${job.id}`, undefined, owner.cookie)).status).toBe(404);
  });
});

async function listJobsFor(cookie: string | null) {
  return (await dataOf(await call('GET', '/api/repurpose/jobs', undefined, cookie))) as Array<{ id: string }>;
}
