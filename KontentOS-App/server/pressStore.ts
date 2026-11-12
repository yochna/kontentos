import { Schema, type Model } from 'mongoose';
import fs from 'fs';
import path from 'path';
import { localDataDir, mongoConnectionForNewEntities, storageProvider } from './db.js';
import { pressSteps, type PressBundle, type PressJob, type PressStep } from '../src/lib/press.js';

export interface PressProgress {
  steps?: Pick<PressStep, 'id' | 'state' | 'detail'>[];
  bundle?: Partial<PressBundle>;
}

const bundleDefaults = {
  clipVideoId: '',
  fileUrl: '',
  bytes: 0,
  title: '',
  hook: '',
  caption: '',
  srt: '',
  vtt: '',
  deck: null,
  engineModel: 'none',
  engineSource: 'local' as const,
};

function pressStatus(steps: PressStep[]): PressJob['status'] {
  // Missing copy or deck must not hide a successfully encoded reel.
  if (steps.find((step) => step.id === 'reel')?.state === 'failed') return 'failed';
  return steps.some((step) => step.state === 'running' || step.state === 'waiting') ? 'running' : 'complete';
}

function nowIso(): string {
  return new Date().toISOString();
}

function newPressId(): string {
  return `ps_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

let jobModel: Promise<Model<any> | null> | null = null;

// Retry failed binds rather than pinning a Mongo deployment to ephemeral local storage.
function mongoJobModel(): Promise<Model<any> | null> {
  if (!jobModel) {
    const bind = bindModel();
    jobModel = bind.then(
      (model) => {
        if (!model) jobModel = null;
        return model;
      },
      (err) => {
        jobModel = null;
        throw err;
      }
    );
  }
  return jobModel;
}

async function bindModel(): Promise<Model<any> | null> {
  const conn = await mongoConnectionForNewEntities();
  if (!conn) return null;

  const existing = (conn as any).models?.PressJob as Model<any> | undefined;
  if (existing) return existing;

  const stepSchema = new Schema({ id: String, label: String, state: String, detail: String }, { _id: false });
  const jobSchema = new Schema(
    {
      id: { type: String, required: true },
      userId: { type: String, required: true },
      styleId: String,
      sourceVideoId: String,
      sourceTitle: String,
      createdAt: String,
      updatedAt: String,
      status: String,
      steps: [stepSchema],
      plan: Object,
      bundle: Object,
      error: String,
    },
    { versionKey: false, strict: false }
  );
  jobSchema.index({ id: 1 }, { unique: true });
  jobSchema.index({ userId: 1, createdAt: -1 });
  const model = conn.model('PressJob', jobSchema, 'press_jobs');
  try {
    await model.syncIndexes();
  } catch (err: any) {
    // Duplicate rows from an earlier build would reject the unique index. Reads and writes still
    // work, so keep serving rather than calling the database down.
    console.warn('⚠️ Press job indexes could not be synchronised:', err?.message || err);
  }
  return model;
}

// A Mongo outage must not silently redirect durable jobs onto local disk.
async function modelOrRefuse(): Promise<Model<any> | null> {
  const model = await mongoJobModel();
  if (!model && storageProvider() === 'mongodb') {
    throw new Error('The workspace store is unreachable, so the press was not saved. Try again in a moment.');
  }
  return model;
}

const strip = (doc: any): PressJob => {
  const { _id, __v, ...rest } = doc;
  return rest as PressJob;
};

// ==========================================
// Local JSON fallback
// ==========================================

function localFile(): string {
  return path.join(localDataDir(), 'kontentos-press.json');
}

function readLocalJobs(): PressJob[] {
  const file = localFile();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Unreadable bytes stay on disk so the presses remain recoverable; serving empty beats deleting them.
    try {
      const dir = path.dirname(file);
      const base = path.basename(file);
      const preserved = fs.readdirSync(dir).find((name) => name.startsWith(`${base}.corrupt-`));
      if (preserved) {
        console.error(`Press store is still unreadable; the damaged copy remains at ${preserved}:`, err);
      } else {
        const backup = `${file}.corrupt-${Date.now()}.json`;
        fs.copyFileSync(file, backup);
        console.error(`Press store unreadable; damaged copy preserved at ${backup}:`, err);
      }
    } catch {
      console.error('Press store is unreadable and the damaged copy could not be preserved:', err);
    }
    return [];
  }
}

function writeLocalJobs(jobs: PressJob[]): void {
  const file = localFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Sibling temp file then rename: rename is atomic, so a crash mid-write leaves the previous good
  // store intact instead of a truncated one.
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* the temp file is not the problem worth masking */
    }
    throw new Error('Could not persist the press store');
  }
}

/** Local writes read-mutate-write, so every mutation is chained onto one promise. */
let localQueue: Promise<void> = Promise.resolve();

function withLocalJobs<T>(mutate: (jobs: PressJob[]) => T): Promise<T> {
  const run = localQueue.then(() => {
    const jobs = readLocalJobs();
    const result = mutate(jobs);
    writeLocalJobs(jobs);
    return result;
  });
  localQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// ==========================================
// Public API
// ==========================================

export async function listJobs(userId: string): Promise<PressJob[]> {
  const model = await modelOrRefuse();
  if (model) return (await model.find({ userId }).sort({ createdAt: -1 }).lean()).map(strip);
  return readLocalJobs()
    .filter((job) => job.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getJob(userId: string, jobId: string): Promise<PressJob | null> {
  const model = await modelOrRefuse();
  if (model) {
    const doc = await model.findOne({ id: jobId, userId }).lean();
    return doc ? strip(doc) : null;
  }
  return readLocalJobs().find((job) => job.id === jobId && job.userId === userId) || null;
}

export async function createJob(
  input: Omit<PressJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'steps' | 'bundle' | 'error'> & {
    steps?: PressStep[];
    bundle?: PressJob['bundle'];
  }
): Promise<PressJob> {
  const stamp = nowIso();
  const job: PressJob = {
    id: newPressId(),
    userId: input.userId,
    styleId: input.styleId,
    sourceVideoId: input.sourceVideoId,
    sourceTitle: input.sourceTitle,
    plan: input.plan,
    createdAt: stamp,
    updatedAt: stamp,
    status: 'running',
    steps: input.steps ?? pressSteps(),
    bundle: input.bundle ?? null,
    error: '',
  };

  const model = await modelOrRefuse();
  if (model) {
    await model.create(job);
    return job;
  }
  return withLocalJobs((jobs) => {
    jobs.unshift(job);
    return job;
  });
}

export async function patchJob(
  userId: string,
  jobId: string,
  changes: PressProgress
): Promise<PressJob | null> {
  const model = await modelOrRefuse();
  if (model) {
    const reel = { $arrayElemAt: [{ $filter: { input: '$steps', cond: { $eq: ['$$this.id', 'reel'] } } }, 0] };
    const failed = { $eq: ['$$reel.state', 'failed'] };
    // The second stage derives status from the merged steps, inside the same atomic update.
    const pipeline = [
      {
        $set: {
          steps: {
            $map: {
              input: '$steps',
              as: 'step',
              in: {
                $mergeObjects: [
                  '$$step',
                  {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $literal: changes.steps ?? [] },
                          cond: { $eq: ['$$this.id', '$$step.id'] },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            },
          },
          ...(changes.bundle ? {
            bundle: {
              $mergeObjects: [
                {
                  ...bundleDefaults,
                  aspectRatio: '$plan.targetAspect',
                  duration: '$plan.duration',
                  span: '$plan.span',
                },
                '$bundle',
                { $literal: changes.bundle },
              ],
            },
          } : {}),
        },
      },
      {
        $set: {
          status: {
            $let: {
              vars: { reel },
              in: {
                $cond: [failed, 'failed', {
                  $cond: [
                    {
                      $anyElementTrue: [{
                        $map: { input: '$steps', in: { $in: ['$$this.state', ['waiting', 'running']] } },
                      }],
                    },
                    'running',
                    'complete',
                  ],
                }],
              },
            },
          },
          error: { $let: { vars: { reel }, in: { $cond: [failed, '$$reel.detail', ''] } } },
          updatedAt: nowIso(),
        },
      },
    ];
    const doc = await model
      .findOneAndUpdate({ id: jobId, userId }, pipeline, { new: true, lean: true })
      .lean();
    return doc ? strip(doc) : null;
  }

  return withLocalJobs((jobs) => {
    const job = jobs.find((entry) => entry.id === jobId && entry.userId === userId);
    if (!job) return null;
    // Merge only after entering the queue; a snapshot read before it can already be stale.
    job.steps = job.steps.map((step) => {
      const change = changes.steps?.find((next) => next.id === step.id);
      return change ? { ...step, ...change } : step;
    });
    if (changes.bundle) {
      job.bundle = {
        ...bundleDefaults,
        aspectRatio: job.plan.targetAspect,
        duration: job.plan.duration,
        span: job.plan.span,
        ...job.bundle,
        ...changes.bundle,
      };
    }
    const reel = job.steps.find((step) => step.id === 'reel');
    job.status = pressStatus(job.steps);
    job.error = reel?.state === 'failed' ? reel.detail : '';
    job.updatedAt = nowIso();
    return job;
  });
}

export async function deleteJob(userId: string, jobId: string): Promise<boolean> {
  const model = await modelOrRefuse();
  if (model) {
    const result = await model.deleteOne({ id: jobId, userId });
    return result.deletedCount > 0;
  }
  return withLocalJobs((jobs) => {
    const size = jobs.length;
    const kept = jobs.filter((job) => !(job.id === jobId && job.userId === userId));
    if (kept.length === size) return false;
    jobs.length = 0;
    jobs.push(...kept);
    return true;
  });
}
