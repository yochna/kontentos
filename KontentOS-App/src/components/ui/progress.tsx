import { useEffect, useRef } from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/cn';

/**
 * The bar was two plain divs, so nothing told a screen reader how far along an export was. Radix puts
 * role=progressbar and aria-valuenow on the element; the grow-from-zero on mount is the one behaviour
 * the hand-rolled version got right, so it stays.
 */
export function Progress({
  value,
  live = false,
  label,
  trackClassName = 'h-1.5 bg-surface-3',
  barClassName = 'bg-primary',
}: {
  value: number;
  live?: boolean;
  /** What the bar means, e.g. "Export". Omitted it falls back to the bare percentage. */
  label?: string;
  trackClassName?: string;
  barClassName?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  // Grow from zero on mount. The reflow read gives the transition a committed start value;
  // later `value` changes arrive as a plain inline-style update and animate on their own.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const target = `${value}%`;
    el.style.width = '0%';
    void el.offsetWidth;
    el.style.width = target;
    // Mount-only: re-running would rewind a bar that is already tracking real progress.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ProgressPrimitive.Root
      value={Math.round(value)}
      aria-label={label}
      className={cn(trackClassName, 'w-full overflow-hidden rounded-full')}
    >
      <ProgressPrimitive.Indicator
        ref={barRef}
        style={{ width: `${value}%` }}
        className={cn('kt-bar h-full rounded-full', barClassName, live && 'kt-bar--live')}
      />
    </ProgressPrimitive.Root>
  );
}
