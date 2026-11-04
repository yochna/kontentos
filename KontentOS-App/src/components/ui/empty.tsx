import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';

/**
 * Ten screens hand-rolled their own "nothing here yet" block. The bench had no shared ErrorState
 * either, so a store failure printed nothing at all. Both live here now, and the copy they take in
 * is written by the caller: an empty state that does not say what to do next is decoration.
 */
export function EmptyState({
  icon = 'inbox',
  title,
  body,
  action,
  className,
  compact = false,
}: {
  icon?: string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-2 px-4 py-7' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <span
        className={cn(
          'grid place-items-center rounded-full border border-line bg-surface-2 text-ink-muted',
          compact ? 'h-10 w-10' : 'h-14 w-14',
        )}
      >
        <Icon name={icon} size={compact ? 18 : 24} />
      </span>
      <h3 className={cn('font-display text-ink', compact ? 'text-[15px]' : 'text-[19px]')}>{title}</h3>
      {body ? (
        <p className={cn('max-w-[38ch] text-ink-muted', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>{body}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** A write or a load that did not land. `retry` is optional; say so when the fix is on the user. */
export function ErrorState({
  title = 'That did not go through',
  body,
  retry,
  className,
}: {
  title?: string;
  body: ReactNode;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-2 rounded-card border border-danger/40 bg-surface px-4 py-3.5',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon name="error" size={18} className="mt-px shrink-0 text-danger" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{title}</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
        </div>
      </div>
      {retry ? (
        <Button size="sm" variant="secondary" icon="refresh" onClick={retry} className="self-end">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
