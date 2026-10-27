import { Icon } from '@/lib/icons';
import { NAV_GROUPS, UTILITY_ITEMS, type ScreenId } from '@/lib/nav';
import { useDisplayProfile } from '@/lib/store';

export function Sidebar({
  active,
  onNavigate,
  mobileOpen,
  onCloseMobile,
}: {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const go = (id: ScreenId) => {
    onNavigate(id);
    onCloseMobile();
  };

  const profile = useDisplayProfile();

  return (
    <>
      {/* mobile scrim */}
      <div
        onClick={onCloseMobile}
        className={`fixed inset-0 z-40 bg-[var(--scrim)] lg:hidden transition-opacity ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        className={`fixed lg:sticky top-0 z-50 lg:z-20 h-screen w-[248px] shrink-0 flex flex-col
          bg-surface border-r border-line transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand */}
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-line shrink-0">
          <span className="grid place-items-center w-8 h-8 rounded-btn bg-primary text-on-primary shadow-[var(--shadow-1)]">
            <Icon name="bolt" size={18} fill={1} />
          </span>
          <div className="leading-none">
            <div className="font-display text-[19px] text-ink">KontentOS</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-dim mt-0.5">
              Editorial Studio
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onCloseMobile}
            className="ml-auto grid place-items-center w-8 h-8 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 kt-focus lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-none px-3 py-4 space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-3 pb-2 kt-eyebrow">{group.title}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavButton key={item.id} item={item} active={active === item.id} onClick={() => go(item.id)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Utilities */}
        <div className="px-3 py-3 border-t border-line space-y-0.5">
          {UTILITY_ITEMS.map((item) => (
            <NavButton key={item.id} item={item} active={active === item.id} onClick={() => go(item.id)} />
          ))}
        </div>

        {/* User */}
        <button
          onClick={() => go('settings')}
          className="m-3 mt-1 flex items-center gap-3 rounded-card px-3 py-2.5 hover:bg-surface-2 transition-colors kt-focus text-left"
        >
          <span className="grid place-items-center w-9 h-9 rounded-full text-on-primary font-semibold" style={{ background: 'var(--primary)' }}>
            {profile.initials}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold text-ink truncate">{profile.name}</div>
            <div className="text-xs text-ink-dim truncate">{profile.handle}</div>
          </div>
        </button>
      </aside>
    </>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { id: ScreenId; label: string; icon: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={`group relative flex items-center gap-3 w-full rounded-btn px-3 py-2 text-sm font-medium transition-all kt-focus ${
        active
          ? 'bg-primary-soft text-primary shadow-[inset_0_0_0_1px_var(--line-strong)]'
          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />}
      <Icon name={item.icon} size={19} fill={active ? 1 : 0} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}
