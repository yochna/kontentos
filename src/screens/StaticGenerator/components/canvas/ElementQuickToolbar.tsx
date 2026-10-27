import React, { useMemo, useState } from 'react';
import { Icon } from '@/lib/icons';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';

interface Props {
  rect: { x: number; y: number; width: number; height: number };
}

const COLORS = [
  '#ffffff',
  '#f8fafc',
  '#fde68a',
  '#f59e0b',
  '#fb7185',
  '#ef4444',
  '#f472b6',
  '#c084fc',
  '#818cf8',
  '#38bdf8',
  '#22d3ee',
  '#34d399',
  '#111827',
];

const TEXT_IDS = new Set(['headline', 'body', 'badge', 'profile', 'footer', 'quote-mark']);

export const ElementQuickToolbar: React.FC<Props> = ({ rect }) => {
  const selectedId = useCanvasInteraction((s) => s.selectedElementId);
  const activeSlide = useCanvasInteraction((s) => s.activeSlide);
  const scenes = useCanvasInteraction((s) => s.scenes);
  const customElements = useCanvasInteraction((s) => s.customElements);
  const clipboard = useCanvasInteraction((s) => s.clipboard);
  const updateElementTransform = useCanvasInteraction((s) => s.updateElementTransform);
  const updateCustomElement = useCanvasInteraction((s) => s.updateCustomElement);
  const setEditingElement = useCanvasInteraction((s) => s.setEditingElement);
  const toggleLock = useCanvasInteraction((s) => s.toggleLock);
  const duplicateElement = useCanvasInteraction((s) => s.duplicateElement);
  const deleteElement = useCanvasInteraction((s) => s.deleteElement);
  const resetElement = useCanvasInteraction((s) => s.resetElement);
  const copySelectedElement = useCanvasInteraction((s) => s.copySelectedElement);
  const pasteClipboard = useCanvasInteraction((s) => s.pasteClipboard);
  const [showColors, setShowColors] = useState(false);

  const transform = selectedId ? (scenes[activeSlide] || {})[selectedId] : undefined;
  const custom = useMemo(
    () => (selectedId ? (customElements[activeSlide] || []).find((entry) => entry.id === selectedId) : undefined),
    [customElements, activeSlide, selectedId]
  );

  if (!selectedId) return null;

  const isCustom = !!custom;
  const isImage = custom?.kind === 'image';
  const isShape = custom?.kind === 'shape' || custom?.kind === 'badge' || custom?.kind === 'line';
  const isText = isCustom ? custom.kind === 'text' : TEXT_IDS.has(selectedId);
  const isLocked = transform?.isLocked ?? false;

  const customStyle = (transform?.customStyle || {}) as Record<string, string | number>;
  const currentFontSize =
    (isCustom ? custom?.fontSize : parseFloat(String(customStyle.fontSize || '24'))) || 24;
  const currentWeight = isCustom ? custom?.fontWeight : customStyle.fontWeight;
  const currentStyle = isCustom ? custom?.fontStyle : customStyle.fontStyle;
  const currentAlign = (isCustom ? custom?.textAlign : customStyle.textAlign) || 'left';
  const currentColor = String(
    (isCustom ? custom?.color : customStyle.color) || (isShape ? custom?.fill : '#ffffff') || '#ffffff'
  );

  const patchText = (patch: {
    fontSize?: number;
    fontWeight?: number | string;
    fontStyle?: 'normal' | 'italic';
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
  }) => {
    if (isCustom) {
      updateCustomElement(selectedId, patch, true);
      return;
    }
    const nextStyle: Record<string, string | number> = { ...customStyle };
    if (patch.fontSize !== undefined) nextStyle.fontSize = `${patch.fontSize}px`;
    if (patch.fontWeight !== undefined) nextStyle.fontWeight = patch.fontWeight;
    if (patch.fontStyle !== undefined) nextStyle.fontStyle = patch.fontStyle;
    if (patch.color !== undefined) nextStyle.color = patch.color;
    if (patch.textAlign !== undefined) nextStyle.textAlign = patch.textAlign;
    updateElementTransform(selectedId, { customStyle: nextStyle }, true);
  };

  const changeSize = (delta: number) => {
    patchText({ fontSize: Math.max(10, Math.min(120, Math.round(currentFontSize + delta))) });
  };

  const cycleAlign = () => {
    const next = currentAlign === 'left' ? 'center' : currentAlign === 'center' ? 'right' : 'left';
    patchText({ textAlign: next });
  };

  const applyColor = (color: string) => {
    if (isShape) updateCustomElement(selectedId, { fill: color }, true);
    else patchText({ color });
    setShowColors(false);
  };

  const cycleNumber = (values: number[], current: number) => {
    const index = values.findIndex((value) => Math.abs(value - current) < 0.01);
    return values[(index + 1) % values.length];
  };

  const flipPosition = rect.y < 116;

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-[75] flex items-center gap-0.5 px-1.5 py-1 rounded-xl bg-slate-900/95 border border-white/20 shadow-2xl backdrop-blur-xl whitespace-nowrap pointer-events-auto ${
        flipPosition ? 'top-full mt-3' : '-top-[96px]'
      }`}
      data-canvas-ui="true"
      data-canvas-no-drag="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isText && (
        <>
          <ToolButton
            icon="edit"
            title="Edit text"
            onClick={() => setEditingElement(selectedId)}
          />
          <ToolButton icon="remove" title="Decrease font size" onClick={() => changeSize(-2)} />
          <span className="text-[9px] font-mono text-slate-300 w-7 text-center">{Math.round(currentFontSize)}</span>
          <ToolButton icon="add" title="Increase font size" onClick={() => changeSize(2)} />
          <ToolButton
            icon="format_bold"
            title="Bold"
            active={String(currentWeight) === '800' || String(currentWeight) === '700' || String(currentWeight) === 'bold'}
            onClick={() =>
              patchText({
                fontWeight:
                  String(currentWeight) === '800' || String(currentWeight) === '700' || String(currentWeight) === 'bold'
                    ? 'normal'
                    : 800,
              })
            }
          />
          <ToolButton
            icon="format_italic"
            title="Italic"
            active={currentStyle === 'italic'}
            onClick={() => patchText({ fontStyle: currentStyle === 'italic' ? 'normal' : 'italic' })}
          />
          <ToolButton icon="format_align_left" title={`Align: ${currentAlign}`} onClick={cycleAlign} />
          <span className="w-px h-4 bg-white/15 mx-0.5" />
        </>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowColors((value) => !value)}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/10"
          title="Color"
        >
          <span
            className="w-3.5 h-3.5 rounded-full border border-white/40"
            style={{ background: currentColor }}
          />
        </button>
        {showColors && (
          <div className="absolute top-9 left-1/2 -translate-x-1/2 grid grid-cols-5 gap-1.5 p-2 rounded-lg bg-slate-900 border border-white/20 shadow-2xl z-[80]">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyColor(color)}
                className="w-5 h-5 rounded border border-white/25 hover:scale-110 transition-transform"
                style={{ background: color }}
                title={color}
              />
            ))}
            <input
              type="color"
              value={currentColor.startsWith('#') ? currentColor : '#ffffff'}
              onChange={(event) => applyColor(event.target.value)}
              className="col-span-5 w-full h-6 rounded cursor-pointer bg-transparent"
            />
          </div>
        )}
      </div>

      {isImage && (
        <>
          <ToolButton
            icon="opacity"
            title="Cycle opacity"
            onClick={() =>
              updateCustomElement(
                selectedId,
                { opacity: cycleNumber([1, 0.8, 0.6, 0.4, 0.2], custom?.opacity ?? 1) },
                true
              )
            }
          />
          <ToolButton
            icon="blur_on"
            title="Cycle lens blur"
            onClick={() =>
              updateCustomElement(
                selectedId,
                { blur: cycleNumber([0, 2, 5, 10, 16], custom?.blur ?? 0) },
                true
              )
            }
          />
          <ToolButton
            icon="rounded_corner"
            title="Cycle corner radius"
            onClick={() =>
              updateCustomElement(
                selectedId,
                { radius: cycleNumber([0, 12, 24, 999], custom?.radius ?? 0) },
                true
              )
            }
          />
        </>
      )}

      {isShape && (
        <ToolButton
          icon="auto_awesome"
          title="Toggle glow"
          active={(custom?.glow ?? 0) > 0}
          onClick={() =>
            updateCustomElement(selectedId, { glow: (custom?.glow ?? 0) > 0 ? 0 : 16 }, true)
          }
        />
      )}

      {selectedId === 'accent-line' && (
        <>
          <ToolButton
            icon="remove"
            title="Decrease width"
            onClick={() => {
              const width = transform?.width ?? 40;
              updateElementTransform(selectedId, { width: Math.max(12, width - 8) }, true);
            }}
          />
          <ToolButton
            icon="add"
            title="Increase width"
            onClick={() => {
              const width = transform?.width ?? 40;
              updateElementTransform(selectedId, { width: width + 8 }, true);
            }}
          />
        </>
      )}

      <span className="w-px h-4 bg-white/15 mx-0.5" />

      <ToolButton
        icon={isLocked ? 'lock' : 'lock_open'}
        title={isLocked ? 'Unlock' : 'Lock'}
        active={isLocked}
        onClick={() => toggleLock(selectedId)}
      />
      <ToolButton icon="content_copy" title="Copy (Ctrl+C)" onClick={copySelectedElement} />
      {clipboard && <ToolButton icon="content_paste" title="Paste (Ctrl+V)" onClick={() => pasteClipboard()} />}
      <ToolButton icon="library_add" title="Duplicate (Ctrl+D)" onClick={() => duplicateElement()} />
      <ToolButton icon="restart_alt" title="Reset element" onClick={() => resetElement(selectedId)} />
      <ToolButton
        icon="delete"
        title="Delete / hide"
        danger
        onClick={() => deleteElement(selectedId)}
      />
    </div>
  );
};

const ToolButton: React.FC<{
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}> = ({ icon, title, onClick, active = false, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
      danger
        ? 'text-rose-300 hover:bg-rose-500/20'
        : active
        ? 'bg-cyan-500/25 text-cyan-200'
        : 'text-slate-200 hover:bg-white/10'
    }`}
  >
    <Icon name={icon} size={14} />
  </button>
);

export default ElementQuickToolbar;
