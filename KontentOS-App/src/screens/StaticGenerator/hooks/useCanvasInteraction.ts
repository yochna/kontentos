import { create } from 'zustand';
import type {
  CanvasClipboardItem,
  CanvasCustomElement,
  CanvasElementId,
  CanvasSnapshot,
  CustomElementKind,
  ElementTransform,
  GuideLine,
  SlideSceneState,
  TransformHandleType,
} from '../../../types/canvasScene';
import {
  bringForward,
  bringToFront,
  normalizeSceneLayers,
  sendBackward,
  sendToBack,
} from '../utils/layerOrdering';
import { getCanvasBounds, getElementCanvasRect } from '../utils/canvasMath';

const MAX_HISTORY = 50;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function nextZ(scene: SlideSceneState) {
  const values = Object.values(scene).map((entry) => entry.zIndex);
  return Math.max(20, ...values) + 2;
}

function activeScene(scenes: Record<number, SlideSceneState>, slide: number): SlideSceneState {
  return scenes[slide] || {};
}

function activeCustoms(
  customs: Record<number, CanvasCustomElement[]>,
  slide: number
): CanvasCustomElement[] {
  return customs[slide] || [];
}

function snapshotOf(state: CanvasInteractionStore): CanvasSnapshot {
  return {
    scenes: clone(state.scenes),
    customElements: clone(state.customElements),
  };
}

function snapshotKey(snapshot: CanvasSnapshot) {
  return JSON.stringify(snapshot);
}

function defaultTransform(id: string, zIndex: number): ElementTransform {
  return { id, x: 0, y: 0, zIndex };
}

function ensureLayerTransform(scene: SlideSceneState, id: string): SlideSceneState {
  if (scene[id]) return scene;
  return { ...scene, [id]: defaultTransform(id, nextZ(scene)) };
}

function looksLikeHtml(text: string) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

function stripHtml(text: string) {
  if (!looksLikeHtml(text)) return text;
  const div = document.createElement('div');
  div.innerHTML = text;
  return div.textContent || '';
}

function readBuiltInVisual(id: string) {
  const canvas = document.getElementById('kontentos-static-card-canvas');
  if (!canvas) return null;
  const element = canvas.querySelector(
    `[data-canvas-element-id="${CSS.escape(id)}"]`
  ) as HTMLElement | null;
  if (!element) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  return {
    left: rect.left - canvasRect.left,
    top: rect.top - canvasRect.top,
    width: rect.width,
    height: rect.height,
    text: element.textContent || '',
    style: {
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      color: computed.color,
      textAlign: computed.textAlign,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing,
    },
  };
}

export interface CanvasInteractionState {
  scenes: Record<number, SlideSceneState>;
  customElements: Record<number, CanvasCustomElement[]>;
  activeSlide: number;

  selectedElementId: CanvasElementId | null;
  hoveredElementId: CanvasElementId | null;
  isDragging: boolean;
  isResizing: boolean;
  activeHandle: TransformHandleType | null;
  editingElementId: CanvasElementId | null;

  snapEnabled: boolean;
  activeGuides: GuideLine[];

  clipboard: CanvasClipboardItem | null;
  toast: string | null;

  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
  isRestoring: boolean;
  revision: number;
}

export interface CanvasInteractionActions {
  initializeCanvas: (
    scenes?: Record<number, SlideSceneState>,
    customElements?: Record<number, CanvasCustomElement[]>
  ) => void;
  setActiveSlide: (slide: number) => void;

  selectElement: (id: CanvasElementId | null) => void;
  clearSelection: () => void;
  setHovered: (id: CanvasElementId | null) => void;
  setDragging: (isDragging: boolean) => void;
  setResizing: (isResizing: boolean, handle?: TransformHandleType | null) => void;
  setEditingElement: (id: CanvasElementId | null) => void;
  setTransforming: (mode: {
    isDragging?: boolean;
    isResizing?: boolean;
    activeHandle?: TransformHandleType | null;
  }) => void;
  resetInteraction: () => void;

