import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import uploadRouter from './routes/upload.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'upload-session-cap');
process.env.KONTENTOS_DATA_DIR = dataDir;

// Chunk sessions live on this container's disk, so anything assembled here is remembered and
// deleted again instead of piling up in the repo's uploads folder.
const writtenFiles: string[] = [];

let server: Server;
let base = '';

const PASSWORD = 'a-creator-sized-passphrase';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/upload', uploadRouter);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  for (const f of writtenFiles) fs.rmSync(f, { force: true });
  vi.useRealTimers();
});

async function signup(email: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name: 'Chunk Creator', password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw ? raw.split(';')[0] : '';
}

function post(route: string, cookie: string, body: Record<string, unknown>) {
  return fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

const init = (cookie: string, fileName = 'take.mp4') =>
  post('/api/upload/init', cookie, { fileName, totalChunks: 2, totalSize: 4096 });

async function uploadOneClip(cookie: string) {
  const started = (await (await init(cookie)).json()) as any;
  for (const chunkIndex of [0, 1]) {
    const sent = await post('/api/upload/chunk', cookie, {
      uploadId: started.uploadId,
      chunkIndex,
      chunkData: Buffer.alloc(1024, 7).toString('base64'),
    });
    expect(sent.status).toBe(200);
  }
  const done = await post('/api/upload/complete', cookie, { uploadId: started.uploadId });
  expect(done.status).toBe(200);
  const json = (await done.json()) as any;
  writtenFiles.push(path.join(process.cwd(), 'uploads', path.basename(json.video.file_url)));
  return json;
}

describe('the number of uploads one creator may hold open', () => {
  it('refuses a fourth in-flight session from the same account', async () => {
    const cookie = await signup('cap-owner@creator.test');

    for (let i = 0; i < 3; i++) {
      expect((await init(cookie)).status).toBe(200);
    }

    const blocked = await init(cookie);
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as any).error).toMatch(/in flight/i);
  });

  it('does not let one creator’s backlog lock the next one out', async () => {
    const other = await signup('cap-neighbour@creator.test');
    expect((await init(other)).status).toBe(200);
  });

  it('frees the slot again once a clip is assembled', async () => {
    const cookie = await signup('cap-freed@creator.test');
    for (let i = 0; i < 2; i++) {
      expect((await init(cookie)).status).toBe(200);
    }

    // The third slot is spent on a clip that actually finishes, so it comes back to them.
    await uploadOneClip(cookie);
    expect((await init(cookie)).status).toBe(200);
  });

  it('reclaims a session that was opened and never started sending', async () => {
    const cookie = await signup('cap-abandoned@creator.test');
    for (let i = 0; i < 3; i++) {
      expect((await init(cookie)).status).toBe(200);
    }
    expect((await init(cookie)).status).toBe(429);

    // A page reload after /init leaves a session that will never answer. Only the clock has to
    // move, so just Date is faked — the requests themselves keep running on real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.advanceTimersByTime(6 * 60 * 1000);
    try {
      expect((await init(cookie)).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps an upload that is mid-flight rather than dropping its chunks', async () => {
    const cookie = await signup('cap-slow@creator.test');
    const started = (await (await init(cookie)).json()) as any;

    await post('/api/upload/chunk', cookie, {
      uploadId: started.uploadId,
      chunkIndex: 0,
      chunkData: Buffer.alloc(512, 3).toString('base64'),
    });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.advanceTimersByTime(10 * 60 * 1000); // past the never-started window, inside the idle one
    try {
      const resumed = await post('/api/upload/chunk', cookie, {
        uploadId: started.uploadId,
        chunkIndex: 1,
        chunkData: Buffer.alloc(512, 4).toString('base64'),
      });
      expect(resumed.status).toBe(200);

      const done = await post('/api/upload/complete', cookie, { uploadId: started.uploadId });
      expect(done.status).toBe(200);
      writtenFiles.push(
        path.join(process.cwd(), 'uploads', path.basename(((await done.json()) as any).video.file_url)),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
