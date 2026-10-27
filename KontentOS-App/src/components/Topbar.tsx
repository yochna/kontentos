import { Icon } from '@/lib/icons';
import { SCREEN_TITLES, type ScreenId } from '@/lib/nav';
import type { Theme } from '@/lib/theme';
import { IconButton } from '@/components/ui';
import { useDisplayProfile, useStore } from '@/lib/store';

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
  const { online } = useStore();
  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 flex items-center gap-3 px-4 sm:px-6 bg-app/85 backdrop-blur-md border-b border-line">
      <IconButton name="menu" label="Open navigation" className="lg:hidden" onClick={onOpenMobile} />

      <div className="min-w-0">
        <div className="kt-eyebrow hidden sm:block">Workspace</div>
        <div className="font-display text-[18px] leading-tight text-ink truncate">
          {SCREEN_TITLES[screen]}
        </div>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <label className="hidden md:flex items-center gap-2 w-[240px] lg:w-[320px] h-10 px-3 rounded-btn bg-surface border border-line shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
        <Icon name="search" size={18} className="text-ink-dim" />
        <input
          type="search"
          aria-label="Search workspace"
          placeholder="Search ideas, clips, reels…"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-ink-dim"
        />
        <kbd className="hidden lg:inline text-[10px] text-ink-dim border border-line rounded px-1.5 py-0.5">⌘K</kbd>
      </label>

      <IconButton name="search" label="Search" className="md:hidden" />

      <div className="h-6 w-px bg-line mx-1 hidden sm:block" />

      <div className="relative">
        <IconButton name="notifications" label="Notifications" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-tertiary ring-2 ring-app" />
      </div>

      <IconButton
        name={theme === 'light' ? 'dark_mode' : 'light_mode'}
        label="Toggle theme"
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
        <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-success' : 'bg-ink-dim'}`} />
        {online ? 'API live' : 'API offline'}
      </span>
    </header>
  );
}
