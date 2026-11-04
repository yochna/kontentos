import { useMemo, useRef, useState, useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { AnimatedNumber, Button, Card, PageHeader, PageShell, Progress, Reveal, StatusPill, Badge } from '@/components/ui';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { notify } from '@/components/ui/toast';
import { useNavPayload } from '@/lib/nav';
import { useStore } from '@/lib/store';
import { ingestFeatures } from '@/data/mock';
import { getPreset } from '@/lib/timeline';
import { api } from '@/lib/api';
import type { Video } from '@/lib/types';
import { OfflinePlate, useMediaSource } from '@/components/OfflinePlate';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';

const SUBTITLE_LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Hindi', 'Japanese'];

const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
};

const fmtDuration = (s?: number) =>
  s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '0:00';

const STATUS_TONE: Record<Video['status'], string> = {
  ready: 'primary',
  processing: 'tertiary',
  uploading: 'secondary',
  failed: 'neutral',
};

const fileBase = (title: string) =>
  (title || 'captions').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'captions';

/**
 * The saved subtitle row already holds the server's own `.srt` and `.vtt` text; this writes it out
 * verbatim so the file that drops onto the video is the one the player and the editor both used.
 */
function saveCaptionFile(text: string, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContentLibrary() {
  const {
    videos,
    uploadVideo,
    updateVideo,
    deleteVideo,
    runAutoEdit,
    navigate,
    online,
    loading,
    dbStatus,
  } = useStore();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [inspectVideo, setInspectVideo] = useState<Video | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // One dialog for both delete affordances — the row's trash icon and the inspector's footer —
  // so a clip is never deleted by two different questions.
  const [pendingDelete, setPendingDelete] = useState<Video | null>(null);
  // Deep link from the topbar search: land on the clip the creator typed for.
  const navSearch = useNavPayload<{ searchQuery?: string }>('content-library')?.searchQuery;
  useEffect(() => {
    if (navSearch) setSearchQuery(navSearch);
  }, [navSearch]);
  const fileRef = useRef<HTMLInputElement>(null);

  const used = useMemo(() => videos.reduce((sum, v) => sum + (v.file_size || 0), 0), [videos]);
  const totalSec = useMemo(() => videos.reduce((sum, v) => sum + (v.duration || 0), 0), [videos]);

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.toLowerCase();
    return videos.filter(
      (v) => v.title.toLowerCase().includes(q) || (v.description && v.description.toLowerCase().includes(q)),
    );
  }, [videos, searchQuery]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const list = Array.from(files);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setBusy(true);
      setCurrentFile(file.name);
      setProgress(0);
      try {
        const created = await uploadVideo(file, (pct) => setProgress(pct));
        if (!created) {
          notify.bad(`Upload failed for ${file.name} — the clip never reached the workspace.`);
        }
      } catch (err: any) {
        notify.bad(`Upload of ${file.name} stopped: ${err?.message || 'no answer from the server'}`);
      }
    }

    setBusy(false);
    setCurrentFile(null);
    setTimeout(() => setProgress(0), 800);
  }

  const handleOpenInRawStudio = (video: Video) => {
    navigate('raw-reel', { videoId: video.id });
  };

  const handleOpenInSmartEditor = async (video: Video) => {
    await runAutoEdit(video, getPreset('fast'));
    navigate('smart-editor');
  };

  const removeClip = async (video: Video) => {
    const res = await deleteVideo(video.id);
    if (!res.ok) {
      notify.bad(res.message || `“${video.title}” is still in the vault — the server refused the delete.`);
      return;
    }
    notify.ok(`“${video.title}” deleted.`);
    if (inspectVideo?.id === video.id) setInspectVideo(null);
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Out · Vault"
        icon="grid_view"
        title="Everything you have made"
        description={
          online
            ? 'Every take you have intaked and every cut you have saved, in one searchable grid.'
            : 'Backend offline — showing cached assets.'
        }
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              icon="cloud_upload"
              iconSpin={busy}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? `Uploading ${progress}%` : 'Ingest media'}
            </Button>
          </>
        }
        className="mb-6"
      />

      {/* A surviving record says nothing about its file. When the bytes sit on a disk the host wipes,
          the vault has to say so before anybody trusts it with a month of footage. A bucket that was
          configured but refuses the keys is worse, not better: the footage has nowhere to go at all. */}
      {dbStatus?.media && !dbStatus.media.durable && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-card border border-danger/40 bg-danger/10 px-4 py-3"
        >
          <Icon name="no_photography" size={18} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-ink">
              {dbStatus.media.provider === 'bucket' ? 'Media storage is not accepting clips' : 'Media is not durable here'}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
              {dbStatus.media.provider === 'bucket'
                ? `${dbStatus.media.note} Check the MEDIA_* values in the hosting dashboard — until the bucket answers, an upload has nowhere to put your footage.`
                : `${dbStatus.media.note} Download anything you still need before the service next restarts — ${
                    dbStatus.provider === 'mongodb'
                      ? 'the records, captions and queue stay; the footage does not.'
                      : 'nothing on this workspace survives it, records included.'
                  }`}
            </p>
          </div>
        </div>
      )}

      {/* Storage & Vault Statistics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Icon name="storage" size={16} className="text-primary" /> Workspace Storage
            </div>
            <span className="text-xs font-mono text-ink-dim tabular-nums">{fmtBytes(used)}</span>
          </div>
          {/* No ceiling is drawn: this workspace has no quota behind it, and Render's free disk is
              sized by the host, not promised by us. Only what the vault actually holds is shown. */}
          <p className="text-[11.5px] text-ink-dim">
            {videos.length} {videos.length === 1 ? 'file' : 'files'} on this account · up to 2 GB per clip
          </p>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-ink-dim uppercase tracking-wider font-semibold">Total Assets</div>
            <div className="font-display text-[22px] text-ink font-semibold mt-0.5">{videos.length} clips</div>
          </div>
          <span className="w-10 h-10 rounded-btn bg-primary-soft text-primary grid place-items-center">
            <Icon name="video_library" size={20} />
          </span>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-ink-dim uppercase tracking-wider font-semibold">Total Runtime</div>
            <div className="font-display text-[22px] text-ink font-semibold mt-0.5">
              {Math.floor(totalSec / 60)}m {Math.round(totalSec % 60)}s
            </div>
          </div>
          <span className="w-10 h-10 rounded-btn bg-tertiary/15 text-tertiary grid place-items-center">
            <Icon name="timer" size={20} />
          </span>
        </Card>
      </div>

      {/* Upload Progress Status Banner */}
      {busy && (
        <div className="mb-6 p-4 rounded-card bg-surface-2 border border-line flex items-center justify-between gap-4 kt-dialog">
          <div className="flex items-center gap-3 min-w-0">
            <span className="kt-spin text-primary shrink-0">
              <Icon name="autorenew" size={20} />
            </span>
            <div className="truncate">
              <div className="text-sm font-semibold text-ink truncate">
                Uploading {currentFile || 'media asset'}...
              </div>
              <div className="text-xs text-ink-dim font-mono">
                <AnimatedNumber text={`${progress}% completed`} duration={300} />
              </div>
            </div>
          </div>
          <div className="w-32 shrink-0">
            <Progress value={progress} live />
          </div>
        </div>
      )}

      {/* Main Grid: Assets Shelf + Ingest Dropzone */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Left Column: Search & Videos Grid */}
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Icon
              name="search"
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-dim pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets by title, keyword, or metadata..."
              className="w-full pl-10 pr-4 py-2.5 rounded-btn bg-surface border border-line text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
            />
          </div>

          {/* Video Cards Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} className="h-[140px] animate-pulse bg-surface-2" />
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <Card className="p-12 text-center">
              <span className="grid place-items-center w-14 h-14 rounded-full bg-primary-soft text-primary mx-auto mb-3">
                <Icon name="upload" size={26} />
              </span>
              <h3 className="font-display text-[20px] text-ink">
                {searchQuery ? 'No matching assets found' : 'No uploads in vault yet'}
              </h3>
              <p className="text-[13.5px] text-ink-muted mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? 'Try searching with a different keyword or clear the search query.'
                  : 'Ingest raw phone footage or camera files. KontentOS automatically indexes speech and prepares cuts.'}
              </p>
              {!searchQuery && (
                <Button className="mt-4 mx-auto" icon="cloud_upload" onClick={() => fileRef.current?.click()}>
                  Upload First Clip
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredVideos.map((v, i) => {
                const dur = fmtDuration(v.duration);
                return (
                  <Reveal key={v.id} delay={i * 60} className="h-full">
                  <Card
                    hover
                    sheen
                    onClick={() => setInspectVideo(v)}
                    className="h-full overflow-hidden flex flex-col sm:flex-row cursor-pointer group"
                  >
                    {/* Thumbnail / Video Viewport */}
                    <div className="sm:w-[135px] aspect-[9/16] sm:aspect-auto relative bg-black shrink-0 overflow-hidden">
                      {v.media_available === false ? (
                        <OfflinePlate />
                      ) : v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                      ) : v.file_url ? (
                        <video
                          src={v.file_url}
                          crossOrigin="anonymous"
                          className="w-full h-full object-cover block"
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <div
                          className="w-full h-full"
                          style={{ background: 'linear-gradient(150deg, #285C4D, #1E2522)' }}
                        />
                      )}
                      <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                        <Icon name="play_circle" size={32} />
                      </span>
                      {dur && (
                        <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono font-semibold text-white bg-black/70 backdrop-blur rounded px-1.5 py-0.5">
                          {dur}
                        </span>
                      )}
                    </div>

                    {/* Metadata & Actions */}
                    <div className="p-4 flex flex-col justify-between gap-2 min-w-0 flex-1">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <StatusPill tone={STATUS_TONE[v.status] || 'neutral'} pulse={v.status === 'processing' || v.status === 'uploading'}>
                            {v.status}
                          </StatusPill>
                          <div className="flex items-center gap-1">
                            <Tooltip side="left" content="Open in Raw Studio">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenInRawStudio(v);
                                }}
                                aria-label={`Open ${v.title} in Raw Studio`}
                                className="w-7 h-7 rounded-btn hover:bg-surface-2 grid place-items-center text-ink-muted hover:text-primary transition-colors kt-focus"
                              >
                                <Icon name="movie" size={15} />
                              </button>
                            </Tooltip>
                            <Tooltip side="left" content="Delete clip">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDelete(v);
                                }}
                                aria-label={`Delete ${v.title}`}
                                className="w-7 h-7 rounded-btn hover:bg-danger/10 grid place-items-center text-ink-dim hover:text-danger transition-colors kt-focus"
                              >
                                <Icon name="delete" size={15} />
                              </button>
                            </Tooltip>
                          </div>
                        </div>

                        <h3 className="font-semibold text-sm text-ink leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                          {v.title}
                        </h3>
                        <p className="text-xs text-ink-muted line-clamp-1 mt-0.5">
                          {v.description || 'Raw 1-take recording'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-dim">
                        <span className="font-mono">{fmtBytes(v.file_size || 0)}</span>
                        <span>{new Date(v.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </Card>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Ingest Dropzone & Intelligence Capabilities */}
        <div className="space-y-4">
          <Card className="p-5">
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              className="w-full rounded-card border-2 border-dashed border-line hover:border-primary bg-surface-2/40 grid place-items-center text-center py-8 px-4 transition-colors kt-focus"
            >
              <span className="grid place-items-center w-12 h-12 rounded-full bg-primary-soft text-primary mb-3">
                <Icon name="cloud_upload" size={24} />
              </span>
              <span className="text-[14px] font-semibold text-ink">Drop footage here to ingest</span>
              <span className="text-xs text-ink-dim mt-1">MP4, MOV, WEBM · Up to 2 GB per clip</span>
              <span className="mt-3 text-xs font-semibold text-primary inline-flex items-center gap-1">
                <Icon name="add" size={14} /> Browse local files
              </span>
            </button>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Icon name="auto_awesome" size={18} className="text-tertiary" />
              <h3 className="font-semibold text-ink text-sm">Automated Ingest Intelligence</h3>
            </div>
            <div className="space-y-2.5">
              {ingestFeatures.map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-xs text-ink-muted leading-relaxed">
                  <Icon name="check_circle" size={15} className="text-primary shrink-0 mt-0.5" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Video Detail & Speech Inspector Modal */}
      {inspectVideo && (
        <VideoDetailModal
          // Read from `videos`, not the snapshot taken when the modal opened: a re-linked clip
          // updates its row and the player should come back without closing the inspector.
          video={videos.find((v) => v.id === inspectVideo.id) ?? inspectVideo}
          onClose={() => setInspectVideo(null)}
          onUpdateTitle={async (newTitle) => {
            const res = await updateVideo(inspectVideo.id, { title: newTitle });
            // The inspector only repeats the new name once the row carries it; otherwise the
            // creator is shown a rename that the next load takes back.
            if (res.ok) setInspectVideo((prev) => (prev ? { ...prev, title: newTitle } : null));
            else notify.bad(res.message || 'The rename did not reach the server.');
          }}
          onOpenRawStudio={() => {
            setInspectVideo(null);
            handleOpenInRawStudio(inspectVideo);
          }}
          onOpenSmartEditor={() => {
            setInspectVideo(null);
            handleOpenInSmartEditor(inspectVideo);
          }}
          onDelete={() => setPendingDelete(inspectVideo)}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(next) => { if (!next) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{pendingDelete?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Its file, its captions and every cut made from it go with it. This workspace has no
            recycle bin — the only way back is the file on your phone or camera.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              asChild
              onClick={() => {
                if (pendingDelete) void removeClip(pendingDelete);
              }}
            >
              <Button variant="secondary" icon="delete" className="border-danger/50 text-danger hover:bg-danger/10">
                Delete for good
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function VideoDetailModal({
  video,
  onClose,
  onUpdateTitle,
  onOpenRawStudio,
  onOpenSmartEditor,
  onDelete,
}: {
  video: Video;
  onClose: () => void;
  onUpdateTitle: (title: string) => Promise<void>;
  onOpenRawStudio: () => void;
  onOpenSmartEditor: () => void;
  onDelete: () => void;
}) {
  const { relinkMedia } = useStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(video.title);
  const [subtitles, setSubtitles] = useState<any>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subLang, setSubLang] = useState('English');
  const [currentTime, setCurrentTime] = useState(0);
  const [showPlayerCaptions, setShowPlayerCaptions] = useState(true);
  // The same box carries the transcribe result and its failure, so it remembers which of the two it
  // is holding — a red message in a green box reads as a success to anyone skimming the panel.
  const [subMsg, setSubMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const media = useMediaSource(video.file_url, video.media_available);

  // Check if subtitles already exist for this video
  useEffect(() => {
    let active = true;
    api
      .getSubtitles(video.id)
      .then((res) => {
        if (active && res && res.segments) {
          setSubtitles(res);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [video.id]);

  const handleTranscribe = async () => {
    setLoadingSubs(true);
    setSubMsg(null);
    try {
      const data = await api.transcribeVideo({
        videoId: video.id,
        targetLanguage: subLang,
        forceRefresh: true,
      });
      setSubtitles(data);
      setSubMsg({ text: `Transcribed ${data.segments?.length || 0} live subtitle cues`, ok: true });
    } catch (err: any) {
      setSubMsg({ text: err?.message || 'Failed to transcribe audio', ok: false });
    } finally {
      setLoadingSubs(false);
    }
  };

  const handleCaptionDownload = (kind: 'srt' | 'vtt') => {
    const text = (kind === 'srt' ? subtitles?.srt_content : subtitles?.vtt_content) || '';
    if (!text.trim()) {
      setSubMsg({
        text: `This recording has no .${kind} file on the server yet. Press Re-transcribe to build one.`,
        ok: false,
      });
      return;
    }
    const name = `${fileBase(video.title)}.${kind}`;
    saveCaptionFile(text, name, 'text/plain');
    setSubMsg({ text: `Saved ${name} with ${subtitles?.segments?.length || 0} cues.`, ok: true });
  };

  const parseSec = (t: string | number) => {
    if (typeof t === 'number') return t;
    if (!t) return 0;
    const norm = t.replace(',', '.');
    const p = norm.split(':');
    if (p.length === 3) return +p[0] * 3600 + +p[1] * 60 + +p[2];
    if (p.length === 2) return +p[0] * 60 + +p[1];
    return parseFloat(norm) || 0;
  };

  const activeSegment = subtitles?.segments?.find((s: any) => {
    const st = parseSec(s.start);
    const et = parseSec(s.end);
    return currentTime >= st && currentTime <= et;
  });

  const handleSeek = (sec: number) => {
    if (videoElRef.current) {
      videoElRef.current.currentTime = sec;
      if (videoElRef.current.paused) {
        videoElRef.current.play().catch(() => {});
      }
    }
  };

  const handleSaveTitle = async () => {
    if (titleVal.trim() && titleVal !== video.title) {
      await onUpdateTitle(titleVal.trim());
    }
    setEditingTitle(false);
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg" hideClose className="flex flex-col gap-0 overflow-hidden p-6">
        {/* The visible heading is swapped for an input while the title is being edited, so the
            panel's accessible name comes from this one instead. */}
        <DialogTitle className="sr-only">Details for {video.title}</DialogTitle>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-btn bg-primary-soft text-primary grid place-items-center shrink-0">
              <Icon name="smart_display" size={18} />
            </span>
            <div className="min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleVal}
                    onChange={(e) => setTitleVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                    autoFocus
                    className="px-2 py-1 text-sm font-semibold rounded border border-line bg-surface text-ink"
                  />
                  <Button size="sm" onClick={handleSaveTitle}>
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base text-ink truncate">{video.title}</h3>
                  <button
                    onClick={() => setEditingTitle(true)}
                    className="text-ink-dim hover:text-ink text-xs"
                    title="Edit title"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                </div>
              )}
              <div className="text-xs text-ink-dim font-mono">ID: {video.id}</div>
            </div>
          </div>
          <DialogClose
            className="kt-focus shrink-0 text-ink-muted transition-colors duration-150 hover:text-ink"
            aria-label="Close video details"
          >
            <Icon name="close" size={18} />
          </DialogClose>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {/* Embedded Video Player with Live CC Overlay */}
          <div className="aspect-video rounded-card bg-black overflow-hidden relative shadow-inner group">
            {media.offline ? (
              <OfflinePlate onRelink={async (file) => !!(await relinkMedia(video.id, file))} />
            ) : (
              <video
                ref={videoElRef}
                src={video.file_url}
                crossOrigin="anonymous"
                controls
                playsInline
                onError={media.onError}
                onLoadedData={media.onLoadedData}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                className="w-full h-full object-contain block"
              />
            )}

            {/* Live CC Toggle Button on Player */}
            <Tooltip
              side="bottom"
              content={showPlayerCaptions ? 'Live CC active (click to hide)' : 'Live CC hidden (click to show)'}
            >
              <button
                type="button"
                onClick={() => setShowPlayerCaptions((c) => !c)}
                className={`absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur border shadow-md transition-all ${
                  showPlayerCaptions
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : 'bg-black/60 text-white/70 border-white/20 hover:text-white'
                }`}
              >
                CC {showPlayerCaptions ? 'ON' : 'OFF'}
              </button>
            </Tooltip>

            {/* Synchronized Live Caption Floating Overlay */}
            {showPlayerCaptions && activeSegment && (
              <div className="pointer-events-none absolute bottom-8 inset-x-6 flex justify-center z-20">
                <span className="px-3.5 py-1.5 rounded-lg bg-black/85 backdrop-blur text-white text-xs sm:text-sm font-bold tracking-wide shadow-2xl border border-white/20 text-center animate-pulse max-w-[90%]">
                  {activeSegment.text}
                </span>
              </div>
            )}
          </div>

          {/* Technical Metadata Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-2 p-3.5 rounded-card border border-line text-xs">
            <div>
              <div className="text-ink-dim">Duration</div>
              <div className="font-mono font-semibold text-ink mt-0.5">{fmtDuration(video.duration)}</div>
            </div>
            <div>
              <div className="text-ink-dim">File Size</div>
              <div className="font-mono font-semibold text-ink mt-0.5">{fmtBytes(video.file_size || 0)}</div>
            </div>
            <div>
              <div className="text-ink-dim">Aspect Ratio</div>
              <div className="font-semibold text-ink mt-0.5">{video.aspect_ratio || '9:16 Vertical'}</div>
            </div>
            <div>
              <div className="text-ink-dim">Ingested Date</div>
              <div className="font-semibold text-ink mt-0.5">
                {new Date(video.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Speech Transcription & Audio Highlights Panel */}
          <div className="space-y-3 p-4 rounded-card bg-surface-2/60 border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Icon name="closed_caption" size={17} className="text-primary" />
                <label className="kt-eyebrow text-xs text-ink font-semibold">
                  AI Speech-to-Text Live Captions
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Select value={subLang} onValueChange={setSubLang}>
                  <SelectTrigger
                    aria-label="Transcription language"
                    size="sm"
                    className="w-auto min-w-[8.5rem] text-[11px] font-medium"
                  >
                    <span className="truncate">{subLang}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTITLE_LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  icon="auto_awesome" iconSpin={loadingSubs}
                  onClick={handleTranscribe}
                  disabled={loadingSubs}
                >
                  {loadingSubs ? 'Transcribing…' : subtitles ? 'Re-transcribe' : 'Generate Live Captions'}
                </Button>
              </div>
            </div>

            {subtitles && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-ink-dim">Caption file for this take:</span>
                <Button size="sm" variant="secondary" icon="download" onClick={() => handleCaptionDownload('srt')}>
                  .srt
                </Button>
                <Button size="sm" variant="secondary" icon="download" onClick={() => handleCaptionDownload('vtt')}>
                  .vtt
                </Button>
              </div>
            )}

            {/* Status Message */}
            {subMsg && (
              <div
                className={`p-2 text-xs rounded border ${
                  subMsg.ok
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                    : 'bg-danger/10 text-danger border-danger/30'
                }`}
              >
                {subMsg.text}
              </div>
            )}

            {/* Segmented Timeline List */}
            {subtitles?.segments && subtitles.segments.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-ink-muted">
                  Click any timestamp chip to jump player playback to that spoken line:
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {subtitles.segments.map((seg: any, idx: number) => {
                    const stSec = parseSec(seg.start);
                    const isCurrent = activeSegment?.id === seg.id;
                    return (
                      <div
                        key={seg.id || idx}
                        onClick={() => handleSeek(stSec)}
                        className={`p-2 rounded-btn border text-xs flex items-start gap-2.5 cursor-pointer transition-all ${
                          isCurrent
                            ? 'border-primary bg-primary-soft text-ink font-medium shadow-sm'
                            : 'border-line bg-surface hover:border-line-strong text-ink-muted hover:text-ink'
                        }`}
                      >
                        <button
                          type="button"
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-2 border border-line shrink-0 text-primary font-bold hover:bg-primary hover:text-on-primary transition-colors"
                          title="Jump video to this offset"
                        >
                          {String(seg.start).replace(',', '.').slice(0, 8)}
                        </button>
                        <span className="flex-1 min-w-0 leading-relaxed">{seg.text}</span>
                        {isCurrent && <Icon name="volume_up" size={14} className="text-primary shrink-0 mt-0.5" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-ink-muted bg-surface rounded-btn border border-line">
                <Icon name="graphic_eq" size={24} className="mx-auto text-ink-dim mb-1" />
                No speech subtitles generated yet. Click "Generate Live Captions" to transcribe audio and compute matching timestamps.
              </div>
            )}
          </div>
        </div>

        {/* Footer Routing Actions */}
        <div className="pt-4 border-t border-line shrink-0 flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" icon="delete" onClick={onDelete} className="text-danger">
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon="content_cut" onClick={onOpenSmartEditor}>
              Cut on the bench
            </Button>
            <Button icon="play_circle" onClick={onOpenRawStudio}>
              Open in Intake
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
