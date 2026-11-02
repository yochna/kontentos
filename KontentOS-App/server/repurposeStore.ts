import { Schema, type Model } from 'mongoose';
import fs from 'fs';
import path from 'path';
import { localDataDir, mongoConnectionForNewEntities } from './db.js';
import type { RepurposeClip } from './repurposeEngine.js';

/**
 * Storage for Studio repurpose jobs. One shape all the way through: the engine result, the stored
 * document and the API response are the same object. That is why the fields are camelCase instead
 * of the snake_case the eight core collections use — those were built around an older API, and
 * adding a conversion layer here would only be a place for the two shapes to drift apart.
 */
export interface RepurposeJob {
  id: string;
  userId: string;
  title: string;
  sourceKind: 'video' | 'paste';
  videoId: string;
  transcript: string;
  createdAt: string;
  updatedAt: string;
  engineModel: string;
  engineSource: 'engine' | 'local';
  clips: RepurposeClip[];
}

export type ClipChanges = Partial<
  Pick<RepurposeClip, 'title' | 'hook' | 'caption' | 'cardHeadline' | 'status' | 'platform'>
>;

/** Anything else arriving from the client is ignored — see applyClipChanges. */
const CLIP_FIELDS = ['title', 'hook', 'caption', 'cardHeadline', 'status', 'platform'] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function newJobId(): string {
  return `rj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ==========================================
// MongoDB
// ==========================================

let jobModel: Promise<Model<any> | null> | null = null;

/** The model is bound lazily, so a server without MONGODB_URI never pays for a failed connect. */
function mongoJobModel(): Promise<Model<any> | null> {
  if (!jobModel) {
    jobModel = (async () => {
      const conn = await mongoConnectionForNewEntities();
      if (!conn) return null;
      const existing = (conn as any).models?.RepurposeJob as Model<any> | undefined;
      if (existing) return existing;

      const beatSchema = new Schema({ label: String, time: String, body: String }, { _id: false });
      const clipSchema = new Schema(
        {
          id: String,
          start: Number,
          end: Number,
          startLabel: String,
          endLabel: String,
          spanSeconds: Number,
          score: Number,
          title: String,
          hook: String,
          excerpt: String,
          beats: [beatSchema],
          caption: String,
          cardHeadline: String,
          platform: String,
          status: String,
        },
        { _id: false },
      );
      const jobSchema = new Schema(
        {
          id: { type: String, required: true },
          userId: { type: String, required: true },
          title: String,
          sourceKind: String,
          videoId: String,
          transcript: String,
          createdAt: String,
          updatedAt: String,
          engineModel: String,
          engineSource: String,
          clips: [clipSchema],
        },
        { versionKey: false, strict: false },
      );
      jobSchema.index({ id: 1 }, { unique: true });
      jobSchema.index({ userId: 1, createdAt: -1 });
      const model = conn.model('RepurposeJob', jobSchema, 'repurpose_jobs');
      try {
        await model.syncIndexes();
      } catch (err: any) {
        // Duplicate rows from an earlier build would reject the unique index. Reads and writes
        // still work, so keep serving rather than calling the database down.
        console.warn('⚠️ Repurpose job indexes could not be synchronised:', err?.message || err);
      }
      return model;
    })();
  }
  return jobModel;
}

const strip = (doc: any): RepurposeJob => {
  const { _id, __v, ...rest } = doc;
  return rest as RepurposeJob;
};

// ==========================================
// Local JSON fallback
// ==========================================

function localFile(): string {
  return path.join(localDataDir(), 'kontentos-repurpose.json');
}

function readLocalJobs(): RepurposeJob[] {
  const file = localFile();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Unreadable bytes stay on disk so the jobs remain recoverable; serving empty beats deleting them.
    try {
      const dir = path.dirname(file);
      const base = path.basename(file);
      // One preserved copy per damaged file — every later read of the same damage would otherwise
      // add another copy to a free-tier disk that has very little room.
      const preserved = fs.readdirSync(dir).find((name) => name.startsWith(`${base}.corrupt-`));
      if (preserved) {
        console.error(`Repurpose store is still unreadable; the damaged copy remains at ${preserved}:`, err);
      } else {
        const backup = `${file}.corrupt-${Date.now()}.json`;
        fs.copyFileSync(file, backup);
        console.error(`Repurpose store unreadable; damaged copy preserved at ${backup}:`, err);
      }
    } catch {
      console.error('Repurpose store is unreadable and the damaged copy could not be preserved:', err);
    }
    return [];
  }
}

function writeLocalJobs(jobs: RepurposeJob[]): void {
  const file = localFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Sibling temp file then rename: rename is atomic on Linux and Windows, so a crash mid-write
  // leaves the previous good store intact instead of a truncated one.
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch { /* the temp file is not the problem worth masking */ }
    throw new Error('Could not persist the repurpose store');
  }
}

/**
 * Local writes read-mutate-write, so concurrent requests would clobber each other. Chaining every
 * mutation onto one promise makes the store behave like a single-threaded transaction log.
 */
let localQueue: Promise<void> = Promise.resolve();

function withLocalJobs<T>(mutate: (jobs: RepurposeJob[]) => T): Promise<T> {
  const run = localQueue.then(() => {
    const jobs = readLocalJobs();
    const result = mutate(jobs);
    writeLocalJobs(jobs);
    return result;
  });
  localQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ==========================================
// Public API
// ==========================================

export async function listJobs(userId: string): Promise<RepurposeJob[]> {
  const model = await mongoJobModel();
  if (model) return (await model.find({ userId }).sort({ createdAt: -1 }).lean()).map(strip);
  return readLocalJobs()
    .filter((job) => job.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getJob(userId: string, jobId: string): Promise<RepurposeJob | null> {
  const model = await mongoJobModel();
  if (model) {
    const doc = await model.findOne({ id: jobId, userId }).lean();
    return doc ? strip(doc) : null;
  }
  return readLocalJobs().find((job) => job.id === jobId && job.userId === userId) || null;
}

export async function createJob(input: {
  userId: string;
  title: string;
  sourceKind: 'video' | 'paste';
  videoId: string;
  transcript: string;
  engineModel: string;
  engineSource: 'engine' | 'local';
  clips: RepurposeClip[];
}): Promise<RepurposeJob> {
  const stamp = nowIso();
  const job: RepurposeJob = {
    id: newJobId(),
    userId: input.userId,
    title: input.title,
    sourceKind: input.sourceKind,
    videoId: input.videoId,
    transcript: input.transcript,
    createdAt: stamp,
    updatedAt: stamp,
    engineModel: input.engineModel,
    engineSource: input.engineSource,
    clips: input.clips,
  };

  const model = await mongoJobModel();
  if (model) {
    await model.create(job);
    return job;
  }
  return withLocalJobs((jobs) => {
    jobs.unshift(job);
    return job;
  });
}

/** Only allowlisted keys are ever written, so a client cannot name an arbitrary update path. */
function applyClipChanges(clip: RepurposeClip, changes: ClipChanges): RepurposeClip {
  const next = { ...clip };
  for (const field of CLIP_FIELDS) {
    const value = changes[field];
    if (value === undefined) continue;
    if (field === 'status' && value !== 'draft' && value !== 'saved' && value !== 'shipped') continue;
    (next as any)[field] = typeof value === 'string' ? String(value) : value;
  }
  return next;
}

export async function updateClip(
  userId: string,
  jobId: string,
  clipId: string,
  changes: ClipChanges,
): Promise<RepurposeClip | null> {
  const model = await mongoJobModel();
  if (model) {
    const doc: any = await model.findOne({ id: jobId, userId }).lean();
    if (!doc) return null;
    const clips = (doc.clips || []) as RepurposeClip[];
    const index = clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) return null;
    const updated = applyClipChanges(clips[index], changes);
    await model.updateOne(
      { id: jobId, userId },
      { $set: { [`clips.${index}`]: updated, updatedAt: nowIso() } },
    );
    return updated;
  }

  return withLocalJobs((jobs) => {
    const job = jobs.find((entry) => entry.id === jobId && entry.userId === userId);
    if (!job) return null;
    const index = job.clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) return null;
    const updated = applyClipChanges(job.clips[index], changes);
    job.clips[index] = updated;
    job.updatedAt = nowIso();
    return updated;
  });
}

export async function deleteJob(userId: string, jobId: string): Promise<boolean> {
  const model = await mongoJobModel();
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
