import React, { useState, useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, Badge } from '@/components/ui';
import { useStore } from '@/lib/store';
import type { SocialPlatform } from '@/lib/types';

interface CalendarQuickScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  onEventCreated?: (scheduledAt: string) => void;
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

export const CalendarQuickScheduleModal: React.FC<CalendarQuickScheduleModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  onEventCreated,
}) => {
  const { schedulePost } = useStore();
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [postType, setPostType] = useState<'static' | 'reel' | 'carousel'>('static');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Date and Time state
  const [dateStr, setDateStr] = useState(() => {
    const d = defaultDate ? new Date(defaultDate) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const [timeStr, setTimeStr] = useState('10:00');

  // Selected platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([
    'instagram',
    'linkedin',
  ]);

  useEffect(() => {
    if (defaultDate) {
      const d = new Date(defaultDate);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        setDateStr(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        const hours = pad(d.getHours());
        const mins = pad(d.getMinutes());
        setTimeStr(`${hours}:${mins}`);
      }
    }
  }, [defaultDate, isOpen]);

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

  const handleApplyPresetTime = (hours: number, minutes: number, dayOffset = 0) => {
    const target = new Date();
    target.setDate(target.getDate() + dayOffset);
    const pad = (n: number) => String(n).padStart(2, '0');
    setDateStr(`${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`);
    setTimeStr(`${pad(hours)}:${pad(minutes)}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`);
      const scheduledIso = !isNaN(combinedDateTime.getTime())
        ? combinedDateTime.toISOString()
        : new Date().toISOString();

      const parsedTags = hashtags
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`));

      // Default visual thumbnail placeholder based on format
      const defaultThumb =
        postType === 'reel'
          ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80'
          : 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80';

      const res = await schedulePost({
        videoId: `manual_${Date.now()}`,
        videoTitle: title.trim(),
        fileUrl: defaultThumb,
        thumbnailUrl: defaultThumb,
        platforms: selectedPlatforms,
        captionText: caption.trim(),
        hashtags: parsedTags,
        scheduledAt: scheduledIso,
        status: 'scheduled',
      });

      if (res.ok) {
        onEventCreated?.(scheduledIso);
        onClose();
        setTitle('');
        setCaption('');
        setHashtags('');
      }
    } catch (err) {
      console.error('Failed to create calendar schedule event:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-modal-title"
    >
      <div
        className="w-full max-w-lg bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-line bg-surface/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Icon name="event_available" size={22} />
            </div>
            <div>
              <h2 id="calendar-modal-title" className="text-base font-bold text-ink">
                Schedule Calendar Drop
              </h2>
              <p className="text-xs text-ink-muted">
                Add a scheduled post directly to this calendar date
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Post Title */}
          <div>
            <label className="text-xs font-semibold text-ink uppercase tracking-wider block mb-1.5">
              Post Title / Topic *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 5 Rules of High-Converting Static Carousels"
              className="w-full px-3 py-2 text-sm bg-app border border-line rounded-xl text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            />
          </div>

          {/* Post Format Selector */}
          <div>
            <label className="text-xs font-semibold text-ink uppercase tracking-wider block mb-1.5">
              Format Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'static', label: 'Static Post', icon: 'photo_size_select_actual' },
                { id: 'carousel', label: 'Carousel Deck', icon: 'layers' },
                { id: 'reel', label: 'Video Reel', icon: 'smart_display' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setPostType(fmt.id as any)}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    postType === fmt.id
                      ? 'bg-primary-soft text-primary border-primary shadow-xs'
                      : 'bg-surface text-ink-muted border-line hover:border-line-strong'
                  }`}
                >
                  <Icon name={fmt.icon} size={15} />
                  <span>{fmt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time Picker */}
          <div className="p-3.5 bg-surface-2/40 border border-line rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="calendar_today" size={14} className="text-primary" />
                Schedule Date &amp; Time
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <span className="text-[11px] text-ink-muted block mb-1">Date:</span>
                <input
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <span className="text-[11px] text-ink-muted block mb-1">Time:</span>
                <input
                  type="time"
                  required
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Quick timing presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-ink-muted uppercase tracking-wider mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => handleApplyPresetTime(10, 0, 0)}
                className="px-2 py-0.5 rounded text-[10.5px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
              >
                Today 10:00 AM
              </button>
              <button
                type="button"
                onClick={() => handleApplyPresetTime(9, 15, 1)}
                className="px-2 py-0.5 rounded text-[10.5px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
              >
                Tomorrow 09:15 AM
              </button>
              <button
                type="button"
                onClick={() => handleApplyPresetTime(18, 45, 1)}
                className="px-2 py-0.5 rounded text-[10.5px] bg-surface border border-line hover:border-primary/50 text-ink-muted hover:text-ink cursor-pointer"
              >
                Tomorrow 06:45 PM
              </button>
            </div>
          </div>

          {/* Platform Channel Selectors */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                Destination Platforms ({selectedPlatforms.length})
              </label>
              <button
                type="button"
                onClick={handleSelectAllPlatforms}
                className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
              >
                {selectedPlatforms.length === ALL_PLATFORMS.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_PLATFORMS.map((plat) => {
                const active = selectedPlatforms.includes(plat.id);
                return (
                  <button
                    key={plat.id}
                    type="button"
                    onClick={() => togglePlatform(plat.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer ${
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

          {/* Caption & Hashtags */}
          <div>
            <label className="text-xs font-semibold text-ink uppercase tracking-wider block mb-1.5">
              Caption (Optional)
            </label>
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write your post caption, hook, or notes for this drop..."
              className="w-full px-3 py-2 text-xs bg-app border border-line rounded-xl text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink uppercase tracking-wider block mb-1.5">
              Hashtags (Optional)
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#contentcreation #solocreator #viral"
              className="w-full px-3 py-1.5 text-xs bg-app border border-line rounded-xl text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-3 border-t border-line flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" onClick={onClose} type="button" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              icon={isSubmitting ? undefined : 'schedule_send'}
              disabled={isSubmitting || !title.trim()}
              className="shadow-md"
            >
              {isSubmitting ? 'Scheduling Drop...' : `Schedule for ${dateStr}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
