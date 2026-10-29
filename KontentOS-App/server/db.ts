import mongoose, { Schema, type Connection, type Model } from 'mongoose';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Video, Subtitle, Caption, PublishingRecord, User, VideoStatus, SocialPlatform, ScheduledPost } from '../src/types.js';

// ==========================================
// MongoDB storage layer
// ==========================================
// MONGODB_URI unset => the local JSON store below is the database (development only).
// MONGODB_URI set    => MongoDB is the only store. A failed write throws instead of
// silently persisting to the container's ephemeral disk.

const rawUri = (process.env.MONGODB_URI || '').trim();
const MONGODB_URI = /^mongodb(\+srv)?:\/\//i.test(rawUri) ? rawUri : '';

if (!MONGODB_URI && process.env.NODE_ENV === 'production') {
  // Render/Railway containers have an ephemeral filesystem, so the JSON store is deleted
  // on every redeploy, restart or free-tier sleep.
  console.warn(
    '⚠️ Production is using the local JSON store: uploads, schedules and history will be ' +
      'lost on the next redeploy. Set MONGODB_URI for durable storage.',
  );
} else if (!MONGODB_URI) {
  console.log('ℹ️ MONGODB_URI not provided. Using local database storage engine.');
}

const SERVER_SELECTION_TIMEOUT_MS = 8000;
const RETRY_COOLDOWN_MS = 20000;

let models: Models | null = null;
let pendingConnect: Promise<Connection | null> | null = null;
let lastConnectFailureAt = 0;
let lastConnectError = '';

// Models are bound to the connection, so they are built once the connection exists.
interface Models {
  video: Model<any>;
  subtitle: Model<any>;
  caption: Model<any>;
  publishingHistory: Model<any>;
  user: Model<any>;
  scheduledPost: Model<any>;
}

const docOptions = { versionKey: false, strict: false, toObject: { virtuals: false }, toJSON: { virtuals: false } } as const;

// Timestamps are stored as ISO-8601 "Z" strings, matching the values the API has always
// returned: the UI parses and sorts them as strings, so no conversion layer is needed.
const stringId = { type: String, required: true };
const idIndex = { unique: true };

function buildModels(conn: Connection): Models {
  const videoSchema = new Schema(
    {
      id: stringId,
      user_id: String,
      title: String,
      file_name: String,
      description: String,
      file_url: String,
      thumbnail_url: String,
      duration: Number,
      file_size: Number,
      aspect_ratio: String,
      status: String,
      created_at: String,
      updated_at: String,
    },
    docOptions,
  );
  videoSchema.index({ id: 1 }, idIndex);
  videoSchema.index({ user_id: 1, created_at: -1 });

  // Nested transcript cues carry no document of their own.
  const segmentSchema = new Schema({ id: Number, start: String, end: String, text: String }, { _id: false });
  const subtitleSchema = new Schema(
    {
      id: stringId,
      video_id: { type: String, required: true },
      srt_content: String,
      vtt_content: String,
      transcript_text: String,
      language: String,
      segments: [segmentSchema],
      created_at: String,
    },
    docOptions,
  );
  // One subtitle per video: saveSubtitles() upserts on this key, and every reader expects a
  // single document back.
  subtitleSchema.index({ video_id: 1 }, idIndex);

  const captionSchema = new Schema(
    {
      id: stringId,
      video_id: { type: String, required: true },
      platform: { type: String, required: true },
      caption_text: String,
      hashtags: [String],
      approved: Boolean,
      transcript_hash: String,
      character_count: Number,
      created_at: String,
    },
    docOptions,
  );
  // One caption per video per platform.
  captionSchema.index({ video_id: 1, platform: 1 }, idIndex);

  const publishingSchema = new Schema(
    {
      id: stringId,
      video_id: String,
      platform: String,
      platform_post_id: String,
      url: String,
      status: String,
      error_message: String,
      published_at: String,
    },
    docOptions,
  );
  publishingSchema.index({ video_id: 1 });
  publishingSchema.index({ published_at: -1 });

  const userSchema = new Schema(
    {
      id: stringId,
      email: String,
      full_name: String,
      avatar_url: String,
      instagram_token: String,
      instagram_user_id: String,
      instagram_username: String,
      created_at: String,
    },
    docOptions,
  );
  userSchema.index({ id: 1 }, idIndex);

  const scheduledSchema = new Schema(
    {
      id: stringId,
      user_id: String,
      video_id: String,
      video_title: String,
      file_url: String,
      thumbnail_url: String,
      platform: String,
      caption_text: String,
      hashtags: [String],
      scheduled_at: String,
      status: String,
      published_at: String,
      post_url: String,
      cross_post_group_id: String,
      created_at: String,
      updated_at: String,
    },
    docOptions,
  );
  scheduledSchema.index({ id: 1 }, idIndex);
  scheduledSchema.index({ scheduled_at: 1 });
  scheduledSchema.index({ video_id: 1 });

  return {
    video: conn.model('Video', videoSchema, 'videos'),
    subtitle: conn.model('Subtitle', subtitleSchema, 'subtitles'),
    caption: conn.model('Caption', captionSchema, 'captions'),
    publishingHistory: conn.model('PublishingRecord', publishingSchema, 'publishing_history'),
    user: conn.model('User', userSchema, 'users'),
    scheduledPost: conn.model('ScheduledPost', scheduledSchema, 'scheduled_posts'),
  };
}

