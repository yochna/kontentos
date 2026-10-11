import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Video, Subtitle, Caption, PublishingRecord, User, VideoStatus, SocialPlatform, ScheduledPost } from '../src/types.js';

const rawUrl = (process.env.SUPABASE_URL || '').trim();
const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

function isValidHttpUrl(urlStr: string): boolean {
  if (!urlStr || urlStr === 'MY_SUPABASE_URL' || urlStr.startsWith('your-')) return false;
  try {
    const url = new URL(urlStr);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

let supabaseClient: SupabaseClient | null = null;

if (isValidHttpUrl(rawUrl) && rawKey && rawKey !== 'MY_SUPABASE_KEY') {
  try {
    supabaseClient = createClient(rawUrl, rawKey, {
      auth: { persistSession: false },
    });
    console.log('✓ Connected to Supabase');
  } catch (err: any) {
    console.warn('⚠️ Supabase connection failed, using local storage engine:', err?.message || err);
    supabaseClient = null;
  }
} else {
  console.log('ℹ️ Supabase credentials not provided. Using local database storage engine.');
}

export function isSupabaseConnected(): boolean {
  return supabaseClient !== null;
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
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
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
    console.error('Error reading local DB file, resetting to empty schema:', err);
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
  try {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to local DB file:', err);
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

  if (supabaseClient) {
    try {
      const { data: inserted, error } = await supabaseClient
        .from('videos')
        .insert([newVideo])
        .select()
        .single();
      if (!error && inserted) {
        // Mirror to local store for fast offline read
        const store = loadLocalStore();
        store.videos.unshift(inserted as Video);
        saveLocalStore(store);
        return inserted as Video;
      }
      console.warn('Supabase createVideo returned error, falling back to local store:', error?.message);
    } catch (err: any) {
      console.warn('Supabase createVideo exception, falling back to local store:', err?.message);
    }
  }

  const store = loadLocalStore();
  store.videos.unshift(newVideo);
  saveLocalStore(store);
  return newVideo;
}

export async function getVideo(id: string): Promise<Video | null> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('videos')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        return data as Video;
      }
    } catch (err: any) {
      console.warn('Supabase getVideo exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  return store.videos.find((v) => v.id === id) || null;
}

export async function listVideos(userId = 'user_default'): Promise<Video[]> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('videos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data as Video[];
      }
      console.warn('Supabase listVideos returned error, reading local store:', error?.message);
    } catch (err: any) {
      console.warn('Supabase listVideos exception:', err?.message);
    }
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

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('videos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        const idx = store.videos.findIndex((v) => v.id === id);
        if (idx !== -1) {
          store.videos[idx] = data as Video;
          saveLocalStore(store);
        }
        return data as Video;
      }
    } catch (err: any) {
      console.warn('Supabase updateVideoStatus exception:', err?.message);
    }
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

