import type * as React from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { cn } from '@/lib/cn';

export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

/**
 * A hover card is the only preview that costs nothing to dismiss, and Radix keeps it off touch: a tap
 * fires pointer events that would otherwise strand the card open under a thumb.
 */
export function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 8,
  ...rest
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'kt-pop z-[110] w-max max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-2.5',
          'shadow-[var(--shadow-2)] outline-none',
          className,
        )}
        {...rest}
      />
    </HoverCardPrimitive.Portal>
  );
}
