import { useEffect, useMemo, useRef, useState } from 'react';
import { studioApi, type RepurposeClip, type RepurposeJob, type VideoRecord } from '../lib/api';
import { checkCaption, PLATFORMS, platformSpec } from '@/lib/platforms';
import { copyModel, readAiPrefs } from '@/lib/prefs';
import { copyVoice, voiceTone } from '@/lib/brandKit';
import { notify } from '../lib/notify';
import { packFor } from '../lib/pack';
import { cutSpan, resolveSpan, type CutProgress } from '../lib/cut';
import { downloadTextFile, spanCaptions, type CaptionCue } from '../lib/captions';
import { Button, Label, Timecode } from '../components/atoms';

type Edits = Pick<RepurposeClip, 'title' | 'hook' | 'caption' | 'cardHeadline' | 'platform'>;

/** Where one short's browser cut has got to. `idle` never renders a panel. */
type CutState =
  | { phase: 'idle' }
  | { phase: 'working'; progress: CutProgress }
  | {
      phase: 'done';
      url: string;
      byteLength: number;
      blob: Blob;
      /** Seconds of film actually in the cut, which is the span unless the source ran out first. */
      seconds: number;
      shortOfSpan?: boolean;
      saved?: VideoRecord;
      saving?: number;
    }
  | { phase: 'failed'; message: string };

/**
 * Where one short's server cut has got to. The encode runs out of this tab's sight, so the only way
 * to know is to keep reading the clip row the cut created.
 */
type ServerCut =
  | { phase: 'running'; fraction: number | null }
  | { phase: 'ready'; fileUrl: string; bytes: number; seconds: number }
  | { phase: 'failed'; message: string };

/** The server kills an encode at 10 minutes, so watching for longer than that plus a lap is pointless. */
const SERVER_WATCH_MS = 11 * 60 * 1000;
const SERVER_POLL_MS = 1500;

const baseOf = (clip: RepurposeClip): Edits => ({
  title: clip.title,
  hook: clip.hook,
  caption: clip.caption,
  cardHeadline: clip.cardHeadline,
  platform: clip.platform,
});

/** A short's title turned into something safe to name a downloaded file with. */
const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'studio-short';

