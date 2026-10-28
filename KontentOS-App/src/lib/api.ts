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

  /** Upload a video (direct base64 for <10MB, chunked otherwise) with exact duration probing. */
  async uploadVideo(file: File, onProgress: (pct: number) => void = () => {}): Promise<Video> {
    const CHUNK = 5 * 1024 * 1024;
    const title = file.name.replace(/\.[^/.]+$/, '');
    const probedDuration = await probeVideoDuration(file);

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
            duration: probedDuration > 0 ? probedDuration : undefined,
          }),
        }),
      );
      onProgress(100);
      if (probedDuration > 0 && !d.video.duration) {
        d.video.duration = probedDuration;
      }
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
        body: JSON.stringify({
          uploadId: init.uploadId,
          title,
          duration: probedDuration > 0 ? probedDuration : undefined,
        }),
      }),
    );
    onProgress(100);
    if (probedDuration > 0 && !done.video.duration) {
      done.video.duration = probedDuration;
    }
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

  /**
   * Generates dynamic high-converting headline, tactical takeaway, and caption
   * for static social cards via Google Gemini AI.
   */
  async generateStaticCardCopy(opts: {
    prompt: string;
    format?: string;
  }): Promise<{ headline: string; supportingText: string; socialCaption?: string }> {
    // 1. Primary: Specialized static card Gemini AI endpoint with model cascades
    try {
      const res = await fetch('/api/static-card/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: opts.prompt,
          format: opts.format || 'instagram-overlay',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.headline && data?.supportingText) {
          return {
            headline: data.headline,
            supportingText: data.supportingText,
            socialCaption: data.socialCaption || '',
          };
        }
      }
    } catch (primaryErr) {
      console.warn('[api.generateStaticCardCopy] Primary endpoint error, trying fallback...', primaryErr);
    }

    // 2. Secondary fallback: Try /api/caption/text-gen with structured prompt
    try {
      const systemPrompt = `You are an elite ghostwriter and viral content strategist for Instagram, LinkedIn, and X.
Generate highly specific, authoritative, non-generic copy for a visual social card (Format: ${opts.format || 'instagram-overlay'}).

TOPIC / PROMPT: "${opts.prompt}"

CRITICAL REQUIREMENTS:
1. "headline": A bold, magnetic 1-2 sentence hook statement (max 18 words).
2. "supportingText": A sharp 2-3 sentence tactical takeaway or framework breakdown (max 35 words).
3. "socialCaption": Accompanying full caption formatted with paragraph breaks and 3-4 hashtags.

Respond ONLY with pure JSON matching this exact structure:
{
  "headline": "...",
  "supportingText": "...",
  "socialCaption": "..."
}`;

      const d = await json<{ success: boolean; text: string }>(
        await fetch('/api/caption/text-gen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: systemPrompt }),
        }),
      );

      const rawText = (d.text || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      try {
        const parsed = JSON.parse(rawText);
        if (parsed && parsed.headline && (parsed.supportingText || parsed.description)) {
          return {
            headline: parsed.headline,
            supportingText: parsed.supportingText || parsed.description,
            socialCaption: parsed.socialCaption || '',
          };
        }
      } catch {
        const lines = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
          return {
            headline: lines[0].replace(/^["'#*\s]+|["'*\s]+$/g, ''),
            supportingText: lines.slice(1).join(' ').replace(/^["'#*\s]+|["'*\s]+$/g, ''),
            socialCaption: '',
          };
        }
      }
    } catch (fallbackErr) {
      console.warn('[api.generateStaticCardCopy] Fallback text-gen error:', fallbackErr);
    }

    // 3. Resilient synthesis fallback ensuring UI never breaks
    const cleanTopic = opts.prompt.replace(/^(how to|why|the|a|an)\s+/i, '').trim();
    return {
      headline: `The real reason creators struggle with ${cleanTopic}: they optimize for willpower instead of repeatable leverage.`,
      supportingText: `Break the cycle: decouple your capture phase from final execution, batch modular assets weekly, and build friction-free publishing habits.`,
      socialCaption: `Consistency is not about discipline—it is an operations architecture.\n\nSave this framework for your next production sprint.\n\n#ContentStrategy #CreatorEconomy #KontentOS`,
    };
  },

  /**
   * Generates a complete 5-7 slide carousel story arc via Google Gemini AI.
   */
  async generateStaticCarouselDeck(opts: {
    prompt: string;
    slideCount?: number;
  }): Promise<{
    slides: Array<{ id: number; headline: string; supportingText: string }>;
    socialCaption?: string;
  }> {
    try {
      const res = await fetch('/api/static-card/generate-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: opts.prompt,
          slideCount: opts.slideCount || 5,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.slides) && data.slides.length > 0) {
          return {
            slides: data.slides,
            socialCaption: data.socialCaption || '',
          };
        }
      }
    } catch (deckErr) {
      console.warn('[api.generateStaticCarouselDeck] Error:', deckErr);
    }

    // High-signal fallback deck if offline or network error
    const seed = opts.prompt.replace(/^(how to|why|the|a|an)\s+/i, '').trim() || 'Content Systems';
    return {
      slides: [
        {
          id: 1,
          headline: `Most creators fail at [${seed}] because they lack an engine.`,
          supportingText: 'Here is the high-leverage 3-part framework the top 0.1% use to turn 1 insight into compound growth.',
        },
        {
          id: 2,
          headline: 'Phase 1: Decouple [Ideation from Production].',
          supportingText: 'Never edit in the moment you brainstorm. Capture raw uncensored thoughts first into a scratchpad repository.',
        },
        {
          id: 3,
          headline: 'Phase 2: Use [Visual Archetypes & Targeted Glows].',
          supportingText: 'Text cards outperform static photos 3:1 on LinkedIn because they force high-contrast readability in dark feeds.',
        },
        {
          id: 4,
          headline: 'Phase 3: Turn one hook into [Multiple Distribution Channels].',
          supportingText: 'Export to LinkedIn PDF, Instagram 4:5 carousels, and Twitter cards with identical narrative pacing.',
        },
        {
          id: 5,
          headline: 'Save this deck and [Deploy It This Week].',
          supportingText: 'Consistency is not about motivation—it is about systems that make publishing feel frictionless.',
        },
      ],
      socialCaption: `The complete blueprint for ${seed}.\n\nSave this carousel for your next production sprint.\n\n#ContentStrategy #CreatorEconomy #KontentOS`,
    };
  },

  /**
   * Rewrites/regenerates a single slide with full narrative continuity context
   * using Google Gemini AI. (Task 2.4.1)
   */
  async regenerateCarouselSlide(opts: {
    slideIndex: number;
    totalSlides?: number;
    currentSlide: { headline: string; supportingText: string };
    previousSlide?: { headline: string; supportingText: string } | null;
    nextSlide?: { headline: string; supportingText: string } | null;
    topic?: string;
    instruction?: string;
  }): Promise<{ headline: string; supportingText: string; modelUsed?: string }> {
    try {
      const res = await fetch('/api/static-card/regenerate-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.slide?.headline || data?.slide?.supportingText) {
          return {
            headline: data.slide.headline || opts.currentSlide.headline,
            supportingText: data.slide.supportingText || opts.currentSlide.supportingText,
            modelUsed: data.modelUsed,
          };
        }
      }
    } catch (err) {
      console.warn('[api.regenerateCarouselSlide] Network error calling endpoint:', err);
    }

    // High-signal fallback if offline or server timeout
    const baseHeadline = opts.currentSlide.headline || `Key Point #${opts.slideIndex}`;
    const bracketed = baseHeadline.includes('[')
      ? baseHeadline
      : `Step ${opts.slideIndex}: [${baseHeadline.replace(/^Step\s+\d+:?\s*/i, '').slice(0, 32)}]`;

    return {
      headline: bracketed,
      supportingText: opts.currentSlide.supportingText || 'Focus on high-leverage creation systems and asset reuse.',
      modelUsed: 'client-fallback',
    };
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
    status?: 'scheduled' | 'published';
    publishedAt?: string;
  }) {
    return json<{ data: ScheduledPost | ScheduledPost[]; message?: string }>(
      await fetch('/api/publish/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
  },
  async updateScheduled(
    id: string,
    patch: {
      videoTitle?: string;
      platform?: SocialPlatform;
      captionText?: string;
      hashtags?: string[];
      scheduledAt?: string;
      status?: 'scheduled' | 'published';
    },
  ) {
    return json<{ data: ScheduledPost; message?: string }>(
      await fetch(`/api/publish/schedule/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
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

export function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const url = URL.createObjectURL(file);
      const timer = setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch {}
        resolve(0);
      }, 6000);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        const dur = video.duration;
        try { URL.revokeObjectURL(url); } catch {}
        resolve(Number.isFinite(dur) && dur > 0 ? Number(dur.toFixed(2)) : 0);
      };
      video.onerror = () => {
        clearTimeout(timer);
        try { URL.revokeObjectURL(url); } catch {}
        resolve(0);
      };
      video.src = url;
    } catch {
      resolve(0);
    }
  });
}

export function probeUrlDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const timer = setTimeout(() => {
        resolve(0);
      }, 6000);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        const dur = video.duration;
        resolve(Number.isFinite(dur) && dur > 0 ? Number(dur.toFixed(2)) : 0);
      };
      video.onerror = () => {
        clearTimeout(timer);
        resolve(0);
      };
      video.src = url;
    } catch {
      resolve(0);
    }
  });
}
