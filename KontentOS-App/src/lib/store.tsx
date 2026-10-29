import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { AutoEditStats } from './api';
import type { User, Video, ScheduledPost, PublishingRecord, DbStatus, SocialPlatform, ActiveDraft } from './types';
import type { Idea } from '@/data/mock';
import { navigate, type ScreenId } from './nav';
import {
  applyCaptionsToProject,
  applyPresetLook,
  buildCaptionsFromSegments,
  buildLocalProject,
  cloneProject,
  parseSrtTimeToSeconds,
  synthesizeWords,
  textClips,
  toggleCaptionsTrack,
  videoClips,
  sfxClips,
} from './timeline';
import type { TimelineProject, EditPreset, TextClip, WordTimestamp } from './timeline';

const MAX_HISTORY = 50;

export interface AutoEditOutcome {
  ok: boolean;
  project: TimelineProject | null;
  stats: AutoEditStats | null;
  source: 'gemini' | 'local_engine' | 'none';
  offline?: boolean;
  caption: string;
  hashtags: string[];
  message?: string;
}

function deriveStats(project: TimelineProject): AutoEditStats {
  const punch = videoClips(project).reduce(
    (n, c) => n + (c.keyframes?.filter((k) => k.scale > 1.1).length ?? 0),
    0,
  );
  const trimmed = project.projectMetadata.totalDuration;
  const original = videoClips(project).reduce((m, c) => Math.max(m, c.sourceStartOffset + c.duration), 0);
  return {
    originalDurationSec: Number((original || trimmed).toFixed(2)),
    trimmedDurationSec: Number(trimmed.toFixed(2)),
    silenceRemovedSec: Number(Math.max(0, original - trimmed).toFixed(2)),
    cutsCount: videoClips(project).length,
    punchZoomsCount: punch,
    sfxCount: sfxClips(project).length,
    captionsCount: textClips(project).length,
  };
}


interface StoreValue {
  online: boolean;
  loading: boolean;
  user: User | null;
  videos: Video[];
  scheduled: ScheduledPost[];
  history: PublishingRecord[];
  dbStatus: DbStatus | null;
  project: TimelineProject | null;
  setProject: (p: TimelineProject | null) => void;
  runAutoEdit: (video: Video, preset: EditPreset) => Promise<AutoEditOutcome>;
  /** Editor history stack — Smart Editor mutations. */
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  historyCount: { past: number; future: number };
  /** Load a project fresh, resetting the undo history (e.g. Raw → Reel hand-off). */
  loadProject: (p: TimelineProject) => void;
  /** Apply an immutable editorial mutation, snapshotting history. Return false if no-op. */
  applyEdit: (
    mutate: (p: TimelineProject) => TimelineProject | null,
    options?: { label?: string; skipHistory?: boolean }
  ) => boolean;
  undo: () => void;
  redo: () => void;
  refresh: () => Promise<void>;
  uploadVideo: (file: File, onProgress: (pct: number) => void) => Promise<Video | null>;
  updateVideo: (id: string, updates: Record<string, unknown>) => Promise<void>;
  deleteVideo: (id: string) => Promise<void>;
  schedulePost: (payload: {
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
  }) => Promise<{ ok: boolean; message?: string; ids?: string[] }>;
  updateScheduled: (
    id: string,
    patch: {
      videoTitle?: string;
      platform?: SocialPlatform;
      captionText?: string;
      hashtags?: string[];
      scheduledAt?: string;
      status?: 'scheduled' | 'published';
    },
  ) => Promise<{ ok: boolean; message?: string }>;
  deleteScheduled: (id: string) => Promise<void>;
  publishNow: (id: string) => Promise<{ ok: boolean; message?: string }>;
  saveUser: (profile: Partial<User>) => Promise<boolean>;

  /** Closed-loop pipeline state & inter-screen handoffs */
  activeDraft: ActiveDraft | null;
  setActiveDraft: (draft: ActiveDraft | null) => void;
  updateActiveDraft: (patch: Partial<ActiveDraft>) => void;
  startProductionFromIdea: (idea: any) => void;
  handoffReelToEditor: (project: TimelineProject, video?: Video) => void;
  handoffEditorToPublish: (
    project: TimelineProject,
    copy?: { caption?: string; hashtags?: string[] },
    exported?: { videoUrl: string; byteLength?: number },
  ) => void;
  navigate: (screen: ScreenId, payload?: any) => void;

