import type { CSSProperties } from 'react';

/**
 * Material Symbols Outlined icon wrapper.
 * Uses the Google Fonts webfont loaded in index.html.
 */
export function Icon({
  name,
  size = 20,
  weight = 400,
  fill = 0,
  className = '',
  style,
}: {
  name: string;
  size?: number;
  weight?: number;
  fill?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

export default Icon;
