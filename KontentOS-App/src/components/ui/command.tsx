import type * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/cn';
import { Dialog, DialogContent, DialogTitle } from './dialog';

/**
 * The deck is the bench's fastest way to a station, and it was 199 lines of hand-rolled typeahead: one
 * wrapping index, no `aria-activedescendant`, and a match on the raw label only. cmdk scores the input
 * against the whole row (title, keywords, group), keeps the selection in view, and speaks listbox
 * semantics, so the same keystrokes work under a screen reader.
 */
export function Command({ className, ...rest }: React.ComponentPropsWithoutRef<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      {...rest}
      className={cn('flex h-full w-full flex-col overflow-hidden bg-surface', className)}
    />
  );
}

export function CommandInput({
  className,
  trailing,
  ...rest
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
  /** The keycap that names the way out, so the field does not have to be discovered. */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4">
      <Icon name="search" size={18} className="shrink-0 text-ink-dim" />
      <CommandPrimitive.Input
        {...rest}
        className={cn(
          'h-12 w-full min-w-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-dim',
          className,
        )}
      />
      {trailing}
    </div>
  );
}

export function CommandList({ className, ...rest }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      {...rest}
      className={cn('max-h-[min(24rem,50vh)] overflow-y-auto overflow-x-hidden p-1.5', className)}
    />
  );
}

export function CommandEmpty({ className, ...rest }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      {...rest}
      className={cn('py-8 text-center text-[12.5px] text-ink-muted', className)}
    />
  );
}

export function CommandGroup({ className, ...rest }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      {...rest}
      /* cmdk renders the group label itself; it is wayfinding, so it wears the same mono micro-label
         the rest of the bench uses instead of a second heading style. */
      className={cn(
        'p-0 text-ink',
        '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5',
        '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:[font-size:10px]',
        '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:[letter-spacing:0.14em] [&_[cmdk-group-heading]]:text-ink-dim',
        '[&:first-child_[cmdk-group-heading]]:pt-1.5',
        className,
      )}
    />
  );
}

export function CommandSeparator({ className, ...rest }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator {...rest} className={cn('-mx-1 h-px bg-line', className)} />;
}

export function CommandItem({ className, ...rest }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      {...rest}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-btn px-2.5 py-2 text-[12.5px] text-ink-muted outline-none',
        'data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink data-[disabled=true]:opacity-40',
        className,
      )}
    />
  );
}

export function CommandShortcut({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        'ml-auto flex items-center gap-1 font-mono text-[11px] text-ink-dim',
        className,
      )}
    />
  );
}

/**
 * The palette is a dialog first, so the portal, the trap, Escape and the focus handoff come from the
 * same shell every other panel in the bench uses — it only sits higher on the screen, so the cut rail
 * stays readable while you search.
 */
export function CommandDialog({
  children,
  title,
  ...rest
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> & { title: string }) {
  return (
    <Dialog {...rest}>
      {/* A drag that starts in the deck must not fall through to the bench's drop-anywhere intake. */}
      <DialogContent
        hideClose
        className="top-[15vh] translate-y-0 max-w-xl overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
