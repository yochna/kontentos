import type * as React from 'react';
import { useId } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/cn';

/**
 * The bench had seven different input recipes, and the most common one ended in `outline-none` with no
 * replacement ring — which is how a form field ends up with no keyboard focus indicator at all. One
 * recipe here, focus included, plus a wrapper that binds the label and names the error to the field so
 * a screen reader says them in the same breath.
 */
export const controlClass =
  'w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-dim ' +
  'transition-colors duration-150 hover:border-line-strong kt-focus ' +
  'disabled:cursor-not-allowed disabled:opacity-60 read-only:opacity-70';

export function Input({ className, ...rest }: React.ComponentPropsWithoutRef<'input'>) {
  return <input {...rest} className={cn(controlClass, className)} />;
}

export function Textarea({ className, ...rest }: React.ComponentPropsWithoutRef<'textarea'>) {
  return <textarea {...rest} className={cn(controlClass, 'resize-y leading-relaxed', className)} />;
}

export function Label({ className, children, htmlFor, ...rest }: React.ComponentPropsWithoutRef<'label'>) {
  return (
    <LabelPrimitive.Root
      htmlFor={htmlFor}
      className={cn('block text-[12px] font-semibold text-ink-muted', className)}
      {...rest}
    >
      {children}
    </LabelPrimitive.Root>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (ids: { id: string; describedBy?: string }) => React.ReactNode;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, describedBy: errorId ?? hintId })}
      {error ? (
        <p id={errorId} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[12px] text-ink-dim">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Separator({
  className,
  orientation = 'horizontal',
  ...rest
}: React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={orientation === 'horizontal'}
      className={cn(
        'shrink-0 bg-line',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...rest}
    />
  );
}
