import type * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;

/**
 * Thirteen tab bars were divs with an active class, and the repo had zero `role="tablist"` in it: a
 * screen reader heard a pile of buttons, and ArrowLeft/Right did nothing. Three visual weights because
 * the bench really does have three — a rail of stations, a segmented range picker, and a vertical
 * settings nav — but one set of semantics and one keyboard contract for all of them.
 */
export function TabsList({
  className,
  variant = 'line',
  ...rest
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: 'line' | 'pill' | 'stack' }) {
  return (
    <TabsPrimitive.List
      {...rest}
      className={cn(
        'flex items-center gap-1',
        variant === 'line' && 'border-b border-line',
        variant === 'pill' && 'gap-0.5 rounded-btn bg-surface-3 p-0.5',
        variant === 'stack' && 'flex-col items-stretch gap-0.5',
        className,
      )}
    />
  );
}

export function TabsTrigger({
  className,
  variant = 'line',
  ...rest
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { variant?: 'line' | 'pill' | 'stack' }) {
  return (
    <TabsPrimitive.Trigger
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold transition-colors duration-150 kt-focus',
        'data-[state=inactive]:text-ink-muted data-[state=inactive]:hover:text-ink',
        'data-[state=active]:text-ink cursor-pointer',
        variant === 'line' &&
          'relative -mb-px rounded-t-btn px-3 py-2 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_0_var(--primary)]',
        variant === 'pill' && 'rounded-[5px] px-2.5 py-1 data-[state=active]:bg-surface data-[state=active]:shadow-[var(--shadow-1)]',
        variant === 'stack' && 'rounded-btn px-2.5 py-2 text-left data-[state=active]:bg-primary-soft data-[state=active]:text-primary',
        className,
      )}
    />
  );
}

export function TabsContent({ className, ...rest }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content {...rest} className={cn('mt-4 outline-none', className)} />;
}
