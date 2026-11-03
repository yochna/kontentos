import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as db from './db.js';
import { asId, isPlainJson } from './safeId.js';
import transcribeRouter from './routes/transcribe';

// The storage layer is the choke point: a route that forgets to coerce still cannot build an
// operator query, because nothing below asId() accepts a non-string as an identifier.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'safe-id');
process.env.KONTENTOS_DATA_DIR = dataDir;

let server: Server;
let base = '';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.GEMINI_API_KEY = '';

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'user_probe';
    next();
  });
  app.use('/api/transcribe', transcribeRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

describe('asId', () => {
  it('keeps text and throws away anything that is not text', () => {
    expect(asId('vid_0f9c1a2b')).toBe('vid_0f9c1a2b');
    for (const junk of [undefined, null, 42, true, {}, [], { $ne: null }, new Date()]) {
      expect(asId(junk as any)).toBe('');
    }
  });

  it('refuses an id long enough to be a payload rather than a name', () => {
    expect(asId('x'.repeat(201))).toBe('');
  });
});

describe('isPlainJson', () => {
  it('accepts an idea as the browser writes it', () => {
    expect(isPlainJson({ id: 'scaffold-1-1730', title: 'A hook', tags: ['x'], score: 3 })).toBe(true);
  });

  it('refuses keys MongoDB would read as an operator or a path', () => {
    expect(isPlainJson({ id: 'a', $where: 'sleep(5)' })).toBe(false);
    expect(isPlainJson({ id: 'a', nested: { 'x.y': 1 } })).toBe(false);
    expect(isPlainJson({ id: 'a', nested: { deeper: { $set: { admin: true } } } })).toBe(false);
    expect(isPlainJson({ id: 'a', fn: () => 1 })).toBe(false);
  });
});

describe('the storage layer with an operator object in place of an id', () => {
  it('finds nothing rather than the first row in the collection', async () => {
    const owner = await db.createAccount({
      email: 'injection-owner@example.test',
      full_name: 'Owner',
      password_hash: await db.hashPassword('a-long-enough-passphrase'),
    });
    const clip = await db.createVideo({ user_id: owner.id, title: 'Private take' });
    await db.saveSubtitles(
      { video_id: clip.id, srt_content: 'the real cues', vtt_content: '', transcript_text: 'the real cues', segments: [] } as any,
      owner.id,
    );

    const operator = { $exists: true };
    expect(await db.getVideo(operator as any, owner.id)).toBeNull();
    expect(await db.getSubtitles(operator as any, owner.id)).toBeNull();
    expect(await db.getCaption(operator as any, 'instagram', owner.id)).toBeNull();
    expect(await db.deleteVideo(operator as any, owner.id)).toBe(false);
    expect(await db.getScheduledPost(operator as any, owner.id)).toBeNull();
    expect(await db.deletePublishingRecord(operator as any, owner.id)).toBe(false);

    // A real id still works, so the guard is about type, not about blocking the route entirely.
    expect((await db.getSubtitles(clip.id, owner.id))?.transcript_text).toBe('the real cues');

    const written = await db.saveSubtitles(
      { video_id: operator as any, srt_content: 'x', vtt_content: 'x', transcript_text: 'x', segments: [] } as any,
      owner.id,
    );
    expect(written).toBeNull();
  });

  it('will not store an idea whose payload carries a $ key', async () => {
    const owner = await db.createAccount({
      email: 'idea-injection@example.test',
      full_name: 'Owner',
      password_hash: await db.hashPassword('a-long-enough-passphrase'),
    });
    await db.saveSavedIdea(owner.id, { id: 'good-1', title: 'kept' });
    await db.saveSavedIdea(owner.id, { id: 'bad-1', $set: { admin: true } });
    const rows = await db.listSavedIdeas(owner.id);
    expect(rows.map((r) => r.id)).toEqual(['good-1']);
  });
});

describe('the transcribe route with an operator object in place of videoId', () => {
  it('answers with a refusal, not a crash or somebody else’s cues', async () => {
    const res = await fetch(`${base}/api/transcribe/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: { $exists: true }, transcriptText: 'injected' }),
    });
    expect(res.status).toBe(400);

    const download = await fetch(`${base}/api/transcribe/${encodeURIComponent('{"$exists":true}')}/download/srt`);
    expect(download.status).toBe(404);
  });
});

describe('a profile write', () => {
  it('takes the text it recognises and refuses to store anything else', async () => {
    const owner = await db.createAccount({
      email: 'profile-owner@example.test',
      full_name: 'Before',
      password_hash: await db.hashPassword('a-long-enough-passphrase'),
    });

    const updated = await db.updateUserProfile(owner.id, {
      full_name: 'After',
      niche: 'documentaries',
      // A credential the app never reads back, and a hash: neither belongs to this route.
      instagram_token: 'IGQVJ…token',
      password_hash: 'attacker-hash',
      // An operator object where a name should be.
      locale: { $ne: null },
    } as any);

    expect(updated?.full_name).toBe('After');
    expect(updated?.niche).toBe('documentaries');
    expect(updated?.password_hash).not.toBe('attacker-hash');
    expect((updated as any)?.instagram_token).toBeUndefined();

    // What actually landed in the store, not just what the call returned.
    const stored = await db.getAccountById(owner.id);
    expect(stored?.password_hash).not.toBe('attacker-hash');
    expect(JSON.stringify(stored)).not.toContain('IGQVJ');
    expect((stored as any)?.locale).toBeUndefined();

    // Reading it back as the browser would: nothing secret survives the trip.
    expect(JSON.stringify(db.publicUser(stored))).not.toMatch(/password_hash|instagram_token|\$ne/);
  });
});
