import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Icon } from '@/lib/icons';
import { thumbGradient } from '@/data/mock';

/* ----------------------------- motion helpers ----------------------------- */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

type RevealVariant = 'up' | 'scale' | 'fade' | 'left';

/**
 * Reveals an element the first time it scrolls into view.
 * Spread the returned `ref`/`className`/`style` onto the element you want to animate in.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(delay = 0, variant: RevealVariant = 'up') {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
    );
    io.observe(el);
    // A background tab suspends IntersectionObserver delivery; without this the element
    // would stay at opacity 0 until the tab is focused again.
    const failSafe = window.setTimeout(() => setShown(true), 1600);
    return () => {
      io.disconnect();
      window.clearTimeout(failSafe);
    };
  }, []);

  return {
    ref,
    className: `kt-reveal kt-reveal--${variant}${shown ? ' is-in' : ''}`,
    style: { '--kt-d': `${delay}ms` } as CSSProperties,
  };
}

export function Reveal({
  children,
  className = '',
  delay = 0,
  variant = 'up',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: RevealVariant;
}) {
  const r = useReveal<HTMLDivElement>(delay, variant);
  return (
    <div ref={r.ref} className={`${r.className} ${className}`} style={r.style}>
      {children}
    </div>
  );
}

/** Counts from 0 up to `to` once, easing out. Shows the real number when motion is reduced. */
export function CountUp({ to, duration = 900, className = '' }: { to: number; duration?: number; className?: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // requestAnimationFrame is suspended in a hidden tab, so guarantee the true value lands.
    const snap = window.setTimeout(() => setValue(to), duration + 120);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(snap);
    };
  }, [to, duration]);

  return <span className={className}>{value.toLocaleString()}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`kt-skeleton rounded-btn ${className}`} />;
}

/**
 * Counts up the single number inside a formatted label ("12m 30s", "2,481", "37%") while
 * keeping the surrounding text fixed. Labels with more than one number render untouched.
 */
export function AnimatedNumber({ text, duration = 900 }: { text: string; duration?: number }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const runs = text.match(/\d[\d.,]*/g);
    if (!runs || runs.length !== 1 || prefersReducedMotion()) {
      setShown(text);
      return;
    }
    const run = runs[0];
    const at = text.indexOf(run);
    const prefix = text.slice(0, at);
    const suffix = text.slice(at + run.length);
    const decimals = run.includes('.') ? run.split('.')[1].length : 0;
    const grouped = run.includes(',');
    const to = parseFloat(run.replace(/,/g, ''));
    if (!Number.isFinite(to) || to <= 1) {
      setShown(text);
      return;
    }
    const render = (n: number) =>
      prefix +
      (grouped
        ? n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : n.toFixed(decimals)) +
      suffix;

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(render(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const snap = window.setTimeout(() => setShown(text), duration + 120);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(snap);
    };
  }, [text, duration]);

  return <span>{shown}</span>;
}

/* ------------------------------- useDismiss ------------------------------- */

// Stacked modals must not fight over the body style, so the lock is refcounted.
let scrollLocks = 0;
let savedBodyOverflow = '';

/**
 * Closes a modal on Escape and freezes background scrolling while it is open.
 * Call it unconditionally at the top of every modal/drawer component.
 */
export function useDismiss(onClose: (() => void) | undefined) {
  // The callback is usually an inline arrow, so keep it in a ref: depending on it directly would
  // tear down and rebuild the listener on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    if (scrollLocks === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLocks++;
    return () => {
      window.removeEventListener('keydown', onKey);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = savedBodyOverflow;
    };
    // Mounted once per dialog; presence of onClose is the only thing that gates it.
  }, [!!onClose]);
}

/* ---------------------------------- Button ---------------------------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'soft';
type BtnSize = 'sm' | 'md';

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-btn font-body font-semibold transition-all duration-150 ease-out active:scale-[0.97] kt-focus cursor-pointer select-none whitespace-nowrap';

const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)]',
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
  iconSpin?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { iconSpin, ...html } = rest as { iconSpin?: boolean } & typeof rest;
  return (
    <button type={type} className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`} {...html}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} className={iconSpin ? 'kt-spin' : ''} />}
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
      className={`inline-flex items-center justify-center w-9 h-9 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 transition-all duration-150 ease-out active:scale-[0.92] kt-focus ${className}`}
      {...rest}
    >
      <Icon name={name} size={size} />
    </button>
  );
}

/* ----------------------------------- Card ----------------------------------- */

