import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Icon } from '@/lib/icons';
import { Badge, Button, Card, PageHeader, PageShell, StatusPill } from '@/components/ui';
import { EmptyState } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { notify } from '@/components/ui/toast';
import { OfflinePlate, useMediaSource } from '@/components/OfflinePlate';
import PressDeck from '@/components/PressDeck';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { navigate, useNavPayload } from '@/lib/nav';
import { fmtBytes, selectCut, useSelectedCutId } from '@/lib/bench';
import { copyVoice } from '@/lib/brandKit';
import { copyModel, copyModelLabel } from '@/lib/prefs';
import { checkCut, cutSpan, type CutProgress, type CutRequest } from '@/lib/browserCut';
import {
  PRESS_STYLES,
  plainHighlights,
  pressStyle,
  pressTimecode,
  type PressBundle,
  type PressJob,
  type PressStep,
} from '@/lib/press';
import { makeZip, type ZipEntry } from '@/lib/zip';

/**
 * The Press — the one button this app is pitched on.
 *
 * Every part of it already existed behind its own screen: Intake takes the footage, the transcript
 * gives it words, the Studio finds a short, the Card station draws a deck. Walking those screens in
 * order is work, not a demo. Here the creator picks a clip and a style and clicks once; the server
 * chooses the span and writes everything it can reach, and this tab encodes the reel itself — the
 * one step a shared free-tier core does worse than the creator's own laptop.
 *
 * So the screen owns a five-step sequence with a network call and an ffmpeg run in the middle of it,
 * and every step says what it actually did. Nothing here claims a file that is not in the vault.
 */

/** The writing is two engine calls deep; a press that stopped answering has to be re-read, not awaited forever. */
const POLL_MS = 1_200;
const MAX_POLLS = 120;

const STEP_ICONS: Record<PressStep['id'], string> = {
  reel: 'movie',
  captions: 'subtitles',
  deck: 'photo_size_select_actual',
  copy: 'edit_note',
};

/** The reel step is this tab's own work, so polling it would wait on the creator instead of the server. */
function isWriting(job: PressJob): boolean {
  return job.steps.some((step) => step.id !== 'reel' && (step.state === 'running' || step.state === 'waiting'));
}

const fileBase = (title: string) =>
  (title || 'kontentos-press').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kontentos-press';

/** The job's own plan, in the shape the browser encoder reads. Every field came off the creator's record. */
function cutRequestFor(pressed: PressJob): CutRequest {
  return {
    fileUrl: pressed.plan.source.fileUrl,
    fileSize: pressed.plan.source.fileSize,
    sourceSeconds: pressed.plan.source.duration,
    start: pressed.plan.span.start,
    duration: pressed.plan.duration,
    targetAspect: pressed.plan.targetAspect,
    sourceAspect: pressed.plan.source.aspectRatio,
  };
}

