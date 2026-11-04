import { Icon } from '@/lib/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { buildLedger, DRAFT_STEP_STATION, STATION_BY_ID, type StationId } from '@/lib/bench';
import type { ActiveDraft, PublishingRecord, ScheduledPost, Video } from '@/lib/types';
import type { TimelineProject } from '@/lib/timeline';
import { useDisplayProfile } from '@/lib/store';

interface InspectorProps {
  video: Video | null;
  scheduled: ScheduledPost[];
  history: PublishingRecord[];
  project: TimelineProject | null;
  savedIdeas: number;
  activeDraft: ActiveDraft | null;
  station: StationId;
  onJump: (station: StationId, payload?: unknown) => void;
}

/**
 * The inspector answers one question: where is this cut, and what is the next real move?
 * With nothing selected it becomes the day's board — the creator's own queued, shipped and
 * saved rows, counted from what exists. No invented metrics, no vanity numbers.
 */
export function Inspector({
  video,
  scheduled,
  history,
  project,
  savedIdeas,
  activeDraft,
  station,
  onJump,
}: InspectorProps) {
  const profile = useDisplayProfile();
  const meta = STATION_BY_ID[station];

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface xl:flex">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name={meta.icon} size={15} className="text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">{meta.label}</span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-ink-muted">{meta.hint}</p>
      </header>

      {video ? <Dossier video={video} scheduled={scheduled} history={history} project={project} onJump={onJump} /> : <DaysBoard scheduled={scheduled} history={history} savedIdeas={savedIdeas} activeDraft={activeDraft} onJump={onJump} name={profile.name} />}
    </aside>
  );
}

function Dossier({
  video,
  scheduled,
  history,
  project,
  onJump,
}: {
  video: Video;
  scheduled: ScheduledPost[];
  history: PublishingRecord[];
  project: TimelineProject | null;
  onJump: InspectorProps['onJump'];
}) {
  const steps = buildLedger(video, { scheduled, history, project });
  const onBench = steps[1].state === 'done';
  const rows: [string, string][] = [
    ['file', video.file_name || video.file_url.split('/').pop() || '—'],
    ['size', video.file_size ? `${(video.file_size / 1048576).toFixed(1)} MB` : 'not set yet'],
    ['shape', video.aspect_ratio || 'not set yet'],
    ['added', new Date(video.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })],
  ];

  return (
    <div className="kt-stagger--fade flex-1 px-4 py-3">
      <h2 className="font-display text-[17px] leading-tight text-ink">{video.title}</h2>

      <dl className="mt-3 space-y-1.5 border-y border-line py-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{k}</dt>
            <Tooltip content={v} side="left">
              <dd className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{v}</dd>
            </Tooltip>
          </div>
        ))}
      </dl>

      <div className="mt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">Ledger</span>
        <ol className="mt-2 space-y-[3px]">
          {steps.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => onJump(s.station)}
                className="kt-focus flex w-full items-center gap-2.5 rounded-[5px] border border-line bg-surface-2/40 px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    s.state === 'done' ? 'bg-primary' : s.state === 'now' ? 'kt-led--now bg-tertiary' : 'bg-surface-3'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12.5px] font-semibold leading-tight ${s.state === 'next' ? 'text-ink-dim' : 'text-ink'}`}>
                    {s.label}
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">{s.detail}</span>
                </span>
                <Icon name="chevron_right" size={15} className="kt-nudge shrink-0 text-ink-dim" />
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => (onBench ? onJump('smart-editor') : onJump('raw-reel', { videoId: video.id }))}
          className="kt-focus flex w-full items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2.5 text-[13px] font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Icon name={onBench ? 'content_cut' : 'auto_fix_high'} size={16} />
          {onBench ? 'Open the timeline' : 'Auto-edit this cut'}
        </button>
        <button
          type="button"
          onClick={() => onJump('content-library', { searchQuery: video.title })}
          className="kt-focus w-full rounded-btn border border-line px-3 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          Find in the vault
        </button>
      </div>
    </div>
  );
}

function DaysBoard({
  scheduled,
  history,
  savedIdeas,
  activeDraft,
  onJump,
  name,
}: {
  scheduled: ScheduledPost[];
  history: PublishingRecord[];
  savedIdeas: number;
  activeDraft: ActiveDraft | null;
  onJump: InspectorProps['onJump'];
  name: string;
}) {
  const today = new Date();
  const upcoming = scheduled
    .filter((p) => p.status === 'draft' || p.status === 'scheduled')
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
    .slice(0, 4);
  const shipped = history.filter((h) => h.status === 'published');

  return (
    <div className="kt-stagger--fade flex-1 px-4 py-4">
      <p className="text-[13px] leading-snug text-ink-muted">
        <span className="font-semibold text-ink">{name.split(' ')[0]}</span>, no cut is lit on the bench. Pick one from
        the rail, or intake fresh footage to start.
      </p>

      {activeDraft && (
        <button
          type="button"
          onClick={() => onJump(DRAFT_STEP_STATION[activeDraft.step])}
          className="kt-focus mt-4 flex w-full items-center gap-2.5 rounded-[6px] border border-primary/40 bg-primary-soft px-3 py-2.5 text-left transition-colors hover:border-primary"
        >
          <Icon name="play_arrow" size={16} className="text-primary" />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-ink">Mid-cut: {activeDraft.title}</span>
            <span className="block text-[11px] text-ink-muted">
              stopped at {activeDraft.step} · {new Date(activeDraft.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </span>
        </button>
      )}

      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">Next out</span>
          <span className="font-mono text-[10px] text-ink-dim">{upcoming.length ? `${upcoming.length} queued` : 'empty'}</span>
        </div>
        {upcoming.length ? (
          <ul className="mt-2 space-y-[3px]">
            {upcoming.map((p) => {
              const when = new Date(p.scheduled_at);
              const days = Math.round((+when - +today) / 86400000);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onJump('publish-schedule', { editingPostId: p.id })}
                    className="kt-focus flex w-full items-center gap-2.5 rounded-[5px] border border-line px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2/50"
                  >
                    <span className="w-9 shrink-0 text-center">
                      <span className="block font-display text-[15px] font-bold leading-none text-ink">{when.getDate()}</span>
                      <span className="block font-mono text-[9px] uppercase text-ink-dim">
                        {when.toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">{p.video_title || 'Untitled cut'}</span>
                      <span className="block font-mono text-[10.5px] text-ink-muted">
                        {p.platform} · {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        {days >= 0 && days < 30 ? ` · in ${days}d` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 rounded-[5px] border border-dashed border-line px-2.5 py-2 text-[11.5px] text-ink-dim">
            Nothing queued. Ship a cut and set its date.
          </p>
        )}
      </section>

      <section className="mt-5 grid grid-cols-2 gap-[3px]">
        <Stat label="shipped" value={shipped.length ? String(shipped.length) : '0'} onClick={() => onJump('analytics')} />
        <Stat label="seeds" value={savedIdeas ? String(savedIdeas) : '0'} onClick={() => onJump('ideas')} />
      </section>
    </div>
  );
}

function Stat({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kt-focus rounded-[5px] border border-line bg-surface-2/40 px-2.5 py-2 text-left transition-colors hover:border-line-strong"
    >
      <span className="block font-display text-[20px] font-bold leading-none text-ink">{value}</span>
      <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dim">{label}</span>
    </button>
  );
}
