import React, { useRef } from 'react';
import type { TransformHandleType } from '../../../../types/canvasScene';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { computeResizeDelta } from '../../utils/canvasMath';

interface Props {
  rect: { x: number; y: number; width: number; height: number };
  accentColor?: string;
  disabled?: boolean;
}

interface ResizeSession {
  pointerId: number;
  handle: TransformHandleType;
  startX: number;
  startY: number;
  initialLeft: number;
  initialTop: number;
  initialWidth: number;
  initialHeight: number;
  initialX: number;
  initialY: number;
  centerX: number;
  centerY: number;
  initialRotation: number;
  keepAspect: boolean;
}

const HANDLES: Array<{
  handle: TransformHandleType;
  style: React.CSSProperties;
  cursor: string;
}> = [
  { handle: 'nw', style: { left: 0, top: 0, transform: 'translate(-50%, -50%)' }, cursor: 'cursor-nwse-resize' },
  { handle: 'n', style: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' }, cursor: 'cursor-ns-resize' },
  { handle: 'ne', style: { right: 0, top: 0, transform: 'translate(50%, -50%)' }, cursor: 'cursor-nesw-resize' },
  { handle: 'e', style: { right: 0, top: '50%', transform: 'translate(50%, -50%)' }, cursor: 'cursor-ew-resize' },
  { handle: 'se', style: { right: 0, bottom: 0, transform: 'translate(50%, 50%)' }, cursor: 'cursor-nwse-resize' },
  { handle: 's', style: { left: '50%', bottom: 0, transform: 'translate(-50%, 50%)' }, cursor: 'cursor-ns-resize' },
  { handle: 'sw', style: { left: 0, bottom: 0, transform: 'translate(-50%, 50%)' }, cursor: 'cursor-nesw-resize' },
  { handle: 'w', style: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' }, cursor: 'cursor-ew-resize' },
];

export const TransformHandles: React.FC<Props> = ({ rect, accentColor = '#38bdf8', disabled = false }) => {
  const selectedId = useCanvasInteraction((s) => s.selectedElementId);
  const activeHandle = useCanvasInteraction((s) => s.activeHandle);
  const setResizing = useCanvasInteraction((s) => s.setResizing);
  const updateElementTransform = useCanvasInteraction((s) => s.updateElementTransform);
  const recordSnapshot = useCanvasInteraction((s) => s.recordSnapshot);
  const sessionRef = useRef<ResizeSession | null>(null);

  if (!selectedId || disabled) return null;

  const begin = (handle: TransformHandleType, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = document.getElementById('kontentos-static-card-canvas');
    const element = canvas?.querySelector(
      `[data-canvas-element-id="${CSS.escape(selectedId)}"]`
    ) as HTMLElement | null;
    if (!canvas || !element) return;
    const canvasRect = canvas.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const state = useCanvasInteraction.getState();
    const scene = state.scenes[state.activeSlide] || {};
    const transform = scene[selectedId] || { id: selectedId, x: 0, y: 0, zIndex: 20 };
    const custom = (state.customElements[state.activeSlide] || []).find(
      (entry) => entry.id === selectedId
    );

    recordSnapshot();
    setResizing(true, handle);

    sessionRef.current = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      initialLeft: elementRect.left - canvasRect.left,
      initialTop: elementRect.top - canvasRect.top,
      initialWidth: elementRect.width,
      initialHeight: elementRect.height,
      initialX: transform.x,
      initialY: transform.y,
      centerX: elementRect.left - canvasRect.left + elementRect.width / 2,
      centerY: elementRect.top - canvasRect.top + elementRect.height / 2,
      initialRotation: transform.rotation || 0,
      keepAspect: custom?.kind === 'image',
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || !selectedId) return;
    event.preventDefault();

    if (session.handle === 'rot') {
      const canvas = document.getElementById('kontentos-static-card-canvas');
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - canvasRect.left;
      const pointerY = event.clientY - canvasRect.top;
      const angle =
        (Math.atan2(pointerY - session.centerY, pointerX - session.centerX) * 180) / Math.PI + 90;
      const normalized = Math.round(((angle + 180) % 360) - 180);
      updateElementTransform(selectedId, { rotation: normalized });
      return;
    }

    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    const result = computeResizeDelta(
      session.handle,
      {
        left: session.initialLeft,
        top: session.initialTop,
        width: session.initialWidth,
        height: session.initialHeight,
      },
      dx,
      dy,
      session.keepAspect || event.shiftKey
    );

    updateElementTransform(selectedId, {
      x: session.initialX + (result.x - session.initialLeft),
      y: session.initialY + (result.y - session.initialTop),
      width: Math.round(result.width),
      height: Math.round(result.height),
    });
  };

  const end = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session) return;
    if (event.currentTarget.hasPointerCapture?.(session.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(session.pointerId);
      } catch {
        // ignore
      }
    }
    sessionRef.current = null;
    setResizing(false, null);
  };

  const isLine = rect.height < 14;

  return (
    <div className="absolute inset-0 pointer-events-none" data-canvas-ui="true">
      {/* Rotation stem + handle */}
      {!isLine && (
        <>
          <div
            className="absolute left-1/2 -translate-x-1/2 w-px bg-sky-400/80"
            style={{ top: -22, height: 22 }}
          />
          <button
            type="button"
            onPointerDown={(e) => begin('rot', e)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={`absolute left-1/2 -translate-x-1/2 -top-[28px] w-3.5 h-3.5 rounded-full bg-white border-2 shadow-md pointer-events-auto cursor-grab ${
              activeHandle === 'rot' ? 'scale-125' : ''
            }`}
            style={{ borderColor: accentColor }}
            title="Rotate element"
          />
        </>
      )}

      {HANDLES.filter((entry) => !isLine || ['w', 'e'].includes(entry.handle)).map((entry) => (
        <button
          key={entry.handle}
          type="button"
          onPointerDown={(e) => begin(entry.handle, e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={`absolute w-2.5 h-2.5 rounded-[2px] bg-white border shadow-sm pointer-events-auto ${
            entry.cursor
          } ${activeHandle === entry.handle ? 'scale-150' : ''}`}
          style={{ ...entry.style, borderColor: accentColor }}
          title={`Resize ${entry.handle.toUpperCase()}`}
        />
      ))}
    </div>
  );
};

export default TransformHandles;
