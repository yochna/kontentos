import { Schema, type Model } from 'mongoose';
import fs from 'fs';
import path from 'path';
import { localDataDir, mongoConnectionForNewEntities, storageProvider } from './db.js';
import { asId, isPlainJson } from './safeId.js';

/**
 * The bench's per-creator workspace: the switches on the Room station, the Brand Kit, which cut is
 * lit and which station was last open, the timeline being edited, and the draft in progress.
 *
 * All of it used to live in one browser's localStorage, which meant clearing site data — or opening
 * the studio on a second machine — cost a creator their settings and their unfinished edit. It also
 * meant the durability the app claims for its records was a lie for the work in progress.
 *
 * One row per account, holding five named slots. The slots are not a free-form bag: writes are
 * accepted only for the keys listed below, each is checked for the same things a saved idea is
 * (plain JSON, no `$` keys, no dotted paths) and each has a byte cap. A value that fails is refused
 * out loud rather than dropped, because a workspace that silently stops saving is the exact failure
 * this store exists to prevent.
 */

export interface WorkspaceBench {
  /** The cut the rail lights when the bench opens, '' when none is lit. */
  cutId: string;
  /** The station the creator was last standing at. */
  station: string;
}

export interface Workspace {
  userId: string;
  prefs: Record<string, unknown> | null;
  brandKit: Record<string, unknown> | null;
  bench: WorkspaceBench | null;
  project: Record<string, unknown> | null;
  draft: Record<string, unknown> | null;
  updatedAt: string;
}

const SLOTS = ['prefs', 'brandKit', 'bench', 'project', 'draft'] as const;

export type WorkspaceSlot = (typeof SLOTS)[number];

/** A slot set to null clears it; a slot left out of the patch is not touched. */
export type WorkspacePatch = Partial<Record<WorkspaceSlot, unknown>>;

const KB = 1024;

const SLOT_LIMITS: Record<WorkspaceSlot, number> = {
  prefs: 16 * KB,
  brandKit: 64 * KB,
  bench: 4 * KB,
  draft: 512 * KB,
  // A timeline is the editor's actual work: tracks, clips and per-word caption cues. Thirty minutes
  // of speech cut into a reel is well under this, and the cap sits below the API body parser's 4 MB
  // so an oversized project is refused by name here instead of as a generic 413 from Express.
  project: 3 * 1024 * KB,
};

/** UTF-16 length of the serialized value — a cap on runaway payloads, not exact byte billing. */
function jsonLength(value: unknown): number {
  const text = JSON.stringify(value);
  return text ? text.length : 0;
}

/**
 * Cut ids and station ids are short and minted by the app; a client that sends something else gets
 * the empty string, which both readers already treat as "nothing stored".
 */
function cleanBench(value: unknown): WorkspaceBench {
  const raw = value as Record<string, unknown> | null;
  const station = typeof raw?.station === 'string' ? raw.station.trim().slice(0, 40) : '';
  return { cutId: asId(raw?.cutId), station };
}

/**
 * A payload this store turned away. Its own type so the route can answer 400 — the creator's
 * client sent something un-storable — instead of 503, which would tell them the workspace is down
 * when it is their own save that never landed.
 */
export class RefusedWorkspaceWrite extends Error {}

function refuse(message: string): RefusedWorkspaceWrite {
  return new RefusedWorkspaceWrite(message);
}

function cleanSlot(slot: WorkspaceSlot, value: unknown): Workspace[WorkspaceSlot] | WorkspaceBench | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value) || !isPlainJson(value)) {
    throw refuse(`The ${slot} slot only holds a plain object.`);
  }
  if (slot === 'bench') return cleanBench(value);
  const limit = SLOT_LIMITS[slot];
  if (jsonLength(value) > limit) {
    throw refuse(`The ${slot} is over the ${Math.round(limit / KB)} KB this slot holds.`);
  }
  return value as Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToWorkspace(row: Record<string, any>): Workspace {
  return {
    userId: String(row.userId || ''),
    prefs: row.prefs ?? null,
    brandKit: row.brandKit ?? null,
    bench: row.bench ? cleanBench(row.bench) : null,
    project: row.project ?? null,
    draft: row.draft ?? null,
    updatedAt: String(row.updatedAt || ''),
  };
}

// ==========================================
// MongoDB
// ==========================================

let workspaceModel: Promise<Model<any> | null> | null = null;

/**
 * Bound lazily, and a bind answering null is not kept — the same rule as the repurpose store, so a
 * first hiccup cannot pin this workspace to the container's own disk for the life of the process.
 */
function mongoWorkspaceModel(): Promise<Model<any> | null> {
  if (!workspaceModel) {
    const bind = bindModel();
    workspaceModel = bind.then(
      (model) => {
        if (!model) workspaceModel = null;
        return model;
      },
      (err) => {
        workspaceModel = null;
        throw err;
      },
    );
  }
  return workspaceModel;
}

