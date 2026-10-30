import { useMemo, useRef, useState, useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { AnimatedNumber, Button, Card, PageHeader, PageShell, Progress, Reveal, StatusPill, Badge, useDismiss } from '@/components/ui';
import { useNavPayload } from '@/lib/nav';
import { useStore } from '@/lib/store';
import { ingestFeatures } from '@/data/mock';
import { getPreset } from '@/lib/timeline';
import { api } from '@/lib/api';
import type { Video } from '@/lib/types';

const QUOTA_BYTES = 500 * 1024 * 1024 * 1024; // 500 GB workspace quota

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
  } = useStore();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectVideo, setInspectVideo] = useState<Video | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Deep link from the topbar search: land on the clip the creator typed for.
  const navSearch = useNavPayload<{ searchQuery?: string }>('content-library')?.searchQuery;
  useEffect(() => {
    if (navSearch) setSearchQuery(navSearch);
  }, [navSearch]);
  const fileRef = useRef<HTMLInputElement>(null);

  const used = useMemo(() => videos.reduce((sum, v) => sum + (v.file_size || 0), 0), [videos]);
  const totalSec = useMemo(() => videos.reduce((sum, v) => sum + (v.duration || 0), 0), [videos]);
  const usedPct = Math.min(100, (used / QUOTA_BYTES) * 100);

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.toLowerCase();
    return videos.filter(
      (v) => v.title.toLowerCase().includes(q) || (v.description && v.description.toLowerCase().includes(q)),
    );
  }, [videos, searchQuery]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null);
    const list = Array.from(files);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setBusy(true);
      setCurrentFile(file.name);
      setProgress(0);
      try {
        const created = await uploadVideo(file, (pct) => setProgress(pct));
        if (!created) {
          setError(`Upload failed for ${file.name}. Ensure backend is active.`);
        }
      } catch (err: any) {
        setError(`Upload error: ${err?.message || 'Failed'}`);
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

  return (
    <PageShell>
      <PageHeader
        eyebrow="Media Vault"
        icon="grid_view"
        title="Content Library & Media Vault"
        description={
          online
            ? 'Your high-signal raw footage and assembled compositions — searchable, indexed, and ready.'
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

      {/* Storage & Vault Statistics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Icon name="storage" size={16} className="text-primary" /> Workspace Storage
            </div>
            <span className="text-xs font-mono text-ink-dim tabular-nums">
              {fmtBytes(used)} / 500 GB
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.max(usedPct, videos.length ? 1.5 : 0)}%` }}
            />
          </div>
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

      {/* Error Alert */}
      {error && (
        <div className="mb-6 flex items-center justify-between rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
          <div className="flex items-center gap-2">
            <Icon name="error" size={17} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-danger hover:underline">
            Dismiss
          </button>
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
                      {v.thumbnail_url ? (
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenInRawStudio(v);
                              }}
                              title="Open in Raw Studio"
                              className="w-7 h-7 rounded-btn hover:bg-surface-2 grid place-items-center text-ink-muted hover:text-primary transition-colors"
                            >
                              <Icon name="movie" size={15} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete "${v.title}" from library?`)) {
                                  deleteVideo(v.id);
                                }
                              }}
                              title="Delete clip"
                              className="w-7 h-7 rounded-btn hover:bg-danger/10 grid place-items-center text-ink-dim hover:text-danger transition-colors"
                            >
                              <Icon name="delete" size={15} />
                            </button>
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
              <span className="text-xs text-ink-dim mt-1">MP4, MOV, WEBM, WAV · Up to 8 GB</span>
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
          video={inspectVideo}
          onClose={() => setInspectVideo(null)}
          onUpdateTitle={async (newTitle) => {
            await updateVideo(inspectVideo.id, { title: newTitle });
            setInspectVideo((prev) => (prev ? { ...prev, title: newTitle } : null));
          }}
          onOpenRawStudio={() => {
            setInspectVideo(null);
            handleOpenInRawStudio(inspectVideo);
          }}
          onOpenSmartEditor={() => {
            setInspectVideo(null);
            handleOpenInSmartEditor(inspectVideo);
          }}
          onDelete={() => {
            if (confirm(`Are you sure you want to delete "${inspectVideo.title}"?`)) {
              deleteVideo(inspectVideo.id);
              setInspectVideo(null);
            }
          }}
        />
      )}
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
  useDismiss(onClose);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(video.title);
  const [subtitles, setSubtitles] = useState<any>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subLang, setSubLang] = useState('English');
  const [currentTime, setCurrentTime] = useState(0);
  const [showPlayerCaptions, setShowPlayerCaptions] = useState(true);
  const [subMsg, setSubMsg] = useState<string | null>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);

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
      setSubMsg(`Transcribed ${data.segments?.length || 0} live subtitle cues`);
    } catch (err: any) {
      setSubMsg(err?.message || 'Failed to transcribe audio');
    } finally {
      setLoadingSubs(false);
    }
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
    <>
      <div className="kt-scrim fixed inset-0 z-50 bg-[var(--scrim)]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl p-6 shadow-[var(--shadow-2)] kt-dialog max-h-[90vh] flex flex-col">
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
            <button
              onClick={onClose}
              aria-label="Close video details"
              className="kt-focus text-ink-muted hover:text-ink"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto py-4 space-y-5">
            {/* Embedded Video Player with Live CC Overlay */}
            <div className="aspect-video rounded-card bg-black overflow-hidden relative shadow-inner group">
              <video
                ref={videoElRef}
                src={video.file_url}
                crossOrigin="anonymous"
                controls
                playsInline
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                className="w-full h-full object-contain block"
              />

              {/* Live CC Toggle Button on Player */}
              <button
                type="button"
                onClick={() => setShowPlayerCaptions((c) => !c)}
                className={`absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur border shadow-md transition-all ${
                  showPlayerCaptions
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : 'bg-black/60 text-white/70 border-white/20 hover:text-white'
                }`}
                title={showPlayerCaptions ? 'Live CC active (click to hide)' : 'Live CC hidden (click to show)'}
              >
                CC {showPlayerCaptions ? 'ON' : 'OFF'}
              </button>

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
                  <select
                    value={subLang}
                    onChange={(e) => setSubLang(e.target.value)}
                    className="p-1.5 rounded-btn bg-surface border border-line text-[11px] font-medium text-ink"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Japanese">Japanese</option>
                  </select>
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

              {/* Status Message */}
              {subMsg && (
                <div className="p-2 text-xs rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  {subMsg}
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
                Smart Editor
              </Button>
              <Button icon="play_circle" onClick={onOpenRawStudio}>
                Open in Raw Studio
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
