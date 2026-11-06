import type * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/cn';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
/**
 * Where a menu opened by a right-click lands. This Radix build ships no Anchor, so the trigger
 * slot stands in for one: an unfocusable 1x1 point at the cursor that the content positions
 * against and that can never be clicked, so the only way to open it is the gesture that put it
 * there.
 */
export function DropdownMenuAnchor({ x, y }: { x: number; y: number }) {
  return (
    <DropdownMenuPrimitive.Trigger asChild>
      <span aria-hidden className="pointer-events-none fixed h-px w-px" style={{ left: x, top: y }} />
    </DropdownMenuPrimitive.Trigger>
  );
}
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const itemClass =
  'flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-[12.5px] text-ink-muted ' +
  'outline-none transition-colors duration-100 data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...rest
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'kt-pop z-[110] max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[10.5rem] overflow-x-hidden overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-[var(--shadow-2)]',
          className,
        )}
        {...rest}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone = 'default',
  ...rest
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { tone?: 'default' | 'danger' }) {
  return (
    <DropdownMenuPrimitive.Item
      {...rest}
      className={cn(
        itemClass,
        tone === 'danger' && 'text-danger-ink data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger-ink',
        className,
      )}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem {...rest} className={cn(itemClass, 'relative pl-7', className)}>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator className="text-primary">
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M2.5 6.5 5 9l4.5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...rest }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      {...rest}
      className={cn('px-2 pb-1 pt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim', className)}
    />
  );
}

export function DropdownMenuSeparator({ className, ...rest }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator {...rest} className={cn('my-1 h-px bg-line', className)} />;
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      {...rest}
      className={cn(itemClass, 'data-[state=open]:bg-surface-2 data-[state=open]:text-ink', className)}
    >
      {children}
      <Icon name="chevron_right" size={14} className="ml-auto text-ink-dim" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...rest
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      {...rest}
      collisionPadding={8}
      className={cn(
        'kt-pop z-[115] max-h-[var(--radix-dropdown-menu-sub-content-available-height)] min-w-[10.5rem] overflow-x-hidden overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-[var(--shadow-2)]',
        className,
      )}
    />
  );
}

export function DropdownMenuShortcut({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...rest} className={cn('ml-auto font-mono text-[11px] text-ink-dim', className)} />;
}
