import type * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Icon } from '@/lib/icons';
import { cn } from '@/lib/cn';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

/**
 * Seventeen `<select>`s were OS-drawn, so the same choice looked like Windows chrome in one panel and
 * like the bench in another — and one of them had no focus style at all. The trigger keeps the bench's
 * input recipe; the list is this app's own surface, scrollable and keyboard-navigable.
 */
export function SelectTrigger({
  className,
  children,
  size = 'md',
  ...rest
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'md' }) {
  return (
    <SelectPrimitive.Trigger
      {...rest}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-btn border border-line bg-surface text-left text-ink',
        'transition-colors duration-150 hover:border-line-strong kt-focus',
        'data-[placeholder]:text-ink-dim disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-3 py-2 text-[13.5px]',
        className,
      )}
    >
      <SelectPrimitive.Value>{children}</SelectPrimitive.Value>
      <SelectPrimitive.Icon asChild>
        <Icon name="expand_more" size={18} className="shrink-0 text-ink-dim" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...rest
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        collisionPadding={8}
        className={cn(
          'kt-pop z-[110] min-w-[8rem] max-h-[min(22rem,calc(100vh-3rem))] overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-2)]',
          position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
          className,
        )}
        {...rest}
      >
        <SelectScrollUp />
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectScrollDown />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function scrollClass(position: 'top' | 'bottom') {
  return cn(
    'flex h-6 items-center justify-center bg-surface text-ink-dim hover:bg-surface-2',
    position === 'top' ? 'top-0' : 'bottom-0',
  );
}

function SelectScrollUp() {
  return (
    <SelectPrimitive.ScrollUpButton className={scrollClass('top')}>
      <Icon name="expand_less" size={16} />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDown() {
  return (
    <SelectPrimitive.ScrollDownButton className={scrollClass('bottom')}>
      <Icon name="expand_more" size={16} />
    </SelectPrimitive.ScrollDownButton>
  );
}

export function SelectItem({
  className,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      {...rest}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-btn py-1.5 pl-7 pr-2 text-[12.5px] text-ink-muted outline-none',
        'data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-primary">
        <Icon name="check" size={15} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...rest }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      {...rest}
      className={cn('px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim', className)}
    />
  );
}

export function SelectSeparator({ className, ...rest }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator {...rest} className={cn('my-1 h-px bg-line', className)} />;
}
