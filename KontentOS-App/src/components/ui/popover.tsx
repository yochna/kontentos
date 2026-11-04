import type * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/**
 * The canvas toolbar used `absolute` panels inside an `overflow-hidden` frame, so it clamped its own
 * position by hand and flipped when the frame got near the top of the window. A popover is portaled and
 * placed by the same code for every surface, which is also what makes Escape and outside-click work.
 */
export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 6,
  ...rest
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'kt-pop z-[110] w-max max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-3',
          'shadow-[var(--shadow-2)] outline-none',
          className,
        )}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  );
}
