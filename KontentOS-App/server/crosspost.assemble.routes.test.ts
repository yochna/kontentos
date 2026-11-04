import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import publishRouter from './routes/publish.js';
import uploadRouter from './routes/upload.js';
import videosRouter from './routes/videos.js';

// Own scratch directory — the local JSON store is a whole-file read-modify-write and two test
// files sharing it would lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'crosspost-assemble');
process.env.KONTENTOS_DATA_DIR = dataDir;

// The upload routes write media next to the process cwd, so every file made here is remembered
// and deleted again instead of piling up in the repo's uploads folder.
const writtenFiles: string[] = [];

let server: Server;
let base = '';
let cookie = '';

const PASSWORD = 'a-creator-sized-passphrase';

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/publish', publishRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/videos', videosRouter);
  return app;
}

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.GEMINI_API_KEY = '';

  server = buildApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cookie = await signup('crosspost@test.example');
});

afterAll(() => {
  server.close();
  for (const f of writtenFiles) fs.rmSync(f, { force: true });
});

async function signup(email: string): Promise<string> {
  const res = await call('POST', '/api/auth/signup', {
    email,
    full_name: 'Ship Tester',
    password: PASSWORD,
  });
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw ? raw.split(';')[0] : '';
}

function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', route: string, body?: unknown, own = cookie) {
  return fetch(base + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(own ? { Cookie: own } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonOf(res: Response): Promise<any> {
  return (await res.json()) as any;
}

async function makeVideo(title = 'Assembled take', own = cookie) {
  const res = await call('POST', '/api/videos', {
    title,
    file_url: '/uploads/never-uploaded.mp4',
    duration: 12,
    status: 'ready',
  }, own);
  return (await jsonOf(res)).data;
}

/**
 * Rewrites one stored queue row straight in the JSON file. Only a legacy row could point at a
 * clip its creator does not own, and the API has no route that produces that state.
 */
function reassignPostVideo(postId: string, videoId: string) {
  const file = path.join(dataDir, 'kontentos-db.json');
  const store = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const row = store.scheduled_posts.find((p: any) => p.id === postId);
  if (!row) throw new Error(`test setup: no stored row for ${postId}`);
  row.video_id = videoId;
  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf-8');
}

describe('cross-posting a queued row', () => {
  async function scheduleOne(videoId: string, platform = 'tiktok') {
    const res = await call('POST', '/api/publish/schedule', {
      videoId,
      platforms: [platform],
      captionText: 'First pass caption',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe(200);
    return (await jsonOf(res)).data;
  }

  async function queueSize() {
    return (await jsonOf(await call('GET', '/api/publish/schedule'))).data.length;
  }

  it('refuses to claim a cross-post when the clip behind the row is not its own', async () => {
    // A queue row normally cannot outlive its clip — deleting the clip deletes the row — so the
    // only way to reach this state through the app is a legacy row that names a clip belonging to
    // somebody else, exactly what a passcode-era database can hold.
    const mine = await makeVideo('Mine, queued');
    const post = await scheduleOne(mine.id);
    const other = await signup('other.crosspost@test.example');
    const theirs = await makeVideo('Somebody else clip', other);

    reassignPostVideo(post.id, theirs.id);

    const res = await call('POST', `/api/publish/schedule/${post.id}/crosspost`, {
      targetPlatforms: ['youtube', 'instagram'],
    });
    const body = await jsonOf(res);

    // Every createScheduledPost call here answers null, so the answer must not read like a success.
    expect(res.status).toBe(409);
    expect(body.success).toBeUndefined();
    expect(body.error).toMatch(/not in your vault/i);
    expect(await queueSize()).toBe(1);
  });

  it('counts only the rows that landed when part of a cross-post is refused', async () => {
    const video = await makeVideo('Half landed cross-post');
    const post = await scheduleOne(video.id, 'tiktok');

    const res = await call('POST', `/api/publish/schedule/${post.id}/crosspost`, {
      targetPlatforms: ['tiktok', 'youtube'],
    });
    const body = await jsonOf(res);

    // tiktok is the source platform and is skipped, so exactly one row is attempted and one lands.
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.message).not.toMatch(/⚠️/);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].platform).toBe('youtube');
  });

  it('says so when every target is the platform the post already uses', async () => {
    const video = await makeVideo('Nothing new to add');
    const post = await scheduleOne(video.id, 'instagram');

    const res = await call('POST', `/api/publish/schedule/${post.id}/crosspost`, {
      targetPlatforms: ['instagram'],
    });
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toMatch(/already targets/i);
    expect(await queueSize()).not.toBe(0);
  });
});

describe('assembling a clip from chunks', () => {
  // Sizes big enough that the write stream fills its buffer and the assembly has to wait for
  // drain — the case the old synchronous whole-file read handled by blocking the process.
  const chunks = [Buffer.alloc(1_500_000, 11), Buffer.alloc(1_500_000, 22), Buffer.alloc(700_000, 33)];

  it('writes every byte in order and reports the real size', async () => {
    const whole = Buffer.concat(chunks);
    const init = await jsonOf(
      await call('POST', '/api/upload/init', {
        fileName: 'long-take.mp4',
        totalChunks: chunks.length,
        totalSize: whole.length,
      })
    );
    expect(init.success).toBe(true);
    const uploadId = init.uploadId;

    for (let i = 0; i < chunks.length; i++) {
      const res = await call('POST', '/api/upload/chunk', {
        uploadId,
        chunkIndex: i,
        chunkData: chunks[i].toString('base64'),
      });
      expect(res.status).toBe(200);
    }

    const done = await jsonOf(
      await call('POST', '/api/upload/complete', { uploadId, title: 'Streamed assembly', duration: 41 })
    );
    expect(done.success).toBe(true);
    expect(done.video.status).toBe('ready');
    expect(done.video.file_size).toBe(whole.length);

    const finalPath = path.join(process.cwd(), 'uploads', path.basename(done.video.file_url));
    writtenFiles.push(finalPath);
    expect(fs.readFileSync(finalPath).equals(whole)).toBe(true);

    // The chunks are gone, the clip is not.
    expect(fs.existsSync(path.join(process.cwd(), 'uploads', '.chunks', uploadId))).toBe(false);
  });

  it('leaves no half-built file behind when the assembly is refused', async () => {
    const init = await jsonOf(
      await call('POST', '/api/upload/init', { fileName: 'never-finished.mp4', totalChunks: 2, totalSize: 10 })
    );
    const res = await call('POST', '/api/upload/complete', { uploadId: init.uploadId });
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toMatch(/Incomplete upload/i);
    expect(fs.existsSync(path.join(process.cwd(), 'uploads', '.chunks', init.uploadId))).toBe(true);
  });
});
