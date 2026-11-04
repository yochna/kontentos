import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The store is stood in for, so the assertions below are about the route chain — gate first, then the
 * disk, then the bucket — rather than about whether an S3 API works. The real client is exercised
 * against a live endpoint in mediaStore.test.ts, where a fake could not prove anything.
 */
const reads = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('./mediaStore.js', () => ({
  readBucketClip: vi.fn(async (fileUrl: string, range?: string) => {
    reads.calls.push(fileUrl);
    if (fileUrl === '/uploads/vid_bucketclip1.mp4') {
      const body = Buffer.alloc(4096, 0x41);
      if (range === 'bytes=2048-') {
        return {
          status: 206,
          headers: { 'content-length': '2048', 'content-range': 'bytes 2048-4095/4096', 'content-type': 'video/mp4' },
          body: Readable.from(body.subarray(2048)),
        };
      }
      return {
        status: 200,
        headers: { 'content-length': '4096', 'content-type': 'video/mp4' },
        body: Readable.from(body),
      };
    }
    if (fileUrl === '/uploads/vid_storedown1.mp4') throw new Error('the endpoint is not answering');
    return null;
  }),
  removeBucketClip: vi.fn(async () => {}),
  hasClipBytes: vi.fn(async () => false),
  localClipPath: vi.fn(() => null),
}));

import * as db from './db.js';
import { bucketMediaFallback, uploadAccessGate } from './mediaAccess.js';

const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'uploads-bucket-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

/** The production chain has the disk before the bucket, so this directory exists and stays empty. */
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-uploads-empty-'));

const OWNER = 'user_owner_bucket';
const OWNED = 'vid_bucketclip1';
const STORE_DOWN = 'vid_storedown1';
/** A row the creator owns whose object does not exist — the answer has to come from the fallback. */
const NO_OBJECT = 'vid_notinbucket1';

let server: Server;
let base = '';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  await db.createVideo({ id: OWNED, user_id: OWNER, title: 'In the bucket', file_url: `/uploads/${OWNED}.mp4` });
  await db.createVideo({ id: STORE_DOWN, user_id: OWNER, title: 'Store down', file_url: `/uploads/${STORE_DOWN}.mp4` });
  await db.createVideo({ id: NO_OBJECT, user_id: OWNER, title: 'No object', file_url: `/uploads/${NO_OBJECT}.mp4` });

  const app = express();
  app.use((req, _res, next) => {
    req.userId = String(req.headers['x-as'] ?? '');
    next();
  });
  app.use('/uploads', uploadAccessGate, express.static(uploadsDir, { acceptRanges: true }), bucketMediaFallback);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

async function get(fileName: string, as = OWNER, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/uploads/${fileName}`, { headers: { 'x-as': as, ...headers } });
  return { status: res.status, headers: res.headers, body: await res.arrayBuffer() };
}

describe('playing a clip whose file is not on this container', () => {
  it('streams it from the bucket for the owner, with the length they need to scrub', async () => {
    const res = await get(`${OWNED}.mp4`);
    expect(res.status).toBe(200);
    expect(res.body.byteLength).toBe(4096);
    expect(res.headers.get('content-length')).toBe('4096');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('passes a range request through instead of answering a seek with the whole file', async () => {
    const res = await get(`${OWNED}.mp4`, OWNER, { range: 'bytes=2048-' });
    expect(res.status).toBe(206);
    expect(res.body.byteLength).toBe(2048);
    expect(res.headers.get('content-range')).toBe('bytes 2048-4095/4096');
  });

  it('will not read the bucket for somebody who does not own the row', async () => {
    reads.calls.length = 0;
    const res = await get(`${OWNED}.mp4`, 'user_someone_else');
    expect(res.status).toBe(404);
    // The gate refusing is what makes this safe; the store must never have been asked at all.
    expect(reads.calls).toEqual([]);
  });

  it('answers 404 for a clip the owner has a row for but the bucket does not hold', async () => {
    reads.calls.length = 0;
    const res = await get(`${NO_OBJECT}.mp4`);
    expect(reads.calls).toEqual([`/uploads/${NO_OBJECT}.mp4`]);
    expect(res.status).toBe(404);
    expect(Buffer.from(res.body).toString()).toMatch(/No clip by that name/);
  });

  it('says the store is unavailable rather than that the clip does not exist', async () => {
    const res = await get(`${STORE_DOWN}.mp4`);
    expect(res.status).toBe(503);
    expect(Buffer.from(res.body).toString()).toMatch(/unavailable/i);
  });
});
