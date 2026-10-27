import React from 'react';
import type { CanvasCustomElement } from '../../../../types/canvasScene';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { CustomShapeRenderer } from './CustomShapeRenderer';
import { TransformableElement } from './TransformableElement';
import type { InlineTextStylePatch } from './InlineTextEditor';

interface Props {
  element: CanvasCustomElement;
}

export const CanvasCustomElementView: React.FC<Props> = ({ element }) => {
  const transform = useCanvasInteraction((s) => (s.scenes[s.activeSlide] || {})[element.id]);
  const updateCustomElement = useCanvasInteraction((s) => s.updateCustomElement);
  const setEditingElement = useCanvasInteraction((s) => s.setEditingElement);

  const isText = element.kind === 'text';
  const width = transform?.width ?? 200;
  const height = transform?.height ?? 100;
  const textStyle: React.CSSProperties = {
    color: element.color || '#ffffff',
    fontSize: `${element.fontSize ?? 26}px`,
    fontWeight: element.fontWeight ?? 700,
    fontStyle: element.fontStyle ?? 'normal',
    fontFamily: element.fontFamily || 'inherit',
    lineHeight: element.lineHeight ?? 1.2,
    letterSpacing: `${element.letterSpacing ?? 0}px`,
    textAlign: element.textAlign ?? 'center',
    textShadow:
      (element.glow ?? 0) > 0
        ? `0 0 ${element.glow}px ${element.color || '#ffffff'}`
        : '0 2px 12px rgba(0,0,0,0.35)',
    whiteSpace: 'pre-wrap',
  };

  const handleFormat = (patch: InlineTextStylePatch) => {
    updateCustomElement(
      element.id,
      {
        ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
        ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {}),
        ...(patch.fontStyle !== undefined ? { fontStyle: patch.fontStyle } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.textAlign !== undefined ? { textAlign: patch.textAlign } : {}),
      },
      true
    );
  };

  return (
    <TransformableElement
      id={element.id}
      transform={transform || { id: element.id, x: 0, y: 0, width, height, zIndex: 20 }}
      isCustom
      textContent={isText ? element.text || '' : undefined}
      textStyle={textStyle}
      textMultiline
      onTextChange={(value) => updateCustomElement(element.id, { text: value })}
      onFormatTextStyle={handleFormat}
      onDoubleClick={() => {
        if (isText) setEditingElement(element.id);
      }}
    >
      <CustomShapeRenderer element={element} width={width} height={height} />
    </TransformableElement>
  );
};

export default CanvasCustomElementView;
