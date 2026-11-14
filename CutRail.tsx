import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import {
  DropdownMenu,
  DropdownMenuAnchor,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui';
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
  onOpenIn: (station: StationId, videoId: string) => void;
  onDeleteCut: (video: Video) => Promise<boolean>;
}

type Filter = 'all' | LedgerStage;

const RAIL_OPEN_KEY = 'kt.rail.open';

/** The stations that actually work on one cut, in the order the bench does. */
const OPEN_IN: { station: StationId; label: string; icon: string }[] = [
  { station: 'raw-reel', label: 'Open in Intake', icon: 'smart_display' },
  { station: 'press', label: 'Open in Press', icon: 'print' },
  { station: 'smart-editor', label: 'Open in Bench', icon: 'content_cut' },
  { station: 'static-generator', label: 'Open in Card', icon: 'photo_size_select_actual' },
  { station: 'publish-schedule', label: 'Open in Ship', icon: 'schedule_send' },
];

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
  onOpenIn,
  onDeleteCut,
}: RailProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // A right-click lights the cut it landed on and asks what to do with it, at the pointer.
  const [menu, setMenu] = useState<{ video: Video; x: number; y: number } | null>(null);
  const [confirming, setConfirming] = useState<Video | null>(null);
  // The full strip of tiles is a quarter of the screen on every station, and most of the time the
  // creator only needs to know which cut is lit. So it rests as one slim row and opens on request;
  // the choice is remembered on this browser.
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleOpen = () =>
    setOpen((was) => {
      const next = !was;
      try {
        localStorage.setItem(RAIL_OPEN_KEY, next ? '1' : '0');
      } catch {
        // A browser that will not store it just starts slim again next time.
      }
      return next;
    });

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

  const expanded = open && cuts.length > 0;

  return (
    <div className="shrink-0 border-b border-line bg-surface/80">
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

      {!expanded && (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="hidden shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim sm:block">
            On the bench
          </span>

          {cuts.length === 0 ? (
            <>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">
                {intakeBusy ? 'Intaking the footage…' : 'Nothing on the bench yet. Drop a video anywhere, or choose one.'}
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={intakeBusy ? 'hourglass_top' : 'file_upload'}
                iconSpin={intakeBusy}
                disabled={intakeBusy}
                onClick={() => fileRef.current?.click()}
              >
                {intakeBusy ? 'Working…' : 'Intake a clip'}
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous cut"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-btn text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
              >
                <Icon name="chevron_left" size={18} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next cut"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-btn text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
              >
                <Icon name="chevron_right" size={18} />
              </button>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px]">
                {selected ? (
                  <>
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span className="truncate font-semibold text-ink">{selected.video.title}</span>
                    {selected.stage && (
                      <span className="hidden shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim sm:block">
                        {selected.stage}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="truncate text-ink-muted">No cut lit. Pick one with the arrows, or open the bench.</span>
                )}
              </span>
              <span className="hidden shrink-0 font-mono text-[11px] text-ink-dim sm:block">
                {cuts.length} {cuts.length === 1 ? 'cut' : 'cuts'}
              </span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={intakeBusy}
                aria-label="Intake raw footage"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-btn text-ink-dim transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-50 kt-focus"
              >
                <Icon name={intakeBusy ? 'hourglass_top' : 'file_upload'} size={17} className={intakeBusy ? 'kt-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={onOpenVault}
                aria-label="Open the vault"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-btn text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
              >
                <Icon name="grid_view" size={17} />
              </button>
              <button
                type="button"
                onClick={toggleOpen}
                aria-expanded={false}
                aria-label="Show all cuts"
                className="flex shrink-0 items-center gap-1 rounded-btn px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
              >
                all cuts
                <Icon name="expand_more" size={16} />
              </button>
            </>
          )}
        </div>
      )}

      {expanded && (
        <>
      <div className="flex items-center gap-3 px-3 pt-2">
        <span className="hidden shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim sm:block">
          On the bench
        </span>
        <ToggleGroup
          variant="none"
          value={filter}
          onValueChange={(v) => setFilter((v || 'all') as Filter)}
          aria-label="Filter the bench by ledger stage"
          className="kt-chipstrip flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          <Chip label="all" count={cuts.length} value="all" />
          {LEDGER_STAGES.map((stage) => (
            <Chip key={stage} label={stage} count={counts.get(stage) ?? 0} value={stage} />
          ))}
        </ToggleGroup>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
          >
            clear
          </button>
        )}
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded
          aria-label="Hide the cut strip"
          className="flex shrink-0 items-center gap-1 rounded-btn px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink kt-focus"
        >
          hide
          <Icon name="expand_less" size={16} />
        </button>
      </div>


      {(
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
              <span className="font-mono text-[11px] uppercase tracking-[0.1em]">
                {intakeBusy ? 'loading' : 'intake'}
              </span>
            </span>
          </button>

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
              onMenu={(x, y) => {
                onSelect(video.id);
                setMenu({ video, x, y });
              }}
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
              <span className="font-mono text-[11px] uppercase tracking-[0.1em]">vault</span>
            </button>
          )}
        </div>
      )}
        </>
      )}

      {expanded && visible.length === 0 && (
        <p className="px-3 pb-3 text-[12px] text-ink-dim">
          No cut sits at “{filter}” yet — those four lights only turn on when a row proves the step.
        </p>
      )}

      <DropdownMenu open={!!menu} onOpenChange={(open) => !open && setMenu(null)}>
        {menu && <DropdownMenuAnchor x={menu.x} y={menu.y} />}
        <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="min-w-[13rem]">
          <DropdownMenuLabel>{menu?.video.title ?? 'This cut'}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {OPEN_IN.map((o) => (
            <DropdownMenuItem
              key={o.station}
              disabled={o.station === station}
              onSelect={() => menu && onOpenIn(o.station, menu.video.id)}
            >
              <Icon name={o.icon} size={14} className="text-ink-dim" />
              {o.label}
              {o.station === station && <span className="ml-auto font-mono text-[11px] text-ink-dim">here</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            tone="danger"
            onSelect={() => {
              if (menu) setConfirming(menu.video);
              setMenu(null);
            }}
          >
            <Icon name="delete" size={14} />
            Delete from the bench
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{confirming?.title}” from the bench?</AlertDialogTitle>
          <AlertDialogDescription>
            The record, its transcript and its caption files go with it. A post you already marked as
            published keeps its record in the ledger.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="delete"
              disabled={!confirming}
              onClick={async () => {
                const target = confirming;
                if (!target) return;
                setConfirming(null);
                await onDeleteCut(target);
              }}
            >
              Delete the cut
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Chip({ label, count, value }: { label: string; count: number; value: string }) {
  return (
    <ToggleGroupItem
      variant="none"
      value={value}
      className="kt-focus group shrink-0 rounded-[4px] border border-line px-1.5 py-[3px] font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-line-strong hover:text-ink-muted data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary"
    >
      {label}
      <span className="ml-1 text-ink-muted group-data-[state=on]:text-primary">{count}</span>
    </ToggleGroupItem>
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
  onMenu,
}: {
  video: Video;
  steps: LedgerStep[];
  stage: LedgerStage | null;
  fill: number;
  index: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onMenu: (x: number, y: number) => void;
}) {
  const preview = (
    <div className="flex w-max max-w-[268px] gap-3">
      {/* The rail itself is a 92px contact print, which is why two uploads off the same phone never
          look different. The card is where the frame is actually big enough to read — and when the
          clip has no frame to show, saying so with an absent column beats an empty grey well. */}
      {video.thumbnail_url && (
        <div className="relative aspect-[9/16] w-[86px] shrink-0 overflow-hidden rounded-[4px] bg-surface-3">
          <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink">{video.title}</div>
        <dl className="mt-1 space-y-0.5">
          {steps.map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">{s.label}</dt>
              <dd className={s.state === 'next' ? 'min-w-0 truncate text-ink-dim' : 'min-w-0 truncate text-ink-muted'}>
                {s.detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );

  return (
    <HoverCard openDelay={220} closeDelay={90}>
      <HoverCardTrigger asChild>
        <button
        type="button"
        data-cut={video.id}
        data-selected={selected}
        aria-pressed={selected}
        aria-haspopup="menu"
        onClick={() => onSelect(selected ? null : video.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          // The keyboard's own right-click: Menu key, or Shift+F10 where a laptop has neither.
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.left + 12, r.bottom + 4);
          }
        }}
        style={{ ['--kt-fill' as string]: fill.toFixed(2), ['--kt-i' as string]: String(index) }}
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
          <span className="absolute bottom-1 left-1 rounded-[3px] bg-black/65 px-1 font-mono text-[11px] leading-tight text-white/90">
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
          <span className="mt-1 block truncate font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
            {stage}
          </span>
        )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-auto">
        {preview}
      </HoverCardContent>
    </HoverCard>
  );
}
