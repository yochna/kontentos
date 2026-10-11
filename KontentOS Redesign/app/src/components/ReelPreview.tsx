import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  activeWordIndex,
  punchScaleAt,
  sourceTimeAt,
  totalDuration,
  videoClips,
  type TextClip,
  type TimelineProject,
  type VideoClip,
} from '@/lib/timeline';

export interface ReelHandle {
  seek: (timelineSec: number) => void;
}

interface Props {
  project: TimelineProject | null;
  playing: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onTime?: (timelineSec: number) => void;
  className?: string;
  onGenerateCaptions?: () => void;
  generatingCaptions?: boolean;
  captionsVisible?: boolean;
  onToggleCaptions?: (visible?: boolean) => void;
  onToggleVideoMute?: () => void;
}

/** The caption text clip active at time t (already scoped to project). */
function cueAt(project: TimelineProject, t: number): TextClip | null {
  const track = project.tracks.find((x) => x.type === 'text');
  if (!track || track.isMuted) return null;
  const cues = (track.clips ?? []) as TextClip[];
  return cues.find((c) => t >= c.startOnTimeline - 0.001 && t <= c.startOnTimeline + c.duration) ?? null;
}

export const ReelPreview = forwardRef<ReelHandle, Props>(function ReelPreview(
  {
    project,
    playing,
    onPlayingChange,
    onTime,
    className = '',
    onGenerateCaptions,
    generatingCaptions = false,
    captionsVisible,
    onToggleCaptions,
    onToggleVideoMute,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [localMuted, setLocalMuted] = useState(false);
  const [localCaptionsVisible, setLocalCaptionsVisible] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);
  const lastTickRef = useRef<number | null>(null);

  const duration = project ? totalDuration(project) : 0;
  const clips = project ? videoClips(project) : [];
  const source = clips.find((c) => c.sourceUrl)?.sourceUrl ?? null;
  const isVideoTrackMuted = project?.tracks.find((t) => t.type === 'video')?.isMuted ?? false;
  const isAudioMuted = onToggleVideoMute ? isVideoTrackMuted : (isVideoTrackMuted || localMuted);

  // Directly synchronize media element muted property with track mute state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isAudioMuted;
    }
  }, [isAudioMuted]);

  const setTime = (v: number) => {
    tRef.current = v;
    setT(v);
    onTime?.(v);
  };

  const seekVideoTo = (timeline: number) => {
    const v = videoRef.current;
    if (!v || !project) return;
    const target = sourceTimeAt(project, timeline);
    if (Number.isFinite(target)) {
      const safeTarget =
        Number.isFinite(v.duration) && v.duration > 0
          ? Math.min(target, Math.max(0, v.duration - 0.001))
          : target;
      if (Math.abs(v.currentTime - safeTarget) > 0.03) {
        try {
          v.currentTime = safeTarget;
        } catch {
          /* ignore if metadata not ready */
        }
      }
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      seek(sec: number) {
        if (!project) return;
        const clamped = Math.max(0, Math.min(sec, duration || sec));
        setTime(clamped);
        seekVideoTo(clamped);
      },
    }),
    [project, duration],
  );

  // Set up a paused frame whenever the project changes.
  useEffect(() => {
    if (!project) return;
    const maxDur = totalDuration(project) || 0;
    if (tRef.current > maxDur) {
      setTime(maxDur);
    }
    seekVideoTo(tRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.projectMetadata.id]);

  // Master high-precision timeline clock:
  // Advances the timeline based on wall-clock deltas and keeps the underlying <video> in lockstep.
  useEffect(() => {
    if (!playing || !project || duration <= 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
      const v = videoRef.current;
      if (v && !v.paused) v.pause();
      return;
    }

    // If starting at or near the end, restart from 0
    if (tRef.current >= duration - 0.05) {
      setTime(0);
      seekVideoTo(0);
    }

    const v = videoRef.current;
    if (v) {
      const target = sourceTimeAt(project, tRef.current);
      if (Number.isFinite(target)) {
        try {
          v.currentTime = target;
        } catch {}
      }
      v.muted = isAudioMuted;
      v.play().catch(async (err: any) => {
        // If autoplay policy blocks unmuted play, fallback to muted play so the video still plays visually
        if (err?.name === 'NotAllowedError' && !v.muted) {
          v.muted = true;
          try {
            await v.play();
          } catch {}
        }
      });
    }

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const nextTime = tRef.current + delta;

      if (nextTime >= duration) {
        setTime(duration);
        if (v && !v.paused) v.pause();
        onPlayingChange?.(false);
        const finalTarget = sourceTimeAt(project, duration);
        if (v && Number.isFinite(finalTarget)) {
          try {
            v.currentTime = finalTarget;
          } catch {}
        }
        return;
      }

      setTime(nextTime);

      // Keep video synced across cut boundaries
      if (v && !v.seeking) {
        const expectedSource = sourceTimeAt(project, nextTime);
        if (Number.isFinite(expectedSource) && Math.abs(v.currentTime - expectedSource) > 0.15) {
          try {
            v.currentTime = expectedSource;
          } catch {}
        }
        if (v.paused) {
          v.play().catch(() => {});
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, project, duration]);

  const textTrack = project?.tracks.find((x) => x.type === 'text');
  const hasCaptions = !!textTrack && (textTrack.clips?.length ?? 0) > 0;
  const isCCActive =
    (captionsVisible !== undefined ? captionsVisible : localCaptionsVisible) &&
    hasCaptions &&
    !textTrack?.isMuted;

  const rawCue = project ? cueAt(project, t) : null;
  const cue = isCCActive ? rawCue : null;
  const scale = project ? punchScaleAt(project, t) : 1;
  const activeWord = cue ? activeWordIndex(cue, t) : -1;

  const posClass =
    cue?.style.position === 'top'
      ? 'top-[16%]'
      : cue?.style.position === 'bottom'
      ? 'bottom-[14%]'
      : 'top-[42%]';

  return (
    <div className={`w-full h-full relative overflow-hidden bg-black select-none ${className}`}>
      <div className="absolute inset-0 w-full h-full grid place-items-center">
        {source ? (
          <div
            className="relative w-full h-full overflow-hidden"
            style={{
              transform: `scale(${scale})`,
              transition: 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <video
              ref={videoRef}
              src={source}
              crossOrigin="anonymous"
              muted={isAudioMuted}
              playsInline
              preload="auto"
              className="w-full h-full object-cover block"
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.muted = isAudioMuted;
                }
                seekVideoTo(tRef.current);
              }}
              onError={(e) => {
                console.error('[ReelPreview] Video failed to load:', source, e);
                setVideoError(true);
              }}
              onCanPlay={() => setVideoError(false)}
            />
          </div>
        ) : (
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              background: 'linear-gradient(160deg,#285c4d,#3c6e7a 60%,#14171a)',
            }}
          />
        )}
      </div>

      {/* Video Decode / Network Error State */}
      {videoError && (
        <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center p-4 text-center">
          <Icon name="error_outline" size={32} className="text-amber-400 mb-2" />
          <p className="text-xs text-white font-medium">Video could not be decoded</p>
          <button
            type="button"
            onClick={() => {
              setVideoError(false);
              if (videoRef.current) {
                videoRef.current.load();
                seekVideoTo(tRef.current);
              }
            }}
            className="mt-3 text-[11px] px-3 py-1.5 rounded-btn bg-white/20 hover:bg-white/30 text-white font-medium transition-colors"
          >
            Retry Load
          </button>
        </div>
      )}

      {/* AI Captions Generating Banner */}
      {generatingCaptions && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur border border-emerald-500/50 text-emerald-300 text-[11px] font-medium shadow-xl animate-pulse">
          <Icon name="auto_awesome" size={14} className="animate-spin text-emerald-400" />
          <span>AI Transcribing Audio & Generating Captions...</span>
        </div>
      )}

      {/* Top-Right Player Controls (Live CC + Audio Mute) */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
        {/* Live CC Toggle / AI Generator Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (generatingCaptions) return;
            if (!hasCaptions && onGenerateCaptions) {
              onGenerateCaptions();
            } else if (onToggleCaptions) {
              onToggleCaptions(!isCCActive);
            } else {
              setLocalCaptionsVisible((v) => !v);
            }
          }}
          disabled={generatingCaptions}
          className={`h-8 px-2.5 rounded-full backdrop-blur flex items-center gap-1 border text-xs font-semibold transition-all shadow-md ${
            isCCActive
              ? 'bg-emerald-600 text-white border-emerald-400/60 shadow-emerald-900/30'
              : hasCaptions
              ? 'bg-black/60 text-white/80 border-white/20 hover:text-white hover:bg-black/80'
              : 'bg-black/60 text-white/70 border-white/20 hover:text-white hover:border-emerald-500/50'
          } ${generatingCaptions ? 'opacity-60 cursor-wait' : 'hover:scale-105 active:scale-95'}`}
          title={
            generatingCaptions
              ? 'Generating AI Captions...'
              : hasCaptions
              ? (isCCActive ? 'Hide Live Captions (CC)' : 'Show Live Captions (CC)')
              : 'Generate AI Live Captions from Audio'
          }
          aria-label={
            hasCaptions
              ? (isCCActive ? 'Hide Live Captions' : 'Show Live Captions')
              : 'Generate AI Live Captions'
          }
        >
          <Icon
            name={generatingCaptions ? 'hourglass_top' : isCCActive ? 'closed_caption' : 'closed_caption_disabled'}
            size={15}
          />
          <span className="text-[11px] tracking-wide">
            {generatingCaptions ? 'Generating...' : hasCaptions ? 'CC' : 'Auto CC'}
          </span>
          {!hasCaptions && !generatingCaptions && (
            <Icon name="auto_awesome" size={11} className="text-amber-300 ml-0.5" />
          )}
        </button>

        {/* Mute / Unmute Audio Toggle */}
        {source && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleVideoMute) {
                onToggleVideoMute();
              } else {
                setLocalMuted((m) => !m);
              }
            }}
            className={`w-8 h-8 rounded-full backdrop-blur text-white/90 hover:text-white flex items-center justify-center border transition-all hover:scale-105 shadow-md ${
              isAudioMuted
                ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                : 'bg-black/60 border-white/20'
            }`}
            title={isAudioMuted ? 'Unmute video audio' : 'Mute video audio'}
            aria-label={isAudioMuted ? 'Unmute video audio' : 'Mute video audio'}
          >
            <Icon name={isAudioMuted ? 'volume_off' : 'volume_up'} size={16} />
          </button>
        )}
      </div>

      {/* Kinetic caption overlay */}
      {cue && (
        <div
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 w-[88%] text-center ${posClass}`}
        >
          <span
            className={`inline-block px-3 py-1 rounded-md backdrop-blur leading-tight ${animClass(
              cue,
            )}`}
            style={{
              fontFamily: cue.style.fontFamily,
              fontSize: `clamp(14px, ${cue.style.fontSize / 3}px, 34px)`,
              color: cue.style.colorHex,
              textShadow: '0 2px 6px rgba(0,0,0,0.6)',
              background:
                cue.style.animation === 'bannerPill' ? 'rgba(0,0,0,0.55)' : 'transparent',
              fontWeight: 800,
              letterSpacing: '0.01em',
            }}
          >
            {renderCue(cue, activeWord)}
          </span>
        </div>
      )}

      {/* Scrub progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
        <div
          className="h-full bg-white/80"
          style={{ width: `${duration ? (t / duration) * 100 : 0}%` }}
        />
      </div>

      {/* Big Play Overlay (when paused) */}
      {duration > 0 && !playing && (
        <button
          onClick={() => onPlayingChange?.(true)}
          className="absolute inset-0 grid place-items-center kt-focus bg-black/20 hover:bg-black/30 transition-colors"
          aria-label="Play preview"
        >
          <span className="grid place-items-center w-16 h-16 rounded-full bg-black/55 backdrop-blur text-white border border-white/30 shadow-lg transform transition-transform hover:scale-110">
            <Icon name="play_arrow" size={34} />
          </span>
        </button>
      )}
    </div>
  );
});

function animClass(cue: TextClip): string {
  switch (cue.style.animation) {
    case 'popIn':
      return 'kt-cap-pop';
    case 'karaoke':
    case 'kineticWave':
      return 'kt-cap-wave';
    case 'bouncePop':
      return 'kt-cap-pop';
    case 'fade':
      return 'kt-cap-fade';
    default:
      return '';
  }
}

function renderCue(cue: TextClip, activeWord: number) {
  const words = cue.style.words?.length
    ? cue.style.words.map((w) => w.word)
    : cue.content.split(' ');
  return words.map((w, i) => (
    <span
      key={i}
      style={
        activeWord >= 0 && i === activeWord && cue.style.activeWordColorHex
          ? { color: cue.style.activeWordColorHex }
          : undefined
      }
      className={
        activeWord >= 0 && i === activeWord
          ? 'inline-block scale-[1.08] transition-transform'
          : 'inline-block'
      }
    >
      {w}
      {i < words.length - 1 ? '\u00A0' : ''}
    </span>
  ));
}
