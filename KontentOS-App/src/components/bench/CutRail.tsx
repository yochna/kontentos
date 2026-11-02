import { useMemo, useRef } from 'react';
import { Icon } from '@/lib/icons';
import { buildLedger, formatDuration, ledgerProgress, type StationId } from '@/lib/bench';
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

  const cuts = useMemo(
    () =>
      videos.map((v) => {
        const steps = buildLedger(v, { scheduled, history, project });
        return { video: v, steps, fill: ledgerProgress(steps) };
      }),
    [videos, scheduled, history, project]
  );

  const selected = cuts.find((c) => c.video.id === selectedId);

  const step = (delta: number) => {
    if (!cuts.length) return;
    const at = cuts.findIndex((c) => c.video.id === selectedId);
    const next = at === -1 ? (delta > 0 ? 0 : cuts.length - 1) : Math.min(cuts.length - 1, Math.max(0, at + delta));
    onSelect(cuts[next].video.id);
    // Keep the newly lit cut inside the strip rather than scrolling off its end.
    requestAnimationFrame(() => {
      stripRef.current?.querySelector(`[data-cut="${cuts[next].video.id}"]`)?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'smooth',
      });
    });
  };

  return (
    <div className="shrink-0 border-b border-line bg-surface/80">
      <div className="flex items-center gap-3 px-3 pt-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">On the bench</span>
        <span className="h-px flex-1 bg-line" />
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
          >
            clear
          </button>
        )}
      </div>

      <div
        ref={stripRef}
        role="listbox"
        aria-label="Cuts on the bench"
        aria-orientation="horizontal"
        tabIndex={0}
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
        className="kt-railstrip flex items-stretch gap-2 overflow-x-auto px-3 pb-3 pt-2 kt-focus"
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={intakeBusy}
          className="grid w-[92px] shrink-0 place-items-center rounded-[6px] border border-dashed border-line-strong bg-surface-2/40 text-ink-dim transition-colors hover:border-primary hover:text-primary disabled:opacity-50 kt-focus"
          aria-label="Intake raw footage"
        >
          <span className="flex flex-col items-center gap-1 py-6">
            <Icon name={intakeBusy ? 'hourglass_top' : 'file_upload'} size={18} className={intakeBusy ? 'kt-spin' : 'kt-grow'} />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em]">{intakeBusy ? 'loading' : 'intake'}</span>
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

        {cuts.length === 0 && (
          <p className="flex items-center py-6 pl-2 text-[12px] text-ink-dim">
            Nothing on the bench yet — intake raw footage to start a cut.
          </p>
        )}

        {cuts.map(({ video, steps, fill }) => (
          <CutTile
            key={video.id}
            video={video}
            steps={steps}
            fill={fill}
            selected={video.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        {cuts.length > 0 && (
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
    </div>
  );
}

function CutTile({
  video,
  steps,
  fill,
  selected,
  onSelect,
}: {
  video: Video;
  steps: ReturnType<typeof buildLedger>;
  fill: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      data-cut={video.id}
      data-selected={selected}
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(selected ? null : video.id)}
      style={{ ['--kt-fill' as string]: fill.toFixed(2) }}
      title={`${video.title} — ${steps.map((s) => `${s.label}: ${s.detail}`).join(' · ')}`}
      className={`kt-cut-tile group w-[92px] shrink-0 overflow-hidden rounded-[6px] border bg-surface-2/50 p-1.5 text-left kt-focus ${
        selected ? 'border-primary' : 'border-line'
      }`}
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-[4px] bg-surface-3">
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
    </button>
  );
}
