import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, PageHeader, PageShell, StatusPill, Badge } from '@/components/ui';
import { channels as initialChannels, recommendedTags } from '@/data/mock';
import { useStore, useDisplayProfile } from '@/lib/store';
import { useNavPayload } from '@/lib/nav';
import type { SocialPlatform } from '@/lib/types';
import {
  generateMultiPlatformCopy,
  exportManualAssistPackage,
  type PlatformCopyBundle,
} from '@/lib/publishEngine';

const PLATFORM_MAP: Record<string, SocialPlatform> = {
  ig: 'instagram',
  yt: 'youtube',
  tt: 'tiktok',
  li: 'linkedin',
  x: 'x',
  threads: 'threads',
  fb: 'facebook',
};

const PEAK_SLOTS = [
  { label: 'Tomorrow 09:15 AM', desc: 'Morning Peak (IG & LI)', offsetHours: 9.25, offsetDays: 1 },
  { label: 'Tomorrow 01:30 PM', desc: 'Lunch Break (YT & TT)', offsetHours: 13.5, offsetDays: 1 },
  { label: 'Tomorrow 06:45 PM', desc: 'Evening Commute (Viral)', offsetHours: 18.75, offsetDays: 1 },
  { label: 'Saturday 11:00 AM', desc: 'Weekend Prime', offsetHours: 11, offsetDays: 2 },
];

