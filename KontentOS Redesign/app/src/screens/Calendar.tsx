import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, StatusPill } from '@/components/ui';
import { useStore } from '@/lib/store';
import { navigate } from '@/lib/nav';
import type { ScheduledPost, SocialPlatform } from '@/lib/types';

const PLATFORM_CONFIG: Record<
  SocialPlatform,
  { icon: string; label: string; color: string; bg: string; border: string }
> = {
  instagram: {
    icon: 'photo_camera',
    label: 'Instagram',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-200 dark:border-rose-900',
  },
  youtube: {
    icon: 'smart_display',
    label: 'YouTube Shorts',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-900',
  },
  tiktok: {
    icon: 'music_note',
    label: 'TikTok',
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    border: 'border-cyan-200 dark:border-cyan-900',
  },
  linkedin: {
    icon: 'badge',
    label: 'LinkedIn',
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    border: 'border-sky-200 dark:border-sky-900',
  },
  x: {
    icon: 'hash',
    label: 'X (Twitter)',
    color: 'text-slate-800 dark:text-slate-200',
    bg: 'bg-slate-100 dark:bg-slate-800/40',
    border: 'border-slate-300 dark:border-slate-700',
  },
  threads: {
    icon: 'forum',
    label: 'Threads',
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-900',
  },
  facebook: {
    icon: 'group',
    label: 'Facebook Reels',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-900',
  },
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Calendar() {
  const { scheduled, deleteScheduled, publishNow, online, videos } = useStore();
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 8, 1)); // September 2026 default
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [activePostModal, setActivePostModal] = useState<ScheduledPost | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calculation for Month grid
  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const leadDays = useMemo(() => {
    // 0 = Sunday, 1 = Monday. We want Monday-first (0 for Monday, 6 for Sunday)
    const dayOfWeek = new Date(year, month, 1).getDay();
    return (dayOfWeek + 6) % 7;
  }, [year, month]);

  const filteredPosts = useMemo(() => {
    if (filterPlatform === 'all') return scheduled;
    return scheduled.filter((p) => p.platform === filterPlatform);
  }, [scheduled, filterPlatform]);

  const postsByDay = useMemo(() => {
    const map = new Map<number, ScheduledPost[]>();
    for (const p of filteredPosts) {
      const d = new Date(p.scheduled_at);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const list = map.get(day) || [];
        list.push(p);
        map.set(day, list);
      }
    }
    return map;
  }, [filteredPosts, year, month]);

  const eventsForSelectedDay = useMemo(() => {
    return postsByDay.get(selectedDay) || [];
  }, [postsByDay, selectedDay]);

  const upcomingQueue = useMemo(() => {
    return [...scheduled]
      .filter((p) => new Date(p.scheduled_at).getTime() >= Date.now() || p.status === 'scheduled')
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  }, [scheduled]);

  const publishedHistory = useMemo(() => {
    return [...scheduled]
      .filter((p) => p.status === 'published')
      .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
  }, [scheduled]);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now.getDate());
  };

  const handleQuickScheduleForDay = (dayNum: number) => {
    setSelectedDay(dayNum);
    const targetDate = new Date(year, month, dayNum, 10, 0, 0);
    navigate('publish-schedule', { defaultScheduledAt: targetDate.toISOString() });
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <Eyebrow icon="calendar_today">Distribution Engine</Eyebrow>
          <h1 className="font-display text-[32px] font-bold text-ink tracking-tight mt-1">
            Publishing Calendar
          </h1>
          <p className="text-[14px] text-ink-muted mt-0.5">
            Coordinate multi-platform reels, manage release cadence, and dispatch scheduled drops.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Month Navigator */}
          <div className="flex items-center rounded-btn border border-line bg-surface shadow-xs">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors rounded-l-btn kt-focus"
              title="Previous Month"
            >
              <Icon name="chevron_left" size={18} />
            </button>
            <span className="text-[13.5px] font-semibold text-ink px-3 min-w-[140px] text-center">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors rounded-r-btn kt-focus"
              title="Next Month"
            >
              <Icon name="chevron_right" size={18} />
            </button>
          </div>

          <Button size="sm" variant="soft" onClick={jumpToToday}>
            Today
          </Button>

          <Button
            icon="add"
            onClick={() => handleQuickScheduleForDay(selectedDay)}
          >
            Schedule Reel
          </Button>
        </div>
      </div>

      {/* Platform Filter Bar & Quick Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-surface border border-line rounded-card mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold text-ink-dim uppercase tracking-wider mr-2">
            Filter:
          </span>
          <button
            onClick={() => setFilterPlatform('all')}
            className={`px-2.5 py-1 text-[12px] font-semibold rounded-btn transition-colors ${
              filterPlatform === 'all'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-2 text-ink-muted hover:text-ink'
            }`}
          >
            All Platforms ({scheduled.length})
          </button>
          {(Object.keys(PLATFORM_CONFIG) as SocialPlatform[]).map((plat) => {
            const count = scheduled.filter((p) => p.platform === plat).length;
            if (count === 0 && filterPlatform !== plat) return null;
            const cfg = PLATFORM_CONFIG[plat];
            const active = filterPlatform === plat;
            return (
              <button
                key={plat}
                onClick={() => setFilterPlatform(active ? 'all' : plat)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-btn transition-colors border ${
                  active
                    ? `${cfg.bg} ${cfg.color} ${cfg.border} font-semibold`
                    : 'bg-surface text-ink-muted border-line hover:border-line-strong'
                }`}
              >
                <Icon name={cfg.icon} size={14} />
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-[12.5px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <strong className="text-ink font-semibold">{upcomingQueue.length}</strong> upcoming
          </span>
          <span className="text-line-strong">|</span>
          <span className="flex items-center gap-1.5">
            <Icon name="check_circle" size={14} className="text-primary" />
            <strong className="text-ink font-semibold">{publishedHistory.length}</strong> published
          </span>
        </div>
      </div>

      {/* Main Grid & Rail Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Calendar Grid */}
        <Card className="p-5 shadow-sm overflow-hidden">
          {/* Day Headers (Mon - Sun) */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName) => (
              <div
                key={dayName}
                className="text-center text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim py-1"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Blank lead days */}
            {Array.from({ length: leadDays }).map((_, i) => (
              <div
                key={`lead-${i}`}
                className="min-h-[105px] rounded-card bg-surface-2/30 border border-dashed border-line/50 opacity-40"
              />
            ))}

            {/* Real Month Days */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const evs = postsByDay.get(d) || [];
              const isSelected = d === selectedDay;
              const isToday =
                d === new Date().getDate() &&
                month === new Date().getMonth() &&
                year === new Date().getFullYear();

              return (
                <div
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`group relative min-h-[110px] rounded-card border p-2 text-left transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 bg-primary-soft/40 shadow-xs'
                      : 'border-line hover:border-line-strong bg-surface hover:bg-surface-2/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[12.5px] font-semibold w-6 h-6 grid place-items-center rounded-full transition-colors ${
                        isToday
                          ? 'bg-primary text-on-primary font-bold shadow-xs'
                          : isSelected
                          ? 'text-primary font-bold'
                          : 'text-ink-muted group-hover:text-ink'
                      }`}
                    >
                      {d}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickScheduleForDay(d);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface text-ink-dim hover:text-primary transition-opacity"
                      title="Schedule for this date"
                    >
                      <Icon name="add" size={14} />
                    </button>
                  </div>

                  {/* Scheduled Post Pills in Date Cell */}
                  <div className="space-y-1 my-auto overflow-hidden">
                    {evs.slice(0, 2).map((ev) => {
                      const plat = (ev.platform || 'instagram') as SocialPlatform;
                      const cfg = PLATFORM_CONFIG[plat] || PLATFORM_CONFIG.instagram;
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePostModal(ev);
                          }}
                          className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium border leading-tight truncate transition-transform hover:scale-[1.02] ${cfg.bg} ${cfg.color} ${cfg.border}`}
                          title={`${new Date(ev.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${ev.video_title}`}
                        >
                          <Icon name={cfg.icon} size={12} className="shrink-0" />
                          <span className="truncate flex-1">
                            {ev.video_title || 'Untitled drop'}
                          </span>
                        </div>
                      );
                    })}
                    {evs.length > 2 && (
                      <span className="block text-[10.5px] font-semibold text-primary px-1 text-right">
                        +{evs.length - 2} more
                      </span>
                    )}
                  </div>

                  {/* Bottom Day Status Indicator */}
                  <div className="flex items-center justify-between text-[10px] text-ink-dim pt-1 border-t border-line/30">
                    <span>{evs.length > 0 ? `${evs.length} drops` : '—'}</span>
                    {evs.some((e) => e.status === 'published') && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Has published content" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Side Rail: Day Inspector & Distribution Queue */}
        <div className="space-y-6">
          {/* Day Inspector Card */}
          <Card className="p-5 border-line shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                  Day Inspector
                </span>
                <h3 className="font-display text-[18px] font-bold text-ink">
                  {MONTH_NAMES[month]} {selectedDay}, {year}
                </h3>
              </div>
              <StatusPill tone={eventsForSelectedDay.length > 0 ? 'primary' : 'neutral'}>
                {eventsForSelectedDay.length} Scheduled
              </StatusPill>
            </div>

            {eventsForSelectedDay.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-card bg-surface-2/40 border border-dashed border-line">
                <div className="w-10 h-10 rounded-full bg-surface-2 grid place-items-center text-ink-dim mx-auto mb-2.5">
                  <Icon name="event_available" size={20} />
                </div>
                <div className="text-[13.5px] font-semibold text-ink">No Drops Scheduled</div>
                <p className="text-[12px] text-ink-muted mt-1 mb-4">
                  Schedule your next reel to maintain cross-platform algorithmic momentum.
                </p>
                <Button
                  size="sm"
                  variant="soft"
                  icon="add"
                  onClick={() => handleQuickScheduleForDay(selectedDay)}
                >
                  Schedule for Sep {selectedDay}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {eventsForSelectedDay.map((post) => (
                  <DayPostCard
                    key={post.id}
                    post={post}
                    onPublish={() => publishNow(post.id)}
                    onDelete={() => deleteScheduled(post.id)}
                    onInspect={() => setActivePostModal(post)}
                    disabled={!online}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Upcoming Master Queue */}
          <Card className="p-5 border-line shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-ink text-[15px] flex items-center gap-2">
                <Icon name="upcoming" size={17} className="text-primary" />
                Upcoming Queue
              </h3>
              <span className="text-[11.5px] text-ink-dim">
                {upcomingQueue.length} queued
              </span>
            </div>

            {upcomingQueue.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted py-4 text-center">
                Your queue is clear. Create and schedule reels to fill your distribution runway.
              </p>
            ) : (
              <div className="divide-y divide-line/60">
                {upcomingQueue.slice(0, 6).map((post) => {
                  const plat = (post.platform || 'instagram') as SocialPlatform;
                  const cfg = PLATFORM_CONFIG[plat] || PLATFORM_CONFIG.instagram;
                  const dateObj = new Date(post.scheduled_at);

                  return (
                    <div
                      key={post.id}
                      onClick={() => setActivePostModal(post)}
                      className="py-3 flex items-start gap-3 cursor-pointer group hover:bg-surface-2/40 px-2 rounded -mx-2 transition-colors"
                    >
                      <span
                        className={`w-8 h-8 rounded-btn grid place-items-center shrink-0 mt-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}
                      >
                        <Icon name={cfg.icon} size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ink truncate group-hover:text-primary transition-colors">
                          {post.video_title || 'Untitled Reel'}
                        </div>
                        <div className="text-[11.5px] text-ink-muted flex items-center gap-1.5 mt-0.5">
                          <span>
                            {MONTH_NAMES[dateObj.getMonth()].slice(0, 3)} {dateObj.getDate()}
                          </span>
                          <span>•</span>
                          <span>
                            {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <StatusPill
                        tone={
                          post.status === 'published'
                            ? 'primary'
                            : post.status === 'scheduled'
                            ? 'secondary'
                            : 'neutral'
                        }
                      >
                        {post.status}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Post Detail & Inspector Modal */}
      {activePostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[560px] bg-surface rounded-card border border-line shadow-xl overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2/40">
              <div className="flex items-center gap-2.5">
                {(() => {
                  const plat = (activePostModal.platform || 'instagram') as SocialPlatform;
                  const cfg = PLATFORM_CONFIG[plat] || PLATFORM_CONFIG.instagram;
                  return (
                    <span
                      className={`w-8 h-8 rounded-btn grid place-items-center border ${cfg.bg} ${cfg.color} ${cfg.border}`}
                    >
                      <Icon name={cfg.icon} size={16} />
                    </span>
                  );
                })()}
                <div>
                  <h3 className="text-[15px] font-bold text-ink">Scheduled Dispatch</h3>
                  <span className="text-[12px] text-ink-dim">
                    {PLATFORM_CONFIG[activePostModal.platform as SocialPlatform]?.label ||
                      activePostModal.platform}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActivePostModal(null)}
                className="w-8 h-8 rounded-full grid place-items-center text-ink-dim hover:text-ink hover:bg-surface transition-colors kt-focus"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                  Video Title
                </label>
                <div className="text-[15px] font-semibold text-ink">
                  {activePostModal.video_title || 'Untitled Reel'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3.5 rounded-card bg-surface-2 border border-line">
                <div>
                  <span className="text-[11px] text-ink-dim block uppercase">Scheduled For</span>
                  <span className="text-[13px] font-semibold text-ink">
                    {new Date(activePostModal.scheduled_at).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    at{' '}
                    {new Date(activePostModal.scheduled_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-ink-dim block uppercase">Current Status</span>
                  <div className="mt-0.5">
                    <StatusPill
                      tone={
                        activePostModal.status === 'published'
                          ? 'primary'
                          : activePostModal.status === 'scheduled'
                          ? 'secondary'
                          : 'neutral'
                      }
                    >
                      {activePostModal.status.toUpperCase()}
                    </StatusPill>
                  </div>
                </div>
              </div>

              {(activePostModal.caption_text || (activePostModal.hashtags && activePostModal.hashtags.length > 0)) && (
                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                    Formatted Caption &amp; Hashtags
                  </label>
                  <div className="text-[13px] text-ink bg-surface-2/60 border border-line rounded-btn p-3 whitespace-pre-wrap max-h-[140px] overflow-y-auto leading-relaxed">
                    {activePostModal.caption_text}
                    {activePostModal.hashtags && activePostModal.hashtags.length > 0 && (
                      <div className="mt-2 text-primary font-medium">
                        {activePostModal.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-line bg-surface-2/30">
              <button
                onClick={() => {
                  deleteScheduled(activePostModal.id);
                  setActivePostModal(null);
                }}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-danger hover:underline kt-focus"
              >
                <Icon name="delete" size={15} />
                Cancel Dispatch
              </button>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    setActivePostModal(null);
                    navigate('publish-schedule', {
                      editingPostId: activePostModal.id,
                      videoTitle: activePostModal.video_title,
                      caption: activePostModal.caption_text,
                    });
                  }}
                >
                  Edit in Composer
                </Button>
                <Button
                  size="sm"
                  icon="send_now"
                  disabled={!online || activePostModal.status === 'published'}
                  onClick={() => {
                    publishNow(activePostModal.id);
                    setActivePostModal(null);
                  }}
                >
                  {activePostModal.status === 'published' ? 'Published' : 'Publish Now'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayPostCard({
  post,
  onPublish,
  onDelete,
  onInspect,
  disabled,
}: {
  post: ScheduledPost;
  onPublish: () => void;
  onDelete: () => void;
  onInspect: () => void;
  disabled?: boolean;
}) {
  const plat = (post.platform || 'instagram') as SocialPlatform;
  const cfg = PLATFORM_CONFIG[plat] || PLATFORM_CONFIG.instagram;
  const timeStr = new Date(post.scheduled_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      onClick={onInspect}
      className="rounded-card border border-line p-3.5 bg-surface hover:border-line-strong transition-all cursor-pointer space-y-2.5 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-8 h-8 rounded-btn grid place-items-center shrink-0 border ${cfg.bg} ${cfg.color} ${cfg.border}`}
        >
          <Icon name={cfg.icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink truncate">
            {post.video_title || 'Untitled Reel'}
          </div>
          <div className="text-[11.5px] text-ink-muted flex items-center gap-1.5 mt-0.5">
            <span>{timeStr}</span>
            <span>•</span>
            <span>{cfg.label}</span>
          </div>
        </div>
        <StatusPill
          tone={
            post.status === 'published'
              ? 'primary'
              : post.status === 'scheduled'
              ? 'secondary'
              : 'neutral'
          }
        >
          {post.status}
        </StatusPill>
      </div>

      {post.caption_text && (
        <p className="text-[12px] text-ink-dim line-clamp-2 leading-relaxed bg-surface-2/50 p-2 rounded border border-line/60">
          {post.caption_text}
        </p>
      )}

      <div
        className="flex items-center justify-between pt-2 border-t border-line/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {post.status !== 'published' && (
            <Button size="sm" variant="soft" icon="send_now" onClick={onPublish} disabled={disabled}>
              Publish now
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              navigate('publish-schedule', {
                editingPostId: post.id,
                videoTitle: post.video_title,
                caption: post.caption_text,
              })
            }
          >
            Edit
          </Button>
        </div>
        <button
          onClick={onDelete}
          className="text-[12px] text-ink-dim hover:text-danger inline-flex items-center gap-1 px-1.5 py-1 rounded transition-colors kt-focus"
          title="Remove scheduled dispatch"
        >
          <Icon name="delete" size={14} />
        </button>
      </div>
    </div>
  );
}
