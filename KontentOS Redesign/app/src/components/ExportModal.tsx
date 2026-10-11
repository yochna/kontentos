import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, StatusPill } from '@/components/ui';
import type { TimelineProject } from '@/lib/timeline';
import { fmtTime, totalDuration, videoClips } from '@/lib/timeline';
import { compileTimelineToFiltergraph } from '@/utils/ffmpegFilterCompiler';

interface ExportModalProps {
  project: TimelineProject;
  onClose: () => void;
  onSendToPublish: () => void;
}

export function ExportModal({ project, onClose, onSendToPublish }: ExportModalProps) {
  const [resolution, setResolution] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [fps, setFps] = useState<30 | 60>(30);
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageMsg, setStageMsg] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  const [renderedSize, setRenderedSize] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const duration = totalDuration(project);
  const clips = videoClips(project);
  const sourceUrl = clips.find((c) => c.sourceUrl)?.sourceUrl || clips[0]?.sourceUrl;

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleStartExport = async () => {
    if (!sourceUrl) {
      setErrorMsg('No source video clip found in project to render.');
      return;
    }

    setRendering(true);
    setProgress(0.05);
    setStageMsg('Initializing WebAssembly video encoder...');
    setErrorMsg(null);
    setLogs([]);

    try {
      // 1. Fetch source video as ArrayBuffer
      setStageMsg('Fetching source video buffer...');
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`Failed to load source video file (${res.status})`);
      const inputBuffer = await res.arrayBuffer();

      // 2. Dimensions calculation
      const dimensions =
        resolution === '9:16'
          ? { width: 1080, height: 1920 }
          : resolution === '1:1'
          ? { width: 1080, height: 1080 }
          : { width: 1920, height: 1080 };

      // 3. Compile timeline to FFmpeg filtergraph
      setStageMsg('Compiling multi-track filtergraph...');
      const compiled = compileTimelineToFiltergraph(project, {
        inputVideoFileName: 'input_source.mp4',
        width: dimensions.width,
        height: dimensions.height,
        fps,
      });

      // 4. Spawn Web Worker
      if (workerRef.current) {
        workerRef.current.terminate();
      }

      const worker = new Worker(new URL('../workers/ffmpeg.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      const exportId = `export_${Date.now()}`;

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data;

        if (data.type === 'LOG') {
          if (data.message) {
            setLogs((prev) => [...prev.slice(-40), data.message]);
          }
        } else if (data.type === 'EXPORT_PROGRESS') {
          if (typeof data.progress === 'number') {
            setProgress(data.progress);
          }
          if (data.message) {
            setStageMsg(data.message);
          }
        } else if (data.type === 'EXPORT_SUCCESS') {
          setRendering(false);
          setProgress(1.0);
          setStageMsg('Render completed successfully!');
          const blob = new Blob([data.buffer], { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          setRenderedBlobUrl(url);
          setRenderedSize(data.byteLength || blob.size);
        } else if (data.type === 'EXPORT_ERROR') {
          setRendering(false);
          setErrorMsg(data.error || 'FFmpeg render error occurred.');
        }
      };

      worker.onerror = (err) => {
        setRendering(false);
        setErrorMsg(err.message || 'Worker thread execution failed.');
      };

      // Send export job to worker with transferable buffer
      worker.postMessage(
        {
          type: 'EXPORT_MP4',
          id: exportId,
          buffer: inputBuffer,
          inputFileName: 'input_source.mp4',
          inputArgs: compiled.inputArgs,
          filterComplex: compiled.filterComplex,
          outputVideoLabel: compiled.outputVideoLabel,
          outputAudioLabel: compiled.outputAudioLabel,
          requiredSfxFiles: compiled.requiredSfxFiles,
        },
        [inputBuffer],
      );
    } catch (err: any) {
      console.error('Export initialization error:', err);
      setRendering(false);
      setErrorMsg(err?.message || 'Failed to start video render.');
    }
  };

  const handleDownload = () => {
    if (!renderedBlobUrl) return;
    const a = document.createElement('a');
    a.href = renderedBlobUrl;
    const cleanTitle = (project.projectMetadata.title || 'kontentos-reel')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
    a.download = `${cleanTitle}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[var(--scrim)]" onClick={!rendering ? onClose : undefined} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl p-6 shadow-[var(--shadow-2)] animate-[slidein_.2s_ease] max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-line shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-btn bg-primary-soft text-primary grid place-items-center">
                <Icon name="movie_filter" size={20} />
              </span>
              <div>
                <Eyebrow icon="download">Studio Render</Eyebrow>
                <h3 className="font-semibold text-base text-ink">Export MP4 Video</h3>
              </div>
            </div>
            {!rendering && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 grid place-items-center transition-colors"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto py-4 space-y-5">
            {/* Project Summary Card */}
            <div className="bg-surface-2 p-3.5 rounded-card border border-line flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-ink truncate max-w-xs sm:max-w-sm">
                  {project.projectMetadata.title || 'Untitled Composition'}
                </h4>
                <div className="flex items-center gap-2 text-xs text-ink-dim mt-0.5">
                  <span>Duration: {fmtTime(duration)}</span>
                  <span>·</span>
                  <span>{clips.length} video cuts</span>
                </div>
              </div>
              <StatusPill tone="tertiary">1080p H.264</StatusPill>
            </div>

            {/* Error Message if any */}
            {errorMsg && (
              <div className="p-3 bg-danger/10 border border-danger/25 rounded-btn text-danger text-xs flex items-start gap-2">
                <Icon name="error" size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong>Render failed:</strong> {errorMsg}
                </div>
              </div>
            )}

            {!renderedBlobUrl ? (
              <>
                {/* Resolution Picker */}
                <div>
                  <label className="kt-eyebrow block mb-2">Aspect Ratio & Resolution</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: '9:16', label: '9:16 Vertical', sub: '1080 × 1920 (Reels/Shorts)', icon: 'stay_current_portrait' },
                      { id: '1:1', label: '1:1 Square', sub: '1080 × 1080 (Feed)', icon: 'crop_square' },
                      { id: '16:9', label: '16:9 Landscape', sub: '1920 × 1080 (YouTube)', icon: 'desktop_windows' },
                    ].map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={rendering}
                        onClick={() => setResolution(r.id as any)}
                        className={`p-3 rounded-card border text-left transition-all ${
                          resolution === r.id
                            ? 'border-primary bg-primary-soft ring-2 ring-primary/25 shadow-sm'
                            : 'border-line hover:border-line-strong bg-surface'
                        }`}
                      >
                        <Icon name={r.icon} size={18} className="text-primary mb-1" />
                        <div className="text-xs font-semibold text-ink">{r.label}</div>
                        <div className="text-[10px] text-ink-dim mt-0.5">{r.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Encoding Options */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="kt-eyebrow block mb-1.5">Frame Rate</label>
                    <select
                      value={fps}
                      disabled={rendering}
                      onChange={(e) => setFps(Number(e.target.value) as any)}
                      className="w-full p-2.5 rounded-btn bg-surface-2 border border-line text-xs font-medium text-ink focus:outline-none focus:border-primary"
                    >
                      <option value={30}>30 fps (Standard Web)</option>
                      <option value={60}>60 fps (Ultra Smooth)</option>
                    </select>
                  </div>
                  <div>
                    <label className="kt-eyebrow block mb-1.5">Quality Profile</label>
                    <select
                      value={quality}
                      disabled={rendering}
                      onChange={(e) => setQuality(e.target.value as any)}
                      className="w-full p-2.5 rounded-btn bg-surface-2 border border-line text-xs font-medium text-ink focus:outline-none focus:border-primary"
                    >
                      <option value="standard">Balanced (CRF 23 · Fast)</option>
                      <option value="high">High Fidelity (CRF 18 · Studio)</option>
                    </select>
                  </div>
                </div>

                {/* Progress / Status while rendering */}
                {rendering && (
                  <div className="p-4 rounded-card bg-surface-2 border border-line space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink flex items-center gap-1.5">
                        <span className="kt-spin">
                          <Icon name="autorenew" size={14} className="text-primary" />
                        </span>
                        {stageMsg}
                      </span>
                      <span className="font-mono tabular-nums text-primary font-bold">
                        {Math.round(progress * 100)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-200"
                        style={{ width: `${Math.max(5, progress * 100)}%` }}
                      />
                    </div>
                    {logs.length > 0 && (
                      <div className="mt-2 p-2 bg-black/80 rounded font-mono text-[10px] text-emerald-400 max-h-24 overflow-y-auto">
                        {logs.slice(-5).map((l, i) => (
                          <div key={i} className="truncate">
                            {l}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Success Complete Banner */
              <div className="p-6 text-center bg-surface-2 rounded-card border border-line space-y-4">
                <div className="w-12 h-12 rounded-full bg-tertiary/15 text-tertiary grid place-items-center mx-auto">
                  <Icon name="check_circle" size={28} />
                </div>
                <div>
                  <h4 className="font-semibold text-base text-ink">Video Rendered Successfully!</h4>
                  <p className="text-xs text-ink-muted mt-1">
                    Your composition with burned-in subtitles, punch zooms, and audio mixing is ready.
                  </p>
                  {renderedSize && (
                    <span className="inline-block mt-2 text-[11px] font-mono font-medium text-ink-dim bg-surface px-2.5 py-1 rounded-full border border-line">
                      File size: {(renderedSize / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <Button icon="download" onClick={handleDownload} className="w-full">
                    Download MP4
                  </Button>
                  <Button
                    variant="secondary"
                    icon="schedule_send"
                    onClick={() => {
                      onClose();
                      onSendToPublish();
                    }}
                    className="w-full"
                  >
                    Send to Publish
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {!renderedBlobUrl && (
            <div className="pt-4 border-t border-line shrink-0 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={rendering}>
                Cancel
              </Button>
              <Button
                icon={rendering ? 'hourglass_top' : 'bolt'}
                onClick={handleStartExport}
                disabled={rendering}
              >
                {rendering ? 'Encoding MP4...' : 'Start Render'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