  updateElementTransform: (
    id: CanvasElementId,
    patch: Partial<ElementTransform>,
    record?: boolean
  ) => void;
  updateCustomElement: (
    id: string,
    patch: Partial<CanvasCustomElement>,
    record?: boolean
  ) => void;

  setSnapEnabled: (enabled: boolean) => void;
  toggleSnap: () => void;
  setActiveGuides: (guides: GuideLine[]) => void;

  recordSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  addTextBox: (
    centerX?: number,
    centerY?: number,
    options?: Partial<CanvasCustomElement> & { width?: number; height?: number }
  ) => string;
  addImageElement: (
    centerX: number | undefined,
    centerY: number | undefined,
    imageUrl: string,
    naturalWidth?: number,
    naturalHeight?: number
  ) => string;
  addShape: (
    shape: {
      shapeType: string;
      label?: string;
      defaultWidth?: number;
      defaultHeight?: number;
      fill?: string;
      text?: string;
      kind?: CustomElementKind;
    },
    centerX?: number,
    centerY?: number
  ) => string;

  duplicateElement: (targetSlideIndex?: number, elementId?: CanvasElementId) => void;
  copySelectedElement: () => void;
  copyAllElements: () => void;
  pasteClipboard: (targetSlideIndex?: number) => void;

  toggleLock: (id: CanvasElementId) => void;
  toggleHidden: (id: CanvasElementId) => void;
  deleteElement: (id: CanvasElementId) => void;
  resetElement: (id: CanvasElementId) => void;
  resetSlide: () => void;

  bringToFront: (id: CanvasElementId) => void;
  sendToBack: (id: CanvasElementId) => void;
  bringForward: (id: CanvasElementId) => void;
  sendBackward: (id: CanvasElementId) => void;
  centerSelected: (axis: 'x' | 'y' | 'both') => void;

  setToast: (message: string | null) => void;
}

export type CanvasInteractionStore = CanvasInteractionState & CanvasInteractionActions;

