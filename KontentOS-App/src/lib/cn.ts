import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind classes in this app are written by hand in dozens of screens and then merged with whatever
 * a caller passed in. Without a merge step `className="bg-surface-2"` on a component whose base already
 * says `bg-surface` leaves both in the class list and the winner is decided by stylesheet order — which
 * is why some panels in the bench look themed by accident. twMerge collapses the conflict first.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
