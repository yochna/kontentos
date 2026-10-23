import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import type { CanvasElementId } from '../../../../types/canvasScene';

export interface SelectionBoxProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  accentColor?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ELEMENT_LABELS: Record<string, string> = {
  headline: 'Headline',
  body: 'Quote / Body',
  profile: 'Author Profile',
  badge: 'Accent Badge',
  'media-box': 'Media Box',
  watermark: 'Watermark',
};

function getElementLabel(id: CanvasElementId): string {
  return ELEMENT_LABELS[id] || (id.charAt(0).toUpperCase() + id.slice(1));
}

/**
 * SelectionBoundingBox renders a pixel-accurate interactive outline around
 * the currently active selected canvas element with a floating type tag pill.
 */
export const SelectionBox: React.FC<SelectionBoxProps> = ({
  containerRef,
  accentColor = '#38bdf8',
  disabled = false,
  children,
}) => {
  const selectedElementId = useCanvasInteraction((s) => s.selectedElementId);
  const isDragging = useCanvasInteraction((s) => s.isDragging);
  const isResizing = useCanvasInteraction((s) => s.isResizing);
  const editingElementId = useCanvasInteraction((s) => s.editingElementId);

  const [rect, setRect] = useState<BoxRect | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const updateRect = useCallback(() => {
    if (!selectedElementId || disabled || !containerRef.current) {
      setRect(null);
      return;
    }

    const container = containerRef.current;
    const element = container.querySelector(
      `[data-canvas-element-id="${selectedElementId}"]`
    ) as HTMLElement | null;

    if (!element) {
      setRect(null);
      return;
    }

    const elemRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const newRect: BoxRect = {
      x: elemRect.left - containerRect.left,
      y: elemRect.top - containerRect.top,
      width: elemRect.width,
      height: elemRect.height,
    };

    setRect((prev) => {
      if (
        prev &&
        Math.abs(prev.x - newRect.x) < 0.5 &&
        Math.abs(prev.y - newRect.y) < 0.5 &&
        Math.abs(prev.width - newRect.width) < 0.5 &&
        Math.abs(prev.height - newRect.height) < 0.5
      ) {
        return prev;
      }
      return newRect;
    });
  }, [selectedElementId, disabled, containerRef]);

  // Update on selection, drag, resize, or editing change
  useEffect(() => {
    updateRect();
  }, [updateRect, selectedElementId, isDragging, isResizing, editingElementId]);

  // Continuous tracking during drag/resize animations
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const track = () => {
      updateRect();
      animFrameRef.current = requestAnimationFrame(track);
    };

    animFrameRef.current = requestAnimationFrame(track);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isDragging, isResizing, updateRect]);

  // Observe container & window resize
  useEffect(() => {
    const handleResize = () => updateRect();
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => updateRect());
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [containerRef, updateRect]);

  if (!selectedElementId || disabled || !rect) {
    return null;
  }

  // Determine label position (flip inside if top is tight)
  const isTopTight = rect.y < 28;
  const isLeftTight = rect.x < 10;

  return (
    <div
      className="absolute pointer-events-none z-40 transition-[top,left,width,height] duration-75"
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    >
      {/* 1.5px Selection Bounding Box Outline */}
      <div
        className="w-full h-full relative"
        style={{
          border: `1.5px solid ${accentColor}`,
          boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.4), 0 0 16px ${accentColor}25`,
        }}
      >
        {/* Element Type Pill Tag */}
        <div
          className={`absolute flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase select-none shadow-md backdrop-blur-md pointer-events-none transition-all ${
            isTopTight ? 'top-1.5' : '-top-6'
          } ${isLeftTight ? 'left-1.5' : 'left-0'}`}
          style={{
            backgroundColor: accentColor,
            color: '#020617', // slate-950 for sharp readability
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-950 opacity-80" />
          <span>{getElementLabel(selectedElementId)}</span>
        </div>

        {/* Slot for 8-Point Transform Handles (Task 2.2) */}
        {children}
      </div>
    </div>
  );
};

export default SelectionBox;