export async function deleteVideo(id: string): Promise<boolean> {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.from('videos').delete().eq('id', id);
      if (error) {
        console.warn('Supabase deleteVideo warning:', error.message);
      }
    } catch (err: any) {
      console.warn('Supabase deleteVideo exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  const initialLen = store.videos.length;
  store.videos = store.videos.filter((v) => v.id !== id);
  store.subtitles = store.subtitles.filter((s) => s.video_id !== id);
  store.captions = store.captions.filter((c) => c.video_id !== id);
  store.publishing_history = store.publishing_history.filter((p) => p.video_id !== id);
  saveLocalStore(store);
  return store.videos.length < initialLen;
}

export async function saveSubtitles(
  sub: Omit<Subtitle, 'id' | 'created_at'>
): Promise<Subtitle> {
  const newSub: Subtitle = {
    id: `sub_${crypto.randomUUID()}`,
    video_id: sub.video_id,
    srt_content: sub.srt_content,
    vtt_content: sub.vtt_content,
    transcript_text: sub.transcript_text,
    language: sub.language,
    segments: sub.segments,
    created_at: new Date().toISOString(),
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('subtitles')
        .upsert([newSub])
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        store.subtitles = store.subtitles.filter((s) => s.video_id !== sub.video_id);
        store.subtitles.unshift(data as Subtitle);
        saveLocalStore(store);
        return data as Subtitle;
      }
    } catch (err: any) {
      console.warn('Supabase saveSubtitles exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  store.subtitles = store.subtitles.filter((s) => s.video_id !== sub.video_id);
  store.subtitles.unshift(newSub);
  saveLocalStore(store);
  return newSub;
}

export async function getSubtitles(videoId: string): Promise<Subtitle | null> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('subtitles')
        .select('*')
        .eq('video_id', videoId)
        .maybeSingle();
      if (!error && data) {
        return data as Subtitle;
      }
    } catch (err: any) {
      console.warn('Supabase getSubtitles exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  return store.subtitles.find((s) => s.video_id === videoId) || null;
}

export async function saveCaption(
  caption: Omit<Caption, 'id' | 'created_at'>
): Promise<Caption> {
  const newCap: Caption = {
    id: `cap_${crypto.randomUUID()}`,
    video_id: caption.video_id,
    platform: caption.platform,
    caption_text: caption.caption_text,
    hashtags: caption.hashtags,
    approved: caption.approved ?? false,
    transcript_hash: caption.transcript_hash || '',
    character_count: caption.character_count || caption.caption_text.length,
    created_at: new Date().toISOString(),
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('captions')
        .upsert([newCap])
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        store.captions = store.captions.filter(
          (c) => !(c.video_id === caption.video_id && c.platform === caption.platform)
        );
        store.captions.unshift(data as Caption);
        saveLocalStore(store);
        return data as Caption;
      }
    } catch (err: any) {
      console.warn('Supabase saveCaption exception:', err?.message);
    }
  }

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
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('captions')
        .select('*')
        .eq('video_id', videoId)
        .eq('platform', platform)
        .maybeSingle();
      if (!error && data) {
        return data as Caption;
      }
    } catch (err: any) {
      console.warn('Supabase getCaption exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  return store.captions.find((c) => c.video_id === videoId && c.platform === platform) || null;
}

export async function updateCaption(
  id: string,
  updates: Partial<Caption>
): Promise<Caption | null> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('captions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        const idx = store.captions.findIndex((c) => c.id === id);
        if (idx !== -1) {
          store.captions[idx] = data as Caption;
          saveLocalStore(store);
        }
        return data as Caption;
      }
    } catch (err: any) {
      console.warn('Supabase updateCaption exception:', err?.message);
    }
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

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('publishing_history')
        .insert([newRec])
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        store.publishing_history.unshift(data as PublishingRecord);
        saveLocalStore(store);
        return data as PublishingRecord;
      }
    } catch (err: any) {
      console.warn('Supabase recordPublish exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  store.publishing_history.unshift(newRec);
  saveLocalStore(store);
  return newRec;
}

export async function listPublishingHistory(
  userId = 'user_default'
): Promise<PublishingRecord[]> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('publishing_history')
        .select('*')
        .order('published_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data as PublishingRecord[];
      }
    } catch (err: any) {
      console.warn('Supabase listPublishingHistory exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  return store.publishing_history.sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

export async function deletePublishingRecord(id: string): Promise<boolean> {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('publishing_history')
        .delete()
        .eq('id', id);
      if (error) {
        console.warn('Supabase deletePublishingRecord warning:', error.message);
      }
    } catch (err: any) {
      console.warn('Supabase deletePublishingRecord exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  const initialLen = store.publishing_history.length;
  store.publishing_history = store.publishing_history.filter((p) => p.id !== id);
  saveLocalStore(store);
  return store.publishing_history.length < initialLen;
}

export async function getUser(id = 'user_default'): Promise<User | null> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        return data as User;
      }
    } catch (err: any) {
      console.warn('Supabase getUser exception:', err?.message);
    }
  }

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

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .upsert([updatedUser])
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        const idx = store.users.findIndex((u) => u.id === userId);
        if (idx === -1) {
          store.users.push(data as User);
        } else {
          store.users[idx] = data as User;
        }
        saveLocalStore(store);
        return data as User;
      }
    } catch (err: any) {
      console.warn('Supabase saveUser exception:', err?.message);
    }
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
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('scheduled_posts')
        .select('*')
        .order('scheduled_at', { ascending: true });
      if (!error && data) {
        return data as ScheduledPost[];
      }
    } catch (err: any) {
      console.warn('Supabase listScheduledPosts exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  return (store.scheduled_posts || []).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

export async function getScheduledPost(id: string): Promise<ScheduledPost | null> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('scheduled_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        return data as ScheduledPost;
      }
    } catch (err: any) {
      console.warn('Supabase getScheduledPost exception:', err?.message);
    }
  }

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

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('scheduled_posts')
        .insert([newPost])
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        store.scheduled_posts.push(data as ScheduledPost);
        saveLocalStore(store);
        return data as ScheduledPost;
      }
    } catch (err: any) {
      console.warn('Supabase createScheduledPost exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  store.scheduled_posts.push(newPost);
  saveLocalStore(store);
  return newPost;
}

export async function updateScheduledPost(id: string, updates: Partial<ScheduledPost>): Promise<ScheduledPost | null> {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('scheduled_posts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        const store = loadLocalStore();
        const idx = store.scheduled_posts.findIndex((p) => p.id === id);
        if (idx !== -1) store.scheduled_posts[idx] = data as ScheduledPost;
        saveLocalStore(store);
        return data as ScheduledPost;
      }
    } catch (err: any) {
      console.warn('Supabase updateScheduledPost exception:', err?.message);
    }
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
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('scheduled_posts')
        .delete()
        .eq('id', id);
      if (error) console.warn('Supabase deleteScheduledPost error:', error.message);
    } catch (err: any) {
      console.warn('Supabase deleteScheduledPost exception:', err?.message);
    }
  }

  const store = loadLocalStore();
  store.scheduled_posts = (store.scheduled_posts || []).filter((p) => p.id !== id);
  saveLocalStore(store);
  return true;
}
