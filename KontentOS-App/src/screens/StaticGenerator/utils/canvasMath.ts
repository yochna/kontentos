import type {
  CanvasBoxRect,
  ElementTransform,
  TransformHandleType,
} from '../../../types/canvasScene';

export const MIN_ELEMENT_WIDTH = 60;
export const MIN_ELEMENT_HEIGHT = 30;

export function getCanvasRelativeCoords(
  event: { clientX: number; clientY: number },
  canvasRect: DOMRect
) {
  const x = event.clientX - canvasRect.left;
  const y = event.clientY - canvasRect.top;
  return {
    x,
    y,
    pctX: canvasRect.width > 0 ? (x / canvasRect.width) * 100 : 0,
    pctY: canvasRect.height > 0 ? (y / canvasRect.height) * 100 : 0,
  };
}

export function getCanvasRelativeRect(element: HTMLElement, canvas: HTMLElement): CanvasBoxRect {
  const elemRect = element.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    left: elemRect.left - canvasRect.left,
    top: elemRect.top - canvasRect.top,
    width: elemRect.width,
    height: elemRect.height,
  };
}

export function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampCoordsToCanvas(
  x: number,
  y: number,
  elemWidth: number,
  elemHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding = 0
) {
  return {
    x: clampValue(x, padding - elemWidth * 0.5, canvasWidth - padding - elemWidth * 0.5),
    y: clampValue(y, padding - elemHeight * 0.5, canvasHeight - padding - elemHeight * 0.5),
    left: clampValue(x, padding - elemWidth * 0.5, canvasWidth - padding - elemWidth * 0.5),
    top: clampValue(y, padding - elemHeight * 0.5, canvasHeight - padding - elemHeight * 0.5),
  };
}

/**
 * Keeps an element transform inside the canvas while allowing a small
 * grace margin so text can intentionally bleed toward the card edge.
 */
export function clampElementTransform(
  transform: ElementTransform,
  canvasWidth: number,
  canvasHeight: number,
  elementWidth: number,
  elementHeight: number,
  padding = 8
): ElementTransform {
  const maxX = Math.max(padding, canvasWidth - elementWidth - padding);
  const maxY = Math.max(padding, canvasHeight - elementHeight - padding);
  return {
    ...transform,
    x: clampValue(transform.x, -elementWidth * 0.35, maxX + elementWidth * 0.35),
    y: clampValue(transform.y, -elementHeight * 0.35, maxY + elementHeight * 0.35),
  };
}

export interface ResizeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

function withMinimum(value: number, minimum: number) {
  return Math.max(minimum, value);
}

/**
 * Calculates absolute x/y/width/height for a resize gesture.
 * `initial` is the element's canvas-relative rect at pointer-down time.
 */
export function computeResizeDelta(
  handle: TransformHandleType,
  initial: CanvasBoxRect,
  deltaX: number,
  deltaY: number,
  keepAspect = false,
  minWidth = MIN_ELEMENT_WIDTH,
  minHeight = MIN_ELEMENT_HEIGHT
): ResizeResult {
  let { left, top, width, height } = initial;
  const ratio = initial.height > 0 ? initial.width / initial.height : 1;

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se';

  if (movesLeft) {
    const nextWidth = withMinimum(width - deltaX, minWidth);
    left += width - nextWidth;
    width = nextWidth;
  }
  if (movesRight) {
    width = withMinimum(width + deltaX, minWidth);
  }
  if (movesTop) {
    const nextHeight = withMinimum(height - deltaY, minHeight);
    top += height - nextHeight;
    height = nextHeight;
  }
  if (movesBottom) {
    height = withMinimum(height + deltaY, minHeight);
  }

  if (keepAspect && (movesLeft || movesRight) && (movesTop || movesBottom)) {
    const nextHeight = withMinimum(width / ratio, minHeight);
    if (movesTop) {
      top += height - nextHeight;
    }
    height = nextHeight;
  }

  return { x: left, y: top, width, height };
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    !!target.closest('[contenteditable="true"]')
  );
}

export function isUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    isTextEditingTarget(target) ||
    !!target.closest('[data-canvas-ui]') ||
    !!target.closest('[data-canvas-no-drag]')
  );
}

export function getCanvasElement(): HTMLElement | null {
  return document.getElementById('kontentos-static-card-canvas');
}

export function getCanvasBounds() {
  const canvas = getCanvasElement();
  if (!canvas) return { width: 1080, height: 1080, rect: null as DOMRect | null };
  const rect = canvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height, rect };
}

export function getElementCanvasRect(elementId: string): CanvasBoxRect | null {
  const canvas = getCanvasElement();
  if (!canvas) return null;
  const el = canvas.querySelector(
    `[data-canvas-element-id="${CSS.escape(elementId)}"]`
  ) as HTMLElement | null;
  if (!el) return null;
  return getCanvasRelativeRect(el, canvas);
}
