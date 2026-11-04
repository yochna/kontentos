import React, { useMemo } from 'react';
import { Icon } from '@/lib/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onAddImage: () => void;
}

const QUICK_SHAPES = [
  { type: 'rect', icon: 'crop_square', label: 'Rectangle' },
  { type: 'circle', icon: 'circle', label: 'Circle' },
  { type: 'star', icon: 'star', label: 'Star' },
  { type: 'bar', icon: 'horizontal_rule', label: 'Line' },
  { type: 'quote', icon: 'format_quote', label: 'Quote' },
];

/**
 * The canvas's right-click menu was a div positioned from the click, with its own outside-click and
 * Escape listeners and a hand-rolled focus story. Radix's menu already does the trap, the roving
 * highlight, the typeahead and the collision flip — this only has to say where it opens and what is in it.
 * It opens below the cursor on purpose: Radix only shifts a menu across its side axis, so `side="right"`
 * let a 218px menu hang off the left edge of a 390px phone instead of clamping inside it.
 */
export const CanvasContextMenu: React.FC<Props> = ({ x, y, onClose, onAddImage }) => {
  const selectedId = useCanvasInteraction((s) => s.selectedElementId);
  const activeSlide = useCanvasInteraction((s) => s.activeSlide);
  const scenes = useCanvasInteraction((s) => s.scenes);
  const customElements = useCanvasInteraction((s) => s.customElements);
  const clipboard = useCanvasInteraction((s) => s.clipboard);
  const addTextBox = useCanvasInteraction((s) => s.addTextBox);
  const addShape = useCanvasInteraction((s) => s.addShape);
  const copySelectedElement = useCanvasInteraction((s) => s.copySelectedElement);
  const copyAllElements = useCanvasInteraction((s) => s.copyAllElements);
  const pasteClipboard = useCanvasInteraction((s) => s.pasteClipboard);
  const duplicateElement = useCanvasInteraction((s) => s.duplicateElement);
  const deleteElement = useCanvasInteraction((s) => s.deleteElement);
  const resetElement = useCanvasInteraction((s) => s.resetElement);
  const resetSlide = useCanvasInteraction((s) => s.resetSlide);
  const toggleLock = useCanvasInteraction((s) => s.toggleLock);
  const toggleHidden = useCanvasInteraction((s) => s.toggleHidden);
  const setEditingElement = useCanvasInteraction((s) => s.setEditingElement);
  const bringToFront = useCanvasInteraction((s) => s.bringToFront);
  const sendToBack = useCanvasInteraction((s) => s.sendToBack);
  const bringForward = useCanvasInteraction((s) => s.bringForward);
  const sendBackward = useCanvasInteraction((s) => s.sendBackward);
  const centerSelected = useCanvasInteraction((s) => s.centerSelected);

  const transform = selectedId ? (scenes[activeSlide] || {})[selectedId] : undefined;
  const custom = useMemo(
    () =>
      selectedId ? (customElements[activeSlide] || []).find((entry) => entry.id === selectedId) : undefined,
    [customElements, activeSlide, selectedId],
  );
  const hasSelection = !!selectedId;
  const canEditText = hasSelection && (custom?.kind === 'text' || custom?.kind === 'badge');

  const addShapeAt = (shape: (typeof QUICK_SHAPES)[number]) =>
    addShape(
      {
        shapeType: shape.type,
        fill: '#38bdf8',
        defaultWidth: shape.type === 'bar' ? 160 : 120,
        defaultHeight: shape.type === 'bar' ? 10 : 120,
      },
      x,
      y,
    );

  return (
    <DropdownMenu open onOpenChange={(next) => !next && onClose()}>
      {/* Radix gives this version of the menu no virtual anchor, so the click point becomes a
          zero-size trigger and the popper measures it — which also replaces the hand-rolled
          viewport clamping this menu used to do with its collision handling. */}
      <DropdownMenuTrigger asChild>
        <span aria-hidden style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={2} className="w-[218px]">
        <DropdownMenuLabel>Insert element</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => addTextBox(x, y)}>
          <Icon name="title" size={14} /> Text box
          <DropdownMenuShortcut>T</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddImage}>
          <Icon name="image" size={14} /> Image / upload
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon name="category" size={14} /> Shape
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[11rem]">
            {QUICK_SHAPES.map((shape) => (
              <DropdownMenuItem key={shape.type} onSelect={() => addShapeAt(shape)}>
                <Icon name={shape.icon} size={14} /> {shape.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {hasSelection ? (
          <>
            <DropdownMenuLabel>{custom?.kind || 'Template'} element</DropdownMenuLabel>
            {canEditText && (
              <DropdownMenuItem onSelect={() => setEditingElement(selectedId)}>
                <Icon name="edit" size={14} /> Edit text
                <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={copySelectedElement}>
              <Icon name="content_copy" size={14} /> Copy
              <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!clipboard} onSelect={() => pasteClipboard()}>
              <Icon name="content_paste" size={14} /> Paste
              <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => duplicateElement()}>
              <Icon name="library_add" size={14} /> Duplicate
              <DropdownMenuShortcut>Ctrl+D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => bringToFront(selectedId)}>
              <Icon name="flip_to_front" size={14} /> Bring to front
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => bringForward(selectedId)}>
              <Icon name="file_upload" size={14} /> Bring forward
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => sendBackward(selectedId)}>
              <Icon name="file_download" size={14} /> Send backward
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => sendToBack(selectedId)}>
              <Icon name="flip_to_back" size={14} /> Send to back
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => centerSelected('x')}>
              <Icon name="align_horizontal_center" size={14} /> Center horizontally
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => centerSelected('y')}>
              <Icon name="align_vertical_center" size={14} /> Center vertically
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => centerSelected('both')}>
              <Icon name="center_focus_strong" size={14} /> Center on canvas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toggleLock(selectedId)}>
              <Icon name={transform?.isLocked ? 'lock' : 'lock_open'} size={14} />
              {transform?.isLocked ? 'Unlock' : 'Lock'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toggleHidden(selectedId)}>
              <Icon name={transform?.isHidden ? 'visibility' : 'visibility_off'} size={14} />
              {transform?.isHidden ? 'Show' : 'Hide'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => resetElement(selectedId)}>
              <Icon name="restart_alt" size={14} /> Reset element
            </DropdownMenuItem>
            <DropdownMenuItem tone="danger" onSelect={() => deleteElement(selectedId)}>
              <Icon name="delete" size={14} /> Delete
              <DropdownMenuShortcut>Del</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled={!clipboard} onSelect={() => pasteClipboard()}>
              <Icon name="content_paste" size={14} /> Paste here
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={copyAllElements}>
              <Icon name="copy_all" size={14} /> Copy all layers
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={resetSlide}>
              <Icon name="restart_alt" size={14} /> Reset slide layout
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CanvasContextMenu;
