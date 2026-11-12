// KontentOS — Editorial Studio · typed backend API client.
// All calls are relative (/api/...) and served by the standalone server.ts on :4111.

import type {
  User,
  Video,
  ScheduledPost,
  PublishingRecord,
  SocialPlatform,
  DbStatus,
  WorkspaceRow,
  WorkspacePatch,
} from './types';
import type { TimelineProject, WordTimestamp } from './timeline';
import type { PressJob, PressStyleId } from './press';

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

/** Shown only when a response carries no server-written message — a proxy error page,
 *  an offline dev backend. Every route in server/ writes its own human-readable `error`. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'The studio could not accept that. Check the fields and try again.',
  401: 'Your session has ended. Please sign in again.',
  404: 'The studio could not find that item.',
  409: 'That already exists in your workspace.',
  429: 'Too many attempts — wait a moment before trying again.',
  500: 'The studio hit a server error. Try again in a moment.',
  502: 'The studio could not reach its services. Try again in a moment.',
  503: 'Storage is unavailable right now. Try again in a moment.',
};

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  // A 401 means the session cookie is gone or expired, wherever in the app it surfaces: the
  // shell listens for this so a stale tab returns to the sign-in screen instead of spinning.
  if (res.status === 401) window.dispatchEvent(new Event('kt:signedOut'));
  if (!res.ok) {
    const server = (data as { error?: string }).error;
    const err = new Error(server || STATUS_MESSAGES[res.status] || `The studio could not complete that (${res.status}).`);
    // 400 means the server will never accept this payload, so a caller that is retrying on its own
    // (the workspace save) knows to stop instead of hammering a request it already refused.
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  async health() {
    return json<{ status: string; app: string }>(await fetch('/api/health'));
  },

  async dbStatus(): Promise<DbStatus> {
    return json<DbStatus>(await fetch('/api/db/status'));
  },

  // ---- Account ----
  /** The signed-in creator, or null when nobody is signed in. Never throws for a plain 401. */
  async authMe(): Promise<User | null> {
    try {
      const d = await json<{ data: User | null }>(await fetch('/api/auth/me'));
      return d.data ?? null;
    } catch {
      return null;
    }
  },

  async signUp(input: { email: string; full_name: string; password: string }): Promise<User> {
    const d = await json<{ data: User }>(
      await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    return d.data;
  },

  async signIn(email: string, password: string): Promise<User> {
    const d = await json<{ data: User }>(
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    return d.data;
  },

  async signOut(): Promise<void> {
    await json<{ success: boolean }>(
      await fetch('/api/auth/logout', { method: 'POST' }),
    );
  },

  // The server revokes this session on success, so the caller must sign in again afterwards.
  async changePassword(current: string, next: string): Promise<void> {
    await json<{ success: boolean }>(
      await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
      }),
    );
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

  // ---- Workspace ----
  /** The creator's desk: Room switches, Brand Kit, lit cut, last station, open timeline and draft. */
  async getWorkspace(signal?: AbortSignal): Promise<WorkspaceRow | null> {
    const d = await json<{ data: WorkspaceRow | null }>(await fetch('/api/workspace', { signal }));
    return d.data ?? null;
  },

  /**
   * Save named slots and get the stored row back. `keepalive` is for the save on page hide, where
   * an ordinary fetch is cancelled the moment the tab goes away — which is the last edit a creator
   * makes before closing the laptop.
   */
  async patchWorkspace(patch: WorkspacePatch, keepalive = false): Promise<WorkspaceRow> {
    const d = await json<{ data: WorkspaceRow }>(
      await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
        keepalive,
      }),
    );
    return d.data;
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

  /**
   * Upload a video (direct base64 for <10MB, chunked otherwise) with exact duration probing.
   * `relinkId` re-attaches the bytes to a record that already exists — the path back from a clip
   * whose file died on a redeploy while its row, captions and queue position survived.
   */
  async uploadVideo(
    file: File,
    onProgress: (pct: number) => void = () => {},
    relinkId?: string
  ): Promise<Video> {
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
            videoId: relinkId,
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
        body: JSON.stringify({
          fileName: file.name,
          totalChunks,
          totalSize: file.size,
          mimeType: file.type || 'video/mp4',
          videoId: relinkId,
        }),
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
  /**
   * Title-grounded copy (caption + hooks + hashtags). Works offline via the
   * backend's deterministic fallback; becomes AI-powered when a key is set.
   */
  async copyFromTitle(opts: {
    title: string;
    platform?: SocialPlatform;
    tone?: string;
    context?: string;
    temperature?: number;
    model?: string;
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
          temperature: opts.temperature,
          model: opts.model,
        }),
      }),
    );
    return d.data;
  },

  /**
   * Headline, takeaway and caption for a static card. The Room's model and the Brand Kit's voice
   * travel with the prompt, so what the panel says about the engine is true of this call.
   */
  async generateStaticCardCopy(opts: {
    prompt: string;
    format?: string;
    tone?: string;
    context?: string;
    model?: string;
  }): Promise<{ headline: string; supportingText: string; socialCaption?: string; modelUsed?: string; fallback?: boolean }> {
    // 1. Primary: the card-copy route, with the engine cascade behind it
    try {
      const res = await fetch('/api/static-card/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: opts.prompt,
          format: opts.format || 'instagram-overlay',
          tone: opts.tone,
          context: opts.context,
          model: opts.model,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.headline && data?.supportingText) {
          return {
            headline: data.headline,
            supportingText: data.supportingText,
            socialCaption: data.socialCaption || '',
            modelUsed: data.modelUsed,
          };
        }
      }
    } catch (primaryErr) {
      console.warn('[api.generateStaticCardCopy] Primary endpoint error, trying fallback...', primaryErr);
    }

    // 2. Secondary fallback: Try /api/caption/text-gen with structured prompt
    try {
      const systemPrompt = `You are writing the words on one static social card (format: ${opts.format || 'instagram-overlay'}).
${opts.tone ? `Tone: ${opts.tone}.` : ''}
${opts.context ? `Write inside this creator's own voice — use it, do not describe it:\n${opts.context}` : ''}

The card has three parts, for the topic below:
1. "headline": the claim itself, one to two sentences, max 18 words.
2. "supportingText": the useful part — the step, the number or the trade-off. Two to three sentences, max 35 words.
3. "socialCaption": the caption that goes with the card, paragraph breaks and three or four hashtags.

TOPIC: "${opts.prompt}"

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

    // Neither endpoint answered, so nothing was written for this creator. The card's shape — hook,
    // takeaway, caption — is the reusable part; every bracket is a line they fill from their own
    // thinking. `fallback` is what the panel says out loud instead of claiming an engine wrote it.
    const seed = opts.prompt.replace(/^(how to|why|the|a|an)\s+/i, '').trim() || 'this topic';
    return {
      headline: `[the hook about ${seed} — one line, in your own words]`,
      supportingText: '[the takeaway, the number or the scene that backs it]',
      socialCaption: `${seed}\n\n[the opening line]\n\n[what the reader should do]\n\nKontentOS scaffold — no engine answered, so these lines are yours.`,
      fallback: true,
    };
  },

  /**
   * A whole carousel arc — the claim, the moves, the close — from the same engine as the single card.
   */
  async generateStaticCarouselDeck(opts: {
    prompt: string;
    slideCount?: number;
    tone?: string;
    context?: string;
    model?: string;
  }): Promise<{
    slides: Array<{ id: number; headline: string; supportingText: string }>;
    socialCaption?: string;
    modelUsed?: string;
  }> {
    try {
      const res = await fetch('/api/static-card/generate-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: opts.prompt,
          slideCount: opts.slideCount || 5,
          tone: opts.tone,
          context: opts.context,
          model: opts.model,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.slides) && data.slides.length > 0) {
          return {
            slides: data.slides,
            socialCaption: data.socialCaption || '',
            modelUsed: data.modelUsed,
          };
        }
      }
    } catch (deckErr) {
      console.warn('[api.generateStaticCarouselDeck] Error:', deckErr);
    }

    // No engine answer, so no words are put in the creator's mouth. The deck's shape — claim, three
    // moves, close — is the reusable part; every bracket is a line they fill from their own thinking.
    const seed = opts.prompt.replace(/^(how to|why|the|a|an)\s+/i, '').trim() || 'this topic';
    return {
      slides: [
        {
          id: 1,
          headline: `[the claim you are making about ${seed}]`,
          supportingText: '[why you are making it — one sentence, in your own words]',
        },
        {
          id: 2,
          headline: 'Move 1: [what you actually do first]',
          supportingText: '[what goes wrong when you skip it]',
        },
        {
          id: 3,
          headline: 'Move 2: [the second thing you do]',
          supportingText: '[the number, the scene or the outcome that backs it]',
        },
        {
          id: 4,
          headline: 'Move 3: [the third thing you do]',
          supportingText: '[what changed for you after you started doing it]',
        },
        {
          id: 5,
          headline: `[what the reader should do next about ${seed}]`,
          supportingText: 'KontentOS scaffold — no engine answered, so these lines are yours. Fill every bracket before exporting.',
        },
      ],
      socialCaption: `${seed}\n\n[the hook]\n\n[what the deck covers]\n\nKontentOS scaffold — nothing here was written for you by a model. Fill the brackets, then delete this line.`,
    };
  },

  /**
   * Rewrite the one slide the creator is standing on, with its neighbours for continuity.
   * No engine answer is a failure — the modal says so rather than writing words for the creator.
   */
  async regenerateCarouselSlide(opts: {
    slideIndex: number;
    totalSlides?: number;
    currentSlide: { headline: string; supportingText: string };
    previousSlide?: { headline: string; supportingText: string } | null;
    nextSlide?: { headline: string; supportingText: string } | null;
    topic?: string;
    instruction?: string;
    tone?: string;
    context?: string;
    model?: string;
  }): Promise<{ headline: string; supportingText: string; modelUsed?: string }> {
    const res = await fetch('/api/static-card/regenerate-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data?.error || 'The copy engine did not answer. Try again in a moment.');
    }

    const data = await res.json();
    if (!data?.slide?.headline && !data?.slide?.supportingText) {
      throw new Error('The copy engine sent back nothing readable.');
    }

    return {
      headline: data.slide.headline || opts.currentSlide.headline,
      supportingText: data.slide.supportingText || opts.currentSlide.supportingText,
      modelUsed: data.modelUsed,
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
    forceRefresh?: boolean;
    /** Intake runs this in the background; a wedged engine must not hold the pill on "working" forever. */
    signal?: AbortSignal;
  }): Promise<{
    transcript: string;
    srt_content: string;
    vtt_content: string;
    language: string;
    /** False when the server only produced placeholder cues, which it deliberately does not store. */
    persisted?: boolean;
    segments: Array<{ id: number; start: string | number; end: string | number; text: string }>;
  }> {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: opts.videoId,
        targetLanguage: opts.targetLanguage,
        forceRefresh: opts.forceRefresh,
      }),
      signal: opts.signal,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(d.message || d.error || `Transcription failed (${res.status})`);
      (err as any).code = d.error;
      throw err;
    }
    return d.data;
  },

  /**
   * The creator's typed or dictated script, stored as this clip's cues. Nothing is generated here —
   * the server only splits the text it is handed.
   */
  async saveScriptCues(videoId: string, transcriptText: string, language = 'English') {
    const res = await fetch('/api/transcribe/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, transcriptText, language }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Could not save the script');
    return d.data as { video_id: string; segments: unknown[] };
  },

  async getSubtitles(videoId: string, signal?: AbortSignal) {
    const d = await json<{
      success: boolean;
      // null is the ordinary answer for a take nobody has captioned yet.
      data: {
        transcript?: string;
        transcript_text?: string;
        srt_content: string;
        vtt_content: string;
        language: string;
        segments: Array<{ id: number; start: string | number; end: string | number; text: string }>;
      } | null;
    }>(await fetch(`/api/transcribe/${videoId}`, { signal }));
    if (!d.data) return null;
    // The stored row names the words `transcript_text`, while every reader in this app asks for
    // `transcript`. Left unmapped, auto-edit saw real cues as having no speech and wrote copy from
    // the title instead.
    return { ...d.data, transcript: (d.data.transcript || d.data.transcript_text || '').trim() };
  },

  // ---- AI Settings & API Keys ----
  async getAiStatus(): Promise<{ success: boolean; hasGeminiKey: boolean; keyMasked: string | null; editable?: boolean; model: string }> {
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
    platformCustomizations?: Record<string, { captionText: string; hashtags: string[] }>;
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
  async publishNow(id: string, body?: { postUrl?: string; publishedAt?: string }) {
    return json<{ success: boolean; message?: string; data?: ScheduledPost }>(
      await fetch(`/api/publish/schedule/${id}/publish-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      }),
    );
  },

  // ---- Publishing history ----
  async getHistory(): Promise<PublishingRecord[]> {
    const d = await json<{ data: PublishingRecord[] }>(await fetch('/api/publish/history'));
    return d.data || [];
  },

  // ---- Ideas & Spark Engine ----
  async generateIdeas(opts?: {
    topic?: string;
    niche?: string;
    tone?: string;
    context?: string;
    temperature?: number;
    model?: string;
  }): Promise<import('@/data/mock').Idea[]> {
    try {
      const res = await fetch('/api/script/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: opts?.topic,
          niche: opts?.niche,
          tone: opts?.tone,
          context: opts?.context || '',
          temperature: opts?.temperature,
          model: opts?.model,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        // The server returns finished cards, artwork ids included.
        if (Array.isArray(d.data) && d.data.length > 0) return d.data;
      }
    } catch {
      // Fallback handled below
    }
    const { generateScaffoldIdeas } = await import('./ideasEngine');
    return generateScaffoldIdeas(opts?.topic, opts?.niche);
  },

  // Saved ideas belong to the signed-in account and are stored server-side, so there is no
  // browser cache to fall back to — reading one would show the previous creator's briefs.
  async getSavedIdeas(): Promise<import('@/data/mock').Idea[]> {
    const d = await json<{ data: import('@/data/mock').Idea[] }>(await fetch('/api/script/saved-ideas'));
    return Array.isArray(d.data) ? d.data : [];
  },

  async saveIdea(idea: import('@/data/mock').Idea): Promise<import('@/data/mock').Idea[]> {
    const d = await json<{ data: import('@/data/mock').Idea[] }>(
      await fetch('/api/script/saved-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(idea),
      }),
    );
    return Array.isArray(d.data) ? d.data : [];
  },

  async deleteSavedIdea(id: string): Promise<import('@/data/mock').Idea[]> {
    const d = await json<{ data: import('@/data/mock').Idea[] }>(
      await fetch(`/api/script/saved-ideas/${id}`, { method: 'DELETE' }),
    );
    return Array.isArray(d.data) ? d.data : [];
  },

  // ---- Press ----
  // One click that comes back with a reel, a carousel and caption files. The server picks the span
  // and writes everything it can reach; the reel itself is encoded in this tab and filed afterwards.
  async startPress(input: {
    videoId: string;
    style: PressStyleId;
    tone?: string;
    context?: string;
    model?: string;
  }): Promise<PressJob> {
    const d = await json<{ data: PressJob }>(
      await fetch('/api/press', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    return d.data;
  },

  async getPresses(): Promise<PressJob[]> {
    const d = await json<{ data: PressJob[] }>(await fetch('/api/press'));
    return Array.isArray(d.data) ? d.data : [];
  },

  async getPress(id: string): Promise<PressJob | null> {
    const d = await json<{ data: PressJob | null }>(await fetch(`/api/press/${id}`));
    return d.data ?? null;
  },

  /**
   * Say what the browser's encode came out as: either the clip it uploaded, or the reason it did
   * not. The reply is the settled job, read back from the vault — the length and size a press
   * reports are the server's own numbers, never the ones the tab claimed.
   */
  async settlePressReel(id: string, reel: { clipVideoId?: string; error?: string }): Promise<PressJob> {
    const d = await json<{ data: PressJob }>(
      await fetch(`/api/press/${id}/reel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reel),
      }),
    );
    return d.data;
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
