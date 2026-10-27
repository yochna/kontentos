import React, { useMemo, useRef } from 'react';
import { Icon } from '@/lib/icons';
import type { CanvasCustomElement } from '../../../../types/canvasScene';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { VectorShapesSection } from './VectorShapesSection';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddImage: () => void;
  embedded?: boolean;
}

const FONTS = [
  { label: 'Theme font', value: 'inherit' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'DM Sans', value: '"DM Sans", sans-serif' },
  { label: 'Space Grotesk', value: '"Space Grotesk", sans-serif' },
  { label: 'Playfair Display', value: '"Playfair Display", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
];

const TEXT_IDS = new Set(['headline', 'body', 'badge', 'profile', 'footer', 'quote-mark']);

const ELEMENT_LABELS: Record<string, string> = {
  headline: 'Headline',
  body: 'Quote / Body',
  profile: 'Author Profile',
  badge: 'Accent Badge',
  'content-box': 'Content Panel',
  'accent-line': 'Accent Line',
  'quote-mark': 'Quote Mark',
  footer: 'Footer',
  'media-box': 'Media Box',
  watermark: 'Watermark',
};

const KIND_ICONS: Record<string, string> = {
  text: 'title',
  image: 'image',
  shape: 'category',
  badge: 'label',
  line: 'horizontal_rule',
};

export const ElementInspectorPanel: React.FC<Props> = ({
  open,
  onClose,
  onAddImage,
  embedded = false,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedId = useCanvasInteraction((s) => s.selectedElementId);
  const activeSlide = useCanvasInteraction((s) => s.activeSlide);
  const scenes = useCanvasInteraction((s) => s.scenes);
  const customElements = useCanvasInteraction((s) => s.customElements);
  const snapEnabled = useCanvasInteraction((s) => s.snapEnabled);
  const clipboard = useCanvasInteraction((s) => s.clipboard);
  const selectElement = useCanvasInteraction((s) => s.selectElement);
  const updateElementTransform = useCanvasInteraction((s) => s.updateElementTransform);
  const updateCustomElement = useCanvasInteraction((s) => s.updateCustomElement);
  const recordSnapshot = useCanvasInteraction((s) => s.recordSnapshot);
  const toggleLock = useCanvasInteraction((s) => s.toggleLock);
  const toggleHidden = useCanvasInteraction((s) => s.toggleHidden);
  const deleteElement = useCanvasInteraction((s) => s.deleteElement);
  const duplicateElement = useCanvasInteraction((s) => s.duplicateElement);
  const resetElement = useCanvasInteraction((s) => s.resetElement);
  const resetSlide = useCanvasInteraction((s) => s.resetSlide);
  const bringToFront = useCanvasInteraction((s) => s.bringToFront);
  const sendToBack = useCanvasInteraction((s) => s.sendToBack);
  const bringForward = useCanvasInteraction((s) => s.bringForward);
  const sendBackward = useCanvasInteraction((s) => s.sendBackward);
  const centerSelected = useCanvasInteraction((s) => s.centerSelected);
  const setEditingElement = useCanvasInteraction((s) => s.setEditingElement);
  const addTextBox = useCanvasInteraction((s) => s.addTextBox);
  const copyAllElements = useCanvasInteraction((s) => s.copyAllElements);
  const pasteClipboard = useCanvasInteraction((s) => s.pasteClipboard);
  const setSnapEnabled = useCanvasInteraction((s) => s.setSnapEnabled);
  const setToast = useCanvasInteraction((s) => s.setToast);

  const scene = scenes[activeSlide] || {};
  const transform = selectedId ? scene[selectedId] : undefined;
  const custom = useMemo(
    () => (selectedId ? (customElements[activeSlide] || []).find((entry) => entry.id === selectedId) : undefined),
    [customElements, activeSlide, selectedId]
  );

  if (!open) return null;

  const isCustom = !!custom;
  const isText = isCustom ? custom.kind === 'text' || custom.kind === 'badge' : !!selectedId && TEXT_IDS.has(selectedId);
  const isImage = isCustom && custom.kind === 'image';
  const isShape = isCustom && (custom.kind === 'shape' || custom.kind === 'line');
  const isLocked = transform?.isLocked ?? false;
  const isHidden = transform?.isHidden ?? false;
  const customStyle = (transform?.customStyle || {}) as Record<string, string | number>;

  const patchTransform = (patch: Parameters<typeof updateElementTransform>[1], record = true) => {
    if (!selectedId) return;
    updateElementTransform(selectedId, patch, record);
  };

  const patchCustom = (patch: Partial<CanvasCustomElement>, record = true) => {
    if (!selectedId) return;
    updateCustomElement(selectedId, patch, record);
  };

  const patchText = (patch: {
    fontSize?: number;
    fontWeight?: number | string;
    fontStyle?: 'normal' | 'italic';
    fontFamily?: string;
    lineHeight?: number;
    letterSpacing?: number;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
    glow?: number;
  }) => {
    if (!selectedId) return;
    if (isCustom) {
      patchCustom(patch);
      return;
    }
    const next: Record<string, string | number> = { ...customStyle };
    if (patch.fontSize !== undefined) next.fontSize = `${patch.fontSize}px`;
    if (patch.fontWeight !== undefined) next.fontWeight = patch.fontWeight;
    if (patch.fontStyle !== undefined) next.fontStyle = patch.fontStyle;
    if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily;
    if (patch.lineHeight !== undefined) next.lineHeight = patch.lineHeight;
    if (patch.letterSpacing !== undefined) next.letterSpacing = `${patch.letterSpacing}px`;
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.textAlign !== undefined) next.textAlign = patch.textAlign;
    if (patch.glow !== undefined) {
      next.textShadow = patch.glow > 0 ? `0 0 ${patch.glow}px ${String(next.color || '#ffffff')}` : 'none';
    }
    patchTransform({ customStyle: next });
  };

  const textFontSize = isCustom ? custom.fontSize ?? 26 : parseFloat(String(customStyle.fontSize || '24')) || 24;
  const textFontWeight = isCustom
    ? custom.fontWeight ?? 700
    : customStyle.fontWeight ?? 700;
  const textFontStyle = isCustom ? custom.fontStyle ?? 'normal' : (customStyle.fontStyle as string) || 'normal';
  const textFontFamily = isCustom ? custom.fontFamily ?? 'inherit' : String(customStyle.fontFamily || 'inherit');
  const textLineHeight = isCustom ? custom.lineHeight ?? 1.2 : parseFloat(String(customStyle.lineHeight || '1.2')) || 1.2;
  const textLetterSpacing = isCustom
    ? custom.letterSpacing ?? 0
    : parseFloat(String(customStyle.letterSpacing || '0')) || 0;
  const textColor = isCustom ? custom.color || '#ffffff' : String(customStyle.color || '#ffffff');
  const textAlign = isCustom ? custom.textAlign ?? 'left' : (customStyle.textAlign as string) || 'left';
  const textGlow = isCustom ? custom.glow ?? 0 : 0;

  const opacity =
    typeof customStyle.opacity === 'number'
      ? customStyle.opacity
      : parseFloat(String(customStyle.opacity || '1')) || 1;

  const layerEntries = useMemo(() => {
    const customs = customElements[activeSlide] || [];
    const ids = new Set<string>([...Object.keys(scene), ...customs.map((entry) => entry.id)]);
    return Array.from(ids)
      .map((id) => {
        const entryTransform = scene[id];
        const entryCustom = customs.find((entry) => entry.id === id);
        return {
          id,
          transform: entryTransform || { id, x: 0, y: 0, zIndex: 20 },
          custom: entryCustom,
        };
      })
      .sort((a, b) => (b.transform.zIndex || 0) - (a.transform.zIndex || 0));
  }, [scene, customElements, activeSlide]);

  const uploadReplacement = (file?: File) => {
    if (!file || !selectedId) return;
    if (!file.type.startsWith('image/')) {
      setToast('Please choose an image file');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setToast('Image must be under 6 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      patchCustom({ imageUrl: String(reader.result) });
      setToast('Image replaced');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={
        embedded
          ? 'flex flex-col w-full h-[calc(100vh-9rem)] min-h-[620px] max-h-[920px] rounded-2xl border border-white/15 bg-slate-950/95 text-slate-200 shadow-2xl backdrop-blur-2xl overflow-hidden'
          : 'fixed right-4 top-[82px] bottom-4 w-[322px] z-[70] flex flex-col rounded-2xl border border-white/15 bg-slate-950/95 text-slate-200 shadow-2xl backdrop-blur-2xl overflow-hidden'
      }
      data-canvas-ui="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3.5 h-11 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-md bg-cyan-500/15 text-cyan-300 flex items-center justify-center">
            <Icon name={custom ? KIND_ICONS[custom.kind] || 'tune' : 'tune'} size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 font-black leading-none">
              Inspector
            </p>
            <p className="text-[11px] font-semibold truncate">
              {selectedId ? ELEMENT_LABELS[selectedId] || custom?.kind || selectedId : 'Canvas & layers'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white"
          title="Close inspector"
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {selectedId ? (
          <>
            <div className="grid grid-cols-4 gap-1">
              <ActionButton
                icon={isLocked ? 'lock' : 'lock_open'}
                label={isLocked ? 'Unlock' : 'Lock'}
                active={isLocked}
                onClick={() => toggleLock(selectedId)}
              />
              <ActionButton
                icon={isHidden ? 'visibility' : 'visibility_off'}
                label={isHidden ? 'Show' : 'Hide'}
                active={isHidden}
                onClick={() => toggleHidden(selectedId)}
              />
              <ActionButton icon="library_add" label="Duplicate" onClick={() => duplicateElement()} />
              <ActionButton icon="delete" label="Delete" danger onClick={() => deleteElement(selectedId)} />
            </div>

            <Section title="Position & size" icon="open_with">
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label={isCustom ? 'X' : 'X offset'}
                  value={Math.round(transform?.x ?? 0)}
                  onChange={(value) => patchTransform({ x: value })}
                />
                <NumberField
                  label={isCustom ? 'Y' : 'Y offset'}
                  value={Math.round(transform?.y ?? 0)}
                  onChange={(value) => patchTransform({ y: value })}
                />
                <NumberField
                  label="Width"
                  value={transform?.width ? Math.round(transform.width) : ''}
                  placeholder="auto"
                  onChange={(value) => patchTransform({ width: value || undefined })}
                />
                <NumberField
                  label="Height"
                  value={transform?.height ? Math.round(transform.height) : ''}
                  placeholder="auto"
                  onChange={(value) => patchTransform({ height: value || undefined })}
                />
              </div>
              <SliderField
                label="Rotation"
                value={Math.round(transform?.rotation ?? 0)}
                min={-180}
                max={180}
                step={1}
                suffix="°"
                onStart={recordSnapshot}
                onChange={(value) => patchTransform({ rotation: value }, false)}
              />
              <SliderField
                label="Opacity"
                value={Math.round(opacity * 100)}
                min={5}
                max={100}
                step={1}
                suffix="%"
                onStart={recordSnapshot}
                onChange={(value) =>
                  patchTransform({ customStyle: { ...customStyle, opacity: value / 100 } }, false)
                }
              />
              <div className="grid grid-cols-3 gap-1">
                <ActionButton
                  icon="align_horizontal_center"
                  label="Center H"
                  onClick={() => centerSelected('x')}
                />
                <ActionButton
                  icon="align_vertical_center"
                  label="Center V"
                  onClick={() => centerSelected('y')}
                />
                <ActionButton
                  icon="center_focus_strong"
                  label="Center"
                  onClick={() => centerSelected('both')}
                />
              </div>
            </Section>

            <Section title="Layer order" icon="layers">
              <div className="flex items-center gap-1">
                <ActionButton icon="flip_to_front" label="Front" onClick={() => bringToFront(selectedId)} />
                <ActionButton icon="file_upload" label="Forward" onClick={() => bringForward(selectedId)} />
                <ActionButton icon="file_download" label="Backward" onClick={() => sendBackward(selectedId)} />
                <ActionButton icon="flip_to_back" label="Back" onClick={() => sendToBack(selectedId)} />
                <ActionButton icon="restart_alt" label="Reset" onClick={() => resetElement(selectedId)} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                <span>z-index</span>
                <input
                  type="number"
                  value={transform?.zIndex ?? 20}
                  onChange={(event) => patchTransform({ zIndex: Number(event.target.value) || 0 })}
                  className="w-16 bg-slate-900 border border-white/10 rounded px-2 py-1 text-right font-mono text-[10px] text-slate-200 outline-none focus:border-cyan-400/50"
                />
              </div>
            </Section>

            {isText && (
              <Section title="Typography" icon="text_fields">
                <button
                  type="button"
                  onClick={() => setEditingElement(selectedId)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-400/25 text-cyan-200 text-[10px] font-bold hover:bg-cyan-500/25"
                >
                  <Icon name="edit" size={12} /> Edit text inline
                </button>
                <Field label="Font family">
                  <select
                    value={textFontFamily}
                    onChange={(event) => patchText({ fontFamily: event.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-cyan-400/50"
                  >
                    {FONTS.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Size"
                    value={Math.round(Number(textFontSize))}
                    onChange={(value) => patchText({ fontSize: Math.max(6, value) })}
                  />
                  <Field label="Weight">
                    <select
                      value={String(textFontWeight)}
                      onChange={(event) => patchText({ fontWeight: event.target.value })}
                      className="w-full bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-cyan-400/50"
                    >
                      {['300', '400', '500', '600', '700', '800', '900'].map((weight) => (
                        <option key={weight} value={weight}>
                          {weight}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Line height"
                    step={0.05}
                    value={Number(textLineHeight)}
                    onChange={(value) => patchText({ lineHeight: value })}
                  />
                  <NumberField
                    label="Tracking"
                    step={0.1}
                    value={Number(textLetterSpacing)}
                    onChange={(value) => patchText({ letterSpacing: value })}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => patchText({ fontStyle: textFontStyle === 'italic' ? 'normal' : 'italic' })}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border ${
                      textFontStyle === 'italic'
                        ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-slate-300'
                    }`}
                  >
                    Italic
                  </button>
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => patchText({ textAlign: align })}
                      className={`w-8 h-7 rounded-md flex items-center justify-center border ${
                        textAlign === align
                          ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-200'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                      title={`Align ${align}`}
                    >
                      <Icon name={`format_align_${align}`} size={13} />
                    </button>
                  ))}
                </div>
                <Field label="Text color">
                  <div className="flex gap-1.5">
                    <input
                      type="color"
                      value={textColor.startsWith('#') ? textColor : '#ffffff'}
                      onChange={(event) => patchText({ color: event.target.value })}
                      className="w-9 h-7 bg-transparent rounded cursor-pointer"
                    />
                    <input
                      value={textColor}
                      onChange={(event) => patchText({ color: event.target.value })}
                      className="flex-1 bg-slate-900 border border-white/10 rounded-md px-2 text-[10px] font-mono outline-none focus:border-cyan-400/50"
                    />
                  </div>
                </Field>
                <SliderField
                  label="Glow"
                  value={Math.round(textGlow)}
                  min={0}
                  max={36}
                  step={1}
                  suffix="px"
                  onStart={recordSnapshot}
                  onChange={(value) => patchText({ glow: value })}
                />
              </Section>
            )}

            {isImage && (
              <Section title="Image" icon="image">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-slate-200 hover:bg-white/10"
                >
                  <Icon name="upload" size={12} /> Replace image
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => uploadReplacement(event.target.files?.[0])}
                />
                <Field label="Image URL">
                  <input
                    value={custom.imageUrl || ''}
                    onChange={(event) => patchCustom({ imageUrl: event.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-[10px] font-mono outline-none focus:border-cyan-400/50"
                    placeholder="https://…"
                  />
                </Field>
                <div className="flex gap-1">
                  {(['cover', 'contain'] as const).map((fit) => (
                    <button
                      key={fit}
                      type="button"
                      onClick={() => patchCustom({ objectFit: fit })}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase border ${
                        (custom.objectFit || 'cover') === fit
                          ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-200'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      {fit}
                    </button>
                  ))}
                </div>
                <SliderField
                  label="Corner radius"
                  value={Math.round(custom.radius ?? 0)}
                  min={0}
                  max={160}
                  step={1}
                  suffix="px"
                  onStart={recordSnapshot}
                  onChange={(value) => patchCustom({ radius: value }, false)}
                />
                <SliderField
                  label="Lens blur"
                  value={Math.round(custom.blur ?? 0)}
                  min={0}
                  max={24}
                  step={1}
                  suffix="px"
                  onStart={recordSnapshot}
                  onChange={(value) => patchCustom({ blur: value }, false)}
                />
                <ToggleField
                  label="Shadow"
                  value={custom.shadow ?? false}
                  onChange={(value) => patchCustom({ shadow: value })}
                />
              </Section>
            )}

            {isShape && (
              <Section title="Shape style" icon="palette">
                <Field label="Fill">
                  <div className="flex gap-1.5">
                    <input
                      type="color"
                      value={custom.fill?.startsWith('#') ? custom.fill : '#38bdf8'}
                      onChange={(event) => patchCustom({ fill: event.target.value })}
                      className="w-9 h-7 bg-transparent rounded cursor-pointer"
                    />
                    <input
                      value={custom.fill || ''}
                      onChange={(event) => patchCustom({ fill: event.target.value })}
                      className="flex-1 bg-slate-900 border border-white/10 rounded-md px-2 text-[10px] font-mono outline-none focus:border-cyan-400/50"
                    />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Stroke"
                    value={Math.round(custom.strokeWidth ?? 0)}
                    onChange={(value) => patchCustom({ strokeWidth: Math.max(0, value) })}
                  />
                  <NumberField
                    label="Radius"
                    value={Math.round(custom.radius ?? 0)}
                    onChange={(value) => patchCustom({ radius: Math.max(0, value) })}
                  />
                </div>
                <SliderField
                  label="Glow"
                  value={Math.round(custom.glow ?? 0)}
                  min={0}
                  max={40}
                  step={1}
                  suffix="px"
                  onStart={recordSnapshot}
                  onChange={(value) => patchCustom({ glow: value }, false)}
                />
                <ToggleField
                  label="Drop shadow"
                  value={custom.shadow ?? false}
                  onChange={(value) => patchCustom({ shadow: value })}
                />
              </Section>
            )}

            {(custom?.kind === 'badge' || custom?.kind === 'text') && (
              <Section title="Content" icon="notes">
                <textarea
                  value={custom.text || ''}
                  onChange={(event) => patchCustom({ text: event.target.value })}
                  rows={3}
                  className="w-full resize-none bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-400/50"
                />
              </Section>
            )}
          </>
        ) : (
          <>
            <Section title="Add element" icon="add_box">
              <div className="grid grid-cols-3 gap-1.5">
                <AddButton icon="title" label="Text" onClick={() => addTextBox()} />
                <AddButton icon="image" label="Image" onClick={onAddImage} />
                <AddButton icon="category" label="Shapes" onClick={() => setToast('Pick a shape below')} />
              </div>
            </Section>

            <Section title="Vector library" icon="auto_awesome">
              <VectorShapesSection />
            </Section>

            <Section title="Canvas" icon="dashboard">
              <ToggleField
                label="Magnetic snapping"
                value={snapEnabled}
                onChange={(value) => setSnapEnabled(value)}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={copyAllElements}
                  className="py-1.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 hover:bg-white/10"
                >
                  Copy all
                </button>
                <button
                  type="button"
                  disabled={!clipboard}
                  onClick={() => pasteClipboard()}
                  className="py-1.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 hover:bg-white/10 disabled:opacity-40"
                >
                  Paste
                </button>
              </div>
              <button
                type="button"
                onClick={resetSlide}
                className="w-full py-1.5 rounded-md bg-rose-500/10 border border-rose-400/20 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20"
              >
                Reset slide layout
              </button>
            </Section>
          </>
        )}

        <Section title={`Layers (${layerEntries.length})`} icon="layers">
          {layerEntries.length === 0 ? (
            <p className="text-[10px] text-slate-500 py-2 text-center">
              No layers yet. Right-click the canvas to add.
            </p>
          ) : (
            <div className="space-y-0.5">
              {layerEntries.map((entry) => {
                const active = entry.id === selectedId;
                return (
                  <div
                    key={entry.id}
                    className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer border ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-400/30'
                        : 'bg-transparent border-transparent hover:bg-white/[0.06]'
                    }`}
                    onClick={() => selectElement(entry.id)}
                  >
                    <Icon
                      name={entry.custom ? KIND_ICONS[entry.custom.kind] || 'category' : 'text_fields'}
                      size={12}
                      className={active ? 'text-cyan-300' : 'text-slate-500'}
                    />
                    <span
                      className={`flex-1 truncate text-[10px] ${
                        entry.transform.isHidden ? 'line-through text-slate-600' : active ? 'text-cyan-100' : 'text-slate-300'
                      }`}
                    >
                      {ELEMENT_LABELS[entry.id] ||
                        (entry.custom ? `${entry.custom.kind} ${entry.id.slice(-3)}` : entry.id)}
                    </span>
                    <span className="text-[8px] font-mono text-slate-600">{entry.transform.zIndex}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleHidden(entry.id);
                      }}
                      className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100"
                      title={entry.transform.isHidden ? 'Show layer' : 'Hide layer'}
                    >
                      <Icon name={entry.transform.isHidden ? 'visibility' : 'visibility_off'} size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleLock(entry.id);
                      }}
                      className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100"
                      title={entry.transform.isLocked ? 'Unlock layer' : 'Lock layer'}
                    >
                      <Icon name={entry.transform.isLocked ? 'lock' : 'lock_open'} size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5 space-y-2">
    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
      <Icon name={icon} size={12} className="text-cyan-400/80" />
      {title}
    </div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <p className="text-[9px] text-slate-500 font-semibold">{label}</p>
    {children}
  </div>
);

const NumberField: React.FC<{
  label: string;
  value: number | '';
  onChange: (value: number) => void;
  step?: number;
  placeholder?: string;
}> = ({ label, value, onChange, step = 1, placeholder }) => (
  <Field label={label}>
    <input
      type="number"
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={(event) => {
        if (event.target.value === '') {
          onChange(0);
          return;
        }
        const parsed = Number(event.target.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      className="w-full bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-[10px] font-mono text-slate-200 outline-none focus:border-cyan-400/50"
    />
  </Field>
);

const SliderField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onStart?: () => void;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix = '', onStart, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[9px]">
      <span className="text-slate-500 font-semibold">{label}</span>
      <span className="font-mono text-slate-400">
        {value}
        {suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onPointerDown={onStart}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-cyan-400 cursor-pointer"
    />
  </div>
);

const ToggleField: React.FC<{ label: string; value: boolean; onChange: (value: boolean) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className="w-full flex items-center justify-between text-[10px] text-slate-300 py-0.5"
  >
    <span>{label}</span>
    <span
      className={`w-8 h-4 rounded-full p-0.5 transition-colors ${value ? 'bg-cyan-500' : 'bg-slate-700'}`}
    >
      <span
        className={`block w-3 h-3 rounded-full bg-white transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
);

const ActionButton: React.FC<{
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}> = ({ icon, label, onClick, active = false, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-md border text-[8px] font-bold transition-colors ${
      danger
        ? 'border-rose-400/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
        : active
        ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-200'
        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
    }`}
  >
    <Icon name={icon} size={13} />
    {label}
  </button>
);

const AddButton: React.FC<{ icon: string; label: string; onClick: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="aspect-square rounded-lg border border-white/10 bg-white/[0.035] hover:border-cyan-400/40 hover:bg-cyan-400/[0.07] flex flex-col items-center justify-center gap-1 text-[9px] font-bold text-slate-300"
  >
    <Icon name={icon} size={16} className="text-cyan-300" />
    {label}
  </button>
);

export default ElementInspectorPanel;
