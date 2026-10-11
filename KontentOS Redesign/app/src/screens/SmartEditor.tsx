import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, IconButton, StatusPill } from '@/components/ui';
import { ReelPreview, type ReelHandle } from '@/components/ReelPreview';
import { ExportModal } from '@/components/ExportModal';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import {
  PRESETS,
  clipAt,
  cloneProject,
  deleteClip,
  fmtTime,
  getPreset,
  sfxClips,
  splitClipAt,
  synthesizeWords,
  textClips,
  tightenGaps,
  totalDuration,
  trimClipEdge,
  videoClips,
  type CaptionAnimation,
  type CaptionStyle,
  type TextClip,
  type TimelineClip,
  type TimelineProject,
  type VideoClip,
} from '@/lib/timeline';

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
    runAutoEdit,
    handoffEditorToPublish,
    generateLiveCaptions,
    toggleCaptions,
    isCaptionsActive,
  } = useStore();

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(48); // px per second
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [polishing, setPolishing] = useState(false);
  const [activeTab, setActiveTab] = useState<'polish' | 'captions' | 'inspector'>('polish');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

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

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      seek((clientX - rect.left) / zoom);
    },
    [zoom, seek],
  );

  // Pointer scrubbing across ruler + lanes.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current) seekFromClientX(e.clientX);
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [seekFromClientX]);

  // Keyboard shortcuts (editor pro controls).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || !project) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === 's' && !mod) {
        e.preventDefault();
        doSplit();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        doDelete();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seek(time - (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seek(time + (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        seek(time - 2);
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPlaying(false);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        seek(time + 2);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, time, duration, selectedId, zoom, fps]);

  const selectedClip = useMemo<TimelineClip | null>(() => {
    if (!project || !selectedId) return null;
    for (const tr of project.tracks) {
      const c = tr.clips.find((x) => x.id === selectedId);
      if (c) return c;
    }
    return null;
  }, [project, selectedId]);

  function targetClipId(): string | null {
    if (selectedClip) return selectedClip.id;
    const v = clipAt(project as TimelineProject, 'video', time);
    return v?.id ?? null;
  }

  function doSplit() {
    if (!project) return;
    const id = targetClipId();
    if (!id) return;
    const ok = applyEdit((p) => splitClipAt(p, id, time));
    if (ok) setSelectedId(id);
  }

  function doTrim(edge: 'start' | 'end') {
    if (!project || !selectedClip) return;
    applyEdit((p) => trimClipEdge(p, selectedClip.id, edge, time));
  }

  function doDelete() {
    if (!project) return;
    const id = selectedClip?.id ?? targetClipId();
    if (!id) return;
    applyEdit((p) => deleteClip(p, id, true));
    setSelectedId(null);
  }

  function doTighten() {
    if (!project) return;
    applyEdit((p) => tightenGaps(p));
  }

  function toggleMuteTrack(trackId: string) {
    applyEdit((p) => {
      const clone = cloneProject(p);
      const track = clone.tracks.find((t) => t.id === trackId);
      if (track) track.isMuted = !track.isMuted;
      return clone;
    });
  }

  function toggleLockTrack(trackId: string) {
    applyEdit((p) => {
      const clone = cloneProject(p);
      const track = clone.tracks.find((t) => t.id === trackId);
      if (track) track.isLocked = !track.isLocked;
      return clone;
    });
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
      const track = next.tracks.find((t) => t.type === 'video');
      if (!track) return null;
      const clip = track.clips.find((c) => c.id === clipId) as VideoClip | undefined;
      if (!clip) return null;
      Object.assign(clip, updates);
      return next;
    });
  }

  function updateGlobalCaptionStyle(patch: {
    fontFamily?: string;
    activeWordColorHex?: string;
    position?: 'top' | 'middle' | 'bottom';
    animation?: CaptionAnimation;
  }) {
    applyEdit((p) => {
      const clone = cloneProject(p);
      const textTrack = clone.tracks.find((t) => t.type === 'text');
      if (!textTrack) return clone;
      textTrack.clips = textTrack.clips.map((c) => {
        const tc = c as TextClip;
        return {
          ...tc,
          style: {
            ...tc.style,
            ...(patch.fontFamily ? { fontFamily: patch.fontFamily } : {}),
            ...(patch.activeWordColorHex ? { activeWordColorHex: patch.activeWordColorHex } : {}),
            ...(patch.position ? { position: patch.position } : {}),
            ...(patch.animation ? { animation: patch.animation } : {}),
          },
        };
      });
      return clone;
    });
  }

  const sourceUrl = project ? videoClips(project)[0]?.sourceUrl : undefined;
  const sourceVideo = useMemo(
    () => (sourceUrl ? videos.find((v) => v.file_url === sourceUrl) ?? null : null),
    [videos, sourceUrl],
  );

  async function rePolish() {
    if (!sourceVideo || polishing) return;
    setPolishing(true);
    setSelectedId(null);
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
        const key = typeof explicitKey === 'string' ? explicitKey : localStorage.getItem('kontentos_gemini_api_key') || undefined;
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

  function handleToPublish() {
    if (project) {
      handoffEditorToPublish(project);
    }
  }

  /* -------------------------------- Empty state ------------------------------- */

  if (!project) {
    const ready = videos.filter((v) => v.status === 'ready' || v.status === 'processing');
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1200px] mx-auto">
        <Header offline={false} hasProject={false} />
        <Card className="p-12 text-center">
          {polishing ? (
            <div className="py-8 space-y-3">
              <div className="kt-spin mx-auto w-10 h-10 rounded-full border-3 border-primary border-t-transparent" />
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
                Assemble a reel in Raw → Reel Studio and click <b className="text-ink">Fine-tune in Editor</b> to load it
                here — or start directly from an uploaded clip.
              </p>
              {ready.length > 0 ? (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[12px] text-ink-dim font-medium mr-1">Start from:</span>
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
              ) : (
                <Button
                  icon="add"
                  className="mt-5"
                  onClick={() => window.dispatchEvent(new CustomEvent('kt:navigate', { detail: 'content-library' }))}
                >
                  Go to Content Library
                </Button>
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
  const canCut =
    !!selectedClip || !!clipAt(project, 'video', time) || !!clipAt(project, 'text', time);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1500px] mx-auto">
      <Header
        offline={false}
        hasProject
        title={project.projectMetadata.title}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onExport={() => setShowExportModal(true)}
        onPublish={handleToPublish}
        onShowShortcuts={() => setShowShortcutsModal(true)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        {/* Left: preview + multi-track timeline */}
        <div className="space-y-4 min-w-0">
          {/* Player & Preview Area */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 px-4 h-11 border-b border-line bg-surface-2/50">
              <div className="flex items-center gap-1.5 text-[13px] text-ink font-semibold">
                <Icon name="movie" size={16} className="text-primary" /> Live Frame Preview
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-2 font-mono text-[12px] text-ink-dim">
                <span className="text-primary font-bold">{fmtSmpte(time, fps)}</span>
                <span>/</span>
                <span>{fmtSmpte(duration, fps)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[230px_1fr] gap-5 p-5">
              <div className="mx-auto w-[230px] max-w-full">
                <div className="aspect-[9/16] rounded-[22px] border-[5px] border-ink/85 bg-black overflow-hidden relative shadow-md">
                  <ReelPreview
                    ref={reelRef}
                    project={project}
                    playing={playing}
                    onPlayingChange={setPlaying}
                    onTime={setTime}
                    captionsVisible={isCaptionsActive}
                    onToggleCaptions={(active) => toggleCaptions(active)}
                    onToggleVideoMute={() => toggleMuteTrack('track-video')}
                    generatingCaptions={generatingCaptions}
                    onGenerateCaptions={handleGenerateCaptions}
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
                  Scrub the multi-track timeline below. Press <Key>S</Key> to split, <Key>⌫</Key> to ripple-delete, and{' '}
                  <Key>⌘/Ctrl</Key>+<Key>Z</Key> to undo.
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <StatusPill tone="primary">{vClips.length} video cuts</StatusPill>
                  <StatusPill tone="secondary">{tClips.length} subtitle cues</StatusPill>
                  {sClips.length > 0 && <StatusPill tone="tertiary">{sClips.length} SFX triggers</StatusPill>}
                  <StatusPill tone="neutral">
                    {project.projectMetadata.targetAspectRatio} · {fps}fps
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
              <ToolBtn icon="delete" label="Ripple Delete (⌫)" onClick={doDelete} disabled={!canCut} danger />
              <ToolBtn
                icon="align_horizontal_left"
                label="Tighten gaps"
                onClick={doTighten}
                disabled={vClips.length < 2}
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
                {selectedClip ? `Selected: ${clipLabel(selectedClip)}` : 'Click clip to select · Drag ruler to scrub'}
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
                    dragging.current = true;
                    seekFromClientX(e.clientX);
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
                          selected={selectedId === c.id}
                          color={
                            tr.type === 'video'
                              ? 'var(--primary, #3E4A3D)'
                              : tr.type === 'text'
                              ? 'var(--tertiary, #285C4D)'
                              : 'var(--secondary, #825E3E)'
                          }
                          label={clipLabel(c)}
                          compact={tr.type !== 'video'}
                          onSelect={() => {
                            setSelectedId(c.id);
                            setActiveTab('inspector');
                          }}
                        />
                      ))}
                    </ClipLane>
                  ))}

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
              { id: 'polish', label: 'AI Polish', icon: 'auto_awesome' },
              { id: 'captions', label: 'Captions', icon: 'subtitles' },
              { id: 'inspector', label: 'Inspector', icon: 'tune' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-1.5 px-2 rounded-btn text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === tab.id
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon name={tab.icon} size={15} />
                {tab.label}
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
                    <option value="Spanish">Spanish (Español)</option>
                    <option value="French">French (Français)</option>
                    <option value="German">German (Deutsch)</option>
                    <option value="Hindi">Hindi (हिन्दी)</option>
                    <option value="Japanese">Japanese (日本語)</option>
                    <option value="Portuguese">Portuguese (Português)</option>
                    <option value="Chinese">Chinese (中文)</option>
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

          {/* Tab 3: Inspector */}
          {activeTab === 'inspector' && (
            <Card className="p-4 space-y-3">
              <h2 className="font-semibold text-ink text-sm">Clip Inspector</h2>
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
              <Button icon="schedule_send" onClick={handleToPublish}>
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
                ← Raw Studio
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Video Export Modal */}
      {showExportModal && (
        <ExportModal
          project={project}
          onClose={() => setShowExportModal(false)}
          onSendToPublish={() => {
            setShowExportModal(false);
            handleToPublish();
          }}
        />
      )}

      {/* Keyboard Shortcuts Dialog */}
      {showShortcutsModal && (
        <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {/* Gemini API Key Dialog for 1-Click AI CC */}
      {showApiKeyModal && (
        <GeminiKeyModal
          onClose={() => setShowApiKeyModal(false)}
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
  onUndo?: () => void;
  onRedo?: () => void;
  onExport?: () => void;
  onPublish?: () => void;
  onShowShortcuts?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <Eyebrow icon="content_cut">Smart Editor · 60fps Multi-Track</Eyebrow>
        <h1 className="font-display text-[28px] sm:text-[32px] leading-tight text-ink mt-0.5 truncate">
          {hasProject && title ? title : 'Editorial precision on the timeline'}
        </h1>
      </div>
      {hasProject && (
        <div className="flex items-center gap-2">
          <IconButton name="keyboard" label="Keyboard shortcuts" onClick={onShowShortcuts} />
          <IconButton name="undo" label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
          <IconButton name="redo" label="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} />
          <Button variant="secondary" icon="download" onClick={onExport}>
            Export Video
          </Button>
          <Button icon="schedule_send" onClick={onPublish}>
            Publish
          </Button>
        </div>
      )}
    </div>
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

function ClipBlock({
  clip,
  zoom,
  selected,
  color,
  label,
  compact,
  onSelect,
}: {
  clip: TimelineClip;
  zoom: number;
  selected: boolean;
  color: string;
  label: string;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`absolute top-1.5 bottom-1.5 rounded-md overflow-hidden text-left transition-all ${
        selected ? 'ring-2 ring-offset-1 ring-offset-app ring-primary shadow-sm' : 'hover:brightness-110'
      }`}
      style={{
        left: clip.startOnTimeline * zoom,
        width: Math.max(8, clip.duration * zoom),
        backgroundColor: color,
        opacity: compact && !selected ? 0.88 : 1,
      }}
    >
      <span className="absolute inset-0 flex items-center px-2 text-[10.5px] font-semibold text-white truncate drop-shadow-sm">
        {label}
      </span>
    </button>
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
}: {
  clip: TimelineClip;
  time: number;
  onTrim: (edge: 'start' | 'end') => void;
  onDelete: () => void;
  onSplit: () => void;
  onUpdateTextClip: (clipId: string, newContent: string, newStyle?: Partial<CaptionStyle>) => void;
  onUpdateWord: (clipId: string, wordIdx: number, newWord: string) => void;
  onUpdateVideoClip: (clipId: string, updates: Partial<VideoClip>) => void;
}) {
  const isText = clip.type === 'text';
  const isVideo = clip.type === 'video';
  const textClip = isText ? (clip as TextClip) : null;
  const videoClip = isVideo ? (clip as VideoClip) : null;

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
            {fmtTime(clip.startOnTimeline)} → {fmtTime(end)} · {clip.duration.toFixed(2)}s duration
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
                {textDraft.trim().split(/\s+/).filter(Boolean).length} words · {textDraft.length} chars
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
                        ? 'border-primary bg-primary text-white font-semibold'
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
                      ? 'border-primary bg-primary text-white font-semibold'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Punch-In Zoom Toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
              Dynamic Punch-in Zoom
            </span>
            <button
              type="button"
              onClick={() => {
                const hasPunch = (videoClip.keyframes || []).some((k) => k.scale > 1.05);
                const newKeyframes = hasPunch
                  ? []
                  : [{ timeOffset: 0, scale: 1.18, position: { x: 0, y: 0 }, easing: 'easeOut' as const }];
                onUpdateVideoClip(clip.id, { keyframes: newKeyframes });
              }}
              className={`px-3 py-1 rounded-btn text-xs font-semibold border transition-all ${
                (videoClip.keyframes || []).some((k) => k.scale > 1.05)
                  ? 'border-primary bg-primary text-white shadow-xs'
                  : 'border-line text-ink-muted hover:text-ink'
              }`}
            >
              {(videoClip.keyframes || []).some((k) => k.scale > 1.05) ? '1.18x Zoom' : 'Standard 1.0x'}
            </button>
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
    { key: 'S', label: 'Split clip at playhead' },
    { key: 'Delete / ⌫', label: 'Ripple delete selected clip' },
    { key: 'Ctrl + Z', label: 'Undo timeline mutation' },
    { key: 'Ctrl + Shift + Z', label: 'Redo timeline mutation' },
    { key: '← / →', label: 'Step 1 frame backward / forward' },
    { key: 'Shift + ← / →', label: 'Step 1 second backward / forward' },
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
}: {
  onClose: () => void;
  onSave: (key: string) => Promise<void>;
}) {
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = keyInput.trim();
    if (!clean) {
      setError('Please enter a valid Google Gemini API key');
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
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <Card className="pointer-events-auto w-full max-w-md p-6 bg-surface border border-line shadow-2xl space-y-4 animate-scale-in">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Icon name="auto_awesome" size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">Connect LLM for 1-Click Captions</h3>
                <p className="text-[11.5px] text-ink-muted">Google Gemini Multimodal Speech-to-Text</p>
              </div>
            </div>
            <IconButton name="close" label="Close" onClick={onClose} />
          </div>

          <p className="text-[12.5px] text-ink-muted leading-relaxed">
            KontentOS listens directly to the audio track in your video using Gemini Multimodal AI, transcribing verbatim speech dialogue with millisecond timestamps into your timeline.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim block mb-1.5">
                Google Gemini API Key
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setError(null);
                }}
                placeholder="AIzaSy..."
                autoFocus
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
                Get Gemini Key <Icon name="open_in_new" size={12} />
              </a>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
              <Button variant="ghost" onClick={onClose} type="button">
                Cancel
              </Button>
              <Button icon={saving ? 'hourglass_top' : 'bolt'} disabled={saving} type="submit">
                {saving ? 'Connecting...' : 'Connect & Generate Captions'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
