import type { SlideSceneState } from '../../../types/canvasScene';

export const BASE_LAYER_Z = 20;
export const LAYER_STEP = 2;

function sortedEntries(scene: SlideSceneState) {
  return Object.values(scene).sort((a, b) => a.zIndex - b.zIndex);
}

export function normalizeSceneLayers(scene: SlideSceneState): SlideSceneState {
  const entries = sortedEntries(scene);
  const next: SlideSceneState = {};
  entries.forEach((transform, index) => {
    next[transform.id] = {
      ...transform,
      zIndex: BASE_LAYER_Z + index * LAYER_STEP,
    };
  });
  return next;
}

export function bringToFront(id: string, scene: SlideSceneState): SlideSceneState {
  const normalized = normalizeSceneLayers(scene);
  const entry = normalized[id];
  if (!entry) return scene;
  const max = Math.max(...Object.values(normalized).map((t) => t.zIndex), BASE_LAYER_Z);
  return { ...normalized, [id]: { ...entry, zIndex: max + LAYER_STEP } };
}

export function sendToBack(id: string, scene: SlideSceneState): SlideSceneState {
  const normalized = normalizeSceneLayers(scene);
  const entry = normalized[id];
  if (!entry) return scene;
  const min = Math.min(...Object.values(normalized).map((t) => t.zIndex), BASE_LAYER_Z);
  return { ...normalized, [id]: { ...entry, zIndex: Math.max(BASE_LAYER_Z, min - LAYER_STEP) } };
}

export function bringForward(id: string, scene: SlideSceneState): SlideSceneState {
  const normalized = normalizeSceneLayers(scene);
  const entries = sortedEntries(normalized);
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1 || index === entries.length - 1) return normalized;
  const current = entries[index];
  const next = entries[index + 1];
  return {
    ...normalized,
    [current.id]: { ...current, zIndex: next.zIndex },
    [next.id]: { ...next, zIndex: current.zIndex },
  };
}

export function sendBackward(id: string, scene: SlideSceneState): SlideSceneState {
  const normalized = normalizeSceneLayers(scene);
  const entries = sortedEntries(normalized);
  const index = entries.findIndex((entry) => entry.id === id);
  if (index <= 0) return normalized;
  const current = entries[index];
  const previous = entries[index - 1];
  return {
    ...normalized,
    [current.id]: { ...current, zIndex: previous.zIndex },
    [previous.id]: { ...previous, zIndex: current.zIndex },
  };
}

export function ensureElement(
  id: string,
  scene: SlideSceneState,
  defaults?: Partial<SlideSceneState[string]>
): SlideSceneState {
  if (scene[id]) return scene;
  const max = Math.max(...Object.values(scene).map((t) => t.zIndex), BASE_LAYER_Z);
  return {
    ...scene,
    [id]: {
      id,
      x: 0,
      y: 0,
      zIndex: max + LAYER_STEP,
      ...defaults,
    },
  };
}
