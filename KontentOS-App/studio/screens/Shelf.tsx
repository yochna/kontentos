import { useMemo, useState } from 'react';
import type { RepurposeClip, RepurposeJob } from '../lib/api';
import { platformSpec } from '@/lib/platforms';
import { notify } from '../lib/notify';
import { packFor } from '../lib/pack';
import { Button, Empty, Timecode } from '../components/atoms';

type Filter = 'all' | 'kept' | 'draft';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'kept', label: 'Kept' },
  { id: 'draft', label: 'Not kept yet' },
];

export function ShelfScreen({ jobs, onOpen }: { jobs: RepurposeJob[]; onOpen: (id: string) => void }) {
  const [copied, setCopied] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () =>
      jobs.flatMap((job) => job.clips.map((clip) => ({ clip, job }))).filter(({ clip }) => {
        if (filter === 'kept' && clip.status === 'draft') return false;
        if (filter === 'draft' && clip.status !== 'draft') return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          clip.title.toLowerCase().includes(q) ||
          clip.caption.toLowerCase().includes(q) ||
          clip.hook.toLowerCase().includes(q)
        );
      }),
    [jobs, filter, query]
  );

  const keptCount = rows.filter(({ clip }) => clip.status !== 'draft').length;

  const copy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      notify(`${label} copied.`, 'ok');
      setTimeout(() => setCopied(''), 1800);
    } catch {
      notify('The browser blocked the clipboard. Select the text and copy it yourself.', 'bad');
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="meta-label">Keep · Shelf</p>
        <h1 className="mt-1.5 font-display text-[30px] leading-[1.15] tracking-[-0.02em] text-ink sm:text-[36px]">
          Every short you have pulled
        </h1>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
          Saved ones stay here with their timecode and caption. Nothing on this list is published anywhere — it
          is your copy library, ready to queue from the bench.
        </p>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, hooks and captions"
          aria-label="Search the shelf"
          className="w-full max-w-[320px] rounded-[8px] border border-rule bg-white px-3 py-2 text-[14px] placeholder:text-ink-faint focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
        />
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-[8px] border px-3 py-1.5 text-[13.5px] transition-colors duration-200 ${
                filter === f.id
                  ? 'border-moss bg-moss-wash text-moss-deep'
                  : 'border-rule text-ink-soft hover:border-rule-strong hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {rows.length > 0 && (
          <span className="meta-label ml-auto">
            {rows.length} shown · {keptCount} kept
          </span>
        )}
      </section>

      {rows.length === 0 ? (
        jobs.length === 0 ? (
          <Empty title="The shelf is empty" body="Run a job on the feed and save a short, and it lands here." />
        ) : (
          <Empty
            title="Nothing matches that"
            body={`${jobs.reduce((n, j) => n + j.clips.length, 0)} shorts are on the shelf — clear the search or the filter.`}
          />
        )
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-white">
          {rows.map(({ clip, job }) => {
            const key = `${job.id}-${clip.id}`;
            const spec = platformSpec(clip.platform);
            return (
              <li key={key} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Timecode>
                      {clip.startLabel} → {clip.endLabel}
                    </Timecode>
                    {clip.status !== 'draft' && <span className="meta-label text-moss">kept</span>}
                  </div>
                  <button
                    onClick={() => onOpen(job.id)}
                    className="mt-1 block text-left font-display text-[19px] leading-snug tracking-[-0.01em] text-ink hover:text-moss"
                  >
                    {clip.title}
                  </button>
                  <p className="meta-label mt-1 truncate">
                    {job.title} · {spec.label}
                  </p>
                  <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">{clip.caption}</p>
                </div>
                <div className="flex gap-2 sm:flex-col sm:items-end">
                  <Button
                    kind="outline"
                    onClick={() => void copy(key, clip.caption, `${spec.label} caption`)}
                  >
                    {copied === key ? 'Copied' : 'Copy caption'}
                  </Button>
                  <Button
                    kind="quiet"
                    onClick={() => void copy(`${key}-pack`, packFor(clip), `${spec.label} pack`)}
                  >
                    Copy pack
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
