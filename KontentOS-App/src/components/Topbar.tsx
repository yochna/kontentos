import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '@/lib/icons';
import { navigate, SCREEN_TITLES, type ScreenId } from '@/lib/nav';
import type { Theme } from '@/lib/theme';
import { IconButton } from '@/components/ui';
import { useDisplayProfile, useStore } from '@/lib/store';

interface Hit {
  key: string;
  kind: 'Idea' | 'Clip' | 'Scheduled' | 'Published';
  icon: string;
  title: string;
  meta: string;
  screen: ScreenId;
  payload?: Record<string, string>;
}

const MAX_HITS = 8;

/** Search covers the signed-in account's own rows only — never a placeholder result. */
function useHits(query: string): Hit[] {
  const { savedIdeas, videos, scheduled, history } = useStore();
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const titleOf = (videoId: string) => videos.find((v) => v.id === videoId)?.title ?? 'Untitled clip';
    const out: Hit[] = [];

    for (const i of savedIdeas) {
      if (`${i.title} ${i.excerpt} ${i.category}`.toLowerCase().includes(q)) {
        out.push({ key: `idea-${i.id}`, kind: 'Idea', icon: 'lightbulb', title: i.title, meta: i.category, screen: 'ideas' });
      }
    }
    for (const v of videos) {
      if (`${v.title} ${v.description ?? ''} ${v.file_name ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          key: `clip-${v.id}`,
          kind: 'Clip',
          icon: 'movie',
          title: v.title,
          meta: v.status,
          screen: 'content-library',
          payload: { searchQuery: v.title },
        });
      }
    }
    for (const s of scheduled) {
      const label = s.video_title || titleOf(s.video_id);
      if (`${label} ${s.caption_text} ${s.platform}`.toLowerCase().includes(q)) {
        out.push({
          key: `sched-${s.id}`,
          kind: 'Scheduled',
          icon: 'schedule',
          title: label,
          meta: `${s.platform} · ${new Date(s.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
          screen: 'publish-schedule',
        });
      }
    }
    for (const h of history) {
      const label = titleOf(h.video_id);
      if (`${label} ${h.platform} ${h.status}`.toLowerCase().includes(q)) {
        out.push({
          key: `hist-${h.id}`,
          kind: 'Published',
          icon: 'cloud_done',
          title: label,
          meta: `${h.platform} · ${new Date(h.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
          screen: 'analytics',
        });
      }
    }
    return out.slice(0, MAX_HITS);
  }, [query, savedIdeas, videos, scheduled, history]);
}

export function Topbar({
  screen,
  theme,
  onToggleTheme,
  onOpenMobile,
}: {
  screen: ScreenId;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenMobile: () => void;
}) {
  const profile = useDisplayProfile();
  const { online, savedIdeas, videos, scheduled, history } = useStore();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useHits(query);
  const pool = savedIdeas.length + videos.length + scheduled.length + history.length;

  // How far down the current screen the creator has read. Long screens (Analytics,
  // Command Center) scroll the window, so the header carries the progress hairline.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const next = max > 60 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // Bail out below half a percent so a fast scroll does not re-render the header per pixel.
      setProgress((p) => (Math.abs(p - next) < 0.005 ? p : next));
    };
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => setActive(0), [query]);

  // The search field is only laid out at ≥768px; below that it has to be expanded first,
  // so focus is requested through a ref and applied after the expanding render.
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (pendingFocus.current && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      pendingFocus.current = false;
    }
  });

  function focusSearch() {
    setOpen(true);
    if (window.matchMedia('(min-width: 768px)').matches) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    pendingFocus.current = true;
    setExpanded(true);
  }

  // ⌘K (Ctrl+K on Windows/Linux) jumps into search from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    navigate(hit.screen, hit.payload);
    setOpen(false);
    setExpanded(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setExpanded(false);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (hits.length ? (i + 1) % hits.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[active]);
    }
  }

  return (
    <header className="relative sticky top-0 z-30 h-16 shrink-0 flex items-center gap-3 px-4 sm:px-6 bg-app/85 backdrop-blur-md border-b border-line">
      <span
        aria-hidden
        className="absolute left-0 bottom-0 h-[2px] bg-primary/70 transition-[width] duration-200 ease-out"
        style={{ width: `${(progress * 100).toFixed(1)}%`, opacity: progress > 0.01 ? 1 : 0 }}
      />

      <IconButton name="menu" label="Open navigation" className="lg:hidden" onClick={onOpenMobile} />

      {/* Keyed by screen: the title slides in on every navigation, matching the page body. */}
      <div key={screen} className="min-w-0 kt-hero-in">
        <div className="kt-eyebrow hidden sm:block">Workspace</div>
        <div className="font-display text-[18px] leading-tight text-ink truncate">
          {SCREEN_TITLES[screen]}
        </div>
      </div>

      <div className="flex-1" />

      {/* Search — inline from md up, dropped below the header on small screens. */}
      <div
        ref={boxRef}
        className={`relative ${
          expanded
            ? 'block max-md:absolute max-md:left-4 max-md:right-4 max-md:top-[64px] max-md:z-40'
            : 'hidden md:block'
        }`}
      >
        <div className="flex items-center gap-2 h-10 px-3 rounded-btn bg-surface border border-line shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 transition-all max-md:w-full md:w-[240px] lg:w-[320px]">
          <Icon name="search" size={18} className="text-ink-dim shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            aria-label="Search workspace"
            placeholder="Search ideas, clips, reels…"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onInputKey}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-ink-dim"
          />
          <kbd className="hidden lg:inline text-[10px] text-ink-dim border border-line rounded px-1.5 py-0.5 shrink-0">⌘K</kbd>
        </div>

        {open && query.trim().length >= 2 && (
          <div
            role="listbox"
            aria-label="Search results"
            className="animate-scale-up absolute right-0 top-[calc(100%+6px)] w-[360px] max-md:w-full max-h-[min(60vh,420px)] overflow-y-auto rounded-card border border-line bg-surface shadow-[var(--shadow-2)] p-1.5"
          >
            {hits.length === 0 ? (
              <p className="px-3 py-4 text-[13px] text-ink-muted">Nothing in your workspace matches “{query.trim()}”.</p>
            ) : (
              hits.map((h, i) => (
                <button
                  key={h.key}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-btn kt-focus transition-colors ${
                    i === active ? 'bg-primary-soft' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="grid place-items-center w-8 h-8 rounded-btn bg-surface-2 text-primary shrink-0">
                    <Icon name={h.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink truncate">{h.title}</span>
                    <span className="block text-[11.5px] text-ink-dim truncate">
                      {h.kind} · {h.meta}
                    </span>
                  </span>
                  <Icon name="arrow_forward" size={15} className="kt-nudge shrink-0 text-ink-dim" />
                </button>
              ))
            )}
            <p className="px-3 pt-2 pb-1 text-[11px] text-ink-dim border-t border-line mt-1">
              Choosing a result opens the screen that holds it · {pool} item{pool === 1 ? '' : 's'} in this workspace
            </p>
          </div>
        )}
      </div>

      {/* Small screens get the search as a drop-down row under the header. */}
      <IconButton
        name={expanded ? 'close' : 'search'}
        label={expanded ? 'Close search' : 'Search'}
        className="md:hidden"
        onClick={() => {
          if (expanded) {
            setExpanded(false);
            setOpen(false);
            setQuery('');
          } else {
            focusSearch();
          }
        }}
      />

      <div className="h-6 w-px bg-line mx-1 hidden sm:block" />

      <IconButton
        key={theme}
        name={theme === 'light' ? 'dark_mode' : 'light_mode'}
        label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        // Remounted per theme so the incoming icon plays the swap animation.
        className="kt-icon-swap"
        onClick={onToggleTheme}
      />

      <button
        type="button"
        aria-label="Open profile"
        title={profile.name}
        className="ml-1 grid place-items-center w-9 h-9 rounded-full text-on-primary text-sm font-semibold kt-focus ring-offset-2 ring-offset-app"
        style={{ background: 'var(--primary)' }}
      >
        {profile.initials}
      </button>

      <span
        title={online ? 'Backend connected (isolated data store)' : 'Backend offline — running on cached data'}
        className={`hidden xl:flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border ${
          online ? 'text-success border-success/30 bg-success/5' : 'text-ink-dim border-line bg-surface-2'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-success kt-live' : 'bg-ink-dim'}`} />
        {online ? 'API live' : 'API offline'}
      </span>
    </header>
  );
}
