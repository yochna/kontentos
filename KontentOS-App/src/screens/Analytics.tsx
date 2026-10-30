import { useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { AnimatedNumber, Button, Card, PageHeader, PageShell, Progress, Reveal, StatusPill, Thumb } from '@/components/ui';
import { useStore } from '@/lib/store';
import { navigate, type ScreenId } from '@/lib/nav';
import type { ScheduledPost, SocialPlatform } from '@/lib/types';

type TimeRange = '7d' | '30d' | '90d' | 'all';

const RANGE_DAYS: Record<TimeRange, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };

const RANGE_LABEL: Record<TimeRange, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  all: 'all time',
};

const PLATFORM_META: Record<SocialPlatform, { label: string; icon: string }> = {
  instagram: { label: 'Instagram', icon: 'photo_camera' },
  youtube: { label: 'YouTube Shorts', icon: 'smart_display' },
  tiktok: { label: 'TikTok', icon: 'music_note' },
  linkedin: { label: 'LinkedIn', icon: 'badge' },
  x: { label: 'X (Twitter)', icon: 'tag' },
  threads: { label: 'Threads', icon: 'forum' },
  facebook: { label: 'Facebook', icon: 'group' },
};

const platformLabel = (p: string) =>
  (PLATFORM_META as Record<string, { label: string }>)[p]?.label ?? p;

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** 92 -> 1:32 for a single clip; 3720 -> 1h 2m for the runtime totals. */
const fmtClipLength = (sec: number) =>
  sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '—';

