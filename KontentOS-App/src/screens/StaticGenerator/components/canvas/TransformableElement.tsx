import React, { forwardRef, useRef } from 'react';
import type { CanvasElementId, ElementTransform } from '../../../../types/canvasScene';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { isUiTarget } from '../../utils/canvasMath';
import { getSiblingBoxes, snapElement } from '../../utils/snapEngine';
import { InlineTextEditor, type InlineTextStylePatch } from './InlineTextEditor';
import { useCanvasExporting } from './CanvasExportContext';

export interface TransformableElementProps {
  id: CanvasElementId;
  transform?: ElementTransform;
  isCustom?: boolean;
  isSelected?: boolean;
  isLocked?: boolean;
  isHidden?: boolean;
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  textContent?: string;
  textStyle?: React.CSSProperties;
  textMultiline?: boolean;
  onTextChange?: (value: string) => void;
  onFormatTextStyle?: (patch: InlineTextStylePatch) => void;
  onSelect?: (id: CanvasElementId, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  elementLeft: number;
  elementTop: number;
  elementWidth: number;
  elementHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  started: boolean;
}

export const TransformableElement = forwardRef<HTMLDivElement, TransformableElementProps>(
  (
    {
      id,
      transform,
      isCustom = false,
      isSelected: explicitIsSelected,
      isLocked: explicitIsLocked,
      isHidden: explicitIsHidden,
      interactive = true,
      className = '',
      style,
      children,
      textContent,
      textStyle,
      textMultiline = true,
      onTextChange,
      onFormatTextStyle,
      onSelect,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onMouseEnter,
      onMouseLeave,
    },
    ref
  ) => {
    const storeSelectedId = useCanvasInteraction((s) => s.selectedElementId);
    const storeHoveredId = useCanvasInteraction((s) => s.hoveredElementId);
    const storeEditingId = useCanvasInteraction((s) => s.editingElementId);
    const storeIsDragging = useCanvasInteraction((s) => s.isDragging);
    const selectElement = useCanvasInteraction((s) => s.selectElement);
    const setHovered = useCanvasInteraction((s) => s.setHovered);
    const setDragging = useCanvasInteraction((s) => s.setDragging);
    const setEditingElement = useCanvasInteraction((s) => s.setEditingElement);
    const updateElementTransform = useCanvasInteraction((s) => s.updateElementTransform);
    const recordSnapshot = useCanvasInteraction((s) => s.recordSnapshot);
    const setActiveGuides = useCanvasInteraction((s) => s.setActiveGuides);

    const dragRef = useRef<DragSession | null>(null);
    const isExporting = useCanvasExporting();

    const isSelected = explicitIsSelected ?? storeSelectedId === id;
    const isHovered = !isExporting && storeHoveredId === id;
    const isLocked = explicitIsLocked ?? transform?.isLocked ?? false;
    const isHidden = explicitIsHidden ?? transform?.isHidden ?? false;
    const isEditing = !isExporting && storeEditingId === id && textContent !== undefined;

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || isExporting) return;
      if (isUiTarget(e.target)) return;
      if (isLocked) {
        onPointerDown?.(e);
        return;
      }

      selectElement(id);
      onSelect?.(id, e);
      onPointerDown?.(e);

      if (e.button !== 0 || storeEditingId === id) return;

      const canvas = document.getElementById('kontentos-static-card-canvas');
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const elementRect = e.currentTarget.getBoundingClientRect();
      const initialX = transform?.x ?? 0;
      const initialY = transform?.y ?? 0;

      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        initialX,
        initialY,
        elementLeft: elementRect.left - canvasRect.left,
        elementTop: elementRect.top - canvasRect.top,
        elementWidth: elementRect.width,
        elementHeight: elementRect.height,
        canvasWidth: canvasRect.width,
        canvasHeight: canvasRect.height,
        started: false,
      };

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture can fail on some synthetic events; drag still works.
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(e);
      const session = dragRef.current;
      if (!session || session.pointerId !== e.pointerId) return;

      const rawDx = e.clientX - session.startX;
      const rawDy = e.clientY - session.startY;
      if (!session.started && Math.hypot(rawDx, rawDy) < 3) return;

