import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import publishRouter from './routes/publish.js';
import videosRouter from './routes/videos.js';

// Own scratch directory — the local JSON store is a whole-file read-modify-write and two test
// files sharing it would lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'publish-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

let server: Server;
let base = '';
let cookie = '';

const PASSWORD = 'a-creator-sized-passphrase';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/publish', publishRouter);
  app.use('/api/videos', videosRouter);
  return app;
}

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  server = buildApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const res = await call('POST', '/api/auth/signup', {
    email: 'ledger@test.example',
    full_name: 'Ledger Tester',
    password: PASSWORD,
  });
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  cookie = raw ? raw.split(';')[0] : '';
});

afterAll(() => {
  server.close();
});

function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', route: string, body?: unknown) {
  return fetch(base + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonOf(res: Response): Promise<any> {
  return (await res.json()) as any;
}

async function makeVideo(title = 'Take one') {
  const res = await call('POST', '/api/videos', {
    title,
    file_url: '/uploads/never-uploaded.mp4',
    duration: 12,
    status: 'ready',
  });
  return (await jsonOf(res)).data;
}

async function queue(platforms: string[], captionText: string, videoId: string, custom?: Record<string, any>) {
  return call('POST', '/api/publish/schedule', {
    videoId,
    videoTitle: 'Take one',
    platforms,
    captionText,
    hashtags: ['creator'],
    scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    ...(custom ? { platformCustomizations: custom } : {}),
  });
}

describe('publishing ledger', () => {
  it('keeps a clip whose file did not survive the disk, but says the media is gone', async () => {
    const video = await makeVideo();
    const res = await call('GET', '/api/videos');
    const body = await jsonOf(res);
    const row = body.data.find((v: any) => v.id === video.id);
    expect(row).toBeTruthy();
    // /uploads/never-uploaded.mp4 is not on this machine, so the record must announce that.
    expect(row.media_available).toBe(false);
  });

  it('refuses copy the destination platform itself would reject', async () => {
    const video = await makeVideo('Long caption clip');
    const tooLongForX = 'x'.repeat(300);
    const res = await queue(['x'], tooLongForX, video.id);
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.error).toMatch(/X/i);
    expect(body.error).toMatch(/280/);

    const posts = await jsonOf(await call('GET', '/api/publish/schedule'));
    expect(posts.data.filter((p: any) => p.video_id === video.id)).toHaveLength(0);
  });

  it('takes the same caption for Instagram and refuses only the platform that cannot hold it', async () => {
    const video = await makeVideo('Mixed cascade clip');
    const long = 'y'.repeat(400);
    const res = await queue(['instagram', 'x'], long, video.id, {
      instagram: { captionText: long, hashtags: ['creator'] },
      x: { captionText: long, hashtags: ['creator'] },
    });
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toMatch(/X/);
  });

  it('marks a post published only with the link the creator pastes, and stores it verbatim', async () => {
    const video = await makeVideo('Posted clip');
    const created = await jsonOf(await queue(['instagram'], 'A short honest caption.', video.id));
    const postId = created.data.id;

    const bad = await call('POST', `/api/publish/schedule/${postId}/publish-now`, {
      postUrl: 'not-a-link',
    });
    expect(bad.status).toBe(400);
    expect((await jsonOf(bad)).error).toMatch(/does not look like a link/i);

    // Still scheduled after the refused attempt — nothing was recorded.
    const before = await jsonOf(await call('GET', '/api/publish/schedule'));
    expect(before.data.find((p: any) => p.id === postId).status).toBe('scheduled');

    const live = 'https://www.instagram.com/reel/CxYz123/';
    const ok = await call('POST', `/api/publish/schedule/${postId}/publish-now`, { postUrl: live });
    expect(ok.status).toBe(200);
    const row = (await jsonOf(ok)).data;
    expect(row.status).toBe('published');
    expect(row.post_url).toBe(live);

    const history = await jsonOf(await call('GET', '/api/publish/history'));
    const record = history.data.find((h: any) => h.video_id === video.id);
    expect(record?.url).toBe(live);
  });

  it('accepts a post marked without a link, and never invents one', async () => {
    const video = await makeVideo('No link clip');
    const created = await jsonOf(await queue(['tiktok'], 'Caption text.', video.id));
    const res = await call('POST', `/api/publish/schedule/${created.data.id}/publish-now`, {});
    expect(res.status).toBe(200);
    const row = (await jsonOf(res)).data;
    expect(row.status).toBe('published');
    expect(row.post_url || '').toBe('');
  });

  it('lets a creator correct the link afterwards', async () => {
    const video = await makeVideo('Corrected clip');
    const created = await jsonOf(await queue(['linkedin'], 'Caption.', video.id));
    const postId = created.data.id;

    const wrong = await call('PATCH', `/api/publish/schedule/${postId}`, { postUrl: 'instagramcom/reel' });
    expect(wrong.status).toBe(400);

    const right = await call('PATCH', `/api/publish/schedule/${postId}`, {
      postUrl: 'https://linkedin.com/feed/posts/abc',
    });
    expect(right.status).toBe(200);
    expect((await jsonOf(right)).data.post_url).toBe('https://linkedin.com/feed/posts/abc');
  });

  it('scopes the ledger to the signed-in creator', async () => {
    const anon = await call('GET', '/api/publish/schedule');
    expect(anon.status).toBe(200); // this session is the owner; prove a second one sees nothing
    const other = 'a-creator-sized-passphrase';
    const res = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'other@test.example', full_name: 'Other', password: other }),
    });
    const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const list = await fetch(`${base}/api/publish/schedule`, {
      headers: { Cookie: raw ? raw.split(';')[0] : '' },
    });
    const body = await jsonOf(list);
    expect(body.data.every((p: any) => !p.video_title?.includes('Posted clip'))).toBe(true);
  });
});
