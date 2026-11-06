import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';

/**
 * Seven controls were bare `input[type=range]` painted with `accent-color`, which meant a creator
 * could only nudge them with the mouse: no Home/End, no page steps, no announced value. Same 4px
 * track the progress bars use, with the thumb sized for a fingertip.
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  formatValue,
  label,
  tone = 'primary',
  disabled,
  className,
  onPointerDown,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** What a screen reader says instead of the raw number, e.g. "3.2 pixels". */
  formatValue?: (value: number) => string;
  label: string;
  /** The music mix level reads as a secondary control; everything else is primary. */
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
  /** The canvas history uses the first press of a drag as its undo checkpoint. */
  onPointerDown?: (event: React.PointerEvent) => void;
}) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={([next]) => onValueChange(next)}
      onPointerDown={onPointerDown}
      className={cn(
        'relative flex h-5 w-full flex-1 touch-none select-none items-center rounded-full',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-surface-3">
        <SliderPrimitive.Range
          className={cn('absolute h-full', tone === 'secondary' ? 'bg-secondary' : 'bg-primary')}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        // Radix puts role=slider and the value on the thumb, so the name belongs there too.
        aria-label={label}
        aria-valuetext={formatValue?.(value)}
        className={cn(
          'kt-focus block h-3.5 w-3.5 shrink-0 rounded-full border-2 bg-[var(--app)] shadow-[var(--shadow-1)]',
          'transition-transform duration-150 ease-out hover:scale-110 active:scale-110 focus-visible:outline-none',
          tone === 'secondary' ? 'border-secondary' : 'border-primary',
        )}
      />
    </SliderPrimitive.Root>
  );
}