async function openConnection(): Promise<Connection | null> {
  const conn = mongoose.createConnection(MONGODB_URI, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
  try {
    await conn.asPromise();
    const built = buildModels(conn);
    try {
      // syncIndexes is idempotent; awaiting it here means the first request that needs the
      // unique guarantees is not racing index construction.
      await Promise.all(Object.values(built).map((m) => m.syncIndexes()));
    } catch (idxErr: any) {
      // Duplicate rows from an older engine would reject a unique index. Keep serving reads
      // and writes rather than reporting the whole database as down.
      console.warn('⚠️ MongoDB indexes could not be synchronised:', idxErr?.message || idxErr);
    }
    models = built;
    console.log('✓ Connected to MongoDB');
    return conn;
  } catch (err: any) {
    lastConnectError = err?.message || String(err);
    lastConnectFailureAt = Date.now();
    console.error('⚠️ MongoDB connection failed:', lastConnectError);
    try {
      await conn.close();
    } catch { /* the failed handle is not worth masking the connection error */ }
    return null;
  }
}

/** Resolves to a usable model set, or null when MONGODB_URI is unset / still unreachable. */
async function getModels(): Promise<Models | null> {
  if (!MONGODB_URI) return null;
  if (models) return models;
  if (Date.now() - lastConnectFailureAt < RETRY_COOLDOWN_MS) return null;
  if (!pendingConnect) {
    pendingConnect = openConnection().finally(() => {
      pendingConnect = null;
    });
  }
  await pendingConnect;
  return models;
}

/**
 * Every operation starts here. Returns null only when no URI is configured, meaning the JSON
 * file is the database by design. When MongoDB is configured but unreachable the request fails
 * loudly instead of writing to storage that the next redeploy deletes.
 */
async function mongoModels(): Promise<Models | null> {
  const m = await getModels();
  if (m) return m;
  if (MONGODB_URI) {
    throw new Error(
      `MongoDB is configured but unavailable${lastConnectError ? ` (${lastConnectError})` : ''}. Nothing was saved.`,
    );
  }
  return null;
}

export function isMongoConnected(): boolean {
  return models !== null;
}

export function storageProvider(): 'mongodb' | 'local_persistent_json' {
  // The configured engine, not the live socket: isMongoConnected() carries the health.
  return MONGODB_URI ? 'mongodb' : 'local_persistent_json';
}

export function databaseError(): string {
  return lastConnectError;
}

/** Attempts the connection at boot so the log says up-front which engine is live. */
export async function initDatabase(): Promise<void> {
  if (!MONGODB_URI) return;
  await getModels();
}

/** Strips the Mongo ObjectId so returned documents match the TypeScript types exactly. */
function plain<T>(doc: any): T | null {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete obj._id;
  return obj as T;
}

function plainList<T>(docs: any[]): T[] {
  return docs.map((d) => plain<T>(d) as T);
}

// ==========================================
// Robust Local Storage Fallback Engine
// ==========================================
interface LocalStoreSchema {
  users: User[];
  videos: Video[];
  subtitles: Subtitle[];
  captions: Caption[];
  publishing_history: PublishingRecord[];
  scheduled_posts: ScheduledPost[];
}

function getDataFilePath(): string {
  const primaryDir = path.join(process.cwd(), '.data');
  try {
    if (!fs.existsSync(primaryDir)) {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(primaryDir, '.write-test');
    fs.writeFileSync(testFile, 'ok', 'utf-8');
    fs.unlinkSync(testFile);
    return path.join(primaryDir, 'kontentos-db.json');
  } catch {
    const fallbackDir = path.join(os.tmpdir(), 'kontentos-data');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, 'kontentos-db.json');
  }
}

let activeDbFile: string | null = null;
function getDbFile(): string {
  if (!activeDbFile) {
    activeDbFile = getDataFilePath();
  }
  return activeDbFile;
}

function loadLocalStore(): LocalStoreSchema {
  const dbFile = getDbFile();
  if (!fs.existsSync(dbFile)) {
    const defaultData: LocalStoreSchema = {
      users: [
        {
          id: 'user_default',
          email: 'creator@kontentos.ai',
          full_name: 'KontentOS Creator',
          // No stock portrait: shipping someone's face as the default creator identity is
          // both a likeness problem and a false claim. The UI falls back to initials.
          avatar_url: '',
          created_at: new Date().toISOString(),
        },
      ],
      videos: [],
      subtitles: [],
      captions: [],
      publishing_history: [],
      scheduled_posts: [],
    };
    try {
      fs.writeFileSync(dbFile, JSON.stringify(defaultData, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Could not write initial db file:', e);
    }
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(dbFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.scheduled_posts) parsed.scheduled_posts = [];
    return parsed;
  } catch (err) {
    // A truncated file (killed mid-write) must not be answered by wiping the database:
    // keep the damaged bytes so the creator's data stays recoverable.
    const backup = `${dbFile}.corrupt-${Date.now()}.json`;
    try {
      fs.copyFileSync(dbFile, backup);
      console.error(`Local DB is unreadable; preserved damaged copy at ${backup}:`, err);
    } catch {
      console.error('Local DB is unreadable and the damaged copy could not be preserved:', err);
    }
    return {
      users: [],
      videos: [],
      subtitles: [],
      captions: [],
      publishing_history: [],
      scheduled_posts: [],
    };
  }
}

function saveLocalStore(data: LocalStoreSchema) {
  const dbFile = getDbFile();
  // Write to a sibling temp file then rename: rename is atomic on both Linux and Windows,
  // so a crash mid-write leaves the previous good database intact instead of a truncated one.
  const tmpFile = `${dbFile}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, dbFile);
  } catch (err) {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch { /* the temp file is not the problem worth masking */ }
    // Propagate: swallowing this made every route report success while nothing was persisted.
    console.error('Error writing to local DB file:', err);
    throw new Error('Could not persist to the local database');
  }
}

// ==========================================
// Database Operations Service
// ==========================================

export async function createVideo(data: Partial<Video>): Promise<Video> {
  const newVideo: Video = {
    id: data.id || `vid_${crypto.randomUUID()}`,
    user_id: data.user_id || 'user_default',
    title: data.title || 'Untitled Video',
    description: data.description || '',
    file_url: data.file_url || '',
    thumbnail_url: data.thumbnail_url || '',
    duration: data.duration || 0,
    file_size: data.file_size || 0,
    aspect_ratio: data.aspect_ratio || '9:16',
    status: data.status || 'uploading',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const m = await mongoModels();
  if (m) {
    const created = await m.video.create(newVideo);
    return plain<Video>(created)!;
  }

  const store = loadLocalStore();
  store.videos.unshift(newVideo);
  saveLocalStore(store);
  return newVideo;
}

export async function getVideo(id: string): Promise<Video | null> {
  const m = await mongoModels();
  if (m) return plain<Video>(await m.video.findOne({ id }).lean());

  const store = loadLocalStore();
  return store.videos.find((v) => v.id === id) || null;
}

export async function listVideos(userId = 'user_default'): Promise<Video[]> {
  const m = await mongoModels();
  if (m) {
    const docs = await m.video.find({ user_id: userId }).sort({ created_at: -1 }).lean();
    return plainList<Video>(docs);
  }

  const store = loadLocalStore();
  return store.videos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function updateVideoStatus(
  id: string,
  status: VideoStatus,
  extra: Partial<Video> = {}
): Promise<Video | null> {
  const updates = {
    ...extra,
    status,
    updated_at: new Date().toISOString(),
  };

  const m = await mongoModels();
  if (m) {
    const doc = await m.video.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
    return plain<Video>(doc);
  }

  const store = loadLocalStore();
  const idx = store.videos.findIndex((v) => v.id === id);
  if (idx === -1) return null;

  store.videos[idx] = {
    ...store.videos[idx],
    ...updates,
  };
  saveLocalStore(store);
  return store.videos[idx];
}

// Uploaded clips live in the /uploads directory served by server.ts. Deleting the record but
// not the file leaves a clip nothing can reference behind, on a disk that is already scarce.
function removeUploadedVideoFile(fileUrl: string | undefined): void {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
  // basename() neutralises any traversal a stored URL might carry.
  const fileName = path.basename(decodeURIComponent(fileUrl.slice('/uploads/'.length)));
  if (!fileName) return;
  const filePath = path.join(process.cwd(), 'uploads', fileName);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err: any) {
    console.warn('Could not remove the stored clip for a deleted video:', err?.message);
  }
}

export async function deleteVideo(id: string): Promise<boolean> {
  const m = await mongoModels();
  if (m) {
    const video = plain<{ file_url?: string }>(await m.video.findOne({ id }).lean());
    removeUploadedVideoFile(video?.file_url);
    await Promise.all([
      m.subtitle.deleteMany({ video_id: id }),
      m.caption.deleteMany({ video_id: id }),
      m.publishingHistory.deleteMany({ video_id: id }),
      m.scheduledPost.deleteMany({ video_id: id }),
    ]);
    const res = await m.video.deleteOne({ id });
    return res.deletedCount > 0;
  }

  const store = loadLocalStore();
  const existing = store.videos.find((v) => v.id === id);
  if (!existing) return false;
  removeUploadedVideoFile(existing.file_url);

  const initialLen = store.videos.length;
  store.videos = store.videos.filter((v) => v.id !== id);
  store.subtitles = store.subtitles.filter((s) => s.video_id !== id);
  store.captions = store.captions.filter((c) => c.video_id !== id);
  store.publishing_history = store.publishing_history.filter((p) => p.video_id !== id);
  store.scheduled_posts = (store.scheduled_posts || []).filter((p) => p.video_id !== id);
  saveLocalStore(store);
  return store.videos.length < initialLen;
}

export async function saveSubtitles(
  sub: Omit<Subtitle, 'id' | 'created_at'>
): Promise<Subtitle> {
  const fields = {
    srt_content: sub.srt_content,
    vtt_content: sub.vtt_content,
    transcript_text: sub.transcript_text,
    language: sub.language,
    segments: sub.segments,
  };

  const m = await mongoModels();
  if (m) {
    // Upsert on video_id, not on a fresh sub_ id: the unique index means one document per
    // clip, and re-transcribing replaces the cues instead of appending a second set.
    const doc = await m.subtitle.findOneAndUpdate(
      { video_id: sub.video_id },
      { $set: fields, $setOnInsert: { id: `sub_${crypto.randomUUID()}`, created_at: new Date().toISOString() } },
      { new: true, upsert: true },
    ).lean();
    return plain<Subtitle>(doc)!;
  }

  const newSub: Subtitle = {
    id: `sub_${crypto.randomUUID()}`,
    video_id: sub.video_id,
    ...fields,
    created_at: new Date().toISOString(),
  } as Subtitle;

  const store = loadLocalStore();
  store.subtitles = store.subtitles.filter((s) => s.video_id !== sub.video_id);
  store.subtitles.unshift(newSub);
  saveLocalStore(store);
  return newSub;
}

export async function getSubtitles(videoId: string): Promise<Subtitle | null> {
  const m = await mongoModels();
  if (m) return plain<Subtitle>(await m.subtitle.findOne({ video_id: videoId }).lean());

  const store = loadLocalStore();
  return store.subtitles.find((s) => s.video_id === videoId) || null;
}

export async function saveCaption(
  caption: Omit<Caption, 'id' | 'created_at'>
): Promise<Caption> {
  const fields = {
    caption_text: caption.caption_text,
    hashtags: caption.hashtags,
    approved: caption.approved ?? false,
    transcript_hash: caption.transcript_hash || '',
    character_count: caption.character_count || caption.caption_text.length,
  };

  const m = await mongoModels();
  if (m) {
    // Same shape as subtitles: the unique (video_id, platform) index is the conflict target.
    const doc = await m.caption.findOneAndUpdate(
      { video_id: caption.video_id, platform: caption.platform },
      { $set: fields, $setOnInsert: { id: `cap_${crypto.randomUUID()}`, created_at: new Date().toISOString() } },
      { new: true, upsert: true },
    ).lean();
    return plain<Caption>(doc)!;
  }

  const newCap: Caption = {
    id: `cap_${crypto.randomUUID()}`,
    video_id: caption.video_id,
    platform: caption.platform,
    ...fields,
    created_at: new Date().toISOString(),
  } as Caption;

  const store = loadLocalStore();
  store.captions = store.captions.filter(
    (c) => !(c.video_id === caption.video_id && c.platform === caption.platform)
  );
  store.captions.unshift(newCap);
  saveLocalStore(store);
  return newCap;
}

export async function getCaption(
  videoId: string,
  platform: SocialPlatform = 'instagram'
): Promise<Caption | null> {
  const m = await mongoModels();
  if (m) return plain<Caption>(await m.caption.findOne({ video_id: videoId, platform }).lean());

  const store = loadLocalStore();
  return store.captions.find((c) => c.video_id === videoId && c.platform === platform) || null;
}

export async function updateCaption(
  id: string,
  updates: Partial<Caption>
): Promise<Caption | null> {
  const m = await mongoModels();
  if (m) {
    const doc = await m.caption.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
    return plain<Caption>(doc);
  }

  const store = loadLocalStore();
  const idx = store.captions.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  store.captions[idx] = {
    ...store.captions[idx],
    ...updates,
  };
  saveLocalStore(store);
  return store.captions[idx];
}

export async function recordPublish(
  record: Omit<PublishingRecord, 'id' | 'published_at'>
): Promise<PublishingRecord> {
  const newRec: PublishingRecord = {
    id: `pub_${crypto.randomUUID()}`,
    video_id: record.video_id,
    platform: record.platform,
    platform_post_id: record.platform_post_id || '',
    url: record.url || '',
    status: record.status,
    error_message: record.error_message || '',
    published_at: new Date().toISOString(),
  };

  const m = await mongoModels();
  if (m) return plain<PublishingRecord>(await m.publishingHistory.create(newRec))!;

  const store = loadLocalStore();
  store.publishing_history.unshift(newRec);
  saveLocalStore(store);
  return newRec;
}

export async function listPublishingHistory(
  userId = 'user_default'
): Promise<PublishingRecord[]> {
  const m = await mongoModels();
  if (m) {
    const docs = await m.publishingHistory.find({}).sort({ published_at: -1 }).lean();
    return plainList<PublishingRecord>(docs);
  }

  const store = loadLocalStore();
  return store.publishing_history.sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

export async function deletePublishingRecord(id: string): Promise<boolean> {
  const m = await mongoModels();
  if (m) {
    const res = await m.publishingHistory.deleteOne({ id });
    return res.deletedCount > 0;
  }

  const store = loadLocalStore();
  const initialLen = store.publishing_history.length;
  store.publishing_history = store.publishing_history.filter((p) => p.id !== id);
  saveLocalStore(store);
  return store.publishing_history.length < initialLen;
}

export async function getUser(id = 'user_default'): Promise<User | null> {
  const m = await mongoModels();
  if (m) return plain<User>(await m.user.findOne({ id }).lean());

  const store = loadLocalStore();
  return store.users.find((u) => u.id === id) || null;
}

export async function saveUser(userData: Partial<User>): Promise<User> {
  const userId = userData.id || 'user_default';
  const existing = await getUser(userId);
  const updatedUser: User = {
    id: userId,
    email: userData.email || existing?.email || 'creator@kontentos.ai',
    full_name: userData.full_name || existing?.full_name || 'KontentOS Creator',
    avatar_url: userData.avatar_url || existing?.avatar_url || '',
    instagram_token: userData.instagram_token || existing?.instagram_token,
    instagram_user_id: userData.instagram_user_id || existing?.instagram_user_id,
    instagram_username: userData.instagram_username || existing?.instagram_username,
    created_at: existing?.created_at || new Date().toISOString(),
  };

  const m = await mongoModels();
  if (m) {
    const doc = await m.user
      .findOneAndUpdate({ id: userId }, { $set: updatedUser }, { new: true, upsert: true })
      .lean();
    return plain<User>(doc)!;
  }

  const store = loadLocalStore();
  const idx = store.users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    store.users.push(updatedUser);
  } else {
    store.users[idx] = updatedUser;
  }
  saveLocalStore(store);
  return updatedUser;
}

// ==========================================
// Scheduled Posts Operations
// ==========================================

export async function listScheduledPosts(): Promise<ScheduledPost[]> {
  const m = await mongoModels();
  if (m) {
    const docs = await m.scheduledPost.find({}).sort({ scheduled_at: 1 }).lean();
    return plainList<ScheduledPost>(docs);
  }

  const store = loadLocalStore();
  return (store.scheduled_posts || []).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

export async function getScheduledPost(id: string): Promise<ScheduledPost | null> {
  const m = await mongoModels();
  if (m) return plain<ScheduledPost>(await m.scheduledPost.findOne({ id }).lean());

  const store = loadLocalStore();
  return (store.scheduled_posts || []).find((p) => p.id === id) || null;
}

export async function createScheduledPost(postData: Partial<ScheduledPost>): Promise<ScheduledPost> {
  const newPost: ScheduledPost = {
    id: postData.id || `sched_${crypto.randomUUID()}`,
    user_id: postData.user_id || 'user_default',
    video_id: postData.video_id || '',
    video_title: postData.video_title || 'Untitled Video',
    file_url: postData.file_url || '',
    thumbnail_url: postData.thumbnail_url || '',
    platform: postData.platform || 'instagram',
    caption_text: postData.caption_text || '',
    hashtags: postData.hashtags || [],
    scheduled_at: postData.scheduled_at || new Date(Date.now() + 86400000).toISOString(),
    status: postData.status || 'scheduled',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const m = await mongoModels();
  if (m) return plain<ScheduledPost>(await m.scheduledPost.create(newPost))!;

  const store = loadLocalStore();
  store.scheduled_posts.push(newPost);
  saveLocalStore(store);
  return newPost;
}

export async function updateScheduledPost(id: string, updates: Partial<ScheduledPost>): Promise<ScheduledPost | null> {
  const m = await mongoModels();
  if (m) {
    const doc = await m.scheduledPost
      .findOneAndUpdate({ id }, { $set: { ...updates, updated_at: new Date().toISOString() } }, { new: true })
      .lean();
    return plain<ScheduledPost>(doc);
  }

  const store = loadLocalStore();
  const idx = store.scheduled_posts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  store.scheduled_posts[idx] = {
    ...store.scheduled_posts[idx],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  saveLocalStore(store);
  return store.scheduled_posts[idx];
}

export async function deleteScheduledPost(id: string): Promise<boolean> {
  const m = await mongoModels();
  if (m) {
    const res = await m.scheduledPost.deleteOne({ id });
    return res.deletedCount > 0;
  }

  const store = loadLocalStore();
  const initialLen = (store.scheduled_posts || []).length;
  store.scheduled_posts = (store.scheduled_posts || []).filter((p) => p.id !== id);
  saveLocalStore(store);
  return store.scheduled_posts.length < initialLen;
}
