import type * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/cn';
import { useReturnFocus } from './dialog';

/**
 * A clip delete is unrecoverable — the row goes, and so do its captions and cuts. Two of those calls
 * were `window.confirm()`, which is the browser's chrome, not this product's, and cannot name what is
 * about to be lost. This is the same shell as Dialog with a tone the danger token can carry.
 */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export function AlertDialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...rest
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>) {
  const returnFocus = useReturnFocus();
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="kt-overlay fixed inset-0 z-[85] bg-[var(--scrim)]" />
      <AlertDialogPrimitive.Content
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
          'kt-dialog fixed left-1/2 top-1/2 z-[95] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2',
          'rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-2)]',
          className,
        )}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({ className, ...rest }: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-danger" />
      <AlertDialogPrimitive.Title className={cn('font-display text-[14px] font-semibold text-ink', className)} {...rest} />
    </div>
  );
}

export function AlertDialogDescription({
  className,
  ...rest
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description className={cn('mt-2 pl-[27px] text-[12.5px] leading-relaxed text-ink-muted', className)} {...rest} />
  );
}

export function AlertDialogFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...rest} />;
}