const initialState: CanvasInteractionState = {
  scenes: {},
  customElements: {},
  activeSlide: 1,
  selectedElementId: null,
  hoveredElementId: null,
  isDragging: false,
  isResizing: false,
  activeHandle: null,
  editingElementId: null,
  snapEnabled: true,
  activeGuides: [],
  clipboard: null,
  toast: null,
  past: [],
  future: [],
  isRestoring: false,
  revision: 0,
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Zustand store for the advanced canvas editor. Owns per-slide scene graphs,
 * custom overlay elements, selection, drag/resize state, snapping and history.
 */
/**
 * Stable empty scene. Selectors must NEVER return a fresh `{}` (e.g. `scene || {}`):
 * zustand v5 compares snapshots by reference, so a new object every call causes an
 * infinite re-render loop ("getSnapshot should be cached" / "Maximum update depth").
 */
export const EMPTY_SCENE: SlideSceneState = {};

export const useCanvasInteraction = create<CanvasInteractionStore>((set, get) => ({
  ...initialState,

  initializeCanvas: (scenes, customElements) =>
    set((state) => ({
      scenes: scenes ?? state.scenes,
      customElements: customElements ?? state.customElements,
      revision: state.revision + 1,
    })),

  setActiveSlide: (slide) =>
    set((state) =>
      state.activeSlide === slide
        ? state
        : {
            activeSlide: slide,
            selectedElementId: null,
            hoveredElementId: null,
            editingElementId: null,
            isDragging: false,
            isResizing: false,
            activeHandle: null,
            activeGuides: [],
          }
    ),

  selectElement: (id) =>
    set((state) => {
      if (id === null) {
        return {
          selectedElementId: null,
          editingElementId: null,
          isDragging: false,
          isResizing: false,
          activeHandle: null,
          activeGuides: [],
        };
      }
      return {
        selectedElementId: id,
        editingElementId: state.editingElementId === id ? state.editingElementId : null,
        isDragging: false,
        isResizing: false,
        activeHandle: null,
      };
    }),

  clearSelection: () =>
    set({
      selectedElementId: null,
      editingElementId: null,
      isDragging: false,
      isResizing: false,
      activeHandle: null,
      activeGuides: [],
    }),

  setHovered: (id) =>
    set((state) => (state.hoveredElementId === id ? state : { hoveredElementId: id })),

  setDragging: (isDragging) =>
    set((state) => {
      if (state.isDragging === isDragging) return state;
      return {
        isDragging,
        isResizing: isDragging ? false : state.isResizing,
        activeHandle: isDragging ? null : state.activeHandle,
      };
    }),

  setResizing: (isResizing, handle = null) =>
    set((state) => {
      if (state.isResizing === isResizing && state.activeHandle === handle) return state;
      return {
        isResizing,
        activeHandle: isResizing ? handle : null,
        isDragging: isResizing ? false : state.isDragging,
      };
    }),

  setEditingElement: (id) =>
    set((state) => ({
      editingElementId: id,
      selectedElementId: id !== null ? id : state.selectedElementId,
      isDragging: false,
      isResizing: false,
      activeHandle: null,
      activeGuides: [],
    })),

  setTransforming: (mode) =>
    set((state) => ({
      isDragging: mode.isDragging !== undefined ? mode.isDragging : state.isDragging,
      isResizing: mode.isResizing !== undefined ? mode.isResizing : state.isResizing,
      activeHandle: mode.activeHandle !== undefined ? mode.activeHandle : state.activeHandle,
    })),

  resetInteraction: () =>
    set({
      selectedElementId: null,
      hoveredElementId: null,
      isDragging: false,
      isResizing: false,
      activeHandle: null,
      editingElementId: null,
      activeGuides: [],
    }),

  updateElementTransform: (id, patch, record = false) => {
    if (record) get().recordSnapshot();
    set((state) => {
      const scene = activeScene(state.scenes, state.activeSlide);
      const existing = scene[id] || defaultTransform(id, nextZ(scene));
      const nextTransform: ElementTransform = {
        ...existing,
        ...patch,
        id,
        x: patch.x !== undefined ? patch.x : existing.x,
        y: patch.y !== undefined ? patch.y : existing.y,
      };
      return {
        scenes: {
          ...state.scenes,
          [state.activeSlide]: { ...scene, [id]: nextTransform },
        },
        revision: state.revision + 1,
      };
    });
  },

  updateCustomElement: (id, patch, record = false) => {
    if (record) get().recordSnapshot();
    set((state) => {
      const customs = activeCustoms(state.customElements, state.activeSlide);
      const index = customs.findIndex((element) => element.id === id);
      if (index === -1) return state;
      const next = [...customs];
      next[index] = { ...next[index], ...patch, id };
      return {
        customElements: { ...state.customElements, [state.activeSlide]: next },
        revision: state.revision + 1,
      };
    });
  },

  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setActiveGuides: (guides) => set({ activeGuides: guides }),

  recordSnapshot: () =>
    set((state) => {
      const snapshot = snapshotOf(state);
      const key = snapshotKey(snapshot);
      const last = state.past[state.past.length - 1];
      if (last && snapshotKey(last) === key) {
        return { future: [] };
      }
      return {
        past: [...state.past.slice(-(MAX_HISTORY - 1)), snapshot],
        future: [],
      };
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future].slice(0, MAX_HISTORY),
        scenes: clone(previous.scenes),
        customElements: clone(previous.customElements),
        selectedElementId: null,
        editingElementId: null,
        isDragging: false,
        isResizing: false,
        activeHandle: null,
        activeGuides: [],
        isRestoring: true,
        revision: state.revision + 1,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        scenes: clone(next.scenes),
        customElements: clone(next.customElements),
        selectedElementId: null,
        editingElementId: null,
        isDragging: false,
        isResizing: false,
        activeHandle: null,
        activeGuides: [],
        isRestoring: true,
        revision: state.revision + 1,
      };
    }),

  addTextBox: (centerX, centerY, options = {}) => {
    get().recordSnapshot();
    set((state) => {
      const bounds = getCanvasBounds();
      const width = options.width ?? 280;
      const height = options.height ?? 84;
      const x = Math.max(8, Math.min(bounds.width - width - 8, (centerX ?? bounds.width / 2) - width / 2));
      const y = Math.max(8, Math.min(bounds.height - height - 8, (centerY ?? bounds.height / 2) - height / 2));
      const scene = activeScene(state.scenes, state.activeSlide);
      const id = uniqueId('text');
      const transform: ElementTransform = {
        id,
        x,
        y,
        width,
        height,
        zIndex: nextZ(scene),
      };
      const custom: CanvasCustomElement = {
        id,
        kind: 'text',
        text: options.text ?? 'Your text here',
        fontSize: options.fontSize ?? 26,
        fontWeight: options.fontWeight ?? 700,
        fontStyle: options.fontStyle ?? 'normal',
        fontFamily: options.fontFamily ?? 'inherit',
        textAlign: options.textAlign ?? 'center',
        lineHeight: options.lineHeight ?? 1.2,
        letterSpacing: options.letterSpacing ?? 0,
        color: options.color ?? '#ffffff',
        glow: options.glow ?? 0,
      };
      return {
        scenes: {
          ...state.scenes,
          [state.activeSlide]: { ...scene, [id]: transform },
        },
        customElements: {
          ...state.customElements,
          [state.activeSlide]: [...activeCustoms(state.customElements, state.activeSlide), custom],
        },
        selectedElementId: id,
        editingElementId: id,
        revision: state.revision + 1,
      };
    });
    return get().selectedElementId as string;
  },

  addImageElement: (centerX, centerY, imageUrl, naturalWidth = 600, naturalHeight = 600) => {
    get().recordSnapshot();
    set((state) => {
      const bounds = getCanvasBounds();
      const maxWidth = Math.min(340, bounds.width * 0.6);
      const maxHeight = Math.min(340, bounds.height * 0.6);
      const ratio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
      let width = maxWidth;
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      width = Math.max(80, width);
      height = Math.max(60, height);
      const x = Math.max(8, Math.min(bounds.width - width - 8, (centerX ?? bounds.width / 2) - width / 2));
      const y = Math.max(8, Math.min(bounds.height - height - 8, (centerY ?? bounds.height / 2) - height / 2));
      const scene = activeScene(state.scenes, state.activeSlide);
      const id = uniqueId('image');
      const transform: ElementTransform = {
        id,
        x,
        y,
        width,
        height,
        zIndex: nextZ(scene),
      };
      const custom: CanvasCustomElement = {
        id,
        kind: 'image',
        imageUrl,
        objectFit: 'cover',
        opacity: 1,
        blur: 0,
        radius: 18,
        shadow: true,
      };
      return {
        scenes: {
          ...state.scenes,
          [state.activeSlide]: { ...scene, [id]: transform },
        },
        customElements: {
          ...state.customElements,
          [state.activeSlide]: [...activeCustoms(state.customElements, state.activeSlide), custom],
        },
        selectedElementId: id,
        editingElementId: null,
        revision: state.revision + 1,
      };
    });
    return get().selectedElementId as string;
  },

  addShape: (shape, centerX, centerY) => {
    get().recordSnapshot();
    set((state) => {
      const bounds = getCanvasBounds();
      const width = shape.defaultWidth ?? 160;
      const height = shape.defaultHeight ?? 160;
      const x = Math.max(8, Math.min(bounds.width - width - 8, (centerX ?? bounds.width / 2) - width / 2));
      const y = Math.max(8, Math.min(bounds.height - height - 8, (centerY ?? bounds.height / 2) - height / 2));
      const scene = activeScene(state.scenes, state.activeSlide);
      const id = uniqueId(shape.kind === 'line' ? 'line' : 'shape');
      const transform: ElementTransform = {
        id,
        x,
        y,
        width,
        height,
        zIndex: nextZ(scene),
      };
      const custom: CanvasCustomElement = {
        id,
        kind: shape.kind ?? 'shape',
        shapeType: shape.shapeType,
        fill: shape.fill ?? '#38bdf8',
        stroke: 'transparent',
        strokeWidth: 0,
        opacity: 1,
        glow: 0,
        text: shape.text,
        fontSize: 22,
        fontWeight: 800,
        color: '#ffffff',
      };
      return {
        scenes: {
          ...state.scenes,
          [state.activeSlide]: { ...scene, [id]: transform },
        },
        customElements: {
          ...state.customElements,
          [state.activeSlide]: [...activeCustoms(state.customElements, state.activeSlide), custom],
        },
        selectedElementId: id,
        editingElementId: null,
        revision: state.revision + 1,
      };
    });
    return get().selectedElementId as string;
  },

  duplicateElement: (targetSlideIndex, elementId) => {
    const id = elementId ?? get().selectedElementId;
    if (!id) return;
    const state = get();
    const customs = activeCustoms(state.customElements, state.activeSlide);
    const custom = customs.find((entry) => entry.id === id);
    state.recordSnapshot();

    if (custom) {
      const transform = activeScene(state.scenes, state.activeSlide)[id];
      if (!transform) return;
      const newId = uniqueId(custom.kind === 'text' ? 'text' : custom.kind);
      const cloneTransform: ElementTransform = {
        ...clone(transform),
        id: newId,
        x: transform.x + 20,
        y: transform.y + 20,
        zIndex: nextZ(activeScene(state.scenes, state.activeSlide)),
      };
      const cloneCustom: CanvasCustomElement = { ...clone(custom), id: newId };
      set((current) => ({
        scenes: {
          ...current.scenes,
          [current.activeSlide]: {
            ...activeScene(current.scenes, current.activeSlide),
            [newId]: cloneTransform,
          },
        },
        customElements: {
          ...current.customElements,
          [current.activeSlide]: [
            ...activeCustoms(current.customElements, current.activeSlide),
            cloneCustom,
          ],
        },
        selectedElementId: newId,
        revision: current.revision + 1,
      }));
      get().setToast('Element duplicated');
      return;
    }

    // Duplicating a template element converts it into an editable text box.
    const visual = readBuiltInVisual(id);
    if (!visual) return;
    const scene = activeScene(state.scenes, state.activeSlide);
    const newId = uniqueId('text');
    const transform: ElementTransform = {
      id: newId,
      x: visual.left + 20,
      y: visual.top + 20,
      width: visual.width,
      height: visual.height,
      zIndex: nextZ(scene),
    };
    const newCustom: CanvasCustomElement = {
      id: newId,
      kind: 'text',
      text: visual.text,
      fontSize: parseFloat(visual.style.fontSize) || 26,
      fontWeight: visual.style.fontWeight || 700,
      fontStyle: (visual.style.fontStyle as 'normal' | 'italic') || 'normal',
      fontFamily: visual.style.fontFamily || 'inherit',
      textAlign: (visual.style.textAlign as 'left' | 'center' | 'right') || 'left',
      lineHeight: parseFloat(visual.style.lineHeight) || 1.2,
      letterSpacing: parseFloat(visual.style.letterSpacing) || 0,
      color: visual.style.color || '#ffffff',
    };
    set((current) => ({
      scenes: {
        ...current.scenes,
        [current.activeSlide]: {
          ...activeScene(current.scenes, current.activeSlide),
          [newId]: transform,
        },
      },
      customElements: {
        ...current.customElements,
        [current.activeSlide]: [
          ...activeCustoms(current.customElements, current.activeSlide),
          newCustom,
        ],
      },
      selectedElementId: newId,
      revision: current.revision + 1,
    }));
    get().setToast('Template element duplicated as text layer');
  },

  copySelectedElement: () => {
    const state = get();
    const id = state.selectedElementId;
    if (!id) return;
    const scene = activeScene(state.scenes, state.activeSlide);
    const transform = scene[id] || defaultTransform(id, nextZ(scene));
    const custom = activeCustoms(state.customElements, state.activeSlide).find(
      (entry) => entry.id === id
    );
    set({ clipboard: { type: 'single', elementId: id, transform: clone(transform), custom: custom ? clone(custom) : undefined } });
    get().setToast(custom ? 'Element copied' : 'Element copied');
  },

  copyAllElements: () => {
    const state = get();
    const scene = clone(activeScene(state.scenes, state.activeSlide));
    const customs = clone(activeCustoms(state.customElements, state.activeSlide));
    set({ clipboard: { type: 'all', scene, customElements: customs } });
    get().setToast('Copied all elements');
  },

  pasteClipboard: (targetSlideIndex) => {
    const state = get();
    const clipboard = state.clipboard;
    if (!clipboard) return;
    const slide = targetSlideIndex ?? state.activeSlide;
    const targetScene = activeScene(state.scenes, slide);
    const targetCustoms = activeCustoms(state.customElements, slide);
    state.recordSnapshot();

    if (clipboard.type === 'single') {
      const sameSlide = slide === state.activeSlide;
      if (clipboard.custom) {
        const newId = uniqueId(clipboard.custom.kind === 'text' ? 'text' : clipboard.custom.kind);
        const offset = sameSlide ? 16 : 0;
        const transform: ElementTransform = {
          ...clone(clipboard.transform),
          id: newId,
          x: clipboard.transform.x + offset,
          y: clipboard.transform.y + offset,
          zIndex: nextZ(targetScene),
        };
        const custom: CanvasCustomElement = { ...clone(clipboard.custom), id: newId };
        set((current) => ({
          scenes: { ...current.scenes, [slide]: { ...targetScene, [newId]: transform } },
          customElements: {
            ...current.customElements,
            [slide]: [...targetCustoms, custom],
          },
          selectedElementId: newId,
          revision: current.revision + 1,
        }));
        get().setToast('Element pasted');
        return;
      }

      if (sameSlide) {
        get().duplicateElement();
        return;
      }

      set((current) => ({
        scenes: {
          ...current.scenes,
          [slide]: { ...targetScene, [clipboard.elementId]: clone(clipboard.transform) },
        },
        selectedElementId: clipboard.elementId,
        revision: current.revision + 1,
      }));
      get().setToast('Element pasted');
      return;
    }

    const sameSlide = slide === state.activeSlide;
    if (sameSlide) {
      const additions: CanvasCustomElement[] = [];
      const sceneAdditions: SlideSceneState = {};
      clipboard.customElements.forEach((custom) => {
        const transform = clipboard.scene[custom.id];
        if (!transform) return;
        const newId = uniqueId(custom.kind === 'text' ? 'text' : custom.kind);
        sceneAdditions[newId] = {
          ...clone(transform),
          id: newId,
          x: transform.x + 16,
          y: transform.y + 16,
          zIndex: nextZ({ ...targetScene, ...sceneAdditions }),
        };
        additions.push({ ...clone(custom), id: newId });
      });
      set((current) => ({
        scenes: { ...current.scenes, [slide]: { ...targetScene, ...sceneAdditions } },
        customElements: {
          ...current.customElements,
          [slide]: [...targetCustoms, ...additions],
        },
        selectedElementId: additions[0]?.id ?? current.selectedElementId,
        revision: current.revision + 1,
      }));
      get().setToast(additions.length > 0 ? 'All elements duplicated' : 'Nothing to duplicate');
      return;
    }

    const clonedCustoms = clipboard.customElements.map((custom) => ({
      ...clone(custom),
      id: uniqueId(custom.kind === 'text' ? 'text' : custom.kind),
    }));
    const clonedScene: SlideSceneState = {};
    Object.entries(clipboard.scene).forEach(([id, transform]) => {
      const corresponding = clipboard.customElements.find((custom) => custom.id === id);
      const newId = corresponding
        ? clonedCustoms[clipboard.customElements.indexOf(corresponding)]?.id ?? id
        : id;
      clonedScene[newId] = { ...clone(transform), id: newId };
    });
    set((current) => ({
      scenes: { ...current.scenes, [slide]: { ...targetScene, ...clonedScene } },
      customElements: {
        ...current.customElements,
        [slide]: [...targetCustoms, ...clonedCustoms],
      },
      selectedElementId: clonedCustoms[0]?.id ?? current.selectedElementId,
      revision: current.revision + 1,
    }));
    get().setToast('All elements pasted');
  },

  toggleLock: (id) => {
    const state = get();
    const scene = activeScene(state.scenes, state.activeSlide);
    const transform = scene[id] || defaultTransform(id, nextZ(scene));
    state.updateElementTransform(id, { isLocked: !transform.isLocked }, true);
    get().setToast(transform.isLocked ? 'Element unlocked' : 'Element locked');
  },

  toggleHidden: (id) => {
    const state = get();
    const scene = activeScene(state.scenes, state.activeSlide);
    const transform = scene[id] || defaultTransform(id, nextZ(scene));
    state.updateElementTransform(id, { isHidden: !transform.isHidden }, true);
    get().setToast(transform.isHidden ? 'Element shown' : 'Element hidden');
  },

  deleteElement: (id) => {
    const state = get();
    state.recordSnapshot();
    const customs = activeCustoms(state.customElements, state.activeSlide);
    const isCustom = customs.some((entry) => entry.id === id);
    set((current) => {
      const scene = { ...activeScene(current.scenes, current.activeSlide) };
      if (isCustom) {
        delete scene[id];
      } else {
        const existing = scene[id] || defaultTransform(id, nextZ(scene));
        scene[id] = { ...existing, isHidden: true };
      }
      return {
        scenes: { ...current.scenes, [current.activeSlide]: scene },
        customElements: {
          ...current.customElements,
          [current.activeSlide]: activeCustoms(current.customElements, current.activeSlide).filter(
            (entry) => entry.id !== id
          ),
        },
        selectedElementId: null,
        editingElementId: null,
        revision: current.revision + 1,
      };
    });
    get().setToast(isCustom ? 'Element deleted' : 'Element hidden');
  },

  resetElement: (id) => {
    const state = get();
    state.recordSnapshot();
    set((current) => {
      const scene = { ...activeScene(current.scenes, current.activeSlide) };
      delete scene[id];
      return {
        scenes: { ...current.scenes, [current.activeSlide]: scene },
        customElements: {
          ...current.customElements,
          [current.activeSlide]: activeCustoms(current.customElements, current.activeSlide).filter(
            (entry) => entry.id !== id
          ),
        },
        selectedElementId: current.selectedElementId === id ? null : current.selectedElementId,
        revision: current.revision + 1,
      };
    });
    get().setToast('Element reset');
  },

  resetSlide: () => {
    const state = get();
    state.recordSnapshot();
    set((current) => ({
      scenes: { ...current.scenes, [current.activeSlide]: {} },
      customElements: { ...current.customElements, [current.activeSlide]: [] },
      selectedElementId: null,
      editingElementId: null,
      activeGuides: [],
      revision: current.revision + 1,
    }));
    get().setToast('Layout reset to default template');
  },

  bringToFront: (id) => {
    const state = get();
    state.recordSnapshot();
    set((current) => ({
      scenes: {
        ...current.scenes,
        [current.activeSlide]: bringToFront(
          id,
          ensureLayerTransform(activeScene(current.scenes, current.activeSlide), id)
        ),
      },
      revision: current.revision + 1,
    }));
    get().setToast('Brought to front');
  },

  sendToBack: (id) => {
    const state = get();
    state.recordSnapshot();
    set((current) => ({
      scenes: {
        ...current.scenes,
        [current.activeSlide]: sendToBack(
          id,
          ensureLayerTransform(activeScene(current.scenes, current.activeSlide), id)
        ),
      },
      revision: current.revision + 1,
    }));
    get().setToast('Sent to back');
  },

  bringForward: (id) => {
    const state = get();
    state.recordSnapshot();
    set((current) => ({
      scenes: {
        ...current.scenes,
        [current.activeSlide]: bringForward(
          id,
          ensureLayerTransform(activeScene(current.scenes, current.activeSlide), id)
        ),
      },
      revision: current.revision + 1,
    }));
    get().setToast('Brought forward');
  },

  sendBackward: (id) => {
    const state = get();
    state.recordSnapshot();
    set((current) => ({
      scenes: {
        ...current.scenes,
        [current.activeSlide]: sendBackward(
          id,
          ensureLayerTransform(activeScene(current.scenes, current.activeSlide), id)
        ),
      },
      revision: current.revision + 1,
    }));
    get().setToast('Sent backward');
  },

  centerSelected: (axis) => {
    const state = get();
    const id = state.selectedElementId;
    if (!id) return;
    const canvas = document.getElementById('kontentos-static-card-canvas');
    if (!canvas) return;
    const element = canvas.querySelector(
      `[data-canvas-element-id="${CSS.escape(id)}"]`
    ) as HTMLElement | null;
    if (!element) return;
    const canvasRect = canvas.getBoundingClientRect();
    const elemRect = element.getBoundingClientRect();
    const diffX = canvasRect.left + canvasRect.width / 2 - (elemRect.left + elemRect.width / 2);
    const diffY = canvasRect.top + canvasRect.height / 2 - (elemRect.top + elemRect.height / 2);
    const scene = activeScene(state.scenes, state.activeSlide);
    const existing = scene[id] || defaultTransform(id, nextZ(scene));
    state.updateElementTransform(
      id,
      {
        x: existing.x + (axis === 'x' || axis === 'both' ? diffX : 0),
        y: existing.y + (axis === 'y' || axis === 'both' ? diffY : 0),
      },
      true
    );
    get().setToast(
      axis === 'both' ? 'Centered on canvas' : axis === 'x' ? 'Centered horizontally' : 'Centered vertically'
    );
  },

  setToast: (message) => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ toast: message });
    if (message) {
      toastTimer = setTimeout(() => {
        if (get().toast === message) set({ toast: null });
        toastTimer = null;
      }, 2200);
    }
  },
}));

export function isCustomElementId(
  id: string | null | undefined,
  customs: CanvasCustomElement[]
): boolean {
  if (!id) return false;
  return customs.some((entry) => entry.id === id) || /^(text|image|shape|line|vector|badge|sticker)-/.test(id);
}

export function getActiveScene(store: CanvasInteractionStore): SlideSceneState {
  return activeScene(store.scenes, store.activeSlide);
}

export function getActiveCustoms(store: CanvasInteractionStore): CanvasCustomElement[] {
  return activeCustoms(store.customElements, store.activeSlide);
}

export function normalizeLayers(scene: SlideSceneState): SlideSceneState {
  return normalizeSceneLayers(scene);
}

export function getElementRect(id: string) {
  return getElementCanvasRect(id);
}

export function stripRichText(value: string) {
  return stripHtml(value);
}
