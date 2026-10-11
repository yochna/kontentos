import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { thumbGradient } from '@/data/mock';

/* ---------------------------------- Button ---------------------------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'soft';
type BtnSize = 'sm' | 'md';

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-btn font-body font-semibold transition-colors kt-focus cursor-pointer select-none whitespace-nowrap';

const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-[var(--shadow-1)]',
  secondary: 'bg-surface text-ink border border-line hover:bg-app hover:border-ink-muted',
  ghost: 'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-2',
  soft: 'bg-primary-soft text-primary hover:bg-secondary-soft',
};

const btnSizes: Record<BtnSize, string> = {
  sm: 'text-[13px] px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: string;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
}

export function IconButton({
  name,
  label,
  size = 20,
  className = '',
  type = 'button',
  ...rest
}: { name: string; label: string; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors kt-focus ${className}`}
      {...rest}
    >
      <Icon name={name} size={size} />
    </button>
  );
}

/* ----------------------------------- Card ----------------------------------- */

export function Card({
  children,
  className = '',
  hover = false,
  onClick,
}: {
  children?: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-line rounded-card shadow-[var(--shadow-1)] ${
        hover ? 'transition-all hover:shadow-[var(--shadow-2)] hover:border-line-strong' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------ Chips & Badges ------------------------------ */

export function Chip({
  children,
  active = false,
  icon,
  count,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  icon?: string;
  count?: number | string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition-colors kt-focus ${
        active
          ? 'bg-primary text-on-primary border-primary'
          : 'bg-surface text-ink-muted border-line hover:border-line-strong hover:text-ink'
      }`}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
      {count !== undefined && (
        <span className={active ? 'text-on-primary/80' : 'text-ink-dim'}>({count})</span>
      )}
    </button>
  );
}

const toneMap: Record<string, string> = {
  primary: 'bg-primary-soft text-primary border-primary/25',
  secondary: 'bg-secondary-soft text-secondary border-secondary/25',
  tertiary: 'bg-tertiary-soft text-tertiary border-tertiary/30',
  neutral: 'bg-surface-2 text-ink-muted border-line',
  success: 'bg-primary-soft text-success border-success/25',
};

export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: keyof typeof toneMap | string;
  icon?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
        toneMap[tone] || toneMap.neutral
      }`}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        toneMap[tone] || toneMap.neutral
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

/* --------------------------------- Headings --------------------------------- */

export function Eyebrow({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <div className="kt-eyebrow flex items-center gap-2">
      {icon && <Icon name={icon} size={14} />}
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <h2 className="font-display text-[26px] leading-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

/* ---------------------------------- Thumb ----------------------------------- */

export function Thumb({
  k = 'a',
  className = '',
  children,
  aspect = 'aspect-video',
}: {
  k?: string;
  className?: string;
  children?: ReactNode;
  aspect?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-t-card ${aspect} ${className}`}
      style={{ background: thumbGradient[k] || thumbGradient.a }}
    >
      <div className="absolute inset-0 opacity-[0.14] [background-image:radial-gradient(circle_at_20%_20%,#fff_1px,transparent_1px)] [background-size:14px_14px]" />
      {children}
    </div>
  );
}

/* --------------------------------- Progress --------------------------------- */

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
      <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}

/* --------------------------------- Divider ---------------------------------- */

export function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px w-full bg-line ${className}`} />;
}
