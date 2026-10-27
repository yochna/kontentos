import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  activeBrollClipAt,
  activeCaptionAt,
  activeVideoClipAt,
  activeWordIndex,
  interpolatedTransformAt,
  isVideoGapAt,
  punchScaleAt,
  sourceTimeAt,
  totalDuration,
  videoClips,
  type SFXClip,
  type TextClip,
  type TimelineProject,
  type VideoClip,
} from '@/lib/timeline';
import { sfxEngine } from '@/utils/sfxEngine';
import { resolveBgmUrl } from '@/utils/bgmPresets';

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
  playbackRate?: number;
  onUpdateTextClip?: (clipId: string, newContent: string) => void;
}

function normalizeSourceUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    return decodeURIComponent(parsed.pathname);
  } catch {
    return decodeURIComponent(url);
  }
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
    playbackRate = 1,
    onUpdateTextClip,
  },
  ref,
) {
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const activePlayerRef = useRef<'A' | 'B'>('A');
  const [activePlayer, setActivePlayer] = useState<'A' | 'B'>('A');

  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [localMuted, setLocalMuted] = useState(false);
  const [localCaptionsVisible, setLocalCaptionsVisible] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);
  const lastTickRef = useRef<number | null>(null);

  // Direct Canvas Subtitle Editing state
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const captionInputRef = useRef<HTMLTextAreaElement>(null);

  const duration = project ? totalDuration(project) : 0;
  const clips = project ? videoClips(project) : [];
  const defaultSource = clips.find((c) => c.sourceUrl)?.sourceUrl ?? null;
  const activeClip = project ? activeVideoClipAt(project, t) : null;
  const activeSource = activeClip?.sourceUrl || defaultSource;

  const [sourceA, setSourceA] = useState<string | null>(defaultSource);
  const [sourceB, setSourceB] = useState<string | null>(null);

  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const currentClipIdRef = useRef<string | null>(null);
  const isSeekingRef = useRef<boolean>(false);
  const pendingSeekRef = useRef<{ targetTime: number; shouldPlay: boolean } | null>(null);
  const lastSeekTimestampRef = useRef<number>(0);
  const triggeredSfxIds = useRef<Set<string>>(new Set());

  const startEditingCaption = (cueClip: TextClip) => {
    if (!onUpdateTextClip) return;
    if (playingRef.current) {
      onPlayingChange?.(false);
    }
    setEditingClipId(cueClip.id);
    setEditingText(cueClip.content);
    setTimeout(() => {
      if (captionInputRef.current) {
        captionInputRef.current.focus();
        captionInputRef.current.select();
      }
    }, 40);
  };

  const commitCaptionEdit = () => {
    if (editingClipId && onUpdateTextClip) {
      const trimmed = editingText.trim();
      if (trimmed) {
        onUpdateTextClip(editingClipId, trimmed);
      }
    }
    setEditingClipId(null);
  };

  const cancelCaptionEdit = () => {
    setEditingClipId(null);
  };

  const isVideoTrackMuted = project?.tracks.find((t) => t.type === 'video')?.isMuted ?? false;
  const isAudioMuted = onToggleVideoMute ? isVideoTrackMuted : (isVideoTrackMuted || localMuted);

  // Directly synchronize media element muted property with track mute state
  useEffect(() => {
    if (videoRefA.current) {
      videoRefA.current.muted = isAudioMuted || activePlayerRef.current !== 'A';
    }
    if (videoRefB.current) {
      videoRefB.current.muted = isAudioMuted || activePlayerRef.current !== 'B';
    }
  }, [isAudioMuted, activePlayer]);

  // Keep sourceA aligned with defaultSource if sourceA is unset
  useEffect(() => {
    if (!sourceA && defaultSource) {
      setSourceA(defaultSource);
    }
  }, [defaultSource, sourceA]);

  const setTime = (v: number) => {
    tRef.current = v;
    setT(v);
    onTime?.(v);
  };

  const seekVideoTo = (timeline: number) => {
    triggeredSfxIds.current.clear();
    const proj = projectRef.current;
    if (!proj) return;
    const curClip = activeVideoClipAt(proj, timeline);
    const curSource = curClip?.sourceUrl || defaultSource;
    const inGap = isVideoGapAt(proj, timeline);
    const target = sourceTimeAt(proj, timeline);

    const activeV = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
    if (!activeV) return;

    if (curSource) {
      const activeSrc = activePlayerRef.current === 'A' ? sourceA : sourceB;
      if (normalizeSourceUrl(activeSrc) !== normalizeSourceUrl(curSource)) {
        pendingSeekRef.current = { targetTime: target, shouldPlay: playingRef.current };
        if (activePlayerRef.current === 'A') {
          setSourceA(curSource);
        } else {
          setSourceB(curSource);
        }
        return;
      }
    }

    if (Number.isFinite(target)) {
      const safeTarget =
        Number.isFinite(activeV.duration) && activeV.duration > 0
          ? Math.min(target, Math.max(0, activeV.duration - 0.001))
          : target;
      if (Math.abs(activeV.currentTime - safeTarget) > 0.03) {
        try {
          isSeekingRef.current = true;
          lastSeekTimestampRef.current = performance.now();
          activeV.currentTime = safeTarget;
        } catch {
          /* ignore if metadata not ready */
        }
      }
    }
    if (inGap && !activeV.paused) {
      try {
        activeV.pause();
      } catch {}
    }
  };

  const handleLoadedMetadata = (player: 'A' | 'B') => {
    const v = player === 'A' ? videoRefA.current : videoRefB.current;
    if (!v) return;
    v.muted = isAudioMuted || activePlayerRef.current !== player;

    if (activePlayerRef.current === player) {
      const proj = projectRef.current;
      const target = pendingSeekRef.current?.targetTime ?? (proj ? sourceTimeAt(proj, tRef.current) : 0);
      if (Number.isFinite(target)) {
        const safeTarget =
          Number.isFinite(v.duration) && v.duration > 0
            ? Math.min(target, Math.max(0, v.duration - 0.001))
            : target;
        try {
          v.currentTime = safeTarget;
        } catch {}
      }
      if (pendingSeekRef.current?.shouldPlay || playingRef.current) {
        if (!proj || !isVideoGapAt(proj, tRef.current)) {
          v.play().catch(() => {});
        }
      }
      pendingSeekRef.current = null;
    }
  };

  const handleCanPlay = (player: 'A' | 'B') => {
    if (activePlayerRef.current === player) {
      setVideoError(false);
    }
  };

  const handleSeeked = (player: 'A' | 'B') => {
    if (activePlayerRef.current === player) {
      isSeekingRef.current = false;
      lastTickRef.current = performance.now();
      const v = player === 'A' ? videoRefA.current : videoRefB.current;
      const proj = projectRef.current;
      if (v && playingRef.current && v.paused && (!proj || !isVideoGapAt(proj, tRef.current))) {
        v.play().catch(() => {});
      }
    }
  };

  const handleVideoError = (player: 'A' | 'B', err: unknown) => {
    if (activePlayerRef.current === player) {
      console.error(`[ReelPreview] Video player ${player} failed to load:`, err);
      setVideoError(true);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      seek(sec: number) {
        if (!project) return;
        triggeredSfxIds.current.clear();
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
    const defSrc = videoClips(project).find((c) => c.sourceUrl)?.sourceUrl ?? null;
    if (defSrc && !sourceA) {
      setSourceA(defSrc);
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
      const vA = videoRefA.current;
      const vB = videoRefB.current;
      if (vA && !vA.paused) vA.pause();
      if (vB && !vB.paused) vB.pause();
      sfxEngine.stopBGM();
      return;
    }

    // If starting at or near the end, restart from 0
    if (tRef.current >= duration - 0.05) {
      triggeredSfxIds.current.clear();
      setTime(0);
      seekVideoTo(0);
    }

    const curActive = activePlayerRef.current;
    const activeV = curActive === 'A' ? videoRefA.current : videoRefB.current;
    const standbyV = curActive === 'A' ? videoRefB.current : videoRefA.current;

    if (standbyV && !standbyV.paused) {
      try { standbyV.pause(); } catch {}
    }

    if (activeV) {
      const inGap = isVideoGapAt(project, tRef.current);
      const target = sourceTimeAt(project, tRef.current);
      if (Number.isFinite(target)) {
        try {
          activeV.currentTime = target;
        } catch {}
      }
      if (playbackRate > 0) {
        try {
          activeV.playbackRate = playbackRate;
        } catch {}
      }
      if (inGap) {
        activeV.muted = true;
        if (!activeV.paused) {
          try { activeV.pause(); } catch {}
        }
      } else if (playbackRate > 0) {
        activeV.muted = isAudioMuted;
        activeV.play().catch(async (err: any) => {
          // If autoplay policy blocks unmuted play, fallback to muted play so the video still plays visually
          if (err?.name === 'NotAllowedError' && !activeV.muted) {
            activeV.muted = true;
            try {
              await activeV.play();
            } catch {}
          }
        });
      }
    }

    // Start background music loop if configured
    const bgmAsset = project.globalAudioTracks?.backgroundMusicAssetId;
    if (bgmAsset && playbackRate > 0) {
      const bgmUrl = resolveBgmUrl(bgmAsset, project.globalAudioTracks.backgroundMusicUrl);
      sfxEngine.startBGM(
        bgmAsset,
        project.globalAudioTracks.bgmVolume || 0.25,
        bgmUrl,
      );
    }

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const prevTime = tRef.current;
      const inGap = isVideoGapAt(project, prevTime);

      const curPlayer = activePlayerRef.current;
      const aV = curPlayer === 'A' ? videoRefA.current : videoRefB.current;
      const sV = curPlayer === 'A' ? videoRefB.current : videoRefA.current;
      const curActiveSrc = curPlayer === 'A' ? sourceA : sourceB;
      const curStandbySrc = curPlayer === 'A' ? sourceB : sourceA;

      // Reverse playback handling for J key
      if (playbackRate < 0) {
        const nextTime = Math.max(0, prevTime + delta * playbackRate);
        if (nextTime <= 0) {
          setTime(0);
          seekVideoTo(0);
          onPlayingChange?.(false);
          return;
        }
        setTime(nextTime);
        seekVideoTo(nextTime);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Inverted Master Clock: Anchor timeline progression directly to the hardware audio/video clock
      // during active playback. This eliminates dual-clock drift, removes micro-seeks, and guarantees
      // zero audio stutter or popping.
      const curClip = activeVideoClipAt(project, prevTime);
      const isVideoAnchorActive =
        !inGap &&
        curClip &&
        aV &&
        !aV.paused &&
        !aV.seeking &&
        !isSeekingRef.current &&
        aV.readyState >= 2 &&
        Number.isFinite(aV.currentTime);

      let nextTime: number;
      if (isVideoAnchorActive) {
        const speed = curClip.speedMultiplier || 1;
        // Step 3: Clamp tRef.current strictly to activeVideoElement.currentTime + clip.startOnTimeline - clip.trimStart
        const rawCalculatedTimeline = curClip.startOnTimeline + (aV.currentTime - curClip.sourceStartOffset) / speed;
        const clampedTimeline = Math.min(
          curClip.startOnTimeline + curClip.duration,
          Math.max(curClip.startOnTimeline, rawCalculatedTimeline),
        );
        const elapsed = (aV.currentTime - curClip.sourceStartOffset) / speed;
        if (elapsed >= 0 && elapsed < curClip.duration) {
          nextTime = clampedTimeline;
        } else {
          // Reached or exceeded clip boundary -> smoothly advance across boundary
          nextTime = prevTime + Math.max(0.001, delta);
        }
        // Ensure strictly monotonic forward progress
        nextTime = Math.max(prevTime, nextTime);
      } else {
        // In gaps, buffering, or during cut seeks -> advance with high-precision wall clock
        nextTime = prevTime + delta;
      }

      if (nextTime >= duration) {
        setTime(duration);
        const vA = videoRefA.current;
        const vB = videoRefB.current;
        if (vA && !vA.paused) vA.pause();
        if (vB && !vB.paused) vB.pause();
        sfxEngine.stopBGM();
        onPlayingChange?.(false);
        const finalTarget = sourceTimeAt(project, duration);
        const curV = activePlayerRef.current === 'A' ? vA : vB;
        if (curV && Number.isFinite(finalTarget) && !curV.seeking) {
          try {
            curV.currentTime = finalTarget;
          } catch {}
        }
        return;
      }

      setTime(nextTime);

      // Trigger SFX clips when the playhead crosses their start timestamp on an unmuted SFX track
      const sfxTrack = project?.tracks.find((x) => x.type === 'sfx');
      if (sfxTrack && !sfxTrack.isMuted && delta > 0 && delta < 0.25) {
        const sClips = (sfxTrack.clips || []) as SFXClip[];
        for (const sfx of sClips) {
          if (prevTime <= sfx.startOnTimeline && nextTime > sfx.startOnTimeline) {
            if (!triggeredSfxIds.current.has(sfx.id)) {
              triggeredSfxIds.current.add(sfx.id);
              const vol = sfx.audioModifiers?.volume ?? 1.0;
              sfxEngine.play(sfx.sfxAssetId || 'pop', vol, sfx.sourceUrl);
            }
          }
        }
      }

      // Dynamic BGM Ducking: if voiceover dialogue is active, duck BGM; if in gap, unduck to full volume
      if (bgmAsset) {
        const nextInGap = isVideoGapAt(project, nextTime);
        const shouldDuck = !nextInGap && (project.globalAudioTracks?.duckingEnabled ?? true);
        sfxEngine.setDucked(shouldDuck, project.globalAudioTracks?.bgmVolume || 0.25);
      }

      // Keep video synced across cut boundaries and safely mute/pause in gaps
      if (aV) {
        const nextInGap = isVideoGapAt(project, nextTime);
        if (nextInGap) {
          if (!aV.paused) {
            try { aV.pause(); } catch {}
          }
          if (!aV.muted) {
            aV.muted = true;
          }
        } else {
          const nextClip = activeVideoClipAt(project, nextTime);
          const curSource = nextClip?.sourceUrl || defaultSource;
          const isNewClip = nextClip && nextClip.id !== currentClipIdRef.current;

          if (isNewClip) {
            currentClipIdRef.current = nextClip.id;
          }

          // Case 1: Clip source changed to a different video asset
          if (curSource && normalizeSourceUrl(curSource) !== normalizeSourceUrl(curActiveSrc)) {
            // Check if standby player already preloaded curSource
            if (sV && normalizeSourceUrl(curStandbySrc) === normalizeSourceUrl(curSource) && sV.readyState >= 2) {
              // Seamless instant swap to standby player with zero blackout!
              const expectedSource = sourceTimeAt(project, nextTime);
              if (!sV.seeking) {
                sV.currentTime = expectedSource;
              }
              sV.muted = isAudioMuted;
              sV.play().catch(() => {});
              aV.pause();
              aV.muted = true;
              const nextActive = curPlayer === 'A' ? 'B' : 'A';
              activePlayerRef.current = nextActive;
              setActivePlayer(nextActive);
              lastTickRef.current = performance.now();
            } else {
              // Standby player needs to load curSource
              pendingSeekRef.current = { targetTime: sourceTimeAt(project, nextTime), shouldPlay: true };
              if (curPlayer === 'A') {
                setSourceB(curSource);
                activePlayerRef.current = 'B';
                setActivePlayer('B');
              } else {
                setSourceA(curSource);
                activePlayerRef.current = 'A';
                setActivePlayer('A');
              }
            }
          } else {
            // Case 2: Same video asset across cuts or within clip
            if (aV.muted !== isAudioMuted) {
              aV.muted = isAudioMuted;
            }

            // Step 1: isSeeking Gate - Skip updating currentTime on active video if video.seeking is true
            if (isNewClip) {
              // Cut boundary crossed: jump immediately to new clip's source offset
              if (!aV.seeking) {
                const expectedSource = sourceTimeAt(project, nextTime);
                isSeekingRef.current = true;
                lastSeekTimestampRef.current = performance.now();
                try {
                  aV.currentTime = expectedSource;
                } catch {}
              }
            } else if (!isVideoAnchorActive && !aV.seeking && !isSeekingRef.current) {
              // Only apply drift correction if hardware video clock anchoring was unavailable and video is not seeking
              const expectedSource = sourceTimeAt(project, nextTime);
              if (Number.isFinite(expectedSource)) {
                const timeSinceLastSeek = performance.now() - lastSeekTimestampRef.current;
                if (timeSinceLastSeek > 500 && Math.abs(aV.currentTime - expectedSource) > 0.35) {
                  lastSeekTimestampRef.current = performance.now();
                  isSeekingRef.current = true;
                  try {
                    aV.currentTime = expectedSource;
                  } catch {}
                }
              }
            }

            if (aV.paused && !aV.seeking && !isSeekingRef.current) {
              aV.play().catch(() => {});
            }
          }

          // Step 2: Preload upcoming clip's source URL on inactive player when playhead is within 1.5s of transition
          const subsequentClip = clips.find((c) => c.startOnTimeline > nextTime);
          if (subsequentClip?.sourceUrl) {
            const timeToTransition = subsequentClip.startOnTimeline - nextTime;
            if (
              timeToTransition <= 1.5 &&
              normalizeSourceUrl(subsequentClip.sourceUrl) !== normalizeSourceUrl(curSource)
            ) {
              if (sV && normalizeSourceUrl(curStandbySrc) !== normalizeSourceUrl(subsequentClip.sourceUrl)) {
                if (curPlayer === 'A') {
                  setSourceB(subsequentClip.sourceUrl);
                } else {
                  setSourceA(subsequentClip.sourceUrl);
                }
              }
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
      sfxEngine.stopBGM();
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
  const transform = project
    ? interpolatedTransformAt(project, t)
    : { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 };
  const scale = transform.scale;
  const activeWord = cue ? activeWordIndex(cue, t) : -1;
  const isInGap = project ? isVideoGapAt(project, t) : false;
  const targetAspect = project?.projectMetadata.targetAspectRatio || '9:16';
  const isWidescreen = targetAspect === '16:9';

  const posClass =
    cue?.style.position === 'top'
      ? isWidescreen
        ? 'top-[10%]'
        : 'top-[16%]'
      : cue?.style.position === 'bottom'
      ? isWidescreen
        ? 'bottom-[10%]'
        : 'bottom-[14%]'
      : 'top-1/2 -translate-y-1/2';

  // Active visual transition effect
  const activeTransition = activeClip?.transition;
  const transDur = activeTransition?.durationSec || 0.3;
  const timeSinceClipStart = activeClip ? t - activeClip.startOnTimeline : 999;
  const isTransitioning =
    activeTransition &&
    activeTransition.type !== 'none' &&
    timeSinceClipStart >= 0 &&
    timeSinceClipStart <= transDur;
  const transitionProgress = isTransitioning ? Math.min(1, Math.max(0, timeSinceClipStart / transDur)) : 1;
  const activeBroll = project ? activeBrollClipAt(project, t) : null;

  return (
    <div className={`w-full h-full relative overflow-hidden bg-black select-none ${className}`}>
      <div className="absolute inset-0 w-full h-full grid place-items-center">
        {sourceA || sourceB ? (
          <div
            className="relative w-full h-full overflow-hidden"
            style={{
              transform: `scale(${transform.scale}) translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg)`,
              opacity: transform.opacity,
              transition: 'transform 80ms cubic-bezier(0.16, 1, 0.3, 1), opacity 80ms ease-out',
              clipPath:
                isTransitioning && activeTransition?.type === 'wipeleft'
                  ? `inset(0 ${Math.max(0, (1 - transitionProgress) * 100)}% 0 0)`
                  : undefined,
            }}
          >
            {/* Dual Video Player Pool for Seamless Multi-Clip and Zero Blackouts */}
            <video
              ref={videoRefA}
              src={sourceA ?? undefined}
              crossOrigin="anonymous"
              muted={isAudioMuted || activePlayer !== 'A'}
              playsInline
              preload="auto"
              className={`absolute inset-0 w-full h-full object-contain block transition-opacity duration-150 ${
                activePlayer === 'A'
                  ? isInGap
                    ? 'opacity-20 brightness-50 z-[2]'
                    : 'opacity-100 z-[2]'
                  : 'opacity-0 pointer-events-none z-[1]'
              }`}
              onLoadedMetadata={() => handleLoadedMetadata('A')}
              onCanPlay={() => handleCanPlay('A')}
              onSeeked={() => handleSeeked('A')}
              onError={(e) => handleVideoError('A', e)}
            />

            <video
              ref={videoRefB}
              src={sourceB ?? undefined}
              crossOrigin="anonymous"
              muted={isAudioMuted || activePlayer !== 'B'}
              playsInline
              preload="auto"
              className={`absolute inset-0 w-full h-full object-contain block transition-opacity duration-150 ${
                activePlayer === 'B'
                  ? isInGap
                    ? 'opacity-20 brightness-50 z-[2]'
                    : 'opacity-100 z-[2]'
                  : 'opacity-0 pointer-events-none z-[1]'
              }`}
              onLoadedMetadata={() => handleLoadedMetadata('B')}
              onCanPlay={() => handleCanPlay('B')}
              onSeeked={() => handleSeeked('B')}
              onError={(e) => handleVideoError('B', e)}
            />

            {/* Visual Cut Transition Simulation Overlays */}
            {isTransitioning && activeTransition?.type === 'flash' && (
              <div
                className="absolute inset-0 bg-white pointer-events-none z-10"
                style={{ opacity: Math.pow(1 - transitionProgress, 1.5) }}
              />
            )}
            {isTransitioning && activeTransition?.type === 'fadeblack' && (
              <div
                className="absolute inset-0 bg-black pointer-events-none z-10"
                style={{ opacity: Math.pow(1 - transitionProgress, 1.5) }}
              />
            )}
            {isTransitioning && activeTransition?.type === 'fade' && (
              <div
                className="absolute inset-0 bg-black/50 pointer-events-none z-10"
                style={{ opacity: 1 - transitionProgress }}
              />
            )}

            {/* B-Roll Stock Footage & Media Overlay */}
            {activeBroll?.sourceUrl && (
              <div className="absolute inset-0 z-15 overflow-hidden">
                <video
                  key={activeBroll.id}
                  src={activeBroll.sourceUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover block animate-in fade-in zoom-in-95 duration-200"
                />
                <div className="absolute bottom-2.5 left-2.5 z-20 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur border border-white/20 text-white/90 text-[10px] font-semibold flex items-center gap-1 shadow-sm">
                  <Icon name="movie" size={11} className="text-secondary" />
                  <span className="truncate max-w-[130px]">{activeBroll.name || 'B-Roll'}</span>
                </div>
              </div>
            )}
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
              const activeV = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
              if (activeV) {
                activeV.load();
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
        {activeSource && (
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

      {/* Kinetic caption overlay & inline canvas text editor */}
      {cue && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-[88%] text-center select-none ${
            editingClipId === cue.id ? 'z-40 pointer-events-auto' : 'z-25 pointer-events-auto cursor-text'
          } ${posClass}`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEditingCaption(cue);
          }}
          title={editingClipId === cue.id ? undefined : 'Double-click to edit subtitle text directly'}
        >
          {editingClipId === cue.id ? (
            <div
              className="inline-flex flex-col items-center p-2 rounded-xl backdrop-blur-md bg-black/85 border-2 border-primary shadow-2xl ring-2 ring-primary/40 animate-in fade-in zoom-in-95 duration-150 max-w-full"
              style={{
                boxShadow: '0 8px 30px rgba(0,0,0,0.85), 0 0 16px rgba(40, 92, 77, 0.6)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <textarea
                ref={captionInputRef}
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={commitCaptionEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitCaptionEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelCaptionEdit();
                  }
                }}
                rows={Math.max(1, editingText.split('\n').length)}
                className="w-full bg-transparent text-center resize-none outline-none font-black leading-tight border-none focus:ring-0 p-1"
                style={{
                  fontFamily: cue.style.fontFamily,
                  fontSize: `clamp(13px, ${cue.style.fontSize / (isWidescreen ? 3.6 : 2.5)}px, ${isWidescreen ? '26px' : '34px'})`,
                  color: cue.style.colorHex,
                  textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                }}
                placeholder="Edit caption text..."
              />
              <div className="flex items-center gap-2 mt-1 pt-1 border-t border-white/20 text-[10.5px] font-semibold text-white/80">
                <span className="flex items-center gap-0.5 text-emerald-400">
                  <Icon name="keyboard_return" size={11} />
                  <span>Enter to save</span>
                </span>
                <span>·</span>
                <span className="text-white/50">Esc to cancel</span>
              </div>
            </div>
          ) : (
            <span
              className={`inline-block px-3 py-1.5 rounded-lg backdrop-blur leading-tight transition-transform hover:scale-[1.03] hover:ring-2 hover:ring-primary/70 ${animClass(
                cue,
              )}`}
              style={{
                fontFamily: cue.style.fontFamily,
                fontSize: `clamp(12px, ${cue.style.fontSize / (isWidescreen ? 3.6 : 2.5)}px, ${isWidescreen ? '26px' : '34px'})`,
                color: cue.style.colorHex,
                WebkitTextStroke:
                  cue.style.strokeWidth && cue.style.strokeColorHex
                    ? `${cue.style.strokeWidth / 2}px ${cue.style.strokeColorHex}`
                    : undefined,
                textShadow:
                  cue.style.shadowColorHex
                    ? `0 2px 8px ${cue.style.shadowColorHex}`
                    : '0 2px 6px rgba(0,0,0,0.7)',
                background:
                  cue.style.bannerPillColorHex ||
                  (cue.style.animation === 'bannerPill' ? 'rgba(0,0,0,0.65)' : 'transparent'),
                boxShadow:
                  cue.style.bannerPillColorHex || cue.style.animation === 'bannerPill'
                    ? '0 4px 14px rgba(0,0,0,0.5)'
                    : undefined,
                fontWeight: 900,
                letterSpacing: '0.01em',
              }}
            >
              {renderCue(cue, activeWord)}
            </span>
          )}
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
  return words.map((w, i) => {
    const isCurrent = activeWord >= 0 && i === activeWord;
    return (
      <span
        key={i}
        style={
          isCurrent && cue.style.activeWordColorHex
            ? {
                color: cue.style.activeWordColorHex,
                WebkitTextStroke:
                  cue.style.strokeWidth && cue.style.strokeColorHex
                    ? `${cue.style.strokeWidth / 2}px ${cue.style.strokeColorHex}`
                    : undefined,
                textShadow: `0 0 14px ${cue.style.activeWordColorHex}99, 0 2px 8px rgba(0,0,0,0.8)`,
              }
            : undefined
        }
        className={
          isCurrent
            ? 'inline-block scale-[1.12] transition-transform duration-100 ease-out font-black'
            : 'inline-block transition-transform duration-150'
        }
      >
        {w}
        {i < words.length - 1 ? '\u00A0' : ''}
      </span>
    );
  });
}
