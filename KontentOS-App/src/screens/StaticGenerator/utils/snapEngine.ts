import type { CanvasBoxRect, GuideLine } from '../../../types/canvasScene';

export const SNAP_THRESHOLD = 6;
export const SAFE_MARGIN_RATIO = 0.08;

export interface SnapInput {
  box: CanvasBoxRect;
  canvasWidth: number;
  canvasHeight: number;
  siblings?: CanvasBoxRect[];
  threshold?: number;
  enabled?: boolean;
}

export interface SnapResult {
  left: number;
  top: number;
  guides: GuideLine[];
}

type Candidate = {
  position: number;
  guide: GuideLine;
  distance: number;
};

function nearest(candidates: Candidate[], fallback: number) {
  if (candidates.length === 0) return { position: fallback, guide: null as GuideLine | null };
  candidates.sort((a, b) => a.distance - b.distance);
  return { position: candidates[0].position, guide: candidates[0].guide };
}

/**
 * Magnetic snapping against canvas center lines, safe margins, and sibling
 * element edges/centers. Coordinates are canvas-relative pixels.
 */
export function snapElement({
  box,
  canvasWidth,
  canvasHeight,
  siblings = [],
  threshold = SNAP_THRESHOLD,
  enabled = true,
}: SnapInput): SnapResult {
  if (!enabled) {
    return { left: box.left, top: box.top, guides: [] };
  }

  const marginX = canvasWidth * SAFE_MARGIN_RATIO;
  const marginY = canvasHeight * SAFE_MARGIN_RATIO;

  const verticalTargets: Array<{ position: number; kind: GuideLine['kind']; label?: string }> = [
    { position: canvasWidth / 2, kind: 'center', label: 'CENTER' },
    { position: marginX, kind: 'safe' },
    { position: canvasWidth - marginX, kind: 'safe' },
  ];
  const horizontalTargets: Array<{ position: number; kind: GuideLine['kind']; label?: string }> = [
    { position: canvasHeight / 2, kind: 'center', label: 'CENTER' },
    { position: marginY, kind: 'safe' },
    { position: canvasHeight - marginY, kind: 'safe' },
  ];

  for (const sibling of siblings) {
    verticalTargets.push(
      { position: sibling.left, kind: 'sibling' },
      { position: sibling.left + sibling.width / 2, kind: 'sibling' },
      { position: sibling.left + sibling.width, kind: 'sibling' }
    );
    horizontalTargets.push(
      { position: sibling.top, kind: 'sibling' },
      { position: sibling.top + sibling.height / 2, kind: 'sibling' },
      { position: sibling.top + sibling.height, kind: 'sibling' }
    );
  }

  const xEdges = [
    { offset: 0, value: box.left },
    { offset: box.width / 2, value: box.left + box.width / 2 },
    { offset: box.width, value: box.left + box.width },
  ];
  const yEdges = [
    { offset: 0, value: box.top },
    { offset: box.height / 2, value: box.top + box.height / 2 },
    { offset: box.height, value: box.top + box.height },
  ];

  let bestX: Candidate[] = [];
  for (const target of verticalTargets) {
    for (const edge of xEdges) {
      const distance = Math.abs(edge.value - target.position);
      if (distance <= threshold) {
        bestX.push({
          position: target.position - edge.offset,
          distance,
          guide: {
            orientation: 'vertical',
            position: target.position,
            label: target.label,
            kind: target.kind,
          },
        });
      }
    }
  }

  let bestY: Candidate[] = [];
  for (const target of horizontalTargets) {
    for (const edge of yEdges) {
      const distance = Math.abs(edge.value - target.position);
      if (distance <= threshold) {
        bestY.push({
          position: target.position - edge.offset,
          distance,
          guide: {
            orientation: 'horizontal',
            position: target.position,
            label: target.label,
            kind: target.kind,
          },
        });
      }
    }
  }

  const snapX = nearest(bestX, box.left);
  const snapY = nearest(bestY, box.top);
  const guides: GuideLine[] = [];
  if (snapX.guide) guides.push(snapX.guide);
  if (snapY.guide) guides.push(snapY.guide);

  return { left: snapX.position, top: snapY.position, guides };
}

export function getSiblingBoxes(currentId: string): CanvasBoxRect[] {
  const canvas = document.getElementById('kontentos-static-card-canvas');
  if (!canvas) return [];
  const canvasRect = canvas.getBoundingClientRect();
  const nodes = Array.from(
    canvas.querySelectorAll<HTMLElement>('[data-canvas-element-id]')
  );
  return nodes
    .filter((node) => node.dataset.canvasElementId !== currentId)
    .filter((node) => {
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && node.getBoundingClientRect().width > 0;
    })
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left - canvasRect.left,
        top: rect.top - canvasRect.top,
        width: rect.width,
        height: rect.height,
      };
    });
}