  /** Live AI Captions & Subtitles Engine */
  generateLiveCaptions: (
    videoIdOrOpts:
      | string
      | { videoId: string; style?: Partial<TextClip['style']>; language?: string; forceRefresh?: boolean; apiKey?: string },
    maybeOpts?: { style?: Partial<TextClip['style']>; language?: string; forceRefresh?: boolean; apiKey?: string },
  ) => Promise<{ ok: boolean; count: number; transcript?: string; code?: string; message: string }>;
  toggleCaptions: (enabled?: boolean) => void;
  isCaptionsActive: boolean;

  /** Saved Ideas Archive */
  savedIdeas: Idea[];
  saveIdea: (idea: Idea) => Promise<void>;
  removeSavedIdea: (id: string) => Promise<void>;
  isSavedIdea: (id: string) => boolean;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [history, setHistory] = useState<PublishingRecord[]>([]);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  // Saved ideas come from the account's own rows in the database. They used to be mirrored in
  // localStorage, which would have shown one creator's briefs to the next person on the browser.
  const [savedIdeas, setSavedIdeas] = useState<Idea[]>([]);
  const [project, setProjectState] = useState<TimelineProject | null>(() => {
    try {
      const saved = localStorage.getItem('kontentos_working_project');
      if (saved) return JSON.parse(saved);
      const draft = localStorage.getItem('kontentos_active_draft');
      if (draft) {
        const d = JSON.parse(draft);
        if (d.project) return d.project;
      }
    } catch {}
    return null;
  });
  const projectRef = useRef<TimelineProject | null>(project);
  interface HistoryEntry {
    project: TimelineProject;
    label: string;
    timestamp: number;
  }

  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const [histTick, setHistTick] = useState(0);

  const commit = useCallback((next: TimelineProject | null) => {
    projectRef.current = next;
    setProjectState(next);
    try {
      if (next) localStorage.setItem('kontentos_working_project', JSON.stringify(next));
      else localStorage.removeItem('kontentos_working_project');
    } catch {}
  }, []);
  const bump = useCallback(() => setHistTick((n) => (n + 1) % 1_000_000), []);

  /** Replace the working project and clear the undo stack (a fresh assembly/load). */
  const setProject = useCallback(
    (p: TimelineProject | null) => {
      pastRef.current = [];
      futureRef.current = [];
      commit(p);
      bump();
    },
    [commit, bump],
  );

  const loadProject = useCallback(
    (p: TimelineProject) => {
      pastRef.current = [];
      futureRef.current = [];
      commit(p);
      bump();
    },
    [commit, bump],
  );

