import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, PageHeader, PageShell, StatusPill, Badge } from '@/components/ui';
import { ReelPreview } from '@/components/ReelPreview';
import {
  PRESETS,
  buildManualProject,
  fmtTime,
  totalDuration,
  type EditPreset,
  type TimelineProject,
} from '@/lib/timeline';
import { buildReelVariants, type ReelVariant } from '@/lib/reelVariants';
import type { AutoEditOutcome, AutoEditProgress } from '@/lib/store';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import {
  exportTimeline,
  SourceUnavailableError,
  type TimelineExportProgress,
} from '@/lib/browserExport';
import { aspectGeometry, type ExportAspect } from '@/lib/mediaPlan';
import { mergeStageProgress } from '@/lib/progress';
import { navigate, useNavPayload } from '@/lib/nav';
import { fmtBytes, selectCut, useSelectedCutId } from '@/lib/bench';
import type { Video } from '@/lib/types';
import { OfflinePlate, useMediaSource } from '@/components/OfflinePlate';
import { notify } from '@/components/ui/toast';
import { MAX_PARALLEL_UPLOADS, VIDEO_ACCEPT } from '@/lib/uploadFile';
import { planUploadBatch } from '@/lib/uploadBatch';

const STEPS: Array<{ icon: string; label: string; stage: AutoEditProgress['stage'] }> = [
  { icon: 'graphic_eq', label: 'Reading the take and its transcript', stage: 'reading' },
  { icon: 'content_cut', label: 'Finding speech blocks and dead air', stage: 'cuts' },
  { icon: 'subtitles', label: 'Building readable caption phrases', stage: 'captions' },
  { icon: 'auto_fix_high', label: 'Applying restrained framing and polish', stage: 'polish' },
];

// Keep these in step with PRESETS in src/lib/timeline.ts. The card must describe the engine that
// actually runs, including when a preset id changes — a stale key silently showed "fast" specs.
const PRESET_SPECS: Record<string, { silence: string; zoom: string; caption: string; sfx: string }> = {
  punchy: {
    silence: '350ms crisp silence trims',
    zoom: '1.16x restrained reframes',
    caption: 'Sentence-case editorial captions',
    sfx: 'Sparse beat accents',
  },
  clean: {
    silence: '600ms natural breathing',
    zoom: 'Quiet emphasis framing',
    caption: 'High-contrast lower thirds',
    sfx: 'Clean ambient audio only',
  },
  cinematic: {
    silence: '800ms longer holds',
    zoom: 'Slow steady push-ins',
    caption: 'Warm, quiet captions',
    sfx: 'No artificial effects',
  },
  jumpcut: {
    silence: '250ms tight rhythm',
    zoom: 'Subtle snap reframes',
    caption: 'Muted word highlight',
    sfx: 'Light beat accents',
  },
  minimal: {
    silence: '700ms light trim',
    zoom: 'No zooms or effects',
    caption: 'High-contrast muted-viewing banner',
    sfx: 'Silent-friendly',
  },
};

const RENDER_PROGRESS_ORDER: TimelineExportProgress['stage'][] = [
  'reading',
  'preparing',
  'encoding',
  'finalizing',
  'done',
];
const RENDER_STEP_LABELS: Record<TimelineExportProgress['stage'], string> = {
  reading: 'Read',
  preparing: 'Prepare',
  encoding: 'Render',
  finalizing: 'Package',
  done: 'Done',
};
type AiStatus = Awaited<ReturnType<typeof api.getAiStatus>>;

function safeExportName(title: string) {
  const cleaned = title.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'kontentos_finished_reel';
}

function downloadBlob(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function patchSourceUrls(project: TimelineProject, oldUrl: string, newUrl: string): TimelineProject {
  if (!oldUrl || !newUrl || oldUrl === newUrl) return project;
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        'sourceUrl' in clip && clip.sourceUrl === oldUrl ? { ...clip, sourceUrl: newUrl } : clip
      ),
    })),
  };
}

/** Blueprint formats arrive as "Reel / Short · 45 sec"; show the two facts apart, not in one badge. */
function splitFormat(format: string) {
  const [shape, length] = format.split('·').map((part) => part.trim());
  return { shape: shape || format, length: length || null };
}

