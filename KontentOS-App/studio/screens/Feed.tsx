import { useEffect, useMemo, useState } from 'react';
import { studioApi, type RepurposeJob, type VideoRecord } from '../lib/api';
import { notify } from '../lib/notify';
import { Button, Empty, Label, Mark } from '../components/atoms';
import { copyModel, MODEL_CHOICES, readAiPrefs } from '@/lib/prefs';
import { copyVoice, voiceTone } from '@/lib/brandKit';
import { PLATFORMS, platformSpec } from '@/lib/platforms';

type Source = { kind: 'video'; videoId: string } | { kind: 'paste' };

/** The server refuses a transcript this short — refusing the press is kinder than a 422. */
const MIN_CHARS = 400;
const SPEAK_WORDS_PER_MINUTE = 150;

export function FeedScreen({
  jobs,
  onStarted,
  onOpen,
  onRemoved,
}: {
  jobs: RepurposeJob[];
  onStarted: (job: RepurposeJob) => void;
  onOpen: (id: string) => void;
  onRemoved: (jobId: string) => void;
}) {
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [source, setSource] = useState<Source>({ kind: 'video', videoId: '' });
  const [pasted, setPasted] = useState('');
  const [title, setTitle] = useState('');
  const [clipCount, setClipCount] = useState(5);
  const [platform, setPlatform] = useState('instagram');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState('');
  const [engine, setEngine] = useState(() => ({
    model: copyModel(),
    tone: voiceTone(),
    temperature: readAiPrefs().temperature,
  }));

  // Checked as soon as a recording is picked: finding out there are no cues after pressing the
  // button is the worst possible moment to learn it.
  const [cues, setCues] = useState<{ words: number; segments: number } | null | 'loading'>('loading');

  const voiceOn = useMemo(() => copyVoice().length > 0, []);
  const engineLabel = useMemo(
    () => MODEL_CHOICES.find((m) => m.id === engine.model)?.label.split(' — ')[0] ?? engine.model,
    [engine.model]
  );
  const destination = useMemo(() => platformSpec(platform), [platform]);

  useEffect(() => {
    studioApi
      .listVideos()
      .then((list) => {
        setVideos(list);
        const first = list[0];
        if (first) setSource({ kind: 'video', videoId: first.id });
      })
      .catch(() => setVideos([]));
  }, []);

  useEffect(() => {
    if (source.kind !== 'video' || !source.videoId) return;
    let alive = true;
    setCues('loading');
    studioApi
      .subtitles(source.videoId)
      .then((subs) => {
        if (!alive) return;
        setCues(subs ? { words: wordsIn(subs.transcript), segments: subs.segments.length } : null);
      })
      .catch(() => alive && setCues(null));
    return () => {
      alive = false;
    };
  }, [source]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const stats =
    source.kind === 'paste'
      ? { chars: pasted.trim().length, words: wordsIn(pasted), loading: false }
      : cues === 'loading'
        ? { chars: 0, words: 0, loading: true }
        : { chars: 0, words: cues?.words ?? 0, loading: false };

  const ready =
    source.kind === 'paste' ? pasted.trim().length >= MIN_CHARS : Boolean(source.videoId) && cues !== 'loading' && cues !== null;

  const start = async () => {
    setBusy(true);
    setError('');
    setElapsed(0);
    try {
      let transcript = pasted.trim();
      let videoId = '';
      if (source.kind === 'video') {
        videoId = source.videoId;
        const subs = await studioApi.subtitles(videoId);
        if (!subs?.transcript) {
          throw new Error(
            'That recording has no transcript yet. Transcribe it on the bench, or paste the words instead.'
          );
        }
        transcript = subs.transcript;
      }
      const job = await studioApi.startJob({
        title: title.trim() || 'Untitled recording',
        transcript,
        videoId,
        sourceKind: source.kind,
        clipCount,
        platform,
        tone: engine.tone,
        context: copyVoice(),
        temperature: engine.temperature,
        model: engine.model,
      });
      onStarted(job);
      onOpen(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start that job.');
      notify(err instanceof Error ? err.message : 'Could not start that job.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (job: RepurposeJob) => {
    try {
      await studioApi.deleteJob(job.id);
      setRemoving('');
      onRemoved(job.id);
      notify(`Removed “${job.title}” and its ${job.clips.length} shorts.`, 'ok');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not remove that job.', 'bad');
    }
  };

  return (
    <div className="space-y-10">
      <section>
        <p className="meta-label">In · Feed</p>
        <h1 className="mt-1.5 font-display text-[30px] leading-[1.15] tracking-[-0.02em] text-ink sm:text-[36px]">
          What did you record?
        </h1>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
          The Studio reads a transcript, finds the moments that stand on their own and writes a short for
          each one — hook, three beats, caption and card line, stamped with the timecode it happens at. It
          runs on <span className="text-ink">{engineLabel}</span>
          {voiceOn ? ' in the voice from your Kit' : ' — give your Kit a voice and it will write in it'}, at{' '}
          {engine.temperature.toFixed(1)} creativity.
        </p>
      </section>

      <section className="rounded-card border border-rule bg-white p-5 shadow-lift sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="st-title">Recording title</Label>
              <input
                id="st-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Podcast #14 — pricing with teeth"
                className="mt-1.5 w-full rounded-[8px] border border-rule bg-white px-3 py-2 text-[15px] placeholder:text-ink-faint focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
              />
            </div>

            <div>
              <Label>Where the words come from</Label>
              <div className="mt-2 flex gap-2 text-[14px]">
                <SourcePill
                  active={source.kind === 'video'}
                  onClick={() =>
                    setSource((s) => ({
                      kind: 'video',
                      videoId: s.kind === 'video' ? s.videoId : videos[0]?.id || '',
                    }))
                  }
                >
                  A recorded video
                </SourcePill>
                <SourcePill active={source.kind === 'paste'} onClick={() => setSource({ kind: 'paste' })}>
                  Paste a transcript
                </SourcePill>
              </div>

              {source.kind === 'video' ? (
                videos.length ? (
                  <>
                    <select
                      aria-label="Choose a recorded video"
                      value={source.videoId}
                      onChange={(e) => setSource({ kind: 'video', videoId: e.target.value })}
                      className="mt-3 w-full rounded-[8px] border border-rule bg-white px-3 py-2 text-[15px] focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                    >
                      {videos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title || v.id}
                        </option>
                      ))}
                    </select>
                    <p className="meta-label mt-2">
                      {cues === 'loading'
                        ? 'checking for a transcript…'
                        : cues
                          ? `${cues.words.toLocaleString()} words · ${cues.segments} cues`
                          : 'no transcript on this recording yet'}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 rounded-[8px] bg-paper-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-soft">
                    Nothing is recorded here yet. Upload and transcribe on the{' '}
                    <a className="underline underline-offset-2 hover:text-moss" href="/#/">
                      bench
                    </a>
                    , or paste a transcript instead.
                  </p>
                )
              ) : (
                <>
                  <textarea
                    aria-label="Transcript"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    rows={6}
                    placeholder="Paste the words. Longer is better — the Studio is looking for moments."
                    className="mt-3 w-full resize-y rounded-[8px] border border-rule bg-white px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-ink-faint focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                  />
                  <p className="meta-label mt-2">
                    {pasted.trim().length.toLocaleString()} characters · {stats.words.toLocaleString()} words
                    {stats.words > 0 && ` · roughly ${roughly(pasted)} min of speech`}
                    {pasted.trim().length > 0 && pasted.trim().length < MIN_CHARS && (
                      <span className="text-clay"> — {MIN_CHARS} needed to find separate moments</span>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div>
                <Label htmlFor="st-platform">Write for</Label>
                <select
                  id="st-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="mt-2 w-full rounded-[8px] border border-rule bg-white px-3 py-2 text-[15px] focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="meta-label mt-2">
                  {destination.captionMax.toLocaleString()} characters ·{' '}
                  {destination.hashtags.suggested}&ndash;{destination.hashtags.max} hashtags suggested
                </p>
              </div>

              <div>
                <Label htmlFor="st-count">Shorts to pull</Label>
                <div className="mt-2 flex items-center gap-4">
                  <input
                    id="st-count"
                    type="range"
                    min={3}
                    max={8}
                    value={clipCount}
                    onChange={(e) => setClipCount(Number(e.target.value))}
                    className="h-1.5 w-full max-w-[200px] accent-moss"
                  />
                  <span className="font-display text-[26px] leading-none text-ink tabular-nums">
                    {clipCount}
                  </span>
                </div>
              </div>

              <div className="border-t border-rule pt-4">
                <Label htmlFor="st-model">Engine for this job</Label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <select
                    id="st-model"
                    value={engine.model}
                    onChange={(e) => setEngine((s) => ({ ...s, model: e.target.value }))}
                    className="w-full rounded-[8px] border border-rule bg-white px-3 py-2 text-[14px] focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                  >
                    {MODEL_CHOICES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label.split(' — ')[0]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Tone"
                    value={engine.tone}
                    onChange={(e) => setEngine((s) => ({ ...s, tone: e.target.value }))}
                    placeholder="Tone"
                    className="w-full rounded-[8px] border border-rule bg-white px-3 py-2 text-[14px] placeholder:text-ink-faint focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Label htmlFor="st-temp">Creativity</Label>
                  <input
                    id="st-temp"
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={engine.temperature}
                    onChange={(e) => setEngine((s) => ({ ...s, temperature: Number(e.target.value) }))}
                    className="h-1.5 w-full max-w-[160px] accent-moss"
                  />
                  <span className="meta-label tabular-nums">{engine.temperature.toFixed(1)}</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
                  Starts from your Room and Kit settings. Changing them here affects this job only.
                </p>
              </div>

              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                Every short keeps the timecode span it came from, so you cut exactly that in the bench. The
                Studio writes words — it does not render a video file, because this server has no video
                engine and uploads do not survive Render&apos;s free disk.
              </p>
            </div>

            <div>
              {error && (
                <p
                  role="alert"
                  className="rise-in mb-3 rounded-[8px] bg-clay-wash px-3 py-2 text-[13.5px] text-clay"
                >
                  {error}
                </p>
              )}
              <Button onClick={() => void start()} disabled={busy || !ready}>
                {busy ? `Listening… ${elapsed}s` : 'Pull the shorts'}
              </Button>
              {busy && (
                <p className="meta-label mt-2">
                  {elapsed > 18 ? 'still working — one engine is slow' : 'reading the transcript'}
                </p>
              )}
              {!busy && !ready && (
                <p className="meta-label mt-2">
                  {source.kind === 'paste'
                    ? `${MIN_CHARS} characters of transcript to start`
                    : cues === null
                      ? 'no cues to cut — paste the words instead'
                      : 'choose a recording'}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between border-b border-rule pb-2">
          <h2 className="font-display text-[22px] tracking-[-0.01em] text-ink">Feed</h2>
          <span className="meta-label">
            {jobs.length} job{jobs.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-4">
          {jobs.length === 0 ? (
            <Empty
              title="Nothing processed yet"
              body="Start a job above. Every job stays here with its shorts, even after you close the tab."
            />
          ) : (
            <ul className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-white">
              {jobs.map((job) => (
                <li key={job.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => onOpen(job.id)}
                    className="flex min-w-0 flex-1 items-center gap-4 px-4 py-4 text-left transition-colors duration-200 hover:bg-paper-2"
                  >
                    <span className="font-display text-[22px] text-ink-faint tabular-nums">
                      {String(job.clips.length).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{job.title}</span>
                      <span className="meta-label mt-0.5 block truncate">
                        {job.sourceKind === 'video' ? 'from a recording' : 'pasted transcript'} ·{' '}
                        {new Date(job.updatedAt).toLocaleDateString()} ·{' '}
                        {job.engineSource === 'engine' ? job.engineModel : 'local draft'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <Mark tone={job.engineSource === 'engine' ? 'moss' : 'clay'} />
                      <span className="meta-label">Open</span>
                    </span>
                  </button>
                  {removing === job.id ? (
                    <span className="mr-3 flex items-center gap-2">
                      <span className="meta-label text-clay">Delete all {job.clips.length}?</span>
                      <button
                        onClick={() => void remove(job)}
                        className="meta-label rounded-[6px] bg-clay px-2 py-1 text-paper transition-opacity hover:opacity-90"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setRemoving('')}
                        className="meta-label rounded-[6px] border border-rule px-2 py-1 text-ink-soft hover:text-ink"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setRemoving(job.id)}
                      className="meta-label mr-4 opacity-0 transition-opacity duration-200 hover:text-clay group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function wordsIn(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function roughly(text: string): string {
  return (wordsIn(text) / SPEAK_WORDS_PER_MINUTE).toFixed(1);
}

function SourcePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-[8px] border px-3 py-1.5 transition-colors duration-200 ${
        active
          ? 'border-moss bg-moss-wash text-moss-deep'
          : 'border-rule text-ink-soft hover:border-rule-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
