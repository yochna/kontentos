import React, { useState, useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, Badge, StatusPill } from '@/components/ui';
import { StaticCardState } from '../../../types/staticCard';
import { useStore } from '@/lib/store';
import { navigate } from '@/lib/nav';
import type { SocialPlatform } from '@/lib/types';
import { toPng } from 'html-to-image';

interface PublishToCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: StaticCardState;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

const ALL_PLATFORMS: { id: SocialPlatform; label: string; icon: string; color: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: 'photo_camera', color: 'text-rose-500' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'badge', color: 'text-sky-500' },
  { id: 'x', label: 'X (Twitter)', icon: 'tag', color: 'text-slate-400' },
  { id: 'threads', label: 'Threads', icon: 'forum', color: 'text-emerald-500' },
  { id: 'tiktok', label: 'TikTok', icon: 'music_note', color: 'text-cyan-500' },
  { id: 'facebook', label: 'Facebook', icon: 'group', color: 'text-blue-500' },
  { id: 'youtube', label: 'YouTube Shorts', icon: 'smart_display', color: 'text-red-500' },
];

export const PublishToCalendarModal: React.FC<PublishToCalendarModalProps> = ({
  isOpen,
  onClose,
  state,
  canvasRef,
}) => {
  const { schedulePost } = useStore();
  const [isPublishing, setIsPublishing] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    count: number;
    dateFormatted: string;
    targetIso: string;
    platforms: string[];
  } | null>(null);

  // Scheduling date & time selection
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const [selectedTime, setSelectedTime] = useState('10:00');

  // Carousel delivery strategy: 'same_day' (all slides on selected date), 'cadence' (spaced 1 day apart), 'now' (immediate publish)
  const [carouselStrategy, setCarouselStrategy] = useState<'same_day' | 'cadence' | 'now'>('same_day');
  const [markAsPublishedNow, setMarkAsPublishedNow] = useState(false);

  // Selected platforms (All 7 available)
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([
    'instagram',
    'linkedin',
  ]);

  const isCarousel = state.format === 'carousel-slide';
  const slides = useMemo(() => {
    if (isCarousel && state.slides && state.slides.length > 0) {
      return state.slides;
    }
    return [
      {
        id: 1,
        headline: state.headline,
        supportingText: state.supportingText,
      },
    ];
  }, [isCarousel, state.slides, state.headline, state.supportingText]);

  // Clean strings without formatting brackets
  const cleanHeadline = (text: string) => (text || '').replace(/\[([^\]]+)\]/g, '$1').trim();

  // Extract hashtags from social caption or generate fallback contextual hashtags
  const hashtags = useMemo(() => {
    const captionText = (state.socialCaption || '').trim();
    const matched = captionText.match(/#[A-Za-z0-9_\u0590-\u05ff]+/g);
    if (matched && matched.length > 0) {
      return Array.from(new Set(matched));
    }
    const topicKeywords = cleanHeadline(state.headline)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    return ['#kontentos', '#visualstory', ...topicKeywords.map((k) => `#${k}`)];
  }, [state.socialCaption, state.headline]);

  const togglePlatform = (plat: SocialPlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(plat)
        ? prev.length > 1
          ? prev.filter((p) => p !== plat)
          : prev
        : [...prev, plat]
    );
  };

  const handleSelectAllPlatforms = () => {
    if (selectedPlatforms.length === ALL_PLATFORMS.length) {
      setSelectedPlatforms(['instagram']);
    } else {
      setSelectedPlatforms(ALL_PLATFORMS.map((p) => p.id));
    }
  };

  const handleQuickPreset = (preset: 'now' | 'today_10am' | 'today_6pm' | 'tomorrow_9am' | 'tomorrow_6pm' | 'saturday') => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    if (preset === 'now') {
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setSelectedTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      setMarkAsPublishedNow(true);
      return;
    }

    setMarkAsPublishedNow(false);
    if (preset === 'today_10am') {
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setSelectedTime('10:00');
    } else if (preset === 'today_6pm') {
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setSelectedTime('18:30');
    } else if (preset === 'tomorrow_9am') {
      d.setDate(d.getDate() + 1);
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setSelectedTime('09:15');
    } else if (preset === 'tomorrow_6pm') {
      d.setDate(d.getDate() + 1);
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setSelectedTime('18:45');
    } else if (preset === 'saturday') {
      const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilSat);
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setSelectedTime('11:00');
    }
  };

  const handleExportToCalendar = async () => {
    setIsPublishing(true);
    setSuccessInfo(null);

    try {
      // 1. Capture snapshot thumbnail from the active canvas
      let thumbnailDataUrl = '';
      if (canvasRef.current) {
        try {
          thumbnailDataUrl = await toPng(canvasRef.current, {
            quality: 0.85,
            pixelRatio: 1.5,
            cacheBust: true,
          });
        } catch (e) {
          console.warn('Canvas thumbnail capture failed, proceeding with fallback:', e);
          thumbnailDataUrl = state.backgroundUrl || '';
        }
      }

      // Compute base timestamp from user's selected date and time
      const combinedDate = new Date(`${selectedDate}T${selectedTime}:00`);
      const baseTime = !isNaN(combinedDate.getTime()) ? combinedDate.getTime() : Date.now();
      let firstScheduledIso = new Date(baseTime).toISOString();

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const slideTitle = cleanHeadline(slide.headline) || `Post #${i + 1}`;
        const slideBody = cleanHeadline(slide.supportingText);

        const fullCaption = [
          slideTitle,
          slideBody,
          state.socialCaption ? `\n${state.socialCaption}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        let scheduledAtIso: string;
        if (markAsPublishedNow) {
          scheduledAtIso = new Date().toISOString();
        } else if (isCarousel && carouselStrategy === 'cadence') {
          // Space 1 slide per day
          const offsetMs = i * 24 * 60 * 60 * 1000;
          scheduledAtIso = new Date(baseTime + offsetMs).toISOString();
        } else if (isCarousel && carouselStrategy === 'same_day') {
          // Stagger slightly by 15 mins per slide on the chosen date
          const offsetMs = i * 15 * 60 * 1000;
          scheduledAtIso = new Date(baseTime + offsetMs).toISOString();
        } else {
          scheduledAtIso = new Date(baseTime).toISOString();
        }

        if (i === 0) {
          firstScheduledIso = scheduledAtIso;
        }

        const isLiveNow = markAsPublishedNow;

        await schedulePost({
          videoId: `static_${Date.now()}_slide_${i + 1}`,
          videoTitle: isCarousel ? `Slide ${i + 1}: ${slideTitle.slice(0, 48)}` : slideTitle,
          thumbnailUrl: thumbnailDataUrl,
          fileUrl: thumbnailDataUrl,
          platforms: selectedPlatforms,
          captionText: fullCaption,
          hashtags,
          scheduledAt: scheduledAtIso,
          status: isLiveNow ? 'published' : 'scheduled',
          publishedAt: isLiveNow ? new Date().toISOString() : undefined,
        });
      }

      const formattedReadable = new Date(baseTime).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      setSuccessInfo({
        count: slides.length,
        dateFormatted: `${formattedReadable} at ${selectedTime}`,
        targetIso: firstScheduledIso,
        platforms: selectedPlatforms.map((p) => p.toUpperCase()),
      });
    } catch (err) {
      console.error('Export to calendar failed:', err);
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-sm animate-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-export-title"
    >
      <div
        className="w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-line bg-surface/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Icon name="calendar_month" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="calendar-export-title" className="text-base font-bold text-ink">
                  Export to Calendar
                </h2>
                <Badge tone="primary">
                  {isCarousel ? `${slides.length} Carousel Slides` : 'Static Post'}
                </Badge>
              </div>
              <p className="text-xs text-ink-muted">
                Select your drop date, time, and social platforms to schedule inside the calendar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {successInfo !== null ? (
            /* Celebration State */
            <div className="text-center py-6 px-4 space-y-4 animate-in fade-in duration-300">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mx-auto shadow-sm">
                <Icon name="check_circle" size={34} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink">
                  ✓ Successfully Exported {successInfo.count} Post{successInfo.count > 1 ? 's' : ''} to Calendar!
                </h3>
                <p className="text-xs text-ink font-semibold mt-1">
                  Scheduled for: <span className="text-primary">{successInfo.dateFormatted}</span>
                </p>
                <p className="text-[11px] text-ink-muted mt-1">
                  Channels: {successInfo.platforms.join(', ')}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="primary"
                  size="md"
                  icon="calendar_today"
                  onClick={() => {
                    onClose();
                    navigate('calendar', { targetDate: successInfo.targetIso });
                  }}
                  className="shadow-md"
                >
                  View in Calendar →
                </Button>
                <Button variant="secondary" size="md" onClick={onClose}>
                  Done (Stay in Studio)
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 1. Date & Time Selection Box */}
              <div className="p-4 bg-surface-2/40 border border-line rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="calendar_today" size={15} className="text-primary" />
                    1. Select Date &amp; Time
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markAsPublishedNow}
                      onChange={(e) => setMarkAsPublishedNow(e.target.checked)}
                      className="rounded border-line text-primary focus:ring-primary"
                    />
                    <span className="text-[11px] font-medium">Publish live right now</span>
                  </label>
                </div>

                {!markAsPublishedNow && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-ink-muted block mb-1 font-medium">Drop Date:</span>
                        <input
                          type="date"
                          required
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg text-ink font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <span className="text-[11px] text-ink-muted block mb-1 font-medium">Drop Time:</span>
                        <input
                          type="time"
                          required
                          value={selectedTime}
                          onChange={(e) => setSelectedTime(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg text-ink font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {/* Quick Timing Presets */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] text-ink-muted uppercase tracking-wider block">
                        Quick Timing Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickPreset('today_10am')}
                          className="px-2.5 py-1 rounded-md text-[11px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
                        >
                          Today 10:00 AM
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPreset('today_6pm')}
                          className="px-2.5 py-1 rounded-md text-[11px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
                        >
                          Today 06:30 PM
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPreset('tomorrow_9am')}
                          className="px-2.5 py-1 rounded-md text-[11px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
                        >
                          Tomorrow 09:15 AM
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPreset('tomorrow_6pm')}
                          className="px-2.5 py-1 rounded-md text-[11px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
                        >
                          Tomorrow 06:45 PM
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPreset('saturday')}
                          className="px-2.5 py-1 rounded-md text-[11px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
                        >
                          Saturday 11:00 AM
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Carousel Sequence Strategy (Only if multi-slide) */}
              {isCarousel && slides.length > 1 && !markAsPublishedNow && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                    Carousel Deck Dispatch Strategy
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCarouselStrategy('same_day')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        carouselStrategy === 'same_day'
                          ? 'border-primary ring-2 ring-primary/20 bg-primary-soft/30 shadow-xs'
                          : 'border-line hover:border-line-strong bg-surface hover:bg-surface-2/40'
                      }`}
                    >
                      <span className="text-xs font-bold text-ink block">
                        Full Campaign Drop on {selectedDate}
                      </span>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        All {slides.length} slides scheduled together on this chosen date &amp; time.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCarouselStrategy('cadence')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        carouselStrategy === 'cadence'
                          ? 'border-primary ring-2 ring-primary/20 bg-primary-soft/30 shadow-xs'
                          : 'border-line hover:border-line-strong bg-surface hover:bg-surface-2/40'
                      }`}
                    >
                      <span className="text-xs font-bold text-ink block">
                        Sequential Cadence (1 Slide / Day)
                      </span>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        Slide 1 on {selectedDate}, Slide 2 next day, etc., at {selectedTime}.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Destination Social Channels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                    2. Select Social Platforms ({selectedPlatforms.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllPlatforms}
                    className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                  >
                    {selectedPlatforms.length === ALL_PLATFORMS.length ? 'Deselect All' : 'Select All Platforms'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ALL_PLATFORMS.map((plat) => {
                    const active = selectedPlatforms.includes(plat.id);
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        onClick={() => togglePlatform(plat.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-primary-soft text-primary border-primary shadow-xs'
                            : 'bg-surface text-ink-muted border-line hover:border-line-strong'
                        }`}
                      >
                        <Icon name={plat.icon} size={16} className={active ? 'text-primary' : plat.color} />
                        <span className="truncate flex-1">{plat.label}</span>
                        {active && <Icon name="check" size={13} className="text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Post Summary Manifest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                    3. Posts to Export ({slides.length})
                  </label>
                  <span className="text-[11px] text-ink-muted">
                    Format: <strong className="text-ink">{state.format}</strong> ({state.aspectRatio})
                  </span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-line rounded-xl p-2 bg-app/40">
                  {slides.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      className="p-2 rounded-lg bg-surface border border-line/70 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="w-5 h-5 rounded bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink truncate leading-tight">
                            {cleanHeadline(s.headline) || `Post Slide #${idx + 1}`}
                          </p>
                          <p className="text-[11px] text-ink-muted truncate mt-0.5">
                            {cleanHeadline(s.supportingText)}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] text-ink-muted font-mono shrink-0">
                        {markAsPublishedNow
                          ? 'Today'
                          : carouselStrategy === 'cadence'
                          ? `+${idx}d`
                          : selectedTime}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {successInfo === null && (
          <div className="p-4 border-t border-line bg-surface/90 flex items-center justify-between shrink-0">
            <span className="text-xs text-ink-muted">
              {slides.length} post{slides.length > 1 ? 's' : ''} across {selectedPlatforms.length} platform{selectedPlatforms.length > 1 ? 's' : ''}
            </span>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={isPublishing}>
                Cancel
              </Button>

              <Button
                variant="primary"
                size="sm"
                icon={isPublishing ? undefined : 'calendar_month'}
                disabled={isPublishing || selectedPlatforms.length === 0}
                onClick={handleExportToCalendar}
                className="shadow-md"
              >
                {isPublishing ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-on-primary mr-1" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Exporting to Calendar...</span>
                  </>
                ) : (
                  <span>
                    Export to Calendar ({selectedDate})
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
