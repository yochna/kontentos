import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as db from './db.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'video-rows');
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

function clip(userId: string, id: string, title = 'Take') {
  return db.createVideo({
    id,
    user_id: userId,
    title,
    file_url: `/uploads/${id}.mp4`,
    duration: 42,
    status: 'ready',
  });
}

describe('counting a creator’s clips', () => {
  it('answers with this account only, and does not read the library', async () => {
    const mine = await freshAccount('counter');
    const other = await freshAccount('counter-neighbour');

    expect(await db.countVideos(mine.id)).toBe(0);
    await clip(mine.id, 'vid_count_a');
    await clip(mine.id, 'vid_count_b');
    await clip(other.id, 'vid_count_c');

    expect(await db.countVideos(mine.id)).toBe(2);
    expect(await db.countVideos(other.id)).toBe(1);
  });
});

describe('updating a clip’s status', () => {
  it('leaves the columns it was not given alone', async () => {
    const account = await freshAccount('status-update');
    const original = await clip(account.id, 'vid_status_keep', 'Original title');

    // The upload routes pass duration through only when the sender declared one, so an absent
    // field used to be written as undefined and then dropped when the store was serialised.
    const updated = await db.updateVideoStatus(
      'vid_status_keep',
      'processing',
      { file_url: undefined, title: undefined },
      account.id
    );

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('processing');
    expect(updated!.file_url).toBe(original.file_url);
    expect(updated!.title).toBe('Original title');
    expect(updated!.duration).toBe(42);

    // The same row on disk, not only the object the call returned.
    expect((await db.listVideos(account.id)).find((v) => v.id === 'vid_status_keep')?.file_url).toBe(
      original.file_url
    );
  });

  it('will not touch a clip belonging to someone else', async () => {
    const owner = await freshAccount('status-owner');
    const intruder = await freshAccount('status-intruder');
    await clip(owner.id, 'vid_status_private');

    expect(await db.updateVideoStatus('vid_status_private', 'ready', { title: 'Mine now' }, intruder.id)).toBeNull();
    expect((await db.listVideos(owner.id)).find((v) => v.id === 'vid_status_private')?.title).toBe('Take');
  });
});

describe('writing a clip row under an id that is already taken', () => {
  it('returns the row that exists instead of growing a second one', async () => {
    const account = await freshAccount('duplicate-id');
    const first = await clip(account.id, 'vid_dup', 'First');

    const again = await clip(account.id, 'vid_dup', 'Second');

    expect(again.id).toBe('vid_dup');
    expect((await db.listVideos(account.id)).filter((v) => v.id === 'vid_dup')).toHaveLength(1);
    expect(again.title).toBe('First');
  });

  it('will not let another account claim the same clip id', async () => {
    const owner = await freshAccount('claim-owner');
    const squatter = await freshAccount('claim-squatter');
    await clip(owner.id, 'vid_taken');

    await expect(clip(squatter.id, 'vid_taken')).rejects.toThrow(/already in use/i);
    expect(await db.listVideos(squatter.id)).toHaveLength(0);
  });
});
