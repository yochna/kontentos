import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, PageHeader, PageShell, StatusPill, Badge } from '@/components/ui';
import { ReelPreview } from '@/components/ReelPreview';
import { PRESETS, fmtTime, totalDuration, type EditPreset } from '@/lib/timeline';
import type { AutoEditOutcome } from '@/lib/store';
import { useStore } from '@/lib/store';
import { useNavPayload } from '@/lib/nav';

const STEPS = [
  { icon: 'graphic_eq', label: 'Analyzing audio waveform & speech cadences' },
  { icon: 'content_cut', label: 'Detecting & purging dead-air silences' },
  { icon: 'subtitles', label: 'Compiling kinetic word-pop captions' },
  { icon: 'auto_fix_high', label: 'Keyframing punch zooms & audio dynamics' },
];

const PRESET_SPECS: Record<string, { silence: string; zoom: string; caption: string; sfx: string }> = {
  fast: {
    silence: '300ms aggressive trim',
    zoom: '1.25x Punch zooms every 2.5s',
    caption: 'Kinetic word-pop highlight',
    sfx: 'Impact whooshes enabled',
  },
  story: {
    silence: '600ms natural breathing',
    zoom: 'Smooth steady framing',
    caption: 'Subtle lower-third subtitles',
    sfx: 'Clean natural ambient audio',
  },
  clean: {
    silence: '450ms crisp editorial pacing',
    zoom: 'Subtle emphasis framing',
    caption: 'High-contrast brand captions',
    sfx: 'Subtle acoustic chimes',
  },
  punchy: {
    silence: '250ms ultra-rapid cuts',
    zoom: 'Dynamic snap zooms',
    caption: 'Bold center hook typography',
    sfx: 'Minimal punch accents',
  },
};

