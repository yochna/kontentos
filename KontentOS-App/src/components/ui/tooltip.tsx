import type * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * Controls used to explain themselves with a `title=` attribute: no keyboard focus, no delay control,
 * browser-styled, and impossible to put the cut ledger's four steps in. Same information, rendered by
 * this app, shown on keyboard focus as well as on hover. One `TooltipProvider` at the root owns the
 * timing so hovering across a strip of controls doesn't re-arm the delay every time.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delay,
  ...inherited
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  delay?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'content' | 'align'> & {
    ref?: React.Ref<HTMLElement>;
  }) {
  // Some controls only have something to explain in one state, so an empty tooltip is a real case.
  if (!content) return <Slot {...inherited}>{children}</Slot>;

  return (
    <TooltipRoot delayDuration={delay}>
      {/* An outer `asChild` trigger hands its handlers and ref to its child. When that child is this
          Tooltip rather than the control itself, Slot passes them on instead of dropping them. */}
      <TooltipTrigger asChild>
        <Slot {...inherited}>{children}</Slot>
      </TooltipTrigger>
      <TooltipPrimitive.Portal>
        {/* No arrow: it cannot carry the panel's hairline border, and a borderless tongue on a
            bordered panel is the kind of almost-right detail that reads as a template. */}
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={7}
          collisionPadding={8}
          className={cn(
            'kt-pop z-[110] max-w-[18rem] rounded-btn border border-line bg-surface-2 px-2.5 py-1.5',
            'text-[12px] leading-relaxed text-ink shadow-[var(--shadow-2)]',
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipRoot>
  );
}