export default function RawReel() {
  const {
    videos,
    runAutoEdit,
    activeDraft,
    handoffReelToEditor,
    handoffEditorToPublish,
    uploadVideo,
    relinkMedia,
    transcripts,
    saveScript,
    updateActiveDraft,
    setProject,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPct, setUploadingPct] = useState<number | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [savingScript, setSavingScript] = useState(false);
  const [scriptMsg, setScriptMsg] = useState('');

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
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [editProgress, setEditProgress] = useState<AutoEditProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoEditOutcome | null>(null);
  const [variants, setVariants] = useState<ReelVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [showRawTake, setShowRawTake] = useState(false);
  const [editedCaption, setEditedCaption] = useState('');
  const [playing, setPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [rendering, setRendering] = useState(false);
  const [exportProgress, setExportProgress] = useState<TimelineExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDiagnostics, setExportDiagnostics] = useState<string[]>([]);
  const [exportedFile, setExportedFile] = useState<{
    url: string;
    name: string;
    bytes: number;
  } | null>(null);
  const [sourceRepair, setSourceRepair] = useState<{ missingUrl: string } | null>(null);
  const [repairing, setRepairing] = useState(false);

  const exportAbortRef = useRef<AbortController | null>(null);
  const exportProgressRef = useRef<TimelineExportProgress>({
    stage: 'reading',
    fraction: 0,
    message: 'Preparing the final MP4…',
  });
  const exportedUrlRef = useRef<string | null>(null);
  const reattachInputRef = useRef<HTMLInputElement>(null);

  // Keep video selection in sync if active draft updates or initial video loads
  useEffect(() => {
    if (!videoId && ready.length > 0) {
      setVideoId(ready[0].id);
    }
  }, [ready, videoId]);

  // The one-click promise depends on speech-to-text. Surface a missing key before the click so the
  // creator is never surprised by a raw export with no real captions.
  useEffect(() => {
    let alive = true;
    api
      .getAiStatus()
      .then((status) => {
        if (alive) setAiStatus(status);
      })
      .catch(() => {
        if (alive) setAiStatus(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
      if (exportedUrlRef.current) URL.revokeObjectURL(exportedUrlRef.current);
    };
  }, []);

  // Deep link from Command Center / Content Library: select the clip the creator clicked.
  // The library loads asynchronously, so wait until that id actually exists.
  const navPayload = useNavPayload<{ videoId?: string }>('raw-reel');
  useEffect(() => {
    const target = navPayload?.videoId;
    if (target && videos.some((v) => v.id === target)) setVideoId(target);
  }, [navPayload, videos]);

  // The rail owns which cut is lit. Only react to the id actually changing — re-applying a
  // stored selection on every refresh would undo a pick the creator just made in here.
  const litCutId = useSelectedCutId();
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (!litCutId || litCutId === followed.current) return;
    followed.current = litCutId;
    if (videos.some((v) => v.id === litCutId)) {
      setVideoId(litCutId);
      setResult(null);
      resetVariants();
      setShowRawTake(false);
      setPlayheadSec(0);
    }
  }, [litCutId, videos]);

  const video = videos.find((v) => v.id === videoId);
  const media = useMediaSource(video?.file_url, video?.media_available);
  const preset = (PRESETS.find((p) => p.id === presetId) || PRESETS[0]) as EditPreset;
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || null;

  function resetVariants() {
    setVariants([]);
    setSelectedVariantId('');
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = '';
    if (!selected.length) return;

    const plan = planUploadBatch(
      selected,
      ready.map((v) => ({
        name: v.file_name || v.title,
        size: v.file_size || 0,
        lastModified: new Date(v.created_at).getTime(),
      })),
      MAX_PARALLEL_UPLOADS,
    );
    plan.invalid.forEach((problem) => notify.bad(problem));
    if (plan.duplicates) notify.info(`${plan.duplicates} repeat ${plan.duplicates === 1 ? 'take was' : 'takes were'} skipped.`);
    if (plan.deferred) notify.info(`Intaking the first ${MAX_PARALLEL_UPLOADS} of ${plan.files.length + plan.deferred} valid files.`);
    if (!plan.files.length) return;

    setUploadingPct(0);
    let uploadedCount = 0;
    let lastId: string | null = null;
    const failures: string[] = [];
    for (const file of plan.files) {
      try {
        const uploaded = await uploadVideo(file as File, (pct) => setUploadingPct(pct));
        if (!uploaded) throw new Error('The upload ended without a clip record.');
        uploadedCount++;
        lastId = uploaded.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The upload did not finish.';
        console.error(`File upload failed in RawReel for ${file.name}:`, err);
        failures.push(`${file.name}: ${message}`);
      }
    }
    setUploadingPct(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Earlier good takes stay on the bench even when a later one fails.
    if (lastId) {
      setVideoId(lastId);
      setResult(null);
      resetVariants();
      selectCut(lastId);
      notify.ok(`${uploadedCount} ${uploadedCount === 1 ? 'take' : 'takes'} on the bench.`);
    }
    if (failures.length) {
      notify.bad(`${failures.length} of ${plan.files.length} takes failed — ${failures[0]}`);
    }
  };

  // A script typed for one clip must not carry over when the creator lights a different cut.
  useEffect(() => {
    setScriptOpen(false);
    setScriptMsg('');
  }, [videoId]);

  async function saveScriptNow() {
    if (!video) return;
    setSavingScript(true);
    setScriptMsg('');
    const ok = await saveScript(video.id, scriptText);
    setSavingScript(false);
    if (ok) {
      setScriptMsg('Saved — the cues on this clip are your words now.');
      setScriptOpen(false);
    } else {
      setScriptMsg('Could not save. Nothing was written to the clip.');
    }
  }

  function clearExported() {
    if (exportedUrlRef.current) URL.revokeObjectURL(exportedUrlRef.current);
    exportedUrlRef.current = null;
    setExportedFile(null);
  }

  /**
   * The magic click does not stop at an EDL. The same project the preview shows goes straight into
   * the frame-accurate FFmpeg renderer, then the finished MP4 is handed to the browser download.
   * There is deliberately no recorder fallback here: a failed render says so, it never silently
   * becomes a different-looking video.
   */
  async function renderProject(project: TimelineProject, sourceVideo: Video) {
    clearExported();
    setExportError(null);
    setExportDiagnostics([]);
    setSourceRepair(null);
    exportProgressRef.current = {
      stage: 'reading',
      fraction: 0.01,
      message: 'Preparing the final MP4…',
    };
    setExportProgress(exportProgressRef.current);
    setRendering(true);

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const aspect = (project.projectMetadata.targetAspectRatio || '9:16') as ExportAspect;
      const { width, height } = aspectGeometry(aspect);
      const rendered = await exportTimeline(
        {
          project,
          defaultSourceUrl: sourceVideo.file_url,
          width,
          height,
          fps: 30,
          crf: 20,
        },
        (update) => {
          exportProgressRef.current = mergeStageProgress(
            exportProgressRef.current,
            update,
            RENDER_PROGRESS_ORDER
          );
          setExportProgress(exportProgressRef.current);
        },
        controller.signal
      );

      const fileName = `${safeExportName(project.projectMetadata.title || sourceVideo.title)}.mp4`;
      const url = URL.createObjectURL(rendered.blob);
      exportedUrlRef.current = url;
      const bytes = rendered.byteLength || rendered.blob.size;
      setExportedFile({ url, name: fileName, bytes });
      setExportProgress({
        stage: 'done',
        fraction: 1,
        message: 'Finished reel is ready.',
      });
      downloadBlob(url, fileName);
      notify.ok(`Finished reel downloaded — ${fmtBytes(bytes)} MP4.`);
      return true;
    } catch (err: any) {
      const message = err?.message || 'The final MP4 could not be rendered.';
      const cancelled = /cancel|abort/i.test(message);
      setExportError(
        cancelled
          ? message
          : `${message} No recorder fallback was used — your raw take is untouched.`
      );
      setExportDiagnostics(Array.isArray(err?.diagnostics) ? err.diagnostics : []);
      setSourceRepair(
        err instanceof SourceUnavailableError && err.status === 404
          ? { missingUrl: err.sourceUrl }
          : null
      );
      if (!cancelled) notify.bad(message);
      return false;
    } finally {
      exportAbortRef.current = null;
      setRendering(false);
    }
  }

  async function handleRepairSource(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !sourceRepair || !result?.project || !video) return;
    setRepairing(true);
    setExportError(null);
    setBusy(true);
    try {
      const relinked = await relinkMedia(video.id, file);
      if (!relinked) throw new Error('The take could not be re-attached. Nothing in the cut was changed.');
      const newUrl = relinked.file_url || sourceRepair.missingUrl;
      const repaired = patchSourceUrls(result.project, sourceRepair.missingUrl, newUrl);
      const repairedVariants = variants.map((variant) => ({
        ...variant,
        project: patchSourceUrls(variant.project, sourceRepair.missingUrl, newUrl),
      }));
      const active = repairedVariants.find((v) => v.id === selectedVariantId) || repairedVariants[0];
      if (active) {
        setVariants(repairedVariants);
        setResult({ ...result, project: active.project });
        setProject(active.project);
        await renderProject(active.project, relinked);
      } else {
        setResult({ ...result, project: repaired });
        setProject(repaired);
        await renderProject(repaired, relinked);
      }
      setSourceRepair(null);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'The take could not be re-attached.');
    } finally {
      setRepairing(false);
      setBusy(false);
    }
  }

  function openManualEditor() {
    if (!video || busy || rendering) return;
    const untouched = buildManualProject(video);
    setResult(null);
    resetVariants();
    clearExported();
    handoffReelToEditor(untouched, video);
  }

  async function create() {
    if (!video || busy) return;
    setBusy(true);
    setResult(null);
    resetVariants();
    setShowRawTake(false);
    setEditedCaption('');
    setGenerationError(null);
    setPlaying(false);
    setPlayheadSec(0);
    setStep(0);
    setRendering(false);
    setExportProgress(null);
    setExportError(null);
    setExportDiagnostics([]);
    setSourceRepair(null);
    clearExported();
    setEditProgress({ stage: 'reading', fraction: 0.02, message: 'Reading the take…' });

    try {
      const outcome = await runAutoEdit(
        video,
        preset,
        (update) => {
          setEditProgress(update);
          const index = STEPS.findIndex((s) => s.stage === update.stage);
          if (index >= 0) setStep(index);
        },
        { captionsEnabled: subtitlesOn }
      );
      if (!outcome.project || !outcome.stats) {
        throw new Error('The editor did not produce a usable reel. Your original take is untouched.');
      }
      const built = buildReelVariants(outcome.project, outcome.stats, preset);
      const first = built[0];
      if (!first) throw new Error('No reel options were produced. Your original take is untouched.');
      setVariants(built);
      setSelectedVariantId(first.id);
      setResult({ ...outcome, project: first.project, stats: first.stats });
      setEditedCaption(outcome.caption);
      setProject(first.project);
      setEditProgress({ stage: 'done', fraction: 1, message: 'Three reel options ready to compare.' });
    } catch (err) {
      console.error('Auto-edit pipeline error:', err);
      setGenerationError(
        err instanceof Error ? err.message : 'The reel could not be assembled. Your original clip is untouched.'
      );
    } finally {
      setBusy(false);
    }
  }

  function selectVariant(id: string) {
    const variant = variants.find((v) => v.id === id);
    if (!variant || rendering) return;
    setSelectedVariantId(id);
    setResult((current) =>
      current ? { ...current, project: variant.project, stats: variant.stats } : current,
    );
    setProject(variant.project);
    setShowRawTake(false);
    setPlaying(false);
    setPlayheadSec(0);
    clearExported();
    setExportError(null);
    setExportDiagnostics([]);
    setSourceRepair(null);
  }

  async function exportSelected() {
    if (!video || !selectedVariant || rendering) return;
    await renderProject(selectedVariant.project, video);
  }

  function handleToEditor() {
    if (result?.project) {
      handoffReelToEditor(result.project, video, {
        caption: editedCaption || result.caption,
        hashtags: result.hashtags,
      });
    }
  }

  function handleToPublish() {
    if (result?.project) {
      handoffEditorToPublish(result.project, {
        caption: editedCaption || result.caption,
        hashtags: result.hashtags,
      });
    }
  }

  const blueprintFormat = activeDraft?.idea ? splitFormat(activeDraft.idea.format) : null;

  /** The blueprint is a script note, not part of the cut. Clearing it only hides the guidance. */
  function removeBlueprint() {
    updateActiveDraft({ idea: undefined });
  }

  return (
    <PageShell>
      {/* Hidden File Upload Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept={VIDEO_ACCEPT}
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={reattachInputRef}
        onChange={handleRepairSource}
        accept={VIDEO_ACCEPT}
        className="hidden"
      />

      <PageHeader
        eyebrow="In · Intake"
        icon="smart_display"
        title="Bring in the raw take"
        description="One source, two routes. Keep full control in the studio, or generate three considered cuts and export only the one you choose."
        actions={
          <>
            {video && transcripts[video.id] === 'working' && (
              <StatusPill tone="tertiary" pulse>
                Reading the audio…
              </StatusPill>
            )}
            {video && transcripts[video.id] === 'ready' && (
              <StatusPill tone="primary">Transcript on file</StatusPill>
            )}
            {video && transcripts[video.id] === 'none' && (
              <StatusPill tone="neutral">No speech on file — paste the script below</StatusPill>
            )}
            {result && (
              <>
                {result.planKind === 'visual' && (
                  <StatusPill tone="tertiary">
                    {result.visualGrounded ? 'Visual edit from real frames' : 'Visual rhythm — no speech detected'}
                  </StatusPill>
                )}
                {result.source === 'gemini' || result.source === 'gemini_visual' ? (
                  <StatusPill tone="secondary">AI-directed cut</StatusPill>
                ) : (
                  <StatusPill tone="neutral">Local assembly</StatusPill>
                )}
              </>
            )}
          </>
        }
        className="mb-6"
      />

      {/* Active Blueprint & Script Guidance Banner (if initiated from an idea) */}
      {activeDraft?.idea && blueprintFormat && (
        <Card className="relative mb-6 overflow-hidden border-line p-5 sm:p-6">
          <button
            type="button"
            onClick={removeBlueprint}
            aria-label="Remove blueprint"
            title="Remove blueprint from this draft"
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-btn text-ink-dim transition-colors hover:bg-surface hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
          <div className="flex items-start gap-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-primary text-on-primary shadow-[var(--shadow-1)]">
              <Icon name="lightbulb" size={19} />
            </span>
            <div className="min-w-0 flex-1 pr-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="kt-eyebrow text-primary">Active Blueprint</span>
                <Badge tone="primary" icon="smart_display">{blueprintFormat.shape}</Badge>
                {blueprintFormat.length && (
                  <Badge tone="neutral" icon="timer">{blueprintFormat.length}</Badge>
                )}
              </div>
              <h3 className="mt-1.5 break-words font-display text-[18px] font-bold leading-snug tracking-[-0.01em] text-ink sm:text-[20px]">
                {activeDraft.idea.title}
              </h3>

              <div className="mt-3 rounded-btn border border-primary/15 bg-surface/75 px-3.5 py-2.5">
                <div className="kt-eyebrow mb-1">Hook to fill</div>
                <p className="text-[13px] leading-relaxed text-ink">
                  {activeDraft.idea.hook}
                </p>
              </div>

              {activeDraft.idea.beats.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
                  <span className="kt-eyebrow mr-1">Beats</span>
                  {activeDraft.idea.beats.map((b, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2.5 py-1 text-[12px] font-medium text-ink"
                    >
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/15 font-mono text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      {b.label}
                      {b.time && b.time !== '—' && (
                        <span className="font-mono text-[10px] text-ink-dim">{b.time}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
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
                        resetVariants();
                        setPlayheadSec(0);
                        selectCut(v.id);
                      }}
                      className={`shrink-0 w-[160px] text-left rounded-card border overflow-hidden transition-all kt-focus group relative ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/40 bg-primary-soft/30'
                          : 'border-line hover:border-line-strong bg-surface'
                      }`}
                    >
                      <div className="relative aspect-[9/16] bg-black/90 overflow-hidden">
                        {v.media_available === false ? (
                          <OfflinePlate />
                        ) : v.thumbnail_url ? (
                          <img
                            src={v.thumbnail_url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover transition-transform"
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
                        <span className="absolute bottom-1.5 right-1.5 text-[11px] font-semibold text-white bg-black/70 rounded px-1.5 py-0.5 tabular-nums">
                          {fmtTime(v.duration || 0)}
                        </span>
                        {isSelected && (
                          <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary text-on-primary grid place-items-center">
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
                  <span className="text-[11px] text-ink-dim mt-0.5">MP4 / MOV</span>
                </button>
              </div>
            )}
          </Card>

          {/* The engine is not the only way words reach the bench: a creator who has their script
              typed can hand it over and get real cues, with no audio and no API key involved. */}
          {video && (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center w-9 h-9 rounded-btn bg-surface-2 text-primary shrink-0">
                  <Icon name="edit_note" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-[13px] font-semibold text-ink">Paste the script instead</h4>
                    {transcripts[video.id] === 'ready' && (
                      <Badge tone="primary">Cues on file</Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-ink-muted mt-0.5">
                    {transcripts[video.id] === 'working'
                      ? 'Reading the audio in the background — you can type over it.'
                      : 'KontentOS will not write your spoken lines for you. Type or paste what you actually said and the cues become yours.'}
                  </p>

                  {scriptOpen ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={scriptText}
                        onChange={(e) => setScriptText(e.target.value)}
                        rows={5}
                        aria-label={`Script for ${video.title}`}
                        placeholder={'Paste or type what you say on camera, one sentence after another.'}
                        className="w-full rounded-card border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-dim kt-focus resize-y"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={saveScriptNow}
                          disabled={savingScript || scriptText.trim().length < 3}
                        >
                          {savingScript ? 'Saving…' : 'Use this as the script'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setScriptOpen(false)}>
                          Cancel
                        </Button>
                        {scriptMsg && (
                          <span className="text-[12px] text-ink-muted flex items-center gap-1.5">
                            <Icon name={scriptMsg.startsWith('Saved') ? 'check_circle' : 'error'} size={14} />
                            {scriptMsg}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setScriptText('');
                        setScriptMsg('');
                        setScriptOpen(true);
                      }}
                      className="kt-focus mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary"
                    >
                      <Icon name="keyboard" size={14} />
                      Open the script field
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Step 2: Choose Look / Style Preset */}
          <Card className="p-5">
            <StepLabel n={2} title="Choose your editorial style preset" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESETS.map((p) => {
                const active = presetId === p.id;
                const specs = PRESET_SPECS[p.id] ?? PRESET_SPECS[PRESETS[0].id];
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPresetId(p.id);
                      setResult(null);
                      resetVariants();
                    }}
                    className={`text-left rounded-card border p-4 flex flex-col justify-between transition-all kt-focus ${
                      active
                        ? 'border-primary bg-primary-soft ring-2 ring-primary/25'
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
                            <span className="w-4 h-4 rounded-full bg-primary text-on-primary grid place-items-center text-[11px]">
                              <Icon name="check" size={11} />
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

          {/* Step 3: Choose the route */}
          <Card className="p-5">
            <StepLabel n={3} title="Choose your route" />
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-btn border border-line bg-surface-2/50 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">Burn in subtitles / on-screen text</div>
                <p className="text-[11px] leading-relaxed text-ink-dim mt-0.5">
                  Speech gets real subtitles. Silent clips get short visual text, never fake dialogue.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={subtitlesOn}
                aria-label="Burn in subtitles or on-screen text"
                onClick={() => {
                  setSubtitlesOn((value) => !value);
                  setResult(null);
                  resetVariants();
                }}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors kt-focus ${
                  subtitlesOn ? 'bg-primary border-primary' : 'bg-surface border-line-strong'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    subtitlesOn ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {aiStatus && !aiStatus.hasGeminiKey && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-primary/25 bg-primary-soft/40 px-3.5 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-surface text-primary">
                  <Icon name="auto_awesome" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink">Connect AI for the magic edit</div>
                  <p className="text-[12px] leading-relaxed text-ink-muted mt-0.5">
                    Gemini key not set. Silent takes still get a real cut, grade and reframes from frame
                    changes; frame-grounded copy and spoken-word captions need a key or a pasted script.
                  </p>
                </div>
                {aiStatus.editable === false ? (
                  <span className="text-[11px] text-ink-dim">Host must set GEMINI_API_KEY</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => navigate('settings')}>
                    Connect AI
                  </Button>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={openManualEditor}
                disabled={busy || rendering || !video}
                data-route="manual"
                className="kt-route-card group rounded-card border border-line bg-surface p-4 pl-5 text-left transition-all hover:border-line-strong kt-focus disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-surface-3 text-primary">
                    <Icon name="tune" size={19} />
                  </span>
                  <Badge tone="neutral">Full control</Badge>
                </div>
                <div className="mt-3 text-[14px] font-semibold text-ink">Edit it myself</div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
                  Open the full studio with your take untouched. You place every cut, caption, zoom and
                  sound.
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                  Open manual editor
                  <Icon name="arrow_forward" size={15} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={create}
                disabled={busy || rendering || !video}
                data-route="magic"
                className="kt-route-card group rounded-card border border-primary bg-primary-soft p-4 pl-5 text-left transition-all ring-2 ring-primary/15 hover:ring-primary/25 kt-focus disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-primary text-on-primary">
                    <Icon name={busy ? 'autorenew' : 'auto_awesome'} size={19} className={busy ? 'kt-spin' : ''} />
                  </span>
                  <Badge tone="primary">Magic click</Badge>
                </div>
                <div className="mt-3 text-[14px] font-semibold text-ink">
                  {busy ? 'Assembling three options…' : 'Make it for me'}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
                  One click reads the take, writes the copy and builds three genuinely different reels.
                  Pick one, then export only that MP4.
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                  {result ? 'Generate three new options' : 'Generate 3 reel options'}
                  <Icon name="arrow_forward" size={15} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>

            {selectedVariant && !busy && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  icon={rendering ? 'autorenew' : 'download'}
                  onClick={exportSelected}
                  disabled={rendering}
                  className="px-6 py-2.5 text-sm"
                  title="Only the selected approach is rendered and downloaded."
                >
                  {rendering ? 'Rendering MP4…' : `Export ${selectedVariant.shortLabel}`}
                </Button>
              </div>
            )}

            {result && !busy && (
              <div className="mt-4 rounded-btn border border-line bg-surface-2/60 px-3 py-2 text-[12px] text-ink-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name="check_circle" size={16} className="text-success shrink-0" />
                  <span>
                    <strong className="text-ink">{result.stats?.cutsCount || 0} cuts</strong> ·{' '}
                    <strong className="text-ink">{result.stats?.punchZoomsCount || 0} reframes</strong> ·{' '}
                    <strong className="text-ink">
                      {subtitlesOn ? `${result.stats?.captionsCount || 0} captions` : 'subtitles off'}
                    </strong>{' '}
                    ·{' '}
                    <strong className="text-ink">
                      {fmtTime(result.stats?.silenceRemovedSec || 0)}{' '}
                      {result.planKind === 'visual' ? 'visual filler trimmed' : 'dead air trimmed'}
                    </strong>
                  </span>
                </div>
                {result.rationale && (
                  <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[11px] leading-relaxed text-ink-dim">
                    {result.planKind === 'visual' ? 'Visual note' : 'Director’s note'}: {result.rationale}
                  </p>
                )}
              </div>
            )}

            {variants.length > 0 && !busy && (
              <div className="mt-5 rounded-card border border-line bg-surface-2/40 p-3.5">
                <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-ink">Three cuts, one source</h4>
                  <span className="text-[11px] text-ink-dim">
                    Pick one to preview it. Nothing is rendered until you export it.
                  </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {variants.map((variant) => {
                    const active = selectedVariantId === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        aria-pressed={active}
                        disabled={rendering}
                        onClick={() => selectVariant(variant.id)}
                        className={`text-left rounded-btn border p-3 transition-all kt-focus disabled:opacity-60 ${
                          active
                            ? 'border-primary bg-primary-soft ring-2 ring-primary/25'
                            : 'border-line bg-surface hover:border-line-strong'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-btn ${
                              active ? 'bg-primary text-on-primary' : 'bg-surface-3 text-primary'
                            }`}
                          >
                            <Icon name={variant.icon} size={17} />
                          </span>
                          {active && <StatusPill tone="tertiary">Selected</StatusPill>}
                        </div>
                        <div className="mt-2 text-[13px] font-semibold text-ink">{variant.label}</div>
                        <p className="mt-1 min-h-[46px] text-[11px] leading-relaxed text-ink-dim">
                          {variant.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[10.5px] text-ink-muted">
                          <span>{variant.stats.cutsCount} cuts</span>
                          <span>·</span>
                          <span>{variant.stats.punchZoomsCount} punches</span>
                          <span>·</span>
                          <span>{variant.stats.sfxCount} accents</span>
                          <span>·</span>
                          <span>{fmtTime(variant.stats.trimmedDurationSec)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {rendering && exportProgress && (
              <div className="mt-4 rounded-card border border-primary/25 bg-primary-soft/30 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon name="movie_filter" size={17} className="text-primary" />
                    <span className="text-[13px] font-semibold text-ink">Rendering the final MP4</span>
                  </div>
                  <button
                    onClick={() => exportAbortRef.current?.abort()}
                    className="text-[12px] font-semibold text-ink-dim hover:text-ink kt-focus"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RENDER_PROGRESS_ORDER.map((stage, i) => {
                    const active = RENDER_PROGRESS_ORDER.indexOf(exportProgress.stage) === i;
                    const complete = i < RENDER_PROGRESS_ORDER.indexOf(exportProgress.stage);
                    return (
                      <span
                        key={stage}
                        className={`text-[11px] font-semibold rounded-full border px-2.5 py-1 ${
                          active
                            ? 'border-primary bg-primary text-on-primary'
                            : complete
                              ? 'border-primary/25 bg-surface text-primary'
                              : 'border-line bg-surface text-ink-dim'
                        }`}
                      >
                        {RENDER_STEP_LABELS[stage]}
                      </span>
                    );
                  })}
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(4, (exportProgress.fraction ?? 0.02) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-[12px] text-ink-muted">
                  <span className="min-w-0">{exportProgress.message}</span>
                  <span className="font-mono tabular-nums shrink-0">
                    {exportProgress.fraction === null
                      ? 'encoding'
                      : `${Math.round(exportProgress.fraction * 100)}%`}
                  </span>
                </div>
              </div>
            )}

            {exportError && !busy && (
              <div className="mt-4 rounded-card border border-danger/30 bg-danger/5 p-4 space-y-3">
                <div className="flex items-start gap-2.5 text-[12.5px] text-danger-ink">
                  <Icon name="error_outline" size={17} className="mt-0.5 shrink-0" />
                  <span>{exportError}</span>
                </div>
                {sourceRepair && (
                  <div className="rounded-btn border border-line bg-surface p-3">
                    <div className="text-[13px] font-semibold text-ink">Re-attach the original take</div>
                    <p className="text-[12px] text-ink-muted mt-1">
                      This clip’s source file is missing on the server. Choose the same raw take again —
                      the cut, captions and timing stay exactly as they are.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="attach_file"
                      className="mt-2.5"
                      disabled={repairing}
                      onClick={() => reattachInputRef.current?.click()}
                    >
                      {repairing ? 'Re-attaching…' : 'Choose the same take'}
                    </Button>
                  </div>
                )}
                {exportDiagnostics.length > 0 && (
                  <div className="rounded-btn border border-line bg-surface p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-[12px] font-semibold text-ink">FFmpeg diagnostics</span>
                      <button
                        onClick={() => {
                          navigator.clipboard
                            .writeText(exportDiagnostics.join('\n'))
                            .then(() => notify.ok('FFmpeg diagnostics copied.'))
                            .catch(() => notify.bad('Could not copy diagnostics.'));
                        }}
                        className="text-[11px] font-semibold text-primary hover:underline kt-focus"
                      >
                        Copy log
                      </button>
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-dim">
                      {exportDiagnostics.join('\n')}
                    </pre>
                  </div>
                )}
                <button onClick={create} className="text-[12px] font-semibold text-primary hover:underline kt-focus">
                  Try the magic edit again
                </button>
              </div>
            )}

            {generationError && !busy && (
              <div className="mt-4 flex items-start justify-between gap-3 rounded-btn border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger-ink">
                <span className="flex items-start gap-2">
                  <Icon name="error_outline" size={16} className="mt-0.5 shrink-0" />
                  {generationError}
                </span>
                <button onClick={create} className="shrink-0 font-semibold hover:underline kt-focus">
                  Retry
                </button>
              </div>
            )}

            {result?.offline && !busy && (
              <div className="mt-4 flex items-center gap-2 rounded-btn border border-primary/25 bg-primary-soft px-3.5 py-2.5 text-[12.5px] text-ink-muted">
                <Icon name="info" size={16} className="shrink-0 text-primary" />
                {result.message || 'Assembled locally from your own words while the engine was unavailable.'}
              </div>
            )}

            {/* Live Progress Stage Feedback — driven by the real assembly pipeline. */}
            {busy && !rendering && (
              <div className="mt-5 p-4 rounded-card bg-surface-2 border border-line space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-ink">
                  <span>{editProgress?.message || 'Preparing the bench…'}</span>
                  <span className="tabular-nums font-mono">
                    {Math.round((editProgress?.fraction ?? 0.02) * 100)}%
                  </span>
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
                    style={{ width: `${Math.max(4, (editProgress?.fraction ?? 0.02) * 100)}%` }}
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
              {result?.project && (
                <StatusPill tone="tertiary">{selectedVariant?.shortLabel || preset.name}</StatusPill>
              )}
            </div>

            {result?.project && video && (
              <div className="w-full mb-3 flex items-center justify-between gap-2 rounded-btn border border-line bg-surface-2/60 px-2 py-1.5">
                <div className="inline-flex rounded-btn bg-surface-3 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRawTake(false);
                      setPlaying(false);
                    }}
                    className={`rounded-btn px-2.5 py-1 text-[11px] font-semibold transition-colors kt-focus ${
                      !showRawTake ? 'bg-primary text-on-primary' : 'text-ink-dim hover:text-ink'
                    }`}
                  >
                    Finished reel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRawTake(true);
                      setPlaying(false);
                    }}
                    className={`rounded-btn px-2.5 py-1 text-[11px] font-semibold transition-colors kt-focus ${
                      showRawTake ? 'bg-primary text-on-primary' : 'text-ink-dim hover:text-ink'
                    }`}
                  >
                    Raw take
                  </button>
                </div>
                <span className="text-[10.5px] leading-tight text-ink-dim text-right max-w-[115px]">
                  {showRawTake ? 'What you uploaded' : 'What the MP4 exports'}
                </span>
              </div>
            )}

            {/* 9:16 Vertical Device Mockup */}
            <div className="w-[230px] sm:w-[250px] max-w-full">
              <div className="aspect-[9/16] rounded-[24px] border-[6px] border-ink/85 bg-black overflow-hidden relative shadow-[var(--shadow-2)]">
                {result?.project && !showRawTake ? (
                  <ReelPreview
                    project={result.project}
                    playing={playing}
                    onPlayingChange={setPlaying}
                    onTime={(t) => setPlayheadSec(t)}
                    className="absolute inset-0 w-full h-full"
                  />
                ) : video ? (
                  <div className="absolute inset-0 w-full h-full bg-black flex flex-col items-center justify-center text-center p-4">
                    {media.offline ? (
                      <OfflinePlate onRelink={async (file) => !!(await relinkMedia(video.id, file))} />
                    ) : (
                      <video
                        src={video.file_url}
                        crossOrigin="anonymous"
                        className="absolute inset-0 w-full h-full object-cover block"
                        muted
                        loop
                        autoPlay={showRawTake}
                        playsInline
                        onError={media.onError}
                        onLoadedData={media.onLoadedData}
                      />
                    )}
                    <div className="relative z-10 bg-black/75 p-3 rounded-card text-white">
                      <Icon name="play_arrow" size={24} className="mx-auto mb-1 text-primary" />
                      <p className="text-xs font-medium">
                        {showRawTake ? 'Original take' : 'Ready to compare'}
                      </p>
                      <p className="text-[11px] text-white/70 mt-0.5">
                        {showRawTake
                          ? 'No cuts, grade, zooms or captions yet.'
                          : 'One click creates three reel options.'}
                      </p>
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
            {result?.project && !showRawTake && (
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
              {exportedFile && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-btn border border-tertiary/30 bg-tertiary/5 px-3.5 py-2.5">
                  <Icon name="check_circle" size={18} className="text-tertiary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink">Finished MP4 downloaded</div>
                    <div className="text-[11px] text-ink-dim truncate" title={exportedFile.name}>
                      {exportedFile.name} · {fmtBytes(exportedFile.bytes)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="download"
                    onClick={() => downloadBlob(exportedFile.url, exportedFile.name)}
                  >
                    Download again
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-ink text-sm">
                  {result.visualGrounded ? 'Frame-Grounded Copy & Hashtags' : 'Generated Copy & Hashtags'}
                </h3>
                <span className="text-[11px] text-ink-dim font-medium">
                  {result.hashtags.length} hashtags
                </span>
              </div>
              {result.planKind === 'visual' && (
                <p className="mb-2.5 text-[11px] leading-relaxed text-ink-dim">
                  No speech was detected. Any burned-in lines are on-screen design text, not subtitles of
                  spoken words.
                </p>
              )}
              {result.punchline && (
                <div className="mb-2.5 rounded-btn border border-primary/20 bg-primary-soft/40 px-3 py-2 text-[12px] font-semibold text-primary">
                  Opening hook: {result.punchline}
                </div>
              )}
              <textarea
                value={editedCaption}
                onChange={(e) => setEditedCaption(e.target.value)}
                rows={4}
                aria-label="Generated caption — edit before scheduling"
                className="w-full resize-none rounded-btn border border-line bg-surface-2 p-3 text-[13px] text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-sans leading-relaxed"
              />
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {result.hashtags.map((h) => (
                  <span
                    key={h}
                    className="text-[12px] font-medium text-primary bg-primary-soft border border-primary/20 rounded-full px-2.5 py-0.5"
                  >
                    {h.startsWith('#') ? h : `#${h}`}
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
