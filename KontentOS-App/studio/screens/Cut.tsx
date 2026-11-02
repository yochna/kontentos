import { useEffect, useMemo, useRef, useState } from 'react';
import { studioApi, type RepurposeClip, type RepurposeJob } from '../lib/api';
import { checkCaption, PLATFORMS, platformSpec } from '@/lib/platforms';
import { notify } from '../lib/notify';
import { packFor } from '../lib/pack';
import { Button, Label, Timecode } from '../components/atoms';

type Edits = Pick<RepurposeClip, 'title' | 'hook' | 'caption' | 'cardHeadline' | 'platform'>;

const baseOf = (clip: RepurposeClip): Edits => ({
  title: clip.title,
  hook: clip.hook,
  caption: clip.caption,
  cardHeadline: clip.cardHeadline,
  platform: clip.platform,
});

export function CutScreen({
  job,
  jobId,
  onJob,
  onBack,
  onDirtyChange,
}: {
  job: RepurposeJob | null;
  jobId: string;
  onJob: (job: RepurposeJob) => void;
  onBack: () => void;
  onDirtyChange: (count: number) => void;
}) {
  const [live, setLive] = useState<RepurposeJob | null>(job);
  const [missing, setMissing] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [busyId, setBusyId] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [focused, setFocused] = useState('');
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

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
                        Cut the span above in the bench to make the visual. The Studio only writes words.
                      </p>
                    </div>
                  </div>

                  <footer className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                    <Button onClick={() => void save(clip)} disabled={!isDirty(clip) || busyId === clip.id}>
                      {busyId === clip.id ? 'Saving…' : isDirty(clip) ? 'Save changes' : clip.status === 'draft' ? 'Keep on the shelf' : 'Saved'}
                    </Button>
                    <Button kind="outline" onClick={() => void copyCaption(clip)}>
                      {copiedId === clip.id ? 'Copied' : 'Copy caption'}
                    </Button>
                    <Button kind="quiet" onClick={() => void copyPack(clip)}>
                      Copy {spec.label} pack
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
                </div>
              </article>
            );
          })}
        </div>
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