function getFormattedSlotDate(offsetDays: number, offsetHours: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const hours = Math.floor(offsetHours);
  const minutes = Math.floor((offsetHours % 1) * 60);
  d.setHours(hours, minutes, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toSlotValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PublishSchedule() {
  const profile = useDisplayProfile();
  const { videos, scheduled, schedulePost, updateScheduled, publishNow, activeDraft } = useStore();

  const readyVideos = useMemo(
    () => videos.filter((v) => v.status === 'ready' || v.status === 'processing'),
    [videos],
  );

  const [on, setOn] = useState<Record<string, boolean>>({
    ig: true,
    yt: true,
    tt: true,
    li: true,
    x: false,
    threads: false,
    fb: false,
  });

  const [previewPlatform, setPreviewPlatform] = useState<
    'instagram' | 'youtube' | 'tiktok' | 'linkedin' | 'x'
  >('instagram');

  const [videoId, setVideoId] = useState<string>(() => {
    if (activeDraft?.sourceVideo?.id && videos.some((v) => v.id === activeDraft.sourceVideo?.id)) {
      return activeDraft.sourceVideo.id;
    }
    return readyVideos[0]?.id ?? '';
  });

  const selectedVideo = videos.find((v) => v.id === videoId) ?? readyVideos[0];

  // Multi-platform tailored copy state
  const [copyBundle, setCopyBundle] = useState<PlatformCopyBundle>(() => {
    const initialTitle = activeDraft?.title || selectedVideo?.title || '5 AI Creator Systems';
    const initialHook = activeDraft?.idea?.hook;
    const initialCaption = activeDraft?.publishing?.caption;
    const bundle = generateMultiPlatformCopy(initialTitle, initialHook);
    if (initialCaption) {
      bundle.instagram.caption = initialCaption;
    }
    return bundle;
  });

  const [slot, setSlot] = useState<string>(() => getFormattedSlotDate(1, 9.25));
  const [busy, setBusy] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);

  // "Edit in Composer" from the Calendar deep-links here with the row to change. The composer
  // otherwise always creates new posts, so that id has to survive until save.
  const navPayload = useNavPayload<{ editingPostId?: string }>('publish-schedule');
  const [editingPostId, setEditingPostId] = useState<string | undefined>(navPayload?.editingPostId);
  const appliedEditRef = useRef(false);
  // The auto-copy effect below refills the composer from Gemini on mount; in edit mode that
  // would overwrite the caption the creator just asked to change.
  const skipAutoCopyRef = useRef(!!navPayload?.editingPostId);
  const editingPost = editingPostId ? scheduled.find((p) => p.id === editingPostId) : undefined;

  useEffect(() => {
    const id = navPayload?.editingPostId;
    if (!id || appliedEditRef.current) return;
    const post = scheduled.find((p) => p.id === id);
    if (!post) return;
    appliedEditRef.current = true;
    setEditingPostId(id);
    setSlot(toSlotValue(post.scheduled_at));
    setCopyBundle((prev) => ({
      ...prev,
      instagram: {
        ...prev.instagram,
        caption: post.caption_text || '',
        hashtags: post.hashtags?.length ? post.hashtags : prev.instagram.hashtags,
      },
    }));
  }, [navPayload, scheduled]);

  // Synchronize videoId when activeDraft sourceVideo changes
  useEffect(() => {
    if (activeDraft?.sourceVideo?.id) {
      setVideoId(activeDraft.sourceVideo.id);
    }
  }, [activeDraft?.sourceVideo?.id]);

  // Synchronize initial copy when activeDraft caption is set
  useEffect(() => {
    if (activeDraft?.publishing?.caption) {
      setCopyBundle((prev) => ({
        ...prev,
        instagram: {
          ...prev.instagram,
          caption: activeDraft.publishing?.caption || prev.instagram.caption,
          hashtags: activeDraft.publishing?.hashtags || prev.instagram.hashtags,
        },
      }));
    }
  }, [activeDraft?.publishing?.caption]);

  // Sync real Gemini AI copy when video changes
  useEffect(() => {
    if (skipAutoCopyRef.current) {
      skipAutoCopyRef.current = false;
      return;
    }
    let cancelled = false;
    async function loadLiveCopy() {
      if (!selectedVideo) return;
      try {
        const res = await fetch('/api/caption/generate-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: selectedVideo.id,
            videoTitle: selectedVideo.title,
            tone: 'Viral & Punchy',
            forceRefresh: false,
          }),
        });
        const data = await res.json();
        if (!cancelled && data && data.success && data.data) {
          setCopyBundle({
            instagram: {
              caption: data.data.instagram?.caption_text || data.data.instagram?.caption || '',
              hashtags: data.data.instagram?.hashtags || ['reels', 'creator'],
            },
            youtube: {
              title: data.data.youtube?.suggestedTitle || selectedVideo.title,
              description: data.data.youtube?.caption_text || data.data.youtube?.caption || '',
              tags: data.data.youtube?.hashtags || ['shorts', 'creator'],
            },
            tiktok: {
              caption: data.data.tiktok?.caption_text || data.data.tiktok?.caption || '',
              hashtags: data.data.tiktok?.hashtags || ['tiktoktips', 'creator'],
            },
            linkedin: {
              postText: data.data.linkedin?.caption_text || data.data.linkedin?.caption || '',
              slideOutline: copyBundle.linkedin.slideOutline,
              hashtags: data.data.linkedin?.hashtags || ['ContentStrategy', 'Productivity'],
            },
            x: {
              thread: [data.data.x?.caption_text || data.data.x?.caption || ''],
              hashtags: data.data.x?.hashtags || ['CreatorEconomy', 'Video'],
            },
            threads: {
              postText: data.data.threads?.caption_text || data.data.threads?.caption || '',
              hashtags: data.data.threads?.hashtags || ['threads', 'creator'],
            },
            facebook: {
              postText: data.data.facebook?.caption_text || data.data.facebook?.caption || '',
              hashtags: data.data.facebook?.hashtags || ['creators', 'video'],
            },
          });
        }
      } catch (e) {
        if (!cancelled) {
          const generated = generateMultiPlatformCopy(selectedVideo.title);
          setCopyBundle(generated);
        }
      }
    }
    loadLiveCopy();
    return () => {
      cancelled = true;
    };
  }, [selectedVideo?.id]);

  const activeChannels = useMemo(
    () =>
      initialChannels
        .concat([
          { id: 'threads', name: 'Threads', handle: '', icon: 'alternate_email', connected: false, on: false },
        ])
        // Without OAuth the only identity the app knows is the handle saved in Settings.
        .map((c) => ({ ...c, handle: c.handle || profile.handle }))
        .filter((c) => on[c.id]),
    [on, profile.handle],
  );

  const handleRegenerateCopy = async () => {
    if (!selectedVideo) return;
    setGeneratingCopy(true);
    setFlash(null);
    try {
      const res = await fetch('/api/caption/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: selectedVideo.id,
          videoTitle: selectedVideo.title,
          tone: 'Viral & Punchy',
          forceRefresh: true,
        }),
      });
      const data = await res.json();
      if (data && data.success && data.data) {
        setCopyBundle({
          instagram: {
            caption: data.data.instagram?.caption_text || data.data.instagram?.caption || copyBundle.instagram.caption,
            hashtags: data.data.instagram?.hashtags || copyBundle.instagram.hashtags,
          },
          youtube: {
            title: data.data.youtube?.suggestedTitle || selectedVideo.title,
            description: data.data.youtube?.caption_text || data.data.youtube?.caption || copyBundle.youtube.description,
            tags: data.data.youtube?.hashtags || copyBundle.youtube.tags,
          },
          tiktok: {
            caption: data.data.tiktok?.caption_text || data.data.tiktok?.caption || copyBundle.tiktok.caption,
            hashtags: data.data.tiktok?.hashtags || copyBundle.tiktok.hashtags,
          },
          linkedin: {
            postText: data.data.linkedin?.caption_text || data.data.linkedin?.caption || copyBundle.linkedin.postText,
            slideOutline: copyBundle.linkedin.slideOutline,
            hashtags: data.data.linkedin?.hashtags || copyBundle.linkedin.hashtags,
          },
          x: {
            thread: [data.data.x?.caption_text || data.data.x?.caption || (copyBundle.x.thread[0] || '')],
            hashtags: data.data.x?.hashtags || copyBundle.x.hashtags,
          },
          threads: {
            postText: data.data.threads?.caption_text || data.data.threads?.caption || copyBundle.threads.postText,
            hashtags: data.data.threads?.hashtags || copyBundle.threads.hashtags,
          },
          facebook: {
            postText: data.data.facebook?.caption_text || data.data.facebook?.caption || copyBundle.facebook.postText,
            hashtags: data.data.facebook?.hashtags || copyBundle.facebook.hashtags,
          },
        });
        setFlash({ tone: 'ok', msg: 'âœ“ Gemini AI generated fresh platform-tailored copy for all channels!' });
      } else {
        throw new Error(data?.error || 'AI copy generation failed');
      }
    } catch (err: any) {
      const title = selectedVideo?.title || activeDraft?.title || 'Creator Video';
      const hook = activeDraft?.idea?.hook;
      const generated = generateMultiPlatformCopy(title, hook);
      setCopyBundle(generated);
      setFlash({ tone: 'ok', msg: 'Generated fresh multi-platform copy tailored for each destination!' });
    } finally {
      setGeneratingCopy(false);
    }
  };

  const handleScheduleDispatch = async () => {
    setFlash(null);
    if (!selectedVideo) {
      setFlash({ tone: 'err', msg: 'Please select or upload a video clip first.' });
      return;
    }
    if (activeChannels.length === 0) {
      setFlash({ tone: 'err', msg: 'Select at least one publishing destination.' });
      return;
    }

    setBusy(true);
    const platforms = activeChannels.map((c) => PLATFORM_MAP[c.id] || (c.id as SocialPlatform)).filter(Boolean);

    try {
      if (editingPostId) {
        // One Calendar row = one channel, so an edit updates that row only; the channel
        // toggles above apply to a new dispatch, not to the post being fixed.
        const res = await updateScheduled(editingPostId, {
          videoTitle: selectedVideo.title,
          captionText: copyBundle.instagram.caption,
          hashtags: copyBundle.instagram.hashtags,
          scheduledAt: slot ? new Date(slot).toISOString() : undefined,
        });
        setFlash(
          res.ok
            ? { tone: 'ok', msg: res.message || 'Updated the scheduled post.' }
            : { tone: 'err', msg: res.message || 'Could not update the scheduled post.' },
        );
        if (res.ok) setEditingPostId(undefined);
        return;
      }

      const res = await schedulePost({
        videoId: selectedVideo.id,
        videoTitle: selectedVideo.title,
        fileUrl: selectedVideo.file_url,
        thumbnailUrl: selectedVideo.thumbnail_url,
        platforms,
        captionText: copyBundle.instagram.caption,
        hashtags: copyBundle.instagram.hashtags,
        scheduledAt: slot ? new Date(slot).toISOString() : undefined,
      });

      setFlash(
        res.ok
          ? {
              tone: 'ok',
              msg: res.message || `Scheduled across ${platforms.length} platform${platforms.length > 1 ? 's' : ''}!`,
            }
          : { tone: 'err', msg: res.message || 'Scheduling failed.' },
      );
    } catch (err: any) {
      setFlash({ tone: 'err', msg: err?.message || 'Failed to schedule post.' });
    } finally {
      setBusy(false);
    }
  };

  const handlePublishNow = async () => {
    setFlash(null);
    if (!selectedVideo) return;
    setBusy(true);
    const platforms = activeChannels.map((c) => PLATFORM_MAP[c.id] || (c.id as SocialPlatform)).filter(Boolean);

    try {
      const res = await schedulePost({
        videoId: selectedVideo.id,
        videoTitle: selectedVideo.title,
        fileUrl: selectedVideo.file_url,
        thumbnailUrl: selectedVideo.thumbnail_url,
        platforms,
        captionText: copyBundle.instagram.caption,
        hashtags: copyBundle.instagram.hashtags,
        scheduledAt: new Date().toISOString(),
      });

      if (!res.ok) {
        setFlash({ tone: 'err', msg: res.message || 'Could not schedule the post.' });
        return;
      }

      // No channel API is connected, so this only marks the posts as done inside KontentOS.
      const ids = res.ids || [];
      const results = await Promise.allSettled(ids.map((id) => publishNow(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (failed > 0) {
        setFlash({ tone: 'err', msg: `${failed} of ${ids.length} channel(s) could not be marked as published.` });
      } else {
        setFlash({
          tone: 'ok',
          msg: `Marked as published on ${ids.length} channel(s) in KontentOS. Nothing was sent to the platforms — no channel is connected yet, so post it yourself with "Export Bundle".`,
        });
      }
    } catch (err: any) {
      setFlash({ tone: 'err', msg: err?.message || 'Publish now failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleExportManualBundle = () => {
    exportManualAssistPackage(
      copyBundle,
      selectedVideo?.title || activeDraft?.title || 'Reel_Post',
      selectedVideo?.file_url,
    );
    setFlash({ tone: 'ok', msg: 'Downloaded complete multi-platform manual-assist bundle (.txt)!' });
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Omnichannel Publisher"
        icon="schedule_send"
        title="Publish & Multi-Channel Composer"
        description="Simultaneously package, preview, and syndicate your video across all creator channels."
        actions={
          <>
            <Button variant="secondary" icon="download" onClick={handleExportManualBundle}>
              Export Bundle
            </Button>
            <Button icon="send" onClick={handleScheduleDispatch} disabled={busy || !selectedVideo}>
              {busy ? 'Schedulingâ€¦' : 'Schedule Dispatch'}
            </Button>
          </>
        }
        className="mb-6"
      />

      {/* Flash Alert Message */}
      {flash && (
        <div
          className={`mb-5 flex items-center justify-between rounded-card border px-4 py-3 text-[13.5px] animate-[slidein_.2s_ease] ${
            flash.tone === 'ok'
              ? 'border-primary/40 bg-primary-soft text-ink'
              : 'border-danger/40 bg-danger/10 text-ink'
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon
              name={flash.tone === 'ok' ? 'check_circle' : 'error'}
              size={18}
              className={flash.tone === 'ok' ? 'text-primary' : 'text-danger'}
            />
            <span>{flash.msg}</span>
          </div>
          <button onClick={() => setFlash(null)} className="text-ink-dim hover:text-ink">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Editing an existing Calendar row instead of creating a new dispatch */}
      {editingPost && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-card border border-tertiary/40 bg-tertiary/10 px-4 py-2.5 text-[13px]">
          <span className="flex items-center gap-2 text-ink">
            <Icon name="edit_note" size={17} className="text-tertiary" />
            Editing <strong className="font-semibold">{editingPost.video_title || 'this post'}</strong>
            <span className="text-ink-dim">
              ({editingPost.platform}) — “Schedule Dispatch” updates this row instead of creating a new one.
            </span>
          </span>
          <button
            onClick={() => setEditingPostId(undefined)}
            className="text-ink-dim hover:text-ink font-medium underline underline-offset-2"
          >
            Stop editing
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        {/* Left Column: Composer Controls */}
        <div className="space-y-5 min-w-0">
          {/* 1. Source Video Selection */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-ink text-[15px] flex items-center gap-2">
                <Icon name="movie" size={18} className="text-primary" /> Source Composition
              </h2>
              {selectedVideo && (
                <span className="text-xs text-ink-dim font-mono">
                  Duration: {Math.round(selectedVideo.duration || 0)}s Â· 9:16
                </span>
              )}
            </div>

            {readyVideos.length === 0 ? (
              <div className="flex items-center gap-3 rounded-card border border-dashed border-line bg-surface-2 p-5 text-xs text-ink-muted">
                <Icon name="upload" size={24} className="text-primary shrink-0" />
                <div>
                  <div className="font-semibold text-ink">No uploaded clips found</div>
                  <p className="mt-0.5">Upload a raw clip or assemble a reel in Raw Studio to publish it here.</p>
                </div>
              </div>
            ) : (
              <select
                value={selectedVideo?.id ?? ''}
                onChange={(e) => setVideoId(e.target.value)}
                className="w-full rounded-btn border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary font-medium"
              >
                {readyVideos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} ({Math.round(v.duration || 0)}s)
                  </option>
                ))}
              </select>
            )}
          </Card>

          {/* 2. Destination Matrix */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-ink text-[15px] flex items-center gap-2">
                  <Icon name="hub" size={18} className="text-primary" /> Publishing Destinations
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Choose where this dispatch goes. No platform API is connected yet, so KontentOS packages the
                  bundle and records the schedule — you post it yourself.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setOn({ ig: true, yt: true, tt: true, li: true, x: true, threads: true, fb: true })}
                  className="text-primary hover:underline font-medium"
                >
                  Select All
                </button>
                <span className="text-line">|</span>
                <button
                  onClick={() => setOn({ ig: false, yt: false, tt: false, li: false, x: false, threads: false, fb: false })}
                  className="text-ink-dim hover:underline font-medium"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'ig', name: 'Instagram Reels', handle: profile.handle, icon: 'photo_camera' },
                { id: 'yt', name: 'YouTube Shorts', handle: profile.name, icon: 'smart_display' },
                { id: 'tt', name: 'TikTok', handle: profile.handle, icon: 'music_note' },
                { id: 'li', name: 'LinkedIn', handle: profile.name, icon: 'business' },
                { id: 'x', name: 'X / Twitter', handle: profile.handle, icon: 'tag' },
                { id: 'threads', name: 'Threads', handle: profile.handle, icon: 'alternate_email' },
                { id: 'fb', name: 'Facebook Reels', handle: `${profile.name} Page`, icon: 'groups' },
              ].map((c) => {
                const active = !!on[c.id];
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setOn((s) => ({ ...s, [c.id]: !s[c.id] }));
                      if (c.id === 'ig') setPreviewPlatform('instagram');
                      else if (c.id === 'yt') setPreviewPlatform('youtube');
                      else if (c.id === 'tt') setPreviewPlatform('tiktok');
                      else if (c.id === 'li') setPreviewPlatform('linkedin');
                      else if (c.id === 'x') setPreviewPlatform('x');
                    }}
                    className={`text-left rounded-card border p-3 flex items-center gap-2.5 transition-all kt-focus ${
                      active
                        ? 'border-primary bg-primary-soft ring-1 ring-primary/25 shadow-2xs'
                        : 'border-line hover:border-line-strong bg-surface'
                    }`}
                  >
                    <span
                      className={`grid place-items-center w-9 h-9 rounded-btn shrink-0 ${
                        active ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink-muted'
                      }`}
                    >
                      <Icon name={c.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink truncate">{c.name}</span>
                      <span className="block text-[11px] text-ink-dim truncate">{c.handle}</span>
                    </span>
                    <span
                      className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                        active ? 'bg-primary border-primary text-on-primary' : 'border-line bg-surface-2'
                      }`}
                    >
                      {active && <Icon name="check" size={12} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* 3. Multi-Format AI Copy Editor */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-semibold text-ink text-[15px] flex items-center gap-2">
                  <Icon name="auto_fix_high" size={18} className="text-tertiary" /> Platform-Tailored Copy
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  AI dynamically reformulates hooks, captions, and hashtags per channel
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={generatingCopy ? 'hourglass_top' : 'auto_awesome'}
                onClick={handleRegenerateCopy}
                disabled={generatingCopy || !selectedVideo}
              >
                {generatingCopy ? 'Gemini AI Generating...' : 'Re-Generate AI Copy'}
              </Button>
            </div>

            {/* Platform Sub-Tabs */}
            <div className="flex rounded-btn bg-surface-2 p-1 border border-line mb-3 overflow-x-auto">
              {[
                { id: 'instagram', label: 'Instagram' },
                { id: 'youtube', label: 'YouTube' },
                { id: 'tiktok', label: 'TikTok' },
                { id: 'linkedin', label: 'LinkedIn' },
                { id: 'x', label: 'X / Thread' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPreviewPlatform(tab.id as any)}
                  className={`flex-1 py-1.5 px-3 rounded-btn text-xs font-semibold whitespace-nowrap transition-all ${
                    previewPlatform === tab.id
                      ? 'bg-surface text-ink shadow-2xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tabbed Content Editors */}
            {previewPlatform === 'instagram' && (
              <div className="space-y-3">
                <textarea
                  rows={5}
                  value={copyBundle.instagram.caption}
                  onChange={(e) =>
                    setCopyBundle((prev) => ({
                      ...prev,
                      instagram: { ...prev.instagram, caption: e.target.value },
                    }))
                  }
                  className="w-full resize-none rounded-btn border border-line bg-surface-2 p-3 text-[13.5px] text-ink outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-sans leading-relaxed"
                />
                <div className="flex flex-wrap gap-1.5">
                  {copyBundle.instagram.hashtags.map((t) => (
                    <span
                      key={t}
                      className="text-[11.5px] font-medium text-primary bg-primary-soft border border-primary/20 rounded-full px-2.5 py-0.5"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {previewPlatform === 'youtube' && (
              <div className="space-y-3">
                <div>
                  <label className="kt-eyebrow block mb-1">Shorts Title (Under 60 chars)</label>
                  <input
                    type="text"
                    value={copyBundle.youtube.title}
                    onChange={(e) =>
                      setCopyBundle((prev) => ({
                        ...prev,
                        youtube: { ...prev.youtube, title: e.target.value },
                      }))
                    }
                    className="w-full rounded-btn border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-primary font-semibold"
                  />
                </div>
                <div>
                  <label className="kt-eyebrow block mb-1">Description with Timestamps</label>
                  <textarea
                    rows={4}
                    value={copyBundle.youtube.description}
                    onChange={(e) =>
                      setCopyBundle((prev) => ({
                        ...prev,
                        youtube: { ...prev.youtube, description: e.target.value },
                      }))
                    }
                    className="w-full resize-none rounded-btn border border-line bg-surface-2 p-3 text-[13px] text-ink outline-none focus:border-primary font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {previewPlatform === 'tiktok' && (
              <div className="space-y-3">
                <textarea
                  rows={4}
                  value={copyBundle.tiktok.caption}
                  onChange={(e) =>
                    setCopyBundle((prev) => ({
                      ...prev,
                      tiktok: { ...prev.tiktok, caption: e.target.value },
                    }))
                  }
                  className="w-full resize-none rounded-btn border border-line bg-surface-2 p-3 text-[13.5px] text-ink outline-none focus:border-primary font-sans leading-relaxed"
                />
              </div>
            )}

            {previewPlatform === 'linkedin' && (
              <div className="space-y-3">
                <textarea
                  rows={6}
                  value={copyBundle.linkedin.postText}
                  onChange={(e) =>
                    setCopyBundle((prev) => ({
                      ...prev,
                      linkedin: { ...prev.linkedin, postText: e.target.value },
                    }))
                  }
                  className="w-full resize-none rounded-btn border border-line bg-surface-2 p-3 text-[13.5px] text-ink outline-none focus:border-primary font-sans leading-relaxed"
                />
              </div>
            )}

            {previewPlatform === 'x' && (
              <div className="space-y-2">
                <label className="kt-eyebrow block">5-Tweet Thread Preview</label>
                {copyBundle.x.thread.map((tweet, i) => (
                  <div key={i} className="p-3 bg-surface-2 rounded-btn border border-line text-xs text-ink leading-relaxed">
                    {tweet}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Platform Simulator & Peak Scheduling */}
        <div className="space-y-5">
          {/* Live Mobile Platform Simulator */}
          <Card className="p-5 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="phone_iphone" size={18} className="text-primary" />
                <h2 className="font-semibold text-ink text-sm">
                  {previewPlatform.charAt(0).toUpperCase() + previewPlatform.slice(1)} Feed Simulator
                </h2>
              </div>
              <StatusPill tone="tertiary">Live Preview</StatusPill>
            </div>

            {/* Mobile Device Viewport */}
            <div className="w-[240px] max-w-full">
              <div className="aspect-[9/19] rounded-[26px] border-[6px] border-ink/90 bg-black overflow-hidden relative shadow-lg text-white">
                {/* Background Video Media */}
                {selectedVideo?.file_url ? (
                  <video
                    src={selectedVideo.file_url}
                    poster={selectedVideo.thumbnail_url}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : selectedVideo?.thumbnail_url ? (
                  <img src={selectedVideo.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(165deg, #285C4D, #1E2522 65%, #000)' }}
                  />
                )}

                {/* Top Notch */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-2 rounded-full bg-black/70 backdrop-blur z-20" />

                {/* Platform Overlay: Instagram / TikTok Style */}
                {(previewPlatform === 'instagram' || previewPlatform === 'tiktok') && (
                  <>
                    {/* Right Action Icons Column */}
                    <div className="absolute right-2.5 bottom-14 z-20 flex flex-col items-center gap-3.5 text-center text-white drop-shadow">
                      <div className="flex flex-col items-center">
                        <Icon name="favorite" size={20} className="text-white" />
                        <span className="text-[9px] font-bold mt-0.5">2.4k</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <Icon name="chat_bubble" size={20} className="text-white" />
                        <span className="text-[9px] font-bold mt-0.5">148</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <Icon name="send" size={20} className="text-white" />
                        <span className="text-[9px] font-bold mt-0.5">Share</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <Icon name="bookmark" size={20} className="text-white" />
                        <span className="text-[9px] font-bold mt-0.5">Save</span>
                      </div>
                    </div>

                    {/* Bottom Author & Caption Bar */}
                    <div className="absolute left-3 right-12 bottom-3 z-20 text-left text-white drop-shadow-md">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-5 h-5 rounded-full bg-primary text-[10px] font-bold grid place-items-center">
                          {profile.initials}
                        </span>
                        <span className="text-[11px] font-bold">{profile.handle}</span>
                      </div>
                      <p className="text-[10px] line-clamp-2 text-white/90 leading-tight">
                        {previewPlatform === 'instagram'
                          ? copyBundle.instagram.caption
                          : copyBundle.tiktok.caption}
                      </p>
                      <div className="flex items-center gap-1 text-[9px] text-white/70 mt-1">
                        <Icon name="music_note" size={10} />
                        <span className="truncate">Original audio Â· {profile.handle}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Platform Overlay: YouTube Shorts */}
                {previewPlatform === 'youtube' && (
                  <div className="absolute left-3 right-3 bottom-3 z-20 text-left text-white drop-shadow">
                    <h5 className="text-[11px] font-bold line-clamp-2 leading-snug mb-1.5">
                      {copyBundle.youtube.title}
                    </h5>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-red-600 text-[10px] font-bold grid place-items-center">
                          {profile.initials}
                        </span>
                        <span className="text-[10.5px] font-semibold">{profile.name}</span>
                      </div>
                      <span className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Subscribe
                      </span>
                    </div>
                  </div>
                )}

                {/* Platform Overlay: LinkedIn / X */}
                {(previewPlatform === 'linkedin' || previewPlatform === 'x') && (
                  <div className="absolute inset-x-2 bottom-3 z-20 bg-black/75 backdrop-blur p-2.5 rounded-card text-left text-white">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-4 h-4 rounded-full bg-primary text-[9px] font-bold grid place-items-center">
                        {profile.initials}
                      </span>
                      <span className="text-[10.5px] font-bold">{profile.name}</span>
                    </div>
                    <p className="text-[9.5px] text-white/90 line-clamp-3 leading-snug">
                      {previewPlatform === 'linkedin'
                        ? copyBundle.linkedin.postText
                        : copyBundle.x.thread[0]}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Peak Timing & Scheduling Card */}
          <Card className="p-5 space-y-3.5">
            <div className="flex items-center gap-2">
              <Icon name="schedule" size={18} className="text-tertiary" />
              <h2 className="font-semibold text-ink text-sm">Peak Engagement Scheduling</h2>
            </div>

            {/* 1-Click Peak Slot Badges */}
            <div className="space-y-1.5">
              <label className="kt-eyebrow block">Recommended AI Peak Slots</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PEAK_SLOTS.map((ps) => (
                  <button
                    key={ps.label}
                    onClick={() => setSlot(getFormattedSlotDate(ps.offsetDays, ps.offsetHours))}
                    className="p-2 rounded-btn border border-line bg-surface hover:bg-surface-2 text-left text-xs transition-all hover:border-primary"
                  >
                    <div className="font-semibold text-ink text-[11.5px] flex items-center gap-1">
                      <Icon name="bolt" size={13} className="text-tertiary" />
                      {ps.label}
                    </div>
                    <div className="text-[10px] text-ink-dim mt-0.5">{ps.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Datetime Input */}
            <div>
              <label className="kt-eyebrow block mb-1">Custom Dispatch Time</label>
              <input
                type="datetime-local"
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                className="w-full rounded-btn border border-line bg-surface-2 px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-line space-y-2">
              <Button
                icon="schedule_send"
                onClick={handleScheduleDispatch}
                disabled={busy || !selectedVideo}
                className="w-full"
              >
                {busy ? 'Scheduling Dispatch...' : 'Schedule Omnichannel Post'}
              </Button>
              <Button
                variant="secondary"
                icon="send"
                onClick={handlePublishNow}
                disabled={busy || !selectedVideo}
                className="w-full"
              >
                Publish Instantly Now
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
