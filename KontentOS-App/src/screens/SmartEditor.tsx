import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, IconButton, PageHeader, StatusPill } from '@/components/ui';
import { ReelPreview, type ReelHandle } from '@/components/ReelPreview';
import { ExportModal } from '@/components/ExportModal';
import { useStore } from '@/lib/store';
import { api, probeUrlDuration, probeVideoDuration } from '@/lib/api';
import {
  KINETIC_CAPTION_PRESETS,
  PRESETS,
  applyCaptionPresetToProject,
  brollClips,
  brollTrackOf,
  clipAt,
  cloneProject,
  deleteClip,
  deleteClipsBatch,
  findSnapPoint,
  fmtTime,
  getPreset,
  insertVideoClip,
  locateClip,
  moveClipSafe,
  moveClipsBatch,
  round2,
  sfxClips,
  setClipTransition,
  setProjectAspectRatio,
  splitClipAt,
  synthesizeWords,
  textClips,
  tightenGaps,
  totalDuration,
  trimClipEdge,
  videoClips,
  type CaptionAnimation,
  type CaptionStyle,
  type ClipTransition,
  type SFXClip,
  type TargetAspectRatio,
  type TextClip,
  type TimelineClip,
  type TimelineProject,
  type TransitionType,
  type VideoClip,
} from '@/lib/timeline';
import { sfxEngine } from '@/utils/sfxEngine';
import { BGM_TRACKS, resolveBgmUrl } from '@/utils/bgmPresets';
import {
  BROLL_LIBRARY,
  autoInsertBrollToProject,
  insertBrollAtTime,
  type BrollCategory,
} from '@/utils/brollEngine';
import { extractAudioPeaks, slicePeaksForClip } from '@/utils/audioWaveform';

const RULER_H = 28;
const LANE_H = 50;
const GUTTER_W = 110;

function fmtSmpte(seconds: number, fps = 30): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * fps);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

const FONTS = [
  { id: 'Newsreader, serif', label: 'Newsreader (Editorial Serif)' },
  { id: 'Hanken Grotesk, sans-serif', label: 'Hanken Grotesk (Modern Clean)' },
  { id: 'Syne, sans-serif', label: 'Syne (Bold Impact)' },
  { id: 'JetBrains Mono, monospace', label: 'JetBrains Mono (Technical)' },
];

const ANIMATION_PRESETS: { id: CaptionAnimation; label: string; icon: string }[] = [
  { id: 'popIn', label: 'Word Pop', icon: 'auto_awesome' },
  { id: 'karaoke', label: 'Karaoke Wave', icon: 'graphic_eq' },
  { id: 'bouncePop', label: 'Bounce Scale', icon: 'arrow_upward' },
  { id: 'bannerPill', label: 'Solid Pill', icon: 'badge' },
  { id: 'none', label: 'Clean Static', icon: 'subtitles' },
];

const HIGHLIGHT_COLORS = [
  { hex: '#285C4D', label: 'Forest Green' },
  { hex: '#F3B747', label: 'Amber Gold' },
  { hex: '#E05A47', label: 'Signal Coral' },
  { hex: '#3B82F6', label: 'Electric Blue' },
  { hex: '#FFFFFF', label: 'Pure White' },
];