const fmtRuntime = (sec: number) => {
  if (sec <= 0) return '0m';
  if (sec < 600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${m}m`;
};

interface Insight {
  icon: string;
  kicker: string;
  title: string;
  body: string;
  cta?: { label: string; screen: ScreenId };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Analytics() {
  const { videos, scheduled, history, user, loading } = useStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const range = useMemo(() => {
    const days = RANGE_DAYS[timeRange];
    const cutoff = days === null ? null : Date.now() - days * 86_400_000;
    const inside = (iso?: string) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? false : cutoff === null || t >= cutoff;
    };
    const now = Date.now();
    const horizon = days === null ? Infinity : now + days * 86_400_000;

    const windowVideos = videos.filter((v) => inside(v.created_at));
    const windowHistory = history.filter((h) => inside(h.published_at));
    const upcoming = scheduled
      .filter((s) => {
        const t = new Date(s.scheduled_at).getTime();
        if (Number.isNaN(t) || t < now) return false;
        return !Number.isFinite(horizon) || t <= horizon;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    const published = windowHistory.filter((h) => h.status === 'published');
    const saved = windowHistory.filter((h) => h.status === 'saved');
    const failed = windowHistory.filter((h) => h.status === 'failed');
    const totalSec = windowVideos.reduce((sum, v) => sum + (v.duration || 0), 0);
    // Clips whose duration was never read would otherwise drag the average down silently.
    const measuredClips = windowVideos.filter((v) => (v.duration || 0) > 0).length;
    const readyCount = windowVideos.filter((v) => v.status === 'ready').length;
    const processedCount = windowVideos.filter((v) => v.status === 'processing' || v.status === 'uploading').length;

    const platformCounts = new Map<string, number>();
    for (const h of published) platformCounts.set(h.platform, (platformCounts.get(h.platform) || 0) + 1);
    for (const s of upcoming) platformCounts.set(s.platform, (platformCounts.get(s.platform) || 0) + 1);

    const scheduledInWindow = scheduled.filter((p) => inside(p.created_at || p.scheduled_at));
    const tagCounts = new Map<string, number>();
    let postsWithTags = 0;
    for (const s of scheduledInWindow) {
      const tags = (s.hashtags || []).map((t) => (t.startsWith('#') ? t : `#${t}`).toLowerCase());
      if (tags.length) postsWithTags += 1;
      for (const t of tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const totalTagUses = [...tagCounts.values()].reduce((a, b) => a + b, 0);

    const publishedVideoIds = new Set(windowHistory.map((h) => h.video_id));
    const scheduledVideoIds = new Set(scheduled.map((s) => s.video_id));
    const unscheduledClips = windowVideos.filter(
      (v) => !publishedVideoIds.has(v.id) && !scheduledVideoIds.has(v.id),
    );

    const weekdayCounts = new Map<number, number>();
    for (const iso of [
      ...history.filter((p) => p.status === 'published').map((p) => p.published_at),
      ...scheduled.map((u) => u.scheduled_at),
    ]) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) weekdayCounts.set(d.getDay(), (weekdayCounts.get(d.getDay()) || 0) + 1);
    }
    const busiestDay = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      cutoff,
      windowVideos,
      windowHistory,
      upcoming,
      published,
      saved,
      failed,
      totalSec,
      measuredClips,
      readyCount,
      processedCount,
      platformCounts,
      topTags,
      postsWithTags,
      scheduledInWindow: scheduledInWindow.length,
      totalTagUses,
      unscheduledClips,
      busiestDay,
      timingTotal: [...weekdayCounts.values()].reduce((a, b) => a + b, 0),
      recentVideos: [...windowVideos]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
    };
  }, [videos, scheduled, history, timeRange]);

  const statusById = useMemo(() => {
    const map = new Map<string, { platform: string; state: 'published' | 'scheduled'; url?: string }>();
    for (const h of history) {
      if (h.status === 'published') map.set(h.video_id, { platform: h.platform, state: 'published', url: h.url });
    }
    for (const s of scheduled) {
      if (s.status === 'scheduled' && !map.has(s.video_id)) map.set(s.video_id, { platform: s.platform, state: 'scheduled' });
    }
    return map;
  }, [history, scheduled]);

  const kpis = [
    {
      icon: 'video_library',
      label: 'Clips in library',
      value: String(range.windowVideos.length),
      sub:
        range.windowVideos.length === 0
          ? 'nothing uploaded'
          : `${range.readyCount} ready${range.processedCount ? ` · ${range.processedCount} in progress` : ''}`,
      foot: range.cutoff ? `uploaded ${RANGE_LABEL[timeRange]}` : 'uploaded all time',
    },
    {
      icon: 'timer',
      label: 'Total runtime',
      value: fmtRuntime(range.totalSec),
      sub:
        range.measuredClips > 0
          ? `avg ${fmtClipLength(range.totalSec / range.measuredClips)} over ${range.measuredClips} measured clip${range.measuredClips === 1 ? '' : 's'}`
          : 'no clip durations recorded yet',
      foot:
        range.windowVideos.length > range.measuredClips
          ? `${range.windowVideos.length - range.measuredClips} clip(s) have no duration read from the file`
          : 'sum of durations KontentOS read from your files',
    },
    {
      icon: 'cloud_done',
      label: 'Marked published',
      value: String(range.published.length),
      sub:
        range.windowHistory.length === 0
          ? history.length
            ? 'no records in this window'
            : 'no publish records yet'
          : `${range.windowHistory.length} record${range.windowHistory.length === 1 ? '' : 's'}: ${range.published.length} published, ${range.saved.length} saved${range.failed.length ? `, ${range.failed.length} failed` : ''}`,
      foot: '“Publish now” marks a post here — KontentOS does not upload to the platform yet.',
    },
    {
      icon: 'event_upcoming',
      label: 'Scheduled ahead',
      value: String(range.upcoming.length),
      sub: range.upcoming.length ? `next ${fmtDateTime(range.upcoming[0].scheduled_at)}` : 'nothing queued',
      foot:
        RANGE_DAYS[timeRange] === null
          ? 'every future post on your calendar'
          : `within the next ${RANGE_DAYS[timeRange]} days`,
    },
  ];

  const unconnectedMetrics = [
    { icon: 'visibility', label: 'Impressions & reach' },
    { icon: 'hourglass_top', label: 'Watch time & retention' },
    { icon: 'bookmark', label: 'Saves & shares' },
    { icon: 'groups', label: 'Follower growth' },
  ];

  const connectedHandles = [
    user?.instagram_username && `Instagram @${user.instagram_username}`,
    user?.youtube_channel_id && 'YouTube channel saved',
    user?.tiktok_username && `TikTok @${user.tiktok_username}`,
  ].filter(Boolean) as string[];

  const insights: Insight[] = useMemo(() => {
    const out: Insight[] = [];
    const days = RANGE_DAYS[timeRange];
    const weeks = days === null ? 0 : days / 7;

    if (range.published.length > 0) {
      const perWeek = weeks > 0 ? range.published.length / weeks : 0;
      out.push({
        icon: 'calendar_month',
        kicker: 'Publishing cadence',
        title: `${range.published.length} post${range.published.length === 1 ? '' : 's'} marked published ${RANGE_LABEL[timeRange]}.`,
        body: weeks > 0
          ? `That works out to about ${perWeek.toFixed(1)} per week. These are posts you pressed “Publish now” on inside KontentOS — the app does not upload to the platforms yet, and posts made outside it are not counted.`
          : 'These are posts you pressed “Publish now” on inside KontentOS — the app does not upload to the platforms yet.',
        cta: { label: 'Review publishing history', screen: 'publish-schedule' },
      });
    } else {
      out.push({
        icon: 'hourglass_empty',
        kicker: 'Publishing cadence',
        title: 'No posts marked published through KontentOS yet.',
        body: 'The publish history stays empty until you send a scheduled post from the app. Anything you posted manually will not appear here.',
        cta: { label: 'Go to Publish & Schedule', screen: 'publish-schedule' },
      });
    }

    if (range.busiestDay && range.busiestDay[1] > 1) {
      out.push({
        icon: 'schedule',
        kicker: 'Timing',
        title: `${WEEKDAYS[range.busiestDay[0]]} is your busiest day: ${range.busiestDay[1]} of your ${range.timingTotal} post${range.timingTotal === 1 ? '' : 's'}.`,
        body: 'Derived from the timestamps in your own schedule. Without platform retention data KontentOS cannot say whether that day actually performs better.',
      });
    }

    if (range.unscheduledClips.length > 0) {
      out.push({
        icon: 'inventory_2',
        kicker: 'Library backlog',
        title: `${range.unscheduledClips.length} clip${range.unscheduledClips.length === 1 ? '' : 's'} uploaded but never published or scheduled.`,
        body: `These are the ${range.unscheduledClips.length === 1 ? 'clip' : 'clips'} sitting in the library with no publish record: ${range.unscheduledClips
          .slice(0, 3)
          .map((v) => `“${v.title}”`)
          .join(', ')}${range.unscheduledClips.length > 3 ? '…' : ''}.`,
        cta: { label: 'Open Content Library', screen: 'content-library' },
      });
    }

    const emptyCaptions = scheduled.filter((s) => s.status === 'scheduled' && !s.caption_text?.trim());
    if (emptyCaptions.length > 0) {
      out.push({
        icon: 'edit_note',
        kicker: 'Ready to publish',
        title: `${emptyCaptions.length} scheduled post${emptyCaptions.length === 1 ? '' : 's'} still have no caption.`,
        body: 'A post can be queued with an empty caption. Filling these in before the slot is the cheapest improvement available right now.',
        cta: { label: 'Fix in Publish & Schedule', screen: 'publish-schedule' },
      });
    }

    if (range.postsWithTags > 0) {
      const avg = range.totalTagUses / range.postsWithTags;
      const mostUsed = range.topTags[0];
      const without = range.scheduledInWindow - range.postsWithTags;
      out.push({
        icon: 'tag',
        kicker: 'Hashtag usage',
        title: `Posts that use hashtags average ${avg.toFixed(1)} of them — ${mostUsed ? `${mostUsed[0]} appears most, ${mostUsed[1]} time${mostUsed[1] === 1 ? '' : 's'}.` : 'none recorded.'}`,
        body: `${range.postsWithTags} of ${range.scheduledInWindow} post${range.scheduledInWindow === 1 ? '' : 's'} in this window carry hashtags${without > 0 ? `, ${without} ${without === 1 ? 'carries' : 'carry'} none` : ''}. This describes what you type — it is not a measure of how those tags performed.`,
      });
    }

    return out;
  }, [range, scheduled, timeRange]);

  const handleExportData = () => {
    const lines = [
      `# KontentOS Activity Report (${RANGE_LABEL[timeRange]})`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      '> KontentOS is not connected to Instagram, YouTube or TikTok analytics APIs, so this report',
      '> contains no impressions, watch time or engagement figures. Every number below is derived',
      '> from records created inside this workspace, and "published" means marked published here —',
      '> the app does not upload the file to a platform.',
      '',
      '## Workspace activity',
      `- Clips uploaded: ${range.windowVideos.length} (${range.readyCount} ready)`,
      `- Total runtime of those clips: ${fmtRuntime(range.totalSec)}`,
      `- Posts marked published in KontentOS: ${range.published.length}`,
      `- Posts saved to the library: ${range.saved.length}`,
      `- Failed publish attempts: ${range.failed.length}`,
      `- Posts scheduled ahead: ${range.upcoming.length}`,
      `- Clips with no publish or schedule record: ${range.unscheduledClips.length}`,
      '',
      '## Platforms used',
      range.platformCounts.size
        ? [...range.platformCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([p, n]) => `- ${platformLabel(p)}: ${n} post(s)`)
            .join('\n')
        : '- None recorded in this window.',
      '',
      '## Scheduled queue',
      range.upcoming.length
        ? range.upcoming
            .slice(0, 20)
            .map((s) => `- ${fmtDateTime(s.scheduled_at)} · ${platformLabel(s.platform)} · ${s.video_title || s.video_id}${s.caption_text?.trim() ? '' : ' (no caption)'}`)
            .join('\n')
        : '- Nothing scheduled.',
      '',
      '## Hashtag usage',
      range.topTags.length
        ? range.topTags.map(([t, n]) => `- ${t}: ${n}`).join('\n')
        : '- No hashtags recorded.',
      '',
      '## Published content',
      range.published.length
        ? range.published.map((h) => `- ${fmtDateTime(h.published_at)} · ${platformLabel(h.platform)}${h.url ? ` · ${h.url}` : ''}`).join('\n')
        : '- No posts published through KontentOS in this window.',
      '',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KontentOS_Activity_${timeRange}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice('Activity report exported.');
    setTimeout(() => setExportNotice(null), 3000);
  };

  const isEmptyAccount = videos.length === 0 && scheduled.length === 0 && history.length === 0;

  return (
    <PageShell className="animate-fade-in">
      {exportNotice && (
        <div className="fixed bottom-6 right-6 z-50 max-w-[calc(100vw-3rem)] bg-ink text-surface px-4 py-2.5 rounded-btn shadow-lg text-[13px] font-medium flex items-center gap-2 animate-scale-up">
          <Icon name="check_circle" size={16} className="text-success" />
          {exportNotice}
        </div>
      )}

      <PageHeader
        eyebrow="Creator Intelligence"
        icon="equalizer"
        title="Activity & Output Analytics"
        description="Everything on this page is counted from your own workspace — uploads, captions, schedules and publish records. No platform metrics are connected yet."
        actions={
          <>
            <div className="flex items-center rounded-btn border border-line bg-surface p-1 shadow-xs">
              {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTimeRange(t)}
                  className={`px-3 py-1 text-[12px] font-semibold rounded-btn transition-colors ${
                    timeRange === t ? 'bg-primary text-on-primary shadow-xs' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {t === '7d' ? '7 Days' : t === '30d' ? '30 Days' : t === '90d' ? '90 Days' : 'All Time'}
                </button>
              ))}
            </div>

            <Button variant="secondary" icon="download" onClick={handleExportData} disabled={isEmptyAccount}>
              Export Report
            </Button>
          </>
        }
        className="mb-6"
      />

      {isEmptyAccount ? (
        <Card className="p-8 sm:p-12 text-center border-line shadow-xs">
          <span className="grid place-items-center w-14 h-14 rounded-btn bg-primary-soft text-primary mx-auto">
            <Icon name="insights" size={28} />
          </span>
          <h2 className="font-display text-[24px] font-bold text-ink mt-5">
            {loading ? 'Loading your workspace…' : 'Nothing to measure yet'}
          </h2>
          <p className="text-[14px] text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
            Analytics shows real counts from this workspace. It stays empty until you upload a clip,
            schedule a post or publish one — the numbers you see afterwards are yours, not samples.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            <Button icon="auto_awesome" variant="secondary" onClick={() => navigate('ideas')}>
              Start with an idea
            </Button>
            <Button icon="smart_display" onClick={() => navigate('raw-reel')}>
              Turn a raw clip into a reel
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpis.map((k, i) => (
              <Reveal key={k.label} delay={i * 70} className="h-full">
              <Card sheen spot className="p-5 h-full flex flex-col justify-between shadow-xs hover:border-line-strong hover:-translate-y-[3px] transition-all duration-200 ease-out">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="grid place-items-center w-10 h-10 rounded-btn bg-primary-soft text-primary">
                      <Icon name={k.icon} size={20} />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                      {RANGE_LABEL[timeRange]}
                    </span>
                  </div>
                  <div className="mt-4 font-display text-[28px] font-bold text-ink leading-tight tabular-nums">
                    <AnimatedNumber text={k.value} />
                  </div>
                  <div className="text-[13px] font-semibold text-ink-muted mt-1">{k.label}</div>
                  <div className="text-[12px] text-ink-muted mt-1">{k.sub}</div>
                </div>
                <div className="text-[11px] text-ink-dim mt-4 pt-2.5 border-t border-line/60">{k.foot}</div>
              </Card>
              </Reveal>
            ))}
          </div>

          {/* Honest disclosure: no platform metrics API is connected, so performance stays unmeasured. */}
          <Card className="p-5 mb-6 border-line shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span className="grid place-items-center w-10 h-10 rounded-btn bg-surface-2 text-ink-muted shrink-0">
                  <Icon name="link_off" size={20} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-[17px] font-bold text-ink">
                    Channel performance — not connected
                  </h2>
                  <p className="text-[12.5px] text-ink-muted mt-1 leading-relaxed max-w-2xl">
                    Instagram, YouTube and TikTok do not hand their metrics to KontentOS yet, so views,
                    retention and engagement are blank rather than estimated. Connecting them needs platform
                    app review and your own API credentials.
                  </p>
                  <p className="text-[12px] text-ink-dim mt-2">
                    {connectedHandles.length
                      ? `Accounts saved in Settings: ${connectedHandles.join(' · ')}. Saving a handle does not import its metrics.`
                      : 'No social accounts are saved in Settings yet.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Button size="sm" variant="secondary" icon="settings" onClick={() => navigate('settings')}>
                  Open Settings
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-line/60">
              {unconnectedMetrics.map((m) => (
                <div key={m.label} className="rounded-btn border border-line/70 bg-surface-2/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-muted">
                    <Icon name={m.icon} size={14} className="text-ink-dim" />
                    {m.label}
                  </div>
                  <div className="font-display text-[22px] font-bold text-ink-dim mt-1">—</div>
                  <div className="text-[11px] text-ink-dim">not available</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              <section>
                <div className="flex items-center justify-between mb-3.5">
                  <h2 className="font-display text-[22px] font-bold text-ink flex items-center gap-2">
                    <Icon name="analytics" size={20} className="text-tertiary" />
                    What your workspace shows
                  </h2>
                  <span className="text-[12px] text-ink-dim font-medium">
                    from {videos.length} clip{videos.length === 1 ? '' : 's'} · {scheduled.length} scheduled · {history.length} publish record{history.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-3.5">
                  {insights.map((o, i) => (
                    <Reveal key={o.title} delay={i * 70}>
                    <Card sheen className="p-5 border-line shadow-xs hover:border-line-strong hover:-translate-y-[2px] transition-all duration-200 ease-out">
                      <div className="flex items-start gap-4">
                        <span className="grid place-items-center w-11 h-11 rounded-btn bg-secondary-soft text-secondary shrink-0 mt-0.5">
                          <Icon name={o.icon} size={22} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                            {o.kicker}
                          </div>
                          <h3 className="font-semibold text-[15px] text-ink leading-snug mt-1">{o.title}</h3>
                          <p className="text-[13px] text-ink-muted mt-1.5 leading-relaxed">{o.body}</p>
                          {o.cta && (
                            <button
                              onClick={() => navigate(o.cta!.screen)}
                              className="mt-3 text-[12.5px] font-semibold text-primary inline-flex items-center gap-1.5 hover:gap-2 transition-all kt-focus rounded"
                            >
                              <span>{o.cta.label}</span>
                              <Icon name="arrow_forward" size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                    </Reveal>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
                  <div>
                    <h2 className="font-display text-[22px] font-bold text-ink">Content in this window</h2>
                    <p className="text-[12.5px] text-ink-muted">
                      Your uploads, newest first, with the publish or schedule record KontentOS holds for each.
                    </p>
                  </div>
                </div>

                {range.recentVideos.length === 0 ? (
                  <Card className="p-6 text-center border-line shadow-xs">
                    <p className="text-[13.5px] text-ink-muted">
                      No clips were uploaded {RANGE_LABEL[timeRange]}.
                      {videos.length > 0 && ` Switch to All Time to see the ${videos.length} already in the library.`}
                    </p>
                  </Card>
                ) : (
                  <Card className="divide-y divide-line shadow-xs overflow-hidden">
                    {range.recentVideos.map((v) => {
                      const rec = statusById.get(v.id);
                      return (
                        <div key={v.id} className="p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-surface-2/40 transition-colors">
                          <div className="w-14 shrink-0">
                            {v.thumbnail_url ? (
                              <img
                                src={v.thumbnail_url}
                                alt=""
                                loading="lazy"
                                className="w-full aspect-[9/16] object-cover rounded-btn shadow-xs"
                              />
                            ) : (
                              <Thumb k={v.id.slice(-1)} aspect="aspect-[9/16]" className="rounded-btn shadow-xs" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                              Uploaded {fmtDay(v.created_at)} · {v.aspect_ratio || 'aspect not read'}
                            </div>
                            <div className="font-semibold text-[14.5px] text-ink truncate mt-0.5">{v.title}</div>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[12px] text-ink-muted">
                              <span className="flex items-center gap-1 tabular-nums">
                                <Icon name="timer" size={14} className="text-ink-dim" />
                                {fmtClipLength(v.duration || 0)}
                              </span>
                              {rec && (
                                <span className="flex items-center gap-1">
                                  <Icon name={PLATFORM_META[rec.platform as SocialPlatform]?.icon || 'share'} size={14} className="text-ink-dim" />
                                  {rec.state === 'published' ? 'marked published on' : 'scheduled for'} {platformLabel(rec.platform)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 mt-2 sm:mt-0 flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                            <StatusPill tone={v.status === 'ready' ? 'primary' : v.status === 'failed' ? 'danger' : 'neutral'}>
                              {v.status}
                            </StatusPill>
                            {rec?.state === 'published' && rec.url ? (
                              <a
                                href={rec.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11.5px] font-semibold text-ink-muted hover:text-primary transition-colors inline-flex items-center gap-1"
                              >
                                <Icon name="open_in_new" size={13} />
                                View live post
                              </a>
                            ) : (
                              <button
                                onClick={() => navigate('publish-schedule')}
                                className="text-[11.5px] font-semibold text-ink-muted hover:text-primary transition-colors inline-flex items-center gap-1"
                              >
                                <Icon name="schedule_send" size={13} />
                                {rec ? 'Open in schedule' : 'Schedule this'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <Card className="p-5 border-line shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-ink text-[15px] flex items-center gap-2">
                    <Icon name="donut_small" size={17} className="text-primary" />
                    Where your posts go
                  </h3>
                </div>
                {range.platformCounts.size === 0 ? (
                  <p className="text-[12.5px] text-ink-muted">
                    No platform activity recorded {RANGE_LABEL[timeRange]}.
                  </p>
                ) : (
                  <div className="space-y-3.5">
                    {[...range.platformCounts.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([p, n]) => {
                        const max = Math.max(...range.platformCounts.values());
                        return (
                          <div key={p}>
                            <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                              <span className="text-ink font-semibold flex items-center gap-1.5">
                                <Icon name={PLATFORM_META[p as SocialPlatform]?.icon || 'share'} size={14} className="text-ink-dim" />
                                {platformLabel(p)}
                              </span>
                              <span className="text-primary font-bold text-[12px] tabular-nums bg-primary-soft px-2 py-0.5 rounded">
                                {n} post{n === 1 ? '' : 's'}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-surface-2 overflow-hidden border border-line/40">
                              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(n / max) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
                <p className="text-[11px] text-ink-dim mt-4 pt-3 border-t border-line/60">
                  Counts of scheduled and published records — not audience reach per platform.
                </p>
              </Card>

              <Card className="p-5 border-line shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-ink text-[15px] flex items-center gap-2">
                    <Icon name="tag" size={17} className="text-primary" />
                    Hashtags you use most
                  </h3>
                </div>
                {range.topTags.length === 0 ? (
                  <p className="text-[12.5px] text-ink-muted">
                    No hashtags recorded on your scheduled posts yet.
                  </p>
                ) : (
                  <div className="space-y-3.5">
                    {range.topTags.map(([tag, n]) => {
                      const max = range.topTags[0][1];
                      return (
                        <div key={tag}>
                          <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                            <span className="text-ink font-semibold truncate">{tag}</span>
                            <span className="text-primary font-bold text-[12px] tabular-nums bg-primary-soft px-2 py-0.5 rounded">
                              {n}×
                            </span>
                          </div>
                          <Progress
                            value={(n / max) * 100}
                            trackClassName="h-2 bg-surface-2 border border-line/40"
                            barClassName="bg-tertiary"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-ink-dim mt-4 pt-3 border-t border-line/60">
                  Your own usage across {range.scheduledInWindow} post{range.scheduledInWindow === 1 ? '' : 's'} in this window. Frequency is not the same as performance.
                </p>
              </Card>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-[20px] font-bold text-ink flex items-center gap-2">
                    <Icon name="event_upcoming" size={18} className="text-tertiary" />
                    Up next
                  </h3>
                </div>
                {range.upcoming.length === 0 ? (
                  <Card className="p-5 border-line shadow-xs">
                    <p className="text-[13px] text-ink-muted leading-relaxed">
                      Nothing is scheduled{RANGE_DAYS[timeRange] === null ? '' : ` in the next ${RANGE_DAYS[timeRange]} days`}.
                    </p>
                    <Button size="sm" variant="soft" icon="schedule_send" className="mt-3" onClick={() => navigate('publish-schedule')}>
                      Schedule a post
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-3.5">
                    {range.upcoming.slice(0, 4).map((s: ScheduledPost) => (
                      <Card key={s.id} hover className="p-4 border-line shadow-xs space-y-2.5 transition-all">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-primary bg-primary-soft rounded-full px-2.5 py-0.5 flex items-center gap-1">
                            <Icon name={PLATFORM_META[s.platform]?.icon || 'share'} size={12} />
                            {platformLabel(s.platform)}
                          </span>
                          <span className="text-[11px] font-medium text-ink-dim tabular-nums">
                            {fmtDateTime(s.scheduled_at)}
                          </span>
                        </div>
                        <div className="font-semibold text-[14px] text-ink leading-snug">
                          {s.video_title || s.video_id}
                        </div>
                        <p className="text-[12px] text-ink-muted leading-relaxed line-clamp-2">
                          {s.caption_text?.trim() || 'No caption written for this post yet.'}
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t border-line/60">
                          <span className="text-[11.5px] text-ink-dim flex items-center gap-1">
                            <Icon name="tag" size={13} />
                            {s.hashtags?.length ? `${s.hashtags.length} hashtag(s)` : 'no hashtags'}
                          </span>
                          <Button size="sm" variant="soft" icon="edit" onClick={() => navigate('publish-schedule')}>
                            Edit post
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
