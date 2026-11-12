import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pressSteps } from '../src/lib/press.js';
import type { PressProgress } from './pressStore.js';

const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'press-store');
process.env.KONTENTOS_DATA_DIR = dataDir;

const input = {
  userId: 'press-owner',
  styleId: 'hook' as const,
  sourceVideoId: 'source-video',
  sourceTitle: 'Source take',
  plan: {
    span: { start: 10, end: 40 },
    duration: 30,
    targetAspect: '9:16' as const,
    source: { videoId: 'source-video', fileUrl: '/uploads/source.mp4', fileSize: 100, duration: 60 },
    shortened: false,
  },
};

beforeEach(() => {
  vi.resetModules();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('atomic Press progress in the real local store', () => {
  it.each([
    ['reel-first', 'done'],
    ['writing-first', 'done'],
    ['reel-first', 'failed'],
    ['writing-first', 'failed'],
  ] as const)('preserves both writers with %s and reel %s', async (order, reelState) => {
    const store = await import('./pressStore.js');
    const job = await store.createJob(input);
    const reel: PressProgress = {
      steps: [{ id: 'reel', state: reelState, detail: reelState === 'done' ? 'Encoded' : '$encoder failed' }],
      ...(reelState === 'done' ? {
        bundle: { clipVideoId: 'encoded-clip', fileUrl: '/uploads/reel.mp4', duration: 29, bytes: 321 },
      } : {}),
    };
    const writing: PressProgress = {
      steps: [
        { id: 'captions', state: 'done', detail: 'Caption files ready' },
        { id: 'copy', state: 'done', detail: 'Copy ready' },
        { id: 'deck', state: 'failed', detail: 'No copy engine answered' },
      ],
      bundle: {
        title: '$a literal title', hook: 'The hook', caption: 'The post',
        srt: 'Span SRT', vtt: 'Span VTT', deck: null, engineModel: 'local', engineSource: 'local',
      },
    };
    const changes = order === 'reel-first' ? [reel, writing] : [writing, reel];

    // Both calls enter before either write completes; queue order fixes the interleaving without timers.
    const [first, second] = await Promise.all(changes.map((change) => store.patchJob(input.userId, job.id, change)));
    expect(first?.steps.find((step) => step.id === (order === 'reel-first' ? 'copy' : 'reel'))?.state).toBe('waiting');
    expect(first?.status).toBe(order === 'reel-first' && reelState === 'failed' ? 'failed' : 'running');
    expect(second?.status).toBe(reelState === 'failed' ? 'failed' : 'complete');
    expect(second?.error).toBe(reelState === 'failed' ? '$encoder failed' : '');
    expect(second?.steps).toEqual(pressSteps().map((step) => ({
      ...step,
      ...[...reel.steps!, ...writing.steps!].find((change) => change.id === step.id),
    })));
    expect(second?.bundle).toEqual({
      clipVideoId: '', fileUrl: '', bytes: 0,
      aspectRatio: input.plan.targetAspect, duration: input.plan.duration, span: input.plan.span,
      ...writing.bundle,
      ...reel.bundle,
    });
    expect(await store.getJob(input.userId, job.id)).toEqual(second);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'kontentos-press.json'), 'utf8'))).toEqual([second]);

    const updated = await store.patchJob(input.userId, job.id, {
      steps: [{ id: 'copy', state: 'running', detail: 'Rewriting' }],
    });
    expect(updated?.status).toBe(reelState === 'failed' ? 'failed' : 'running');
    expect(updated?.error).toBe(second?.error);
    expect(updated?.bundle).toEqual(second?.bundle);
    const finished = await store.patchJob(input.userId, job.id, {
      steps: [{ id: 'copy', state: 'done', detail: 'Rewritten' }], bundle: { title: 'Revised title' },
    });
    expect(finished?.status).toBe(second?.status);
    expect(finished?.error).toBe(second?.error);
    expect(finished?.bundle).toEqual({ ...second?.bundle, title: 'Revised title' });
  });

  it('does not patch another owner or recreate a deleted job', async () => {
    const store = await import('./pressStore.js');
    const job = await store.createJob(input);
    const change: PressProgress = { steps: [{ id: 'reel', state: 'failed', detail: 'Not yours' }] };
    expect(await store.patchJob('other-owner', job.id, change)).toBeNull();
    expect(await store.getJob(input.userId, job.id)).toEqual(job);
    await store.deleteJob(input.userId, job.id);
    expect(await store.patchJob(input.userId, job.id, change)).toBeNull();
    expect(await store.listJobs(input.userId)).toEqual([]);
  });
});

describe('Mongo Press update shape', () => {
  it('merges and derives status in one tenant-scoped pipeline without a snapshot read', async () => {
    const db = await import('./db.js');
    const doc = { _id: 'mongo-id', id: 'press-id', userId: input.userId };
    const model = {
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(() => ({ lean: async () => doc })),
    };
    vi.spyOn(db, 'mongoConnectionForNewEntities').mockResolvedValue({ models: { PressJob: model } } as any);
    const store = await import('./pressStore.js');
    const changes: PressProgress = {
      steps: [{ id: 'reel', state: 'failed', detail: '$literal error' }],
      bundle: { title: '$literal title', deck: { slides: [], socialCaption: '$literal caption', modelUsed: 'test' } },
    };

    expect(await store.patchJob(input.userId, 'press-id', changes)).toEqual({ id: 'press-id', userId: input.userId });
    expect(model.findOne).not.toHaveBeenCalled();
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, pipeline, options] = (model.findOneAndUpdate.mock.calls as unknown as any[][])[0];
    expect(filter).toEqual({ id: 'press-id', userId: input.userId });
    expect(options).toMatchObject({ new: true, lean: true });
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0].$set.steps).toEqual({
      $map: {
        input: '$steps', as: 'step',
        in: {
          $mergeObjects: ['$$step', {
            $arrayElemAt: [{
              $filter: { input: { $literal: changes.steps }, cond: { $eq: ['$$this.id', '$$step.id'] } },
            }, 0],
          }],
        },
      },
    });
    expect(pipeline[0].$set.bundle.$mergeObjects).toEqual([
      expect.objectContaining({ aspectRatio: '$plan.targetAspect', duration: '$plan.duration', span: '$plan.span' }),
      '$bundle',
      { $literal: changes.bundle },
    ]);
    const reel = { $arrayElemAt: [{ $filter: { input: '$steps', cond: { $eq: ['$$this.id', 'reel'] } } }, 0] };
    const failed = { $eq: ['$$reel.state', 'failed'] };
    expect(pipeline[1].$set.status).toEqual({
      $let: {
        vars: { reel },
        in: { $cond: [failed, 'failed', {
          $cond: [{
            $anyElementTrue: [{ $map: { input: '$steps', in: { $in: ['$$this.state', ['waiting', 'running']] } } }],
          }, 'running', 'complete'],
        }] },
      },
    });
    expect(pipeline[1].$set.error).toEqual({
      $let: { vars: { reel }, in: { $cond: [failed, '$$reel.detail', ''] } },
    });
    expect(pipeline[1].$set.updatedAt).toEqual(expect.any(String));
    expect(fs.existsSync(path.join(dataDir, 'kontentos-press.json'))).toBe(false);
  });
});