      if (!session.started) {
        session.started = true;
        recordSnapshot();
        setDragging(true);
      }

      e.preventDefault();

      const state = useCanvasInteraction.getState();
      const proposed = {
        left: session.elementLeft + rawDx,
        top: session.elementTop + rawDy,
        width: session.elementWidth,
        height: session.elementHeight,
      };
      const snap = snapElement({
        box: proposed,
        canvasWidth: session.canvasWidth,
        canvasHeight: session.canvasHeight,
        siblings: state.snapEnabled ? getSiblingBoxes(id) : [],
        enabled: state.snapEnabled,
      });

      let nextX = session.initialX + (snap.left - session.elementLeft);
      let nextY = session.initialY + (snap.top - session.elementTop);

      const maxX = session.canvasWidth - 32 - session.elementLeft + session.initialX;
      const minX = -session.elementWidth + 32 - session.elementLeft + session.initialX;
      const maxY = session.canvasHeight - 32 - session.elementTop + session.initialY;
      const minY = -session.elementHeight + 32 - session.elementTop + session.initialY;
      nextX = Math.max(minX, Math.min(maxX, nextX));
      nextY = Math.max(minY, Math.min(maxY, nextY));

      updateElementTransform(id, { x: nextX, y: nextY });
      setActiveGuides(snap.guides);
    };

    const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      onPointerUp?.(e);
      const session = dragRef.current;
      if (!session) return;
      if (e.currentTarget.hasPointerCapture?.(session.pointerId)) {
        try {
          e.currentTarget.releasePointerCapture(session.pointerId);
        } catch {
          // ignore
        }
      }
      dragRef.current = null;
      if (session.started) {
        setDragging(false);
        setActiveGuides([]);
      }
    };

    const handleMouseEnter = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isLocked) setHovered(id);
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.PointerEvent<HTMLDivElement>) => {
      if (storeHoveredId === id) setHovered(null);
      onMouseLeave?.(e);
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isExporting && interactive && !isLocked && textContent !== undefined) {
        e.stopPropagation();
        setEditingElement(id);
      }
      onDoubleClick?.(e);
    };

    const computedStyle: React.CSSProperties = {
      ...style,
      ...(transform?.customStyle as React.CSSProperties),
      ...(isCustom
        ? {
            position: 'absolute' as const,
            left: `${transform?.x ?? 0}px`,
            top: `${transform?.y ?? 0}px`,
            transform: transform?.rotation ? `rotate(${transform.rotation}deg)` : undefined,
          }
        : {
            transform:
              transform && (transform.x !== 0 || transform.y !== 0 || transform.rotation)
                ? `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${
                    transform.rotation || 0
                  }deg)`
                : undefined,
          }),
      ...(transform?.width !== undefined ? { width: `${transform.width}px` } : {}),
      ...(transform?.height !== undefined ? { height: `${transform.height}px` } : {}),
      zIndex: storeIsDragging && isSelected ? 60 : transform?.zIndex ?? (id === 'content-box' ? 10 : 20),
    };

    if (isHidden) {
      computedStyle.display = 'none';
    }

    return (
      <div
        ref={ref}
        data-canvas-element-id={id}
        data-selected={isSelected ? 'true' : 'false'}
        data-locked={isLocked ? 'true' : 'false'}
        data-hovered={isHovered ? 'true' : 'false'}
        data-custom={isCustom ? 'true' : 'false'}
        className={`canvas-transformable-element relative select-none ${
          isEditing ? 'canvas-editing' : ''
        } ${
          isHovered && !isSelected && !isLocked
            ? 'ring-1 ring-sky-400/45 rounded-[3px]'
            : ''
        } ${className}`}
        style={computedStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {isEditing && (
          <InlineTextEditor
            value={textContent || ''}
            style={textStyle}
            multiline={textMultiline}
            baseFontSize={parseFloat(String(textStyle?.fontSize || '24')) || 24}
            onChange={(value) => onTextChange?.(value)}
            onCommit={(value) => onTextChange?.(value)}
            onExit={() => setEditingElement(null)}
            onFormatStyle={onFormatTextStyle}
          />
        )}
      </div>
    );
  }
);

TransformableElement.displayName = 'TransformableElement';
export default TransformableElement;
