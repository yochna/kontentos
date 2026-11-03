import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as db from './db.js';
import { clipIdForFile, mayReadClipFile, uploadAccessGate } from './mediaAccess.js';

const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'media-access');
process.env.KONTENTOS_DATA_DIR = dataDir;

let server: Server;
let base = '';

const OWNER = 'user_owner_media';
const OTHER = 'user_other_media';
const OWNED = 'vid_aaaaaaaaaaaa4a1a8b9c0d1e2f3a4b5c';
const FOREIGN = 'vid_bbbbbbbbbbbb4b2b9c0d1e2f3a4b5c6d7e';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.GEMINI_API_KEY = '';

  // The gate reads only the clip row, so the two creators exist as the user_id on those rows.
  await db.createVideo({ id: OWNED, user_id: OWNER, title: 'Mine', file_url: `/uploads/${OWNED}.mp4` });
  await db.createVideo({ id: FOREIGN, user_id: OTHER, title: 'Theirs', file_url: `/uploads/${FOREIGN}.mp4` });

  const app = express();
  // The real chain is requireUser -> this gate -> express.static; the identity is stood in for so
  // the assertions below are about ownership, not about sessions.
  app.use((req, _res, next) => {
    req.userId = String(req.headers['x-as'] ?? '');
    next();
  });
  app.use('/uploads', uploadAccessGate, (_req, res) => res.send('bytes'));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const get = async (fileName: string, as = '') => {
  const res = await fetch(`${base}/uploads/${fileName}`, { headers: as ? { 'x-as': as } : {} });
  return { status: res.status, body: await res.text() };
};

describe('the shape of a clip file name', () => {
  it('accepts only what the upload routes mint', () => {
    for (const name of [`${OWNED}.mp4`, `${OWNED}.MOV`, `${OWNED}.webm`, `${OWNED}.m4v`, `${OWNED}.mkv`]) {
      expect(clipIdForFile(name)).toBe(OWNED);
    }
  });

  it('refuses anything that is not one clip segment', () => {
    for (const name of [
      'city-run.mp4',
      '.chunks/upl_123456/chunk_0',
      '../.data/kontentos-db.json',
      `${OWNED}.html`,
      `${OWNED}.mp4/exec`,
      'secrets.txt',
      '',
      `${OWNED}`,
    ]) {
      expect(clipIdForFile(name)).toBeNull();
    }
  });
});

describe('reading an uploaded clip', () => {
  it('gives the owner their bytes', async () => {
    const res = await get(`${OWNED}.mp4`, OWNER);
    expect(res.status).toBe(200);
    expect(res.body).toBe('bytes');
  });

  it('will not show another creator their footage', async () => {
    const res = await get(`${FOREIGN}.mp4`, OWNER);
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('bytes');
  });

  it('will not show anybody footage before the session is verified', async () => {
    expect((await get(`${OWNED}.mp4`)).status).toBe(404);
  });

  it('answers the same way for a foreign clip as for one that never existed', async () => {
    const foreign = await get(`${FOREIGN}.mp4`, OWNER);
    const missing = await get('vid_cccccccccccc4c3c0d1e2f3a4b5c6d7e.mp4', OWNER);
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toBe(missing.body);
  });

  it('refuses a path that is not a clip file at all, including the chunk scratch folder', async () => {
    for (const name of ['.chunks/upl_123456/chunk_0', 'secret.html', 'brand-kit.json']) {
      expect((await get(name, OWNER)).status).toBe(404);
    }
  });

  it('refuses a percent-encoded path that decodes to traversal', async () => {
    for (const name of [
      '%2e%2e%2f%2e%2e%2fserver%2ets',
      '%2e%2e%2fuploads%2f' + FOREIGN + '.mp4',
      '%25%2e%25%2e%25%2fserver%25%2ets',
    ]) {
      expect((await get(name, OWNER)).status).toBe(404);
    }
  });

  it('still holds the answer for a minute, so a scrub does not re-read storage per seek', async () => {
    expect(await mayReadClipFile(`${OWNED}.mp4`, OWNER)).toBe(true);
    // The row is gone; the cached owner is what the next range request is checked against, and the
    // file itself is deleted with the row, so the only thing this can delay is the 404.
    await db.deleteVideo(OWNED, OWNER);
    expect(await mayReadClipFile(`${OWNED}.mp4`, OWNER)).toBe(true);
    expect(await mayReadClipFile(`${OWNED}.mp4`, OTHER)).toBe(false);
  });
});