export function CutScreen({
  job,
  jobId,
  onJob,
  onBack,
  onDirtyChange,
  onStarted,
  onOpen,
}: {
  job: RepurposeJob | null;
  jobId: string;
  onJob: (job: RepurposeJob) => void;
  onBack: () => void;
  onDirtyChange: (count: number) => void;
  /** A re-pull makes a second job, so the parent has to take it into the list and open it. */
  onStarted: (job: RepurposeJob) => void;
  onOpen: (id: string) => void;
}) {
  const [live, setLive] = useState<RepurposeJob | null>(job);
  const [missing, setMissing] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [busyId, setBusyId] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [focused, setFocused] = useState('');
  const [cuts, setCuts] = useState<Record<string, CutState>>({});
  const [serverCuts, setServerCuts] = useState<Record<string, ServerCut>>({});
  const serverTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [source, setSource] = useState<{ checked: boolean; video: VideoRecord | null; offline: boolean }>({
    checked: false,
    video: null,
    offline: false,
  });
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  // Every finished cut hands back an object URL; they are revoked together when this job closes,
  // so a long session does not pin a stack of decoded clips in memory.
  const cutUrls = useRef<Set<string>>(new Set());
  // The recording's timed cues, read once and reused for every short's caption file.
  const cueCache = useRef<{ videoId: string; cues: CaptionCue[] } | null>(null);
  const [captionBusy, setCaptionBusy] = useState('');
  // What the caption button has to say about itself: a span with no speech in it is a real answer,
  // and an empty .srt file is not.
  const [captionNote, setCaptionNote] = useState<Record<string, string>>({});
  const [repullTone, setRepullTone] = useState('');
  const [repulling, setRepulling] = useState(false);

  useEffect(() => {
    const urls = cutUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [jobId]);

  // A closed job stops the watching, not the encode — the server finishes the file either way and
  // the clip row is in the vault when it lands.
  useEffect(() => {
    return () => {
      for (const timer of Object.values(serverTimers.current)) clearTimeout(timer);
      serverTimers.current = {};
    };
  }, [jobId]);

  // A cut needs the creator's own bytes, and only a job that came from a recording has any.
  useEffect(() => {
    const videoId = (job || live)?.videoId;
    if (!videoId) {
      setSource({ checked: true, video: null, offline: false });
      return;
    }
    let alive = true;
    studioApi
      .listVideos()
      .then((rows) => {
        if (!alive) return;
        const row = rows.find((v) => v.id === videoId) || null;
        setSource({ checked: true, video: row, offline: !!row && row.media_available === false });
      })
      .catch(() => alive && setSource({ checked: true, video: null, offline: false }));
    return () => {
      alive = false;
    };
  }, [job, live]);

  useEffect(() => {
    if (job) {
      setLive(job);
      return;
    }
    let alive = true;
    studioApi
      .job(jobId)
      .then((fresh) => alive && setLive(fresh))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [job, jobId]);

  // Leaving this screen with unsaved words is the one way the Studio can lose your work, so the
  // count lives with the router and the router asks before it navigates.
  useEffect(() => () => onDirtyChange(0), [onDirtyChange]);

  const current = live || job;

  const isDirty = (clip: RepurposeClip) => {
    if (!current) return false;
    const base = baseOf(clip);
    const e = editOf(clip);
    return (Object.keys(base) as (keyof Edits)[]).some((k) => base[k] !== e[k]);
  };

  const editOf = (clip: RepurposeClip): Edits => edits[clip.id] || baseOf(clip);

  const setEdit = (clip: RepurposeClip, key: keyof Edits, value: string) =>
    setEdits((prev) => ({ ...prev, [clip.id]: { ...editOf(clip), [key]: value } }));

  const dirtyIds = useMemo(
    () => (current ? current.clips.filter(isDirty).map((c) => c.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, edits]
  );

  useEffect(() => onDirtyChange(dirtyIds.length), [dirtyIds.length, onDirtyChange]);

  const save = async (clip: RepurposeClip) => {
    if (!current) return;
    setBusyId(clip.id);
    try {
      const e = editOf(clip);
      const stored = await studioApi.updateClip(current.id, clip.id, { ...e, status: 'saved' });
      const next: RepurposeJob = {
        ...current,
        clips: current.clips.map((c) => (c.id === clip.id ? { ...c, ...e, status: stored.status || 'saved' } : c)),
        updatedAt: new Date().toISOString(),
      };
      onJob(next);
      setLive(next);
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[clip.id];
        return copy;
      });
      notify('Kept on the shelf.', 'ok');
    } catch (err) {
      // Without this the button simply returned to "Save changes" and the creator assumed the words
      // were stored. They were not.
      notify(err instanceof Error ? err.message : 'Could not save that short.', 'bad');
    } finally {
      setBusyId('');
    }
  };

  // ⌘S / Ctrl+S saves the card you are typing in, falling back to the first unsaved one.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      const target = current.clips.find((c) => c.id === focused && isDirty(c)) || current.clips.find((c) => isDirty(c));
      if (target && !busyId) void save(target);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, focused, busyId, edits]);

  const copyCaption = async (clip: RepurposeClip) => {
    const ok = await writeClipboard(editOf(clip).caption);
    if (ok) {
      setCopiedId(clip.id);
      setTimeout(() => setCopiedId(''), 1800);
    } else {
      notify('The browser blocked the clipboard. Select the caption and copy it yourself.', 'bad');
    }
  };

  const copyPack = async (clip: RepurposeClip) => {
    const e = editOf(clip);
    const spec = platformSpec(e.platform);
    const ok = await writeClipboard(packFor({ ...clip, ...e }));
    notify(
      ok
        ? `${spec.label} pack copied — span, title, hook, card line and caption.`
        : 'The browser blocked the clipboard. Open the short on the Shelf and copy the fields one by one.',
      ok ? 'ok' : 'bad'
    );
  };

  // Why the cut cannot run right now, in the creator's terms, or null when it can.
  const cutBlocker = (): string | null => {
    if (!source.checked) return 'Checking your source…';
    if (!source.video) {
      return current && current.sourceKind === 'paste'
        ? 'This job came from a pasted transcript, so there is no footage here to cut.'
        : 'The recording behind this job is no longer on your account.';
    }
    if (source.offline) {
      return 'The source file is not on this server any more, so this span cannot be cut.';
    }
    if (!source.video.file_url) return 'The source has no file path to read from.';
    return null;
  };

  const runCut = async (clip: RepurposeClip) => {
    const video = source.video;
    const blocked = cutBlocker();
    if (!video?.file_url || blocked) {
      if (blocked) setCuts((prev) => ({ ...prev, [clip.id]: { phase: 'failed', message: blocked } }));
      return;
    }
    const filmSeconds = Number(video.duration) || 0;
    // The span was timed from cues, which do not know how long the file turned out to be. Cut to
    // the end of the real film and say so, rather than promising 50s of a 12s clip.
    const span = resolveSpan(clip.start, clip.end, filmSeconds);
    const settle = (next: CutState) =>
      setCuts((prev) => {
        const previous = prev[clip.id];
        if (previous?.phase === 'done') {
          URL.revokeObjectURL(previous.url);
          cutUrls.current.delete(previous.url);
        }
        return { ...prev, [clip.id]: next };
      });

    settle({ phase: 'working', progress: { stage: 'reading', fraction: null, message: 'Reading your source…' } });
    try {
      const { blob, byteLength } = await cutSpan(
        {
          fileUrl: video.file_url,
          fileSize: video.file_size,
          sourceSeconds: filmSeconds,
          start: span.start,
          duration: span.duration,
        },
        (progress) => settle({ phase: 'working', progress })
      );
      const url = URL.createObjectURL(blob);
      cutUrls.current.add(url);
      setCuts((prev) => ({
        ...prev,
        [clip.id]: { phase: 'done', url, byteLength, blob, seconds: span.duration, shortOfSpan: span.shortOfSpan },
      }));
      notify(
        `${span.shortOfSpan ? `The source runs out at ${Math.round(filmSeconds)}s, so this is shorter than the span asked for. ` : ''}Cut to ${span.duration.toFixed(1)}s — ${(byteLength / 1024 / 1024).toFixed(1)} MB. Play it below before you keep it.`,
        'ok'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The browser cut could not be completed.';
      settle({ phase: 'failed', message });
      notify(message, 'bad');
    }
  };

  /** Reads the clip row until the encode is over. The row, not a socket, carries the answer. */
  const watchServerCut = (clipId: string, videoId: string, stopAfter: number) => {
    const timer = setTimeout(async () => {
      try {
        const cut = await studioApi.cutStatus(videoId);
        if (cut.status === 'encoding') {
          if (Date.now() > stopAfter) {
            setServerCuts((prev) => ({
              ...prev,
              [clipId]: { phase: 'failed', message: 'The server is still working on this cut. It will show in your vault when it lands.' },
            }));
            return;
          }
          setServerCuts((prev) => ({ ...prev, [clipId]: { phase: 'running', fraction: cut.fraction ?? null } }));
          watchServerCut(clipId, videoId, stopAfter);
          return;
        }
        if (cut.status === 'ready' && cut.video?.file_url) {
          const landed: ServerCut = {
            phase: 'ready',
            fileUrl: cut.video.file_url,
            bytes: Number(cut.video.file_size) || 0,
            seconds: Number(cut.video.duration) || 0,
          };
          setServerCuts((prev) => ({ ...prev, [clipId]: landed }));
          notify('The server cut is in your vault — it plays below and is queued from the bench.', 'ok');
          return;
        }
        setServerCuts((prev) => ({
          ...prev,
          [clipId]: { phase: 'failed', message: cut.reason || 'The server could not finish this cut.' },
        }));
      } catch (err) {
        setServerCuts((prev) => ({
          ...prev,
          [clipId]: {
            phase: 'failed',
            message: err instanceof Error ? err.message : 'The server stopped answering about this cut.',
          },
        }));
      }
    }, SERVER_POLL_MS);
    serverTimers.current[clipId] = timer;
  };

  const runServerCut = async (clip: RepurposeClip) => {
    if (!current) return;
    if (serverCuts[clip.id]?.phase === 'running') return;
    setServerCuts((prev) => ({ ...prev, [clip.id]: { phase: 'running', fraction: null } }));
    try {
      const { video, span } = await studioApi.startServerCut(current.id, clip.id);
      notify(
        span.shortOfSpan
          ? `The recording ends before this span does, so the server is cutting ${span.duration.toFixed(1)}s from ${clip.startLabel}.`
          : `The server is cutting ${span.duration.toFixed(1)}s from ${clip.startLabel} straight into your vault.`,
        'ok'
      );
      watchServerCut(clip.id, video.id, Date.now() + SERVER_WATCH_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The server would not take this cut.';
      setServerCuts((prev) => ({ ...prev, [clip.id]: { phase: 'failed', message } }));
      notify(message, 'bad');
    }
  };

  const cuesForJob = async (): Promise<CaptionCue[] | null> => {
    const videoId = current?.videoId || '';
    if (!videoId) return null;
    if (cueCache.current?.videoId === videoId) return cueCache.current.cues;
    const subs = await studioApi.subtitles(videoId);
    const cues = subs?.segments || [];
    cueCache.current = { videoId, cues };
    return cues;
  };

  /**
   * The words of one short as a caption file that lines up with the cut: cue times rebased to the
   * span, so the sidecar drops straight onto the MP4 this screen renders.
   */
  const downloadCaptions = async (clip: RepurposeClip) => {
    if (captionBusy) return;
    setCaptionBusy(clip.id);
    setCaptionNote((prev) => ({ ...prev, [clip.id]: '' }));
    try {
      const cues = await cuesForJob();
      if (!cues?.length) {
        const why = current?.videoId
          ? 'This recording has no timed cues on the server yet. Transcribe it on the bench and the caption file will follow.'
          : 'This job came from pasted words, which carry no timing — there is nothing to stamp a caption file with.';
        setCaptionNote((prev) => ({ ...prev, [clip.id]: why }));
        notify(why, 'bad');
        return;
      }
      const srt = spanCaptions(cues, clip.start, clip.end);
      if (!srt) {
        const why = `No cue speaks between ${clip.startLabel} and ${clip.endLabel}, so this short has no captions to export.`;
        setCaptionNote((prev) => ({ ...prev, [clip.id]: why }));
        notify(why, 'bad');
        return;
      }
      const cueCount = srt.split('\n\n').filter((block) => block.trim()).length;
      downloadTextFile(srt, `${slug(clip.title)}.srt`, 'text/plain');
      notify(`${cueCount} caption lines saved as ${slug(clip.title)}.srt — timed from ${clip.startLabel} of the recording.`, 'ok');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The caption file could not be built.';
      setCaptionNote((prev) => ({ ...prev, [clip.id]: message }));
      notify(message, 'bad');
    } finally {
      setCaptionBusy('');
    }
  };

  /**
   * The words of this job are already stored, so a second opinion costs one more request: the same
   * transcript goes back through the engine with a different tone and lands as its own job.
   */
  const repull = async () => {
    if (!current || repulling) return;
    const tone = repullTone.trim() || voiceTone();
    setRepulling(true);
    try {
      const next = await studioApi.startJob({
        title: current.title,
        transcript: current.transcript,
        videoId: current.videoId,
        sourceKind: current.sourceKind,
        clipCount: current.clips.length,
        platform: current.clips[0]?.platform || 'instagram',
        tone,
        context: copyVoice(),
        temperature: readAiPrefs().temperature,
        model: copyModel(),
      });
      onStarted(next);
      notify(`A second take wrote ${next.clips.length} shorts${tone ? ` as ${tone}` : ''}.`, 'ok');
      onOpen(next.id);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'The second take could not be written.', 'bad');
    } finally {
      setRepulling(false);
    }
  };

  const saveCutToVault = async (clip: RepurposeClip) => {
    const state = cuts[clip.id];
    const video = source.video;
    if (state?.phase !== 'done' || !state.blob || !video) return;

    setCuts((prev) => ({ ...prev, [clip.id]: { ...state, saving: 0 } }));
    try {
      const row = await studioApi.uploadClip(
        state.blob,
        {
          fileName: `${slug(clip.title)}.mp4`,
          title: `${clip.title || 'Studio short'} (cut)`,
          duration: Math.round(state.seconds),
          aspectRatio: video.aspect_ratio,
        },
        (fraction) => setCuts((prev) => ({ ...prev, [clip.id]: { ...state, saving: fraction } }))
      );
      setCuts((prev) => ({ ...prev, [clip.id]: { ...state, saved: row, saving: undefined } }));
      notify(`In your vault as “${row.title || 'this cut'}” — queue it from the bench whenever you are ready.`, 'ok');
    } catch (err) {
      setCuts((prev) => ({ ...prev, [clip.id]: { ...state, saving: undefined } }));
      notify(err instanceof Error ? err.message : 'The vault did not take that cut.', 'bad');
    }
  };

  if (missing) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[28px] text-ink">That job is not here</h1>
        <p className="text-[15px] text-ink-soft">It may have been deleted, or it belongs to another account.</p>
        <Button kind="outline" onClick={onBack}>
          Back to the feed
        </Button>
      </div>
    );
  }

  if (!current) {
    return <p className="meta-label">Opening the job…</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-rule pb-4">
        <button onClick={onBack} className="meta-label text-ink-soft hover:text-moss">
          ← Feed
        </button>
        <h1 className="font-display text-[26px] leading-tight tracking-[-0.015em] text-ink sm:text-[30px]">
          {current.title}
        </h1>
        <p className="meta-label ml-auto">
          {current.engineSource === 'engine' ? current.engineModel : 'local draft — no engine answer'}
        </p>
      </div>

      {dirtyIds.length > 0 && (
        <p className="meta-label mt-3 text-clay">
          {dirtyIds.length} unsaved {dirtyIds.length === 1 ? 'short' : 'shorts'} · ⌘S saves the one you are in
        </p>
      )}

      <div className="mt-6 flex gap-8">
        <nav aria-label="Shorts in this job" className="sticky top-[74px] hidden w-[168px] shrink-0 self-start lg:block">
          <p className="meta-label">The shorts</p>
          <ol className="mt-2 space-y-0.5">
            {current.clips.map((clip, i) => (
              <li key={clip.id}>
                <button
                  onClick={() =>
                    cardRefs.current[clip.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  className={`group flex w-full items-start gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors duration-200 hover:bg-paper-2 ${
                    clip.id === focused ? 'bg-paper-2' : ''
                  }`}
                >
                  <span className="font-mono text-[11px] text-ink-faint tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-ink-soft group-hover:text-ink">
                    {editOf(clip).title || 'Untitled'}
                  </span>
                  {isDirty(clip) && <span aria-hidden="true" className="mt-1.5 h-[6px] w-[6px] shrink-0 rounded-pill bg-clay" />}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-0 grid min-w-0 flex-1 gap-5">
          {current.clips.map((clip, i) => {
            const e = editOf(clip);
            const spec = platformSpec(e.platform);
            const verdict = checkCaption(e.caption, e.platform);
            const fill = Math.min(100, (verdict.length / verdict.limit) * 100);
            return (
              <article
                key={clip.id}
                id={`clip-${clip.id}`}
                ref={(el) => {
                  cardRefs.current[clip.id] = el;
                }}
                onFocus={() => setFocused(clip.id)}
                className="rise-in scroll-mt-24 rounded-card border border-rule bg-white p-5 sm:p-6"
                style={{ animationDelay: `${Math.min(i * 45, 270)}ms` }}
              >
                <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-display text-[26px] leading-none text-ink-faint tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Timecode>
                    {clip.startLabel} → {clip.endLabel}
                  </Timecode>
                  <span className="meta-label">
                    {clip.spanSeconds > 0 ? `${Math.round(clip.spanSeconds)}s span` : 'no cues — set the span on the bench'}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="meta-label">stands alone</span>
                    <span
                      role="img"
                      aria-label={`Stands alone ${clip.score} of 100`}
                      className="h-[6px] w-[70px] overflow-hidden rounded-pill bg-paper-3"
                    >
                      <span
                        className="block h-full bg-moss transition-[width] duration-500"
                        style={{ width: `${Math.max(4, Math.min(100, clip.score))}%` }}
                      />
                    </span>
                  </span>
                </header>

                <blockquote className="mt-3 border-l-2 border-rule pl-3 text-[13.5px] italic leading-relaxed text-ink-soft">
                  {clip.excerpt}
                </blockquote>

                <div className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor={`t-${clip.id}`}>Title</Label>
                    <input
                      id={`t-${clip.id}`}
                      value={e.title}
                      onChange={(ev) => setEdit(clip, 'title', ev.target.value)}
                      className="mt-1.5 w-full rounded-[8px] border border-transparent bg-paper-2 px-3 py-2 font-display text-[19px] leading-snug tracking-[-0.01em] text-ink focus:border-moss focus:bg-white focus:outline-none focus:ring-2 focus:ring-moss/15"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`h-${clip.id}`}>Opening hook — say this first</Label>
                    <textarea
                      id={`h-${clip.id}`}
                      rows={2}
                      value={e.hook}
                      onChange={(ev) => setEdit(clip, 'hook', ev.target.value)}
                      className="mt-1.5 w-full resize-y rounded-[8px] border border-rule bg-white px-3 py-2 text-[15px] leading-relaxed italic focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                    />
                  </div>

                  <div>
                    <Label>Three beats</Label>
                    <ol className="mt-2 space-y-2">
                      {clip.beats.map((beat, bi) => (
                        <li key={`${clip.id}-${bi}`} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[96px_1fr]">
                          <span className="font-mono text-[12px] text-moss">{beat.time}</span>
                          <span className="text-[14px] leading-relaxed text-ink-soft">
                            <span className="meta-label mr-2 normal-case tracking-normal">{beat.label}</span>
                            {beat.body}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={`c-${clip.id}`}>Caption</Label>
                        <select
                          value={e.platform}
                          onChange={(ev) => setEdit(clip, 'platform', ev.target.value)}
                          aria-label={`Which composer short ${i + 1} is written for`}
                          className="rounded-[6px] border border-rule bg-paper-2 px-2 py-1 text-[12.5px] text-ink-soft focus:border-moss focus:bg-white focus:outline-none"
                        >
                          {PLATFORMS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        id={`c-${clip.id}`}
                        rows={6}
                        value={e.caption}
                        onChange={(ev) => setEdit(clip, 'caption', ev.target.value)}
                        aria-describedby={`cl-${clip.id}`}
                        className="mt-1.5 w-full resize-y rounded-[8px] border border-rule bg-white px-3 py-2 text-[14px] leading-relaxed focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                      />
                      <div id={`cl-${clip.id}`} className="mt-1.5 flex items-center gap-2">
                        <span className="meta-label">
                          {verdict.length} / {verdict.limit} {spec.label}
                        </span>
                        <span className="h-[3px] w-[64px] overflow-hidden rounded-pill bg-paper-3">
                          <span
                            className={`block h-full transition-[width] duration-300 ${
                              verdict.length > verdict.limit ? 'bg-clay' : fill > 88 ? 'bg-warn' : 'bg-moss'
                            }`}
                            style={{ width: `${Math.max(2, Math.min(100, fill))}%` }}
                          />
                        </span>
                        {verdict.hashtags > 0 && (
                          <span className="meta-label">{verdict.hashtags} tags</span>
                        )}
                      </div>
                      {verdict.notes.map((note) => (
                        <p key={note} className="mt-1 text-[12.5px] leading-relaxed text-clay">
                          {note}
                        </p>
                      ))}
                    </div>
                    <div>
                      <Label htmlFor={`k-${clip.id}`}>Card headline</Label>
                      <textarea
                        id={`k-${clip.id}`}
                        rows={2}
                        value={e.cardHeadline}
                        onChange={(ev) => setEdit(clip, 'cardHeadline', ev.target.value)}
                        className="mt-1.5 w-full resize-y rounded-[8px] border border-rule bg-white px-3 py-2 text-[14px] leading-relaxed focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                      />
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
                        {source.video && !source.offline
                          ? 'Two ways to make this short: cut it in this tab, which keeps the work on your machine, or send the span to the server, which writes the file straight into your vault.'
                          : 'The Studio writes words. Cut the span above in the bench to make the visual.'}
                      </p>
                    </div>
                  </div>

                  <footer className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                    <Button
                      onClick={() => void save(clip)}
                      disabled={(clip.status === 'draft' ? false : !isDirty(clip)) || busyId === clip.id}
                    >
                      {busyId === clip.id ? 'Saving…' : isDirty(clip) ? 'Save changes' : clip.status === 'draft' ? 'Keep on the shelf' : 'Saved'}
                    </Button>
                    <Button kind="outline" onClick={() => void copyCaption(clip)}>
                      {copiedId === clip.id ? 'Copied' : 'Copy caption'}
                    </Button>
                    <Button kind="quiet" onClick={() => void copyPack(clip)}>
                      Copy {spec.label} pack
                    </Button>
                    <Button
                      kind="outline"
                      onClick={() => void runCut(clip)}
                      disabled={!!cutBlocker() || cuts[clip.id]?.phase === 'working'}
                    >
                      {cuts[clip.id]?.phase === 'working' ? 'Cutting here…' : 'Cut in this tab'}
                    </Button>
                    <Button
                      kind="outline"
                      onClick={() => void runServerCut(clip)}
                      disabled={!!cutBlocker() || serverCuts[clip.id]?.phase === 'running'}
                    >
                      {serverCuts[clip.id]?.phase === 'running' ? 'Cutting on the server…' : 'Cut on the server'}
                    </Button>
                    <Button kind="quiet" onClick={() => void downloadCaptions(clip)} disabled={!!captionBusy}>
                      {captionBusy === clip.id ? 'Reading cues…' : 'Captions (.srt)'}
                    </Button>
                    <a
                      href={spec.composerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="meta-label text-ink-soft underline-offset-4 hover:text-moss hover:underline"
                      title={`Opens ${spec.label}'s own composer in a new tab — KontentOS does not post for you`}
                    >
                      Open {spec.label}
                    </a>
                    {clip.status !== 'draft' && (
                      <span className="meta-label ml-auto text-moss">kept on the shelf</span>
                    )}
                  </footer>

                  {captionNote[clip.id] && (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-clay">{captionNote[clip.id]}</p>
                  )}

                  {(() => {
                    const state = cuts[clip.id];
                    if (!state || state.phase === 'idle') {
                      // Before a cut is asked for, say why the button is asleep.
                      if (!source.checked) return null;
                      const blocked = cutBlocker();
                      return blocked ? (
                        <p className="mt-3 border-t border-rule pt-3 text-[12.5px] leading-relaxed text-ink-faint">
                          {blocked}
                        </p>
                      ) : null;
                    }
                    if (state.phase === 'working') {
                      const pct = state.progress.fraction === null ? null : Math.round(state.progress.fraction * 100);
                      return (
                        <div className="mt-3 border-t border-rule pt-3">
                          <p className="text-[13px] text-ink-soft">{state.progress.message}</p>
                          <span className="mt-2 block h-[3px] w-full overflow-hidden rounded-pill bg-paper-3">
                            <span
                              className={
                                pct === null
                                  ? 'block h-full w-[30%] animate-pulse bg-moss/50'
                                  : 'block h-full bg-moss transition-[width] duration-300'
                              }
                              style={pct === null ? undefined : { width: `${Math.max(2, pct)}%` }}
                            />
                          </span>
                          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">
                            Only this span is decoded, and it happens in this tab — nothing is uploaded.
                          </p>
                        </div>
                      );
                    }
                    if (state.phase === 'failed') {
                      return (
                        <p className="mt-3 border-t border-rule pt-3 text-[13px] leading-relaxed text-clay">
                          {state.message}
                        </p>
                      );
                    }
                    return (
                      <div className="mt-4 flex flex-wrap gap-4 border-t border-rule pt-4">
                        <video
                          src={state.url}
                          controls
                          playsInline
                          className="h-[220px] w-auto max-w-full rounded-[8px] border border-rule bg-ink"
                        />
                        <div className="min-w-[200px] flex-1">
                          <p className="meta-label text-ink-soft">
                            {(state.byteLength / 1024 / 1024).toFixed(1)} MB · {state.seconds.toFixed(1)}s from{' '}
                            {clip.startLabel}
                            {state.shortOfSpan ? ' · the source ends here' : ` → ${clip.endLabel}`}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-3">
                            {state.saved ? (
                              <a
                                href="/"
                                className="meta-label text-moss underline-offset-4 hover:underline"
                                title="The bench is where a saved clip gets queued"
                              >
                                In your vault · open the bench
                              </a>
                            ) : (
                              <Button
                                kind="outline"
                                onClick={() => void saveCutToVault(clip)}
                                disabled={typeof state.saving === 'number'}
                              >
                                {typeof state.saving === 'number'
                                  ? `Saving ${Math.round(state.saving * 100)}%`
                                  : 'Save to vault'}
                              </Button>
                            )}
                            <a
                              href={state.url}
                              download={`${slug(clip.title)}.mp4`}
                              className="meta-label text-ink-soft underline-offset-4 hover:text-moss hover:underline"
                            >
                              Download MP4
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const cut = serverCuts[clip.id];
                    if (!cut) return null;
                    if (cut.phase === 'running') {
                      const pct = cut.fraction === null ? null : Math.round(cut.fraction * 100);
                      return (
                        <div className="mt-3 border-t border-rule pt-3">
                          <p className="text-[13px] text-ink-soft">
                            {pct === null ? 'The server is starting the encode…' : `Encoded ${pct}% of this span.`}
                          </p>
                          <span className="mt-2 block h-[3px] w-full overflow-hidden rounded-pill bg-paper-3">
                            <span
                              className={
                                pct === null
                                  ? 'block h-full w-[30%] animate-pulse bg-moss/50'
                                  : 'block h-full bg-moss transition-[width] duration-300'
                              }
                              style={pct === null ? undefined : { width: `${Math.max(2, pct)}%` }}
                            />
                          </span>
                          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">
                            Your source never leaves this server and nothing is downloaded here while it runs —
                            the file is written straight into your vault. Keep working; this panel is only watching.
                          </p>
                        </div>
                      );
                    }
                    if (cut.phase === 'failed') {
                      return (
                        <p className="mt-3 border-t border-rule pt-3 text-[13px] leading-relaxed text-clay">
                          {cut.message}
                        </p>
                      );
                    }
                    return (
                      <div className="mt-4 flex flex-wrap gap-4 border-t border-rule pt-4">
                        <video
                          src={cut.fileUrl}
                          controls
                          playsInline
                          className="h-[220px] w-auto max-w-full rounded-[8px] border border-rule bg-ink"
                        />
                        <div className="min-w-[200px] flex-1">
                          <p className="meta-label text-ink-soft">
                            {cut.bytes > 0 ? `${(cut.bytes / 1024 / 1024).toFixed(1)} MB · ` : ''}
                            {cut.seconds > 0 ? `${cut.seconds.toFixed(1)}s` : 'Cut'} from {clip.startLabel} · on
                            the server
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-3">
                            <a
                              href="/"
                              className="meta-label text-moss underline-offset-4 hover:underline"
                              title="The bench is where a saved clip gets queued"
                            >
                              In your vault · open the bench
                            </a>
                            <a
                              href={cut.fileUrl}
                              download={`${slug(clip.title)}-server-cut.mp4`}
                              className="meta-label text-ink-soft underline-offset-4 hover:text-moss hover:underline"
                            >
                              Download MP4
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </article>
            );
          })}
        </div>

        <section className="mt-8 rounded-card border border-rule bg-white p-5 sm:p-6">
          <p className="meta-label">Out · Another take</p>
          <h2 className="mt-1.5 font-display text-[20px] leading-snug tracking-[-0.015em] text-ink">
            Send these words through the engine again
          </h2>
          <p className="mt-2 max-w-[58ch] text-[13.5px] leading-relaxed text-ink-soft">
            The transcript this job was written from is kept, so a different voice costs one more pass and
            nothing more. It comes back as its own job — the {current.clips.length} shorts above stay exactly
            as they are.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="st-repull-tone">Voice for the second take</Label>
              <input
                id="st-repull-tone"
                value={repullTone}
                onChange={(e) => setRepullTone(e.target.value)}
                placeholder={voiceTone() || 'wry, first person, no hype'}
                className="mt-1.5 w-full rounded-[8px] border border-rule bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
              />
            </div>
            <Button kind="outline" onClick={() => void repull()} disabled={repulling}>
              {repulling ? 'Writing the second take…' : 'Re-pull in another voice'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
