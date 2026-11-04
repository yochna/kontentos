import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

/**
 * Settings had the bench's only `role="switch"`; the editor's equivalent had none, and both drew the
 * knob by hand. One geometry (the 44×24 track Settings already used) with the state on the element.
 */
export function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  'aria-label': ariaLabel,
}: {
  className?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-line transition-colors duration-150 kt-focus',
        'bg-surface-3 data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-[var(--app)] shadow-[var(--shadow-1)] transition-transform duration-200 ease-out',
          'translate-x-0.5 data-[state=checked]:translate-x-[22px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
