import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Eyebrow, Progress, StatusPill } from '@/components/ui';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fmtBytes } from '@/lib/bench';
import { aspectGeometry, type ExportAspect } from '@/lib/mediaPlan';
import { exportTimeline, type TimelineExportProgress } from '@/lib/browserExport';
import { mergeStageProgress } from '@/lib/progress';
import { useStore, type HandoffExport } from '@/lib/store';
import type { TargetAspectRatio, TimelineProject, VideoClip, TextClip } from '@/lib/timeline';
import {
  activeBrollClipAt,
  activeCaptionAt,
  activeVideoClipAt,
  activeWordIndex,
  brollClips,
  fmtTime,
  isVideoGapAt,
  punchScaleAt,
  sourceTimeAt,
  totalDuration,
  videoClips,
} from '@/lib/timeline';
import { sfxEngine } from '@/utils/sfxEngine';
import { resolveBgmUrl } from '@/utils/bgmPresets';

interface ExportModalProps {
  project: TimelineProject;
  defaultSourceUrl?: string;
  onClose: () => void;
  onSendToPublish: (exported?: HandoffExport) => void;
}

const RENDER_STEPS: Array<{ id: TimelineExportProgress['stage']; label: string }> = [
  { id: 'reading', label: 'Read' },
  { id: 'preparing', label: 'Prepare' },
  { id: 'encoding', label: 'Render' },
  { id: 'finalizing', label: 'Package' },
];

