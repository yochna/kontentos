import { useState, useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, StatusPill, Thumb } from '@/components/ui';
import { useStore } from '@/lib/store';
import { navigate } from '@/lib/nav';
import { analyticsKpis, observations, leaderboard, tagClusters, recommendations } from '@/data/mock';

type TimeRange = '7d' | '30d' | '90d' | 'all';

interface MetricDelta {
  multiplier: number;
  sub: string;
}

const TIMEFRAME_CONFIG: Record<TimeRange, MetricDelta> = {
  '7d': { multiplier: 0.28, sub: 'vs previous 7d' },
  '30d': { multiplier: 1.0, sub: 'vs previous 30d' },
  '90d': { multiplier: 2.85, sub: 'vs previous 90d' },
  'all': { multiplier: 5.4, sub: 'lifetime performance' },
};

export default function Analytics() {
  const { startProductionFromIdea } = useStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [leaderboardPlatform, setLeaderboardPlatform] = useState<string>('all');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const multiplier = TIMEFRAME_CONFIG[timeRange].multiplier;

  const dynamicKpis = useMemo(() => {
    return [
      {
        icon: 'visibility',
        label: 'Total Impressions',
        value: timeRange === '30d' ? '1.42M' : `${(1.42 * multiplier).toFixed(2)}M`,
        delta: '+24.6%',
        positive: true,
        sub: TIMEFRAME_CONFIG[timeRange].sub,
        foot: 'Reach velocity index: 9.2/10',
      },
      {
        icon: 'hourglass_top',
        label: 'Total Watch Time',
        value: timeRange === '30d' ? '48.6K hrs' : `${(48.6 * multiplier).toFixed(1)}K hrs`,
        delta: '+18.2%',
        positive: true,
        sub: TIMEFRAME_CONFIG[timeRange].sub,
        foot: 'Avg. completion: 68.4%',
      },
      {
        icon: 'bookmark',
        label: 'Saves & Bookmarks',
        value: timeRange === '30d' ? '38,420' : Math.round(38420 * multiplier).toLocaleString(),
        delta: '+32.4%',
        positive: true,
        sub: 'Virality Driver',
        foot: 'Highest retention intent ratio recorded',
      },
      {
        icon: 'ads_click',
        label: 'Omnichannel Conversions',
        value: timeRange === '30d' ? '4,128' : Math.round(4128 * multiplier).toLocaleString(),
        delta: '+12.0%',
        positive: true,
        sub: 'newsletter & studio',
        foot: '$4.82 estimated intent value/click',
      },
    ];
  }, [timeRange, multiplier]);

  const filteredLeaderboard = useMemo(() => {
    if (leaderboardPlatform === 'all') return leaderboard;
    return leaderboard.filter((item) =>
      item.platform.toLowerCase().includes(leaderboardPlatform.toLowerCase()),
    );
  }, [leaderboardPlatform]);

  const handleQueueRecommendation = (rec: (typeof recommendations)[0]) => {
    const syntheticIdea = {
      id: `idea_rec_${Date.now()}`,
      title: rec.title.replace(/[“”"]/g, ''),
      format: rec.format.split('·')[0].trim(),
      category: 'Framework',
      hookBarColor: 'forest',
      blueprint: {
        hook: `Watch how this works: ${rec.title.replace(/[“”"]/g, '')}`,
        why: rec.body,
        beats: [
          { label: 'Hook (0-3s)', time: '0:00', body: 'Address viewer problem directly with contrarian insight.' },
          { label: 'Framework (3-18s)', time: '0:03', body: rec.body },
          { label: 'Payoff & CTA (18-28s)', time: '0:18', body: 'Bookmark this reel and implement this exact workflow today.' },
        ],
      },
    };
    startProductionFromIdea(syntheticIdea);
  };

  const handleExportData = () => {
    const summary = `# KontentOS Analytics Report (${timeRange.toUpperCase()})
Generated on: ${new Date().toLocaleDateString()}

## Performance KPIs
- Total Impressions: ${dynamicKpis[0].value} (${dynamicKpis[0].delta})
- Total Watch Time: ${dynamicKpis[1].value} (${dynamicKpis[1].delta})
- Saves & Bookmarks: ${dynamicKpis[2].value} (${dynamicKpis[2].delta})
- Conversions: ${dynamicKpis[3].value} (${dynamicKpis[3].delta})

## Top Content
${leaderboard.map((l) => `1. [Rank ${l.rank}] ${l.title} (${l.platform}) - ${l.views}, ${l.rate}`).join('\n')}

## Resonance By Tag
${tagClusters.map((t) => `- ${t.tag}: ${t.pct}% (${t.roi})`).join('\n')}
`;
    const blob = new Blob([summary], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KontentOS_Analytics_${timeRange}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice('Exported Markdown summary successfully!');
    setTimeout(() => setExportNotice(null), 3000);
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Toast Notice */}
      {exportNotice && (
        <div className="fixed bottom-6 right-6 z-50 bg-ink text-surface px-4 py-2.5 rounded-btn shadow-lg text-[13px] font-medium flex items-center gap-2 animate-scale-up">
          <Icon name="check_circle" size={16} className="text-emerald-400" />
          {exportNotice}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <Eyebrow icon="equalizer">Creator Intelligence</Eyebrow>
          <h1 className="font-display text-[32px] font-bold text-ink tracking-tight mt-1">
            Performance &amp; Virality Analytics
          </h1>
          <p className="text-[14px] text-ink-muted mt-0.5">
            Real algorithmic retention signals, audience resonance curves, and actionable "What to make next" recommendations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Selector */}
          <div className="flex items-center rounded-btn border border-line bg-surface p-1 shadow-xs">
            {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((t) => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-3 py-1 text-[12px] font-semibold rounded-btn transition-colors ${
                  timeRange === t
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {t === '7d' ? '7 Days' : t === '30d' ? '30 Days' : t === '90d' ? '90 Days' : 'All Time'}
              </button>
            ))}
          </div>

          <Button variant="secondary" icon="download" onClick={handleExportData}>
            Export Report
          </Button>
        </div>
      </div>

      {/* Actionable KPI Cards with Deltas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {dynamicKpis.map((k) => (
          <Card key={k.label} className="p-5 flex flex-col justify-between shadow-xs hover:border-line-strong transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="grid place-items-center w-10 h-10 rounded-btn bg-primary-soft text-primary">
                  <Icon name={k.icon} size={20} />
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] font-bold text-success bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900">
                  <Icon name="trending_up" size={13} />
                  {k.delta}
                </span>
              </div>
              <div className="mt-4 font-display text-[28px] font-bold text-ink leading-tight">
                {k.value}
              </div>
              <div className="text-[13px] font-semibold text-ink-muted mt-1">{k.label}</div>
            </div>
            <div className="text-[11px] text-ink-dim mt-4 pt-2.5 border-t border-line/60 flex items-center justify-between">
              <span>{k.foot}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Main 2-Column Analytics Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* AI Qualitative Observations */}
          <section>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-display text-[22px] font-bold text-ink flex items-center gap-2">
                <Icon name="auto_awesome" size={20} className="text-tertiary" />
                Algorithmic Intelligence &amp; Observations
              </h2>
              <span className="text-[12px] text-ink-dim font-medium">Updated 2h ago</span>
            </div>

            <div className="space-y-3.5">
              {observations.map((o, idx) => (
                <Card key={o.title} className="p-5 border-line shadow-xs hover:border-line-strong transition-all">
                  <div className="flex items-start gap-4">
                    <span className="grid place-items-center w-11 h-11 rounded-btn bg-secondary-soft text-secondary shrink-0 mt-0.5">
                      <Icon name={o.icon} size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                        {o.kicker}
                      </div>
                      <h3 className="font-semibold text-[15px] text-ink leading-snug mt-1">
                        {o.title}
                      </h3>
                      <p className="text-[13px] text-ink-muted mt-1.5 leading-relaxed">
                        {o.body}
                      </p>
                      <button
                        onClick={() => {
                          if (idx === 0) navigate('raw-reel');
                          else if (idx === 1) navigate('ideas', { topicQuery: 'Educational AI workflow breakdowns' });
                          else if (idx === 2) navigate('publish-schedule');
                        }}
                        className="mt-3 text-[12.5px] font-semibold text-primary inline-flex items-center gap-1.5 hover:gap-2 transition-all kt-focus rounded"
                      >
                        <span>{o.cta}</span>
                        <Icon name="arrow_forward" size={15} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* Content Performance Leaderboard */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
              <div>
                <h2 className="font-display text-[22px] font-bold text-ink">
                  Top Performing Content Leaderboard
                </h2>
                <p className="text-[12.5px] text-ink-muted">
                  Ranked by composite retention velocity and save-rate multipliers.
                </p>
              </div>

              {/* Platform Filter */}
              <div className="flex items-center gap-1 bg-surface border border-line rounded-btn p-1 text-[12px]">
                {['all', 'instagram', 'yt', 'tiktok'].map((plat) => (
                  <button
                    key={plat}
                    onClick={() => setLeaderboardPlatform(plat)}
                    className={`px-2.5 py-0.5 rounded-btn capitalize font-medium transition-colors ${
                      leaderboardPlatform === plat
                        ? 'bg-primary text-on-primary'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {plat === 'all' ? 'All' : plat === 'yt' ? 'YouTube' : plat}
                  </button>
                ))}
              </div>
            </div>

            <Card className="divide-y divide-line shadow-xs overflow-hidden">
              {filteredLeaderboard.map((r) => (
                <div
                  key={r.rank}
                  className="p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-surface-2/40 transition-colors"
                >
                  <span className="font-display text-[24px] font-bold text-ink-dim w-6 text-center shrink-0">
                    {r.rank}
                  </span>
                  <div className="w-14 shrink-0">
                    <Thumb k={r.thumb} aspect="aspect-[9/16]" className="rounded-btn shadow-xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                      {r.platform} · {r.date}
                    </div>
                    <div className="font-semibold text-[14.5px] text-ink truncate mt-0.5">
                      {r.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[12px] text-ink-muted">
                      <span className="flex items-center gap-1">
                        <Icon name="visibility" size={14} className="text-ink-dim" /> {r.views}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="bookmark" size={14} className="text-ink-dim" /> {r.rate}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 mt-2 sm:mt-0 flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                    <span className="text-[12px] font-bold text-primary bg-primary-soft px-2 py-0.5 rounded-full">
                      {r.score}
                    </span>
                    <span className="text-[11px] text-ink-dim">{r.tag}</span>
                    <button
                      onClick={() => navigate('ideas', { topicQuery: r.title })}
                      className="text-[11.5px] font-semibold text-ink-muted hover:text-primary transition-colors inline-flex items-center gap-1"
                      title="Remix this format into a new concept"
                    >
                      <Icon name="replay" size={13} />
                      Remix format
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </div>

        {/* Right Rail: Tag Resonance & What To Make Next Loop */}
        <div className="space-y-6">
          {/* Tag Resonance Card */}
          <Card className="p-5 border-line shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink text-[15px] flex items-center gap-2">
                <Icon name="tag" size={17} className="text-primary" />
                Resonance by Content Pillar
              </h3>
            </div>
            <div className="space-y-3.5">
              {tagClusters.map((t) => (
                <div key={t.tag}>
                  <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                    <span className="text-ink font-semibold">{t.tag}</span>
                    <span className="text-primary font-bold text-[12px] tabular-nums bg-primary-soft px-2 py-0.5 rounded">
                      {t.roi}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden border border-line/40">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${t.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* What to Make Next Recommendation Engine */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-[20px] font-bold text-ink flex items-center gap-2">
                <Icon name="lightbulb" size={18} className="text-tertiary" />
                What to Make Next
              </h3>
            </div>
            <p className="text-[12.5px] text-ink-muted mb-3.5">
              Algorithmic recommendations generated from audience bookmark clusters.
            </p>

            <div className="space-y-3.5">
              {recommendations.map((rec) => (
                <Card
                  key={rec.title}
                  hover
                  className="p-4 border-line shadow-xs space-y-2.5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-primary bg-primary-soft rounded-full px-2.5 py-0.5">
                      {rec.format}
                    </span>
                    <span className="text-[11px] font-medium text-ink-dim">
                      {rec.reach.replace('Projected Reach: ', '')}
                    </span>
                  </div>

                  <div className="font-semibold text-[14px] text-ink leading-snug">
                    {rec.title}
                  </div>

                  <p className="text-[12px] text-ink-muted leading-relaxed line-clamp-2">
                    {rec.body}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-line/60">
                    <span className="text-[11.5px] text-ink-dim flex items-center gap-1">
                      <Icon name="trending_up" size={14} className="text-success" />
                      {rec.save}
                    </span>
                    <Button
                      size="sm"
                      variant="soft"
                      icon="add"
                      onClick={() => handleQueueRecommendation(rec)}
                    >
                      Produce Reel
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
