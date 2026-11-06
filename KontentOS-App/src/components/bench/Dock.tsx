import { Icon } from '@/lib/icons';
import { PHASES, STATION_BY_ID, UTILITY_STATIONS, type StationId } from '@/lib/bench';
import type { DbStatus } from '@/lib/types';
import type { Theme } from '@/lib/theme';

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
  theme: Theme;
  onToggleTheme: () => void;
  selectedTitle: string | null;
}) {
  const running = jobs[0];

  return (
    <footer className="shrink-0 border-t border-line bg-surface">
      {/* Below lg the spine is gone, so the station keys become the dock's middle row. */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-line px-2 py-1.5 lg:hidden">
        {[...PHASES.flatMap((p) => p.stations), ...UTILITY_STATIONS].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStation(s.id)}
            className={`kt-focus shrink-0 rounded-[4px] border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
              station === s.id ? 'border-primary bg-primary-soft text-ink' : 'border-line text-ink-dim hover:text-ink-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex h-[38px] items-center gap-3 px-3">
        <button
          type="button"
          onClick={onOpenDeck}
          className="kt-focus flex items-center gap-2 rounded-[5px] border border-line bg-surface-2/60 px-2 py-1 text-ink-dim transition-colors hover:border-line-strong hover:text-ink-muted"
          aria-label="Open the command deck"
        >
          <Icon name="search" size={14} />
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.12em] sm:inline">command</span>
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
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${notice ? 'bg-danger' : online ? 'bg-success' : 'kt-led--now bg-danger'}`} />
            <span className={`truncate font-mono text-[11px] ${notice ? 'text-danger' : 'text-ink-muted'}`}>
              {notice
                ? notice
                : `${online ? (dbStatus?.provider === 'mongodb' ? 'workspace · atlas' : 'workspace · local disk') : 'api offline'}${
                    selectedTitle ? ` · lit: ${selectedTitle}` : ''
                  }`}
            </span>
          </span>
        )}

        <span className="flex-1" />

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