export function ExportModal({ project, defaultSourceUrl, onClose, onSendToPublish }: ExportModalProps) {
  const { uploadVideo } = useStore();
  const [resolution, setResolution] = useState<TargetAspectRatio>(
    project.projectMetadata.targetAspectRatio || '9:16'
  );
  const [fps, setFps] = useState<30 | 60>(30);
  const [quality, setQuality] = useState<'standard' | 'high'>('high');
  const [previewAudio, setPreviewAudio] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageMsg, setStageMsg] = useState('');
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  const [renderedMimeType, setRenderedMimeType] = useState<string>('video/mp4');
  const [renderedSize, setRenderedSize] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [renderEngine, setRenderEngine] = useState<'ffmpeg' | 'canvas'>('ffmpeg');
  const [ffmpegFailed, setFfmpegFailed] = useState(false);
  const [savingExport, setSavingExport] = useState(false);
  const [savePct, setSavePct] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stage, setStage] = useState<TimelineExportProgress['stage']>('reading');
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [captionsBurned, setCaptionsBurned] = useState(false);

  const duration = totalDuration(project);
  const { width, height } = aspectGeometry(resolution as ExportAspect);
  const outputExt = renderedMimeType.toLowerCase().includes('webm') ? 'webm' : 'mp4';
  const outputCodec = /vp9/i.test(renderedMimeType)
    ? 'VP9'
    : /vp8/i.test(renderedMimeType)
      ? 'VP8'
      : 'H.264';
  const clips = videoClips(project);
  const resolvedSourceUrl = clips.find((c) => c.sourceUrl)?.sourceUrl || clips[0]?.sourceUrl || defaultSourceUrl;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isCancelledRef = useRef(false);
  const transferredRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const detachVisibilityRef = useRef<(() => void) | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const renderedBlobRef = useRef<Blob | null>(null);
  const renderStartedAtRef = useRef(0);
  const renderProgressRef = useRef<TimelineExportProgress>({
    stage: 'reading',
    fraction: 0,
    message: 'Preparing frame-accurate render…',
  });
  const RENDER_PROGRESS_ORDER: TimelineExportProgress['stage'][] = [
    'reading',
    'preparing',
    'encoding',
    'finalizing',
    'done',
  ];

  /**
   * One export owns one AudioContext and one document-level listener. A browser only allows a
   * handful of contexts per page, so leaving them open means the fifth export fails outright.
   */
  const releaseExportAudio = () => {
    if (detachVisibilityRef.current) detachVisibilityRef.current();
    detachVisibilityRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
  };

  // Clean up blob URL and audio nodes on unmount
  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
      exportAbortRef.current?.abort();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch {}
      }
      sfxEngine.stopBGM();
      if (audioDestRef.current) {
        sfxEngine.disconnectFromDestination(audioDestRef.current);
      }
      releaseExportAudio();
      if (renderedBlobUrl && !transferredRef.current) {
        URL.revokeObjectURL(renderedBlobUrl);
      }
    };
  }, [renderedBlobUrl]);

  // Adjust audio monitor preview volume live during export
  useEffect(() => {
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = previewAudio ? 0.35 : 0.0;
    }
  }, [previewAudio]);

  /** Explicit fallback only. The primary path is the frame-accurate FFmpeg renderer below. */
  const handleCanvasExport = async () => {
    if (!resolvedSourceUrl && clips.length === 0) {
      setErrorMsg('No video source found in the project to export.');
      return;
    }

    if (renderedBlobUrl) {
      URL.revokeObjectURL(renderedBlobUrl);
      setRenderedBlobUrl(null);
    }
    renderedBlobRef.current = null;

    isCancelledRef.current = false;
    renderStartedAtRef.current = Date.now();
    setRenderEngine('canvas');
    setRendering(true);
    setProgress(0.01);
    setStage('encoding');
    setCaptionsBurned((project.tracks.find((track) => track.type === 'text')?.clips.length || 0) > 0);
    setStageMsg('Initializing browser recorder fallback...');
    setErrorMsg(null);

    try {
      // 1. Setup Primary Rendering Canvas
      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvasRef.current = canvas;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create 2D canvas context');

      setStageMsg('Loading source video stream...');
      setProgress(0.05);

      // 3. Setup Multi-Source Video Elements with CORS & Audio Routing
      const allPrimaryClips = videoClips(project);
      const distinctSourceUrls = Array.from(
        new Set(allPrimaryClips.map((c) => c.sourceUrl).filter(Boolean))
      ) as string[];
      if (distinctSourceUrls.length === 0 && resolvedSourceUrl) {
        distinctSourceUrls.push(resolvedSourceUrl);
      }

      const sourceVideoElements = new Map<string, HTMLVideoElement>();
      const sourceGainNodes = new Map<string, GainNode>();

      // 4. Setup Multi-Track Web Audio Routing Graph
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const audioDest = audioCtx.createMediaStreamDestination();
      audioDestRef.current = audioDest;

      // Setup and preload all primary video sources
      for (const srcUrl of distinctSourceUrls) {
        const vEl = document.createElement('video');
        vEl.crossOrigin = 'anonymous';
        vEl.playsInline = true;
        vEl.muted = false;
        vEl.preload = 'auto';
        vEl.src = srcUrl;

        await new Promise<void>((resolve, reject) => {
          if (vEl.readyState >= 3) return resolve();
          const onLoaded = () => { cleanup(); resolve(); };
          const onError = () => {
            cleanup();
            if (srcUrl && (srcUrl.startsWith('http://') || srcUrl.startsWith('https://'))) {
              vEl.src = `/api/proxy-media?url=${encodeURIComponent(srcUrl)}`;
              vEl.onloadeddata = () => { cleanup(); resolve(); };
              vEl.onerror = () => { cleanup(); reject(new Error(`Failed to load source video stream: ${srcUrl}`)); };
            } else {
              reject(new Error(`Failed to load source video stream: ${srcUrl}`));
            }
          };
          const cleanup = () => {
            vEl.removeEventListener('canplay', onLoaded);
            vEl.removeEventListener('error', onError);
          };
          vEl.addEventListener('canplay', onLoaded);
          vEl.addEventListener('error', onError);
          vEl.load();
        });

        if (isCancelledRef.current) return;

        // Connect each source video's audio to destination with gain control
        try {
          const vSource = audioCtx.createMediaElementSource(vEl);
          const vGain = audioCtx.createGain();
          vGain.gain.value = 1.0;
          vSource.connect(vGain);
          vGain.connect(audioDest);
          if (monitorGainRef.current) {
            vGain.connect(monitorGainRef.current);
          }
          sourceGainNodes.set(srcUrl, vGain);
        } catch (audioConnectErr) {
          console.warn('[Export Compositor] Video audio already connected:', audioConnectErr);
        }

        sourceVideoElements.set(srcUrl, vEl);
      }

      const initialClip = clips[0];
      const initialSrcUrl = initialClip?.sourceUrl || distinctSourceUrls[0];
      const initialVideoEl = sourceVideoElements.get(initialSrcUrl) || sourceVideoElements.values().next().value || null;
      videoElRef.current = initialVideoEl;

      // Connect SFX and BGM engine to recording destination
      sfxEngine.connectToDestination(audioDest);

      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (resumeErr) {
          console.warn('AudioContext resume warning:', resumeErr);
        }
      }

      setStageMsg('Setting up MediaStream recorder...');
      setProgress(0.1);

      // 5. Combine Canvas Video Stream & Audio Tracks
      const canvasStream = canvas.captureStream(fps);
      const audioTracks = audioDest.stream.getAudioTracks();
      const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks(), ...audioTracks];
      const combinedStream = new MediaStream(combinedTracks);

      // 6. Select Best Supported MimeType
      const mimeCandidates = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      let selectedMimeType = '';
      for (const m of mimeCandidates) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMimeType = m;
          break;
        }
      }
      if (!selectedMimeType) selectedMimeType = 'video/webm';

      const bitrate = quality === 'high' ? 8_000_000 : 4_500_000;
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: bitrate,
      });
      mediaRecorderRef.current = mediaRecorder;

      const recordedChunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      const totalCompDuration = Math.max(1, duration || initialVideoEl?.duration || 5);

      // Start BGM track if configured
      const bgmAssetId = project.globalAudioTracks?.backgroundMusicAssetId;
      const bgmVol = project.globalAudioTracks?.bgmVolume ?? 0.25;

      const triggeredSFX = new Set<string>();

      // 7. Pre-seek initial video element to start offset and prime canvas before starting recorder
      const initialOffset = initialClip ? initialClip.sourceStartOffset : 0;
      if (initialVideoEl) {
        initialVideoEl.currentTime = initialOffset;
        await new Promise<void>((resolve) => {
          if (initialVideoEl.readyState >= 2 && Math.abs(initialVideoEl.currentTime - initialOffset) < 0.05) {
            return resolve();
          }
          const onSeeked = () => {
            initialVideoEl.removeEventListener('seeked', onSeeked);
            resolve();
          };
          initialVideoEl.addEventListener('seeked', onSeeked);
          setTimeout(resolve, 400);
        });
      }

      // Preload any B-Roll video overlays
      const projectBrollClips = brollClips(project);
      const brollVideoElements = new Map<string, HTMLVideoElement>();
      for (const b of projectBrollClips) {
        if (b.sourceUrl && !brollVideoElements.has(b.sourceUrl)) {
          const bEl = document.createElement('video');
          bEl.crossOrigin = 'anonymous';
          bEl.playsInline = true;
          bEl.muted = true;
          bEl.preload = 'auto';
          bEl.src = b.sourceUrl;
          bEl.load();
          brollVideoElements.set(b.sourceUrl, bEl);
        }
      }

      // Draw initial clean frame immediately so canvasStream has a valid first frame
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      if (initialVideoEl && initialVideoEl.videoWidth > 0 && initialVideoEl.videoHeight > 0) {
        const vw = initialVideoEl.videoWidth;
        const vh = initialVideoEl.videoHeight;
        const scale = Math.max(width / vw, height / vh);
        const drawW = vw * scale;
        const drawH = vh * scale;
        const drawX = (width - drawW) / 2;
        const drawY = (height - drawH) / 2;
        ctx.drawImage(initialVideoEl, drawX, drawY, drawW, drawH);
      }

      // Start recording and video playback simultaneously
      mediaRecorder.start(100);
      setStageMsg(`Rendering & recording ${resolution} composition in real time...`);

      if (initialVideoEl) {
        try {
          await initialVideoEl.play();
        } catch (playErr) {
          console.warn('Initial video element play error:', playErr);
        }
      }

      if (bgmAssetId) {
        const bgmUrl = resolveBgmUrl(bgmAssetId);
        sfxEngine.startBGM(bgmAssetId, bgmVol, bgmUrl);
      }

      // Smooth Master-Clock Synchronized Render Loop with Multi-Source Support
      await new Promise<void>((resolve, reject) => {
        let animId = 0;
        let currentClipIndex = 0;
        let isTransitioning = false;
        let completed = false;

        // The clock used to be read from the playing <video> element. When a shot ended or a tab
        // throttled the frame loop, captions froze or skipped with it. A wall clock keeps the
        // picture, audio and cue lookup on one timeline; video elements below only supply pixels.
        const exportStartedAt = performance.now();
        const timelineAt = () => Math.min(totalCompDuration, (performance.now() - exportStartedAt) / 1000);

        const loop = () => {
          if (isCancelledRef.current) {
            cancelAnimationFrame(animId);
            for (const vEl of sourceVideoElements.values()) {
              try { vEl.pause(); } catch {}
            }
            for (const bEl of brollVideoElements.values()) {
              try { bEl.pause(); } catch {}
            }
            try { mediaRecorder.stop(); } catch {}
            sfxEngine.stopBGM();
            sfxEngine.disconnectFromDestination(audioDest);
            return reject(new Error('Export cancelled by user'));
          }

          const curClip = clips[currentClipIndex] || clips[0];
          const curSrcUrl = curClip?.sourceUrl || distinctSourceUrls[0];
          const activeV = sourceVideoElements.get(curSrcUrl) || initialVideoEl;

          const curSpeed = curClip?.speedMultiplier || 1;
          const curSrcStart = curClip?.sourceStartOffset || 0;
          const curClipTimelineStart = curClip?.startOnTimeline || 0;
          const curClipDur = curClip?.duration || totalCompDuration;

          const currentTimelineSec = timelineAt();
          // Keep the shot's video element near the master clock, but never rewind it. Video playback
          // is only a frame source now; re-syncing only on real drift avoids visible jumps.
          if (activeV) {
            const desiredSourceTime = curSrcStart + Math.max(0, currentTimelineSec - curClipTimelineStart) * curSpeed;
            const drift = Math.abs(activeV.currentTime - desiredSourceTime);
            if (drift > 0.35) {
              try { activeV.currentTime = desiredSourceTime; } catch {}
            }
          }
          const clipElapsed = Math.max(0, Math.min(curClipDur, currentTimelineSec - curClipTimelineStart));

          // Check for clip completion or total duration reached
          if (
            clipElapsed >= curClipDur - 0.03 ||
            currentTimelineSec >= totalCompDuration - 0.03 ||
            false
          ) {
            if (currentClipIndex < clips.length - 1) {
              if (!isTransitioning) {
                isTransitioning = true;
                const prevClip = curClip;
                currentClipIndex += 1;
                const nextClip = clips[currentClipIndex];
                const nextSrcUrl = nextClip?.sourceUrl || distinctSourceUrls[0];
                const nextV = sourceVideoElements.get(nextSrcUrl);

                if (nextClip && nextV) {
                  if (nextSrcUrl !== prevClip?.sourceUrl && activeV) {
                    // Multi-source switch: pause previous video, activate next video
                    activeV.pause();
                    sourceGainNodes.get(prevClip?.sourceUrl || '')?.gain.setValueAtTime(0, audioCtx.currentTime);
                    sourceGainNodes.get(nextSrcUrl)?.gain.setValueAtTime(1.0, audioCtx.currentTime);
                  }

                  nextV.currentTime = nextClip.sourceStartOffset;
                  const onSeeked = () => {
                    isTransitioning = false;
                    nextV.removeEventListener('seeked', onSeeked);
                    nextV.play().catch(() => {});
                  };
                  nextV.addEventListener('seeked', onSeeked);
                } else {
                  isTransitioning = false;
                }
              }
            } else if (!completed) {
              completed = true;
              cancelAnimationFrame(animId);
              for (const vEl of sourceVideoElements.values()) {
                try { vEl.pause(); } catch {}
              }
              for (const bEl of brollVideoElements.values()) {
                try { bEl.pause(); } catch {}
              }
              sfxEngine.stopBGM();
              sfxEngine.disconnectFromDestination(audioDest);
              try { mediaRecorder.stop(); } catch {}
              return resolve();
            }
          }

          if (activeV && activeV.paused && !completed && !isCancelledRef.current) {
            activeV.play().catch(() => {});
          }

          // A. Draw active primary video frame with Aspect Ratio Conforming & Punch Zoom
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);

          const punchScale = punchScaleAt(project, currentTimelineSec);

          if (activeV && activeV.videoWidth > 0 && activeV.videoHeight > 0) {
            ctx.save();
            const vw = activeV.videoWidth;
            const vh = activeV.videoHeight;
            const scale = Math.max(width / vw, height / vh) * punchScale;
            const drawW = vw * scale;
            const drawH = vh * scale;
            const drawX = (width - drawW) / 2;
            const drawY = (height - drawH) / 2;
            ctx.drawImage(activeV, drawX, drawY, drawW, drawH);
            ctx.restore();
          }

          // B. Draw B-Roll Stock Footage & Overlay Video if active
          const bClip = activeBrollClipAt(project, currentTimelineSec);
          if (bClip && bClip.sourceUrl) {
            const bEl = brollVideoElements.get(bClip.sourceUrl);
            if (bEl) {
              const brollElapsed = Math.max(0, currentTimelineSec - bClip.startOnTimeline) * (bClip.speedMultiplier || 1);
              const brollTargetTime = (bClip.sourceStartOffset || 0) + brollElapsed;
              if (Math.abs(bEl.currentTime - brollTargetTime) > 0.15) {
                try { bEl.currentTime = brollTargetTime; } catch {}
              }
              if (bEl.paused && !isCancelledRef.current) {
                bEl.play().catch(() => {});
              }

              if (bEl.videoWidth > 0 && bEl.videoHeight > 0) {
                ctx.save();
                const bw = bEl.videoWidth;
                const bh = bEl.videoHeight;
                const bScale = Math.max(width / bw, height / bh);
                const bDrawW = bw * bScale;
                const bDrawH = bh * bScale;
                const bDrawX = (width - bDrawW) / 2;
                const bDrawY = (height - bDrawH) / 2;
                ctx.drawImage(bEl, bDrawX, bDrawY, bDrawW, bDrawH);
                ctx.restore();
              }
            }
          } else {
            for (const bEl of brollVideoElements.values()) {
              if (!bEl.paused) {
                try { bEl.pause(); } catch {}
              }
            }
          }

          // C. Draw Kinetic Subtitles with Word Highlighting
          // The exporter used to draw with a different, narrower style than the preview and ignored
          // muted text tracks. Both are fixed here: one readable layout, backed by a soft scrim,
          // with the same active-word data the preview uses.
          const caption = activeCaptionAt(project, currentTimelineSec);
          if (caption && caption.content) {
            ctx.save();
            const activeWIdx = activeWordIndex(caption, currentTimelineSec);
            const words = caption.style?.words || [];
            const fontName = caption.style?.fontFamily || 'system-ui, sans-serif';
            const minDim = Math.min(width, height);
            const scale = minDim / 1080;
            let fontSize = Math.round((caption.style?.fontSize || 60) * scale);
            const primaryColor = caption.style?.colorHex || '#FFFFFF';
            const activeColor = caption.style?.activeWordColorHex || '#FFE066';
            const strokeColor = caption.style?.strokeColorHex || '#000000';
            const strokeWidth = Math.max(3, Math.round((caption.style?.strokeWidth ?? 6) * scale));
            const shadowColor = caption.style?.shadowColorHex || 'rgba(0,0,0,0.9)';
            const scrim = caption.style?.bannerPillColorHex || 'rgba(0,0,0,0.55)';
            const pos = caption.style?.position || 'bottom';
            const yPos = pos === 'top' ? height * 0.2 : pos === 'bottom' ? height * 0.8 : height * 0.5;
            const maxWidth = width * 0.86;
            const lineHeight = Math.round(fontSize * 1.18);

            const setFont = () => { ctx.font = `900 ${fontSize}px ${fontName}`; };
            setFont();
            ctx.textBaseline = 'middle';

            // Measure once, shrink only when a real line would leave the title-safe area.
            const fullText = words.length ? words.map((w) => w.word).join(' ') : caption.content;
            const fullWidth = ctx.measureText(fullText).width;
            if (fullWidth > maxWidth && fullWidth > 0) {
              fontSize = Math.max(34, Math.floor(fontSize * (maxWidth / fullWidth)));
              setFont();
            }

            type DrawWord = { text: string; index: number; width: number };
            const lines: DrawWord[][] = [[]];
            let lineWidth = 0;
            if (words.length) {
              words.forEach((w, idx) => {
                const text = w.word + (idx < words.length - 1 ? ' ' : '');
                const wWidth = ctx.measureText(text).width;
                if (lineWidth + wWidth > maxWidth && lines[lines.length - 1].length) {
                  lines.push([]);
                  lineWidth = 0;
                }
                lines[lines.length - 1].push({ text, index: idx, width: wWidth });
                lineWidth += wWidth;
              });
            } else {
              caption.content.split(/\s+/).filter(Boolean).forEach((word, idx, all) => {
                const text = word + (idx < all.length - 1 ? ' ' : '');
                const wWidth = ctx.measureText(text).width;
                if (lineWidth + wWidth > maxWidth && lines[lines.length - 1].length) {
                  lines.push([]);
                  lineWidth = 0;
                }
                lines[lines.length - 1].push({ text, index: idx, width: wWidth });
                lineWidth += wWidth;
              });
            }

            const widest = Math.max(...lines.map((line) => line.reduce((sum, item) => sum + item.width, 0)));
            const padX = Math.round(22 * scale);
            const padY = Math.round(14 * scale);
            const blockHeight = lines.length * lineHeight + padY * 2;
            const blockTop = yPos - blockHeight / 2;
            const blockLeft = width / 2 - widest / 2 - padX;

            ctx.fillStyle = scrim;
            ctx.beginPath();
            ctx.roundRect(blockLeft, blockTop, widest + padX * 2, blockHeight, Math.round(18 * scale));
            ctx.fill();

            lines.forEach((line, lineIdx) => {
              const lineY = yPos - ((lines.length - 1) * lineHeight) / 2 + lineIdx * lineHeight;
              let x = width / 2 - line.reduce((sum, item) => sum + item.width, 0) / 2;
              line.forEach((item) => {
                const isActive = words.length > 0 && activeWIdx === item.index;
                ctx.save();
                ctx.fillStyle = isActive ? activeColor : primaryColor;
                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = 12 * scale;
                ctx.shadowOffsetX = 2 * scale;
                ctx.shadowOffsetY = 3 * scale;
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = strokeWidth;
                ctx.textAlign = 'left';
                if (isActive && (caption.style?.animation === 'popIn' || caption.style?.animation === 'bouncePop')) {
                  ctx.font = `900 ${Math.round(fontSize * 1.14)}px ${fontName}`;
                } else {
                  setFont();
                }
                ctx.strokeText(item.text, x, lineY);
                ctx.fillText(item.text, x, lineY);
                ctx.restore();
                x += item.width;
              });
            });
            ctx.restore();
          }

          // D. Fire SFX Cues at Exact Timeline Points
          const sfxTrack = project.tracks.find((t) => t.type === 'sfx');
          if (sfxTrack && !sfxTrack.isMuted) {
            (sfxTrack.clips as any[]).forEach((sClip) => {
              if (
                currentTimelineSec >= sClip.startOnTimeline &&
                currentTimelineSec < sClip.startOnTimeline + 0.2 &&
                !triggeredSFX.has(sClip.id)
              ) {
                triggeredSFX.add(sClip.id);
                sfxEngine.play(sClip.sfxAssetId || 'pop', sClip.audioModifiers?.volume || 1.0);
              }
            });
          }

          // Dynamic BGM Ducking during export recording
          if (bgmAssetId) {
            const inGap = isVideoGapAt(project, currentTimelineSec);
            const shouldDuck = !inGap && (project.globalAudioTracks?.duckingEnabled ?? true);
            sfxEngine.setDucked(shouldDuck, bgmVol);
          }

          // E. Mirror to Live Preview Canvas in Modal
          if (previewCanvasRef.current) {
            const pCtx = previewCanvasRef.current.getContext('2d');
            if (pCtx) {
              pCtx.drawImage(canvas, 0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
            }
          }

          // F. Update Smooth Progress
          const prog = Math.min(0.99, currentTimelineSec / totalCompDuration);
          setProgress(prog);

          if (!completed) {
            if (typeof document !== 'undefined' && document.hidden) {
              setTimeout(loop, Math.max(16, Math.floor(1000 / fps)));
            } else {
              animId = requestAnimationFrame(loop);
            }
          }
        };

        const onVisibilityChange = () => {
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        detachVisibilityRef.current = () => document.removeEventListener('visibilitychange', onVisibilityChange);

        animId = requestAnimationFrame(loop);
      });

      // 8. Finalize Video Blob Package
      setStageMsg('Finalizing MP4 media package...');
      setProgress(0.99);

      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => resolve();
      });

      // The take is recorded, so the audio graph behind it has no reason to stay open.
      releaseExportAudio();

      const finalBlob = new Blob(recordedChunks, { type: selectedMimeType });
      renderedBlobRef.current = finalBlob;
      const blobUrl = URL.createObjectURL(finalBlob);
      setRenderedBlobUrl(blobUrl);
      setRenderedMimeType(selectedMimeType);
      setRenderedSize(finalBlob.size);
      setProgress(1.0);
      setStageMsg('Export complete! Video rendered with full audio and kinetic subtitles.');
      setRendering(false);
    } catch (err: any) {
      console.error('[ExportModal] Render error:', err);
      setRendering(false);
      sfxEngine.stopBGM();
      if (audioDestRef.current) sfxEngine.disconnectFromDestination(audioDestRef.current);
      releaseExportAudio();
      setErrorMsg(err?.message || 'Video export rendering encountered an issue.');
    }
  };

  /** Default path: render the EDL itself with FFmpeg rather than recording a tab in real time. */
  const handleStartExport = async () => {
    if (!resolvedSourceUrl && clips.length === 0) {
      setErrorMsg('No video source found in the project to export.');
      return;
    }

    if (renderedBlobUrl) {
      URL.revokeObjectURL(renderedBlobUrl);
      setRenderedBlobUrl(null);
    }

    isCancelledRef.current = false;
    renderedBlobRef.current = null;
    renderProgressRef.current = {
      stage: 'reading',
      fraction: 0.01,
      message: 'Preparing frame-accurate render…',
    };
    renderStartedAtRef.current = Date.now();
    setRenderEngine('ffmpeg');
    setFfmpegFailed(false);
    setRendering(true);
    setProgress(0.01);
    setStage('reading');
    setEtaSec(null);
    setCaptionsBurned(false);
    setStageMsg('Preparing frame-accurate render…');
    setErrorMsg(null);
    setDiagnostics([]);
    setSaveError(null);

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const result = await exportTimeline(
        {
          project,
          defaultSourceUrl: resolvedSourceUrl,
          width,
          height,
          fps,
          crf: quality === 'high' ? 20 : 23,
        },
        (update) => {
          renderProgressRef.current = mergeStageProgress(
            renderProgressRef.current,
            update,
            RENDER_PROGRESS_ORDER
          );
          const fraction = renderProgressRef.current.fraction ?? 0;
          const elapsed = (Date.now() - renderStartedAtRef.current) / 1000;
          setProgress(fraction);
          setStage(renderProgressRef.current.stage);
          setStageMsg(renderProgressRef.current.message);
          // An estimate is only honest once real encoding has begun; before that it is a guess.
          setEtaSec(
            fraction > 0.05 && elapsed > 1
              ? Math.max(0, Math.round((elapsed / fraction) * (1 - fraction)))
              : null
          );
        },
        controller.signal
      );

      renderedBlobRef.current = result.blob;
      const blobUrl = URL.createObjectURL(result.blob);
      setRenderedBlobUrl(blobUrl);
      setRenderedMimeType('video/mp4');
      setRenderedSize(result.byteLength || result.blob.size);
      setCaptionsBurned(result.captionsBurned);
      setProgress(1);
      setEtaSec(null);
      setStageMsg('Frame-accurate export complete.');
    } catch (err: any) {
      const message = err?.message || 'The frame-accurate export could not be completed.';
      const cancelled = /cancel/i.test(message);
      setErrorMsg(cancelled ? message : `${message} Nothing was downgraded automatically.`);
      setDiagnostics(Array.isArray(err?.diagnostics) ? err.diagnostics : []);
      setFfmpegFailed(!cancelled);
    } finally {
      exportAbortRef.current = null;
      setRendering(false);
    }
  };

  const handleCancelRender = () => {
    if (renderEngine === 'ffmpeg') {
      exportAbortRef.current?.abort();
      return;
    }
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch { /* recorder already stopped */ }
    }
    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch { /* element already gone */ }
    }
    sfxEngine.stopBGM();
    if (audioDestRef.current) sfxEngine.disconnectFromDestination(audioDestRef.current);
    releaseExportAudio();
  };

  /** Return to settings without leaking a finished blob the creator no longer wants. */
  const handleRenderAgain = () => {
    if (renderedBlobUrl) URL.revokeObjectURL(renderedBlobUrl);
    renderedBlobRef.current = null;
    transferredRef.current = false;
    setRenderedBlobUrl(null);
    setRenderedSize(null);
    setErrorMsg(null);
    setSaveError(null);
    setProgress(0);
    setEtaSec(null);
    setStage('reading');
  };

  /**
   * A blob URL dies with this tab. Archive the rendered MP4 through the same intake path as any
   * other clip so Publish still has a source after a reload or a device switch.
   */
  const handleSendToPublish = async () => {
    if (!renderedBlobUrl || savingExport) return;
    if (!renderedBlobRef.current) {
      setSaveError('The finished file is no longer in memory. Render again before sending it.');
      return;
    }
    setSavingExport(true);
    setSavePct(0);
    setSaveError(null);
    try {
      const extension = renderedMimeType.toLowerCase().includes('webm') ? 'webm' : 'mp4';
      const file = new File(
        [renderedBlobRef.current],
        `kontentos_finished_reel_${Date.now()}.${extension}`,
        { type: renderedMimeType }
      );
      const uploaded = await uploadVideo(file, setSavePct, { transcribe: false });
      if (!uploaded?.file_url) throw new Error('The finished reel was rendered but could not be archived.');
      transferredRef.current = true;
      onClose();
      onSendToPublish({
        videoUrl: uploaded.file_url,
        byteLength: uploaded.file_size || renderedSize || undefined,
        videoId: uploaded.id,
        title: uploaded.title,
        duration: uploaded.duration,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The finished reel could not be archived.');
    } finally {
      setSavingExport(false);
    }
  };

  const handleDownload = () => {
    if (!renderedBlobUrl) return;
    const a = document.createElement('a');
    a.href = renderedBlobUrl;
    const rawTitle = project.projectMetadata.title || 'kontentos_export';
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
    const isMp4 = renderedMimeType.toLowerCase().includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    a.download = `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDirectDownloadSource = () => {
    if (!resolvedSourceUrl) return;
    const a = document.createElement('a');
    a.href = resolvedSourceUrl;
    const rawTitle = project.projectMetadata.title || 'source_video';
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
    const rawExt = resolvedSourceUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'mp4';
    const safeExt = ['mp4', 'mov', 'webm', 'mkv'].includes(rawExt) ? rawExt : 'mp4';
    a.download = `${safeTitle}.${safeExt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* An encode that is 60% through must not be lost to a stray Escape key or a click outside. */}
      <DialogContent
        hideClose
        className="max-w-xl flex flex-col gap-0 overflow-hidden p-6"
        onEscapeKeyDown={(e) => rendering && e.preventDefault()}
        onInteractOutside={(e) => rendering && e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-btn bg-primary-soft text-primary grid place-items-center">
              <Icon name="movie_filter" size={20} />
            </span>
            <div>
              <Eyebrow icon="download">Studio Render</Eyebrow>
              <DialogTitle className="font-semibold text-base text-ink">Export Composition</DialogTitle>
            </div>
          </div>
          {!rendering && (
            <DialogClose
              className="w-8 h-8 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 grid place-items-center transition-colors kt-focus"
              aria-label="Close export"
            >
              <Icon name="close" size={18} />
            </DialogClose>
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
            <StatusPill tone="tertiary">{width}×{height} · {fps} fps · H.264</StatusPill>
          </div>

          {/* Error Message if any */}
          {errorMsg && (
            <div className="p-3.5 bg-danger/10 border border-danger/25 rounded-btn text-danger-ink text-xs flex items-start gap-2">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong>Render notice:</strong> {errorMsg}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {ffmpegFailed && (
                    <div className="mt-3 rounded-btn border border-warning/30 bg-warning/10 p-3 not-italic">
                      <div className="flex items-start gap-2">
                        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink" />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">Browser recorder is available</p>
                          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
                            It captures the composition in real time, so keep this tab visible. Frames can differ slightly from the editor timeline.
                          </p>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon="radio_button_checked"
                            onClick={handleCanvasExport}
                            className="mt-2"
                          >
                            Use browser recorder
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleDirectDownloadSource}
                    className="underline font-semibold rounded px-0.5 transition-colors hover:bg-danger/15"
                  >
                    Download source master directly →
                  </button>
                </div>
                {diagnostics.length > 0 && (
                  <details className="mt-3 text-[11px] text-ink-dim">
                    <summary className="cursor-pointer hover:text-ink">FFmpeg diagnostics</summary>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-surface px-2 py-1.5 font-mono text-[10px]">
                      {diagnostics.join('\n')}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}

          {saveError && renderedBlobUrl && (
            <div className="mb-4 flex items-start gap-2 rounded-btn border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger-ink">
              <Icon name="error_outline" size={16} className="mt-0.5 shrink-0" />
              {saveError}
            </div>
          )}

          {!renderedBlobUrl ? (
            <>
              {/* Resolution Picker */}
              <div>
                <label className="kt-eyebrow block mb-2">Aspect Ratio & Resolution</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: '9:16', label: '9:16 Reel', sub: '1080 × 1920', icon: 'stay_current_portrait' },
                    { id: '1:1', label: '1:1 Square', sub: '1080 × 1080', icon: 'crop_square' },
                    { id: '4:5', label: '4:5 Portrait', sub: '1080 × 1350', icon: 'photo' },
                    { id: '16:9', label: '16:9 Wide', sub: '1920 × 1080', icon: 'desktop_windows' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={rendering}
                      onClick={() => setResolution(r.id as any)}
                      className={`p-2.5 rounded-card border text-left transition-all ${
                        resolution === r.id
                          ? 'border-primary bg-primary-soft ring-2 ring-primary/25'
                          : 'border-line hover:border-line-strong bg-surface'
                      }`}
                    >
                      <Icon name={r.icon} size={16} className="text-primary mb-1" />
                      <div className="text-xs font-semibold text-ink">{r.label}</div>
                      <div className="text-[11px] text-ink-dim mt-0.5">{r.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Encoding Options */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="kt-eyebrow block mb-1.5" htmlFor="export-fps">Frame Rate</label>
                  <Select value={String(fps)} disabled={rendering} onValueChange={(v) => setFps(Number(v) as 30 | 60)}>
                    <SelectTrigger id="export-fps" size="sm" className="bg-surface-2 text-xs font-medium">
                      <span className="truncate">{fps === 60 ? '60 fps (Ultra Smooth)' : '30 fps (Standard Web)'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 fps (Standard Web)</SelectItem>
                      <SelectItem value="60">60 fps (Ultra Smooth)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="kt-eyebrow block mb-1.5" htmlFor="export-quality">Quality Profile</label>
                  <Select value={quality} disabled={rendering} onValueChange={(v) => setQuality(v as 'standard' | 'high')}>
                    <SelectTrigger id="export-quality" size="sm" className="bg-surface-2 text-xs font-medium">
                      <span className="truncate">{quality ==='high' ? 'High Fidelity Studio (CRF 20)' : 'Balanced (CRF 23)'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Balanced (CRF 23)</SelectItem>
                      <SelectItem value="high">High Fidelity Studio (CRF 20)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Live Real-Time Rendering Progress & Preview */}
              {rendering && (
                <div className="p-4 rounded-card bg-surface-2 border border-line space-y-3.5">
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

                  {renderEngine === 'ffmpeg' && (
                    <div className="flex items-center gap-1.5">
                      {RENDER_STEPS.map((step, index) => {
                        const currentIndex = RENDER_STEPS.findIndex((item) => item.id === stage);
                        const done = index < currentIndex;
                        const active = index === currentIndex;
                        return (
                          <div key={step.id} className="flex flex-1 items-center gap-1.5">
                            <span
                              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border font-mono text-[9px] font-bold ${
                                done
                                  ? 'border-primary bg-primary text-on-primary'
                                  : active
                                    ? 'border-primary bg-primary-soft text-primary'
                                    : 'border-line bg-surface text-ink-dim'
                              }`}
                            >
                              {done ? '✓' : index + 1}
                            </span>
                            <span className={`text-[10.5px] ${active ? 'font-semibold text-ink' : 'text-ink-dim'}`}>
                              {step.label}
                            </span>
                            {index < RENDER_STEPS.length - 1 && (
                              <span className="ml-auto hidden h-px w-3 bg-line sm:block" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Striped while rendering, and re-timed to 150ms so the bar never trails the real encode. */}
                  <Progress
                    value={Math.max(4, progress * 100)}
                    live
                    label="Render"
                    trackClassName="h-2 bg-surface-3"
                    barClassName="bg-primary duration-150!"
                  />

                  {etaSec !== null && (
                    <div className="text-[11px] text-ink-dim">About {etaSec}s left at this rate</div>
                  )}

                  {renderEngine === 'canvas' ? (
                    <>
                      {/* Live Preview Monitor, only meaningful for the real-time recorder fallback. */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="max-w-[140px] mx-auto aspect-[9/16] bg-black rounded-lg overflow-hidden border border-line relative">
                          <canvas
                            ref={previewCanvasRef}
                            width={270}
                            height={480}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-ink-dim pt-1 border-t border-line/50">
                        <button
                          type="button"
                          onClick={() => setPreviewAudio(!previewAudio)}
                          className="flex items-center gap-1 text-primary hover:underline font-medium"
                        >
                          <Icon name={previewAudio ? 'volume_up' : 'volume_off'} size={14} />
                          <span>{previewAudio ? 'Speaker Preview (On)' : 'Mute Speaker Preview (Recording Audio is Active)'}</span>
                        </button>
                        <span className="font-mono">{Math.round(progress * duration)}s / {Math.round(duration)}s</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-ink-dim pt-1 border-t border-line/50">
                      Frames are being written from the editor timeline, not recorded from a tab. Switching windows cannot change the result.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Success Complete Banner */
            <div className="p-6 text-center bg-surface-2 rounded-card border border-line space-y-4">
              <div className="w-12 h-12 rounded-full bg-success/15 text-success grid place-items-center mx-auto">
                <Icon name="check_circle" size={28} />
              </div>
              <div>
                <h4 className="font-semibold text-base text-ink">Your reel is ready</h4>
                <p className="text-xs text-ink-muted mt-1">
                  {renderEngine === 'ffmpeg'
                    ? `Rendered frame by frame from the editor timeline at ${width}×${height} · ${fps} fps.`
                    : `Captured in real time with the browser recorder at ${width}×${height}.`}
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[10.5px] text-ink-dim">
                    {outputExt.toUpperCase()} · {outputCodec}
                  </span>
                  <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[10.5px] text-ink-dim">
                    {captionsBurned ? 'Captions burned in' : 'No captions'}
                  </span>
                  {renderedSize && (
                    <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[10.5px] text-ink-dim">
                      {fmtBytes(renderedSize)}
                    </span>
                  )}
                </div>
              </div>

              {/* Video Preview Player */}
              <div
                className="mx-auto max-w-[240px] overflow-hidden rounded-card border border-line bg-black"
                style={{ aspectRatio: `${width} / ${height}` }}
              >
                <video
                  src={renderedBlobUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <Button icon="download" onClick={handleDownload} className="w-full">
                  Download {outputExt.toUpperCase()}
                </Button>
                <Button
                  variant="secondary"
                  icon={savingExport ? 'autorenew' : 'schedule_send'}
                  iconSpin={savingExport}
                  onClick={handleSendToPublish}
                  disabled={savingExport}
                  className="w-full"
                >
                  {savingExport ? `Archiving reel ${savePct}%` : 'Send to Publish'}
                </Button>
                <Button
                  variant="ghost"
                  icon="autorenew"
                  onClick={handleRenderAgain}
                  className="w-full sm:col-span-2"
                >
                  Render again with different settings
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!renderedBlobUrl && (
          <div className="pt-4 border-t border-line shrink-0 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              icon="file_download"
              onClick={handleDirectDownloadSource}
              disabled={rendering}
              title="Download original master video file without re-rendering"
            >
              Direct Download Source
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={rendering ? handleCancelRender : onClose}>
                {rendering ? 'Stop render' : 'Cancel'}
              </Button>
              <Button
                icon="bolt" iconSpin={rendering}
                onClick={handleStartExport}
                disabled={rendering}
              >
                {rendering ? 'Rendering Video...' : 'Start Render'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
