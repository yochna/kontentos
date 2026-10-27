import React from 'react';
import type { CanvasElementId } from '../../../../types/canvasScene';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { isRichHtml, sanitizeRichText } from '../../utils/richText';
import { TransformableElement } from './TransformableElement';
import type { InlineTextStylePatch } from './InlineTextEditor';

interface Props {
  id: CanvasElementId;
  text: string;
  onTextChange: (value: string) => void;
  as?: 'h1' | 'h2' | 'p' | 'div' | 'blockquote' | 'span';
  className?: string;
  style?: React.CSSProperties;
  renderContent?: (text: string) => React.ReactNode;
  multiline?: boolean;
}

/**
 * Semantic template text element wired to the shared scene graph. Keeps the
 * template's typography as the base style while allowing scene-level overrides
 * and inline rich-text editing.
 */
export const CanvasTextElement: React.FC<Props> = ({
  id,
  text,
  onTextChange,
  as = 'div',
  className = '',
  style,
  renderContent,
  multiline = true,
}) => {
  const transform = useCanvasInteraction((s) => (s.scenes[s.activeSlide] || {})[id]);
  const updateElementTransform = useCanvasInteraction((s) => s.updateElementTransform);
  const setEditingElement = useCanvasInteraction((s) => s.setEditingElement);

  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(transform?.customStyle as React.CSSProperties),
  };

  const handleFormat = (patch: InlineTextStylePatch) => {
    const next: Record<string, string | number> = { ...(transform?.customStyle || {}) };
    if (patch.fontSize !== undefined) next.fontSize = `${patch.fontSize}px`;
    if (patch.fontWeight !== undefined) next.fontWeight = patch.fontWeight;
    if (patch.fontStyle !== undefined) next.fontStyle = patch.fontStyle;
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.textAlign !== undefined) next.textAlign = patch.textAlign;
    updateElementTransform(id, { customStyle: next }, true);
  };

  const Tag = as as React.ElementType;
  const content = isRichHtml(text) ? (
    <span dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }} />
  ) : renderContent ? (
    renderContent(text)
  ) : (
    text
  );

  return (
    <TransformableElement
      id={id}
      transform={transform}
      textContent={text}
      textStyle={mergedStyle}
      textMultiline={multiline}
      onTextChange={onTextChange}
      onFormatTextStyle={handleFormat}
      onDoubleClick={() => setEditingElement(id)}
    >
      <Tag className={className} style={mergedStyle}>
        {content}
      </Tag>
    </TransformableElement>
  );
};

export default CanvasTextElement;
