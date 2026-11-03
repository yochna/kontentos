import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import * as db from './db.js';
import publishRouter from './routes/publish.js';
import transcribeRouter from './routes/transcribe.js';
import videosRouter from './routes/videos.js';

// A write that did not land used to be answered with success:true. These routes are the ones that
// quietly dropped a creator's work: a rename flipping a clip to ready, cues attached to somebody
// else's video, a queue row that never existed.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'write-failures');
process.env.KONTENTOS_DATA_DIR = dataDir;
process.env.GEMINI_API_KEY = '';

let server: Server;
let base = '';

const PASSWORD = 'a-creator-sized-passphrase';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const app = express();
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/publish', publishRouter);
  app.use('/api/transcribe', transcribeRouter);
  app.use('/api/videos', videosRouter);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function signup(email: string): Promise<{ cookie: string; userId: string }> {
  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name: 'Write Tester', password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const body = (await res.json()) as any;
  return { cookie: raw ? raw.split(';')[0] : '', userId: body.data.id as string };
}

function call(
  method: 'GET' | 'POST' | 'PATCH',
  route: string,
  cookie: string,
  body?: unknown,
): Promise<Response> {
  return fetch(base + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const jsonOf = async (res: Response) => (await res.json()) as any;

describe('a rename is not a change of state', () => {
  it('leaves the status alone when only a title is sent', async () => {
    const owner = await signup('rename-owner@test.example');
    const clip = await db.createVideo({
      user_id: owner.userId,
      title: 'Still rendering',
      status: 'processing',
      file_url: '/uploads/holder.mp4',
    });

    const res = await call('PATCH', `/api/videos/${clip.id}`, owner.cookie, { title: 'Renamed mid-render' });
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data.title).toBe('Renamed mid-render');
    expect(body.data.status).toBe('processing');

    // The row on disk, not only the answer: the bench reads the same column on the next load.
    const [stored] = await db.listVideos(owner.userId);
    expect(stored.status).toBe('processing');
    expect(stored.file_url).toBe('/uploads/holder.mp4');
  });

  it('still moves the status when the caller asks for a new one', async () => {
    const owner = await signup('rename-owner2@test.example');
    const clip = await db.createVideo({ user_id: owner.userId, title: 'Ready?', status: 'processing' });

    const res = await call('PATCH', `/api/videos/${clip.id}`, owner.cookie, { status: 'ready' });
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).data.status).toBe('ready');
  });

  it('refuses a status the bench cannot draw and an edit that changes nothing', async () => {
    const owner = await signup('rename-owner3@test.example');
    const clip = await db.createVideo({ user_id: owner.userId, title: 'Guarded', status: 'ready' });

    const junk = await call('PATCH', `/api/videos/${clip.id}`, owner.cookie, { status: { $set: 'ready' } });
    expect(junk.status).toBe(400);

    const empty = await call('PATCH', `/api/videos/${clip.id}`, owner.cookie, {});
    expect(empty.status).toBe(400);

    expect((await db.getVideo(clip.id, owner.userId))?.title).toBe('Guarded');
  });
});

describe('cues and queue rows attach only to your own clip', () => {
  it('refuses to store a script against another creator’s clip', async () => {
    const owner = await signup('cues-owner@test.example');
    const intruder = await signup('cues-intruder@test.example');
    const clip = await db.createVideo({ user_id: owner.userId, title: 'Private take' });
    await db.saveSubtitles(
      {
        video_id: clip.id,
        srt_content: 'the owner’s cues',
        vtt_content: '',
        transcript_text: 'the owner’s cues',
        segments: [],
      } as any,
      owner.userId,
    );

    const res = await call('POST', '/api/transcribe/live', intruder.cookie, {
      videoId: clip.id,
      transcriptText: 'words the intruder wanted filed',
    });
    expect(res.status).toBe(409);
    expect((await jsonOf(res)).error).toMatch(/not in your vault/i);

    // The owner's cues are the ones still on the row, and the intruder created no new row.
    expect((await db.getSubtitles(clip.id, owner.userId))?.transcript_text).toBe('the owner’s cues');
    expect(await db.getSubtitles(clip.id, intruder.userId)).toBeNull();
  });

  it('still saves a script for the creator who owns the clip', async () => {
    const owner = await signup('cues-writer@test.example');
    const clip = await db.createVideo({ user_id: owner.userId, title: 'My take' });

    const res = await call('POST', '/api/transcribe/live', owner.cookie, {
      videoId: clip.id,
      transcriptText: 'one two three four five six',
    });
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.data.id).toMatch(/^sub_/);
    expect(body.data.segments.length).toBeGreaterThan(0);
  });

  it('refuses to queue a post against a clip that is not yours', async () => {
    const owner = await signup('queue-owner@test.example');
    const intruder = await signup('queue-intruder@test.example');
    const clip = await db.createVideo({ user_id: owner.userId, title: 'Someone else’s reel' });

    const queueLength = async (cookie: string) => {
      const res = await call('GET', '/api/publish/schedule', cookie);
      const body = await jsonOf(res);
      return (Array.isArray(body.data) ? body.data : []).length;
    };

    const before = await queueLength(intruder.cookie);
    const res = await call('POST', '/api/publish/schedule', intruder.cookie, {
      videoId: clip.id,
      platforms: ['youtube'],
      captionText: 'posted to nobody',
    });
    expect(res.status).toBe(409);
    expect((await jsonOf(res)).error).toMatch(/not in your vault/i);
    expect(await queueLength(intruder.cookie)).toBe(before);
    expect(await queueLength(owner.cookie)).toBe(0);
  });

  it('queues a post for the creator who owns the clip', async () => {
    const owner = await signup('queue-writer@test.example');
    const clip = await db.createVideo({ user_id: owner.userId, title: 'My reel' });

    const res = await call('POST', '/api/publish/schedule', owner.cookie, {
      videoId: clip.id,
      platforms: ['youtube', 'instagram'],
      captionText: 'two platforms',
    });
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.total).toBe(2);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((post: any) => post && post.id)).toBe(true);
  });
});