export default function SmartEditor() {
  const {
    project,
    videos,
    activeDraft,
    loadProject,
    applyEdit,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    historyCount,
    runAutoEdit,
    uploadVideo,
    handoffEditorToPublish,
    generateLiveCaptions,
    toggleCaptions,
    isCaptionsActive,
  } = useStore();

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeStartPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [zoom, setZoom] = useState(48); // px per second
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [polishing, setPolishing] = useState(false);
  const [activeTab, setActiveTab] = useState<'polish' | 'media' | 'captions' | 'broll' | 'audio' | 'inspector'>('polish');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Device Video Upload & Media Footage State
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadActionTarget, setUploadActionTarget] = useState<'playhead' | 'append' | 'broll' | 'newProject'>('playhead');
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // B-Roll Engine State
  const [brollDensity, setBrollDensity] = useState<'light' | 'medium' | 'dense'>('medium');
  const [brollCategory, setBrollCategory] = useState<string>('all');
  const [brollSearch, setBrollSearch] = useState('');
  const [brollNotice, setBrollNotice] = useState<string | null>(null);
  const [previewingBrollVideo, setPreviewingBrollVideo] = useState<string | null>(null);

  // Caption Styling & Speech-to-Text State
  const [captionFont, setCaptionFont] = useState(FONTS[0].id);
  const [captionAnim, setCaptionAnim] = useState<CaptionAnimation>('popIn');
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].hex);
  const [captionPos, setCaptionPos] = useState<'top' | 'middle' | 'bottom'>('middle');
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [captionLang, setCaptionLang] = useState('English');
  const [captionNotice, setCaptionNotice] = useState<string | null>(null);

  const reelRef = useRef<ReelHandle>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const duration = project ? totalDuration(project) : 0;
  const fps = project?.projectMetadata.frameRate || 30;

  const autoLoadedRef = useRef(false);

  // Auto-populate project if timeline is empty and video clips are available
  useEffect(() => {
    if (project || autoLoadedRef.current) return;
    if (activeDraft?.project) {
      autoLoadedRef.current = true;
      loadProject(activeDraft.project);
    } else {
      const ready = videos.filter((v) => v.status === 'ready' || v.status === 'processing');
      if (ready.length > 0) {
        autoLoadedRef.current = true;
        setPolishing(true);
        runAutoEdit(ready[0], getPreset(presetId)).finally(() => {
          setPolishing(false);
        });
      }
    }
  }, [project, activeDraft, videos, loadProject, runAutoEdit, presetId]);

  // Keep playhead within bounds when the timeline shrinks.
  useEffect(() => {
    if (time > duration) setTime(duration);
  }, [duration, time]);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(t, duration || t));
      setTime(clamped);
      reelRef.current?.seek(clamped);
    },
    [duration],
  );

  const [snapGuide, setSnapGuide] = useState<number | null>(null);

  const seekFromClientX = useCallback(
    (clientX: number, snap = true) => {
      const el = contentRef.current;
      if (!el || !project) return;
      const rect = el.getBoundingClientRect();
      const raw = (clientX - rect.left) / zoom;
      if (snap) {
        const snapRes = findSnapPoint(project, raw, zoom, { thresholdPx: 8 });
        if (snapRes.snapped && snapRes.snapPoint !== undefined) {
          setSnapGuide(snapRes.snapPoint);
          seek(snapRes.time);
          return;
        }
      }
      setSnapGuide(null);
      seek(raw);
    },
    [zoom, seek, project],
  );

  // Pointer scrubbing across ruler + marquee box selection on lane background
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current) {
        seekFromClientX(e.clientX);
        return;
      }

      if (marqueeStartPosRef.current) {
        const dist = Math.hypot(
          e.clientX - marqueeStartPosRef.current.clientX,
          e.clientY - marqueeStartPosRef.current.clientY
        );
        if (dist > 4) {
          marqueeActiveRef.current = true;
          const el = contentRef.current;
          if (el && project) {
            const rect = el.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            const startX = marqueeStartPosRef.current.clientX - rect.left;
            const startY = marqueeStartPosRef.current.clientY - rect.top;
            setMarquee({ startX, startY, currentX, currentY });

            const boxLeft = Math.min(startX, currentX);
            const boxRight = Math.max(startX, currentX);
            const boxTop = Math.min(startY, currentY);
            const boxBottom = Math.max(startY, currentY);

            const timeMin = boxLeft / zoom;
            const timeMax = boxRight / zoom;

            const intersected: string[] = [];
            project.tracks.forEach((tr, trIdx) => {
              if (tr.isLocked) return;
              const trackTop = RULER_H + trIdx * LANE_H;
              const trackBottom = trackTop + LANE_H;
              if (boxTop <= trackBottom && boxBottom >= trackTop) {
                tr.clips.forEach((c) => {
                  const cStart = c.startOnTimeline;
                  const cEnd = c.startOnTimeline + c.duration;
                  if (cStart <= timeMax && cEnd >= timeMin) {
                    intersected.push(c.id);
                  }
                });
              }
            });
            setSelectedIds(intersected);
          }
        }
      }
    };

    const up = (e: PointerEvent) => {
      if (dragging.current) {
        dragging.current = false;
        setSnapGuide(null);
      }
      if (marqueeStartPosRef.current) {
        if (!marqueeActiveRef.current) {
          // Plain click on timeline background: seek and clear selection unless modifier held
          seekFromClientX(marqueeStartPosRef.current.clientX);
          if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
            setSelectedIds([]);
          }
        }
        marqueeStartPosRef.current = null;
        marqueeActiveRef.current = false;
        setMarquee(null);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [seekFromClientX, project, zoom]);

  const handleSelectClip = useCallback(
    (clipId: string, e?: React.PointerEvent | React.MouseEvent) => {
      if (e?.shiftKey || e?.metaKey || e?.ctrlKey) {
        setSelectedIds((prev) =>
          prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId]
        );
      } else {
        setSelectedIds([clipId]);
      }
      setActiveTab('inspector');
    },
    [],
  );

  const handleMoveClip = useCallback(
    (clipId: string, newStart: number, isFinal = false) => {
      if (selectedIds.length > 1 && selectedIds.includes(clipId) && project) {
        const loc = locateClip(project, clipId);
        if (loc) {
          const deltaSec = newStart - loc.clip.startOnTimeline;
          applyEdit((p) => moveClipsBatch(p, selectedIds, deltaSec), {
            skipHistory: !isFinal,
            label: `Move ${selectedIds.length} clips`,
          });
          return;
        }
      }
      applyEdit((p) => moveClipSafe(p, clipId, newStart), {
        skipHistory: !isFinal,
        label: 'Move clip position',
      });
    },
    [applyEdit, selectedIds, project],
  );

  const handleTrimClip = useCallback(
    (clipId: string, edge: 'start' | 'end', atTime: number, isFinal = false) => {
      applyEdit((p) => trimClipEdge(p, clipId, edge, atTime), {
        skipHistory: !isFinal,
        label: `Trim clip ${edge}`,
      });
    },
    [applyEdit],
  );

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Keyboard shortcuts (Standard NLE pro controls).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable || !project) return;
      const mod = e.metaKey || e.ctrlKey;
      const frameDuration = 1 / (project.projectMetadata.frameRate || 30);

      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => {
          if (p) setPlaybackSpeed(1);
          return !p;
        });
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allIds: string[] = [];
        for (const tr of project.tracks) {
          if (tr.isLocked) continue;
          for (const c of tr.clips) {
            allIds.push(c.id);
          }
        }
        setSelectedIds(allIds);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedIds([]);
      } else if ((e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'b') && !mod) {
        e.preventDefault();
        doSplit();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        doDelete();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? frameDuration * 10 : frameDuration;
        seek(Math.max(0, time - step));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? frameDuration * 10 : frameDuration;
        seek(Math.min(duration, time + step));
      } else if (e.key.toLowerCase() === 'j' && !mod) {
        e.preventDefault();
        // J-K-L: J = Reverse / speed up backward playback (-1x, -2x, -4x)
        if (!playing) {
          setPlaybackSpeed(-1);
          setPlaying(true);
        } else if (playbackSpeed > 0) {
          setPlaybackSpeed(-1);
        } else if (playbackSpeed === -1) {
          setPlaybackSpeed(-2);
        } else {
          setPlaybackSpeed(-4);
        }
      } else if (e.key.toLowerCase() === 'k' && !mod) {
        e.preventDefault();
        // J-K-L: K = Pause playback
        setPlaying(false);
        setPlaybackSpeed(1);
      } else if (e.key.toLowerCase() === 'l' && !mod) {
        e.preventDefault();
        // J-K-L: L = Forward / speed up forward playback (1x, 2x, 4x)
        if (!playing) {
          setPlaybackSpeed(1);
          setPlaying(true);
        } else if (playbackSpeed < 0) {
          setPlaybackSpeed(1);
        } else if (playbackSpeed === 1) {
          setPlaybackSpeed(2);
        } else {
          setPlaybackSpeed(4);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, time, duration, selectedIds, zoom, fps, playing, playbackSpeed]);

  const selectedClip = useMemo<TimelineClip | null>(() => {
    if (!project || selectedIds.length === 0) return null;
    const targetId = selectedIds[selectedIds.length - 1] || selectedIds[0];
    for (const tr of project.tracks) {
      const c = tr.clips.find((x) => x.id === targetId);
      if (c) return c;
    }
    return null;
  }, [project, selectedIds]);

  function targetClipId(): string | null {
    if (selectedClip) return selectedClip.id;
    const v = clipAt(project as TimelineProject, 'video', time);
    return v?.id ?? null;
  }

  function doSplit() {
    if (!project) return;
    if (selectedIds.length > 0) {
      applyEdit(
        (p) => {
          let cur: TimelineProject | null = p;
          for (const id of selectedIds) {
            cur = splitClipAt(cur, id, time) ?? cur;
          }
          return cur;
        },
        { label: `Split ${selectedIds.length} clip(s)` }
      );
      return;
    }

    // Split across all active unlocked tracks (video and text) so subtitles stay in lockstep
    const vClip = clipAt(project, 'video', time);
    const tClip = clipAt(project, 'text', time);
    if (!vClip && !tClip) return;

    applyEdit(
      (p) => {
        let cur: TimelineProject | null = p;
        if (vClip) {
          cur = splitClipAt(cur, vClip.id, time) ?? cur;
        }
        if (tClip) {
          cur = splitClipAt(cur, tClip.id, time) ?? cur;
        }
        return cur;
      },
      { label: 'Split at playhead' }
    );
    if (vClip) setSelectedIds([vClip.id]);
  }

  function doTrim(edge: 'start' | 'end') {
    if (!project || !selectedClip) return;
    applyEdit((p) => trimClipEdge(p, selectedClip.id, edge, time), { label: `Trim clip ${edge}` });
  }

  function doDelete() {
    if (!project) return;
    if (selectedIds.length > 0) {
      applyEdit((p) => deleteClipsBatch(p, selectedIds, true), {
        label: `Ripple delete ${selectedIds.length} clips`,
      });
      setSelectedIds([]);
      return;
    }
    const id = targetClipId();
    if (!id) return;
    applyEdit((p) => deleteClip(p, id, true), { label: 'Ripple delete clip' });
    setSelectedIds([]);
  }

  function doTighten() {
    if (!project) return;
    applyEdit((p) => tightenGaps(p), { label: 'Tighten gaps' });
  }

  function toggleMuteTrack(trackId: string) {
    applyEdit(
      (p) => {
        const clone = cloneProject(p);
        const track = clone.tracks.find((t) => t.id === trackId);
        if (track) track.isMuted = !track.isMuted;
        return clone;
      },
      { label: 'Toggle track mute' }
    );
  }

  function toggleLockTrack(trackId: string) {
    applyEdit(
      (p) => {
        const clone = cloneProject(p);
        const track = clone.tracks.find((t) => t.id === trackId);
        if (track) track.isLocked = !track.isLocked;
        return clone;
      },
      { label: 'Toggle track lock' }
    );
  }

  function handleUpdateTextClip(clipId: string, newContent: string, newStyle?: Partial<CaptionStyle>) {
    applyEdit((p) => {
      const next = cloneProject(p);
      const track = next.tracks.find((t) => t.type === 'text');
      if (!track) return null;
      const clip = track.clips.find((c) => c.id === clipId) as TextClip | undefined;
      if (!clip) return null;

      const trimmed = newContent.trim();
      clip.content = newContent;
      clip.name = trimmed || 'Empty Caption';

      if (newStyle) {
        clip.style = { ...clip.style, ...newStyle };
      }

      // Reconcile words
      const rawWords = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
      if (rawWords.length > 0) {
        const existingWords = clip.style.words || [];
        if (existingWords.length === rawWords.length) {
          clip.style.words = existingWords.map((w, i) => ({
            ...w,
            word: rawWords[i],
          }));
        } else {
          clip.style.words = synthesizeWords(trimmed, clip.duration);
        }
      } else {
        clip.style.words = [];
      }

      return next;
    });
  }

  function handleUpdateWord(clipId: string, wordIdx: number, newWord: string) {
    applyEdit((p) => {
      const next = cloneProject(p);
      const track = next.tracks.find((t) => t.type === 'text');
      if (!track) return null;
      const clip = track.clips.find((c) => c.id === clipId) as TextClip | undefined;
      if (!clip || !clip.style.words || !clip.style.words[wordIdx]) return null;

      clip.style.words[wordIdx].word = newWord;
      clip.content = clip.style.words.map((w) => w.word).join(' ');
      clip.name = clip.content;
      return next;
    });
  }

  function handleUpdateVideoClip(clipId: string, updates: Partial<VideoClip>) {
    applyEdit((p) => {
      const next = cloneProject(p);
      for (const track of next.tracks) {
        if (track.type === 'video') {
          const clip = track.clips.find((c) => c.id === clipId) as VideoClip | undefined;
          if (clip) {
            Object.assign(clip, updates);
            return next;
          }
        }
      }
      return null;
    });
  }

  function handleUpdateSFXClip(clipId: string, updates: Partial<SFXClip>) {
    applyEdit((p) => {
      const next = cloneProject(p);
      const track = next.tracks.find((t) => t.type === 'sfx');
      if (!track) return null;
      const clip = track.clips.find((c) => c.id === clipId) as SFXClip | undefined;
      if (!clip) return null;
      Object.assign(clip, updates);
      if (updates.sfxAssetId) {
        clip.name = `SFX: ${updates.sfxAssetId.replace(/_/g, ' ')}`;
      }
      return next;
    });
  }

  function updateGlobalCaptionStyle(patch: Partial<CaptionStyle>) {
    applyEdit((p) => applyCaptionPresetToProject(p, patch));
  }

  const currentBgm = project?.globalAudioTracks?.backgroundMusicAssetId;
  const currentBgmVol = project?.globalAudioTracks?.bgmVolume ?? 0.25;
  const isDucking = project?.globalAudioTracks?.duckingEnabled ?? true;
  const [previewingBgm, setPreviewingBgm] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      sfxEngine.stopBGM();
    };
  }, []);

  function setBgm(assetId?: string, url?: string) {
    applyEdit((p) => {
      const clone = cloneProject(p);
      const resolvedUrl = url ?? (assetId ? resolveBgmUrl(assetId) : undefined);
      clone.globalAudioTracks = {
        ...clone.globalAudioTracks,
        backgroundMusicAssetId: assetId,
        backgroundMusicUrl: resolvedUrl,
      };
      return clone;
    });
  }

  function setBgmVolume(vol: number) {
    applyEdit((p) => {
      const clone = cloneProject(p);
      clone.globalAudioTracks = {
        ...clone.globalAudioTracks,
        bgmVolume: Math.max(0, Math.min(1, vol)),
      };
      return clone;
    });
  }

  function toggleDucking() {
    applyEdit((p) => {
      const clone = cloneProject(p);
      clone.globalAudioTracks = {
        ...clone.globalAudioTracks,
        duckingEnabled: !clone.globalAudioTracks.duckingEnabled,
      };
      return clone;
    });
  }

  function handleSetAspectRatio(ratio: TargetAspectRatio) {
    applyEdit((p) => setProjectAspectRatio(p, ratio));
  }

  function handleTestBgm(assetId: string, url?: string) {
    if (previewingBgm === assetId) {
      sfxEngine.stopBGM();
      setPreviewingBgm(null);
    } else {
      const trackUrl = url ?? resolveBgmUrl(assetId);
      sfxEngine.startBGM(assetId, currentBgmVol, trackUrl);
      setPreviewingBgm(assetId);
    }
  }

  function addSfxAtPlayhead(assetId: string) {
    applyEdit((p) => {
      const clone = cloneProject(p);
      let sfxTrack = clone.tracks.find((t) => t.type === 'sfx');
      if (!sfxTrack) {
        sfxTrack = {
          id: 'track-sfx',
          name: 'SFX Overlays',
          type: 'sfx',
          isMuted: false,
          isLocked: false,
          zIndex: 20,
          clips: [],
        };
        clone.tracks.push(sfxTrack);
      }
      const newClip: SFXClip = {
        id: `sfx_${Date.now()}`,
        name: `SFX: ${assetId.replace(/_/g, ' ')}`,
        type: 'sfx',
        sfxAssetId: assetId as any,
        startOnTimeline: round2(time),
        duration: 1.0,
        sourceStartOffset: 0,
        audioModifiers: {
          pitchShiftCents: 0,
          volume: 1.0,
          fadeInSec: 0,
          fadeOutSec: 0,
        },
      };
      sfxTrack.clips.push(newClip);
      sfxTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
      return clone;
    });
    sfxEngine.play(assetId);
  }

  function handleAutoMatchBroll() {
    if (!project) return;
    const res = autoInsertBrollToProject(project, { density: brollDensity });
    applyEdit(() => res.project, { label: `Auto-insert ${res.insertedCount} B-Roll clips` });
    if (res.insertedCount > 0) {
      setBrollNotice(
        `âœ¨ Auto-matched ${res.insertedCount} B-Roll overlays to speech topics! (${res.matchedKeywords.slice(0, 4).join(', ')})`
      );
    } else {
      setBrollNotice(
        'No matching speech cues found. Try generating live captions first or inserting clips manually!'
      );
    }
  }

  function handleInsertBroll(assetId: string) {
    if (!project) return;
    applyEdit((p) => insertBrollAtTime(p, assetId, time), { label: `Insert B-Roll (${assetId})` });
  }

  function handleClearBroll() {
    if (!project) return;
    applyEdit(
      (p) => {
        const clone = cloneProject(p);
        const tr = brollTrackOf(clone);
        if (tr) tr.clips = [];
        return clone;
      },
      { label: 'Clear B-Roll track' }
    );
    setBrollNotice('B-Roll track cleared.');
  }

  const filteredBroll = useMemo(() => {
    return BROLL_LIBRARY.filter((item) => {
      const matchCat = brollCategory === 'all' || item.category === brollCategory;
      const matchSearch =
        !brollSearch ||
        item.title.toLowerCase().includes(brollSearch.toLowerCase()) ||
        item.keywords.some((k) => k.toLowerCase().includes(brollSearch.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [brollCategory, brollSearch]);

  const sourceUrl = project ? videoClips(project)[0]?.sourceUrl : undefined;
  const sourceVideo = useMemo(
    () => (sourceUrl ? videos.find((v) => v.file_url === sourceUrl) ?? null : null),
    [videos, sourceUrl],
  );

  async function rePolish() {
    if (!sourceVideo || polishing) return;
    setPolishing(true);
    setSelectedIds([]);
    try {
      await runAutoEdit(sourceVideo, getPreset(presetId));
      seek(0);
    } finally {
      setPolishing(false);
    }
  }

  const handleGenerateCaptions = useCallback(
    async (explicitKey?: string | React.MouseEvent | unknown) => {
      if (!project || generatingCaptions) return;
      const vClips = videoClips(project);
      const vId = sourceVideo?.id || vClips[0]?.sourceFileId || videos[0]?.id || 'testing_video';
      setGeneratingCaptions(true);
      setCaptionNotice(null);
      try {
        const rawKey = typeof explicitKey === 'string' ? explicitKey : localStorage.getItem('kontentos_gemini_api_key') || undefined;
        let key = rawKey;
        if (rawKey && (rawKey.includes('TESTINGKEY') || rawKey.length < 20)) {
          try { localStorage.removeItem('kontentos_gemini_api_key'); } catch {}
          key = undefined;
        }
        const res = await generateLiveCaptions({
          videoId: vId,
          language: captionLang,
          apiKey: key,
          style: {
            fontFamily: captionFont,
            activeWordColorHex: highlightColor,
            position: captionPos,
            animation: captionAnim,
          },
        });
        if (res.ok) {
          setCaptionNotice(res.message || `Generated ${res.count} synchronized live caption cues!`);
          setActiveTab('captions');
          toggleCaptions(true);
        } else if (res.code === 'MISSING_GEMINI_API_KEY' || res.message?.includes('GEMINI_API_KEY') || res.message?.includes('API Key is required')) {
          setShowApiKeyModal(true);
          setCaptionNotice('Please connect your Google Gemini API Key to enable AI speech transcription.');
        } else {
          setCaptionNotice(res.message || 'Could not generate captions');
        }
      } catch (err: any) {
        if (err?.code === 'MISSING_GEMINI_API_KEY' || err?.message?.includes('GEMINI_API_KEY') || err?.message?.includes('API Key is required')) {
          setShowApiKeyModal(true);
        }
        setCaptionNotice(err?.message || 'Error generating live captions');
      } finally {
        setGeneratingCaptions(false);
      }
    },
    [
      project,
      generatingCaptions,
      sourceVideo,
      videos,
      generateLiveCaptions,
      toggleCaptions,
      captionLang,
      captionFont,
      highlightColor,
      captionPos,
      captionAnim,
    ],
  );

  const handleClearCaptions = useCallback(() => {
    applyEdit((cur) => {
      const clone = cloneProject(cur);
      const textTrack = clone.tracks.find((t) => t.type === 'text');
      if (textTrack) textTrack.clips = [];
      return clone;
    });
    setCaptionNotice('Cleared subtitle cues from timeline');
  }, [applyEdit]);

  const handleDeviceVideoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'playhead' | 'append' | 'broll' | 'newProject' = uploadActionTarget
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    setUploadProgress(10);
    setMediaNotice(`Uploading ${file.name} from device...`);
    try {
      const fileDuration = await probeVideoDuration(file);
      const uploaded = await uploadVideo(file, (pct) => {
        setUploadProgress(pct);
      });
      if (uploaded) {
        const itemWithDur = {
          ...uploaded,
          duration: uploaded.duration && uploaded.duration > 0.1 ? uploaded.duration : fileDuration,
        };

        setMediaNotice(`Successfully imported ${uploaded.title}! (${fmtTime(itemWithDur.duration || 0)})`);
        setTimeout(() => setMediaNotice(null), 4000);

        if (mode === 'newProject' || !project) {
          await runAutoEdit(itemWithDur, getPreset(presetId));
          seek(0);
        } else if (mode === 'broll') {
          applyEdit((p) => insertVideoClip(p, itemWithDur, time, true), {
            label: `Add B-Roll overlay: ${uploaded.title}`,
          });
        } else if (mode === 'append') {
          applyEdit((p) => insertVideoClip(p, itemWithDur, undefined, false), {
            label: `Append video: ${uploaded.title}`,
          });
        } else {
          // 'playhead'
          applyEdit((p) => insertVideoClip(p, itemWithDur, time, false), {
            label: `Insert video at playhead: ${uploaded.title}`,
          });
        }
      }
    } catch (err: any) {
      console.error('Video upload failed in editor:', err);
      setMediaNotice(`Upload failed: ${err?.message || 'Unknown error'}`);
      setTimeout(() => setMediaNotice(null), 5000);
    } finally {
      setUploadingVideo(false);
      setUploadProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleInsertExistingVideo = async (
    videoItem: any,
    mode: 'playhead' | 'append' | 'broll' | 'newProject'
  ) => {
    let effectiveDuration = videoItem.duration;
    if (!effectiveDuration || effectiveDuration <= 0.1) {
      if (videoItem.file_url) {
        effectiveDuration = await probeUrlDuration(videoItem.file_url);
      }
    }
    const itemWithDur = {
      ...videoItem,
      duration: effectiveDuration > 0.1 ? effectiveDuration : videoItem.duration || 10,
    };

    if (mode === 'newProject' || !project) {
      runAutoEdit(itemWithDur, getPreset(presetId));
      seek(0);
      return;
    }
    if (mode === 'broll') {
      applyEdit((p) => insertVideoClip(p, itemWithDur, time, true), {
        label: `Add B-Roll overlay: ${videoItem.title}`,
      });
      return;
    }
    if (mode === 'append') {
      applyEdit((p) => insertVideoClip(p, itemWithDur, undefined, false), {
        label: `Append video: ${videoItem.title}`,
      });
      return;
    }
    applyEdit((p) => insertVideoClip(p, itemWithDur, time, false), {
      label: `Insert video at playhead: ${videoItem.title}`,
    });
  };

  function handleToPublish(exported?: { videoUrl: string; byteLength?: number }) {
    if (project) {
      handoffEditorToPublish(project, undefined, exported);
    }
  }

  /* -------------------------------- Empty state ------------------------------- */

  if (!project) {
    const ready = videos.filter((v) => v.status === 'ready' || v.status === 'processing');
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1280px] mx-auto">
        <Header offline={false} hasProject={false} />
        <Card className="p-12 text-center">
          {polishing ? (
            <div className="py-8 space-y-3">
              <div className="kt-spin mx-auto w-10 h-10 rounded-full border-[3px] border-primary border-t-transparent" />
              <h2 className="font-display text-[22px] text-ink">Preparing Video Timeline...</h2>
              <p className="text-[14px] text-ink-muted mt-1 max-w-md mx-auto">
                Auto-assembling cuts, syncing kinetic captions, and optimizing playback rhythm.
              </p>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-surface-2 grid place-items-center text-ink-dim mx-auto mb-3">
                <Icon name="content_cut" size={28} />
              </div>
              <h2 className="font-display text-[22px] text-ink">Nothing on the timeline yet</h2>
              <p className="text-[14px] text-ink-muted mt-1 max-w-md mx-auto">
                Assemble a reel in Raw â†’ Reel Studio and click <b className="text-ink">Fine-tune in Editor</b> to load it
                here â€” or start directly from an uploaded clip.
              </p>
              {/* Upload from Device Dropzone */}
              <div className="mt-6 max-w-md mx-auto p-5 rounded-card border-2 border-dashed border-line hover:border-primary/50 bg-surface-2/40 hover:bg-surface-2/70 transition-all text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary grid place-items-center mx-auto mb-2.5">
                  <Icon name="cloud_upload" size={22} />
                </div>
                <div className="text-sm font-semibold text-ink">Upload Video from Device</div>
                <p className="text-xs text-ink-muted mt-0.5 mb-3">
                  Select any MP4, MOV, or WebM video file from your computer to begin editing.
                </p>
                <Button
                  icon={uploadingVideo ? 'autorenew' : 'upload_file'}
                  onClick={() => {
                    setUploadActionTarget('newProject');
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadingVideo}
                >
                  {uploadingVideo ? `Uploading (${uploadProgress ?? 0}%)...` : 'Browse Video Files'}
                </Button>
                {uploadProgress !== null && (
                  <div className="mt-3 w-full bg-surface-3 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary h-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>

              {ready.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[12px] text-ink-dim font-medium mr-1">Or choose existing:</span>
                  {ready.slice(0, 4).map((v) => (
                    <Button
                      key={v.id}
                      size="sm"
                      variant="secondary"
                      icon="play_arrow"
                      onClick={() => runAutoEdit(v, getPreset(presetId))}
                    >
                      {v.title.slice(0, 24)}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    );
  }

  /* ---------------------------------- Editor ---------------------------------- */

  const contentWidth = Math.max(400, duration * zoom + 40);
  const vClips = videoClips(project);
  const tClips = textClips(project);
  const sClips = sfxClips(project);
  const bClips = brollClips(project);
  const canCut =
    !!selectedClip || !!clipAt(project, 'video', time) || !!clipAt(project, 'text', time);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1500px] mx-auto">
      <Header
        offline={false}
        hasProject
        title={project.projectMetadata.title}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        historyCount={historyCount}
        onUndo={undo}
        onRedo={redo}
        onExport={() => setShowExportModal(true)}
        onPublish={() => handleToPublish()}
        onShowShortcuts={() => setShowShortcutsModal(true)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        {/* Left: preview + multi-track timeline */}
        <div className="space-y-4 min-w-0">
          {/* Player & Preview Area */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 h-11 border-b border-line bg-surface-2/50 flex-wrap">
              <div className="flex items-center gap-1.5 text-[13px] text-ink font-semibold">
                <Icon name="movie" size={16} className="text-primary" /> Live Frame Preview
              </div>

              {/* Aspect Ratio Switcher */}
              <div className="flex items-center gap-1 bg-surface-3/50 p-0.5 rounded-lg border border-line ml-1">
                {[
                  { id: '9:16', label: '9:16 Reel', icon: 'smartphone' },
                  { id: '1:1', label: '1:1 Square', icon: 'crop_square' },
                  { id: '16:9', label: '16:9 Wide', icon: 'tv' },
                  { id: '4:5', label: '4:5 Portrait', icon: 'photo' },
                ].map((ar) => (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => handleSetAspectRatio(ar.id as TargetAspectRatio)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
                      (project.projectMetadata.targetAspectRatio || '9:16') === ar.id
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-2'
                    }`}
                    title={`Switch canvas to ${ar.label}`}
                  >
                    <Icon name={ar.icon} size={12} />
                    <span>{ar.id}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1" />
              <div className="flex items-center gap-2 font-mono text-[12px] text-ink-dim">
                <span className="text-primary font-bold">{fmtSmpte(time, fps)}</span>
                <span>/</span>
                <span>{fmtSmpte(duration, fps)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 p-5 items-center">
              <div className="mx-auto flex justify-center">
                <div
                  className={`${
                    project.projectMetadata.targetAspectRatio === '16:9'
                      ? 'w-[320px] aspect-[16/9]'
                      : project.projectMetadata.targetAspectRatio === '1:1'
                      ? 'w-[250px] aspect-square'
                      : project.projectMetadata.targetAspectRatio === '4:5'
                      ? 'w-[230px] aspect-[4/5]'
                      : 'w-[220px] aspect-[9/16]'
                  } max-w-full rounded-[22px] border-[5px] border-ink/85 bg-black overflow-hidden relative shadow-md transition-all duration-300`}
                >
                  <ReelPreview
                    ref={reelRef}
                    project={project}
                    playing={playing}
                    playbackRate={playbackSpeed}
                    onPlayingChange={(p) => {
                      setPlaying(p);
                      if (!p) setPlaybackSpeed(1);
                    }}
                    onTime={setTime}
                    captionsVisible={isCaptionsActive}
                    onToggleCaptions={(active) => toggleCaptions(active)}
                    onToggleVideoMute={() => toggleMuteTrack('track-video')}
                    generatingCaptions={generatingCaptions}
                    onGenerateCaptions={handleGenerateCaptions}
                    onUpdateTextClip={handleUpdateTextClip}
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              </div>

              <div className="flex flex-col justify-center gap-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    icon={playing ? 'pause' : 'play_arrow'}
                    onClick={() => setPlaying((p) => !p)}
                    className="px-5"
                  >
                    {playing ? 'Pause' : 'Play (Space)'}
                  </Button>
                  <IconButton name="skip_previous" label="Jump to start" onClick={() => seek(0)} />
                  <IconButton
                    name="restart_alt"
                    label="Restart playback"
                    onClick={() => {
                      seek(0);
                      setPlaying(true);
                    }}
                  />
                  <div className="h-5 w-px bg-line mx-0.5" />
                  <Button
                    variant={isCaptionsActive && tClips.length > 0 ? 'secondary' : 'ghost'}
                    icon={isCaptionsActive && tClips.length > 0 ? 'closed_caption' : 'closed_caption_disabled'}
                    onClick={() => {
                      if (tClips.length === 0) {
                        handleGenerateCaptions();
                      } else {
                        toggleCaptions();
                      }
                    }}
                    title={
                      tClips.length === 0
                        ? 'Generate Live Captions'
                        : isCaptionsActive
                        ? 'Captions visible (click to toggle off)'
                        : 'Captions hidden (click to toggle on)'
                    }
                  >
                    {tClips.length === 0 ? 'Auto CC' : isCaptionsActive ? 'CC On' : 'CC Off'}
                  </Button>
                  <Button
                    variant="ghost"
                    icon={generatingCaptions ? 'hourglass_top' : 'auto_awesome'}
                    onClick={handleGenerateCaptions}
                    disabled={generatingCaptions}
                    title="Extract speech from audio and generate synchronized captions"
                  >
                    {generatingCaptions ? 'Syncing...' : 'AI Live CC'}
                  </Button>
                </div>

                <div className="text-[13px] text-ink-muted leading-relaxed bg-surface-2/60 p-3 rounded-btn border border-line">
                  Scrub the multi-track timeline below. Press <Key>S</Key> to split, <Key>âŒ«</Key> to ripple-delete, and{' '}
                  <Key>âŒ˜/Ctrl</Key>+<Key>Z</Key> to undo.
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <StatusPill tone="primary">{vClips.length} video cuts</StatusPill>
                  {bClips.length > 0 && <StatusPill tone="secondary">{bClips.length} B-Roll overlays</StatusPill>}
                  <StatusPill tone="secondary">{tClips.length} subtitle cues</StatusPill>
                  {sClips.length > 0 && <StatusPill tone="tertiary">{sClips.length} SFX triggers</StatusPill>}
                  <StatusPill tone="neutral">
                    {project.projectMetadata.targetAspectRatio} Â· {fps}fps
                  </StatusPill>
                </div>
              </div>
            </div>
          </Card>

          {/* Edit Toolbar */}
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ToolBtn icon="content_cut" label="Split at playhead (S)" onClick={doSplit} disabled={!canCut} />
              <ToolBtn
                icon="flip_to_front"
                label="Trim start"
                onClick={() => doTrim('start')}
                disabled={!selectedClip}
              />
              <ToolBtn
                icon="flip_to_back"
                label="Trim end"
                onClick={() => doTrim('end')}
                disabled={!selectedClip}
              />
              <ToolBtn icon="delete" label="Ripple Delete (âŒ«)" onClick={doDelete} disabled={!canCut} danger />
              <ToolBtn
                icon="align_horizontal_left"
                label="Tighten gaps"
                onClick={doTighten}
                disabled={vClips.length < 2}
              />
              <div className="h-5 w-px bg-line mx-0.5" />
              <ToolBtn
                icon="add_to_photos"
                label={uploadingVideo ? `Uploading (${uploadProgress ?? 0}%)...` : "Add Video Clip"}
                onClick={() => {
                  setUploadActionTarget('playhead');
                  fileInputRef.current?.click();
                }}
                disabled={uploadingVideo}
              />

              <div className="flex-1" />

              <div className="flex items-center gap-2 text-ink-muted pl-2 border-l border-line">
                <Icon name="zoom_out" size={16} />
                <input
                  type="range"
                  min={16}
                  max={160}
                  step={4}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-24 sm:w-32 cursor-pointer"
                  aria-label="Timeline zoom"
                />
                <Icon name="zoom_in" size={16} />
              </div>
            </div>
          </Card>

          {/* Multi-Track Timeline */}
          <Card className="p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Icon name="view_timeline" size={18} className="text-primary" />
                <h2 className="font-semibold text-ink text-sm">Multi-Track Timeline</h2>
              </div>
              <span className="text-[11.5px] text-ink-dim font-mono">
                {selectedIds.length > 1
                  ? `Selected: ${selectedIds.length} clips (Shift+Click / Marquee)`
                  : selectedClip
                  ? `Selected: ${clipLabel(selectedClip)}`
                  : 'Click clip to select Â· Drag ruler to scrub Â· Drag background to marquee select'}
              </span>
            </div>

            <div className="flex">
              {/* Track Headers / Gutter */}
              <div className="shrink-0" style={{ width: GUTTER_W }}>
                <div style={{ height: RULER_H }} className="border-b border-line bg-surface-2" />
                {project.tracks.map((tr) => (
                  <GutterTrackHeader
                    key={tr.id}
                    track={tr}
                    h={LANE_H}
                    onToggleMute={() => toggleMuteTrack(tr.id)}
                    onToggleLock={() => toggleLockTrack(tr.id)}
                  />
                ))}
              </div>

              {/* Scrollable Timeline Lanes */}
              <div className="overflow-x-auto flex-1 rounded-r-md border border-line bg-app">
                <div
                  ref={contentRef}
                  className="relative select-none"
                  style={{ width: contentWidth }}
                  onPointerDown={(e) => {
                    const el = contentRef.current;
                    if (!el || !project) return;
                    const rect = el.getBoundingClientRect();
                    const localX = e.clientX - rect.left;
                    const localY = e.clientY - rect.top;
                    if (localY <= RULER_H) {
                      dragging.current = true;
                      seekFromClientX(e.clientX);
                      return;
                    }
                    marqueeActiveRef.current = false;
                    marqueeStartPosRef.current = { clientX: e.clientX, clientY: e.clientY };
                    setMarquee({ startX: localX, startY: localY, currentX: localX, currentY: localY });
                  }}
                >
                  <Ruler duration={duration} zoom={zoom} height={RULER_H} />

                  {project.tracks.map((tr) => (
                    <ClipLane key={tr.id} height={LANE_H} duration={duration} zoom={zoom}>
                      {tr.clips.map((c) => (
                        <ClipBlock
                          key={c.id}
                          clip={c}
                          zoom={zoom}
                          selected={selectedIds.includes(c.id)}
                          color={
                            tr.id === 'track-broll'
                              ? '#6366F1'
                              : tr.type === 'video'
                              ? 'var(--primary, #3E4A3D)'
                              : tr.type === 'text'
                              ? 'var(--tertiary, #285C4D)'
                              : 'var(--secondary, #825E3E)'
                          }
                          label={clipLabel(c)}
                          compact={tr.type !== 'video'}
                          isLocked={tr.isLocked}
                          project={project}
                          onSelect={(evt) => handleSelectClip(c.id, evt)}
                          onMove={(newStart) => handleMoveClip(c.id, newStart)}
                          onTrim={(edge, atTime) => handleTrimClip(c.id, edge, atTime)}
                          onSnap={(snapTime) => setSnapGuide(snapTime)}
                        />
                      ))}
                    </ClipLane>
                  ))}

                  {/* Marquee Drag Selection Box */}
                  {marquee && marqueeActiveRef.current && (
                    <div
                      className="absolute border border-primary bg-primary/25 pointer-events-none rounded z-30 ring-1 ring-primary/50 shadow-sm"
                      style={{
                        left: Math.min(marquee.startX, marquee.currentX),
                        top: Math.min(marquee.startY, marquee.currentY),
                        width: Math.abs(marquee.currentX - marquee.startX),
                        height: Math.abs(marquee.currentY - marquee.startY),
                      }}
                    />
                  )}

                  {/* Magnetic Snap Guideline */}
                  {snapGuide !== null && (
                    <div
                      className="absolute top-0 bottom-0 z-30 pointer-events-none"
                      style={{ left: snapGuide * zoom }}
                    >
                      <div className="w-[1.5px] h-full bg-amber-400 ring-2 ring-amber-400/40 shadow-sm" />
                      <div className="absolute top-0 -translate-x-1/2 bg-amber-500 text-black font-extrabold text-[9px] font-mono px-1 rounded shadow-sm">
                        {snapGuide.toFixed(2)}s
                      </div>
                    </div>
                  )}

                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 z-20 pointer-events-none"
                    style={{ left: time * zoom }}
                  >
                    <div className="w-[1.5px] h-full bg-danger shadow-sm" />
                    <div className="absolute -top-0.5 -left-[5px] w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-danger" />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Assistance & Inspector Rail */}
        <div className="space-y-4">
          {/* Tabs header */}
          <div className="flex rounded-btn bg-surface-2 p-1 border border-line">
            {[
              { id: 'polish', label: 'Polish', icon: 'auto_awesome' },
              { id: 'media', label: 'Footage', icon: 'video_library' },
              { id: 'captions', label: 'Captions', icon: 'subtitles' },
              { id: 'broll', label: 'B-Roll', icon: 'movie' },
              { id: 'audio', label: 'Audio', icon: 'music_note' },
              { id: 'inspector', label: 'Inspect', icon: 'tune' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-1.5 px-2 rounded-btn text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                  activeTab === tab.id
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon name={tab.icon} size={14} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab 1: AI Polish */}
          {activeTab === 'polish' && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Icon name="auto_awesome" size={18} className="text-tertiary" />
                <h2 className="font-semibold text-ink text-sm">Preset Auto-Reassembly</h2>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Re-compile the timeline EDL with a tuned preset rhythm.
              </p>

              <div className="grid grid-cols-1 gap-2">
                {PRESETS.map((p) => {
                  const active = presetId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPresetId(p.id)}
                      className={`text-left rounded-btn border p-2.5 flex items-center gap-2.5 transition-all kt-focus ${
                        active
                          ? 'border-primary bg-primary-soft ring-1 ring-primary/30'
                          : 'border-line hover:border-line-strong bg-surface'
                      }`}
                    >
                      <span
                        className="grid place-items-center w-8 h-8 rounded-btn shrink-0"
                        style={{ background: `var(--${p.accent}-soft)`, color: `var(--${p.accent})` }}
                      >
                        <Icon name={p.icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink truncate">{p.name}</span>
                        <span className="block text-[11px] text-ink-dim truncate">{p.tagline}</span>
                      </span>
                      {active && <Icon name="check_circle" size={17} className="text-primary" />}
                    </button>
                  );
                })}
              </div>

              <Button
                className="w-full mt-2"
                icon={polishing ? 'autorenew' : 'bolt'}
                onClick={rePolish}
                disabled={!sourceVideo || polishing}
              >
                {polishing ? 'Polishing timeline...' : 'Apply Preset Look'}
              </Button>
            </Card>
          )}

          {/* Tab: Footage & Device Media Library */}
          {activeTab === 'media' && (
            <div className="space-y-4">
              {/* Card 1: Upload from Device */}
              <Card className="p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="cloud_upload" size={18} className="text-primary" />
                    <h2 className="font-semibold text-ink text-sm">Add Video from Device</h2>
                  </div>
                  {uploadingVideo && (
                    <StatusPill tone="primary">Uploading {uploadProgress ?? 0}%</StatusPill>
                  )}
                </div>

                <p className="text-xs text-ink-muted leading-relaxed">
                  Import video files directly from your computer to insert as video cuts or B-Roll cutaways.
                </p>

                {/* Upload Action Target Selector */}
                <div>
                  <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider block mb-1.5">
                    Insert Mode on Upload
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'playhead', label: 'At Playhead', desc: 'Insert at scrubber' },
                      { id: 'append', label: 'Append End', desc: 'Add after timeline' },
                      { id: 'broll', label: 'B-Roll Clip', desc: 'Overlay track' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setUploadActionTarget(m.id as any)}
                        className={`p-2 rounded-btn border text-left transition-all ${
                          uploadActionTarget === m.id
                            ? 'border-primary bg-primary-soft text-ink shadow-xs ring-1 ring-primary/30'
                            : 'border-line text-ink-muted hover:text-ink'
                        }`}
                      >
                        <div className="text-xs font-semibold">{m.label}</div>
                        <div className="text-[10px] text-ink-dim">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Upload Drop Area */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 rounded-card border-2 border-dashed border-line hover:border-primary/60 bg-surface-2/40 hover:bg-surface-2/80 cursor-pointer text-center transition-all group"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform grid place-items-center mx-auto mb-2">
                    <Icon name="upload_file" size={20} />
                  </div>
                  <div className="text-xs font-semibold text-ink">Choose video file from device</div>
                  <div className="text-[10.5px] text-ink-dim mt-0.5">MP4, MOV, WebM, MKV up to 500MB</div>
                </div>

                {uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-ink-dim">
                      <span>Importing video...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-surface-3 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-primary h-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}

                {mediaNotice && (
                  <div className="p-2.5 rounded-btn bg-surface-2/80 border border-line text-xs text-ink flex items-center justify-between">
                    <span>{mediaNotice}</span>
                    <button
                      type="button"
                      onClick={() => setMediaNotice(null)}
                      className="text-ink-muted hover:text-ink text-[11px]"
                    >
                      âœ•
                    </button>
                  </div>
                )}
              </Card>

              {/* Card 2: Device Media Library */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="video_library" size={18} className="text-secondary" />
                    <h2 className="font-semibold text-ink text-sm">Device Footage ({videos.length})</h2>
                  </div>
                  <span className="text-[11px] font-mono text-ink-dim">{fmtTime(time)}</span>
                </div>

                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {videos.map((v) => {
                    const isCurrentSource = sourceVideo?.id === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`p-2.5 rounded-btn border bg-surface hover:border-line-strong transition-all flex flex-col gap-2 ${
                          isCurrentSource ? 'border-primary/50 bg-primary-soft/20' : 'border-line'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-ink truncate flex items-center gap-1.5">
                              <span>{v.title}</span>
                              {isCurrentSource && (
                                <span className="px-1.5 py-0.5 rounded-full bg-primary text-[9px] text-on-primary font-bold tracking-tight">
                                  Active Base
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-ink-dim flex items-center gap-2 mt-0.5">
                              <span>{fmtTime(v.duration || 0)}</span>
                              <span>Â·</span>
                              <span>{v.status}</span>
                            </div>
                          </div>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-line/60">
                          <button
                            type="button"
                            onClick={() => handleInsertExistingVideo(v, 'playhead')}
                            className="px-2 py-1 rounded-btn text-[11px] font-medium bg-surface-2 hover:bg-primary hover:text-on-primary text-ink transition-colors flex items-center gap-1"
                            title="Insert this clip into video track at scrubber playhead"
                          >
                            <Icon name="add" size={12} />
                            <span>At Playhead</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertExistingVideo(v, 'append')}
                            className="px-2 py-1 rounded-btn text-[11px] font-medium bg-surface-2 hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors flex items-center gap-1"
                            title="Append to the end of timeline"
                          >
                            <Icon name="playlist_add" size={12} />
                            <span>Append</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertExistingVideo(v, 'broll')}
                            className="px-2 py-1 rounded-btn text-[11px] font-medium bg-surface-2 hover:bg-secondary hover:text-white text-ink transition-colors flex items-center gap-1"
                            title="Insert as B-Roll overlay at playhead"
                          >
                            <Icon name="layers" size={12} />
                            <span>B-Roll</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertExistingVideo(v, 'newProject')}
                            className="px-2 py-1 rounded-btn text-[11px] font-medium bg-surface-2 hover:bg-tertiary hover:text-white text-ink-muted hover:text-ink transition-colors flex items-center gap-1 ml-auto"
                            title="Start new smart auto-edit project with this video"
                          >
                            <Icon name="auto_awesome" size={12} />
                            <span>Re-Edit</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {videos.length === 0 && (
                    <div className="py-6 text-center text-xs text-ink-muted">
                      No video footage uploaded yet. Click above to import from your device.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Tab 2: Visual Caption Styling Toolbar & AI Live STT */}
          {activeTab === 'captions' && (
            <div className="space-y-4">
              {/* Card 1: AI Audio Transcription & Live Captions */}
              <Card className="p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="auto_awesome" size={18} className="text-primary" />
                    <h2 className="font-semibold text-ink text-sm">AI Live Captions</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusPill tone={tClips.length > 0 ? 'primary' : 'neutral'}>
                      {tClips.length > 0 ? `${tClips.length} cues` : 'No captions'}
                    </StatusPill>
                  </div>
                </div>

                <p className="text-xs text-ink-muted leading-relaxed">
                  Transcribes audio dialogue with AI into word-level kinetic subtitle cues with aligned timeline timestamps.
                </p>

                {/* Feedback notification */}
                {captionNotice && (
                  <div className="p-2.5 rounded-btn bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <Icon name="check_circle" size={14} className="text-emerald-600 shrink-0" />
                      <span className="truncate">{captionNotice}</span>
                    </div>
                    <button
                      onClick={() => setCaptionNotice(null)}
                      className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-100"
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                )}

                {/* Dialogue Language Selector */}
                <div>
                  <label className="kt-eyebrow block mb-1.5">Audio Speech Language</label>
                  <select
                    value={captionLang}
                    onChange={(e) => setCaptionLang(e.target.value)}
                    className="w-full p-2 rounded-btn bg-surface-2 border border-line text-xs font-medium text-ink focus:outline-none focus:border-primary"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish (EspaÃ±ol)</option>
                    <option value="French">French (FranÃ§ais)</option>
                    <option value="German">German (Deutsch)</option>
                    <option value="Hindi">Hindi (à¤¹à¤¿à¤¨à¥à¤¦à¥€)</option>
                    <option value="Japanese">Japanese (æ—¥æœ¬èªž)</option>
                    <option value="Portuguese">Portuguese (PortuguÃªs)</option>
                    <option value="Chinese">Chinese (ä¸­æ–‡)</option>
                  </select>
                </div>

                {/* Main Action Button */}
                <Button
                  className="w-full"
                  icon={generatingCaptions ? 'hourglass_top' : 'auto_awesome'}
                  onClick={handleGenerateCaptions}
                  disabled={generatingCaptions}
                >
                  {generatingCaptions
                    ? 'AI Transcribing & Syncing...'
                    : tClips.length > 0
                    ? 'Regenerate Live Captions'
                    : 'Transcribe Audio & Generate Live Captions'}
                </Button>

                {/* Toggle Controls & Track Muting */}
                <div className="pt-2 border-t border-line flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    <Icon
                      name={isCaptionsActive ? 'closed_caption' : 'closed_caption_disabled'}
                      size={15}
                      className="text-primary"
                    />
                    <span>Live Display (CC)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCaptions()}
                      className={`px-2.5 py-1 rounded-btn text-xs font-semibold border transition-all ${
                        isCaptionsActive
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-surface-2 text-ink-muted border-line hover:text-ink'
                      }`}
                    >
                      {isCaptionsActive ? 'CC On' : 'CC Off'}
                    </button>
                    {tClips.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearCaptions}
                        className="text-danger hover:underline text-xs"
                        title="Remove captions from timeline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Card 2: Visual Caption Styling Toolbar */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="format_paint" size={18} className="text-tertiary" />
                    <h2 className="font-semibold text-ink text-sm">Caption Typography & FX</h2>
                  </div>
                </div>

                {/* Viral Preset Cards */}
                <div>
                  <label className="kt-eyebrow block mb-2">Viral Style Presets</label>
                  <div className="grid grid-cols-2 gap-2">
                    {KINETIC_CAPTION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          applyEdit((p) => applyCaptionPresetToProject(p, preset.style));
                          setCaptionFont(preset.style.fontFamily);
                          if (preset.style.activeWordColorHex) setHighlightColor(preset.style.activeWordColorHex);
                          setCaptionAnim(preset.style.animation);
                          setCaptionPos(preset.style.position);
                          setCaptionNotice(`Applied ${preset.name} kinetic style across all captions!`);
                        }}
                        className="p-2.5 rounded-card border border-line hover:border-primary/50 bg-surface-2/60 hover:bg-surface-2 text-left transition-all group"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-ink group-hover:text-primary transition-colors">
                          <Icon name={preset.icon} size={15} className="text-primary" />
                          <span className="truncate">{preset.name}</span>
                        </div>
                        <p className="text-[10.5px] text-ink-dim mt-0.5 line-clamp-1 leading-snug">
                          {preset.tagline}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family Selector */}
                <div>
                  <label className="kt-eyebrow block mb-1.5">Font Style</label>
                  <select
                    value={captionFont}
                    onChange={(e) => {
                      const font = e.target.value;
                      setCaptionFont(font);
                      updateGlobalCaptionStyle({ fontFamily: font });
                    }}
                    className="w-full p-2 rounded-btn bg-surface-2 border border-line text-xs font-medium text-ink focus:outline-none focus:border-primary"
                  >
                    {FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Highlight Color Picker */}
                <div>
                  <label className="kt-eyebrow block mb-1.5">Word Highlight Accent</label>
                  <div className="flex items-center gap-2">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        onClick={() => {
                          setHighlightColor(c.hex);
                          updateGlobalCaptionStyle({ activeWordColorHex: c.hex });
                        }}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                          highlightColor === c.hex ? 'border-ink scale-110 shadow-sm' : 'border-line'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Animation Preset */}
                <div>
                  <label className="kt-eyebrow block mb-1.5">Kinetic Animation</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ANIMATION_PRESETS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setCaptionAnim(a.id);
                          updateGlobalCaptionStyle({ animation: a.id });
                        }}
                        className={`p-2 rounded-btn border text-left text-xs font-medium flex items-center gap-1.5 transition-colors ${
                          captionAnim === a.id
                            ? 'border-primary bg-primary-soft text-primary font-semibold'
                            : 'border-line hover:border-line-strong text-ink-muted'
                        }`}
                      >
                        <Icon name={a.icon} size={15} />
                        <span className="truncate">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label className="kt-eyebrow block mb-1.5">Screen Position</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'top', label: 'Top' },
                      { id: 'middle', label: 'Center Hook' },
                      { id: 'bottom', label: 'Lower 3rd' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          const pos = p.id as any;
                          setCaptionPos(pos);
                          updateGlobalCaptionStyle({ position: pos });
                        }}
                        className={`py-1.5 px-2 rounded-btn border text-xs font-medium transition-colors ${
                          captionPos === p.id
                            ? 'border-primary bg-primary-soft text-primary font-semibold'
                            : 'border-line text-ink-muted hover:text-ink'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Tab 3: BGM & Audio Studio */}
          {activeTab === 'audio' && (
            <div className="space-y-4">
              {/* Card 1: Background Music Presets */}
              <Card className="p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="music_note" size={18} className="text-secondary" />
                    <h2 className="font-semibold text-ink text-sm">Background Music (BGM)</h2>
                  </div>
                  {currentBgm && (
                    <StatusPill tone="secondary">Active Beat</StatusPill>
                  )}
                </div>

                <p className="text-xs text-ink-muted leading-relaxed">
                  Layer royalty-free soundtrack loops under your speech with intelligent voice ducking.
                </p>

                {/* BGM Preset Selection Grid */}
                <div className="grid grid-cols-1 gap-2">
                  {/* None option */}
                  <button
                    type="button"
                    onClick={() => {
                      setBgm(undefined);
                      sfxEngine.stopBGM();
                      setPreviewingBgm(null);
                    }}
                    className={`p-2.5 rounded-card border text-left flex items-center justify-between transition-all ${
                      !currentBgm
                        ? 'border-primary bg-primary-soft ring-1 ring-primary/30'
                        : 'border-line hover:border-line-strong bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="volume_off" size={16} className="text-ink-dim" />
                      <div>
                        <div className="text-xs font-semibold text-ink">No Background Music</div>
                        <div className="text-[10px] text-ink-dim">Dialogue & SFX only</div>
                      </div>
                    </div>
                    {!currentBgm && <Icon name="check_circle" size={16} className="text-primary" />}
                  </button>

                  {BGM_TRACKS.map((p) => {
                    const active = currentBgm === p.id;
                    const isTesting = previewingBgm === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`p-2.5 rounded-card border flex items-center justify-between transition-all ${
                          active
                            ? 'border-secondary bg-secondary-soft ring-1 ring-secondary/30'
                            : 'border-line hover:border-line-strong bg-surface'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setBgm(p.id, p.url)}
                          className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                        >
                          <span className={`w-8 h-8 rounded-full grid place-items-center shrink-0 transition-colors ${
                            isTesting
                              ? 'bg-secondary text-white animate-pulse'
                              : active
                              ? 'bg-secondary/20 text-secondary'
                              : 'bg-surface-muted text-ink-muted'
                          }`}>
                            <Icon name={p.icon} size={16} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-ink truncate">{p.name}</span>
                              <span className="text-[10px] text-ink-dim px-1.5 py-0.5 rounded bg-surface-muted border border-line font-mono shrink-0">
                                {p.duration}
                              </span>
                              <span className="text-[9.5px] text-secondary font-medium px-1 py-0.5 rounded bg-secondary/10 shrink-0">
                                {p.genre}
                              </span>
                            </div>
                            <div className="text-[10.5px] text-ink-dim truncate mt-0.5">{p.mood}</div>
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0 pl-2">
                          <button
                            type="button"
                            onClick={() => handleTestBgm(p.id, p.url)}
                            title={isTesting ? 'Stop preview' : 'Listen to track'}
                            className={`w-7 h-7 rounded-full border grid place-items-center text-xs transition-colors ${
                              isTesting
                                ? 'bg-secondary text-white border-secondary shadow-sm ring-2 ring-secondary/30'
                                : 'border-line hover:border-line-strong text-ink-muted hover:text-ink hover:bg-surface-muted'
                            }`}
                          >
                            <Icon name={isTesting ? 'stop' : 'play_arrow'} size={15} />
                          </button>
                          {active && <Icon name="check_circle" size={16} className="text-secondary" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Volume & Ducking Controls when BGM is chosen */}
                {currentBgm && (
                  <div className="pt-3 border-t border-line space-y-3.5">
                    {/* BGM Volume Slider */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-ink">Music Mix Level</span>
                        <span className="font-mono text-ink-dim">{Math.round(currentBgmVol * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={currentBgmVol}
                        onChange={(e) => setBgmVolume(Number(e.target.value))}
                        className="w-full cursor-pointer accent-secondary"
                      />
                    </div>

                    {/* Smart Voice Ducking Toggle */}
                    <div className="p-3 rounded-card bg-surface-2/60 border border-line flex items-center justify-between">
                      <div className="pr-3">
                        <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                          <Icon name="hearing" size={15} className="text-secondary" />
                          <span>Smart Voice Ducking</span>
                        </div>
                        <p className="text-[11px] text-ink-dim mt-0.5 leading-snug">
                          Ducks music volume down by 70% automatically whenever speech voiceover is active.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleDucking}
                        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                          isDucking ? 'bg-secondary' : 'bg-surface-3'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                            isDucking ? 'right-0.5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Card 2: Quick-Insert SFX Triggers */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="volume_up" size={18} className="text-primary" />
                    <h2 className="font-semibold text-ink text-sm">Insert SFX at Playhead</h2>
                  </div>
                  <span className="text-[11px] font-mono text-ink-dim">{fmtTime(time)}</span>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Click to drop a punchy viral sound effect cue onto the SFX track at current time.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'vine_boom', label: 'Vine Boom', icon: 'bolt' },
                    { id: 'cash_register', label: 'Cash Register', icon: 'payments' },
                    { id: 'chime', label: 'Magic Chime', icon: 'auto_awesome' },
                    { id: 'pop', label: 'UI Pop', icon: 'touch_app' },
                    { id: 'whoosh', label: 'Fast Whoosh', icon: 'air' },
                    { id: 'glitch', label: 'Cyber Glitch', icon: 'stream' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addSfxAtPlayhead(s.id)}
                      className="p-2 rounded-btn border border-line hover:border-primary/50 bg-surface-2/40 hover:bg-surface-2 text-left text-xs font-medium text-ink flex items-center gap-1.5 transition-colors group"
                    >
                      <Icon name={s.icon} size={14} className="text-primary group-hover:scale-110 transition-transform" />
                      <span className="truncate">{s.label}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* Tab: B-Roll & Visual Overlays */}
          {activeTab === 'broll' && (
            <div className="space-y-4">
              {/* Card 1: AI Auto-Match Engine */}
              <Card className="p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="movie" size={18} className="text-secondary" />
                    <h2 className="font-semibold text-ink text-sm">B-Roll Auto-Insert Engine</h2>
                  </div>
                  <span className="text-[11px] font-mono text-ink-dim">
                    {bClips.length} active on timeline
                  </span>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Scans spoken speech keywords from live captions and automatically drops contextual video loops into the B-Roll overlay track.
                </p>

                {/* Density Selection */}
                <div>
                  <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider block mb-1.5">
                    Cutaway Rhythm
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'light', label: 'Light', desc: 'Every 8s' },
                      { id: 'medium', label: 'Balanced', desc: 'Every 5s' },
                      { id: 'dense', label: 'Dense', desc: 'Every 3.5s' },
                    ].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setBrollDensity(d.id as any)}
                        className={`p-2 rounded-btn border text-left transition-all ${
                          brollDensity === d.id
                            ? 'border-secondary bg-secondary/10 text-ink shadow-xs'
                            : 'border-line text-ink-muted hover:text-ink'
                        }`}
                      >
                        <div className="text-xs font-semibold">{d.label}</div>
                        <div className="text-[10px] text-ink-dim">{d.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button
                    icon="auto_awesome"
                    onClick={handleAutoMatchBroll}
                    className="flex-1"
                  >
                    Auto-Match B-Roll
                  </Button>
                  <Button
                    variant="secondary"
                    icon="upload_file"
                    onClick={() => {
                      setUploadActionTarget('broll');
                      fileInputRef.current?.click();
                    }}
                    title="Upload video from your device as B-Roll overlay"
                  >
                    Upload Custom
                  </Button>
                  {bClips.length > 0 && (
                    <Button
                      variant="ghost"
                      icon="delete_sweep"
                      onClick={handleClearBroll}
                      title="Clear all B-roll clips from timeline"
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {/* Status Notice Banner */}
                {brollNotice && (
                  <div className="p-2.5 rounded-btn bg-surface-2/80 border border-line text-xs text-ink flex items-center justify-between">
                    <span>{brollNotice}</span>
                    <button
                      type="button"
                      onClick={() => setBrollNotice(null)}
                      className="text-ink-muted hover:text-ink text-[11px]"
                    >
                      âœ•
                    </button>
                  </div>
                )}
              </Card>

              {/* Card 2: Curated Stock Footage Library */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="video_library" size={18} className="text-primary" />
                    <h2 className="font-semibold text-ink text-sm">Stock Footage Library</h2>
                  </div>
                  <span className="text-[11px] font-mono text-ink-dim">{fmtTime(time)}</span>
                </div>

                {/* Search & Category Pills */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={brollSearch}
                    onChange={(e) => setBrollSearch(e.target.value)}
                    placeholder="Search footage (e.g. code, crypto, coffee, city)..."
                    className="w-full px-3 py-1.5 rounded-btn border border-line bg-surface text-xs text-ink placeholder:text-ink-muted kt-focus"
                  />

                  <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'tech', label: 'Tech & AI' },
                      { id: 'finance', label: 'Finance' },
                      { id: 'urban', label: 'Urban' },
                      { id: 'lifestyle', label: 'Lifestyle' },
                      { id: 'energy', label: 'Viral Speed' },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setBrollCategory(c.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 transition-colors ${
                          brollCategory === c.id
                            ? 'bg-ink text-white'
                            : 'bg-surface-2 text-ink-muted hover:text-ink'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid of B-Roll Cards */}
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {filteredBroll.map((asset) => {
                    const isPreviewing = previewingBrollVideo === asset.id;
                    return (
                      <div
                        key={asset.id}
                        className="p-2.5 rounded-btn border border-line bg-surface hover:border-line-strong transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-ink truncate flex items-center gap-1.5">
                              <span>{asset.title}</span>
                              <span className="px-1.5 py-0.5 rounded-full bg-surface-2 text-[9px] text-ink-dim uppercase font-bold tracking-tight">
                                {asset.tag}
                              </span>
                            </div>
                            <div className="text-[10.5px] text-ink-muted truncate mt-0.5">
                              {asset.keywords.slice(0, 4).join(', ')}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewingBrollVideo(isPreviewing ? null : asset.id)}
                              className={`p-1.5 rounded-btn border text-xs transition-colors ${
                                isPreviewing
                                  ? 'bg-secondary text-white border-secondary'
                                  : 'border-line hover:border-line-strong text-ink-muted hover:text-ink'
                              }`}
                              title={isPreviewing ? 'Close video preview' : 'Preview video loop'}
                            >
                              <Icon name={isPreviewing ? 'visibility_off' : 'visibility'} size={14} />
                            </button>
                            <Button
                              size="sm"
                              icon="add"
                              onClick={() => handleInsertBroll(asset.id)}
                              title="Drop onto B-roll overlay track at playhead"
                            >
                              Drop
                            </Button>
                          </div>
                        </div>

                        {/* Inline Video Preview when opened */}
                        {isPreviewing && (
                          <div className="rounded-md overflow-hidden aspect-video bg-black relative border border-line mt-1">
                            <video
                              src={asset.videoUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredBroll.length === 0 && (
                    <div className="py-6 text-center text-xs text-ink-muted">
                      No footage matches "{brollSearch}". Try searching for code, money, city, or ocean.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Tab: Inspector */}
          {activeTab === 'inspector' && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink text-sm">Clip Inspector</h2>
                {selectedIds.length > 1 && (
                  <StatusPill tone="primary">{selectedIds.length} clips selected</StatusPill>
                )}
              </div>

              {selectedIds.length > 1 && (
                <div className="p-2.5 rounded-card bg-primary-soft border border-primary/20 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Icon name="select_all" size={16} className="text-primary" />
                    <span>Multi-Selection Group</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-danger hover:bg-danger/10 text-xs py-1 px-2"
                      onClick={doDelete}
                    >
                      Delete All ({selectedIds.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs py-1 px-2"
                      onClick={() => setSelectedIds([])}
                    >
                      Deselect
                    </Button>
                  </div>
                </div>
              )}

              {selectedClip ? (
                <SelectedPanel
                  clip={selectedClip}
                  onTrim={doTrim}
                  onDelete={doDelete}
                  onSplit={doSplit}
                  time={time}
                  onUpdateTextClip={handleUpdateTextClip}
                  onUpdateWord={handleUpdateWord}
                  onUpdateVideoClip={handleUpdateVideoClip}
                  onUpdateSFXClip={handleUpdateSFXClip}
                />
              ) : (
                <p className="text-xs text-ink-muted py-6 text-center">
                  Select any clip on the multi-track timeline to inspect and trim in/out boundaries.
                </p>
              )}
            </Card>
          )}

          {/* Finish & Handoff Card */}
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold text-ink text-sm">Export & Publish</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon="download" onClick={() => setShowExportModal(true)}>
                Export Video
              </Button>
              <Button icon="schedule_send" onClick={() => handleToPublish()}>
                Schedule
              </Button>
            </div>
            <div className="pt-2 border-t border-line flex items-center justify-between text-xs text-ink-dim">
              <button
                onClick={() => setShowShortcutsModal(true)}
                className="hover:text-primary flex items-center gap-1"
              >
                <Icon name="keyboard" size={14} /> Shortcuts
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('kt:navigate', { detail: 'raw-reel' }))}
                className="hover:text-primary"
              >
                â† Raw Studio
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Hidden File Input for Device Video Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleDeviceVideoUpload(e, uploadActionTarget)}
        className="hidden"
      />

      {/* Video Export Modal */}
      {showExportModal && (
        <ExportModal
          project={project}
          defaultSourceUrl={sourceVideo?.file_url || videos[0]?.file_url}
          onClose={() => setShowExportModal(false)}
          onSendToPublish={(exported) => {
            setShowExportModal(false);
            handleToPublish(exported);
          }}
        />
      )}

      {/* Keyboard Shortcuts Dialog */}
      {showShortcutsModal && (
        <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {/* Gemini API Key Dialog with Free Auto-Sync fallback */}
      {showApiKeyModal && (
        <GeminiKeyModal
          onClose={() => setShowApiKeyModal(false)}
          onAutoGenerate={async () => {
            setShowApiKeyModal(false);
            await handleGenerateCaptions('');
          }}
          onSave={async (key) => {
            localStorage.setItem('kontentos_gemini_api_key', key);
            try {
              await api.saveGeminiApiKey(key);
            } catch {}
            setShowApiKeyModal(false);
            // Immediately run transcription with newly saved key
            await handleGenerateCaptions(key);
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Sub-views -------------------------------- */

function Header({
  hasProject,
  title,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  historyCount,
  onUndo,
  onRedo,
  onExport,
  onPublish,
  onShowShortcuts,
}: {
  offline: boolean;
  hasProject: boolean;
  title?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  undoLabel?: string;
  redoLabel?: string;
  historyCount?: { past: number; future: number };
  onUndo?: () => void;
  onRedo?: () => void;
  onExport?: () => void;
  onPublish?: () => void;
  onShowShortcuts?: () => void;
}) {
  return (
    <PageHeader
      eyebrow="Smart Editor Â· 60fps Multi-Track"
      icon="content_cut"
      title={hasProject && title ? title : 'Editorial precision on the timeline'}
      className="mb-6"
      actions={
        hasProject && (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton name="keyboard" label="Keyboard shortcuts" onClick={onShowShortcuts} />

          {/* Undo / Redo Control Cluster with Step Badges */}
          <div className="flex items-center gap-1 bg-surface-2/80 p-0.5 rounded-lg border border-line">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`h-8 px-2.5 rounded-btn flex items-center gap-1.5 text-xs font-medium transition-all ${
                canUndo
                  ? 'hover:bg-surface-3 text-ink cursor-pointer active:scale-95'
                  : 'opacity-40 text-ink-dim cursor-not-allowed'
              }`}
              title={
                canUndo
                  ? `Undo: ${undoLabel || 'Action'} (Ctrl+Z) [${historyCount?.past || 0} steps]`
                  : 'Nothing to undo'
              }
            >
              <Icon name="undo" size={15} />
              <span>Undo</span>
              {historyCount && historyCount.past > 0 && (
                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-1 rounded-full">
                  {historyCount.past}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`h-8 px-2.5 rounded-btn flex items-center gap-1.5 text-xs font-medium transition-all ${
                canRedo
                  ? 'hover:bg-surface-3 text-ink cursor-pointer active:scale-95'
                  : 'opacity-40 text-ink-dim cursor-not-allowed'
              }`}
              title={
                canRedo
                  ? `Redo: ${redoLabel || 'Action'} (Ctrl+Shift+Z / Ctrl+Y) [${historyCount?.future || 0} steps]`
                  : 'Nothing to redo'
              }
            >
              <Icon name="redo" size={15} />
              <span>Redo</span>
              {historyCount && historyCount.future > 0 && (
                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-1 rounded-full">
                  {historyCount.future}
                </span>
              )}
            </button>
          </div>

          <Button variant="secondary" icon="download" onClick={onExport}>
            Export Video
          </Button>
          <Button icon="schedule_send" onClick={onPublish}>
            Publish
          </Button>
        </div>
        )
      }
    />
  );
}

function GutterTrackHeader({
  track,
  h,
  onToggleMute,
  onToggleLock,
}: {
  track: import('@/lib/timeline').TimelineTrack;
  h: number;
  onToggleMute: () => void;
  onToggleLock: () => void;
}) {
  const icon = track.type === 'video' ? 'videocam' : track.type === 'text' ? 'subtitles' : 'volume_up';

  return (
    <div
      className="flex items-center justify-between text-[11.5px] font-semibold text-ink px-2.5 border-b border-line bg-surface-2/40 select-none"
      style={{ height: h }}
    >
      <div className="flex items-center gap-1.5 truncate pr-1">
        <Icon name={icon} size={15} className="text-primary shrink-0" />
        <span className="truncate">{track.name}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggleMute}
          title={track.isMuted ? 'Unmute track' : 'Mute track'}
          className={`w-5 h-5 rounded grid place-items-center text-[10px] ${
            track.isMuted ? 'bg-danger text-white' : 'text-ink-dim hover:text-ink'
          }`}
        >
          <Icon name={track.isMuted ? 'volume_off' : 'volume_up'} size={12} />
        </button>
        <button
          onClick={onToggleLock}
          title={track.isLocked ? 'Unlock track' : 'Lock track'}
          className={`w-5 h-5 rounded grid place-items-center text-[10px] ${
            track.isLocked ? 'bg-ink text-white' : 'text-ink-dim hover:text-ink'
          }`}
        >
          <Icon name={track.isLocked ? 'lock' : 'lock_open'} size={12} />
        </button>
      </div>
    </div>
  );
}

function Ruler({ duration, zoom, height }: { duration: number; zoom: number; height: number }) {
  const step = zoom >= 64 ? 1 : zoom >= 32 ? 2 : 5;
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(duration); s += 1) ticks.push(s);

  return (
    <div className="relative border-b border-line bg-surface-2" style={{ height }}>
      {ticks.map((s) => (
        <div key={s} className="absolute top-0 h-full" style={{ left: s * zoom }}>
          <div className="w-px h-2 bg-line-strong" style={{ marginTop: height - 8 }} />
          {s % step === 0 && (
            <span className="absolute top-0.5 left-1 text-[9px] font-mono text-ink-dim tabular-nums">
              {fmtTime(s).slice(0, 5)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function ClipLane({
  children,
  height,
  duration,
  zoom,
}: {
  children: React.ReactNode;
  height: number;
  duration: number;
  zoom: number;
}) {
  return (
    <div
      className="relative border-b border-line"
      style={{ height, width: Math.max(120, duration * zoom) }}
    >
      {children}
    </div>
  );
}

function ClipWaveformCanvas({
  clip,
  width,
  height,
}: {
  clip: TimelineClip;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let isMounted = true;
    const url = (clip as VideoClip).sourceUrl;
    if (!url) return;

    extractAudioPeaks(url, 100).then((allPeaks) => {
      if (!isMounted) return;
      const offset = (clip as VideoClip).sourceStartOffset || 0;
      const speed = (clip as VideoClip).speedMultiplier || 1;
      const sliced = slicePeaksForClip(allPeaks, offset, clip.duration, speed, 100);
      setPeaks(sliced);
    });

    return () => {
      isMounted = false;
    };
  }, [(clip as VideoClip).sourceUrl, (clip as VideoClip).sourceStartOffset, clip.duration, (clip as VideoClip).speedMultiplier]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0 || width <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);
    // Draw amplitude lines using primary accent color #285C4D
    ctx.fillStyle = '#285C4D';

    const barWidth = 2;
    const gap = 1;
    const totalBars = Math.floor(width / (barWidth + gap));
    if (totalBars <= 0) return;
    const step = Math.max(1, peaks.length / totalBars);

    for (let i = 0; i < totalBars; i++) {
      const idx = Math.min(peaks.length - 1, Math.floor(i * step));
      const amp = peaks[idx] || 0.1;
      const barH = Math.max(2, amp * (height * 0.72));
      const x = i * (barWidth + gap);
      const y = (height - barH) / 2;

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 0.5);
      ctx.fill();
    }
  }, [peaks, width, height]);

  if (clip.type !== 'video' && clip.type !== 'audio') return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-60 rounded-md mix-blend-screen"
      style={{ width, height }}
    />
  );
}

function ClipBlock({
  clip,
  zoom,
  selected,
  color,
  label,
  compact,
  isLocked,
  project,
  onSelect,
  onMove,
  onTrim,
  onSnap,
}: {
  clip: TimelineClip;
  zoom: number;
  selected: boolean;
  color: string;
  label: string;
  compact?: boolean;
  isLocked?: boolean;
  project: TimelineProject;
  onSelect: (e?: React.PointerEvent) => void;
  onMove: (newStart: number, isFinal?: boolean) => void;
  onTrim: (edge: 'start' | 'end', atTime: number, isFinal?: boolean) => void;
  onSnap: (snapTime: number | null) => void;
}) {
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef<'move' | 'trim-start' | 'trim-end' | null>(null);
  const startXRef = useRef(0);
  const initialStartRef = useRef(clip.startOnTimeline);
  const initialDurationRef = useRef(clip.duration);

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'trim-start' | 'trim-end') => {
    if (isLocked) return;
    e.stopPropagation();
    onSelect(e);

    isDraggingRef.current = true;
    dragModeRef.current = mode;
    startXRef.current = e.clientX;
    initialStartRef.current = clip.startOnTimeline;
    initialDurationRef.current = clip.duration;

    let lastTarget = initialStartRef.current;
    let lastTrimEdge: 'start' | 'end' | null = null;
    let lastTrimTarget = 0;

    const onPointerMove = (moveEvt: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaPx = moveEvt.clientX - startXRef.current;
      const deltaSec = deltaPx / zoom;

      if (dragModeRef.current === 'move') {
        const rawTarget = Math.max(0, initialStartRef.current + deltaSec);
        const snapRes = findSnapPoint(project, rawTarget, zoom, {
          excludeClipId: clip.id,
          thresholdPx: 8,
        });
        const finalStart = snapRes.snapped ? snapRes.time : rawTarget;
        lastTarget = finalStart;
        onSnap(snapRes.snapped && snapRes.snapPoint !== undefined ? snapRes.snapPoint : null);
        onMove(finalStart, false);
      } else if (dragModeRef.current === 'trim-start') {
        const rawTarget = Math.max(0, initialStartRef.current + deltaSec);
        const snapRes = findSnapPoint(project, rawTarget, zoom, {
          excludeClipId: clip.id,
          thresholdPx: 8,
        });
        const finalTrimTime = snapRes.snapped ? snapRes.time : rawTarget;
        lastTrimEdge = 'start';
        lastTrimTarget = finalTrimTime;
        onSnap(snapRes.snapped && snapRes.snapPoint !== undefined ? snapRes.snapPoint : null);
        onTrim('start', finalTrimTime, false);
      } else if (dragModeRef.current === 'trim-end') {
        const rawTarget = Math.max(0.1, initialStartRef.current + initialDurationRef.current + deltaSec);
        const snapRes = findSnapPoint(project, rawTarget, zoom, {
          excludeClipId: clip.id,
          thresholdPx: 8,
        });
        const finalTrimTime = snapRes.snapped ? snapRes.time : rawTarget;
        lastTrimEdge = 'end';
        lastTrimTarget = finalTrimTime;
        onSnap(snapRes.snapped && snapRes.snapPoint !== undefined ? snapRes.snapPoint : null);
        onTrim('end', finalTrimTime, false);
      }
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      onSnap(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      // Commit final single snapshot to history
      if (dragModeRef.current === 'move' && Math.abs(lastTarget - initialStartRef.current) > 0.005) {
        onMove(lastTarget, true);
      } else if (lastTrimEdge) {
        onTrim(lastTrimEdge, lastTrimTarget, true);
      }
      dragModeRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const clipWidth = Math.max(8, clip.duration * zoom);

  return (
    <div
      onPointerDown={(e) => startDrag(e, 'move')}
      className={`group absolute top-1.5 bottom-1.5 rounded-md overflow-visible select-none cursor-grab active:cursor-grabbing text-left transition-shadow ${
        selected ? 'ring-2 ring-offset-1 ring-offset-app ring-primary shadow-md z-10' : 'hover:brightness-110 z-0'
      }`}
      style={{
        left: clip.startOnTimeline * zoom,
        width: clipWidth,
        backgroundColor: color,
        opacity: compact && !selected ? 0.88 : 1,
      }}
    >
      {/* Real-time audio waveform peaks canvas */}
      {(clip.type === 'video' || clip.type === 'audio') && (
        <ClipWaveformCanvas
          clip={clip}
          width={clipWidth}
          height={compact ? 24 : 38}
        />
      )}

      {/* Cut Transition Badge Indicator on Video Clip */}
      {clip.type === 'video' && (clip as VideoClip).transition?.type && (clip as VideoClip).transition?.type !== 'none' && (
        <span
          className="absolute -top-2 left-1 z-30 px-1 py-0.5 rounded bg-amber-500 text-black text-[9px] font-black tracking-tight uppercase shadow-xs flex items-center gap-0.5 pointer-events-none"
          title={`Transition: ${(clip as VideoClip).transition!.type}`}
        >
          <Icon name={(clip as VideoClip).transition!.type === 'flash' ? 'bolt' : 'auto_awesome_motion'} size={9} />
          <span>{(clip as VideoClip).transition!.type}</span>
        </span>
      )}

      {/* Label */}
      <span className="absolute inset-0 flex items-center px-2 text-[10.5px] font-semibold text-white truncate drop-shadow-sm pointer-events-none z-10">
        {label}
      </span>

      {/* Interactive Trim Handles when selected */}
      {selected && !isLocked && (
        <>
          {/* Left Handle (Trim Start) */}
          <div
            onPointerDown={(e) => startDrag(e, 'trim-start')}
            title="Drag to trim start"
            className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/40 hover:bg-white/80 cursor-ew-resize rounded-l-md flex items-center justify-center transition-colors z-20"
          >
            <div className="w-[1.5px] h-3 bg-black/60 rounded-full" />
          </div>

          {/* Right Handle (Trim End) */}
          <div
            onPointerDown={(e) => startDrag(e, 'trim-end')}
            title="Drag to trim end"
            className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/40 hover:bg-white/80 cursor-ew-resize rounded-r-md flex items-center justify-center transition-colors z-20"
          >
            <div className="w-[1.5px] h-3 bg-black/60 rounded-full" />
          </div>
        </>
      )}
    </div>
  );
}

function ToolBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-[12.5px] font-semibold border transition-all kt-focus disabled:opacity-35 disabled:cursor-not-allowed ${
        danger
          ? 'border-danger/30 text-danger hover:bg-danger/10'
          : 'border-line text-ink-muted hover:text-ink hover:bg-surface-2'
      }`}
    >
      <Icon name={icon} size={16} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function SelectedPanel({
  clip,
  time,
  onTrim,
  onDelete,
  onSplit,
  onUpdateTextClip,
  onUpdateWord,
  onUpdateVideoClip,
  onUpdateSFXClip,
}: {
  clip: TimelineClip;
  time: number;
  onTrim: (edge: 'start' | 'end') => void;
  onDelete: () => void;
  onSplit: () => void;
  onUpdateTextClip: (clipId: string, newContent: string, newStyle?: Partial<CaptionStyle>) => void;
  onUpdateWord: (clipId: string, wordIdx: number, newWord: string) => void;
  onUpdateVideoClip: (clipId: string, updates: Partial<VideoClip>) => void;
  onUpdateSFXClip?: (clipId: string, updates: Partial<SFXClip>) => void;
}) {
  const isText = clip.type === 'text';
  const isVideo = clip.type === 'video';
  const isSfx = clip.type === 'sfx';
  const textClip = isText ? (clip as TextClip) : null;
  const videoClip = isVideo ? (clip as VideoClip) : null;
  const sfxClip = isSfx ? (clip as SFXClip) : null;

  const [textDraft, setTextDraft] = useState(textClip?.content ?? '');
  const [editingWordIdx, setEditingWordIdx] = useState<number | null>(null);
  const [editingWordVal, setEditingWordVal] = useState('');

  // Keep text draft synced when selecting different clips
  useEffect(() => {
    if (textClip) {
      setTextDraft(textClip.content);
    }
    setEditingWordIdx(null);
  }, [clip.id, textClip?.content]);

  const end = clip.startOnTimeline + clip.duration;

  const commitTextChange = (newVal: string) => {
    setTextDraft(newVal);
    onUpdateTextClip(clip.id, newVal);
  };

  const handleWordSave = (idx: number) => {
    if (!editingWordVal.trim()) {
      setEditingWordIdx(null);
      return;
    }
    onUpdateWord(clip.id, idx, editingWordVal.trim());
    setEditingWordIdx(null);
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-surface-2 p-2.5 rounded-btn border border-line flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`text-[9.5px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wide ${
                isText
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : isVideo
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {isText ? 'Kinetic Caption' : isVideo ? 'Primary Video' : 'SFX Audio'}
            </span>
          </div>
          <div className="text-[13px] font-semibold text-ink truncate">{clipLabel(clip)}</div>
          <div className="text-[11px] text-ink-dim font-mono mt-0.5 tabular-nums">
            {fmtTime(clip.startOnTimeline)} â†’ {fmtTime(end)} Â· {clip.duration.toFixed(2)}s duration
          </div>
        </div>
      </div>

      {/* TEXT CLIP: Direct Caption Content & Word Editing */}
      {isText && textClip && (
        <div className="space-y-3.5 pt-1">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <Icon name="edit_note" size={14} className="text-primary" />
                Caption Text
              </label>
              <span className="text-[10px] text-ink-dim font-mono">
                {textDraft.trim().split(/\s+/).filter(Boolean).length} words Â· {textDraft.length} chars
              </span>
            </div>
            <textarea
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onBlur={(e) => {
                if (e.target.value !== textClip.content) {
                  commitTextChange(e.target.value);
                }
              }}
              rows={2}
              placeholder="Type caption text..."
              className="w-full rounded-btn border border-line bg-surface-2 px-3 py-2 text-xs font-medium text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-y min-h-[54px]"
            />
            {textDraft !== textClip.content && (
              <div className="flex justify-end mt-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  icon="check"
                  onClick={() => commitTextChange(textDraft)}
                >
                  Apply Text
                </Button>
              </div>
            )}
          </div>

          {/* Interactive Word Timings */}
          {textClip.style.words && textClip.style.words.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                  <Icon name="timer" size={14} className="text-emerald-400" />
                  Word Cadence ({textClip.style.words.length})
                </label>
                <span className="text-[10px] text-ink-dim">Click word to edit</span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-btn bg-surface-2/60 border border-line max-h-36 overflow-y-auto">
                {textClip.style.words.map((w, idx) => (
                  <div key={idx} className="relative group">
                    {editingWordIdx === idx ? (
                      <span className="inline-flex items-center gap-1 bg-surface border border-primary px-1.5 py-0.5 rounded-md shadow-xs">
                        <input
                          type="text"
                          value={editingWordVal}
                          onChange={(e) => setEditingWordVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleWordSave(idx);
                            if (e.key === 'Escape') setEditingWordIdx(null);
                          }}
                          autoFocus
                          className="w-20 bg-transparent text-xs font-semibold text-ink outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleWordSave(idx)}
                          className="text-primary hover:text-ink text-[11px]"
                          title="Save word"
                        >
                          <Icon name="check" size={13} />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingWordIdx(idx);
                          setEditingWordVal(w.word);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface border border-line text-xs font-medium text-ink hover:border-primary hover:text-primary transition-all group"
                        title={`Starts at ${w.start.toFixed(2)}s, ends at ${w.end.toFixed(2)}s`}
                      >
                        <span>{w.word}</span>
                        <span className="text-[9px] text-ink-dim font-mono opacity-60 group-hover:opacity-100">
                          {w.start.toFixed(1)}s
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Caption Style for this Clip */}
          <div className="space-y-2.5 pt-1 border-t border-line">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                Font Family
              </span>
              <select
                value={textClip.style.fontFamily}
                onChange={(e) =>
                  onUpdateTextClip(clip.id, textClip.content, { fontFamily: e.target.value })
                }
                className="rounded-btn border border-line bg-surface-2 px-2 py-1 text-xs font-medium text-ink outline-none focus:border-primary"
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                Font Size
              </span>
              <div className="flex items-center gap-1">
                {[26, 34, 42, 54].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() =>
                      onUpdateTextClip(clip.id, textClip.content, { fontSize: sz })
                    }
                    className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                      Math.abs(textClip.style.fontSize - sz) < 5
                        ? 'border-primary bg-primary text-on-primary font-semibold'
                        : 'border-line text-ink-muted hover:text-ink'
                    }`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>
            </div>

            {/* Animation Style */}
            <div>
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Animation Style
              </span>
              <div className="grid grid-cols-3 gap-1">
                {ANIMATION_PRESETS.map((anim) => (
                  <button
                    key={anim.id}
                    type="button"
                    onClick={() =>
                      onUpdateTextClip(clip.id, textClip.content, { animation: anim.id })
                    }
                    className={`py-1 px-1.5 rounded-btn border text-[10.5px] font-medium flex items-center justify-center gap-1 transition-all ${
                      textClip.style.animation === anim.id
                        ? 'border-primary bg-primary-soft text-primary font-semibold'
                        : 'border-line text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Icon name={anim.icon} size={13} />
                    <span className="truncate">{anim.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Highlight Color */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                Active Word Color
              </span>
              <div className="flex items-center gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() =>
                      onUpdateTextClip(clip.id, textClip.content, { activeWordColorHex: c.hex })
                    }
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                    className={`w-5 h-5 rounded-full border transition-all ${
                      textClip.style.activeWordColorHex === c.hex
                        ? 'border-ink scale-110 shadow-sm'
                        : 'border-white/30 hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO CLIP: Speed & Punch Controls */}
      {isVideo && videoClip && (
        <div className="space-y-3 pt-1 border-t border-line">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                Playback Speed
              </span>
              <span className="text-xs font-mono font-bold text-primary">
                {videoClip.speedMultiplier || 1.0}x
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[0.5, 0.75, 1.0, 1.25, 1.5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateVideoClip(clip.id, { speedMultiplier: s })}
                  className={`py-1 rounded-btn text-xs font-mono border transition-all ${
                    (videoClip.speedMultiplier || 1.0) === s
                      ? 'border-primary bg-primary text-on-primary font-semibold'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Punch-in Zoom & Keyframe Curves */}
          <div className="pt-2 border-t border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <Icon name="zoom_in" size={14} className="text-primary" />
                Punch Zoom & Camera Animation
              </span>
              <span className="text-[10px] font-mono text-primary font-bold">
                {(() => {
                  const kfs = videoClip.keyframes || [];
                  if (kfs.length === 0) return 'Standard 1.0x';
                  if (kfs.length > 1) return `Push ${kfs[0].scale}x â†’ ${kfs[kfs.length - 1].scale}x`;
                  return `${kfs[0].scale}x Zoom`;
                })()}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                {
                  id: 'none',
                  label: 'Static 1.0x',
                  desc: 'Off',
                  makeKfs: () => [],
                },
                {
                  id: 'punch',
                  label: 'Punch 1.2x',
                  desc: 'Sharp Hook',
                  makeKfs: () => [
                    { timeOffset: 0, scale: 1.2, position: { x: 0, y: 0 }, easing: 'easeOut' as const },
                  ],
                },
                {
                  id: 'push',
                  label: 'Slow Push',
                  desc: '1.0x â†’ 1.2x',
                  makeKfs: () => [
                    { timeOffset: 0, scale: 1.0, position: { x: 0, y: 0 }, easing: 'easeInOut' as const },
                    { timeOffset: clip.duration, scale: 1.22, position: { x: 0, y: 0 }, easing: 'easeInOut' as const },
                  ],
                },
                {
                  id: 'pop',
                  label: 'Dramatic 1.35x',
                  desc: 'High Focus',
                  makeKfs: () => [
                    { timeOffset: 0, scale: 1.35, position: { x: 0, y: 0 }, easing: 'easeOut' as const },
                  ],
                },
                {
                  id: 'pull',
                  label: 'Slow Pull',
                  desc: '1.25x â†’ 1.0x',
                  makeKfs: () => [
                    { timeOffset: 0, scale: 1.25, position: { x: 0, y: 0 }, easing: 'easeOut' as const },
                    { timeOffset: clip.duration, scale: 1.0, position: { x: 0, y: 0 }, easing: 'easeOut' as const },
                  ],
                },
                {
                  id: 'sway',
                  label: 'Dynamic Drift',
                  desc: 'Pan & Scale',
                  makeKfs: () => [
                    { timeOffset: 0, scale: 1.15, position: { x: -8, y: 0 }, easing: 'easeInOut' as const },
                    { timeOffset: clip.duration, scale: 1.18, position: { x: 8, y: 0 }, easing: 'easeInOut' as const },
                  ],
                },
              ].map((opt) => {
                const kfs = videoClip.keyframes || [];
                const isActive =
                  opt.id === 'none'
                    ? kfs.length === 0
                    : opt.id === 'punch'
                    ? kfs.length === 1 && kfs[0].scale === 1.2
                    : opt.id === 'push'
                    ? kfs.length === 2 && kfs[0].scale === 1.0
                    : opt.id === 'pop'
                    ? kfs.length === 1 && kfs[0].scale === 1.35
                    : opt.id === 'pull'
                    ? kfs.length === 2 && kfs[0].scale === 1.25
                    : kfs.length === 2 && kfs[0].position.x !== 0;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateVideoClip(clip.id, { keyframes: opt.makeKfs() })}
                    className={`p-1.5 rounded-btn border text-left transition-all ${
                      isActive
                        ? 'border-primary bg-primary-soft text-ink ring-1 ring-primary/40 font-semibold shadow-xs'
                        : 'border-line text-ink-muted hover:text-ink hover:bg-surface-2'
                    }`}
                  >
                    <div className="text-[11px] truncate">{opt.label}</div>
                    <div className="text-[9px] text-ink-dim truncate">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CUT TRANSITION: Flash, Dissolve, Wipe, Dip */}
          <div className="pt-2 border-t border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <Icon name="auto_awesome_motion" size={13} className="text-primary" /> Cut Transition (In)
              </span>
              {videoClip.transition && videoClip.transition.type !== 'none' && (
                <span className="text-[10.5px] font-semibold text-primary capitalize">
                  {videoClip.transition.type} ({videoClip.transition.durationSec || 0.3}s)
                </span>
              )}
            </div>

            <div className="grid grid-cols-5 gap-1">
              {[
                { id: 'none', label: 'Cut', icon: 'content_cut' },
                { id: 'flash', label: 'Flash', icon: 'bolt' },
                { id: 'fade', label: 'Dissolve', icon: 'blur_on' },
                { id: 'wipeleft', label: 'Wipe', icon: 'swipe_left' },
                { id: 'fadeblack', label: 'Black', icon: 'brightness_medium' },
              ].map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() =>
                    onUpdateVideoClip(clip.id, {
                      transition: {
                        type: tr.id as TransitionType,
                        durationSec: videoClip.transition?.durationSec || 0.3,
                      },
                    })
                  }
                  title={tr.label}
                  className={`py-1.5 px-1 rounded-btn text-[10px] font-medium border flex flex-col items-center justify-center gap-0.5 transition-all ${
                    (videoClip.transition?.type || 'none') === tr.id
                      ? 'border-primary bg-primary text-on-primary font-semibold shadow-xs'
                      : 'border-line text-ink-muted hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  <Icon name={tr.icon} size={14} />
                  <span className="truncate">{tr.label}</span>
                </button>
              ))}
            </div>

            {/* Transition Duration Pill Options */}
            {videoClip.transition && videoClip.transition.type !== 'none' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-ink-muted">Duration</span>
                <div className="flex items-center gap-1">
                  {[0.2, 0.3, 0.45, 0.6].map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() =>
                        onUpdateVideoClip(clip.id, {
                          transition: {
                            type: videoClip.transition!.type,
                            durationSec: dur,
                          },
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10.5px] font-mono border transition-all ${
                        (videoClip.transition?.durationSec || 0.3) === dur
                          ? 'border-primary bg-primary text-on-primary font-bold'
                          : 'border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      {dur}s
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SFX CLIP: Sound Asset Selection, Test Preview & Volume Controls */}
      {isSfx && sfxClip && (
        <div className="space-y-3 pt-1 border-t border-line">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                Sound Effect Sound
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon="volume_up"
                onClick={() =>
                  sfxEngine.play(
                    sfxClip.sfxAssetId || 'pop',
                    sfxClip.audioModifiers?.volume ?? 1.0,
                    sfxClip.sourceUrl
                  )
                }
                title="Preview sound effect"
              >
                Test Sound
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'vine_boom', label: 'Vine Boom' },
                { id: 'cash_register', label: 'Cash Ring' },
                { id: 'chime', label: 'Chime' },
                { id: 'pop', label: 'Pop' },
                { id: 'whoosh', label: 'Whoosh' },
                { id: 'glitch', label: 'Glitch' },
              ].map((sfx) => (
                <button
                  key={sfx.id}
                  type="button"
                  onClick={() => {
                    onUpdateSFXClip?.(clip.id, { sfxAssetId: sfx.id });
                    sfxEngine.play(sfx.id, sfxClip.audioModifiers?.volume ?? 1.0);
                  }}
                  className={`py-1.5 px-2 rounded-btn border text-[11px] font-medium transition-all ${
                    (sfxClip.sfxAssetId || 'pop') === sfx.id
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-semibold'
                      : 'border-line text-ink-muted hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  {sfx.label}
                </button>
              ))}
            </div>
          </div>

          {/* Volume Multiplier */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                Sound Volume
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {Math.round((sfxClip.audioModifiers?.volume ?? 1.0) * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[0.3, 0.6, 1.0, 1.2, 1.5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() =>
                    onUpdateSFXClip?.(clip.id, {
                      audioModifiers: {
                        ...(sfxClip.audioModifiers || { pitchShiftCents: 0, fadeInSec: 0, fadeOutSec: 0 }),
                        volume: v,
                      },
                    })
                  }
                  className={`py-1 rounded-btn text-xs font-mono border transition-all ${
                    Math.abs((sfxClip.audioModifiers?.volume ?? 1.0) - v) < 0.05
                      ? 'border-amber-500 bg-amber-500 text-black font-bold'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {Math.round(v * 100)}%
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Boundary & Trim/Cut Controls */}
      <div className="pt-2 border-t border-line space-y-2">
        <span className="text-[11px] font-semibold text-ink-dim uppercase tracking-wider block">
          Timeline Actions
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon="flip_to_front"
            onClick={() => onTrim('start')}
            disabled={time <= clip.startOnTimeline || time >= end}
          >
            Trim in
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="flip_to_back"
            onClick={() => onTrim('end')}
            disabled={time >= end || time <= clip.startOnTimeline}
          >
            Trim out
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="content_cut"
            onClick={onSplit}
            disabled={time <= clip.startOnTimeline || time >= end}
          >
            Split (S)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="delete"
            className="text-danger"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'Space', label: 'Play / Pause' },
    { key: 'S / B', label: 'Split clip at playhead' },
    { key: 'Delete / âŒ«', label: 'Ripple delete selected clip(s)' },
    { key: 'Shift + Click', label: 'Toggle / Multi-select clips' },
    { key: 'Marquee Drag', label: 'Box-select clips on timeline' },
    { key: 'Ctrl + A', label: 'Select all timeline clips' },
    { key: 'Escape', label: 'Deselect all clips' },
    { key: 'Ctrl + Z', label: 'Undo timeline mutation' },
    { key: 'Ctrl + Shift + Z', label: 'Redo timeline mutation' },
    { key: 'â† / â†’', label: 'Step 1 frame backward / forward' },
    { key: 'Shift + â† / â†’', label: 'Step 10 frames backward / forward' },
    { key: 'J / K / L', label: 'Shuttle backward / Pause / Fast-forward' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[var(--scrim)]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 animate-[slidein_.2s_ease]">
          <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
            <div className="flex items-center gap-2">
              <Icon name="keyboard" size={20} className="text-primary" />
              <h3 className="font-semibold text-base text-ink">Editor Pro Shortcuts</h3>
            </div>
            <button onClick={onClose} className="text-ink-muted hover:text-ink">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="space-y-2">
            {shortcuts.map((s) => (
              <div
                key={s.key}
                className="flex items-center justify-between p-2 rounded-btn bg-surface-2/60 text-xs"
              >
                <span className="text-ink-muted">{s.label}</span>
                <Key>{s.key}</Key>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-3 border-t border-line flex justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-2 py-0.5 rounded border border-line bg-surface font-mono text-[11px] font-semibold text-ink shadow-2xs">
      {children}
    </kbd>
  );
}

function clipLabel(clip: TimelineClip): string {
  if (clip.type === 'text') return (clip as { content: string }).content || 'Caption';
  if (clip.type === 'video') return (clip as { name: string }).name || 'Video Clip';
  return clip.name || 'Clip';
}

function GeminiKeyModal({
  onClose,
  onSave,
  onAutoGenerate,
}: {
  onClose: () => void;
  onSave: (key: string) => Promise<void>;
  onAutoGenerate?: () => Promise<void> | void;
}) {
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = keyInput.trim();
    if (!clean) {
      setError('Please enter a valid Google Gemini API key or click "Auto-Generate (Free)"');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(clean);
    } catch (err: any) {
      setError(err?.message || 'Failed to save API key');
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <Card className="pointer-events-auto w-full max-w-md p-6 bg-surface border border-line shadow-2xl space-y-4 animate-scale-in">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <Icon name="auto_awesome" size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">AI Live Captions & Speech Sync</h3>
                <p className="text-[11.5px] text-ink-muted">Automatic Free Mode & Google Gemini Multimodal</p>
              </div>
            </div>
            <IconButton name="close" label="Close" onClick={onClose} />
          </div>

          {/* Instant Free Automatic Mode */}
          <div className="rounded-btn bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="text-[12.5px] font-bold text-ink flex items-center gap-1.5 text-emerald-600">
                <Icon name="bolt" size={15} />
                Instant Free Mode (No Key Needed)
              </p>
              <p className="text-[11.5px] text-ink-muted mt-0.5 leading-snug">
                Generate synchronized kinetic captions for this video instantly with zero setup or API key.
              </p>
            </div>
            <Button
              size="sm"
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              onClick={async () => {
                onAutoGenerate?.();
              }}
            >
              Auto-Sync
            </Button>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-line"></div>
            <span className="flex-shrink mx-2 text-[10.5px] uppercase tracking-wider text-ink-dim font-bold">Or Connect Custom Gemini Key</span>
            <div className="flex-grow border-t border-line"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim block mb-1.5">
                Google Gemini API Key (Optional)
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setError(null);
                }}
                placeholder="AIzaSy... (leave blank to use Free Auto-Sync)"
                className="w-full rounded-btn border border-line bg-surface-2 px-3 py-2 text-[13px] font-mono text-ink outline-none focus:border-primary"
              />
              {error && <p className="text-danger text-[12px] mt-1.5 font-medium">{error}</p>}
            </div>

            <div className="text-[12px] text-ink-dim flex items-center justify-between pt-1">
              <span>Free key from Google AI Studio</span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-semibold flex items-center gap-1"
              >
                Get Free Gemini Key <Icon name="open_in_new" size={12} />
              </a>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <Button variant="ghost" onClick={onClose} type="button">
                Cancel
              </Button>
              <Button icon={saving ? 'hourglass_top' : 'bolt'} disabled={saving} type="submit">
                {saving ? 'Connecting...' : 'Save Key'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
