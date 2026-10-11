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
  synthesizeWords,
  textClips,
  toggleCaptionsTrack,
  videoClips,
  sfxClips,
} from './timeline';
import type { TimelineProject, EditPreset, TextClip } from './timeline';

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
  /** Load a project fresh, resetting the undo history (e.g. Raw → Reel hand-off). */
  loadProject: (p: TimelineProject) => void;
  /** Apply an immutable editorial mutation, snapshotting history. Return false if no-op. */
  applyEdit: (mutate: (p: TimelineProject) => TimelineProject | null) => boolean;
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
    platforms: SocialPlatform[];
    captionText?: string;
    hashtags?: string[];
    scheduledAt?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  deleteScheduled: (id: string) => Promise<void>;
  publishNow: (id: string) => Promise<{ ok: boolean; message?: string }>;
  saveUser: (profile: Partial<User>) => Promise<void>;

  /** Closed-loop pipeline state & inter-screen handoffs */
  activeDraft: ActiveDraft | null;
  setActiveDraft: (draft: ActiveDraft | null) => void;
  updateActiveDraft: (patch: Partial<ActiveDraft>) => void;
  startProductionFromIdea: (idea: any) => void;
  handoffReelToEditor: (project: TimelineProject, video?: Video) => void;
  handoffEditorToPublish: (project: TimelineProject, copy?: { caption?: string; hashtags?: string[] }) => void;
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
  const [savedIdeas, setSavedIdeas] = useState<Idea[]>(() => {
    try {
      const raw = localStorage.getItem('kontentos_saved_ideas');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
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
  const pastRef = useRef<TimelineProject[]>([]);
  const futureRef = useRef<TimelineProject[]>([]);
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
    (mutate) => {
      const cur = projectRef.current;
      if (!cur) return false;
      const next = mutate(cloneProject(cur));
      if (!next) return false;
      pastRef.current = [...pastRef.current.slice(-MAX_HISTORY + 1), cur];
      futureRef.current = [];
      commit(next);
      bump();
      return true;
    },
    [commit, bump],
  );

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    const cur = projectRef.current;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    if (cur) futureRef.current = [cur, ...futureRef.current];
    commit(previous);
    bump();
  }, [commit, bump]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const cur = projectRef.current;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    if (cur) pastRef.current = [...pastRef.current, cur];
    commit(next);
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
        api.getSavedIdeas().catch(() => []),
      ]);
      setUser(u);
      setVideos(v);
      setScheduled(s);
      setHistory(h);
      setDbStatus(d);
      if (si && si.length > 0) {
        setSavedIdeas(si);
        try {
          localStorage.setItem('kontentos_saved_ideas', JSON.stringify(si));
        } catch { /* ignore */ }
      }
      setOnline(true);
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
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
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

  const saveUser = useCallback(async (profile: Partial<User>) => {
    try {
      const updated = await api.saveUser(profile);
      if (updated) setUser(updated);
    } catch (err) {
      console.error('Save user failed:', err);
    }
  }, []);

  /** Run the Smart-Polish EDL engine for a clip + preset. Server engine first,
   *  deterministic local build if /api is unreachable. Always yields a project. */
  const runAutoEdit = useCallback<StoreValue['runAutoEdit']>(async (video, preset) => {
    const duration = video.duration || 20;
    let caption = '';
    let hashtags: string[] = [];
    let spoken = video.title;

    // Pull title-grounded copy (works offline via backend fallback).
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

    const words = synthesizeWords(spoken, duration);
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
    (proj: TimelineProject, copy?: { caption?: string; hashtags?: string[] }) => {
      updateActiveDraft({
        project: proj,
        publishing: {
          caption: copy?.caption || '',
          hashtags: copy?.hashtags || [],
          platforms: ['instagram', 'youtube'],
        },
        step: 'publish',
      });
      navigate('publish-schedule');
    },
    [updateActiveDraft],
  );

  const saveIdea = useCallback(async (idea: Idea) => {
    setSavedIdeas((prev) => {
      const idx = prev.findIndex((i) => i.id === idea.id);
      const next = idx >= 0 ? prev.map((i) => (i.id === idea.id ? idea : i)) : [idea, ...prev];
      try {
        localStorage.setItem('kontentos_saved_ideas', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    api.saveIdea(idea).catch(() => {});
  }, []);

  const removeSavedIdea = useCallback(async (id: string) => {
    setSavedIdeas((prev) => {
      const next = prev.filter((i) => i.id !== id);
      try {
        localStorage.setItem('kontentos_saved_ideas', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    api.deleteSavedIdea(id).catch(() => {});
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
        if (!storedKey) {
          try {
            storedKey = localStorage.getItem('kontentos_gemini_api_key') || undefined;
          } catch {}
        }

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
      loadProject,
      applyEdit,
      undo,
      redo,
      refresh,
      uploadVideo,
      updateVideo,
      deleteVideo,
      schedulePost,
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
  const name = user?.full_name || 'Aman Sharma';
  const handle = user?.instagram_username ? `@${user.instagram_username}` : '@amanshades';
  const initials = (name || 'A').trim().charAt(0).toUpperCase();
  return { name, handle, initials, real: !!user };
}
