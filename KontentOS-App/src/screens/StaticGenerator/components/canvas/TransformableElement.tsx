import React, { forwardRef } from 'react';
import type { CanvasElementId, ElementTransform } from '../../../../types/canvasScene';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';

export interface TransformableElementProps {
  id: CanvasElementId;
  transform?: ElementTransform;
  isSelected?: boolean;
  isLocked?: boolean;
  isHidden?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onSelect?: (id: CanvasElementId, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onMouseEnter?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Un-opinionated wrapper component for canvas elements (Headline, Subtext,
 * Author Profile, Badges, etc.).
 *
 * Listens to pointer interactions, supports coordinate/transform overrides,
 * and maintains seamless compatibility with existing semantic card layouts.
 */
export const TransformableElement = forwardRef<HTMLDivElement, TransformableElementProps>(
  (
    {
      id,
      transform,
      isSelected: explicitIsSelected,
      isLocked: explicitIsLocked,
      isHidden: explicitIsHidden,
      className = '',
      style,
      children,
      onSelect,
      onPointerDown,
      onMouseEnter,
      onMouseLeave,
    },
    ref
  ) => {
    const storeSelectedId = useCanvasInteraction((s) => s.selectedElementId);
    const storeHoveredId = useCanvasInteraction((s) => s.hoveredElementId);
    const selectElement = useCanvasInteraction((s) => s.selectElement);
    const setHovered = useCanvasInteraction((s) => s.setHovered);

    const isSelected = explicitIsSelected ?? storeSelectedId === id;
    const isHovered = storeHoveredId === id;
    const isLocked = explicitIsLocked ?? transform?.isLocked ?? false;
    const isHidden = explicitIsHidden ?? transform?.isHidden ?? false;

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      // Don't intercept clicks inside native input/textarea elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (!isLocked) {
        selectElement(id);
        onSelect?.(id, e);
      }
      onPointerDown?.(e);
    };

    const handleMouseEnter = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isLocked) {
        setHovered(id);
      }
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.PointerEvent<HTMLDivElement>) => {
      if (storeHoveredId === id) {
        setHovered(null);
      }
      onMouseLeave?.(e);
    };

    // Calculate position and transform overrides if provided
    const computedStyle: React.CSSProperties = {
      ...style,
      ...(transform?.zIndex !== undefined ? { zIndex: transform.zIndex } : {}),
      ...(transform?.rotation !== undefined ? { transform: `rotate(${transform.rotation}deg)` } : {}),
      ...(transform?.width !== undefined
        ? { width: typeof transform.width === 'number' ? `${transform.width}px` : transform.width }
        : {}),
      ...(transform?.height !== undefined
        ? { height: typeof transform.height === 'number' ? `${transform.height}px` : transform.height }
        : {}),
      ...(transform?.customStyle as React.CSSProperties),
    };

    if (transform && typeof transform.x === 'number' && typeof transform.y === 'number') {
      computedStyle.position = 'absolute';
      computedStyle.left = `${transform.x}%`;
      computedStyle.top = `${transform.y}%`;
    }

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
        className={`canvas-transformable-element relative select-none transition-[box-shadow,outline] ${
          isHovered && !isSelected && !isLocked ? 'ring-1 ring-sky-400/40 rounded-sm' : ''
        } ${className}`}
        style={computedStyle}
        onPointerDown={handlePointerDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
    );
  }
);

TransformableElement.displayName = 'TransformableElement';
export default TransformableElement;
