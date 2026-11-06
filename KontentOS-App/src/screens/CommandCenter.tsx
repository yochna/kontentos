import { useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, PageHeader, PageShell, Reveal, StatusPill } from '@/components/ui';
import { useDisplayProfile, useStore } from '@/lib/store';
import { type ScreenId } from '@/lib/nav';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CommandCenter() {
  const profile = useDisplayProfile();
  const { videos, scheduled, activeDraft, navigate, savedIdeas } = useStore();
  const firstName = profile.name.split(' ')[0] || 'there';
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  // Dynamic Pipeline: binds to real user data and active drafts
  const dynamicPipeline = useMemo(() => {
    const hasIdeas = !!activeDraft?.idea || savedIdeas.length > 0;
    const hasVideos = videos.length > 0;
    const hasProject = !!activeDraft?.project;
    const hasScheduled = scheduled.length > 0;

    return [
      {
        phase: 'In · Seeds',
        icon: 'auto_awesome',
        title: 'Find the angle',
        headline: activeDraft?.idea
          ? activeDraft.idea.title
          : savedIdeas.length > 0
            ? `${savedIdeas.length} idea${savedIdeas.length === 1 ? '' : 's'} saved`
            : 'Nothing saved yet',
        meta: activeDraft?.idea ? '1 blueprint active' : savedIdeas.length > 0 ? 'Ready to shoot' : 'Open Seeds and generate',
        screenId: 'ideas' as ScreenId,
        done: hasIdeas,
      },
      {
        phase: 'In · Intake',
        icon: 'smart_display',
        title: 'Bring the take in',
        headline: hasVideos ? `${videos.length} clip${videos.length === 1 ? '' : 's'} on the bench` : 'No footage yet',
        meta: hasVideos ? 'Ready to cut' : 'Drop a video anywhere on the bench',
        screenId: 'raw-reel' as ScreenId,
        done: hasVideos,
      },
      {
        phase: 'Cut · Bench',
        icon: 'content_cut',
        title: 'Cut & caption',
        headline: activeDraft?.project ? 'Timeline project active' : 'No timeline saved yet',
        meta: activeDraft?.project ? `${activeDraft.project.tracks.length} tracks assembled` : 'Trims, captions, punch zooms',
        screenId: 'smart-editor' as ScreenId,
        done: hasProject,
      },
      {
        phase: 'Out · Ship',
        icon: 'schedule_send',
        title: 'Queue it',
        headline: hasScheduled ? `${scheduled.length} post${scheduled.length === 1 ? '' : 's'} queued` : 'Nothing queued',
        meta: hasScheduled ? 'Waiting on its date' : 'KontentOS holds the plan; you post it',
        screenId: 'publish-schedule' as ScreenId,
        done: hasScheduled,
      },
    ];
  }, [activeDraft, videos.length, scheduled.length, savedIdeas.length]);

  const week = useMemo(() => {
    const byDay = new Map<string, typeof scheduled>();
    for (const p of scheduled) {
      const d = new Date(p.scheduled_at);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(p);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const posts = (byDay.get(dayKey(d)) ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      const first = posts[0];
      const time = first ? new Date(first.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const state = !first ? 'Open' : first.status === 'published' ? 'Published' : first.status === 'failed' ? 'Failed' : 'Scheduled';
      return {
        date: d.getDate(),
        day: WEEKDAYS[d.getDay()],
        today: i === 0,
        label: first ? first.video_title || 'Untitled post' : 'No posts',
        time,
        note: posts.length > 1 ? `+${posts.length - 1} more` : first ? first.platform : 'Open slot',
        state,
      };
    });
  }, [scheduled]);

  return (
    <PageShell className="space-y-10">
      <PageHeader
        eyebrow={`${greeting}, ${firstName}`}
        icon="space_dashboard"
        title="Cutting room desk"
        description="Four phases, one cut at a time: seed the angle, intake the footage, cut and caption it, queue it to ship."
      />

      {/* Pipeline */}
      <section>
        <Reveal variant="fade">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-[24px] text-ink">Where the cut stands</h2>
              <p className="text-[13px] text-ink-muted mt-0.5">The four stations in order. Any card opens that station with your live data.</p>
            </div>
            <span className="text-[13px] text-ink-dim">In → Cut → Out</span>
          </div>
        </Reveal>
        {/* Travelling light along the workflow spine — the four phases below are one continuous run. */}
        <div aria-hidden className="kt-rail h-[2px] rounded-full bg-line mb-5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dynamicPipeline.map((p, i) => (
            <Reveal key={p.phase} delay={i * 80} className="h-full">
              <button
                onClick={() => navigate(p.screenId)}
                className="w-full h-full text-left kt-focus group"
              >
                <Card hover className="p-5 h-full flex flex-col gap-3 group-hover:border-primary/50">
                  <div className="flex items-center justify-between">
                    <Eyebrow>{p.phase}</Eyebrow>
                    <span className={`kt-grow grid place-items-center w-8 h-8 rounded-btn transition-all duration-200 ${
                      p.done ? 'bg-primary text-on-primary' : 'bg-primary-soft text-primary group-hover:bg-primary group-hover:text-on-primary'
                    }`}>
                      <Icon name={p.done ? 'check' : p.icon} size={17} />
                    </span>
                  </div>
                  <div>
                    <div className="text-[12px] text-ink-dim">{p.title}</div>
                    <div className="font-semibold text-ink leading-snug mt-0.5 line-clamp-1 group-hover:text-primary transition-colors">
                      {p.headline}
                    </div>
                  </div>
                  <div className="text-[12px] text-ink-muted mt-auto flex items-center gap-1.5">
                    <Icon name={p.done ? 'task_alt' : 'bolt'} size={14} className={p.done ? 'text-success' : 'text-ink-dim'} />
                    {p.meta}
                  </div>
                </Card>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Week strip */}
      <section>
        <Reveal variant="fade">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-[24px] text-ink">Publishing week</h2>
              <p className="text-[13px] text-ink-muted mt-0.5">Click any scheduled day to view queue, or an open slot to schedule a dispatch.</p>
            </div>
            <Button variant="ghost" size="sm" icon="calendar_today" onClick={() => navigate('calendar')}>
              Open calendar
            </Button>
          </div>
        </Reveal>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {week.map((d, i) => (
            <Reveal key={`${d.day}-${d.date}`} delay={i * 60} variant="left" className="h-full">
              <button
                onClick={() => navigate(d.state === 'Open' ? 'publish-schedule' : 'calendar')}
                className="w-full h-full text-left kt-focus group"
              >
                <Card
                  hover
                  className={`p-3 h-full group-hover:border-primary/50 ${
                    d.today ? 'ring-2 ring-primary border-transparent' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink-muted">{d.day}</span>
                    <span className={`text-[12px] font-semibold ${d.today ? 'text-primary' : 'text-ink-dim'}`}>{d.date}</span>
                  </div>
                  <div className="mt-2 min-h-[46px]">
                    <div className="text-[12.5px] font-semibold text-ink truncate group-hover:text-primary transition-colors">{d.label}</div>
                    <div className="text-[11px] text-ink-dim truncate">{d.time || d.note}</div>
                  </div>
                  <div className="mt-1">
                    <StatusPill
                      tone={d.state === 'Published' ? 'primary' : d.state === 'Scheduled' ? 'tertiary' : d.state === 'Open' ? 'neutral' : 'secondary'}
                      pulse={d.state === 'Scheduled'}
                    >
                      {d.state}
                    </StatusPill>
                  </div>
                </Card>
              </button>
            </Reveal>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
