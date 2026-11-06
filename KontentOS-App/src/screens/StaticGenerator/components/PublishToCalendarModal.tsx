import React, { useState, useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Label } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { StaticCardState } from '../../../types/staticCard';
import { formatLabel } from './FormatTabs';
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

const TIMING_PRESETS = [
  { id: 'today_10am', label: 'Today 10:00 AM' },
  { id: 'today_6pm', label: 'Today 6:30 PM' },
  { id: 'tomorrow_9am', label: 'Tomorrow 9:15 AM' },
  { id: 'tomorrow_6pm', label: 'Tomorrow 6:45 PM' },
  { id: 'saturday', label: 'Saturday 11:00 AM' },
] as const;

const platformLabels = (ids: SocialPlatform[]) =>
  ids.map((id) => ALL_PLATFORMS.find((p) => p.id === id)?.label ?? id);

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
    refused: string[];
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

  // Only the tags the creator already wrote into the caption go onto the queue row.
  const hashtags = useMemo(() => {
    const captionText = (state.socialCaption || '').trim();
    const matched = captionText.match(/#[A-Za-z0-9_\u0590-\u05ff]+/g);
    return matched ? Array.from(new Set(matched)) : [];
  }, [state.socialCaption]);

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
    const refused: string[] = [];

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

        // "Live now" used to write status:'published' with no link and no platform contact —
        // the ledger only becomes real when the creator marks it posted on the Calendar.
        const res = await schedulePost({
          videoId: `static_${Date.now()}_slide_${i + 1}`,
          videoTitle: isCarousel ? `Slide ${i + 1}: ${slideTitle.slice(0, 48)}` : slideTitle,
          thumbnailUrl: thumbnailDataUrl,
          fileUrl: thumbnailDataUrl,
          platforms: selectedPlatforms,
          captionText: fullCaption,
          hashtags,
          scheduledAt: scheduledAtIso,
          status: 'scheduled',
        });
        if (!res.ok) {
          refused.push(`Post ${i + 1}: ${res.message || 'the calendar refused it.'}`);
        }
      }

      const formattedReadable = markAsPublishedNow
        ? 'Right now'
        : `${new Date(baseTime).toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })} at ${selectedTime}`;

      setSuccessInfo({
        count: slides.length - refused.length,
        dateFormatted: formattedReadable,
        targetIso: firstScheduledIso,
        platforms: platformLabels(selectedPlatforms),
        refused,
      });
    } catch (err) {
      console.error('Export to calendar failed:', err);
      setSuccessInfo({
        count: 0,
        dateFormatted: '',
        targetIso: new Date().toISOString(),
        platforms: platformLabels(selectedPlatforms),
        refused: [`Could not reach the calendar: ${err instanceof Error ? err.message : 'unknown error'}`],
      });
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg" hideClose className="flex flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="p-5 border-b border-line bg-surface/90 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold text-ink">
              Send this to the Calendar
            </DialogTitle>
            <p className="mt-1 text-xs text-ink-muted">
              {isCarousel
                ? `${slides.length} slides — the Calendar queues them; it does not publish them.`
                : 'The Calendar queues this post; it does not publish it.'}
            </p>
          </div>
          <DialogClose
            aria-label="Close export dialog"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors kt-focus"
          >
            <Icon name="close" size={18} />
          </DialogClose>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {successInfo !== null ? (
            /* Result State — nothing is claimed until the calendar actually took the row */
            <div className="text-center py-6 px-4 space-y-4 animate-in">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${
                  successInfo.count > 0
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-danger/30 bg-danger/10 text-danger-ink'
                }`}
              >
                <Icon name={successInfo.count > 0 ? 'check_circle' : 'error'} size={30} />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  {successInfo.count > 0
                    ? `${successInfo.count} post${successInfo.count > 1 ? 's' : ''} queued in the Calendar`
                    : 'Nothing was queued'}
                </h3>
                {successInfo.dateFormatted && (
                  <p className="mt-1 text-xs font-medium text-ink">
                    Queued for <span className="text-primary">{successInfo.dateFormatted}</span>
                  </p>
                )}
                {successInfo.platforms.length > 0 && (
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Channels: {successInfo.platforms.join(', ')}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-ink-muted">
                  Queued, not published — post it yourself, then mark it on the Calendar.
                </p>
                {successInfo.refused.length > 0 && (
                  <ul className="mx-auto mt-2 max-w-[42ch] space-y-1 rounded-card border border-danger/30 bg-danger/10 p-2.5 text-left text-[12px] text-ink">
                    {successInfo.refused.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
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
                >
                  Open in Calendar
                </Button>
                <Button variant="secondary" size="md" onClick={onClose}>
                  Back to the card
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Timing */}
              <div className="p-4 bg-surface-2/40 border border-line rounded-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <Icon name="calendar_today" size={15} className="text-primary" />
                    When it goes out
                  </span>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="kt-post-now"
                      checked={markAsPublishedNow}
                      onCheckedChange={setMarkAsPublishedNow}
                    />
                    <Label htmlFor="kt-post-now" className="text-[11px] font-medium text-ink">
                      Post now
                    </Label>
                  </div>
                </div>

                {!markAsPublishedNow && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Drop date" className="gap-1">
                        {({ id }) => (
                          <Input
                            id={id}
                            type="date"
                            required
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                          />
                        )}
                      </Field>

                      <Field label="Drop time" className="gap-1">
                        {({ id }) => (
                          <Input
                            id={id}
                            type="time"
                            required
                            value={selectedTime}
                            onChange={(e) => setSelectedTime(e.target.value)}
                          />
                        )}
                      </Field>
                    </div>

                    {/* Quick Timing Presets */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] text-ink-muted font-medium block">Or pick a slot</span>
                      <div className="flex flex-wrap gap-1.5">
                        {TIMING_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleQuickPreset(preset.id)}
                            className="kt-focus cursor-pointer rounded-btn border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-muted hover:border-line-strong hover:text-ink"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Carousel Sequence Strategy (Only if multi-slide) */}
              {isCarousel && slides.length > 1 && !markAsPublishedNow && (
                <div className="space-y-2">
                  <span className="text-[13px] font-semibold text-ink block">How the deck goes out</span>
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                    role="radiogroup"
                    aria-label="How the deck goes out"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={carouselStrategy === 'same_day'}
                      onClick={() => setCarouselStrategy('same_day')}
                      className={`cursor-pointer rounded-btn border p-3 text-left transition-colors kt-focus ${
                        carouselStrategy === 'same_day'
                          ? 'border-primary bg-primary-soft/30 text-ink'
                          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <span className="text-xs font-semibold text-ink block">All at once</span>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        {slides.length} slides on {selectedDate} at {selectedTime}.
                      </p>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={carouselStrategy === 'cadence'}
                      onClick={() => setCarouselStrategy('cadence')}
                      className={`cursor-pointer rounded-btn border p-3 text-left transition-colors kt-focus ${
                        carouselStrategy === 'cadence'
                          ? 'border-primary bg-primary-soft/30 text-ink'
                          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <span className="text-xs font-semibold text-ink block">One slide a day</span>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        Slide 1 on {selectedDate}, the rest on the days after, each at {selectedTime}.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Destination Social Channels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink">
                    Where it goes ({selectedPlatforms.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAllPlatforms}
                    className="text-[11px] cursor-pointer font-medium text-primary underline-offset-2 kt-focus rounded-sm hover:underline"
                  >
                    {selectedPlatforms.length === ALL_PLATFORMS.length ? 'Clear' : 'All platforms'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ALL_PLATFORMS.map((plat) => {
                    const active = selectedPlatforms.includes(plat.id);
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => togglePlatform(plat.id)}
                        className={`flex items-center gap-2 rounded-btn border p-2.5 text-left text-xs font-semibold transition-colors cursor-pointer kt-focus ${
                          active
                            ? 'bg-primary-soft text-primary border-primary'
                            : 'bg-surface text-ink-muted border-line hover:border-line-strong hover:text-ink'
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

              {/* Post Summary Manifest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink">What gets exported ({slides.length})</span>
                  <span className="text-[11px] text-ink-muted">
                    {formatLabel(state.format)} · {state.aspectRatio}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-line rounded-card p-2 bg-app/40">
                  {slides.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      className="p-2 rounded-lg bg-surface border border-line/70 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="w-5 h-5 rounded bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
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

                      <span className="text-[11px] text-ink-muted font-mono shrink-0">
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
                icon={isPublishing ? 'progress_activity' : 'calendar_month'}
                iconSpin={isPublishing}
                disabled={isPublishing || selectedPlatforms.length === 0}
                onClick={handleExportToCalendar}
              >
                <span>
                  {isPublishing
                    ? 'Queuing…'
                    : markAsPublishedNow
                    ? `Queue ${slides.length} for today`
                    : `Queue ${slides.length} for ${selectedDate} · ${selectedTime}`}
                </span>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
