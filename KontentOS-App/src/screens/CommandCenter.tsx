import { useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, Progress, StatusPill, Thumb } from '@/components/ui';
import { homeStats, quickActions, continueCreating, weekStrip } from '@/data/mock';
import { useDisplayProfile, useStore } from '@/lib/store';
import type { ScreenId } from '@/lib/nav';
import type { Video } from '@/lib/types';

const STATUS_TONE: Record<Video['status'], { label: string; tone: string; pct: number }> = {
  uploading: { label: 'Uploading', tone: 'tertiary', pct: 30 },
  processing: { label: 'Processing', tone: 'tertiary', pct: 65 },
  ready: { label: 'Ready', tone: 'primary', pct: 100 },
  failed: { label: 'Failed', tone: 'neutral', pct: 100 },
};

function fmtDuration(sec?: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CommandCenter() {
  const profile = useDisplayProfile();
  const { videos, scheduled, history, activeDraft, online, navigate, savedIdeas } = useStore();
  const firstName = profile.name.split(' ')[0] || 'there';

  const recentVideos = useMemo(() => videos.slice(0, 3), [videos]);

  // Dynamic Pipeline: binds to real user data and active drafts
  const dynamicPipeline = useMemo(() => {
    const hasIdeas = !!activeDraft?.idea || savedIdeas.length > 0;
    const hasVideos = videos.length > 0;
    const hasProject = !!activeDraft?.project;
    const hasScheduled = scheduled.length > 0;

    return [
      {
        phase: 'Phase 01',
        icon: 'auto_awesome',
        title: 'Capture & Curate',
        headline: activeDraft?.idea
          ? activeDraft.idea.title
          : savedIdeas.length > 0
            ? `${savedIdeas.length} saved archetype(s)`
            : 'Brainstorm & angle discovery',
        meta: activeDraft?.idea ? '1 blueprint active' : savedIdeas.length > 0 ? 'Ready for production' : 'Explore hook angles',
        screenId: 'ideas' as ScreenId,
        done: hasIdeas,
      },
      {
        phase: 'Phase 02',
        icon: 'smart_display',
        title: 'Assemble Footage',
        headline: hasVideos ? `${videos.length} clip(s) in vault` : 'Ingest raw clips',
        meta: hasVideos ? 'Ready for auto-cut' : 'A-roll + B-roll sync',
        screenId: 'raw-reel' as ScreenId,
        done: hasVideos,
      },
      {
        phase: 'Phase 03',
        icon: 'content_cut',
        title: 'Editorial Precision',
        headline: activeDraft?.project ? 'Timeline project active' : 'Fine-tune kinetic cuts',
        meta: activeDraft?.project ? `${activeDraft.project.tracks.length} tracks assembled` : 'Auto-zoom & captions',
        screenId: 'smart-editor' as ScreenId,
        done: hasProject,
      },
      {
        phase: 'Phase 04',
        icon: 'schedule_send',
        title: 'Broadcast Distribution',
        headline: hasScheduled ? `${scheduled.length} post(s) queued` : 'Schedule multi-channel',
        meta: hasScheduled ? 'Optimal slot reserved' : 'Cross-post ready',
        screenId: 'publish-schedule' as ScreenId,
        done: hasScheduled,
      },
    ];
  }, [activeDraft, videos.length, scheduled.length]);

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
    <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow icon="space_dashboard">Good morning, {firstName}</Eyebrow>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-tight text-ink mt-1">
            Your creator command center
          </h1>
          <p className="text-ink-muted mt-1 max-w-xl">
            One calm desk for the whole loop — find the idea, cut the reel, publish everywhere.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon="history" onClick={() => navigate('content-library')}>
            Media vault ({videos.length})
          </Button>
          <Button icon="add" onClick={() => navigate('ideas')}>
            New idea
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {homeStats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-[12px] text-ink-dim">{s.label}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-display text-[30px] text-ink leading-none">{s.value}</span>
              <span className="text-[13px] font-semibold text-success">{s.delta}</span>
            </div>
            <div className="text-[12px] text-ink-muted mt-2">{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* Pipeline */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-display text-[24px] text-ink">This week's production pipeline</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">Click any phase to jump directly into the active creative step.</p>
          </div>
          <span className="text-[13px] text-ink-dim">Continuous workflow</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dynamicPipeline.map((p) => (
            <button
              key={p.phase}
              onClick={() => navigate(p.screenId)}
              className="text-left kt-focus group"
            >
              <Card hover className="p-5 h-full flex flex-col gap-3 group-hover:border-primary/50 transition-colors">
                <div className="flex items-center justify-between">
                  <Eyebrow>{p.phase}</Eyebrow>
                  <span className={`grid place-items-center w-8 h-8 rounded-btn transition-colors ${
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
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="font-display text-[24px] text-ink mb-4">Start something</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate(a.id as ScreenId)}
              className="text-left kt-focus group"
            >
              <Card hover className="p-5 h-full flex flex-col gap-3 group-hover:border-primary/50 transition-colors">
                <span className="grid place-items-center w-11 h-11 rounded-card bg-primary-soft text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                  <Icon name={a.icon} size={22} />
                </span>
                <div>
                  <div className="font-display text-[19px] text-ink group-hover:text-primary transition-colors">{a.title}</div>
                  <p className="text-[13px] text-ink-muted mt-1 leading-snug">{a.body}</p>
                </div>
                <div className="mt-auto pt-1 flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-semibold text-primary bg-primary-soft rounded-full px-2 py-0.5">{a.tag}</span>
                  {a.tag2 && <span className="text-[11px] text-ink-dim border border-line rounded-full px-2 py-0.5">{a.tag2}</span>}
                </div>
              </Card>
            </button>
          ))}
        </div>
      </section>

      {/* Continue creating */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-display text-[24px] text-ink">Continue creating</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">Resume in-flight drafts and recently uploaded raw footage.</p>
          </div>
          <Button variant="ghost" size="sm" icon="arrow_forward" onClick={() => navigate('content-library')}>
            View library
          </Button>
        </div>

        {/* Active Draft Hero Card (if in progress) */}
        {activeDraft && (
          <Card className="p-5 mb-4 border-primary/40 bg-primary-soft/30 overflow-hidden relative">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <StatusPill tone="primary">Active Pipeline Draft</StatusPill>
                  <span className="text-[11px] text-ink-dim">Updated {new Date(activeDraft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <h3 className="font-display text-[20px] text-ink">{activeDraft.title}</h3>
                {activeDraft.idea?.hook && (
                  <p className="text-[13px] text-ink-muted italic">“{activeDraft.idea.hook}”</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  icon="play_arrow"
                  onClick={() => navigate(activeDraft.step as ScreenId)}
                >
                  Resume in {activeDraft.step === 'smart-editor' ? 'Smart Editor' : activeDraft.step === 'publish' ? 'Publish Composer' : 'Raw → Reel'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {online && recentVideos.length === 0 && !activeDraft ? (
          <Card className="p-8 text-center">
            <Icon name="upload" size={26} className="text-ink-dim mx-auto mb-2" />
            <div className="font-semibold text-ink">Nothing in progress yet</div>
            <p className="text-[13px] text-ink-muted mt-1">Upload a clip in the Content Library to start your pipeline.</p>
            <Button size="sm" icon="add" className="mt-4" onClick={() => navigate('content-library')}>Upload clip</Button>
          </Card>
        ) : recentVideos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentVideos.map((v) => {
              const st = STATUS_TONE[v.status];
              return (
                <button
                  key={v.id}
                  onClick={() => navigate('raw-reel', { videoId: v.id })}
                  className="text-left kt-focus group"
                >
                  <Card hover className="overflow-hidden flex flex-col h-full group-hover:border-primary/50 transition-colors">
                    <div className="relative aspect-[16/9] bg-surface-2">
                      {v.thumbnail_url ? (
                        <img src={v.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <video
                          src={v.file_url}
                          crossOrigin="anonymous"
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover block"
                        />
                      )}
                      <span className="absolute top-2 left-2"><StatusPill tone={st.tone}>{st.label}</StatusPill></span>
                      <span className="absolute bottom-2 right-2 text-[11px] font-semibold text-white/95 bg-black/35 backdrop-blur rounded-full px-2 py-0.5">
                        {fmtDuration(v.duration)}
                      </span>
                    </div>
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="text-[11px] uppercase tracking-wider text-ink-dim">Raw Clip</div>
                      <div className="font-semibold text-ink leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                        {v.title}
                      </div>
                      <div className="mt-auto pt-2 space-y-1.5">
                        <Progress value={st.pct} />
                        <div className="flex justify-between text-[11px] text-ink-dim">
                          <span>{new Date(v.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          <span className="font-semibold text-primary group-hover:underline">Start Reel →</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {continueCreating.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(c.id === 'c3' ? 'publish-schedule' : c.id === 'c2' ? 'raw-reel' : 'smart-editor')}
                className="text-left kt-focus group"
              >
                <Card hover className="overflow-hidden flex flex-col h-full group-hover:border-primary/50 transition-colors">
                  <Thumb k={c.id === 'c1' ? 'c' : c.id === 'c2' ? 'a' : 'b'} aspect="aspect-[16/9]">
                    <span className="absolute top-2 left-2">
                      <StatusPill tone={c.progress === 100 ? 'primary' : 'tertiary'}>{c.status}</StatusPill>
                    </span>
                    <span className="absolute bottom-2 right-2 text-[11px] font-semibold text-white/95 bg-black/35 backdrop-blur rounded-full px-2 py-0.5">
                      {c.badge}
                    </span>
                  </Thumb>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-ink-dim">{c.kind}</div>
                    <div className="font-semibold text-ink leading-snug group-hover:text-primary transition-colors">{c.title}</div>
                    <p className="text-[12.5px] text-ink-muted leading-snug line-clamp-2">{c.body}</p>
                    <div className="mt-auto pt-2 space-y-1.5">
                      <Progress value={c.progress} />
                      <div className="flex justify-between text-[11px] text-ink-dim">
                        <span>{c.meta}</span>
                        <span>{c.progress}%</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Week strip */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-display text-[24px] text-ink">Publishing week</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">Click any scheduled day to view queue, or an open slot to schedule a dispatch.</p>
          </div>
          <Button variant="ghost" size="sm" icon="calendar_today" onClick={() => navigate('calendar')}>
            Open calendar
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {(!online && scheduled.length === 0
            ? weekStrip.map((d) => ({ ...d, today: d.today }))
            : week
          ).map((d) => (
            <button
              key={`${d.day}-${d.date}`}
              onClick={() => navigate(d.state === 'Open' ? 'publish-schedule' : 'calendar')}
              className="text-left kt-focus group"
            >
              <Card
                hover
                className={`p-3 h-full group-hover:border-primary/50 transition-colors ${
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
                  <StatusPill tone={d.state === 'Published' ? 'primary' : d.state === 'Scheduled' ? 'tertiary' : d.state === 'Open' ? 'neutral' : 'secondary'}>
                    {d.state}
                  </StatusPill>
                </div>
              </Card>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