export default function RawReel() {
  const {
    videos,
    runAutoEdit,
    activeDraft,
    handoffReelToEditor,
    handoffEditorToPublish,
    uploadVideo,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPct, setUploadingPct] = useState<number | null>(null);

  const ready = useMemo(
    () => videos.filter((v) => v.status === 'ready' || v.status === 'processing'),
    [videos],
  );

  const [videoId, setVideoId] = useState<string>(() => {
    if (activeDraft?.sourceVideo?.id && videos.some((v) => v.id === activeDraft.sourceVideo?.id)) {
      return activeDraft.sourceVideo.id;
    }
    return ready[0]?.id ?? '';
  });

  const [presetId, setPresetId] = useState<string>(PRESETS[0].id);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<AutoEditOutcome | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const timers = useRef<number[]>([]);

  // Keep video selection in sync if active draft updates or initial video loads
  useEffect(() => {
    if (!videoId && ready.length > 0) {
      setVideoId(ready[0].id);
    }
  }, [ready, videoId]);

  // Deep link from Command Center / Content Library: select the clip the creator clicked.
  // The library loads asynchronously, so wait until that id actually exists.
  const navPayload = useNavPayload<{ videoId?: string }>('raw-reel');
  useEffect(() => {
    const target = navPayload?.videoId;
    if (target && videos.some((v) => v.id === target)) setVideoId(target);
  }, [navPayload, videos]);

  const video = videos.find((v) => v.id === videoId);
  const preset = (PRESETS.find((p) => p.id === presetId) || PRESETS[0]) as EditPreset;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPct(10);
    try {
      const uploaded = await uploadVideo(file, (pct) => {
        setUploadingPct(pct);
      });
      if (uploaded) {
        setVideoId(uploaded.id);
        setResult(null);
      }
    } catch (err) {
      console.error('File upload failed in RawReel:', err);
    } finally {
      setUploadingPct(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  async function create() {
    if (!video || busy) return;
    setBusy(true);
    setResult(null);
    setPlaying(false);
    setPlayheadSec(0);
    setStep(0);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    // Visual step progression
    STEPS.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setStep(i), i * 380));
    });

    try {
      const [outcome] = await Promise.all([
        runAutoEdit(video, preset),
        new Promise((r) => setTimeout(r, STEPS.length * 380 + 200)),
      ]);
      setResult(outcome);
    } catch (err) {
      console.error('Auto-edit pipeline error:', err);
    } finally {
      setBusy(false);
    }
  }

  function handleToEditor() {
    if (result?.project) {
      handoffReelToEditor(result.project, video);
    }
  }

  function handleToPublish() {
    if (result?.project) {
      handoffEditorToPublish(result.project, {
        caption: result.caption,
        hashtags: result.hashtags,
      });
    }
  }

  return (
    <PageShell>
      {/* Hidden File Upload Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
        className="hidden"
      />

      <PageHeader
        eyebrow="Raw → Reel Studio"
        icon="smart_display"
        title="One click. Pick a look. Ship the reel."
        description="Automated dead-air trimming, kinetic subtitle typography, and punch zooms from your raw smartphone takes."
        actions={
          result && (result.offline || result.source === 'gemini') ? (
            <>
              {result.offline && <StatusPill tone="neutral">Offline engine active</StatusPill>}
              {result.source === 'gemini' && (
                <StatusPill tone="tertiary">Gemini AI Enhanced</StatusPill>
              )}
            </>
          ) : undefined
        }
        className="mb-6"
      />

      {/* Active Blueprint & Script Guidance Banner (if initiated from an idea) */}
      {activeDraft?.idea && (
        <Card className="p-4 sm:p-5 mb-6 bg-primary-soft/60 border-primary/20 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-btn bg-primary text-on-primary grid place-items-center shrink-0 mt-0.5">
                <Icon name="lightbulb" size={18} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="kt-eyebrow text-primary">Active Blueprint</span>
                  <Badge tone="tertiary">{activeDraft.idea.format}</Badge>
                </div>
                <h3 className="font-semibold text-base text-ink mt-0.5">{activeDraft.idea.title}</h3>
                <p className="text-xs text-ink-muted italic mt-1 font-serif">
                  Hook: {activeDraft.idea.hook}
                </p>
              </div>
            </div>

            {activeDraft.idea.beats && activeDraft.idea.beats.length > 0 && (
              <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center bg-surface p-2.5 rounded-btn border border-line shrink-0">
                <span className="text-[11px] font-semibold text-ink-dim uppercase">Beats:</span>
                {activeDraft.idea.beats.map((b, i) => (
                  <span
                    key={i}
                    className="text-[11px] font-medium text-ink bg-surface-2 px-2 py-0.5 rounded border border-line"
                  >
                    {i + 1}. {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Main Studio Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        {/* Left Column: Composer Pipeline */}
        <div className="space-y-5 min-w-0">
          {/* Step 1: Raw Footage Tray */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <StepLabel n={1} title="Pick your raw footage" />
              <Button
                size="sm"
                variant="secondary"
                icon="upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPct !== null}
              >
                {uploadingPct !== null ? `Uploading ${uploadingPct}%...` : '+ Ingest clip'}
              </Button>
            </div>

            {ready.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-line hover:border-primary rounded-card p-8 text-center cursor-pointer transition-colors bg-surface-2/40"
              >
                <Icon name="cloud_upload" size={32} className="text-primary mx-auto mb-2" />
                <h4 className="font-semibold text-ink text-sm">No raw clips found</h4>
                <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
                  Click here or press "Ingest clip" to upload an MP4 or MOV recorded from your phone or camera.
                </p>
              </div>
            ) : (
              <div className="kt-stagger--fade flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 pt-1">
                {ready.map((v) => {
                  const isSelected = videoId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        setVideoId(v.id);
                        setResult(null);
                        setPlayheadSec(0);
                      }}
                      className={`shrink-0 w-[160px] text-left rounded-card border overflow-hidden transition-all kt-focus group relative ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/40 shadow-sm bg-primary-soft/30'
                          : 'border-line hover:border-line-strong bg-surface'
                      }`}
                    >
                      <div className="relative aspect-[9/16] bg-black/90 overflow-hidden">
                        {v.thumbnail_url ? (
                          <img
                            src={v.thumbnail_url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                          />
                        ) : (
                          <video
                            src={v.file_url}
                            crossOrigin="anonymous"
                            muted
                            playsInline
                            preload="metadata"
                            className="absolute inset-0 w-full h-full object-cover block"
                          />
                        )}
                        <span className="absolute bottom-1.5 right-1.5 text-[10.5px] font-semibold text-white bg-black/70 backdrop-blur rounded px-1.5 py-0.5 tabular-nums">
                          {fmtTime(v.duration || 0)}
                        </span>
                        {isSelected && (
                          <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary text-on-primary grid place-items-center shadow-sm">
                            <Icon name="check" size={13} />
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="text-[12px] font-semibold text-ink leading-snug line-clamp-2">
                          {v.title}
                        </div>
                        <div className="text-[11px] text-ink-dim mt-1 flex items-center justify-between">
                          <span>Raw 1-take</span>
                          <span>9:16</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Quick Add Card at the end of the scroll list */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-[140px] aspect-[9/16] rounded-card border-2 border-dashed border-line hover:border-primary flex flex-col items-center justify-center p-3 text-center transition-colors bg-surface-2/30 text-ink-muted hover:text-primary"
                >
                  <Icon name="add_circle" size={24} className="mb-1" />
                  <span className="text-xs font-semibold">Add clip</span>
                  <span className="text-[10px] text-ink-dim mt-0.5">MP4 / MOV</span>
                </button>
              </div>
            )}
          </Card>

          {/* Step 2: Choose Look / Style Preset */}
          <Card className="p-5">
            <StepLabel n={2} title="Choose your editorial style preset" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESETS.map((p) => {
                const active = presetId === p.id;
                const specs = PRESET_SPECS[p.id] || PRESET_SPECS.fast;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPresetId(p.id);
                      setResult(null);
                    }}
                    className={`text-left rounded-card border p-4 flex flex-col justify-between transition-all kt-focus ${
                      active
                        ? 'border-primary bg-primary-soft shadow-sm ring-2 ring-primary/25'
                        : 'border-line hover:border-line-strong bg-surface'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span
                        className={`grid place-items-center w-10 h-10 rounded-btn shrink-0 ${
                          active ? 'bg-primary text-on-primary' : 'bg-surface-2 text-primary'
                        }`}
                      >
                        <Icon name={p.icon} size={20} />
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px] font-semibold text-ink">{p.name}</span>
                          {active && (
                            <span className="w-4 h-4 rounded-full bg-primary text-on-primary grid place-items-center text-[10px]">
                              ✓
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] text-ink-muted leading-snug mt-0.5 block">
                          {p.tagline}
                        </span>
                      </div>
                    </div>

                    {/* Preset Parameter Badges */}
                    <div className="pt-2 border-t border-line/60 space-y-1 text-[11px] text-ink-dim">
                      <div className="flex items-center gap-1.5">
                        <Icon name="timer" size={13} className="text-primary/70 shrink-0" />
                        <span className="truncate">{specs.silence}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Icon name="zoom_in" size={13} className="text-primary/70 shrink-0" />
                        <span className="truncate">{specs.zoom}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Icon name="subtitles" size={13} className="text-primary/70 shrink-0" />
                        <span className="truncate">{specs.caption}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 3: Run Auto-Assembly */}
          <Card className="p-5">
            <StepLabel n={3} title="Execute Smart Assembly" />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={busy ? 'autorenew' : 'bolt'}
                onClick={create}
                disabled={busy || !video}
                className="px-6 py-2.5 text-sm"
              >
                {busy ? 'Assembling Reel...' : result ? 'Re-run assembly' : 'Create finished Reel'}
              </Button>

              {result && !busy && (
                <span className="text-[13px] text-ink-muted flex items-center gap-2 bg-surface-2/60 px-3 py-1.5 rounded-btn border border-line">
                  <Icon name="check_circle" size={17} className="text-tertiary shrink-0" />
                  <span>
                    <strong>{result.stats?.cutsCount || 0} cuts</strong> ·{' '}
                    <strong>{result.stats?.captionsCount || 0} captions</strong> ·{' '}
                    <strong>{fmtTime(result.stats?.silenceRemovedSec || 0)} dead-air purged</strong>
                  </span>
                </span>
              )}
            </div>

            {/* Live Progress Stage Feedback */}
            {busy && (
              <div className="mt-5 p-4 rounded-card bg-surface-2 border border-line space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-ink">
                  <span>Processing Timeline Pipeline</span>
                  <span className="tabular-nums font-mono">{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
                </div>

                <div className="space-y-2.5">
                  {STEPS.map((s, i) => (
                    <div
                      key={s.label}
                      className={`flex items-center gap-3 text-[13px] transition-opacity ${
                        i <= step ? 'opacity-100' : 'opacity-40'
                      }`}
                    >
                      <Icon
                        name={i < step ? 'task_alt' : i === step ? 'pending' : 'radio_button_unchecked'}
                        size={17}
                        className={i <= step ? 'text-primary' : 'text-ink-dim'}
                      />
                      <span className={i === step ? 'text-ink font-semibold' : 'text-ink-muted'}>
                        {s.label}
                      </span>
                      {i === step && (
                        <span className="kt-spin ml-auto">
                          <Icon name="autorenew" size={15} className="text-primary" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="h-2 rounded-full bg-surface-3 overflow-hidden mt-2">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Live Synchronized Reel Preview & Publishing Metadata */}
        <div className="space-y-5">
          {/* Synchronized Player Card */}
          <Card className="p-5 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="smart_display" size={18} className="text-primary" />
                <h2 className="font-semibold text-ink text-sm">Synchronized Reel Preview</h2>
              </div>
              {result?.project && <StatusPill tone="tertiary">{preset.name}</StatusPill>}
            </div>

            {/* 9:16 Vertical Device Mockup */}
            <div className="w-[230px] sm:w-[250px] max-w-full">
              <div className="aspect-[9/16] rounded-[24px] border-[6px] border-ink/85 bg-black overflow-hidden relative shadow-lg">
                {result?.project ? (
                  <ReelPreview
                    project={result.project}
                    playing={playing}
                    onPlayingChange={setPlaying}
                    onTime={(t) => setPlayheadSec(t)}
                    className="absolute inset-0 w-full h-full"
                  />
                ) : video ? (
                  <div className="absolute inset-0 w-full h-full bg-black flex flex-col items-center justify-center text-center p-4">
                    <video
                      src={video.file_url}
                      crossOrigin="anonymous"
                      className="absolute inset-0 w-full h-full object-cover opacity-60 block"
                      muted
                      playsInline
                    />
                    <div className="relative z-10 bg-black/60 backdrop-blur p-3 rounded-card text-white">
                      <Icon name="play_arrow" size={24} className="mx-auto mb-1 text-primary" />
                      <p className="text-xs font-medium">Ready for auto-cut</p>
                      <p className="text-[10px] text-white/70 mt-0.5">Click "Create finished Reel"</p>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-center px-4 bg-surface-3">
                    <div>
                      <Icon name="movie_edit" size={28} className="text-ink-dim mx-auto mb-2" />
                      <p className="text-[12px] text-ink-muted">Select or upload a clip to begin.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Playback Controls & Timestamp Scrubber */}
            {result?.project && (
              <div className="w-full mt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-ink-dim font-mono">
                  <span>{fmtTime(playheadSec)}</span>
                  <span>{fmtTime(totalDuration(result.project))}</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={playing ? 'pause' : 'play_arrow'}
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? 'Pause' : 'Play'}
                  </Button>
                  <span className="text-[12px] text-ink font-medium bg-surface-2 px-2.5 py-1 rounded-full border border-line">
                    {fmtTime(totalDuration(result.project))} output
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Publishing Copy & Closed-Loop Handoff Actions */}
          {result && (
            <Card className="p-5 kt-dialog">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-ink text-sm">Generated Copy & Hashtags</h3>
                <span className="text-[11px] text-ink-dim font-medium">
                  {result.hashtags.length} hashtags
                </span>
              </div>
              <textarea
                defaultValue={result.caption}
                rows={4}
                className="w-full resize-none rounded-btn border border-line bg-surface-2 p-3 text-[13px] text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-sans leading-relaxed"
              />
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {result.hashtags.map((h) => (
                  <span
                    key={h}
                    className="text-[11.5px] font-medium text-primary bg-primary-soft border border-primary/20 rounded-full px-2.5 py-0.5"
                  >
                    #{h}
                  </span>
                ))}
              </div>

              {/* Handoff Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-line">
                <Button variant="secondary" icon="tune" onClick={handleToEditor}>
                  Fine-tune in Editor
                </Button>
                <Button icon="schedule_send" onClick={handleToPublish}>
                  Schedule post
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="grid place-items-center w-6 h-6 rounded-full bg-ink text-app text-[12px] font-bold tabular-nums shrink-0">
        {n}
      </span>
      <h2 className="font-semibold text-ink text-[15px]">{title}</h2>
    </div>
  );
}
