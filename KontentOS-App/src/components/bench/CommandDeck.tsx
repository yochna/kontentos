import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { PHASES, UTILITY_STATIONS, selectCut, type StationId } from '@/lib/bench';
import { useHits, type Hit } from '@/lib/search';
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import type { Theme } from '@/lib/theme';

interface Row {
  key: string;
  label: string;
  detail: string;
  icon: string;
  run: () => void;
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="shrink-0 rounded-[3px] border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
    {children}
  </kbd>
);

/**
 * The deck is the bench's other half: everything a page-dwelling button used to hide is reachable by
 * name, without hunting for which station it lives in. cmdk owns the listbox — arrow keys, the lit
 * row, keeping the selection in view — so the same keystrokes work under a screen reader and not
 * only under a sighted one.
 */
export function CommandDeck({
  open,
  onClose,
  onStation,
  theme,
  onToggleTheme,
  onIntake,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  onStation: (id: StationId) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onIntake: () => void;
  onSignOut: () => void;
}) {
  const [query, setQuery] = useState('');
  const hits = useHits(query);

  const go = (id: StationId) => () => onStation(id);

  const groups = useMemo(
    () => [
      ...PHASES.map((p) => ({
        id: p.id,
        heading: p.label,
        rows: p.stations.map<Row>((s) => ({
          key: `go-${s.id}`,
          label: s.label,
          detail: s.hint,
          icon: s.icon,
          run: go(s.id),
        })),
      })),
      {
        id: 'room',
        heading: 'Bench & room',
        rows: [
          { key: 'go-home', label: 'Desk', detail: 'The whole bench at once', icon: 'space_dashboard', run: go('home') },
          ...UTILITY_STATIONS.map<Row>((s) => ({
            key: `go-${s.id}`,
            label: s.label,
            detail: s.hint,
            icon: s.icon,
            run: go(s.id),
          })),
        ],
      },
      {
        id: 'act',
        heading: 'Actions',
        rows: [
          { key: 'act-intake', label: 'Intake footage', detail: 'Start a cut from a file', icon: 'file_upload', run: onIntake },
          { key: 'act-clear', label: 'Clear the bench', detail: 'Put the lit cut down', icon: 'highlight_off', run: () => selectCut(null) },
          {
            key: 'act-theme',
            label: theme === 'dark' ? 'Open the daylight' : 'Close into the dark room',
            detail: 'Switch the room lighting',
            icon: theme === 'dark' ? 'light_mode' : 'dark_mode',
            run: onToggleTheme,
          },
          { key: 'act-signout', label: 'Sign out', detail: 'End this session on the bench', icon: 'logout', run: onSignOut },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, onStation, onIntake, onToggleTheme, onSignOut],
  );

  const stationRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  /* Search covers the workspace's own rows plus the deck's commands. cmdk is told not to filter:
     useHits already searched the store, and a second scorer would hide rows the creator can see. */
  const q = query.trim().toLowerCase();
  const matched = q ? stationRows.filter((r) => `${r.label} ${r.detail}`.toLowerCase().includes(q)) : [];
  const hitRows = hits.map<Row>((h: Hit) => ({
    key: h.key,
    label: h.title,
    detail: `${h.kind.toLowerCase()} · ${h.meta}`,
    icon: h.icon,
    run: () => {
      if (h.videoId) selectCut(h.videoId);
      onStation(h.station);
    },
  }));
  const total = q ? hitRows.length + matched.length : stationRows.length;

  const close = () => {
    setQuery('');
    onClose();
  };

  const pick = (row: Row) => {
    row.run();
    close();
  };

  return (
    <CommandDialog open={open} onOpenChange={(next) => (next ? undefined : close())} title="Command deck">
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search cuts, seeds, stations…"
          aria-label="Search the workspace"
          trailing={<Kbd>esc</Kbd>}
        />
        <CommandList>
          {q && total === 0 ? (
            <p className="px-3 py-7 text-center text-[12.5px] text-ink-muted">
              Nothing named “{query}” in this workspace.
            </p>
          ) : q ? (
            <>
              {hitRows.length > 0 && (
                <CommandGroup heading="In this workspace">
                  {hitRows.map((r) => (
                    <DeckRow key={r.key} row={r} onPick={pick} />
                  ))}
                </CommandGroup>
              )}
              {matched.length > 0 && (
                <CommandGroup heading="Jump to">
                  {matched.map((r) => (
                    <DeckRow key={r.key} row={r} onPick={pick} />
                  ))}
                </CommandGroup>
              )}
            </>
          ) : (
            groups.map((g) => (
              <CommandGroup key={g.id} heading={g.heading}>
                {g.rows.map((r) => (
                  <DeckRow key={r.key} row={r} onPick={pick} />
                ))}
              </CommandGroup>
            ))
          )}
        </CommandList>

        {/* The deck is the bench's only keyboard-first surface, so the keys are named in words rather
            than in arrow glyphs a screen reader announces as "upwards arrow". */}
        <footer className="flex items-center gap-3 border-t border-line px-3.5 py-2">
          <CommandShortcut>
            <Kbd>arrows</Kbd> move
          </CommandShortcut>
          <CommandShortcut>
            <Kbd>enter</Kbd> open
          </CommandShortcut>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dim">
            {q ? `${total} matching` : `${total} in the deck`}
          </span>
        </footer>
      </Command>
    </CommandDialog>
  );
}

/** A row is an option, not a button: cmdk gives it `role="option"` and moves the selection itself. */
function DeckRow({ row, onPick }: { row: Row; onPick: (row: Row) => void }) {
  return (
    <CommandItem
      value={row.key}
      onSelect={() => onPick(row)}
      className="gap-2.5 py-2 data-[selected=true]:bg-primary-soft"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] bg-surface-3 text-ink-muted">
        <Icon name={row.icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{row.label}</span>
        <span className="block truncate font-mono text-[10.5px] text-ink-dim">{row.detail}</span>
      </span>
    </CommandItem>
  );
}
