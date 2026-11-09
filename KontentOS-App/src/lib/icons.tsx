import type { CSSProperties } from 'react';

/**
 * Material Symbols Outlined icon wrapper. The faces are vendored under /fonts and declared in
 * src/fonts.css: weight selects the instance, FILL is the one axis still variable.
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
        fontWeight: weight,
        fontVariationSettings: `'FILL' ${fill}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

export default Icon;
