// KontentOS — Editorial Studio · typed backend API client.
// All calls are relative (/api/...) and served by the standalone server.ts on :4111.

import type {
  User,
  Video,
  Caption,
  ScheduledPost,
  PublishingRecord,
  SocialPlatform,
  DbStatus,
} from './types';
import type { TimelineProject, WordTimestamp } from './timeline';

export interface AutoEditStats {
  originalDurationSec: number;
  trimmedDurationSec: number;
  silenceRemovedSec: number;
  cutsCount: number;
  punchZoomsCount: number;
  sfxCount: number;
  captionsCount: number;
}

export interface AutoEditResult {
  project: TimelineProject;
  source: 'gemini' | 'local_engine';
  stats: AutoEditStats;
  message: string;
}

export interface TitleCopy {
  title: string;
  caption: string;
  hooks: string[];
  hashtags: string[];
  callToAction: string;
  suggestedTitle: string;
  ai_generated: boolean;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  async health() {
    return json<{ status: string; app: string }>(await fetch('/api/health'));
  },

  async dbStatus(): Promise<DbStatus> {
    return json<DbStatus>(await fetch('/api/db/status'));
  },

  // ---- User ----
  async getUser(): Promise<User | null> {
    const d = await json<{ data: User }>(await fetch('/api/user'));
    return d.data ?? null;
  },
  async saveUser(profile: Partial<User>): Promise<User | null> {
    const d = await json<{ data: User }>(
      await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      }),
    );
    return d.data ?? null;
  },

  // ---- Videos ----
  async listVideos(): Promise<Video[]> {
    const d = await json<{ data: Video[] }>(await fetch('/api/videos'));
    return d.data || [];
  },
  async deleteVideo(id: string) {
    return json<{ success: boolean }>(await fetch(`/api/videos/${id}`, { method: 'DELETE' }));
  },
  async updateVideo(id: string, updates: Record<string, unknown>) {
    return json<{ data: Video }>(
      await fetch(`/api/videos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    );
  },

  /** Upload a video (direct base64 for <10MB, chunked otherwise). */
  async uploadVideo(file: File, onProgress: (pct: number) => void = () => {}): Promise<Video> {
    const CHUNK = 5 * 1024 * 1024;
    const title = file.name.replace(/\.[^/.]+$/, '');

    if (file.size < 10 * 1024 * 1024) {
      onProgress(20);
      const b64 = await fileToBase64(file);
      onProgress(60);
      const d = await json<{ video: Video }>(
        await fetch('/api/upload/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileData: b64.split(',')[1] || b64,
            mimeType: file.type || 'video/mp4',
            title,
          }),
        }),
      );
      onProgress(100);
      return d.video;
    }

    const totalChunks = Math.ceil(file.size / CHUNK);
    const init = await json<{ uploadId: string }>(
      await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, totalChunks, totalSize: file.size, mimeType: file.type || 'video/mp4' }),
      }),
    );
    for (let i = 0; i < totalChunks; i++) {
      const blob = file.slice(i * CHUNK, Math.min((i + 1) * CHUNK, file.size));
      const chunkB64 = await blobToBase64(blob);
      await json(
        await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: init.uploadId, chunkIndex: i, chunkData: chunkB64.split(',')[1] || chunkB64 }),
        }),
      );
      onProgress(Math.round(((i + 1) / totalChunks) * 100));
    }
    const done = await json<{ video: Video }>(
      await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: init.uploadId, title }),
      }),
    );
    onProgress(100);
    return done.video;
  },

  // ---- Captions / copy generation ----
  async generateCaptionFromTitle(opts: {
    title: string;
    platform?: SocialPlatform;
    tone?: string;
    mode?: string;
    context?: string;
  }): Promise<Caption> {
    const d = await json<{ data: Caption }>(
      await fetch('/api/caption/generate-from-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: opts.title,
          platform: opts.platform || 'instagram',
          tone: opts.tone || 'Viral & Punchy',
          mode: opts.mode || 'all',
          context: opts.context || '',
        }),
      }),
    );
    return d.data;
  },

  /**
   * Title-grounded copy (caption + hooks + hashtags). Works offline via the
   * backend's deterministic fallback; becomes AI-powered when a key is set.
   */
  async copyFromTitle(opts: {
    title: string;
    platform?: SocialPlatform;
    tone?: string;
    context?: string;
  }): Promise<TitleCopy> {
    const d = await json<{ data: TitleCopy }>(
      await fetch('/api/caption/generate-from-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: opts.title,
          platform: opts.platform || 'instagram',
          tone: opts.tone || 'Viral & Punchy',
          mode: 'all',
          context: opts.context || '',
        }),
      }),
    );
    return d.data;
  },

  // ---- Editor (Smart-Polish EDL engine) ----
  async autoEdit(payload: {
    videoMetadata: { id: string; title?: string; duration: number; targetAspectRatio?: '9:16' | '16:9' | '1:1'; sourceUrl?: string };
    words: WordTimestamp[];
    options?: { silenceThresholdSec?: number; sfxEnabled?: boolean; punchZoomEnabled?: boolean; captionsEnabled?: boolean };
  }): Promise<AutoEditResult> {
    const d = await json<{ data: TimelineProject; source: 'gemini' | 'local_engine'; stats: AutoEditStats; message: string }>(
      await fetch('/api/editor/auto-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    return { project: d.data, source: d.source, stats: d.stats, message: d.message };
  },

  // ---- Speech-to-Text & Live AI Captions ----
  async transcribeVideo(opts: {
    videoId: string;
    targetLanguage?: string;
    apiKey?: string;
    forceRefresh?: boolean;
  }): Promise<{
    transcript: string;
    srt_content: string;
    vtt_content: string;
    language: string;
    segments: Array<{ id: number; start: string | number; end: string | number; text: string }>;
  }> {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(d.message || d.error || `Transcription failed (${res.status})`);
      (err as any).code = d.error;
      throw err;
    }
    return d.data;
  },

  async getSubtitles(videoId: string) {
    const d = await json<{
      success: boolean;
      data: {
        transcript: string;
        srt_content: string;
        vtt_content: string;
        language: string;
        segments: Array<{ id: number; start: string | number; end: string | number; text: string }>;
      };
    }>(await fetch(`/api/transcribe/${videoId}`));
    return d.data;
  },

  // ---- AI Settings & API Keys ----
  async getAiStatus(): Promise<{ success: boolean; hasGeminiKey: boolean; keyMasked: string | null; model: string }> {
    return json(await fetch('/api/settings/ai-status'));
  },

  async saveGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string; keyMasked: string }> {
    return json(
      await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      }),
    );
  },

  // ---- Schedule ----
  async getScheduled(): Promise<ScheduledPost[]> {
    const d = await json<{ data: ScheduledPost[] }>(await fetch('/api/publish/schedule'));
    return d.data || [];
  },
  async schedulePost(payload: {
    videoId: string;
    videoTitle?: string;
    fileUrl?: string;
    thumbnailUrl?: string;
    platforms?: SocialPlatform[];
    platform?: SocialPlatform;
    captionText?: string;
    hashtags?: string[];
    scheduledAt?: string;
  }) {
    return json<{ data: ScheduledPost | ScheduledPost[]; message?: string }>(
      await fetch('/api/publish/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
  },
  async deleteScheduled(id: string) {
    return json<{ success: boolean }>(await fetch(`/api/publish/schedule/${id}`, { method: 'DELETE' }));
  },
  async publishNow(id: string) {
    return json<{ success: boolean; message?: string }>(
      await fetch(`/api/publish/schedule/${id}/publish-now`, { method: 'POST' }),
    );
  },

  // ---- Publishing history ----
  async getHistory(): Promise<PublishingRecord[]> {
    const d = await json<{ data: PublishingRecord[] }>(await fetch('/api/publish/history'));
    return d.data || [];
  },

  // ---- Ideas & Spark Engine ----
  async generateIdeas(opts?: { topic?: string; niche?: string }): Promise<import('@/data/mock').Idea[]> {
    try {
      const res = await fetch('/api/script/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: opts?.topic, niche: opts?.niche }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.data && Array.isArray(d.data) && d.data.length > 0) return d.data;
      }
    } catch {
      // Fallback handled below
    }
    const { generateProceduralIdeas } = await import('./ideasEngine');
    return generateProceduralIdeas(opts?.topic, opts?.niche);
  },

  async getSavedIdeas(): Promise<import('@/data/mock').Idea[]> {
    try {
      const res = await fetch('/api/script/saved-ideas');
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.data)) return d.data;
      }
    } catch {
      // fallback to localStorage
    }
    try {
      const local = localStorage.getItem('kontentos_saved_ideas');
      if (local) return JSON.parse(local);
    } catch { /* ignore */ }
    return [];
  },

  async saveIdea(idea: import('@/data/mock').Idea): Promise<import('@/data/mock').Idea[]> {
    try {
      const res = await fetch('/api/script/saved-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(idea),
      });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.data)) {
          localStorage.setItem('kontentos_saved_ideas', JSON.stringify(d.data));
          return d.data;
        }
      }
    } catch {
      // fallback
    }
    const existing = await this.getSavedIdeas();
    const idx = existing.findIndex((i) => i.id === idea.id);
    const updated = idx >= 0 ? existing.map((i) => (i.id === idea.id ? idea : i)) : [idea, ...existing];
    try {
      localStorage.setItem('kontentos_saved_ideas', JSON.stringify(updated));
    } catch { /* ignore */ }
    return updated;
  },

  async deleteSavedIdea(id: string): Promise<import('@/data/mock').Idea[]> {
    try {
      const res = await fetch(`/api/script/saved-ideas/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.data)) {
          localStorage.setItem('kontentos_saved_ideas', JSON.stringify(d.data));
          return d.data;
        }
      }
    } catch {
      // fallback
    }
    const existing = await this.getSavedIdeas();
    const updated = existing.filter((i) => i.id !== id);
    try {
      localStorage.setItem('kontentos_saved_ideas', JSON.stringify(updated));
    } catch { /* ignore */ }
    return updated;
  },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}
