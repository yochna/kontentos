import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as db from './db.js';

// The suite runs against the JSON store (vitest.config.ts blanks MONGODB_URI), and each test
// file gets its own directory because the local store is one whole-file read-modify-write.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'tenant');
process.env.KONTENTOS_DATA_DIR = dataDir;

beforeAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

async function freshAccount(tag: string) {
  return db.createAccount({
    email: `${tag}@example.test`,
    full_name: `Creator ${tag}`,
    password_hash: await db.hashPassword('a-long-enough-passphrase'),
  });
}

describe('storage backend', () => {
  it('is the local JSON store, not a live Atlas connection', () => {
    expect(db.storageProvider()).toBe('local_persistent_json');
    expect(db.isMongoConnected()).toBe(false);
  });

  it('persists the store into the scratch directory, not the repo working tree', async () => {
    await freshAccount('storage-probe');
    const file = path.join(dataDir, 'kontentos-db.json');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toContain('storage-probe@example.test');
  });
});

describe('password and session primitives', () => {
  it('verifies the right passphrase and rejects everything else', async () => {
    const hash = await db.hashPassword('correct-horse-battery');
    expect(hash).not.toContain('correct-horse-battery');
    expect(await db.verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await db.verifyPassword('Correct-horse-battery', hash)).toBe(false);
    expect(await db.verifyPassword('', hash)).toBe(false);
  });

  it('never verifies against the timing dummy hash', async () => {
    const dummy = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`;
    expect(await db.verifyPassword('anything', dummy)).toBe(false);
  });

  it('resolves a session token once and forgets it after logout', async () => {
    const account = await freshAccount('session');
    const token = db.newSessionToken();
    const tokenHash = db.hashSessionToken(token);
    await db.createSession(tokenHash, account.id, 3600);
    expect(await db.resolveSession(tokenHash)).toBe(account.id);
    await db.deleteSession(tokenHash);
    expect(await db.resolveSession(tokenHash)).toBeNull();
    expect(await db.resolveSession(db.hashSessionToken(db.newSessionToken()))).toBeNull();
  });

  it('does not leak the password hash through publicUser', () => {
    const safe = db.publicUser({
      id: 'u1',
      email: 'a@b.test',
      full_name: 'A B',
      password_hash: 'scrypt$secret',
    } as any);
    expect(safe).not.toHaveProperty('password_hash');
    expect(db.publicUser(null)).toBeNull();
  });
});

describe('tenant scoping', () => {
  it('hides one creator’s clip from another, by id and by listing', async () => {
    const owner = await freshAccount('owner');
    const intruder = await freshAccount('intruder');
    const clip = await db.createVideo({ user_id: owner.id, title: 'My raw footage', duration: 12 });

    expect(await db.getVideo(clip.id, owner.id)).not.toBeNull();
    expect(await db.getVideo(clip.id, intruder.id)).toBeNull();
    expect((await db.listVideos(intruder.id)).map((v) => v.id)).not.toContain(clip.id);
    expect(await db.deleteVideo(clip.id, intruder.id)).toBe(false);
    expect(await db.getVideo(clip.id, owner.id)).not.toBeNull();
    expect(await db.deleteVideo(clip.id, owner.id)).toBe(true);
    expect(await db.getVideo(clip.id, owner.id)).toBeNull();
  });

  it('refuses to record a publish against a clip the creator does not own', async () => {
    const owner = await freshAccount('pub-owner');
    const other = await freshAccount('pub-other');
    const clip = await db.createVideo({ user_id: owner.id, title: 'Reel' });

    expect(await db.recordPublish({ video_id: clip.id, platform: 'instagram', status: 'saved' }, other.id)).toBeNull();

    const mine = await db.recordPublish({ video_id: clip.id, platform: 'instagram', status: 'saved' }, owner.id);
    expect(mine).not.toBeNull();
    // Nothing was uploaded anywhere yet, so there is no platform id and no permalink to store.
    expect(mine!.platform_post_id).toBe('');
    expect(mine!.url).toBe('');

    const rows = await db.listPublishingHistory(owner.id);
    expect(rows.map((r) => r.id)).toContain(mine!.id);
    expect(await db.listPublishingHistory(other.id)).toHaveLength(0);
  });

  it('keeps saved ideas, captions and schedules per account', async () => {
    const a = await freshAccount('idea-a');
    const b = await freshAccount('idea-b');
    const clip = await db.createVideo({ user_id: a.id, title: 'Shared-looking title' });

    await db.saveCaption(
      { video_id: clip.id, platform: 'instagram', caption_text: 'the real caption', hashtags: ['#a'] } as any,
      a.id,
    );
    await db.saveSavedIdea(a.id, { id: 'idea-1', title: 'private idea', excerpt: 'x' });
    const scheduled = await db.createScheduledPost({
      user_id: a.id,
      video_id: clip.id,
      platform: 'tiktok',
      scheduled_at: '2026-11-01T10:00:00.000Z',
    } as any);

    expect((await db.getCaption(clip.id, 'instagram', a.id))?.caption_text).toBe('the real caption');
    expect(await db.getCaption(clip.id, 'instagram', b.id)).toBeNull();
    expect(await db.listSavedIdeas(b.id)).toHaveLength(0);
    expect(await db.listSavedIdeas(a.id)).toHaveLength(1);
    expect(await db.listScheduledPosts(b.id)).toHaveLength(0);
    expect(await db.getScheduledPost(scheduled!.id, b.id)).toBeNull();
    expect(await db.deleteScheduledPost(scheduled!.id, b.id)).toBe(false);
    expect(await db.deleteSavedIdea(b.id, 'idea-1')).toHaveLength(0);
  });

  it('rejects a duplicate email and normalises the stored one', async () => {
    await freshAccount('dup');
    await expect(
      db.createAccount({ email: 'DUP@Example.test', full_name: 'Case test', password_hash: 'x' }),
    ).rejects.toBeInstanceOf(db.EmailAlreadyRegistered);
  });
});
