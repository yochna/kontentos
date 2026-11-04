import type * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/cn';

type Variant = 'segment' | 'solid' | 'none';

// Radix's Root props are a union keyed on `type`; narrowing to the single member keeps `value` a string.
type SingleProps = Extract<
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>,
  { type: 'single' }
>;

/**
 * Segmented filters — the Analytics range, the bench's ledger chips, the shape and shelf filters — are
 * not tabs: nothing below them swaps panels, the same region is re-queried. They still need one keyboard
 * contract and one pressed state, and a `<button>` per option gave neither. `variant` carries the weights
 * the app really uses; 'none' keeps the semantics and lets a station bring its own chip geometry.
 */
export function ToggleGroup({
  className,
  variant = 'segment',
  ...rest
}: Omit<SingleProps, 'type'> & { variant?: Variant }) {
  return (
    <ToggleGroupPrimitive.Root
      {...rest}
      type="single"
      role="group"
      className={cn(
        'flex items-center',
        variant === 'segment' && 'gap-0.5 rounded-btn bg-surface-3 p-0.5',
        variant === 'solid' && 'gap-0.5 rounded-btn border border-line bg-surface p-1 shadow-xs',
        variant === 'none' && 'gap-1',
        className,
      )}
    />
  );
}

export function ToggleGroupItem({
  className,
  variant = 'segment',
  ...rest
}: React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & { variant?: Variant }) {
  return (
    <ToggleGroupPrimitive.Item
      {...rest}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-btn transition-colors duration-150 kt-focus',
        'text-ink-muted hover:text-ink disabled:pointer-events-none disabled:opacity-50',
        variant !== 'none' && 'text-[12.5px] font-semibold',
        variant === 'segment' &&
          'px-2.5 py-1 data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[var(--shadow-1)]',
        variant === 'solid' &&
          'px-3 py-1 data-[state=on]:bg-primary data-[state=on]:text-on-primary data-[state=on]:shadow-xs',
        className,
      )}
    />
  );
}
