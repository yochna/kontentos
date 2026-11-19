import { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';
import { PHASES, STATION_BY_ID, UTILITY_STATIONS, type StationId } from '@/lib/bench';
import { useWorkspaceStatus } from '@/lib/workspace';
import type { DbStatus } from '@/lib/types';
import type { Theme } from '@/lib/theme';

/** Shown in the dock so a stale dev server can be spotted without guessing. */
const BUILD_TAG = '57799b2';

export interface BenchJob {
  id: string;
  label: string;
  pct: number;
}

/**
 * The dock is where the bench admits what is actually happening: an intake that is still
 * uploading, where the workspace is really stored, and whether the API is answering.
 */
export function Dock({
  jobs,
  notice,
  online,
  dbStatus,
  station,
  onStation,
  onOpenDeck,
  inspectorOpen,
  onToggleInspector,
  onTour,
  theme,
  onToggleTheme,
  selectedTitle,
}: {
  jobs: BenchJob[];
  notice: string | null;
  online: boolean;
  dbStatus: DbStatus | null;
  station: StationId;
  onStation: (id: StationId) => void;
  onOpenDeck: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  onTour: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  selectedTitle: string | null;
}) {
  const running = jobs[0];
  // Eleven keys do not fit across a phone: the five that start and ship a cut stay in the row, and
  // the rest sit behind "More", which also names the station you are on when it is one of them.
  const [moreOpen, setMoreOpen] = useState(false);
  // Closed whenever the station changes, however the creator got there (a key, the command deck, a
  // link on a card), and on Escape.
  useEffect(() => setMoreOpen(false), [station]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);
  const allStations = [...PHASES.flatMap((p) => p.stations), ...UTILITY_STATIONS];
  const primaryIds: StationId[] = ['ideas', 'raw-reel', 'press', 'smart-editor', 'publish-schedule'];
  const primary = allStations.filter((s) => primaryIds.includes(s.id));
  const overflow = allStations.filter((s) => !primaryIds.includes(s.id));
  const inOverflow = overflow.find((s) => s.id === station) ?? null;
  // The desk's own state, because "workspace · atlas" is only true once the save landed.
  const desk = useWorkspaceStatus();

  return (
    <footer className="shrink-0 border-t border-line bg-surface">
      {/* Below lg the spine is gone, so the station keys become the dock's middle row. */}
      <div data-tour="dock-stations" className="relative border-b border-line px-2 py-1.5 lg:hidden">
        <div className="flex gap-1.5">
          {primary.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onStation(s.id);
              }}
              className={`kt-focus min-w-0 flex-1 rounded-[4px] border px-1 py-1.5 font-body text-[12px] transition-colors ${
                station === s.id ? 'border-primary bg-primary-soft font-semibold text-ink' : 'border-line font-medium text-ink-dim hover:text-ink-muted'
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((was) => !was)}
            aria-expanded={moreOpen}
            aria-label="More stations"
            className={`kt-focus flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-[4px] border px-1 py-1.5 font-body text-[12px] transition-colors ${
              inOverflow || moreOpen ? 'border-primary bg-primary-soft font-semibold text-ink' : 'border-line font-medium text-ink-dim hover:text-ink-muted'
            }`}
          >
            <span className="truncate">{inOverflow ? inOverflow.label : 'More'}</span>
            <Icon name={moreOpen ? 'expand_more' : 'expand_less'} size={14} />
          </button>
        </div>

        {moreOpen && (
          <div className="absolute inset-x-2 bottom-full z-20 mb-1 grid grid-cols-3 gap-1.5 rounded-card border border-line bg-surface p-2 shadow-[var(--shadow-2)]">
            {overflow.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onStation(s.id);
                }}
                className={`kt-focus flex items-center justify-center gap-1.5 rounded-[4px] border px-2 py-2 font-body text-[12px] transition-colors ${
                  station === s.id ? 'border-primary bg-primary-soft font-semibold text-ink' : 'border-line font-medium text-ink-muted hover:text-ink'
                }`}
              >
                <Icon name={s.icon} size={14} />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex h-[38px] items-center gap-3 px-3">
        <button
          type="button"
          onClick={onOpenDeck}
          className="kt-focus flex items-center gap-2 rounded-[5px] border border-line bg-surface-2/60 px-2 py-1 text-ink-dim transition-colors hover:border-line-strong hover:text-ink-muted"
          aria-label="Open the command deck"
        >
          <Icon name="search" size={14} />
          <span className="kt-eyebrow hidden sm:inline">command</span>
          <kbd className="rounded-[3px] border border-line-strong px-1 font-mono text-[11px] text-ink-muted">⌘K</kbd>
        </button>

        <span className="h-4 w-px bg-line" />

        {running ? (
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="upload" size={14} className="kt-spin shrink-0 text-primary" />
            <span className="truncate font-mono text-[11px] text-ink-muted">{running.label}</span>
            <span className="h-[3px] w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(2, running.pct)}%` }}
              />
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-dim">{Math.round(running.pct)}%</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                notice || desk.state === 'unsaved' ? 'bg-danger' : online ? 'bg-success' : 'kt-led--now bg-danger'
              }`}
            />
            <span className={`truncate font-mono text-[11px] ${notice || desk.state === 'unsaved' ? 'text-danger' : 'text-ink-muted'}`}>
              {notice
                ? notice
                : desk.state === 'unsaved'
                  ? `desk not saved · ${desk.message}`
                  : `${online ? (dbStatus?.provider === 'mongodb' ? 'workspace · atlas' : 'workspace · local disk') : 'api offline'}${
                      desk.state === 'saving' ? ' · saving' : ''
                    }${selectedTitle ? ` · lit: ${selectedTitle}` : ''}`}
            </span>
          </span>
        )}

        <span className="flex-1" />

        <span className="shrink-0 font-mono text-[10px] text-ink-dim" title="Running build">
          build {BUILD_TAG}
        </span>

        <button
          type="button"
          onClick={onTour}
          aria-label="Take the tour"
          className="kt-focus grid h-6 w-6 place-items-center rounded-[5px] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Icon name="help" size={16} />
        </button>

        <button
          type="button"
          onClick={onToggleInspector}
          aria-pressed={inspectorOpen}
          aria-label={inspectorOpen ? 'Hide the details panel' : 'Show the details panel'}
          className="kt-focus hidden h-6 w-6 place-items-center rounded-[5px] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink xl:grid"
        >
          <Icon name={inspectorOpen ? 'right_panel_close' : 'right_panel_open'} size={16} />
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to daylight' : 'Switch to the dark room'}
          className="kt-focus grid h-6 w-6 place-items-center rounded-[5px] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={15} />
        </button>
      </div>
    </footer>
  );
}
