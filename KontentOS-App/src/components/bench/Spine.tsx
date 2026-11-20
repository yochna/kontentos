import { Icon } from '@/lib/icons';
import { Tooltip } from '@/components/ui/tooltip';
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
    <aside data-tour="spine" className="kt-spine hidden w-[96px] shrink-0 flex-col border-r border-line bg-surface/90 backdrop-blur-xl lg:flex">
      <div className="kt-brand-bay flex h-[72px] flex-col items-center justify-center gap-1.5 border-b border-line">
        <span className="kt-brand-mark font-display text-[15px] font-extrabold">K</span>
        <span className="font-display text-[9px] font-bold tracking-[0.16em] text-ink-dim">KONTENTOS</span>
      </div>

      <nav className="kt-spine-nav flex-1 overflow-y-auto py-2" aria-label="Bench stations">
        {PHASES.map((phase) => (
          <div key={phase.id} className="mb-1">
            <div
              className="kt-phase-label pb-1 pt-3 text-center"
              data-active={phase.stations.some((s) => s.id === station)}
              title={phase.note}
            >
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
        <Tooltip content={profile.name} side="right">
          <button
            type="button"
            onClick={() => onStation('settings')}
            aria-label={`Room settings for ${profile.name}`}
            className="kt-focus mt-1 grid h-10 w-full place-items-center rounded-btn transition-colors hover:bg-surface-2"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full border border-line-strong bg-surface-3 font-display text-[12px] font-bold text-ink-muted">
              {profile.initials || '·'}
            </span>
          </button>
        </Tooltip>
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
    <Tooltip
      content={
        <>
          <span className="font-semibold">{meta.label}</span>
          <span className="text-ink-muted"> — {meta.hint}</span>
        </>
      }
      side="right"
    >
      <button
        type="button"
        onClick={() => onStation(id)}
        data-active={active}
        aria-current={active ? 'page' : undefined}
        className={`kt-key kt-station-key flex h-[58px] w-full flex-col items-center justify-center gap-1.5 kt-focus ${
          active ? 'bg-surface-2 text-ink' : 'text-ink-dim hover:bg-surface-2/60 hover:text-ink-muted'
        }`}
      >
        <span className="kt-station-icon grid h-7 w-7 place-items-center">
          <Icon name={meta.icon} size={19} weight={active ? 600 : 400} fill={active ? 1 : 0} />
        </span>
        <span className={`font-body text-[13.5px] leading-none tracking-[-0.01em] ${active ? 'font-semibold text-primary' : 'font-medium'}`}>
          {meta.label}
        </span>
      </button>
    </Tooltip>
  );
}
