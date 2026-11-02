import type { ReactNode } from 'react';

/**
 * The Studio has no icon font — labels do the work. These are the only glyphs it uses.
 */
export function Mark({ tone = 'moss' }: { tone?: 'moss' | 'clay' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[7px] w-[7px] rounded-[2px] ${
        tone === 'moss' ? 'bg-moss' : 'bg-clay'
      }`}
    />
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="meta-label block">
      {children}
    </label>
  );
}

export function Field({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1.5 w-full rounded-[8px] border border-rule bg-white px-3 py-2 text-[15px] text-ink placeholder:text-ink-faint focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/15"
    />
  );
}

export function Button({
  children,
  onClick,
  kind = 'primary',
  type = 'button',
  disabled,
  isLink,
  href,
  autoFocus,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'quiet' | 'outline';
  type?: 'button' | 'submit';
  disabled?: boolean;
  isLink?: boolean;
  href?: string;
  autoFocus?: boolean;
}) {
  const base =
    'inline-flex items-center gap-2 rounded-[8px] px-3.5 py-2 text-[14px] font-medium transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] disabled:opacity-45 disabled:pointer-events-none active:scale-[0.99]';
  const look =
    kind === 'primary'
      ? 'bg-moss text-on-moss hover:bg-moss-deep'
      : kind === 'outline'
        ? 'border border-rule-strong bg-white text-ink hover:border-moss hover:text-moss'
        : 'text-ink-soft hover:text-moss';
  const cls = `${base} ${look}`;
  if (isLink) {
    return (
      <a className={cls} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} autoFocus={autoFocus}>
      {children}
    </button>
  );
}

export function Timecode({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[12px] tracking-tight text-moss tabular-nums">{children}</span>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-rule-strong bg-paper-2/60 px-6 py-10 text-center">
      <p className="font-display text-[19px] text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
