import { useRef } from 'react';
import type * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/cn';

/**
 * The bench already had seventeen hand-rolled overlays: seven said `role="dialog"`, nine listened for
 * Escape, and none of them moved focus into the panel or gave it back afterwards. Radix does all of
 * that, portals the panel out of the `overflow-y-auto` stage that used to clip it, and locks the
 * scroll behind a refcount of its own.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Overlay
      className={cn('kt-overlay fixed inset-0 z-[80] bg-[var(--scrim)]', className)}
    />
  );
}

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** A dialog is a task, not a page: 42rem is as wide as a bench panel gets before it reads as a wall. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideClose?: boolean;
  /**
   * 'right' hinges the same trapped panel on the viewport edge instead of floating it in the middle.
   * Drawers were the second hand-rolled family: same Escape bug, same lost focus, different geometry.
   */
  placement?: 'center' | 'right';
};

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

/**
 * Nothing in this app renders a DialogTrigger: panels open from ⌘K, from a row deep inside a station or
 * from a toolbar button, so Radix has nowhere to hand focus back to and Escape drops it to <body> — the
 * next Tab then starts at the top of the document. Capture what had focus on the way in and give it
 * back on the way out, unless that element has since unmounted.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (event: Event) => {
      opener.current = document.activeElement as HTMLElement | null;
    },
    onCloseAutoFocus: (event: Event) => {
      const back = opener.current;
      opener.current = null;
      if (back?.isConnected) back.focus();
    },
  };
}

export function DialogContent({
  className,
  children,
  size = 'md',
  hideClose = false,
  placement = 'center',
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...rest
}: ContentProps) {
  const centered = placement === 'center';
  const returnFocus = useReturnFocus();
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        /* A panel with no description line would otherwise be announced without one; a caller that
           has one passes aria-describedby through and this default is replaced. */
        aria-describedby={undefined}
        {...rest}
        onOpenAutoFocus={(e) => {
          returnFocus.onOpenAutoFocus(e);
          onOpenAutoFocus?.(e);
        }}
        onCloseAutoFocus={(e) => {
          returnFocus.onCloseAutoFocus(e);
          onCloseAutoFocus?.(e);
        }}
        className={cn(
          'fixed z-[90] border border-line bg-surface shadow-[var(--shadow-2)]',
          centered
            ? cn(
                'kt-dialog left-1/2 top-1/2 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
                'max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-card',
                widths[size],
              )
            : cn(
                'kt-drawer right-0 top-0 flex h-dvh w-[min(30rem,100vw)] flex-col',
                'overflow-hidden border-y-0 border-r-0 rounded-none',
              ),
          className,
        )}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-btn text-ink-dim transition-colors duration-150 hover:bg-surface-2 hover:text-ink kt-focus"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 pr-10 pb-1', className)} {...rest} />;
}

export function DialogFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5', className)}
      {...rest}
    />
  );
}

export function DialogTitle({ className, ...rest }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-[15px] font-semibold tracking-[-0.02em] text-ink', className)}
      {...rest}
    />
  );
}

export function DialogDescription({
  className,
  ...rest
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-[12.5px] text-ink-muted', className)} {...rest} />;
}
