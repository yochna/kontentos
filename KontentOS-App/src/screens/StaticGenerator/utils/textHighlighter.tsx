import React from 'react';

/**
 * Parses markdown/bracket notation [like this] or *like this* into glowing accent spans.
 * Allows creators to emphasize high-impact words and metrics across all visual cards.
 */
export function renderHighlightedText(
  text: string,
  accentColor: string,
  glowColor?: string,
  isLightMode: boolean = false
): React.ReactNode {
  if (!text) return null;

  // Match [bracketed text] or *starred text*
  const regex = /\[([^\]]+)\]|\*([^*]+)\*/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const highlightedContent = match[1] || match[2];
    parts.push(
      <span
        key={match.index}
        className="font-black relative inline-block mx-0.5 px-1 py-0.5 rounded transition-all drop-shadow-sm"
        style={{
          color: accentColor,
          textShadow: glowColor && !isLightMode ? `0 0 10px ${glowColor}` : 'none',
          backgroundColor: `${accentColor}18`,
          borderBottom: `2px solid ${accentColor}90`,
        }}
      >
        {highlightedContent}
      </span>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
