import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '@/lib/icons';
import { PHASES, UTILITY_STATIONS, selectCut, type StationId } from '@/lib/bench';
import { useHits, type Hit } from '@/lib/search';
import { useDismiss } from '@/components/ui';
import type { Theme } from '@/lib/theme';

interface Command {
  key: string;
  label: string;
  detail: string;
  icon: string;
  run: () => void;
}

/**
 * The deck is the bench's other half: everything a page-dwelling button used to hide is
 * reachable by name, without hunting for which station it lives in.
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
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useDismiss(open ? onClose : undefined);

  const hits = useHits(query);

  const commands = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const all: Command[] = [
      ...PHASES.flatMap((p) =>
        p.stations.map((s) => ({
          key: `go-${s.id}`,
          label: s.label,
          detail: `${p.label} · ${s.hint}`,
          icon: s.icon,
          run: () => onStation(s.id),
        }))
      ),
      ...UTILITY_STATIONS.map((s) => ({
        key: `go-${s.id}`,
        label: s.label,
        detail: `Room · ${s.hint}`,
        icon: s.icon,
        run: () => onStation(s.id),
      })),
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
    ];
    if (!q) return all.slice(0, 9);
    return all.filter((c) => `${c.label} ${c.detail}`.toLowerCase().includes(q)).slice(0, 6);
  }, [query, theme, onStation, onIntake, onToggleTheme, onSignOut]);

  const rows = useMemo(() => {
    const fromHits: Command[] = hits.map((h: Hit) => ({
      key: h.key,
      label: h.title,
      detail: h.meta,
      icon: h.icon,
      run: () => {
        if (h.videoId) selectCut(h.videoId);
        onStation(h.station);
      },
    }));
    return [...fromHits, ...commands];
  }, [hits, commands, onStation]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    // Focus on the frame the dialog exists in, not the one that requested it.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const pick = (cmd: Command) => {
    cmd.run();
    onClose();
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = rows[active];
      if (cmd) pick(cmd);
    } else if (e.key === 'Tab') {
      // Keep the trap honest: two cells (input + list) cycle between each other.
      e.preventDefault();
      (e.shiftKey ? inputRef : listRef).current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command deck">
      <button type="button" aria-label="Close the command deck" onClick={onClose} className="kt-scrim absolute inset-0 cursor-default bg-[var(--scrim)]" />
      <div ref={listRef} tabIndex={-1} onKeyDown={onKey} className="kt-dialog kt-focus relative w-full max-w-[560px] overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-2)]">
        <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
          <Icon name="search" size={17} className="shrink-0 text-ink-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cuts, seeds, stations…"
            aria-label="Search the workspace"
            className="min-w-0 flex-1 bg-transparent py-1 text-[14px] text-ink outline-none placeholder:text-ink-dim"
          />
          <kbd className="shrink-0 rounded-[3px] border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">esc</kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-1.5" role="group" aria-label="Deck results">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-ink-dim">
              Nothing named “{query}” in this workspace.
            </p>
          )}
          {rows.map((c, i) => (
            <button
              key={c.key}
              type="button"
              aria-current={i === active ? 'true' : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
              className={`kt-focus flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-left transition-colors ${
                i === active ? 'bg-primary-soft' : 'hover:bg-surface-2'
              }`}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] bg-surface-3 text-ink-muted">
                <Icon name={c.icon} size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{c.label}</span>
                <span className="block truncate font-mono text-[10.5px] text-ink-dim">{c.detail}</span>
              </span>
              {i === active && <Icon name="keyboard_return" size={14} className="shrink-0 text-ink-dim" />}
            </button>
          ))}
        </div>

        {/* Legend: the deck is the bench's only keyboard-first surface, so say what the keys do
            instead of leaving them to be discovered. */}
        <footer className="flex items-center gap-3 border-t border-line px-3.5 py-2">
          {[
            ['↑↓', 'move'],
            ['⏎', 'open'],
            ['esc', 'close'],
            ['⌘K', 'toggle'],
          ].map(([k, what]) => (
            <span key={k} className="flex items-center gap-1.5">
              <kbd className="rounded-[3px] border border-line-strong px-1 py-px font-mono text-[9.5px] text-ink-muted">
                {k}
              </kbd>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dim">{what}</span>
            </span>
          ))}
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dim">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          </span>
        </footer>
      </div>
    </div>
  );
}
