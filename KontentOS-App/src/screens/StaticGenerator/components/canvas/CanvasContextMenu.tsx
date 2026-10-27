import React, { useEffect, useMemo, useRef } from 'react';
import { Icon } from '@/lib/icons';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { getCanvasBounds } from '../../utils/canvasMath';

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

export const CanvasContextMenu: React.FC<Props> = ({ x, y, onClose, onAddImage }) => {
  const menuRef = useRef<HTMLDivElement>(null);
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
    () => (selectedId ? (customElements[activeSlide] || []).find((entry) => entry.id === selectedId) : undefined),
    [customElements, activeSlide, selectedId]
  );
  const hasSelection = !!selectedId;
  const canEditText = hasSelection && (custom?.kind === 'text' || custom?.kind === 'badge');

  useEffect(() => {
    const close = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  const bounds = getCanvasBounds();
  const left = Math.max(6, Math.min(x, Math.max(6, bounds.width - 230)));
  const top = Math.max(6, Math.min(y, Math.max(6, bounds.height - 430)));

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="absolute z-[150] w-[218px] max-h-[420px] overflow-y-auto rounded-xl border border-white/15 bg-slate-950/95 text-slate-200 shadow-2xl backdrop-blur-xl p-1.5 pointer-events-auto"
      style={{ left, top }}
      data-canvas-ui="true"
      data-canvas-no-drag="true"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="px-2.5 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
        Insert element
      </div>
      <MenuItem
        icon="title"
        label="Text box"
        hint="T"
        onClick={() => run(() => addTextBox(x, y))}
      />
      <MenuItem
        icon="image"
        label="Image / upload"
        onClick={() => run(onAddImage)}
      />
      <div className="px-1.5 pb-2 pt-1 flex items-center gap-1">
        {QUICK_SHAPES.map((shape) => (
          <button
            key={shape.type}
            type="button"
            title={shape.label}
            onClick={() =>
              run(() =>
                addShape(
                  {
                    shapeType: shape.type,
                    fill: shape.type === 'bar' ? '#38bdf8' : '#38bdf8',
                    defaultWidth: shape.type === 'bar' ? 160 : 120,
                    defaultHeight: shape.type === 'bar' ? 10 : 120,
                  },
                  x,
                  y
                )
              )
            }
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-cyan-300"
          >
            <Icon name={shape.icon} size={16} />
          </button>
        ))}
      </div>

      <div className="h-px bg-white/10 my-1" />

      {hasSelection ? (
        <>
          <div className="px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
            {custom?.kind || 'Template'} element
          </div>
          {canEditText && (
            <MenuItem
              icon="edit"
              label="Edit text"
              hint="Enter"
              onClick={() => run(() => setEditingElement(selectedId))}
            />
          )}
          <MenuItem
            icon="content_copy"
            label="Copy"
            hint="Ctrl+C"
            onClick={() => run(copySelectedElement)}
          />
          <MenuItem
            icon="content_paste"
            label="Paste"
            hint="Ctrl+V"
            disabled={!clipboard}
            onClick={() => run(() => pasteClipboard())}
          />
          <MenuItem
            icon="library_add"
            label="Duplicate"
            hint="Ctrl+D"
            onClick={() => run(() => duplicateElement())}
          />
          <div className="h-px bg-white/10 my-1" />
          <MenuItem icon="flip_to_front" label="Bring to front" onClick={() => run(() => bringToFront(selectedId))} />
          <MenuItem icon="file_upload" label="Bring forward" onClick={() => run(() => bringForward(selectedId))} />
          <MenuItem icon="file_download" label="Send backward" onClick={() => run(() => sendBackward(selectedId))} />
          <MenuItem icon="flip_to_back" label="Send to back" onClick={() => run(() => sendToBack(selectedId))} />
          <div className="h-px bg-white/10 my-1" />
          <MenuItem
            icon="align_horizontal_center"
            label="Center horizontally"
            onClick={() => run(() => centerSelected('x'))}
          />
          <MenuItem
            icon="align_vertical_center"
            label="Center vertically"
            onClick={() => run(() => centerSelected('y'))}
          />
          <MenuItem icon="center_focus_strong" label="Center on canvas" onClick={() => run(() => centerSelected('both'))} />
          <MenuItem
            icon={transform?.isLocked ? 'lock' : 'lock_open'}
            label={transform?.isLocked ? 'Unlock' : 'Lock'}
            onClick={() => run(() => toggleLock(selectedId))}
          />
          <MenuItem
            icon={transform?.isHidden ? 'visibility' : 'visibility_off'}
            label={transform?.isHidden ? 'Show' : 'Hide'}
            onClick={() => run(() => toggleHidden(selectedId))}
          />
          <MenuItem
            icon="restart_alt"
            label="Reset element"
            onClick={() => run(() => resetElement(selectedId))}
          />
          <MenuItem
            icon="delete"
            label="Delete"
            hint="Del"
            danger
            onClick={() => run(() => deleteElement(selectedId))}
          />
        </>
      ) : (
        <>
          <MenuItem
            icon="content_paste"
            label="Paste here"
            disabled={!clipboard}
            onClick={() => run(() => pasteClipboard())}
          />
          <MenuItem icon="copy_all" label="Copy all layers" onClick={() => run(copyAllElements)} />
          <MenuItem icon="restart_alt" label="Reset slide layout" onClick={() => run(resetSlide)} />
        </>
      )}
    </div>
  );
};

const MenuItem: React.FC<{
  icon: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, label, hint, danger = false, disabled = false, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
      disabled
        ? 'text-slate-600 cursor-not-allowed'
        : danger
        ? 'text-rose-300 hover:bg-rose-500/15'
        : 'text-slate-200 hover:bg-white/10'
    }`}
  >
    <Icon name={icon} size={14} />
    <span className="flex-1 text-left">{label}</span>
    {hint && <span className="text-[8px] text-slate-500 font-mono">{hint}</span>}
  </button>
);

export default CanvasContextMenu;
