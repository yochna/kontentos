/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Activity,
  Sliders,
  ChevronDown,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import { VideoClip, TransformKeyframe, KeyframeEasing } from '../../types/timeline';

export type KeyframeProperty = 'scale' | 'posX' | 'posY' | 'rotation' | 'opacity';

interface KeyframeGraphEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyframeGraphEditor({
  isOpen,
  onClose,
}: KeyframeGraphEditorProps): React.ReactElement | null {
  const {
    project,
    currentTime,
    selectedClipIds,
    updateClip,
  } = useTimelineStore();

  const [activeProperty, setActiveProperty] = useState<KeyframeProperty>('scale');
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | null>(0);
  const [activeTangent, setActiveTangent] = useState<'cp1' | 'cp2' | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Get active clip
  const targetClip = useMemo(() => {
    if (selectedClipIds.length === 0) {
      for (const track of project.tracks) {
        if (track.type === 'video' && track.clips.length > 0) {
          return { clip: track.clips[0] as VideoClip, trackId: track.id };
        }
      }
      return null;
    }
    const clipId = selectedClipIds[0];
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip && clip.type === 'video') return { clip: clip as VideoClip, trackId: track.id };
    }
    return null;
  }, [project.tracks, selectedClipIds]);

  if (!isOpen || !targetClip) return null;

  const { clip, trackId } = targetClip;
  const keyframes = clip.keyframes || [];
  const duration = clip.duration || 10;
  const timeInClip = Math.max(0, Math.min(duration, currentTime - clip.startOnTimeline));

  // Range config for properties
  const propertyRange = useMemo(() => {
    switch (activeProperty) {
      case 'scale':
        return { min: 0.1, max: 3.0, label: 'Scale Factor', unit: 'x' };
      case 'posX':
        return { min: -1.5, max: 1.5, label: 'Position X', unit: '' };
      case 'posY':
        return { min: -1.5, max: 1.5, label: 'Position Y', unit: '' };
      case 'rotation':
        return { min: 0, max: 360, label: 'Rotation', unit: '°' };
      case 'opacity':
        return { min: 0.0, max: 1.0, label: 'Opacity', unit: '%' };
    }
  }, [activeProperty]);

  // Extract property value from keyframe
  const getKeyValue = (kf: TransformKeyframe): number => {
    switch (activeProperty) {
      case 'scale':
        return kf.scale ?? 1.0;
      case 'posX':
        return kf.position?.x ?? 0;
      case 'posY':
        return kf.position?.y ?? 0;
      case 'rotation':
        return kf.rotation ?? 0;
      case 'opacity':
        return kf.opacity ?? 1.0;
    }
  };

  // Convert time (0..duration) and value (min..max) to SVG canvas coordinates (Width x Height = 600 x 180)
  const graphWidth = 640;
  const graphHeight = 160;
  const padding = 28;

  const timeToX = (t: number) => padding + (t / duration) * (graphWidth - padding * 2);
  const valueToY = (v: number) => {
    const norm = (v - propertyRange.min) / (propertyRange.max - propertyRange.min);
    return graphHeight - padding - norm * (graphHeight - padding * 2);
  };

  const xToTime = (x: number) => {
    const norm = Math.max(0, Math.min(1, (x - padding) / (graphWidth - padding * 2)));
    return norm * duration;
  };

  const yToValue = (y: number) => {
    const norm = 1 - (y - padding) / (graphHeight - padding * 2);
    const val = propertyRange.min + norm * (propertyRange.max - propertyRange.min);
    return Math.max(propertyRange.min, Math.min(propertyRange.max, val));
  };

  // Sorted keyframes for graph rendering
  const sortedKeyframes = [...keyframes].sort((a, b) => a.timeOffset - b.timeOffset);

  // Add Keyframe at Playhead position
  const handleAddKeyframe = () => {
    const roundedTime = Number(timeInClip.toFixed(3));
    const newKfs = [...keyframes];

    const matchIdx = newKfs.findIndex((k) => Math.abs(k.timeOffset - roundedTime) < 0.04);
    const freshKf: TransformKeyframe = {
      timeOffset: roundedTime,
      scale: 1.25,
      position: { x: 0, y: 0 },
      rotation: 0,
      opacity: 1.0,
      easing: 'easeInOut',
      controlPoints: [0.42, 0, 0.58, 1],
    };

    if (matchIdx >= 0) {
      newKfs[matchIdx] = { ...newKfs[matchIdx], timeOffset: roundedTime };
    } else {
      newKfs.push(freshKf);
      newKfs.sort((a, b) => a.timeOffset - b.timeOffset);
    }

    updateClip(trackId, clip.id, { keyframes: newKfs } as Partial<VideoClip>);
  };

  // Delete Selected Keyframe
  const handleDeleteKeyframe = () => {
    if (selectedKeyframeIndex === null || keyframes.length <= 1) return;
    const newKfs = keyframes.filter((_, idx) => idx !== selectedKeyframeIndex);
    updateClip(trackId, clip.id, { keyframes: newKfs } as Partial<VideoClip>);
    setSelectedKeyframeIndex(0);
  };

  // Update Easing Curve type for active keyframe
  const handleEasingChange = (easing: KeyframeEasing) => {
    if (selectedKeyframeIndex === null) return;
    const updated = [...keyframes];
    updated[selectedKeyframeIndex] = {
      ...updated[selectedKeyframeIndex],
      easing,
    };
    updateClip(trackId, clip.id, { keyframes: updated } as Partial<VideoClip>);
  };

  // Render SVG Path Curve between keyframes
  let pathD = '';
  if (sortedKeyframes.length > 0) {
    pathD = `M ${timeToX(sortedKeyframes[0].timeOffset)} ${valueToY(getKeyValue(sortedKeyframes[0]))}`;
    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      const p1 = sortedKeyframes[i];
      const p2 = sortedKeyframes[i + 1];

      const x1 = timeToX(p1.timeOffset);
      const y1 = valueToY(getKeyValue(p1));
      const x2 = timeToX(p2.timeOffset);
      const y2 = valueToY(getKeyValue(p2));

      // Cubic-bezier control points
      const cp1 = p2.controlPoints || [0.42, 0, 0.58, 1];
      const c1x = x1 + (x2 - x1) * cp1[0];
      const c1y = y1 + (y2 - y1) * (1 - cp1[1]);
      const c2x = x1 + (x2 - x1) * cp1[2];
      const c2y = y1 + (y2 - y1) * (1 - cp1[3]);

      pathD += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
    }
  }

  return (
    <div className="w-full bg-[#080d19] border-t-2 border-indigo-500/40 p-3.5 shadow-2xl z-40 text-xs">
      {/* Drawer Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold text-slate-200">
            <Activity className="w-4 h-4 text-indigo-400" />
            Keyframe Cubic-Bezier Curve Graph Editor
          </span>
          <span className="text-[10px] text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            Clip: {clip.name} ({duration.toFixed(1)}s)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddKeyframe}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-md cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Keyframe @ Playhead
          </button>

          <button
            type="button"
            onClick={handleDeleteKeyframe}
            disabled={selectedKeyframeIndex === null || keyframes.length <= 1}
            className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 disabled:opacity-40 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Graph Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Controls: Property Selector & Easing Dropdown */}
        <div className="space-y-3 bg-[#0d1424] p-3 rounded-xl border border-slate-800">
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
              Transform Channel
            </label>
            <div className="flex flex-col gap-1">
              {(['scale', 'posX', 'posY', 'rotation', 'opacity'] as const).map((prop) => (
                <button
                  key={prop}
                  type="button"
                  onClick={() => setActiveProperty(prop)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left flex items-center justify-between transition-colors cursor-pointer ${
                    activeProperty === prop
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span className="capitalize">{prop}</span>
                  {activeProperty === prop && <Sparkles className="w-3 h-3 text-amber-300" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Interpolation Easing
            </label>
            <select
              value={
                selectedKeyframeIndex !== null && keyframes[selectedKeyframeIndex]
                  ? keyframes[selectedKeyframeIndex].easing
                  : 'easeInOut'
              }
              onChange={(e) => handleEasingChange(e.target.value as KeyframeEasing)}
              className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-medium cursor-pointer"
            >
              <option value="linear">Linear (Constant Velocity)</option>
              <option value="easeIn">Ease In (Accelerate)</option>
              <option value="easeOut">Ease Out (Decelerate)</option>
              <option value="easeInOut">Ease In-Out (Smooth Curve)</option>
              <option value="instant">Instant (Step Jump)</option>
            </select>
          </div>
        </div>

        {/* Center/Right: Interactive SVG Graph Canvas */}
        <div className="lg:col-span-3 bg-[#050913] p-2 rounded-xl border border-slate-800 relative overflow-hidden flex flex-col items-center">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${graphWidth} ${graphHeight}`}
            className="w-full h-[180px] select-none"
          >
            {/* Grid Background Lines */}
            <line x1={padding} y1={padding} x2={padding} y2={graphHeight - padding} stroke="#1e293b" strokeWidth="1" />
            <line x1={padding} y1={graphHeight - padding} x2={graphWidth - padding} y2={graphHeight - padding} stroke="#1e293b" strokeWidth="1" />

            {/* Middle baseline */}
            <line
              x1={padding}
              y1={graphHeight / 2}
              x2={graphWidth - padding}
              y2={graphHeight / 2}
              stroke="#1e293b"
              strokeDasharray="4 4"
            />

            {/* Smooth Interpolation Cubic-Bezier Curve */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.5"
                className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
              />
            )}

            {/* Current Playhead Vertical Line */}
            <line
              x1={timeToX(timeInClip)}
              y1={padding}
              x2={timeToX(timeInClip)}
              y2={graphHeight - padding}
              stroke="#f43f5e"
              strokeWidth="2"
              strokeDasharray="3 3"
            />

            {/* Keyframe Point Nodes */}
            {sortedKeyframes.map((kf, idx) => {
              const cx = timeToX(kf.timeOffset);
              const cy = valueToY(getKeyValue(kf));
              const isSelected = selectedKeyframeIndex === idx;

              return (
                <g key={idx} className="cursor-pointer" onClick={() => setSelectedKeyframeIndex(idx)}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? "7" : "5"}
                    fill={isSelected ? "#f59e0b" : "#818cf8"}
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="hover:scale-125 transition-transform shadow-md"
                  />
                  <text
                    x={cx}
                    y={cy - 10}
                    fill="#cbd5e1"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {getKeyValue(kf).toFixed(2)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Graph Footer Legend */}
          <div className="w-full flex items-center justify-between px-3 pt-1 text-[10px] text-slate-400 font-mono">
            <span>0.0s (Start)</span>
            <span className="text-indigo-400 font-bold">
              Property: {propertyRange.label} [{propertyRange.min} to {propertyRange.max}]
            </span>
            <span>{duration.toFixed(1)}s (End)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
