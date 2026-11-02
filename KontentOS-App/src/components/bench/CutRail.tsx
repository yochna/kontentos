import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  buildLedger,
  formatDuration,
  ledgerProgress,
  ledgerStage,
  LEDGER_STAGES,
  type LedgerStage,
  type LedgerStep,
  type StationId,
} from '@/lib/bench';
import type { PublishingRecord, ScheduledPost, Video } from '@/lib/types';
import type { TimelineProject } from '@/lib/timeline';

interface RailProps {
  videos: Video[];
  scheduled: ScheduledPost[];
  history: PublishingRecord[];
  project: TimelineProject | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onIntake: (file: File) => void;
  intakeBusy: boolean;
  station: StationId;
  onOpenVault: () => void;
}

type Filter = 'all' | LedgerStage;

/**
 * The rail is the bench's real navigation: the creator's own cuts, in the order they arrived,
 * each one showing how far it has travelled. Selecting a cut here is what every station reads.
 */
export function CutRail({
  videos,
  scheduled,
  history,
  project,
  selectedId,
  onSelect,
  onIntake,
  intakeBusy,
  station,
  onOpenVault,
}: RailProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const cuts = useMemo(
    () =>
      videos.map((v) => {
        const steps = buildLedger(v, { scheduled, history, project });
        return { video: v, steps, fill: ledgerProgress(steps), stage: ledgerStage(steps) };
      }),
    [videos, scheduled, history, project]
  );

  const counts = useMemo(() => {
    const map = new Map<LedgerStage, number>();
    for (const c of cuts) if (c.stage) map.set(c.stage, (map.get(c.stage) ?? 0) + 1);
    return map;
  }, [cuts]);

  const visible = filter === 'all' ? cuts : cuts.filter((c) => c.stage === filter);
  const selected = cuts.find((c) => c.video.id === selectedId);

  const step = (delta: number) => {
    if (!visible.length) return;
    const at = visible.findIndex((c) => c.video.id === selectedId);
    const next =
      at === -1
        ? delta > 0
          ? 0
          : visible.length - 1
        : Math.min(visible.length - 1, Math.max(0, at + delta));
    onSelect(visible[next].video.id);
    // Keep the newly lit cut inside the strip rather than scrolling off its end.
    requestAnimationFrame(() => {
      stripRef.current?.querySelector(`[data-cut="${visible[next].video.id}"]`)?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'smooth',
      });
    });
  };

  return (
    <div className="shrink-0 border-b border-line bg-surface/80">
      <div className="flex items-center gap-3 px-3 pt-2">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">
          On the bench
        </span>
        <div
          role="group"
          aria-label="Filter the bench by ledger stage"
          className="kt-chipstrip flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          <Chip label="all" count={cuts.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          {LEDGER_STAGES.map((stage) => (
            <Chip
              key={stage}
              label={stage}
              count={counts.get(stage) ?? 0}
              active={filter === stage}
              onClick={() => setFilter(stage)}
            />
          ))}
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
          >
            clear
          </button>
        )}
      </div>

      <div
        ref={stripRef}
        role="toolbar"
        aria-label="Cuts on the bench"
        aria-orientation="horizontal"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            step(-1);
          }
        }}
        onWheel={(e) => {
          const el = stripRef.current;
          if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          el.scrollLeft += e.deltaY;
        }}
        className="kt-railstrip flex items-stretch gap-2 overflow-x-auto px-3 pb-3 pt-2"
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={intakeBusy}
          className="grid w-[92px] shrink-0 place-items-center rounded-[6px] border border-dashed border-line-strong bg-surface-2/40 text-ink-dim transition-colors hover:border-primary hover:text-primary disabled:opacity-50 kt-focus"
          aria-label="Intake raw footage"
        >
          <span className="flex flex-col items-center gap-1 py-6">
            <Icon
              name={intakeBusy ? 'hourglass_top' : 'file_upload'}
              size={18}
              className={intakeBusy ? 'kt-spin' : 'kt-grow'}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em]">
              {intakeBusy ? 'loading' : 'intake'}
            </span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onIntake(file);
            e.target.value = '';
          }}
        />

        {visible.map(({ video, steps, fill, stage }, i) => (
          <CutTile
            key={video.id}
            video={video}
            steps={steps}
            stage={stage}
            fill={fill}
            index={i}
            selected={video.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        {visible.length > 0 && (
          <button
            type="button"
            onClick={onOpenVault}
            className={`flex w-[68px] shrink-0 flex-col items-center justify-center gap-1 rounded-[6px] border border-line bg-surface-2/30 text-ink-dim transition-colors hover:border-line-strong hover:text-ink-muted kt-focus ${
              station === 'content-library' ? 'border-line-strong text-ink-muted' : ''
            }`}
            aria-label="Open the vault"
          >
            <Icon name="grid_view" size={17} />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em]">vault</span>
          </button>
        )}
      </div>

      {cuts.length === 0 ? (
        <p className="px-3 pb-3 text-[12px] text-ink-dim">
          Nothing on the bench yet — intake raw footage, or drop a file anywhere on the bench, to start a cut.
        </p>
      ) : (
        visible.length === 0 && (
          <p className="px-3 pb-3 text-[12px] text-ink-dim">
            No cut sits at “{filter}” yet — those four lights only turn on when a row proves the step.
          </p>
        )
      )}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`kt-focus shrink-0 rounded-[4px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors ${
        active
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-line text-ink-dim hover:border-line-strong hover:text-ink-muted'
      }`}
    >
      {label}
      <span className={`ml-1 ${active ? 'text-primary' : 'text-ink-dim/70'}`}>{count}</span>
    </button>
  );
}

