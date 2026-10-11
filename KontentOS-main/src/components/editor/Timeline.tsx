/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Scissors,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Type,
  Volume2,
  VolumeX,
  Film,
  Layers,
  Magnet,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Sparkles,
  Activity,
  Sliders,
} from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import {
  TimelineTrack,
  TimelineClip,
  VideoClip,
  TextClip,
  SFXClip,
} from '../../types/timeline';
import { sfxEngine } from '../../utils/sfxEngine';
import { KeyframeGraphEditor } from './KeyframeGraphEditor';

interface TimelineProps {
  className?: string;
}

interface ClipWaveformPreviewProps {
  clip: TimelineClip;
  widthPx: number;
}

function ClipWaveformPreview({ clip, widthPx }: ClipWaveformPreviewProps) {
  const [waveform, setWaveform] = useState<number[]>([]);

  useEffect(() => {
    let isMounted = true;
    const numBars = Math.max(10, Math.floor(widthPx / 4));

    const sourceUrl =
      (clip as VideoClip).sourceUrl || (clip as SFXClip).sourceUrl || '';

    if (sourceUrl) {
      sfxEngine.getWaveformForUrl(sourceUrl, numBars).then((samples) => {
        if (isMounted) setWaveform(samples);
      });
    } else {
      // Deterministic synthetic waveform for clips without URL
      const synth = Array.from({ length: numBars }, (_, i) =>
        Math.abs(Math.sin((i + clip.duration) * 0.45) * 0.75 + Math.cos(i * 0.3) * 0.25)
      );
      setWaveform(synth);
    }

    return () => {
      isMounted = false;
    };
  }, [clip, widthPx]);

  if (waveform.length === 0) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none opacity-30 overflow-hidden z-0">
      <svg className="w-full h-8" preserveAspectRatio="none" viewBox={`0 0 ${waveform.length} 100`}>
        {waveform.map((amp, idx) => {
          const h = Math.max(10, amp * 90);
          const y = (100 - h) / 2;
          return (
            <rect
              key={idx}
              x={idx}
              y={y}
              width={0.7}
              height={h}
              fill="currentColor"
              className={clip.type === 'sfx' ? 'text-pink-300' : 'text-indigo-200'}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function Timeline({ className = '' }: TimelineProps): React.ReactElement {
  const {
    project,
    currentTime,
    isPlaying,
    selectedClipIds,
    setCurrentTime,
    setIsPlaying,
    selectClip,
    setSelectedClipIds,
    updateClip,
    splitClip,
    deleteClip,
    undo,
    redo,
    history,
  } = useTimelineStore();

  // Pixels per second zoom factor (default 85px per second)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(85);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [showGraphEditor, setShowGraphEditor] = useState(false);
  const [activeSnapTime, setActiveSnapTime] = useState<number | null>(null);
  const [liveAudioPeak, setLiveAudioPeak] = useState(0);

  // Marquee multi-clip selection box state
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isSelecting: boolean;
  } | null>(null);

  // Track volume state faders
  const [trackVolumes, setTrackVolumes] = useState<Record<string, number>>({});

  // Dragging state for clips and playhead
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'trim-start' | 'trim-end' | 'scrub' | null;
    clipId?: string;
    trackId?: string;
    initialMouseX: number;
    initialStartOnTimeline?: number;
    initialDuration?: number;
    initialSourceOffset?: number;
  }>({ mode: null, initialMouseX: 0 });

  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const tracksScrollRef = useRef<HTMLDivElement | null>(null);

  // Live Audio VU Peak meter polling during playback
  useEffect(() => {
    let animId: number;
    const updateVU = () => {
      if (isPlaying) {
        const peak = sfxEngine.getLiveAudioPeak();
        // Add smooth simulated ambient wiggle for active tracks if audio context is quiet
        const simPeak = Math.max(peak, 0.25 + Math.random() * 0.45);
        setLiveAudioPeak(simPeak);
        animId = requestAnimationFrame(updateVU);
      } else {
        setLiveAudioPeak(0);
      }
    };

    updateVU();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  const totalDuration = useMemo(() => {
    return Math.max(project.projectMetadata.totalDuration || 10, 5);
  }, [project.projectMetadata.totalDuration]);

  // Handle Keyboard Shortcuts:
  // - Spacebar: Play/Pause
  // - J / K / L: Shuttle Playback (J: reverse/slow, K: pause, L: forward/fast)
  // - S / s: Split clip at playhead
  // - Delete / Backspace: Delete selected clip (Shift+Delete for ripple delete)
  // - Cmd/Ctrl+Z: Undo / Cmd/Ctrl+Shift+Z: Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setIsPlaying(false);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setIsPlaying(true);
        setCurrentTime(Math.min(totalDuration, currentTime + 0.5));
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentTime(Math.max(0, currentTime - 0.5));
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        // Split clip at playhead
        if (selectedClipIds.length > 0) {
          splitClip(selectedClipIds[0], currentTime);
        } else {
          // Find any clip under playhead, prioritizing video track
          let clipToSplit: TimelineClip | null = null;
          const videoTrack = project.tracks.find((t) => t.type === 'video');
          if (videoTrack) {
            clipToSplit = videoTrack.clips.find(
              (c) => currentTime > c.startOnTimeline && currentTime < c.startOnTimeline + c.duration
            ) || null;
          }
          if (!clipToSplit) {
            for (const t of project.tracks) {
              clipToSplit = t.clips.find(
                (c) => currentTime > c.startOnTimeline && currentTime < c.startOnTimeline + c.duration
              ) || null;
              if (clipToSplit) break;
            }
          }
          if (clipToSplit) {
            splitClip(clipToSplit.id, currentTime);
          }
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipIds.length > 0) {
          e.preventDefault();
          const store = useTimelineStore.getState();
          selectedClipIds.forEach((id) => {
            if (e.shiftKey && store.rippleDeleteClip) {
              store.rippleDeleteClip(id);
            } else {
              deleteClip(id);
            }
          });
          setSelectedClipIds([]);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 1.0 : 1 / 30)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentTime(Math.min(totalDuration, currentTime + (e.shiftKey ? 1.0 : 1 / 30)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaying,
    selectedClipIds,
    currentTime,
    project.tracks,
    totalDuration,
    setIsPlaying,
    splitClip,
    deleteClip,
    undo,
    redo,
    setCurrentTime,
    setSelectedClipIds,
  ]);

  // Snapping points helper (10px threshold)
  const snapPoints = useMemo(() => {
    if (!snappingEnabled) return [];
    const points = new Set<number>();
    points.add(0);
    points.add(currentTime);
    project.tracks.forEach((track) => {
      track.clips.forEach((c) => {
        points.add(c.startOnTimeline);
        points.add(c.startOnTimeline + c.duration);
      });
    });
    return Array.from(points);
  }, [snappingEnabled, project.tracks, currentTime]);

  const snapTime = useCallback(
    (targetTime: number, thresholdPx = 10): { snappedTime: number; snapPoint: number | null } => {
      if (!snappingEnabled) return { snappedTime: Math.max(0, targetTime), snapPoint: null };
      const thresholdSec = thresholdPx / pixelsPerSecond;
      for (const pt of snapPoints) {
        if (Math.abs(pt - targetTime) <= thresholdSec) {
          return { snappedTime: pt, snapPoint: pt };
        }
      }
      return { snappedTime: Math.max(0, targetTime), snapPoint: null };
    },
    [snappingEnabled, snapPoints, pixelsPerSecond]
  );

  // Mouse Wheel Zooming over track canvas
  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      setPixelsPerSecond((prev) => Math.max(10, Math.min(320, Math.round(prev * zoomFactor))));
    }
  };

  // Marquee selection start on empty canvas area
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-clip-id]')) return;

    const tracksEl = tracksScrollRef.current;
    if (!tracksEl) return;

    const rect = tracksEl.getBoundingClientRect();
    const scrollLeft = tracksEl.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const clickY = e.clientY - rect.top;
    const time = Math.max(0, Math.min(totalDuration, clickX / pixelsPerSecond));

    // If clicking directly on ruler top bar, move playhead and enter scrub
    if (target.closest('.sticky') || e.clientY < rect.top + 32) {
      const { snappedTime, snapPoint } = snapTime(time);
      setCurrentTime(snappedTime);
      setActiveSnapTime(snapPoint);
      setDragState({ mode: 'scrub', initialMouseX: e.clientX });
    } else {
      // Otherwise start multi-clip marquee rectangle drag
      if (!e.shiftKey) {
        setSelectedClipIds([]);
      }
      setMarquee({
        startX: clickX,
        startY: clickY,
        currentX: clickX,
        currentY: clickY,
        isSelecting: true,
      });
    }
  };

  // Start clip move or trim drag
  const handleClipDragStart = (
    e: React.MouseEvent,
    clip: TimelineClip,
    trackId: string,
    mode: 'move' | 'trim-start' | 'trim-end'
  ) => {
    e.stopPropagation();
    e.preventDefault();

    selectClip(clip.id, e.shiftKey);

    setDragState({
      mode,
      clipId: clip.id,
      trackId,
      initialMouseX: e.clientX,
      initialStartOnTimeline: clip.startOnTimeline,
      initialDuration: clip.duration,
      initialSourceOffset: clip.sourceStartOffset,
    });
  };

  // Window mouse move listener for continuous clip dragging, scrubbing, & marquee selection
  useEffect(() => {
    if (!dragState.mode && !marquee?.isSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (marquee?.isSelecting) {
        const tracksEl = tracksScrollRef.current;
        if (!tracksEl) return;
        const rect = tracksEl.getBoundingClientRect();
        const currentX = e.clientX - rect.left + tracksEl.scrollLeft;
        const currentY = e.clientY - rect.top;

        setMarquee((prev) => (prev ? { ...prev, currentX, currentY } : null));

        // Evaluate clip intersection with selection rectangle
        const minX = Math.min(marquee.startX, currentX);
        const maxX = Math.max(marquee.startX, currentX);
        const startTime = minX / pixelsPerSecond;
        const endTime = maxX / pixelsPerSecond;

        const selectedIds: string[] = [];
        project.tracks.forEach((track) => {
          track.clips.forEach((c) => {
            const cStart = c.startOnTimeline;
            const cEnd = c.startOnTimeline + c.duration;
            // Overlap check
            if (cStart < endTime && cEnd > startTime) {
              selectedIds.push(c.id);
            }
          });
        });

        setSelectedClipIds(selectedIds);
        return;
      }

      const deltaX = e.clientX - dragState.initialMouseX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (dragState.mode === 'scrub') {
        const tracksEl = tracksScrollRef.current;
        if (tracksEl) {
          const rect = tracksEl.getBoundingClientRect();
          const scrollLeft = tracksEl.scrollLeft;
          const clickX = e.clientX - rect.left + scrollLeft;
          const time = Math.max(0, Math.min(totalDuration, clickX / pixelsPerSecond));
          const { snappedTime, snapPoint } = snapTime(time);
          setCurrentTime(snappedTime);
          setActiveSnapTime(snapPoint);
        }
      } else if (dragState.mode === 'move' && dragState.clipId && dragState.trackId) {
        const targetTime = Math.max(0, (dragState.initialStartOnTimeline || 0) + deltaTime);
        const { snappedTime, snapPoint } = snapTime(targetTime);
        setActiveSnapTime(snapPoint);

        updateClip(dragState.trackId, dragState.clipId, {
          startOnTimeline: Number(snappedTime.toFixed(3)),
        });
      } else if (dragState.mode === 'trim-start' && dragState.clipId && dragState.trackId) {
        const initialStart = dragState.initialStartOnTimeline || 0;
        const initialDur = dragState.initialDuration || 0.5;
        const initialSrcOffset = dragState.initialSourceOffset || 0;

        const targetStart = Math.max(0, initialStart + deltaTime);
        const { snappedTime, snapPoint } = snapTime(targetStart);
        setActiveSnapTime(snapPoint);

        const delta = snappedTime - initialStart;
        const proposedDuration = Math.max(0.1, initialDur - delta);

        updateClip(dragState.trackId, dragState.clipId, {
          startOnTimeline: Number(snappedTime.toFixed(3)),
          duration: Number(proposedDuration.toFixed(3)),
          sourceStartOffset: Math.max(0, Number((initialSrcOffset + delta).toFixed(3))),
        });
      } else if (dragState.mode === 'trim-end' && dragState.clipId && dragState.trackId) {
        const initialStart = dragState.initialStartOnTimeline || 0;
        const initialDur = dragState.initialDuration || 0.5;

        const targetEnd = initialStart + initialDur + deltaTime;
        const { snappedTime, snapPoint } = snapTime(targetEnd);
        setActiveSnapTime(snapPoint);

        const proposedDuration = Math.max(0.1, snappedTime - initialStart);
        updateClip(dragState.trackId, dragState.clipId, {
          duration: Number(proposedDuration.toFixed(3)),
        });
      }
    };

    const handleMouseUp = () => {
      setDragState({ mode: null, initialMouseX: 0 });
      setActiveSnapTime(null);
      setMarquee(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState,
    marquee,
    pixelsPerSecond,
    totalDuration,
    snapTime,
    project.tracks,
    setCurrentTime,
    updateClip,
    setSelectedClipIds,
  ]);

  // Split active selection at playhead
  const handleSplitClick = () => {
    if (selectedClipIds.length > 0) {
      splitClip(selectedClipIds[0], currentTime);
    } else {
      const videoTrack = project.tracks.find((t) => t.type === 'video');
      const targetClip = videoTrack?.clips.find(
        (c) => currentTime > c.startOnTimeline && currentTime < c.startOnTimeline + c.duration
      );
      if (targetClip) {
        splitClip(targetClip.id, currentTime);
      }
    }
  };

  // Delete active selection
  const handleDeleteClick = () => {
    if (selectedClipIds.length > 0) {
      selectedClipIds.forEach((id) => deleteClip(id));
      setSelectedClipIds([]);
    }
  };

  // Fit to screen zoom calculation
  const handleFitToScreen = () => {
    const tracksEl = tracksScrollRef.current;
    if (!tracksEl) return;
    const availableWidth = tracksEl.clientWidth - 40;
    const calculatedPps = Math.max(20, Math.min(250, availableWidth / totalDuration));
    setPixelsPerSecond(Math.round(calculatedPps));
  };

  const timelineWidthPx = Math.max(totalDuration * pixelsPerSecond + 150, 800);

  // Time ruler ticks generation (1-second intervals with sub-ticks)
  const rulerTicks = useMemo(() => {
    const count = Math.ceil(totalDuration) + 2;
    const ticks = [];
    for (let s = 0; s <= count; s++) {
      ticks.push(s);
    }
    return ticks;
  }, [totalDuration]);

  return (
    <div
      ref={timelineContainerRef}
      className={`w-full flex flex-col bg-[#070b14] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl ${className}`}
    >
      {/* Timeline Controls & Tools Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-[#0b101d] border-b border-slate-800/80">
        {/* Left: Playback & Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <div className="h-5 w-[1px] bg-slate-800 mx-1.5" />

          <button
            type="button"
            onClick={handleSplitClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700/80 transition-all shadow-sm cursor-pointer active:scale-95"
            title="Split Clip at Playhead (S)"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>Split</span>
            <kbd className="text-[9px] bg-slate-950 px-1.5 py-0.5 rounded text-slate-400 font-mono border border-slate-800">S</kbd>
          </button>

          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={selectedClipIds.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 disabled:opacity-40 rounded-xl text-xs font-semibold border border-slate-700/80 hover:border-rose-500/40 transition-all cursor-pointer disabled:cursor-not-allowed active:scale-95"
            title="Delete Selected Clip (Delete / Backspace)"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Delete</span>
            <kbd className="text-[9px] bg-slate-950 px-1.5 py-0.5 rounded text-slate-400 font-mono border border-slate-800">⌫</kbd>
          </button>

          <div className="h-5 w-[1px] bg-slate-800 mx-1.5" />

          <button
            type="button"
            onClick={undo}
            disabled={history.past.length === 0}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Undo (Cmd+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={history.future.length === 0}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Redo (Cmd+Shift+Z)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: High-Precision Timecode Display & Live Master Audio Peak VU Meter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#060912] px-3.5 py-1.5 rounded-xl border border-slate-800/80 shadow-inner">
            <span className="font-mono text-xs font-black text-indigo-400 tracking-wider">
              {currentTime.toFixed(2)}s
            </span>
            <span className="text-slate-600 font-mono text-xs">/</span>
            <span className="font-mono text-xs font-semibold text-slate-400">
              {totalDuration.toFixed(2)}s
            </span>
            <span className="text-[10px] text-slate-500 font-mono ml-1.5 px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800">
              {Math.floor(currentTime * 30)}f
            </span>
          </div>

          {/* Master Stereo Audio Peak VU Meter */}
          <div className="hidden lg:flex items-center gap-1.5 bg-[#060912] px-3 py-1.5 rounded-xl border border-slate-800/80">
            <Activity className={`w-3.5 h-3.5 ${isPlaying ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <div className="flex flex-col gap-0.5">
              {/* Left Channel VU Bar */}
              <div className="w-20 sm:w-24 h-1.5 bg-slate-900 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-all duration-75 rounded-full"
                  style={{ width: `${Math.min(100, liveAudioPeak * 100)}%` }}
                />
              </div>
              {/* Right Channel VU Bar */}
              <div className="w-20 sm:w-24 h-1.5 bg-slate-900 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-all duration-75 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, (liveAudioPeak - 0.08) * 100))}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-[10px] text-slate-400 w-8 text-right font-bold">
              {isPlaying ? `${(liveAudioPeak * 100).toFixed(0)}%` : 'MUTE'}
            </span>
          </div>
        </div>

        {/* Right: Snapping & Timeline Zoom Scale */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setSnappingEnabled(!snappingEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              snappingEnabled
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                : 'bg-slate-900/90 text-slate-500 border-slate-800'
            }`}
            title="Magnet Snapping (10px threshold)"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Snap</span>
          </button>

          {/* Keyframe Curve Graph Editor Toggle */}
          <button
            type="button"
            onClick={() => setShowGraphEditor(!showGraphEditor)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showGraphEditor
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-500/20'
                : 'bg-slate-900/90 text-slate-400 hover:text-white border-slate-800'
            }`}
            title="Toggle Keyframe Cubic-Bezier Graph Curve Editor"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Curves</span>
          </button>

          {/* Zoom Logarithmic Presets */}
          <div className="hidden xl:flex items-center gap-1 bg-[#060912] p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setPixelsPerSecond(280)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                pixelsPerSecond >= 220 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Frame (30f)
            </button>
            <button
              type="button"
              onClick={() => setPixelsPerSecond(140)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                pixelsPerSecond >= 120 && pixelsPerSecond < 220 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tight
            </button>
            <button
              type="button"
              onClick={() => setPixelsPerSecond(85)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                pixelsPerSecond >= 50 && pixelsPerSecond < 120 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setPixelsPerSecond(15)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                pixelsPerSecond < 50 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Macro (10m)
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-[#060912] px-2.5 py-1.5 rounded-xl border border-slate-800/80">
            <button
              type="button"
              onClick={() => setPixelsPerSecond((p) => Math.max(10, p - 20))}
              className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              title="Zoom Out (Ctrl + Wheel)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={10}
              max={300}
              value={pixelsPerSecond}
              onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
              className="w-16 sm:w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <button
              type="button"
              onClick={() => setPixelsPerSecond((p) => Math.min(300, p + 20))}
              className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              title="Zoom In (Ctrl + Wheel)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitToScreen}
              className="text-[10px] font-mono text-slate-400 hover:text-indigo-300 px-2 py-0.5 rounded-lg hover:bg-slate-800 ml-1 font-bold cursor-pointer"
            >
              Fit
            </button>
          </div>
        </div>
      </div>

      {/* Main Track Lanes & Playhead Scrubber */}
      <div className="relative flex w-full overflow-hidden min-h-[260px] bg-[#060912]">
        {/* Left Fixed Track Header Columns */}
        <div className="w-48 sm:w-56 flex-shrink-0 bg-[#0a0f1d] border-r border-slate-800 z-30 select-none flex flex-col">
          {/* Empty Space Aligned with Ruler */}
          <div className="h-8 border-b border-slate-800/80 px-3 flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> Tracks ({project.tracks.length})
            </span>
          </div>

          {/* Track Labels with Master Volume Faders */}
          <div className="flex flex-col">
            {project.tracks.map((track) => {
              let Icon = Film;
              let colorClass = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
              if (track.type === 'text') {
                Icon = Type;
                colorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
              } else if (track.type === 'sfx' || track.type === 'audio') {
                Icon = Volume2;
                colorClass = 'text-pink-400 bg-pink-500/10 border-pink-500/20';
              }

              const trackVol = trackVolumes[track.id] !== undefined ? trackVolumes[track.id] : (track.volume ?? 1.0);

              return (
                <div
                  key={track.id}
                  className="h-16 px-3 border-b border-slate-800/70 flex items-center justify-between bg-[#0a0f1d]/90 hover:bg-[#0f1629] transition-colors"
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                    <div className={`p-1.5 rounded-xl border flex-shrink-0 ${colorClass}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col truncate flex-1 min-w-0">
                      <span className="text-[11px] font-black text-slate-200 truncate">
                        {track.name}
                      </span>
                      
                      {/* Track Volume Fader Slider */}
                      {(track.type === 'video' || track.type === 'sfx' || track.type === 'audio') && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.05"
                            value={trackVol}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setTrackVolumes((prev) => ({ ...prev, [track.id]: val }));
                            }}
                            className="w-16 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-400"
                            title={`Track Gain: ${(trackVol * 100).toFixed(0)}%`}
                          />
                          <span className="font-mono text-[9px] text-slate-400 w-7">
                            {(trackVol * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-slate-500 flex-shrink-0">
                    <button
                      type="button"
                      className="p-1 hover:text-slate-300 transition-colors cursor-pointer"
                      title={track.isMuted ? 'Unmute track' : 'Mute track'}
                    >
                      {track.isMuted ? <EyeOff className="w-3 h-3 text-rose-400" /> : <Eye className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      className="p-1 hover:text-slate-300 transition-colors cursor-pointer"
                      title={track.isLocked ? 'Unlock track' : 'Lock track'}
                    >
                      {track.isLocked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Scrollable Timeline Canvas & Track Lanes */}
        <div
          ref={tracksScrollRef}
          onMouseDown={handleTimelineMouseDown}
          onWheel={handleWheelZoom}
          className="relative flex-1 overflow-x-auto overflow-y-hidden select-none cursor-pointer scrollbar-thin scrollbar-thumb-slate-800"
        >
          <div
            className="relative h-full"
            style={{ width: `${timelineWidthPx}px` }}
          >
            {/* Top Timecode Ruler */}
            <div className="sticky top-0 z-20 h-8 bg-slate-900/95 border-b border-slate-800 flex items-end">
              {rulerTicks.map((second) => {
                const left = second * pixelsPerSecond;
                const minutes = Math.floor(second / 60);
                const secs = second % 60;
                const timeString = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

                return (
                  <div
                    key={second}
                    className="absolute bottom-0 flex flex-col items-center pointer-events-none"
                    style={{ left: `${left}px` }}
                  >
                    <span className="text-[9px] font-mono text-slate-400 mb-1 -translate-x-1/2">
                      {timeString}
                    </span>
                    <div className="w-[1px] h-2.5 bg-slate-600" />
                    {/* Half-second sub tick */}
                    <div
                      className="absolute bottom-0 w-[1px] h-1.5 bg-slate-800"
                      style={{ left: `${pixelsPerSecond / 2}px` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Track Lanes */}
            <div className="flex flex-col relative">
              {project.tracks.map((track) => {
                return (
                  <div
                    key={track.id}
                    className="h-16 border-b border-slate-800/60 relative bg-slate-950/40"
                  >
                    {/* Background Grid Lines every 1 second */}
                    {rulerTicks.map((sec) => (
                      <div
                        key={sec}
                        className="absolute inset-y-0 w-[1px] bg-slate-800/25 pointer-events-none"
                        style={{ left: `${sec * pixelsPerSecond}px` }}
                      />
                    ))}

                    {/* Clips inside this Track */}
                    {track.clips.map((clip) => {
                      const isSelected = selectedClipIds.includes(clip.id);
                      const leftPx = clip.startOnTimeline * pixelsPerSecond;
                      const widthPx = Math.max(12, clip.duration * pixelsPerSecond);

                      // Style variations depending on track type
                      let bgClasses = 'bg-indigo-600/25 border-indigo-400/50 text-indigo-100 hover:bg-indigo-600/35 shadow-sm';
                      if (clip.type === 'text') {
                        bgClasses = 'bg-amber-500/20 border-amber-400/50 text-amber-100 hover:bg-amber-500/30 shadow-sm';
                      } else if (clip.type === 'sfx') {
                        bgClasses = 'bg-pink-600/25 border-pink-400/50 text-pink-100 hover:bg-pink-600/35 shadow-sm';
                      }

                      if (isSelected) {
                        bgClasses += ' ring-2 ring-white border-white z-10 shadow-lg scale-[1.01]';
                      }

                      return (
                        <div
                          key={clip.id}
                          data-clip-id={clip.id}
                          onMouseDown={(e) => handleClipDragStart(e, clip, track.id, 'move')}
                          className={`absolute top-2 h-12 rounded-xl border flex items-center px-2.5 cursor-grab active:cursor-grabbing transition-shadow select-none group ${bgClasses}`}
                          style={{
                            left: `${leftPx}px`,
                            width: `${widthPx}px`,
                          }}
                        >
                          {/* Audio Waveform Background Preview */}
                          {(clip.type === 'video' || clip.type === 'sfx' || clip.type === 'audio') && (
                            <ClipWaveformPreview clip={clip} widthPx={widthPx} />
                          )}

                          {/* Left Trim Handle */}
                          <div
                            onMouseDown={(e) => handleClipDragStart(e, clip, track.id, 'trim-start')}
                            className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-white/70 rounded-l-xl cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                            title="Trim Start"
                          >
                            <div className="w-[1.5px] h-4 bg-white/80 rounded" />
                          </div>

                          {/* Volume Fade-In Handle Envelope Indicator */}
                          {(clip.type === 'video' || clip.type === 'sfx' || clip.type === 'audio') && (
                            <div
                              className="absolute left-1 top-1 w-2 h-2 rounded-full bg-indigo-400 hover:bg-indigo-200 border border-white cursor-pointer z-20 shadow-sm"
                              title={`Fade-In: ${((clip as VideoClip | SFXClip).audioModifiers?.fadeInSec || 0.2).toFixed(1)}s`}
                            />
                          )}

                          {/* Clip Content Label & Keyframe Badges */}
                          <div className="flex items-center gap-1.5 overflow-hidden w-full pointer-events-none z-10">
                            {clip.type === 'video' && (
                              <Film className="w-3 h-3 text-indigo-300 flex-shrink-0" />
                            )}
                            {clip.type === 'text' && (
                              <Type className="w-3 h-3 text-yellow-300 flex-shrink-0" />
                            )}
                            {(clip.type === 'sfx' || clip.type === 'audio') && (
                              <Volume2 className="w-3 h-3 text-pink-300 flex-shrink-0" />
                            )}

                            <span className="text-xs font-bold truncate">
                              {clip.type === 'text'
                                ? (clip as TextClip).content || 'Caption'
                                : clip.name}
                            </span>

                            {/* Volume Level Badge */}
                            {(clip.type === 'video' || clip.type === 'sfx' || clip.type === 'audio') && (
                              <span className="text-[9px] font-mono text-slate-300 bg-slate-900/80 px-1 py-0.5 rounded border border-slate-700/60 ml-auto flex-shrink-0">
                                {(((clip as VideoClip | SFXClip).audioModifiers?.volume ?? 1.0) * 100).toFixed(0)}%
                              </span>
                            )}

                            {/* Punch zoom badge */}
                            {clip.type === 'video' &&
                              (clip as VideoClip).keyframes &&
                              (clip as VideoClip).keyframes.length > 0 && (
                                <div className="flex items-center gap-0.5 px-1 bg-pink-500/30 border border-pink-500/40 rounded text-[9px] font-mono text-pink-200">
                                  <Sparkles className="w-2.5 h-2.5 text-pink-300" />
                                  {(clip as VideoClip).keyframes.filter((k) => k.scale > 1.1).length}
                                </div>
                              )}
                          </div>

                          {/* Volume Fade-Out Handle Envelope Indicator */}
                          {(clip.type === 'video' || clip.type === 'sfx' || clip.type === 'audio') && (
                            <div
                              className="absolute right-1 top-1 w-2 h-2 rounded-full bg-indigo-400 hover:bg-indigo-200 border border-white cursor-pointer z-20 shadow-sm"
                              title={`Fade-Out: ${((clip as VideoClip | SFXClip).audioModifiers?.fadeOutSec || 0.2).toFixed(1)}s`}
                            />
                          )}

                          {/* Right Trim Handle */}
                          <div
                            onMouseDown={(e) => handleClipDragStart(e, clip, track.id, 'trim-end')}
                            className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-white/70 rounded-r-xl cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            title="Trim End"
                          >
                            <div className="w-[1.5px] h-4 bg-white/80 rounded" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Interactive Playhead Needle */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center"
              style={{
                left: `${currentTime * pixelsPerSecond}px`,
                transform: 'translateX(-50%)',
              }}
            >
              {/* Playhead Top Scrub Marker Handle */}
              <div className="w-4 h-5 bg-rose-500 clip-playhead shadow-md flex items-center justify-center -translate-y-0.5 pointer-events-auto cursor-ew-resize">
                <div className="w-1 h-2 bg-white rounded-full" />
              </div>
              {/* Vertical Playhead Needle Line */}
              <div className="w-[2px] flex-1 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            </div>

            {/* Magnetic Snap Vertical Guide Line */}
            {activeSnapTime !== null && (
              <div
                className="absolute top-0 bottom-0 z-40 pointer-events-none w-[2px] bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,1)] animate-pulse"
                style={{
                  left: `${activeSnapTime * pixelsPerSecond}px`,
                  transform: 'translateX(-50%)',
                }}
              />
            )}

            {/* Marquee Selection Box Overlay */}
            {marquee && marquee.isSelecting && (
              <div
                className="absolute z-40 bg-indigo-500/20 border border-indigo-400 rounded pointer-events-none shadow-sm"
                style={{
                  left: `${Math.min(marquee.startX, marquee.currentX)}px`,
                  top: `${Math.min(marquee.startY, marquee.currentY)}px`,
                  width: `${Math.abs(marquee.currentX - marquee.startX)}px`,
                  height: `${Math.abs(marquee.currentY - marquee.startY)}px`,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Keyframe Cubic-Bezier Curve Graph Editor Drawer */}
      <KeyframeGraphEditor
        isOpen={showGraphEditor}
        onClose={() => setShowGraphEditor(false)}
      />
    </div>
  );
}

export default Timeline;