  /** Apply an immutable editorial mutation with an undo snapshot. False when no-op. */
  const applyEdit = useCallback<StoreValue['applyEdit']>(
    (mutate, options) => {
      const cur = projectRef.current;
      if (!cur) return false;
      const next = mutate(cloneProject(cur));
      if (!next) return false;

      if (!options?.skipHistory) {
        pastRef.current = [
          ...pastRef.current.slice(-MAX_HISTORY + 1),
          { project: cur, label: options?.label || 'Edit timeline', timestamp: Date.now() },
        ];
        futureRef.current = [];
      }

      commit(next);
      bump();
      return true;
    },
    [commit, bump],
  );

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    const cur = projectRef.current;
    const previousEntry = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    if (cur) {
      futureRef.current = [
        { project: cur, label: previousEntry.label, timestamp: Date.now() },
        ...futureRef.current,
      ];
    }
    commit(previousEntry.project);
    bump();
  }, [commit, bump]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const cur = projectRef.current;
    const nextEntry = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    if (cur) {
      pastRef.current = [
        ...pastRef.current,
        { project: cur, label: nextEntry.label, timestamp: Date.now() },
      ];
    }
    commit(nextEntry.project);
    bump();
  }, [commit, bump]);


  const refresh = useCallback(async () => {
    try {
      const [u, v, s, h, d, si] = await Promise.all([
        api.getUser().catch(() => null),
        api.listVideos().catch(() => []),
        api.getScheduled().catch(() => []),
        api.getHistory().catch(() => []),
        api.dbStatus().catch(() => null),
        api.getSavedIdeas().catch(() => null),
      ]);
      setUser(u);
      setVideos(v);
      setScheduled(s);
      setHistory(h);
      setDbStatus(d);
      // Every call above swallows its own error, so Promise.all never rejects. dbStatus is
      // the only one that reports absence (null), so it is what actually detects downtime.
      const serverReached = d !== null;
      setOnline(serverReached);
      // null means the request failed; an empty list is a real answer and replaces what is shown.
      if (si) setSavedIdeas(si);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadVideo = useCallback<StoreValue['uploadVideo']>(async (file, onProgress) => {
    try {
      const video = await api.uploadVideo(file, onProgress);
      setVideos((prev) => [video, ...prev]);
      return video;
    } catch (err) {
      console.error('Upload failed:', err);
      return null;
    }
  }, []);

  const updateVideo = useCallback(async (id: string, updates: Record<string, unknown>) => {
    try {
      await api.updateVideo(id, updates);
      setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...updates } : v)));
    } catch (err) {
      console.error('Update video failed:', err);
    }
  }, []);

  const deleteVideo = useCallback(async (id: string) => {
    try {
      await api.deleteVideo(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      console.error('Delete video failed:', err);
    }
  }, []);

  const schedulePost = useCallback<StoreValue['schedulePost']>(async (payload) => {
    try {
      const res = await api.schedulePost(payload);
      const s = await api.getScheduled();
      setScheduled(s);
      const created = Array.isArray(res.data) ? res.data : [res.data].filter(Boolean);
      return { ok: true, message: res.message, ids: created.map((p) => p.id) };
    } catch (err) {
      // A server-side rejection (validation, 500) must surface as a failure: the local
      // fallback below is memory-only and disappears on the next refresh().
      if (!(err instanceof TypeError)) {
        return { ok: false, message: err instanceof Error ? err.message : 'Could not save to Calendar' };
      }
      // Local fallback in case offline or API endpoint is unreachable
      const targetPlatforms = payload.platforms?.length ? payload.platforms : [payload.platform || 'instagram'];
      const fallbackPosts: ScheduledPost[] = targetPlatforms.map((plat) => ({
        id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        video_id: payload.videoId,
        video_title: payload.videoTitle || 'Static Creator Post',
        file_url: payload.fileUrl || '',
        thumbnail_url: payload.thumbnailUrl || '',
        platform: plat,
        caption_text: payload.captionText || '',
        hashtags: payload.hashtags || [],
        scheduled_at: payload.scheduledAt || new Date().toISOString(),
        status: payload.status || 'scheduled',
        published_at: payload.status === 'published' ? (payload.publishedAt || new Date().toISOString()) : undefined,
        created_at: new Date().toISOString(),
      }));
      setScheduled((prev) => [...fallbackPosts, ...prev]);
      return { ok: true, message: 'Saved to this browser only — server unreachable, it will not survive a reload' };
    }
  }, []);

  const updateScheduled = useCallback<StoreValue['updateScheduled']>(async (id, patch) => {
    try {
      const res = await api.updateScheduled(id, patch);
      setScheduled(await api.getScheduled());
      return { ok: true, message: res.message };
    } catch (err) {
      if (!(err instanceof TypeError)) {
        return { ok: false, message: err instanceof Error ? err.message : 'Could not update the post' };
      }
      // Offline: apply the edit in memory so the Calendar matches what the creator typed.
      setScheduled((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                video_title: patch.videoTitle ?? p.video_title,
                platform: patch.platform ?? p.platform,
                caption_text: patch.captionText ?? p.caption_text,
                hashtags: patch.hashtags ?? p.hashtags,
                scheduled_at: patch.scheduledAt ?? p.scheduled_at,
                status: patch.status ?? p.status,
              }
            : p,
        ),
      );
      return { ok: true, message: 'Updated in this browser only — server unreachable' };
    }
  }, []);

  const deleteScheduled = useCallback(async (id: string) => {
    try {
      await api.deleteScheduled(id);
      setScheduled((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Delete scheduled failed:', err);
    }
  }, []);

  const publishNow = useCallback<StoreValue['publishNow']>(async (id) => {
    try {
      const res = await api.publishNow(id);
      const [s, h] = await Promise.all([api.getScheduled(), api.getHistory()]);
      setScheduled(s);
      setHistory(h);
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }, []);

  const saveUser = useCallback(async (profile: Partial<User>): Promise<boolean> => {
    try {
      const updated = await api.saveUser(profile);
      if (updated) {
        setUser(updated);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Save user failed:', err);
      return false;
    }
  }, []);

  /** Run the Smart-Polish EDL engine for a clip + preset. Server engine first,
   *  deterministic local build if /api is unreachable. Always yields a project. */
  const runAutoEdit = useCallback<StoreValue['runAutoEdit']>(async (video, preset) => {
    const duration = video.duration || 20;
    let caption = '';
    let hashtags: string[] = [];
    let spoken = video.title;
    let realWords: WordTimestamp[] | null = null;

    // Prioritize real speech-to-text transcription from AI video analysis
    try {
      let subs = await api.getSubtitles(video.id);
      if (!subs?.segments?.length && !subs?.transcript) {
        subs = await api.transcribeVideo({ videoId: video.id, forceRefresh: false }).catch(() => null as any);
      }

      if (subs && subs.transcript && subs.segments?.length) {
        const fullTranscript = subs.transcript;
        caption = fullTranscript;
        spoken = fullTranscript;
        realWords = [];
        for (const seg of subs.segments) {
          const segStart = parseSrtTimeToSeconds(seg.start);
          const segEnd = parseSrtTimeToSeconds(seg.end);
          const segWords = seg.text.trim().split(/\s+/).filter(Boolean);
          if (!segWords.length) continue;
          const wordDur = Math.max(0.15, (segEnd - segStart) / segWords.length);
          segWords.forEach((w, idx) => {
            realWords!.push({
              word: w,
              start: Number((segStart + idx * wordDur).toFixed(2)),
              end: Number((segStart + (idx + 1) * wordDur).toFixed(2)),
            });
          });
        }
      }
    } catch (subErr) {
      console.warn('[runAutoEdit] Could not fetch real subtitles, falling back to copy engine:', subErr);
    }

    if (!realWords || realWords.length === 0) {
      // Pull title-grounded copy (offline / no speech fallback).
      try {
        const copy = await api.copyFromTitle({ title: video.title, tone: preset.tone });
        caption = copy.caption || '';
        hashtags = copy.hashtags || [];
        spoken = [copy.hooks?.[0], copy.caption].filter(Boolean).join(' ').replace(/#[\w]+/g, '').trim() || video.title;
      } catch {
        caption = `${video.title}. Here's what actually moves the needle — watch till the end.`;
        hashtags = [];
        spoken = caption;
      }
    }

    const words = realWords && realWords.length > 0 ? realWords : synthesizeWords(spoken, duration);
    const base = { caption, hashtags };

    try {
      const res = await api.autoEdit({
        videoMetadata: { id: video.id, title: video.title, duration, sourceUrl: video.file_url, targetAspectRatio: '9:16' },
        words,
        options: preset.options,
      });
      const proj = applyPresetLook(res.project, preset);
      setProject(proj);
      return { ok: true, project: proj, stats: res.stats, source: res.source, ...base, message: res.message };
    } catch {
      const proj = buildLocalProject(
        { id: video.id, title: video.title, file_url: video.file_url, duration },
        words,
        preset,
      );
      setProject(proj);
      return { ok: true, project: proj, stats: deriveStats(proj), source: 'local_engine', offline: true, ...base, message: 'Assembled locally (offline engine)' };
    }
  }, []);

  const [activeDraft, setActiveDraftState] = useState<ActiveDraft | null>(() => {
    try {
      const saved = localStorage.getItem('kontentos_active_draft');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const setActiveDraft = useCallback((draft: ActiveDraft | null) => {
    setActiveDraftState(draft);
    try {
      if (draft) localStorage.setItem('kontentos_active_draft', JSON.stringify(draft));
      else localStorage.removeItem('kontentos_active_draft');
    } catch {}
  }, []);

  const updateActiveDraft = useCallback((patch: Partial<ActiveDraft>) => {
    setActiveDraftState((prev) => {
      const next: ActiveDraft = prev
        ? { ...prev, ...patch, updatedAt: new Date().toISOString() }
        : {
            id: `draft_${Date.now()}`,
            title: patch.title || 'Untitled Draft',
            step: patch.step || 'raw-reel',
            updatedAt: new Date().toISOString(),
            ...patch,
          };
      try {
        localStorage.setItem('kontentos_active_draft', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const startProductionFromIdea = useCallback(
    (idea: any) => {
      const draft: ActiveDraft = {
        id: `draft_${Date.now()}`,
        title: idea.title,
        idea: {
          id: idea.id,
          title: idea.title,
          hook: idea.blueprint?.hook || '',
          format: idea.format || 'Reel',
          why: idea.blueprint?.why,
          beats: idea.blueprint?.beats || [],
        },
        step: 'raw-reel',
        updatedAt: new Date().toISOString(),
      };
      setActiveDraft(draft);
      navigate('raw-reel', { ideaId: idea.id });
    },
    [setActiveDraft],
  );

  const handoffReelToEditor = useCallback(
    (proj: TimelineProject, video?: Video) => {
      loadProject(proj);
      updateActiveDraft({
        title: video?.title || proj.projectMetadata.title,
        sourceVideo: video
          ? {
              id: video.id,
              title: video.title,
              file_url: video.file_url,
              thumbnail_url: video.thumbnail_url,
              duration: video.duration,
            }
          : undefined,
        step: 'smart-editor',
      });
      navigate('smart-editor');
    },
    [loadProject, updateActiveDraft],
  );

  const handoffEditorToPublish = useCallback(
    (
      proj: TimelineProject,
      copy?: { caption?: string; hashtags?: string[] },
      exported?: { videoUrl: string; byteLength?: number },
    ) => {
      // 1. Synthesize transcript summary from text captions if available
      const textTrack = proj.tracks.find((t) => t.type === 'text');
      const textCues = (textTrack?.clips || []) as TextClip[];
      const transcriptSummary = textCues.map((c) => c.content).join(' ').trim();
      const initialCaption = copy?.caption || transcriptSummary || proj.projectMetadata.title || 'Studio Exported Reel';

      // 2. If an exported video URL/blob was rendered, create a registered Video entry
      let sourceVideoRecord = activeDraft?.sourceVideo;

      if (exported?.videoUrl) {
        const videoId = `rendered_${Date.now()}`;
        const newVideo: Video = {
          id: videoId,
          user_id: user?.id || 'local-creator',
          title: proj.projectMetadata.title || 'Studio Exported Reel',
          file_url: exported.videoUrl,
          duration: proj.projectMetadata.totalDuration,
          file_size: exported.byteLength,
          aspect_ratio: proj.projectMetadata.targetAspectRatio || '9:16',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        setVideos((prev) => [newVideo, ...prev.filter((v) => v.id !== videoId)]);
        sourceVideoRecord = {
          id: newVideo.id,
          title: newVideo.title,
          file_url: newVideo.file_url,
          duration: newVideo.duration,
        };
      }

      // 3. Update active draft
      updateActiveDraft({
        id: proj.projectMetadata.id,
        title: proj.projectMetadata.title,
        sourceVideo: sourceVideoRecord,
        project: proj,
        publishing: {
          caption: initialCaption,
          hashtags: copy?.hashtags || ['reels', 'shorts', 'viral', 'creator'],
          platforms: ['instagram', 'youtube', 'tiktok'],
        },
        step: 'publish',
      });

      // 4. Navigate to publish schedule
      navigate('publish-schedule');
    },
    [activeDraft?.sourceVideo, navigate, updateActiveDraft, user?.id],
  );

  const saveIdea = useCallback(async (idea: Idea) => {
    // Optimistic so the button answers immediately, then settle on what the account's rows say.
    setSavedIdeas((prev) => {
      const idx = prev.findIndex((i) => i.id === idea.id);
      return idx >= 0 ? prev.map((i) => (i.id === idea.id ? idea : i)) : [idea, ...prev];
    });
    try {
      setSavedIdeas(await api.saveIdea(idea));
    } catch (err) {
      console.error('Could not persist this idea:', err);
    }
  }, []);

  const removeSavedIdea = useCallback(async (id: string) => {
    setSavedIdeas((prev) => prev.filter((i) => i.id !== id));
    try {
      setSavedIdeas(await api.deleteSavedIdea(id));
    } catch (err) {
      console.error('Could not delete this idea:', err);
    }
  }, []);

  const isSavedIdea = useCallback(
    (id: string) => {
      return savedIdeas.some((i) => i.id === id);
    },
    [savedIdeas],
  );

  const isCaptionsActive = useMemo(() => {
    if (!project) return false;
    const textTrack = project.tracks.find((t) => t.type === 'text');
    return !!textTrack && !textTrack.isMuted && textTrack.clips.length > 0;
  }, [project]);

  const toggleCaptions = useCallback(
    (enabled?: boolean) => {
      applyEdit((cur) => toggleCaptionsTrack(cur, enabled));
    },
    [applyEdit],
  );

  const generateLiveCaptions = useCallback<StoreValue['generateLiveCaptions']>(
    async (videoIdOrOpts, maybeOpts) => {
      const videoId = typeof videoIdOrOpts === 'string' ? videoIdOrOpts : videoIdOrOpts.videoId;
      const opts =
        typeof videoIdOrOpts === 'string'
          ? maybeOpts
          : { ...videoIdOrOpts, ...maybeOpts };
      try {
        let storedKey: string | undefined = opts?.apiKey;
        try {
          const raw = localStorage.getItem('kontentos_gemini_api_key');
          if (raw && (raw.includes('TESTINGKEY') || raw.length < 20)) {
            localStorage.removeItem('kontentos_gemini_api_key');
          } else if (!storedKey && raw) {
            storedKey = raw;
          }
        } catch {}

        const result = await api.transcribeVideo({
          videoId,
          targetLanguage: opts?.language || 'English',
          apiKey: storedKey,
          forceRefresh: opts?.forceRefresh ?? true,
        });

        if (!result || !result.segments?.length) {
          return { ok: false, count: 0, message: 'No speech dialogue detected' };
        }

        const cues = buildCaptionsFromSegments(result.segments, opts?.style);

        applyEdit((cur) => {
          return applyCaptionsToProject(cur, cues);
        });

        return {
          ok: true,
          count: cues.length,
          transcript: result.transcript,
          message: `Generated ${cues.length} live synchronized captions`,
        };
      } catch (err: any) {
        console.error('generateLiveCaptions failed:', err);
        return {
          ok: false,
          count: 0,
          code: err?.code || (err?.message?.includes('GEMINI_API_KEY') ? 'MISSING_GEMINI_API_KEY' : undefined),
          message: err?.message || 'Failed to generate live captions',
        };
      }
    },
    [applyEdit],
  );

  const value = useMemo<StoreValue>(
    () => ({
      online,
      loading,
      user,
      videos,
      scheduled,
      history,
      dbStatus,
      project,
      setProject,
      runAutoEdit,
      canUndo: histTick >= 0 && pastRef.current.length > 0,
      canRedo: histTick >= 0 && futureRef.current.length > 0,
      undoLabel: pastRef.current[pastRef.current.length - 1]?.label,
      redoLabel: futureRef.current[0]?.label,
      historyCount: { past: pastRef.current.length, future: futureRef.current.length },
      loadProject,
      applyEdit,
      undo,
      redo,
      refresh,
      uploadVideo,
      updateVideo,
      deleteVideo,
      schedulePost,
      updateScheduled,
      deleteScheduled,
      publishNow,
      saveUser,
      activeDraft,
      setActiveDraft,
      updateActiveDraft,
      startProductionFromIdea,
      handoffReelToEditor,
      handoffEditorToPublish,
      navigate,
      savedIdeas,
      saveIdea,
      removeSavedIdea,
      isSavedIdea,
      generateLiveCaptions,
      toggleCaptions,
      isCaptionsActive,
    }),
    [
      online,
      loading,
      user,
      videos,
      scheduled,
      history,
      dbStatus,
      project,
      runAutoEdit,
      histTick,
      loadProject,
      applyEdit,
      undo,
      redo,
      setProject,
      refresh,
      uploadVideo,
      updateVideo,
      deleteVideo,
      schedulePost,
      updateScheduled,
      deleteScheduled,
      publishNow,
      saveUser,
      activeDraft,
      setActiveDraft,
      updateActiveDraft,
      startProductionFromIdea,
      handoffReelToEditor,
      handoffEditorToPublish,
      savedIdeas,
      saveIdea,
      removeSavedIdea,
      isSavedIdea,
      generateLiveCaptions,
      toggleCaptions,
      isCaptionsActive,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

/** Derive a display profile (with graceful mock fallback when offline). */
export function useDisplayProfile() {
  const { user } = useStore();
  // These strings get rasterized into exported cards, so the "not set yet" fallbacks must
  // never be a real person's identity.
  const name = user?.full_name || 'Your Name';
  const handle = user?.instagram_username ? `@${user.instagram_username}` : '@yourhandle';
  const initials = (name || '').trim().charAt(0).toUpperCase();
  return { name, handle, initials, real: !!user };
}