function CutTile({
  video,
  steps,
  stage,
  fill,
  index,
  selected,
  onSelect,
}: {
  video: Video;
  steps: LedgerStep[];
  stage: LedgerStage | null;
  fill: number;
  index: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      data-cut={video.id}
      data-selected={selected}
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : video.id)}
      style={{ ['--kt-fill' as string]: fill.toFixed(2), ['--kt-i' as string]: String(index) }}
      title={`${video.title} — ${steps.map((s) => `${s.label}: ${s.detail}`).join(' · ')}`}
      className={`kt-cut-tile group w-[92px] shrink-0 overflow-hidden rounded-[6px] border bg-surface-2/50 p-1.5 text-left kt-focus ${
        selected ? 'border-primary' : 'border-line'
      }`}
    >
      {/* Safelight: fires when this tile becomes the lit cut, then stops owning the surface. */}
      <span aria-hidden className="kt-safelight pointer-events-none absolute inset-0 overflow-hidden" />

      {/* Contact print, not a preview: the strip has to leave the stage room to breathe, so the
          frame is cropped to the middle of the reel instead of showing all of it. */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-[4px] bg-surface-3">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-85 transition-opacity duration-200 group-hover:opacity-100"
          />
        ) : (
          <span className="grid h-full place-items-center text-ink-dim">
            <Icon name={video.status === 'ready' ? 'movie' : 'hourglass_top'} size={20} />
          </span>
        )}
        <span className="absolute bottom-1 left-1 rounded-[3px] bg-black/65 px-1 font-mono text-[9px] leading-tight text-white/90">
          {formatDuration(video.duration)}
        </span>
      </div>

      <div className="mt-1.5 truncate text-[11px] font-semibold leading-tight text-ink">{video.title}</div>

      <div className="mt-1.5 flex items-center gap-[3px]" aria-hidden>
        {steps.map((s) => (
          <span
            key={s.label}
            className={`h-[3px] flex-1 rounded-full ${
              s.state === 'done' ? 'bg-primary/80' : s.state === 'now' ? 'kt-led--now bg-tertiary' : 'bg-surface-3'
            }`}
          />
        ))}
      </div>

      {stage && (
        <span className="mt-1 block truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-dim">
          {stage}
        </span>
      )}
    </button>
  );
}
