import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import uploadRouter from './routes/upload.js';
import videosRouter from './routes/videos.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'upload-relink-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

// The upload routes write their media next to the process cwd, so every file this test creates is
// remembered and removed again rather than left in the repo's uploads folder.
const writtenFiles: string[] = [];

let server: Server;
let base = '';

const PASSWORD = 'a-creator-sized-passphrase';

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
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
});

afterAll(() => {
  server.close();
  for (const f of writtenFiles) fs.rmSync(f, { force: true });
});

async function signup(email: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name: 'Relink Creator', password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw ? raw.split(';')[0] : '';
}

async function directUpload(cookie: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/upload/direct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  if (typeof json?.video?.file_url === 'string' && json.video.file_url.startsWith('/uploads/')) {
    writtenFiles.push(path.join(process.cwd(), 'uploads', path.basename(json.video.file_url)));
  }
  return { status: res.status, json };
}

const tinyClip = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64');

describe('re-attaching media to a clip that already exists', () => {
  let cookie = '';

  it('keeps the same record, id and everything hanging off it', async () => {
    cookie = await signup('relink-owner@creator.test');

    const first = await directUpload(cookie, { fileName: 'take.mp4', fileData: tinyClip(4096) });
    expect(first.status).toBe(200);
    const originalId = first.json.video.id;

    // The file died on a redeploy; the creator picks the same take again.
    const second = await directUpload(cookie, {
      fileName: 'take.mp4',
      fileData: tinyClip(9000),
      videoId: originalId,
    });
    expect(second.status).toBe(200);
    expect(second.json.video.id).toBe(originalId);
    expect(second.json.video.status).toBe('ready');

    const list: any = await fetch(`${base}/api/videos`, { headers: { cookie } }).then((r) => r.json());
    // One row, not two: the queue, the cues and any Studio shorts still point at this id.
    expect(list.data.filter((v: any) => v.id === originalId)).toHaveLength(1);
    expect(list.data.find((v: any) => v.id === originalId).media_available).toBe(true);
  });

  it('refuses to re-link somebody else’s clip', async () => {
    const intruder = await signup('relink-intruder@creator.test');
    const mine = await directUpload(cookie, { fileName: 'private.mp4', fileData: tinyClip(2048) });

    const attempt = await directUpload(intruder, {
      fileName: 'private.mp4',
      fileData: tinyClip(2048),
      videoId: mine.json.video.id,
    });

    expect(attempt.status).toBe(404);
    expect(attempt.json.error).toMatch(/your account/i);
  });

  it('turns away an id KontentOS never issued instead of writing where it is told', async () => {
    const attempt = await directUpload(cookie, {
      fileName: 'two-birds.mp4',
      fileData: tinyClip(1024),
      videoId: '../../outside',
    });
    expect(attempt.status).toBe(400);
    expect(attempt.json.error).toMatch(/not a clip id/i);
  });
});
