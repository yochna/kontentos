import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, StatusPill } from '@/components/ui';
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
  onSendToPublish: (exported?: { videoUrl: string; byteLength?: number }) => void;
}

export function ExportModal({ project, defaultSourceUrl, onClose, onSendToPublish }: ExportModalProps) {
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

  const duration = totalDuration(project);
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

  // Clean up blob URL and audio nodes on unmount
  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
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
    setRendering(true);
    setProgress(0.01);
    setStageMsg('Initializing High-Definition Canvas & Multi-Track Audio Engine...');
    setErrorMsg(null);

    try {
      // 1. Target Dimensions
      const width = resolution === '9:16' ? 1080 : resolution === '1:1' ? 1080 : resolution === '4:5' ? 1080 : 1920;
      const height = resolution === '9:16' ? 1920 : resolution === '1:1' ? 1080 : resolution === '4:5' ? 1350 : 1080;

      // 2. Setup Primary Rendering Canvas
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

          // Compute exact timeline position from active video element playback (zero drift, zero stutter)
          const currentVideoTime = activeV ? activeV.currentTime : 0;
          const clipElapsed = Math.max(0, (currentVideoTime - curSrcStart) / curSpeed);
          const currentTimelineSec = Math.min(totalCompDuration, curClipTimelineStart + clipElapsed);

          // Check for clip completion or total duration reached
          if (
            clipElapsed >= curClipDur - 0.03 ||
            currentTimelineSec >= totalCompDuration - 0.03 ||
            (activeV && activeV.ended)
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
          const caption = activeCaptionAt(project, currentTimelineSec);
          if (caption && caption.content) {
            ctx.save();
            const activeWIdx = activeWordIndex(caption, currentTimelineSec);
            const words = caption.style?.words || [];
            const fontName = caption.style?.fontFamily?.includes('serif') ? 'Georgia, serif' : 'system-ui, sans-serif';
            
            const isWidescreen = width > height;
            const minDim = Math.min(width, height);
            const fontScale = minDim / 1080;
            let baseFontSize = Math.round((caption.style?.fontSize || 54) * fontScale);
            const primaryColor = caption.style?.colorHex || '#FFFFFF';
            const activeColor = caption.style?.activeWordColorHex || '#F3B747';
            const pos = caption.style?.position || 'middle';
            const yPos = pos === 'top' ? height * (isWidescreen ? 0.15 : 0.20) : pos === 'bottom' ? height * (isWidescreen ? 0.85 : 0.80) : height * 0.50;

            ctx.font = `bold ${baseFontSize}px ${fontName}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Auto-clamp font size if line exceeds safe bounding box (86% of width)
            const maxAllowedTextWidth = width * 0.86;
            const fullText = words.length > 0 ? words.map((w) => w.word).join(' ') : caption.content;
            const initialMeasuredWidth = ctx.measureText(fullText).width;
            if (initialMeasuredWidth > maxAllowedTextWidth && initialMeasuredWidth > 0) {
              const shrinkRatio = maxAllowedTextWidth / initialMeasuredWidth;
              baseFontSize = Math.max(18, Math.floor(baseFontSize * shrinkRatio));
              ctx.font = `bold ${baseFontSize}px ${fontName}`;
            }

            if (words.length > 0) {
              const fullText = words.map((w) => w.word).join(' ');
              const totalTextWidth = ctx.measureText(fullText).width;
              let currentX = width / 2 - totalTextWidth / 2;

              if (caption.style?.animation === 'bannerPill') {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                const pillPaddingX = 24;
                const pillPaddingY = 14;
                ctx.beginPath();
                ctx.roundRect(
                  width / 2 - totalTextWidth / 2 - pillPaddingX,
                  yPos - baseFontSize / 2 - pillPaddingY,
                  totalTextWidth + pillPaddingX * 2,
                  baseFontSize + pillPaddingY * 2,
                  16
                );
                ctx.fill();
              }

              words.forEach((wObj, idx) => {
                const wordStr = wObj.word + (idx < words.length - 1 ? ' ' : '');
                const wordWidth = ctx.measureText(wordStr).width;
                const isActive = activeWIdx === idx;

                ctx.save();
                ctx.fillStyle = isActive ? activeColor : primaryColor;
                ctx.shadowColor = 'rgba(0,0,0,0.9)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 3;

                if (isActive && caption.style?.animation === 'popIn') {
                  ctx.font = `bold ${Math.round(baseFontSize * 1.18)}px ${fontName}`;
                }

                ctx.strokeStyle = '#000000';
                ctx.lineWidth = Math.max(3, Math.round(baseFontSize * 0.08));
                ctx.strokeText(wordStr, currentX + wordWidth / 2, yPos);
                ctx.fillText(wordStr, currentX + wordWidth / 2, yPos);
                ctx.restore();

                currentX += wordWidth;
              });
            } else {
              ctx.shadowColor = 'rgba(0,0,0,0.9)';
              ctx.shadowBlur = 10;
              ctx.shadowOffsetX = 2;
              ctx.shadowOffsetY = 3;
              ctx.fillStyle = primaryColor;
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = Math.max(3, Math.round(baseFontSize * 0.08));
              ctx.strokeText(caption.content, width / 2, yPos);
              ctx.fillText(caption.content, width / 2, yPos);
            }

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

        animId = requestAnimationFrame(loop);
      });

      // 8. Finalize Video Blob Package
      setStageMsg('Finalizing MP4 media package...');
      setProgress(0.99);

      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => resolve();
      });

      const finalBlob = new Blob(recordedChunks, { type: selectedMimeType });
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
      setErrorMsg(err?.message || 'Video export rendering encountered an issue.');
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
    <>
      <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-xs" onClick={!rendering ? onClose : undefined} />
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
                <h3 className="font-semibold text-base text-ink">Export Composition</h3>
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
              <div className="p-3.5 bg-danger/10 border border-danger/25 rounded-btn text-danger text-xs flex items-start gap-2">
                <Icon name="error" size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong>Render notice:</strong> {errorMsg}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleDirectDownloadSource}
                      className="underline font-semibold hover:text-danger-strong"
                    >
                      Click here to download source master directly →
                    </button>
                  </div>
                </div>
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
                            ? 'border-primary bg-primary-soft ring-2 ring-primary/25 shadow-sm'
                            : 'border-line hover:border-line-strong bg-surface'
                        }`}
                      >
                        <Icon name={r.icon} size={16} className="text-primary mb-1" />
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
                      <option value="standard">Balanced (4.5 Mbps)</option>
                      <option value="high">High Fidelity Studio (8 Mbps)</option>
                    </select>
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

                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-150"
                        style={{ width: `${Math.max(4, progress * 100)}%` }}
                      />
                    </div>

                    {/* Live Preview Monitor */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="max-w-[140px] mx-auto aspect-[9/16] bg-black rounded-lg overflow-hidden border border-line relative shadow-sm">
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
                  <h4 className="font-semibold text-base text-ink">Video Exported Successfully!</h4>
                  <p className="text-xs text-ink-muted mt-1">
                    Your composition with burned-in kinetic subtitles, punch zooms, and synchronized audio is ready for download.
                  </p>
                  {renderedSize && (
                    <span className="inline-block mt-2 text-[11px] font-mono font-medium text-ink-dim bg-surface px-2.5 py-1 rounded-full border border-line">
                      File size: {(renderedSize / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                </div>

                {/* Video Preview Player */}
                <div className="max-w-[240px] mx-auto rounded-card overflow-hidden border border-line bg-black aspect-[9/16]">
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
                    Download MP4
                  </Button>
                  <Button
                    variant="secondary"
                    icon="schedule_send"
                    onClick={() => {
                      transferredRef.current = true;
                      const exported = renderedBlobUrl
                        ? { videoUrl: renderedBlobUrl, byteLength: renderedSize || undefined }
                        : undefined;
                      onClose();
                      onSendToPublish(exported);
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
                <Button variant="secondary" onClick={onClose} disabled={rendering}>
                  Cancel
                </Button>
                <Button
                  icon={rendering ? 'hourglass_top' : 'bolt'}
                  onClick={handleStartExport}
                  disabled={rendering}
                >
                  {rendering ? 'Rendering Video...' : 'Start Render'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
