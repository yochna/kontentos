import { Icon } from '@/lib/icons';
import { PHASES, STATION_BY_ID, UTILITY_STATIONS, type StationId } from '@/lib/bench';
import { useDisplayProfile } from '@/lib/store';

/**
 * The spine is not a menu of pages — it is the row of machines on the bench, ordered by what
 * they do to the cut. Utility keys sit apart at the bottom because they tune the room.
 */
export function Spine({
  station,
  onStation,
}: {
  station: StationId;
  onStation: (id: StationId) => void;
}) {
  const profile = useDisplayProfile();

  return (
    <aside className="hidden w-[84px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-[52px] items-center justify-center border-b border-line">
        <span className="kt-grow grid h-7 w-7 place-items-center rounded-[4px] bg-primary font-display text-[13px] font-bold text-on-primary">
          K
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Bench stations">
        {PHASES.map((phase) => (
          <div key={phase.id} className="mb-1">
            <div className="pb-1 pt-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">
              {phase.label}
            </div>
            {phase.stations.map((s) => (
              <StationKey key={s.id} id={s.id} active={station === s.id} onStation={onStation} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-line py-2">
        {UTILITY_STATIONS.map((s) => (
          <StationKey key={s.id} id={s.id} active={station === s.id} onStation={onStation} />
        ))}
        <button
          type="button"
          onClick={() => onStation('settings')}
          title={profile.name}
          aria-label={`Room settings for ${profile.name}`}
          className="mt-1 grid h-9 w-full place-items-center kt-focus"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full border border-line-strong bg-surface-3 font-display text-[12px] font-bold text-ink-muted">
            {profile.initials || '·'}
          </span>
        </button>
      </div>
    </aside>
  );
}

function StationKey({
  id,
  active,
  onStation,
}: {
  id: StationId;
  active: boolean;
  onStation: (id: StationId) => void;
}) {
  const meta = STATION_BY_ID[id];
  return (
    <button
      type="button"
      onClick={() => onStation(id)}
      data-active={active}
      title={`${meta.label} — ${meta.hint}`}
      aria-current={active ? 'page' : undefined}
      className={`kt-key flex h-[54px] w-full flex-col items-center justify-center gap-1 pl-[2px] kt-focus ${
        active ? 'bg-surface-2 text-ink' : 'text-ink-dim hover:bg-surface-2/60 hover:text-ink-muted'
      }`}
    >
      <Icon name={meta.icon} size={19} weight={active ? 600 : 400} fill={active ? 1 : 0} />
      <span className="font-mono text-[9px] uppercase tracking-[0.12em]">{meta.label}</span>
    </button>
  );
}