function saveTextFile(text: string, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The words a creator pastes beside the reel, in the order the post reads. Empty when there are none. */
function postCopyText(bundle: PressBundle): string {
  const deckCaption = bundle.deck?.socialCaption?.trim() ?? '';
  return [
    bundle.hook && `HOOK\n${bundle.hook}`,
    bundle.caption && `CAPTION\n${bundle.caption}`,
    deckCaption && `CAROUSEL CAPTION\n${deckCaption}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The carousel as plain words, one block per card — what survives when the PDF could not be drawn. */
function carouselText(deck: NonNullable<PressBundle['deck']>): string {
  return deck.slides
    .map((slide, i) =>
      [`${i + 1}/${deck.slides.length}`, plainHighlights(slide.headline), plainHighlights(slide.supportingText)]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');
}

async function copyField(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.ok(`${label} copied.`);
  } catch {
    notify.bad('The browser blocked the clipboard. Select the text and copy it yourself.');
  }
}

export default function Press() {
  const { videos, uploadVideo, transcripts, saveScript } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scriptText, setScriptText] = useState('');
  const [savingScript, setSavingScript] = useState(false);
  const [cueCheck, setCueCheck] = useState<{ videoId: string; state: 'ready' | 'none' | 'error' } | null>(null);
  const [cueRead, setCueRead] = useState(0);

  const [videoId, setVideoId] = useState('');
  const [styleId, setStyleId] = useState<string>('hook');
  const [job, setJob] = useState<PressJob | null>(null);
  const [intakePct, setIntakePct] = useState<number | null>(null);
  const [pressing, setPressing] = useState(false);
  const [encode, setEncode] = useState<CutProgress | null>(null);
  const [reelPct, setReelPct] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [note, setNote] = useState<{ kind: 'info' | 'bad'; text: string } | null>(null);

  const deckPdfRef = useRef<(() => Promise<Blob>) | null>(null);
  const [bundling, setBundling] = useState(false);

  const pollRef = useRef<number | null>(null);
  const readVersion = useRef(0);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // A clip is pressable when the server can read its file and knows its length; anything else is a
  // 409 or a 410 the creator would only get to read after clicking.
  const sources = useMemo(() => videos.filter((v) => v.status === 'ready' && v.media_available !== false), [videos]);
  const video = sources.find((v) => v.id === videoId) ?? null;
  const style = pressStyle(styleId) ?? PRESS_STYLES[0];

  const navPayload = useNavPayload<{ videoId?: string }>('press');
  useEffect(() => {
    const target = navPayload?.videoId;
    if (target && sources.some((v) => v.id === target)) setVideoId(target);
  }, [navPayload, sources]);

  // The rail owns which cut is lit. Only follow an actual change, so a refresh never undoes a pick
  // the creator just made in this station.
  const litCutId = useSelectedCutId();
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (!litCutId || litCutId === followed.current) return;
    followed.current = litCutId;
    if (sources.some((v) => v.id === litCutId)) setVideoId(litCutId);
  }, [litCutId, sources]);

  useEffect(() => {
    if (!videoId && sources.length > 0) setVideoId(sources[0].id);
  }, [sources, videoId]);

  const stopPolling = useCallback(() => {
    readVersion.current += 1;
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const poll = useCallback((id: string) => {
    stopPolling();
    const version = readVersion.current;
    let attempts = 0;
    setPolling(true);
    const read = async () => {
      pollRef.current = null;
      attempts += 1;
      try {
        const fresh = await api.getPress(id);
        if (version !== readVersion.current) return;
        if (fresh) setJob(fresh);
        if (!fresh || !isWriting(fresh)) {
          setPolling(false);
          return;
        }
      } catch {
        if (version !== readVersion.current) return;
      }
      if (attempts < MAX_POLLS) pollRef.current = window.setTimeout(read, POLL_MS);
      else setPolling(false);
    };
    pollRef.current = window.setTimeout(read, POLL_MS);
  }, [stopPolling]);

  // Coming back to the station re-attaches to the last press. The reel step cannot be finished by a
  // poll — that encode lives in a tab that is gone — so it is offered again instead.
  useEffect(() => {
    mountedRef.current = true;
    const version = readVersion.current;
    void (async () => {
      try {
        const presses = await api.getPresses();
        if (version !== readVersion.current || presses.length === 0) return;
        const newest = presses[0];
        setJob(newest);
        if (isWriting(newest)) poll(newest.id);
      } catch {
        if (version === readVersion.current) setNote({ kind: 'bad', text: 'Previous presses could not be loaded.' });
      }
    })();
    return () => {
      mountedRef.current = false;
      stopPolling();
      abortRef.current?.abort();
    };
  }, [poll, stopPolling]);

  /**
   * Encode the span the server picked, upload it, then tell the press. Watching for the writing
   * steps only starts after that settle: a poll answered late would overwrite the reel the settle
   * just filed.
   */
  const encodeReel = useCallback(
    async (pressed: PressJob) => {
      stopPolling();
      setPressing(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const request = cutRequestFor(pressed);
        const blocked = await checkCut(request);
        if (controller.signal.aborted) return;
        if (blocked) {
          setNote({ kind: 'bad', text: blocked.message });
          setJob(await api.settlePressReel(pressed.id, { error: blocked.message }));
          notify.bad(blocked.message);
          return;
        }
        setEncode({ stage: 'preparing', fraction: null, message: 'Loading the cut bench…' });
        const { blob } = await cutSpan(request, setEncode, controller.signal);
        controller.signal.throwIfAborted();
        setEncode(null);
        setReelPct(0);
        // The reel's caption track is the span's own cues, which the settle writes. Re-transcribing
        // the file would spend a second engine call to produce a track that then overwrites it.
        const clip = await uploadVideo(
          new File([blob], 'kontentos_press.mp4', { type: 'video/mp4' }),
          setReelPct,
          { transcribe: false }
        );
        if (!clip) {
          if (controller.signal.aborted) return;
          const message = 'The reel was cut, but the upload did not land. Nothing was filed against your vault.';
          setNote({ kind: 'bad', text: message });
          setJob(await api.settlePressReel(pressed.id, { error: message }));
          notify.bad(message);
          return;
        }
        // Once uploaded, file the reel even if navigation unmounted this station.
        const settled = await api.settlePressReel(pressed.id, { clipVideoId: clip.id });
        if (controller.signal.aborted) return;
        setReelPct(null);
        setJob(settled);
        if (settled.steps.find((step) => step.id === 'reel')?.state === 'done') {
          notify.ok(`The reel is in your vault — ${fmtBytes(clip.file_size)}.`);
        } else {
          notify.bad(settled.error || 'The reel could not be filed against this press.');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'The browser could not encode this reel.';
        setNote({ kind: 'bad', text: message });
        notify.bad(message);
        try {
          setJob(await api.settlePressReel(pressed.id, { error: message }));
        } catch {
          // The press record still says the reel is waiting, which is what the retry button reads.
        }
      } finally {
        if (!controller.signal.aborted) {
          setPressing(false);
          setEncode(null);
          setReelPct(null);
          abortRef.current = null;
          poll(pressed.id);
        }
      }
    },
    [poll, stopPolling, uploadVideo]
  );

  async function pressIt() {
    if (!video || pressing) return;
    stopPolling();
    setNote(null);
    setPressing(true);
    try {
      // The style owns the register; only the voice brief and the chosen engine come from the room.
      const started = await api.startPress({
        videoId: video.id,
        style: style.id,
        context: copyVoice(),
        model: copyModel(),
      });
      if (!mountedRef.current) return;
      setJob(started);
      if (started.plan.shortened) {
        setNote({
          kind: 'info',
          text: `“${started.sourceTitle}” ends before the ${style.label.toLowerCase()} span does, so the reel runs to the last frame of the take.`,
        });
      }
      await encodeReel(started);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The press would not start.';
      setNote({ kind: 'bad', text: message });
      notify.bad(message);
      setPressing(false);
    }
  }

  async function handleIntake(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || pressing) return;
    stopPolling();
    setNote(null);
    setIntakePct(10);
    try {
      const uploaded = await uploadVideo(file, setIntakePct);
      if (uploaded) {
        followed.current = uploaded.id;
        selectCut(uploaded.id);
        setVideoId(uploaded.id);
        setJob(null);
        notify.ok('Taken in. The transcript is being read now — the press needs it to find a moment.');
      }
    } catch (err) {
      notify.bad(err instanceof Error ? err.message : 'That upload did not go through.');
    } finally {
      setIntakePct(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const bundle = job?.bundle ?? null;
  const deck = bundle?.deck ?? null;
  const reelUrl = bundle?.clipVideoId ? bundle.fileUrl : '';
  const reelMedia = useMediaSource(reelUrl || undefined, true);
  const knownTranscript = video ? transcripts[video.id] : undefined;
  const transcriptState = knownTranscript ?? (cueCheck?.videoId === videoId ? cueCheck.state : 'checking');
  const reelStep = job?.steps.find((step) => step.id === 'reel') ?? null;
  const canPress = Boolean(video) && !pressing && intakePct === null && !savingScript && transcriptState === 'ready';

  useEffect(() => {
    if (!videoId || knownTranscript) return;
    let cancelled = false;
    setCueCheck(null);
    void api.getSubtitles(videoId, AbortSignal.timeout(15_000)).then((track) => {
      if (!cancelled) setCueCheck({ videoId, state: track && track.segments.length >= 2 ? 'ready' : 'none' });
    }).catch(() => {
      if (!cancelled) setCueCheck({ videoId, state: 'error' });
    });
    return () => { cancelled = true; };
  }, [videoId, knownTranscript, cueRead]);

  useEffect(() => setScriptText(''), [videoId]);

  /**
   * One file with everything the press made: the reel, both caption files, the post copy and the
   * carousel. Each piece is read from where it actually lives (the vault, the press record, the
   * rendered deck) and anything that could not be read is named in the message rather than quietly
   * left out of a zip that looks complete.
   */
  async function downloadBundle() {
    if (!job || !bundle || bundling) return;
    setBundling(true);
    const base = fileBase(bundle.title || job.sourceTitle);
    const files: ZipEntry[] = [];
    const left: string[] = [];
    const encoder = new TextEncoder();
    const addText = (name: string, content: string) => files.push({ name, data: encoder.encode(content) });

    try {
      if (bundle.clipVideoId && reelUrl) {
        try {
          const res = await fetch(reelUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          files.push({ name: `${base}.mp4`, data: new Uint8Array(await res.arrayBuffer()) });
        } catch {
          left.push('the reel');
        }
      } else {
        left.push('the reel');
      }

      if (bundle.srt.trim()) addText(`${base}.srt`, bundle.srt);
      else left.push('the .srt');
      if (bundle.vtt.trim()) addText(`${base}.vtt`, bundle.vtt);
      else left.push('the .vtt');

      const copy = postCopyText(bundle);
      if (copy) addText('post-copy.txt', copy);
      else left.push('the post copy');

      if (bundle.deck) {
        addText('carousel.txt', carouselText(bundle.deck));
        try {
          const render = deckPdfRef.current;
          if (!render) throw new Error('The carousel is still preparing.');
          files.push({ name: `${base}-carousel.pdf`, data: new Uint8Array(await (await render()).arrayBuffer()) });
        } catch (err) {
          left.push(`the carousel PDF (${err instanceof Error ? err.message : 'it could not be drawn'})`);
        }
      } else {
        left.push('the carousel');
      }

      if (files.length === 0) {
        notify.bad('Nothing from this press could be read, so there is no bundle to save.');
        return;
      }
      saveBlob(makeZip(files), `${base}-press.zip`);
      if (left.length) notify.bad(`Bundle saved without ${left.join(', ')}.`);
      else notify.ok(`Bundle saved: ${files.length} files.`);
    } catch (err) {
      notify.bad(err instanceof Error ? err.message : 'The bundle could not be built.');
    } finally {
      setBundling(false);
    }
  }

  async function saveScriptNow() {
    if (!video || !scriptText.trim()) return;
    setSavingScript(true);
    const saved = await saveScript(video.id, scriptText);
    setSavingScript(false);
    if (saved) notify.ok('Script saved. Its caption timings are approximate.');
    else notify.bad('The script could not be saved. Try again.');
  }

  return (
    <PageShell>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleIntake}
        accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
        className="hidden"
      />

      <PageHeader
        eyebrow="In · Press"
        icon="print"
        title="One click out: the reel, the cards and the caption files"
        description="Pick a take and a style. The press finds the span, cuts it vertical in this tab, and writes the copy, the deck and the .srt around it — the four screens you used to walk in order, answered by one button."
        actions={
          <>
            {job && job.status === 'running' && (
              <StatusPill tone="tertiary" pulse>
                {pressing ? 'Encoding in this tab…' : polling ? 'The engine is still writing…' : 'Reel waiting on this tab'}
              </StatusPill>
            )}
            {job && job.status === 'complete' && (
              <StatusPill tone={job.steps.some((step) => step.state === 'failed') ? 'warning' : 'success'}>
                {job.steps.some((step) => step.state === 'failed') ? 'Reel ready · bundle incomplete' : 'Pressed'}
              </StatusPill>
            )}
            {job && job.status === 'failed' && <StatusPill tone="danger">Press failed</StatusPill>}
            <Badge tone="neutral">{copyModelLabel()}</Badge>
          </>
        }
        className="mb-6"
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        <div className="space-y-5 min-w-0">
          {/* Step 1 — the take */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 gap-3">
              <StepLabel n={1} title="Pick the take" />
              <Button
                size="sm"
                variant="secondary"
                icon="upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={intakePct !== null || pressing}
              >
                {intakePct !== null ? `Uploading ${intakePct}%…` : '+ Ingest clip'}
              </Button>
            </div>

            {sources.length === 0 ? (
              <EmptyState
                compact
                icon="smart_display"
                title="Nothing on the bench to press"
                body="The press cuts from a take that is already uploaded and already transcribed. Bring one in and the button becomes live."
                action={
                  <Button size="sm" icon="upload" onClick={() => fileInputRef.current?.click()}>
                    Ingest a clip
                  </Button>
                }
              />
            ) : (
              <>
                <Select value={videoId} onValueChange={setVideoId} disabled={pressing || savingScript || intakePct !== null}>
                  <SelectTrigger aria-label="Take to press">
                    <span className="truncate">
                      {video ? `${video.title} · ${pressTimecode(video.duration || 0)}` : 'Choose a take'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.title} · {pressTimecode(v.duration || 0)}
                        {v.file_size ? ` · ${fmtBytes(v.file_size)}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
                  {transcriptState === 'checking' && <span>Checking saved cues…</span>}
                  {transcriptState === 'error' && (
                    <>
                      <span className="text-danger-ink">Saved cues could not be checked.</span>
                      <Button size="sm" variant="ghost" onClick={() => setCueRead((value) => value + 1)}>Retry cue check</Button>
                    </>
                  )}
                  {transcriptState === 'working' && <span>Reading its audio — the press needs the cues.</span>}
                  {transcriptState === 'none' && (
                    <span className="text-danger-ink">No speech transcript came back. Paste the spoken words below to continue here.</span>
                  )}
                  {transcriptState === 'ready' && <span>Cues on file.</span>}
                  {video && video.file_size && video.file_size > 400 * 1024 * 1024 && (
                    <span className="text-danger-ink">
                      {fmtBytes(video.file_size)} is past what a browser cut can hold — trim it on the Bench instead.
                    </span>
                  )}
                </div>
                {transcriptState === 'none' && (
                  <div className="mt-3 space-y-2">
                    <label htmlFor="press-script" className="block text-[12px] text-ink-muted">
                      Spoken script — timing will be approximate; review the captions before posting.
                    </label>
                    <textarea
                      id="press-script"
                      value={scriptText}
                      onChange={(event) => setScriptText(event.target.value)}
                      disabled={savingScript}
                      rows={4}
                      className="kt-focus w-full rounded-btn border border-line bg-surface-2 p-3 text-[13px] text-ink"
                    />
                    <Button size="sm" variant="secondary" disabled={savingScript || scriptText.trim().length < 3} onClick={() => void saveScriptNow()}>
                      {savingScript ? 'Saving script…' : 'Use this script'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Step 2 — the style */}
          <Card className="p-5">
            <StepLabel n={2} title="Pick the style" />
            <p className="mb-3 text-[12.5px] text-ink-muted">
              Each style is a real setting, not a label: it bounds the span the press searches for, sizes the deck, and
              sets the register the copy is written in.
            </p>
            <ToggleGroup
              variant="none"
              value={styleId}
              onValueChange={(next) => next && setStyleId(next)}
              aria-label="Press style"
              disabled={pressing}
              className="flex-col items-stretch gap-2"
            >
              {PRESS_STYLES.map((option) => (
                <ToggleGroupItem
                  key={option.id}
                  value={option.id}
                  variant="none"
                  className="flex items-start gap-3 rounded-card border border-line bg-surface-2/50 p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary-soft"
                >
                  <Icon name={option.icon} size={18} className="mt-0.5 shrink-0 text-ink-muted" />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">{option.note}</span>
                    <span className="mt-1.5 block font-mono text-[11px] text-ink-dim">
                      {option.minSeconds}–{option.maxSeconds}s span · {option.slides} cards · {option.tone}
                    </span>
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Card>

          {/* Step 3 — the one button */}
          <Card className="p-5">
            <StepLabel n={3} title="Press it" />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={pressing ? 'progress_activity' : 'print'}
                iconSpin={pressing}
                onClick={() => void pressIt()}
                disabled={!canPress}
              >
                {pressing ? 'Pressing…' : job ? 'Press another' : 'Press it'}
              </Button>
              <span className="text-[12px] text-ink-muted">
                {video
                  ? `Cuts ${style.minSeconds}–${style.maxSeconds}s of “${video.title}” to 9:16, then ${style.slides} cards and two caption files.`
                  : 'Choose a take first.'}
              </span>
            </div>

            {note && (
              <p
                className={`mt-3 rounded-btn border px-3 py-2 text-[12.5px] ${
                  note.kind === 'bad'
                    ? 'border-danger/30 bg-danger/10 text-danger-ink'
                    : 'border-line bg-surface-2 text-ink-muted'
                }`}
              >
                {note.text}
              </p>
            )}

            {job && (
              <ul className="mt-4 space-y-2" aria-label="What this press did">
                {job.steps.map((step) => (
                  <li key={step.id} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                        step.state === 'done'
                          ? 'border-success/40 bg-success/12 text-success-ink'
                          : step.state === 'failed'
                            ? 'border-danger/40 bg-danger/10 text-danger-ink'
                            : step.state === 'running'
                              ? 'border-tertiary/40 bg-tertiary-soft text-danger-ink'
                              : 'border-line bg-surface-2 text-ink-dim'
                      }`}
                    >
                      <Icon
                        name={step.state === 'done' ? 'check' : step.state === 'failed' ? 'close' : STEP_ICONS[step.id]}
                        size={13}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[12.5px] font-semibold text-ink">{step.label}</span>
                        <span className="text-[11.5px] text-ink-muted">{step.detail}</span>
                      </span>
                      {step.id === 'reel' && encode && (
                        <span className="mt-1.5 block max-w-[420px]">
                          <Progress
                            value={encode.fraction === null ? 0 : Math.round(encode.fraction * 100)}
                            live
                            label="Browser encode"
                          />
                          <span className="mt-1 block text-[11px] text-ink-dim">{encode.message}</span>
                        </span>
                      )}
                      {step.id === 'reel' && reelPct !== null && (
                        <span className="mt-1.5 block max-w-[420px]">
                          <Progress value={reelPct} live label="Uploading the reel" />
                          <span className="mt-1 block text-[11px] text-ink-dim">Uploading the reel — {reelPct}%</span>
                        </span>
                      )}
                      {step.id === 'reel' &&
                        !pressing &&
                        !bundle?.clipVideoId &&
                        (step.state === 'waiting' || step.state === 'failed') && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="refresh"
                            className="mt-2"
                            onClick={() => {
                              setNote(null);
                              void encodeReel(job);
                            }}
                          >
                            {step.state === 'failed' ? 'Try the encode again' : 'Cut the reel in this tab'}
                          </Button>
                        )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {job && (
              <p className="mt-4 border-t border-line pt-3 font-mono text-[11px] text-ink-dim">
                {job.plan.span.start.toFixed(2)}s → {job.plan.span.end.toFixed(2)}s · {job.plan.targetAspect} ·
                {job.plan.source.aspectRatio ? ` from ${job.plan.source.aspectRatio}` : ' source shape unknown'} ·{' '}
                {pressStyle(job.styleId)?.label || job.styleId}
              </p>
            )}
          </Card>
        </div>

        {/* Results */}
        <div className="space-y-5">
          {!job && (
            <Card className="p-5">
              <EmptyState
                compact
                icon="print"
                title="Nothing pressed yet"
                body="The four panels the press fills appear here: the reel, its caption files, the carousel and the post copy."
              />
            </Card>
          )}

          {job && reelStep?.state === 'done' && bundle && (
            <Card className="p-4">
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Everything, together</h3>
              <p className="mb-3 text-[12px] text-ink-muted">
                The reel, the .srt and .vtt, the post copy and the carousel PDF in one zip.
              </p>
              <Button
                size="sm"
                icon={bundling ? 'progress_activity' : 'download'}
                iconSpin={bundling}
                disabled={bundling || isWriting(job)}
                onClick={() => void downloadBundle()}
              >
                {bundling ? 'Building the bundle…' : isWriting(job) ? 'Waiting for the writing to finish…' : 'Download the bundle'}
              </Button>
            </Card>
          )}

          {job && reelStep?.state === 'done' && bundle && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-ink">Reel</h3>
                <Badge tone="primary">9:16</Badge>
              </div>
              {reelMedia.offline ? (
                <OfflinePlate />
              ) : (
                <video
                  src={reelUrl}
                  controls
                  playsInline
                  onError={reelMedia.onError}
                  onLoadedData={reelMedia.onLoadedData}
                  className="aspect-[9/16] w-full max-h-[380px] rounded-card bg-black"
                />
              )}
              <p className="mt-2 text-[12px] text-ink-muted">
                {bundle.title || `${job.sourceTitle} · ${style.label}`} · {pressTimecode(bundle.duration)} ·{' '}
                {fmtBytes(bundle.bytes)}
              </p>
              <p className="mt-1 text-[11px] text-ink-dim">
                Cut in your own tab and filed in your vault. Span {pressTimecode(bundle.span.start)}–
                {pressTimecode(bundle.span.end)} of “{job.sourceTitle}”.
              </p>
              <a href={reelUrl} download={`${fileBase(bundle.title || job.sourceTitle)}.mp4`} className="kt-focus mt-3 inline-block rounded-btn border border-line px-3 py-2 text-[12px] font-semibold text-ink">
                Download reel
              </a>
            </Card>
          )}

          {job && (!reelStep || reelStep.state === 'waiting') && (
            <Card className="p-4">
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Reel</h3>
              <p className="text-[12px] text-ink-muted">
                {pressing
                  ? 'Encoding in this tab now.'
                  : 'The reel is the one piece this tab has to encode. Press the retry beside the step above — it works from the span the server already picked.'}
              </p>
            </Card>
          )}

          {job && bundle && (bundle.srt || bundle.vtt) && (
            <Card className="p-4">
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Caption files</h3>
              <p className="mb-3 text-[12px] text-ink-muted">
                Timed to the reel itself, not to the middle of the take — {job.steps.find((s) => s.id === 'captions')?.detail}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="download"
                  disabled={!bundle.srt.trim()}
                  onClick={() => saveTextFile(bundle.srt, `${fileBase(bundle.title || job.sourceTitle)}.srt`, 'text/plain')}
                >
                  .srt
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="download"
                  disabled={!bundle.vtt.trim()}
                  onClick={() => saveTextFile(bundle.vtt, `${fileBase(bundle.title || job.sourceTitle)}.vtt`, 'text/vtt')}
                >
                  .vtt
                </Button>
              </div>
            </Card>
          )}

          {job && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-ink">Carousel deck</h3>
                {deck && <Badge tone="secondary">{deck.slides.length} cards</Badge>}
              </div>
              {deck ? (
                <>
                  <PressDeck deck={deck} title={bundle?.title || job.sourceTitle} exportPdfRef={deckPdfRef} />
                  <p className="mt-2 text-[11px] text-ink-dim">Written by {deck.modelUsed}.</p>
                </>
              ) : (
                <p className="text-[12px] text-ink-muted">
                  {job.steps.find((s) => s.id === 'deck')?.detail || 'The deck has not been written yet.'}
                </p>
              )}
              {deck?.socialCaption && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-muted">
                    {deck.socialCaption}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="content_copy"
                    className="mt-2"
                    onClick={() => void copyField(deck.socialCaption, 'Deck caption')}
                  >
                    Copy deck caption
                  </Button>
                </div>
              )}
            </Card>
          )}

          {job && bundle && (bundle.caption || bundle.hook) && (
            <Card className="p-4">
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Post copy</h3>
              {bundle.hook && (
                <p className="rounded-btn bg-primary-soft px-3 py-2 text-[12.5px] font-semibold text-primary">
                  {bundle.hook}
                </p>
              )}
              {bundle.caption && (
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-muted">{bundle.caption}</p>
              )}
              <p className="mt-2 text-[11px] text-ink-dim">
                {bundle.engineSource === 'engine'
                  ? `Written by ${bundle.engineModel}`
                  : 'Built from the transcript — no engine answered.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="content_copy"
                  disabled={!bundle.caption}
                  onClick={() => void copyField(bundle.caption || bundle.hook, 'Caption')}
                >
                  Copy caption
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="video_library"
                  disabled={!bundle.clipVideoId}
                  onClick={() => {
                    if (bundle.clipVideoId) selectCut(bundle.clipVideoId);
                    navigate('content-library');
                  }}
                >
                  Open in Vault
                </Button>
              </div>
            </Card>
          )}

          {job && job.status === 'failed' && (
            <Card className="p-4 border-danger/30">
              <h3 className="mb-1.5 text-[13px] font-semibold text-danger-ink">This press stopped</h3>
              <p className="text-[12px] leading-relaxed text-ink-muted">
                {job.error || reelStep?.detail || 'The reel could not be encoded.'}
              </p>
              <p className="mt-2 text-[11.5px] text-ink-dim">
                Whatever the engines finished is still above, and the reel step can be retried from this tab.
              </p>
            </Card>
          )}

          {job && isWriting(job) && !polling && !pressing && (
            <Card className="p-4">
              <p className="mb-2 text-[12px] text-ink-muted">The writing steps have not all answered yet, and this tab stopped reading them.</p>
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => poll(job.id)}>
                Read the press again
              </Button>
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
