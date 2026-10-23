import { create } from 'zustand';
import type { CanvasElementId, TransformHandleType } from '../../../types/canvasScene';

export interface CanvasInteractionState {
  selectedElementId: CanvasElementId | null;
  hoveredElementId: CanvasElementId | null;
  isDragging: boolean;
  isResizing: boolean;
  activeHandle: TransformHandleType | null;
  editingElementId: CanvasElementId | null;
}

export interface CanvasInteractionActions {
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
}

export type CanvasInteractionStore = CanvasInteractionState & CanvasInteractionActions;

const initialState: CanvasInteractionState = {
  selectedElementId: null,
  hoveredElementId: null,
  isDragging: false,
  isResizing: false,
  activeHandle: null,
  editingElementId: null,
};

/**
 * Zustand store for managing direct-manipulation canvas interactions.
 * Controls active selection bounding box, hover state, drag/resize handles,
 * and inline text editing across canvas elements.
 */
export const useCanvasInteraction = create<CanvasInteractionStore>((set) => ({
  ...initialState,

  selectElement: (id: CanvasElementId | null) =>
    set((state) => {
      if (id === null) {
        return {
          selectedElementId: null,
          editingElementId: null,
          isDragging: false,
          isResizing: false,
          activeHandle: null,
        };
      }
      if (state.selectedElementId === id) {
        return state;
      }
      return {
        selectedElementId: id,
        editingElementId: null,
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
    }),

  setHovered: (id: CanvasElementId | null) =>
    set((state) => (state.hoveredElementId === id ? state : { hoveredElementId: id })),

  setDragging: (isDragging: boolean) =>
    set((state) => {
      if (state.isDragging === isDragging) return state;
      return {
        isDragging,
        isResizing: isDragging ? false : state.isResizing,
        activeHandle: isDragging ? null : state.activeHandle,
      };
    }),

  setResizing: (isResizing: boolean, handle: TransformHandleType | null = null) =>
    set((state) => {
      if (state.isResizing === isResizing && state.activeHandle === handle) return state;
      return {
        isResizing,
        activeHandle: isResizing ? handle : null,
        isDragging: isResizing ? false : state.isDragging,
      };
    }),

  setEditingElement: (id: CanvasElementId | null) =>
    set((state) => ({
      editingElementId: id,
      selectedElementId: id !== null ? id : state.selectedElementId,
      isDragging: false,
      isResizing: false,
      activeHandle: null,
    })),

  setTransforming: (mode) =>
    set((state) => ({
      isDragging: mode.isDragging !== undefined ? mode.isDragging : state.isDragging,
      isResizing: mode.isResizing !== undefined ? mode.isResizing : state.isResizing,
      activeHandle: mode.activeHandle !== undefined ? mode.activeHandle : state.activeHandle,
    })),

  resetInteraction: () => set(initialState),
}));
