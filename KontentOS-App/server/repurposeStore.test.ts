import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDataDir } from './db.js';
import { createJob, deleteJob, getJob, listJobs, updateClip } from './repurposeStore.js';
import type { RepurposeClip } from './repurposeEngine.js';

// The suite runs against the JSON fallback (vitest.config.ts blanks MONGODB_URI) and each test
// file gets its own directory, because the local store is one whole-file read-modify-write.
// Nothing reads the path at import time, so assigning this here still wins.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kontentos-repurpose-test-'));
process.env.KONTENTOS_DATA_DIR = dataDir;

const OWNER = 'user_owner';
const OTHER = 'user_someone_else';

function clip(overrides: Partial<RepurposeClip> = {}): RepurposeClip {
  return {
    id: 'clip-0-1000',
    start: 1,
    end: 40,
    startLabel: '00:01',
    endLabel: '00:40',
    spanSeconds: 39,
    score: 62,
    title: 'The 42% problem',
    hook: 'Stop publishing first drafts.',
    excerpt: 'Why does most content flop? Stop publishing first drafts.',
    beats: [
      { label: 'Beat 1: The claim', time: '0:00 – 0:13', body: 'Most posts are drafts.' },
      { label: 'Beat 2: The proof', time: '0:13 – 0:26', body: 'Forty posts, three replies.' },
      { label: 'Beat 3: The turn', time: '0:26 – 0:39', body: 'Rewrite only the first line.' },
    ],
    caption: 'The original caption.',
    cardHeadline: 'One line fixed forty posts',
    platform: 'instagram',
    status: 'draft',
    ...overrides,
  };
}

function newJob(userId = OWNER, title = 'Weekly walkthrough') {
  return createJob({
    userId,
    title,
    sourceKind: 'paste',
    videoId: '',
    transcript: 'Why does most content flop? Stop publishing first drafts. Here is the reason it repeats.',
    engineModel: 'local',
    engineSource: 'local',
    clips: [clip(), clip({ id: 'clip-1-5000', start: 5, end: 60, title: 'Second moment' })],
  });
}

beforeEach(() => {
  fs.rmSync(path.join(dataDir, 'kontentos-repurpose.json'), { force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('repurpose store', () => {
  it('writes into the directory the core store already uses', () => {
    expect(localDataDir()).toBe(path.resolve(dataDir));
  });

  it('creates a job and reads it back newest first', async () => {
    const older = await newJob(OWNER, 'Older take');
    const newer = await newJob(OWNER, 'Newer take');

    const jobs = await listJobs(OWNER);
    expect(jobs.map((job) => job.id)).toEqual([newer.id, older.id]);
    expect(jobs[0].clips).toHaveLength(2);
    expect(jobs[0].engineSource).toBe('local');
    expect(jobs[0].createdAt).toBe(jobs[0].updatedAt);

    const single = await getJob(OWNER, older.id);
    expect(single?.title).toBe('Older take');
  });

  it('keeps one creator out of another creator’s jobs', async () => {
    const job = await newJob(OWNER);

    expect(await listJobs(OTHER)).toEqual([]);
    expect(await getJob(OTHER, job.id)).toBeNull();
    expect(await updateClip(OTHER, job.id, 'clip-0-1000', { title: 'hijacked' })).toBeNull();
    expect(await deleteJob(OTHER, job.id)).toBe(false);

    expect((await getJob(OWNER, job.id))?.clips[0].title).toBe('The 42% problem');
  });

  it('applies a partial patch and leaves the fields it was not sent alone', async () => {
    // The clock is moved by hand: on a fast runner a create and a patch can land in the same
    // millisecond, and the timestamp bump this test cares about would look like a failure.
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    const job = await newJob();
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));

    const saved = await updateClip(OWNER, job.id, 'clip-1-5000', { caption: 'Rewritten caption.', status: 'saved' });
    expect(saved?.caption).toBe('Rewritten caption.');
    expect(saved?.status).toBe('saved');

    const reloaded = await getJob(OWNER, job.id);
    const [first, second] = reloaded!.clips;
    expect(second.title).toBe('Second moment');
    expect(second.cardHeadline).toBe('One line fixed forty posts');
    expect(second.beats).toHaveLength(3);
    expect(first.caption).toBe('The original caption.');
    expect(reloaded!.updatedAt).not.toBe(reloaded!.createdAt);
  });

  it('refuses a status it does not know', async () => {
    const job = await newJob();
    const kept = await updateClip(OWNER, job.id, 'clip-0-1000', { status: 'published-everywhere' } as any);
    expect(kept?.status).toBe('draft');
  });

  it('answers null for a clip that is not in the job', async () => {
    const job = await newJob();
    expect(await updateClip(OWNER, job.id, 'clip-99-0', { title: 'ghost' })).toBeNull();
  });

  it('survives concurrent patches to different clips', async () => {
    const job = await newJob();
    await Promise.all([
      updateClip(OWNER, job.id, 'clip-0-1000', { title: 'Edited A' }),
      updateClip(OWNER, job.id, 'clip-1-5000', { title: 'Edited B' }),
      updateClip(OWNER, job.id, 'clip-0-1000', { hook: 'Edited hook' }),
      updateClip(OWNER, job.id, 'clip-1-5000', { cardHeadline: 'Edited card' }),
    ]);

    const [first, second] = (await getJob(OWNER, job.id))!.clips;
    expect(first.title).toBe('Edited A');
    expect(first.hook).toBe('Edited hook');
    expect(second.title).toBe('Edited B');
    expect(second.cardHeadline).toBe('Edited card');
  });

  it('deletes only the job that was asked for', async () => {
    const doomed = await newJob(OWNER, 'Doomed');
    const kept = await newJob(OWNER, 'Kept');

    expect(await deleteJob(OWNER, doomed.id)).toBe(true);
    expect(await getJob(OWNER, doomed.id)).toBeNull();
    expect((await listJobs(OWNER)).map((job) => job.id)).toEqual([kept.id]);
    expect(await deleteJob(OWNER, doomed.id)).toBe(false);
  });

  it('preserves damaged bytes instead of overwriting them', async () => {
    const job = await newJob();
    const file = path.join(dataDir, 'kontentos-repurpose.json');
    fs.writeFileSync(file, '{"clips": [truncated', 'utf-8');

    expect(await listJobs(OWNER)).toEqual([]);

    const backups = fs.readdirSync(dataDir).filter((name) => name.includes('corrupt'));
    expect(backups.length).toBe(1);
    expect(fs.readFileSync(path.join(dataDir, backups[0]), 'utf-8')).toContain('truncated');

    // Recovery: a fresh write still lands, and the damaged copy is still on disk.
    const rebuilt = await newJob();
    expect((await listJobs(OWNER)).map((entry) => entry.id)).toEqual([rebuilt.id]);
    expect(job.id).toBeTruthy();
  });
});