const spotVars = ['--mx', '--my', '--rx', '--ry'] as const;

export function Card({
  children,
  className = '',
  hover = false,
  sheen = false,
  spot = false,
  onClick,
}: {
  children?: ReactNode;
  className?: string;
  hover?: boolean;
  sheen?: boolean;
  spot?: boolean;
  onClick?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const pointerProps = spot
    ? {
        onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
          const el = cardRef.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
          el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
          el.style.setProperty('--rx', `${((px - 0.5) * 4).toFixed(2)}deg`);
          el.style.setProperty('--ry', `${((0.5 - py) * 3).toFixed(2)}deg`);
        },
        onPointerLeave: () => {
          const el = cardRef.current;
          if (!el) return;
          for (const v of spotVars) el.style.removeProperty(v);
        },
      }
    : {};

  const interactive = !!onClick;
  return (
    <div
      ref={cardRef}
      onClick={onClick}
      {...pointerProps}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`bg-surface border border-line rounded-card shadow-[var(--shadow-1)] ${
        sheen ? 'kt-sheen ' : ''
      }${spot ? 'kt-spot ' : ''}${
        hover || interactive ? 'transition-all duration-200 ease-out ' : ''
      }${hover ? 'hover:-translate-y-[3px] hover:shadow-[var(--shadow-2)] hover:border-line-strong ' : ''}${
        interactive ? 'cursor-pointer kt-focus active:scale-[0.99] ' : ''
      }${className}`}
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
  danger: 'bg-danger/10 text-danger border-danger/25',
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

export function StatusPill({
  children,
  tone = 'neutral',
  pulse = false,
}: {
  children: ReactNode;
  tone?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        toneMap[tone] || toneMap.neutral
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full bg-current opacity-70${pulse ? ' kt-live inline-block' : ''}`} />
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

/* ------------------------------- Page layout -------------------------------- */

type PageWidth = 'default' | 'wide' | 'full';

const pageWidths: Record<PageWidth, string> = {
  default: 'max-w-[1280px]',
  wide: 'max-w-[1500px]',
  full: 'max-w-none',
};

export function PageShell({
  children,
  width = 'default',
  className = '',
}: {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 ${pageWidths[width]} ${className}`}
    >
      {children}
    </div>
  );
}

const heroDelay = (ms: number) => ({ '--kt-d': `${ms}ms` }) as CSSProperties;

export function PageHeader({
  eyebrow,
  icon,
  title,
  description,
  actions,
  className = '',
}: {
  eyebrow: ReactNode;
  icon?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}
    >
      <div className="min-w-0 max-w-3xl">
        <div className="kt-hero-in" style={heroDelay(0)}>
          <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
        </div>
        <h1
          className="font-display text-[30px] sm:text-[34px] leading-[1.12] tracking-tight text-ink mt-1 text-balance break-words kt-hero-in"
          style={heroDelay(70)}
        >
          {title}
        </h1>
        {description && (
          <p
            className="text-sm sm:text-[15px] leading-relaxed text-ink-muted mt-2 max-w-2xl kt-hero-in"
            style={heroDelay(140)}
          >
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 kt-hero-in" style={heroDelay(190)}>
          {actions}
        </div>
      )}
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

export function Progress({
  value,
  live = false,
  trackClassName = 'h-1.5 bg-surface-3',
  barClassName = 'bg-primary',
}: {
  value: number;
  live?: boolean;
  trackClassName?: string;
  barClassName?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  // Grow from zero on mount. The reflow read gives the transition a committed start value;
  // later `value` changes arrive as a plain inline-style update and animate on their own.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const target = `${value}%`;
    el.style.width = '0%';
    void el.offsetWidth;
    el.style.width = target;
    // Mount-only: re-running would rewind a bar that is already tracking real progress.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${trackClassName} w-full rounded-full overflow-hidden`}>
      <div
        ref={barRef}
        className={`kt-bar h-full rounded-full ${barClassName}${live ? ' kt-bar--live' : ''}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/* --------------------------------- Divider ---------------------------------- */

export function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px w-full bg-line ${className}`} />;
}