async function bindModel(): Promise<Model<any> | null> {
  const conn = await mongoConnectionForNewEntities();
  if (!conn) return null;

  const existing = (conn as any).models?.Workspace as Model<any> | undefined;
  if (existing) return existing;

  const benchSchema = new Schema({ cutId: String, station: String }, { _id: false });
  // The four content slots are Mixed on purpose: a brand kit and a timeline project are the client's
  // own shapes, and duplicating them here would only be a place for the two to drift apart. Every
  // write still passes cleanSlot(), so what lands in them is plain JSON under a size cap.
  const workspaceSchema = new Schema(
    {
      userId: { type: String, required: true },
      prefs: { type: Schema.Types.Mixed, default: null },
      brandKit: { type: Schema.Types.Mixed, default: null },
      bench: { type: benchSchema, default: null },
      project: { type: Schema.Types.Mixed, default: null },
      draft: { type: Schema.Types.Mixed, default: null },
      updatedAt: String,
    },
    { versionKey: false, strict: false },
  );
  workspaceSchema.index({ userId: 1 }, { unique: true });

  const model = conn.model('Workspace', workspaceSchema, 'workspaces');
  try {
    await model.syncIndexes();
  } catch (err: any) {
    // Duplicate rows from an earlier build would reject the unique index. Reads and writes still
    // work, so keep serving rather than calling the database down.
    console.warn('⚠️ Workspace indexes could not be synchronised:', err?.message || err);
  }
  return model;
}

/** The bound model, or null when this deployment runs on the JSON file by design. */
async function modelOrRefuse(): Promise<Model<any> | null> {
  const model = await mongoWorkspaceModel();
  if (!model && storageProvider() === 'mongodb') {
    throw new Error('The workspace store is unreachable, so nothing was saved. Try again in a moment.');
  }
  return model;
}

const strip = (doc: any): Record<string, any> => {
  const { _id, __v, ...rest } = doc;
  return rest;
};

// ==========================================
// Local JSON fallback
// ==========================================

function localFile(): string {
  return path.join(localDataDir(), 'kontentos-workspace.json');
}

function readLocalRows(): Record<string, any>[] {
  const file = localFile();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Unreadable bytes stay on disk so the workspace remains recoverable; answering empty beats
    // deleting a creator's settings and their open timeline.
    try {
      const dir = path.dirname(file);
      const base = path.basename(file);
      const preserved = fs.readdirSync(dir).find((name) => name.startsWith(`${base}.corrupt-`));
      if (preserved) {
        console.error(`Workspace store is still unreadable; the damaged copy remains at ${preserved}:`, err);
      } else {
        const backup = `${file}.corrupt-${Date.now()}.json`;
        fs.copyFileSync(file, backup);
        console.error(`Workspace store unreadable; damaged copy preserved at ${backup}:`, err);
      }
    } catch {
      console.error('Workspace store is unreadable and the damaged copy could not be preserved:', err);
    }
    return [];
  }
}

function writeLocalRows(rows: Record<string, any>[]): void {
  const file = localFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Sibling temp file then rename: rename is atomic on Linux and Windows, so a crash mid-write
  // leaves the previous good workspace intact instead of a truncated one.
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch { /* the temp file is not the problem worth masking */ }
    throw new Error('Could not persist the workspace store');
  }
}

/**
 * Local writes read-mutate-write, so concurrent requests would clobber each other. Chaining every
 * mutation onto one promise makes the store behave like a single-threaded transaction log.
 */
let localQueue: Promise<void> = Promise.resolve();

function withLocalRows<T>(mutate: (rows: Record<string, any>[]) => T): Promise<T> {
  const run = localQueue.then(() => {
    const rows = readLocalRows();
    const result = mutate(rows);
    writeLocalRows(rows);
    return result;
  });
  localQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function findOrCreateRow(rows: Record<string, any>[], userId: string): Record<string, any> {
  let row = rows.find((entry) => entry.userId === userId);
  if (!row) {
    row = { userId };
    rows.unshift(row);
  }
  return row;
}

// ==========================================
// Public API
// ==========================================

/** The saved workspace, or null while the account has never saved one. */
export async function getWorkspace(userId: string): Promise<Workspace | null> {
  const model = await modelOrRefuse();
  if (model) {
    const doc: any = await model.findOne({ userId }).lean();
    return doc ? rowToWorkspace(strip(doc)) : null;
  }
  const row = readLocalRows().find((entry) => entry.userId === userId);
  return row ? rowToWorkspace(row) : null;
}

/**
 * Apply a partial update and return the whole row, so the client's cache is always the server's
 * answer rather than what it hoped to have written.
 */
export async function patchWorkspace(userId: string, patch: WorkspacePatch): Promise<Workspace> {
  const keys = Object.keys(patch) as WorkspaceSlot[];
  const unknown = keys.filter((key) => !SLOTS.includes(key));
  if (unknown.length) throw refuse(`This workspace has no ${unknown.join(', ')} slot.`);

  const sets: Record<string, unknown> = {};
  for (const key of keys) sets[key] = cleanSlot(key, patch[key]);
  sets.updatedAt = nowIso();

  const model = await modelOrRefuse();
  if (model) {
    await model.updateOne({ userId }, { $set: sets }, { upsert: true });
    return (await getWorkspace(userId)) as Workspace;
  }
  const updated = await withLocalRows((rows) => {
    const row = findOrCreateRow(rows, userId);
    Object.assign(row, sets);
    return rowToWorkspace(row);
  });
  return updated;
}
