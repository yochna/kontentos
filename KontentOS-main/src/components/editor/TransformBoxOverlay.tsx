/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { RotateCw, Move, Check } from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import { TimelineClip, VideoClip, TransformKeyframe } from '../../types/timeline';

interface TransformBoxOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasDimensions: { width: number; height: number };
}

export function TransformBoxOverlay({
  canvasRef,
  canvasDimensions,
}: TransformBoxOverlayProps): React.ReactElement | null {
  const {
    project,
    currentTime,
    selectedClipIds,
    updateClip,
  } = useTimelineStore();

  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    initialScale: number;
    initialPos: { x: number; y: number };
    initialRotation: number;
    initialAngle: number;
  } | null>(null);

  // Find active selected clip or active clip under playhead
  const selectedClip = useMemo(() => {
    if (selectedClipIds.length === 0) return null;
    const clipId = selectedClipIds[0];
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { clip, trackId: track.id };
    }
    return null;
  }, [project.tracks, selectedClipIds]);

  if (!selectedClip || (selectedClip.clip.type !== 'video' && selectedClip.clip.type !== 'text')) {
    return null;
  }

  const { clip, trackId } = selectedClip;
  const timeInClip = currentTime - clip.startOnTimeline;

  // Extract or calculate current transform values at currentTime
  const videoClip = clip as VideoClip;
  const keyframes = videoClip.keyframes || [];

  // Get active keyframe or fallback baseline transform
  let activeTransform = { scale: 1.0, position: { x: 0, y: 0 }, rotation: 0 };
  if (keyframes.length > 0) {
    const sorted = [...keyframes].sort((a, b) => a.timeOffset - b.timeOffset);
    let prev = sorted[0];
    let next = sorted[0];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].timeOffset <= timeInClip) prev = sorted[i];
      if (sorted[i].timeOffset >= timeInClip) {
        next = sorted[i];
        break;
      }
    }
    activeTransform = {
      scale: prev.scale ?? 1.0,
      position: { x: prev.position?.x ?? 0, y: prev.position?.y ?? 0 },
      rotation: prev.rotation ?? 0,
    };
  }

  // Calculate canvas display scale & bounding box overlay relative to the real canvas element
  const canvasEl = canvasRef.current;
  if (!canvasEl) return null;

  const rect = canvasEl.getBoundingClientRect();
  const displayWidth = rect.width;
  const displayHeight = rect.height;

  // Base bounding box dimensions (e.g., 60% of canvas)
  const baseBoxWidth = displayWidth * 0.7 * activeTransform.scale;
  const baseBoxHeight = displayHeight * 0.7 * activeTransform.scale;

  // Position offset
  const centerX = displayWidth / 2 + activeTransform.position.x * (displayWidth * 0.35);
  const centerY = displayHeight / 2 + activeTransform.position.y * (displayHeight * 0.35);

  const left = centerX - baseBoxWidth / 2;
  const top = centerY - baseBoxHeight / 2;

  // Helper to commit or update keyframe transform in store
  const commitTransform = (newTransform: { scale: number; position: { x: number; y: number }; rotation: number }) => {
    if (clip.type === 'video') {
      const existingKf = videoClip.keyframes || [];
      const roundedTime = Number(Math.max(0, timeInClip).toFixed(3));

      let updatedKfs = [...existingKf];
      const matchIdx = updatedKfs.findIndex((k) => Math.abs(k.timeOffset - roundedTime) < 0.05);

      const newKf: TransformKeyframe = {
        timeOffset: roundedTime,
        scale: Number(newTransform.scale.toFixed(3)),
        position: {
          x: Number(newTransform.position.x.toFixed(3)),
          y: Number(newTransform.position.y.toFixed(3)),
        },
        rotation: Number(newTransform.rotation.toFixed(1)),
        easing: 'easeInOut',
      };

      if (matchIdx >= 0) {
        updatedKfs[matchIdx] = newKf;
      } else {
        updatedKfs.push(newKf);
        updatedKfs.sort((a, b) => a.timeOffset - b.timeOffset);
      }

      updateClip(trackId, clip.id, { keyframes: updatedKfs } as Partial<VideoClip>);
    }
  };

  // Start dragging handles
  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    setActiveHandle(handle);

    const initialAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialScale: activeTransform.scale,
      initialPos: { ...activeTransform.position },
      initialRotation: activeTransform.rotation,
      initialAngle,
    });
  };

  // Global mousemove for handle drags
  useEffect(() => {
    if (!activeHandle || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.mouseX;
      const deltaY = e.clientY - dragStart.mouseY;

      if (activeHandle === 'move') {
        // Position translation
        const normX = deltaX / (displayWidth * 0.35);
        const normY = deltaY / (displayHeight * 0.35);

        const newPos = {
          x: Math.max(-1.5, Math.min(1.5, dragStart.initialPos.x + normX)),
          y: Math.max(-1.5, Math.min(1.5, dragStart.initialPos.y + normY)),
        };

        commitTransform({
          scale: dragStart.initialScale,
          position: newPos,
          rotation: dragStart.initialRotation,
        });
      } else if (activeHandle === 'rotate') {
        // Angle rotation around center
        const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        const angleDelta = currentAngle - dragStart.initialAngle;
        let newRotation = (dragStart.initialRotation + angleDelta) % 360;
        if (newRotation < 0) newRotation += 360;

        commitTransform({
          scale: dragStart.initialScale,
          position: dragStart.initialPos,
          rotation: newRotation,
        });
      } else {
        // Corner/Edge scaling
        const dist = Math.hypot(deltaX, deltaY);
        const scaleFactor = (deltaX + deltaY) / (displayWidth * 0.5);
        const newScale = Math.max(0.1, Math.min(4.0, dragStart.initialScale + scaleFactor));

        commitTransform({
          scale: newScale,
          position: dragStart.initialPos,
          rotation: dragStart.initialRotation,
        });
      }
    };

    const handleMouseUp = () => {
      setActiveHandle(null);
      setDragStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeHandle, dragStart, displayWidth, displayHeight, centerX, centerY]);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
      style={{
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        left: `${canvasEl.offsetLeft}px`,
        top: `${canvasEl.offsetTop}px`,
      }}
    >
      {/* Bounding Box Rect */}
      <div
        className="absolute border-2 border-indigo-400 bg-indigo-500/10 pointer-events-auto shadow-2xl transition-shadow"
        style={{
          width: `${baseBoxWidth}px`,
          height: `${baseBoxHeight}px`,
          left: `${left}px`,
          top: `${top}px`,
          transform: `rotate(${activeTransform.rotation}deg)`,
          transformOrigin: 'center center',
        }}
      >
        {/* Center Drag Movement Vector Area */}
        <div
          onMouseDown={(e) => handleMouseDown(e, 'move')}
          className="absolute inset-0 cursor-move flex items-center justify-center group"
        >
          <div className="w-6 h-6 rounded-full bg-indigo-600/80 text-white flex items-center justify-center shadow-lg border border-white/80 group-hover:scale-110 transition-transform">
            <Move className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Top Rotation Stem & Handle */}
        <div
          className="absolute left-1/2 -top-8 -translate-x-1/2 flex flex-col items-center pointer-events-auto cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => handleMouseDown(e, 'rotate')}
          title="Rotate Element"
        >
          <div className="w-5 h-5 rounded-full bg-amber-400 border-2 border-slate-900 text-slate-950 flex items-center justify-center shadow-md hover:scale-125 transition-transform">
            <RotateCw className="w-3 h-3 stroke-[2.5]" />
          </div>
          <div className="w-[2px] h-3 bg-amber-400" />
        </div>

        {/* 4 Corner Scale Handles */}
        <div
          onMouseDown={(e) => handleMouseDown(e, 'nw')}
          className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize hover:scale-125 transition-transform shadow-md"
          title="Resize NW"
        />
        <div
          onMouseDown={(e) => handleMouseDown(e, 'ne')}
          className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize hover:scale-125 transition-transform shadow-md"
          title="Resize NE"
        />
        <div
          onMouseDown={(e) => handleMouseDown(e, 'sw')}
          className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize hover:scale-125 transition-transform shadow-md"
          title="Resize SW"
        />
        <div
          onMouseDown={(e) => handleMouseDown(e, 'se')}
          className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize hover:scale-125 transition-transform shadow-md"
          title="Resize SE"
        />

        {/* Info Badge overlay */}
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-slate-950/90 text-[10px] font-mono text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 whitespace-nowrap shadow-md pointer-events-none">
          Scale: {(activeTransform.scale * 100).toFixed(0)}% | Rot: {activeTransform.rotation.toFixed(0)}°
        </div>
      </div>
    </div>
  );
}
