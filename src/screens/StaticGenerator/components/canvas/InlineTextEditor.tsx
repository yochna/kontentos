import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { escapeHtml, isRichHtml, sanitizeRichText } from '../../utils/richText';

export interface InlineTextStylePatch {
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  onCommit: (html: string) => void;
  onExit: () => void;
  style?: React.CSSProperties;
  multiline?: boolean;
  baseFontSize?: number;
  onFormatStyle?: (patch: InlineTextStylePatch) => void;
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

function wrapSelection(style: Partial<CSSStyleDeclaration>): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  Object.entries(style).forEach(([key, value]) => {
    if (value === undefined) return;
    span.style.setProperty(
      key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      String(value)
    );
  });
  try {
    range.surroundContents(span);
    selection.removeAllRanges();
    const next = document.createRange();
    next.selectNodeContents(span);
    selection.addRange(next);
    return true;
  } catch {
    return false;
  }
}

export const InlineTextEditor: React.FC<Props> = ({
  value,
  onChange,
  onCommit,
  onExit,
  style,
  multiline = true,
  baseFontSize = 24,
  onFormatStyle,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);
  const [scope, setScope] = useState<'complete' | number>('complete');
  const [showColors, setShowColors] = useState(false);
  const [localSize, setLocalSize] = useState(baseFontSize);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = isRichHtml(value)
      ? sanitizeRichText(value)
      : escapeHtml(value).replace(/\n/g, '<br/>');
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // The initial value is intentionally captured once when the editor mounts.
    // Re-applying it on every keystroke would reset the caret and selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const updateScope = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      if (!editor.contains(selection.anchorNode)) return;
      const text = selection.toString();
      setScope(text.length > 0 ? text.length : 'complete');
    };
    document.addEventListener('selectionchange', updateScope);
    return () => document.removeEventListener('selectionchange', updateScope);
  }, []);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const html = editorRef.current?.innerHTML || '';
    onCommit(html);
    onExit();
  };

  const applyStyle = (patch: InlineTextStylePatch) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    const hasSelection =
      selection && selection.rangeCount > 0 && !selection.isCollapsed && editor.contains(selection.anchorNode);

    const css: Record<string, string> = {};
    if (patch.color) css.color = patch.color;
    if (patch.fontSize) css.fontSize = `${patch.fontSize}px`;
    if (patch.fontWeight) css.fontWeight = String(patch.fontWeight);
    if (patch.fontStyle) css.fontStyle = patch.fontStyle;

    if (hasSelection && Object.keys(css).length > 0) {
      wrapSelection(css as Partial<CSSStyleDeclaration>);
      onChange(editor.innerHTML);
    } else {
      onFormatStyle?.(patch);
    }
  };

  const changeSize = (delta: number) => {
    const next = Math.max(10, Math.min(120, localSize + delta));
    setLocalSize(next);
    applyStyle({ fontSize: next });
  };

  return (
    <div
      className="absolute inset-0 z-[70]"
      data-canvas-ui="true"
      data-canvas-editor="true"
      data-canvas-no-drag="true"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {/* Floating rich formatting bar */}
      <div className="absolute -top-[92px] left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-slate-900/95 border border-white/20 shadow-2xl backdrop-blur-xl whitespace-nowrap">
        <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 text-[9px] font-bold uppercase tracking-wider">
          {scope === 'complete' ? 'Complete' : `${scope} Letters`}
        </span>

        <div className="relative">
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setShowColors((v) => !v)}
            className="w-6 h-6 rounded-md border border-white/20 flex items-center justify-center text-white hover:bg-white/10"
            title="Text color"
          >
            <span className="w-3 h-3 rounded-full" style={{ background: style?.color || '#ffffff' }} />
          </button>
          {showColors && (
            <div className="absolute top-8 left-0 z-[90] grid grid-cols-5 gap-1.5 p-2 rounded-lg bg-slate-900 border border-white/20 shadow-2xl">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    applyStyle({ color });
                    setShowColors(false);
                  }}
                  className="w-5 h-5 rounded border border-white/25"
                  style={{ background: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={style?.color?.toString() || '#ffffff'}
                onChange={(e) => applyStyle({ color: e.target.value })}
                className="col-span-5 w-full h-6 rounded cursor-pointer bg-transparent"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => changeSize(-2)}
          className="w-6 h-6 rounded-md text-white hover:bg-white/10 flex items-center justify-center"
          title="Decrease font size"
        >
          <Icon name="remove" size={14} />
        </button>
        <span className="text-[10px] font-mono text-slate-300 w-7 text-center">{localSize}</span>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => changeSize(2)}
          className="w-6 h-6 rounded-md text-white hover:bg-white/10 flex items-center justify-center"
          title="Increase font size"
        >
          <Icon name="add" size={14} />
        </button>

        <span className="w-px h-4 bg-white/15 mx-0.5" />

        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ fontWeight: 800 })}
          className="w-6 h-6 rounded-md text-white hover:bg-white/10 flex items-center justify-center font-black text-xs"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ fontStyle: 'italic' })}
          className="w-6 h-6 rounded-md text-white hover:bg-white/10 flex items-center justify-center italic text-xs"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            const editor = editorRef.current;
            if (!editor) return;
            onChange(editor.innerHTML);
            onFormatStyle?.({
              fontSize: baseFontSize,
              fontWeight: 'normal',
              fontStyle: 'normal',
            });
          }}
          className="w-6 h-6 rounded-md text-white hover:bg-white/10 flex items-center justify-center"
          title="Clear formatting"
        >
          <Icon name="format_clear" size={13} />
        </button>

        <span className="w-px h-4 bg-white/15 mx-0.5" />

        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={commit}
          className="px-2 h-6 rounded-md bg-cyan-500 text-slate-950 font-bold text-[10px] hover:bg-cyan-400"
        >
          Done
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="w-full h-full outline-none overflow-hidden cursor-text"
        style={{
          ...style,
          fontSize: style?.fontSize,
          lineHeight: style?.lineHeight,
          letterSpacing: style?.letterSpacing,
          color: style?.color,
          textAlign: style?.textAlign,
          whiteSpace: 'pre-wrap',
          background: 'transparent',
        }}
        onInput={(event) => onChange((event.target as HTMLDivElement).innerHTML)}
        onBlur={() => {
          window.setTimeout(() => {
            const active = document.activeElement;
            if (active && active.closest('[data-canvas-ui="true"]')) return;
            commit();
          }, 120);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            commit();
            return;
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commit();
            return;
          }
          if (event.key === 'Enter' && !multiline && !event.shiftKey) {
            event.preventDefault();
            commit();
            return;
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
};

export default InlineTextEditor;
