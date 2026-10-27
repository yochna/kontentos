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
  | 'content-box'
  | 'accent-line'
  | 'quote-mark'
  | 'footer'
  | (string & {});

export interface ElementTransform {
  id: CanvasElementId;
  x: number; // px translate for semantic elements, absolute px for custom elements
  y: number;
  width?: number; // px
  height?: number; // px
  rotation?: number; // degrees (-180 to 180)
  zIndex: number;
  isLocked?: boolean;
  isHidden?: boolean;
  customStyle?: Record<string, string | number>;
}

export type SlideSceneState = Record<string, ElementTransform>;

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

export type CustomElementKind = 'text' | 'image' | 'shape' | 'badge' | 'line';

export interface CanvasCustomElement {
  id: string;
  kind: CustomElementKind;
  // Text content
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: 'normal' | 'italic';
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
  glow?: number;
  // Image
  imageUrl?: string;
  objectFit?: 'cover' | 'contain';
  opacity?: number;
  blur?: number;
  radius?: number;
  // Shapes / vectors
  shapeType?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  // Shared appearance
  shadow?: boolean;
}

export interface GuideLine {
  orientation: 'vertical' | 'horizontal';
  position: number;
  label?: string;
  kind?: 'center' | 'safe' | 'sibling';
}

export interface CanvasBoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasSnapshot {
  scenes: Record<number, SlideSceneState>;
  customElements: Record<number, CanvasCustomElement[]>;
}

export type CanvasClipboardItem =
  | {
      type: 'single';
      elementId: string;
      transform: ElementTransform;
      custom?: CanvasCustomElement;
    }
  | {
      type: 'all';
      scene: SlideSceneState;
      customElements: CanvasCustomElement[];
    };

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
