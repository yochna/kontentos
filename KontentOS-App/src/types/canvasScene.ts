/**
 * Canvas Scene Graph & Transform Type Definitions
 * Supporting KontentOS Static Post Studio's In-App Advanced Visual Editor.
 *
 * Implements non-destructive coordinate overrides and layer transforms
 * on top of responsive semantic card templates.
 */

export type CanvasElementId =
  | 'headline'
  | 'body'
  | 'profile'
  | 'badge'
  | 'media-box'
  | 'watermark'
  | (string & {});

export interface ElementTransform {
  id: CanvasElementId;
  x: number; // percentage (0-100) or pixels
  y: number; // percentage (0-100) or pixels
  width?: number; // percentage or px
  height?: number; // percentage or px
  rotation?: number; // degrees (-180 to 180)
  zIndex: number;
  isLocked?: boolean;
  isHidden?: boolean;
  customStyle?: Record<string, string | number>;
}

export type SlideSceneState = Record<string, ElementTransform>;

/**
 * Interactive handle anchors for 8-point resizing and rotation
 */
export type TransformHandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rot';

/**
 * Active interaction state for canvas selection, drag, and resize operations
 */
export interface CanvasInteractionState {
  selectedElementId: CanvasElementId | null;
  hoveredElementId: CanvasElementId | null;
  isDragging: boolean;
  isResizing: boolean;
  activeHandle: TransformHandleType | null;
  editingElementId: CanvasElementId | null;
}
