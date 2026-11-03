import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Which engine the store believes it is running on is the whole subject of this file, so db.js is
// mocked and every case dials it directly. repurposeStore.test.ts covers the JSON fallback itself.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'repurpose-store-bind');
process.env.KONTENTOS_DATA_DIR = dataDir;

/** The dials every case sets before the store looks at them. */
const dbState = vi.hoisted(() => ({
  /** What mongoConnectionForNewEntities() answers: a connection, or null while it is unavailable. */
  connection: null as any,
  /** What storageProvider() answers — 'mongodb' is production, where the disk is not storage. */
  provider: 'local_persistent_json' as 'mongodb' | 'local_persistent_json',
}));

vi.mock('./db.js', () => ({
  localDataDir: () => dataDir,
  mongoConnectionForNewEntities: async () => dbState.connection,
  storageProvider: () => dbState.provider,
}));

const CLIP = { id: 'cut_1', start: 0, end: 12, title: 'A hook', beats: [] };

/** A model that records its own writes, so a test can see which store was actually used. */
function fakeModel(): any {
  const calls: string[] = [];
  return {
    calls,
    create: async (job: any) => {
      calls.push(`create:${job.id}`);
      return { ...job, _id: 'oid' };
    },
    find: () => ({ sort: () => ({ lean: async () => [] }) }),
    findOne: () => ({ lean: async () => null }),
    updateOne: async () => ({ acknowledged: true }),
    deleteOne: async () => ({ deletedCount: 0 }),
  };
}

// Imported after the mock is in place, so the store binds to the dials above.
const loadStore = () => import('./repurposeStore.js');

beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  dbState.connection = null;
  dbState.provider = 'local_persistent_json';
  // The bind lives in module state, so every case needs a freshly evaluated module.
  vi.resetModules();
});

function localJobs(): any[] {
  const file = path.join(dataDir, 'kontentos-repurpose.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

const jobInput = (overrides: Record<string, unknown> = {}) => ({
  userId: 'user_bind',
  title: 'Weekly walkthrough',
  sourceKind: 'paste' as const,
  videoId: '',
  transcript: 'Why does most content flop? Stop publishing first drafts.',
  engineModel: 'local',
  engineSource: 'local' as const,
  clips: [CLIP] as any,
  ...overrides,
});

describe('the repurpose store with no database configured', () => {
  it('keeps jobs in the local file, which is the storage by design', async () => {
    const store = await loadStore();
    const job = await store.createJob(jobInput());

    expect(localJobs().map((j) => j.id)).toContain(job.id);
    expect(await store.getJob('user_bind', job.id)).not.toBeNull();
  });
});

describe('the repurpose store on a MongoDB-backed deployment', () => {
  it('refuses to save where the next redeploy would delete it', async () => {
    dbState.provider = 'mongodb';
    const store = await loadStore();

    await expect(store.createJob(jobInput())).rejects.toThrow(/nothing was saved/i);

    // The point of the refusal: not one byte about this job reached the container's disk.
    expect(localJobs()).toEqual([]);
  });

  it('binds to the database as soon as the connection comes back', async () => {
    // The regression this file exists for. The first call found no connection; a store that
    // remembered that answer would keep serving every later call from local JSON, and the jobs
    // would go with the disk on the next redeploy without ever telling anybody.
    const store = await loadStore();
    dbState.provider = 'mongodb';
    await expect(store.listJobs('user_bind')).rejects.toThrow(/nothing was saved/i);

    const model = fakeModel();
    dbState.connection = { models: { RepurposeJob: model } };

    expect(await store.listJobs('user_bind')).toEqual([]);

    await store.createJob(jobInput({ sourceKind: 'video', videoId: 'vid_abc123', engineModel: 'gemini' }));

    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toMatch(/^create:/);
    expect(localJobs()).toEqual([]);
  });

  it('tries again after a bind that threw instead of answering null', async () => {
    dbState.provider = 'mongodb';
    const store = await loadStore();

    // A connection that rejects must not be remembered either — the same one-hiccup lock.
    dbState.connection = Promise.reject(new Error('ECONNREFUSED')) as any;
    await expect(store.listJobs('user_bind')).rejects.toThrow(/ECONNREFUSED/);

    const model = fakeModel();
    dbState.connection = { models: { RepurposeJob: model } };
    expect(await store.listJobs('user_bind')).toEqual([]);
  });

  it('reads jobs from the database, not from the file', async () => {
    const model = fakeModel();
    model.find = () => ({
      sort: () => ({
        lean: async () => [
          { _id: 'oid', id: 'rj_existing', userId: 'user_bind', title: 'From Mongo', clips: [CLIP] },
        ],
      }),
    });
    dbState.provider = 'mongodb';
    dbState.connection = { models: { RepurposeJob: model } };

    const store = await loadStore();
    const jobs = await store.listJobs('user_bind');

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('From Mongo');
    expect((jobs[0] as any)._id).toBeUndefined();
  });
});
