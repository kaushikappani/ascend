import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from '../lib/format';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'warn' | 'soft' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-[0_4px_0_var(--brand-deep)] [--press-shadow:var(--brand-deep)] hover:bg-brand-strong',
  secondary:
    'bg-elev text-ink border-2 border-line shadow-[0_4px_0_var(--border-strong)] [--press-shadow:var(--border-strong)] hover:bg-hover',
  success: 'bg-ok text-white shadow-[0_4px_0_var(--ok-deep)] [--press-shadow:var(--ok-deep)] hover:brightness-105',
  danger: 'bg-bad text-white shadow-[0_4px_0_var(--bad-deep)] [--press-shadow:var(--bad-deep)] hover:brightness-105',
  warn: 'bg-warn text-white shadow-[0_4px_0_var(--warn-deep)] [--press-shadow:var(--warn-deep)] hover:brightness-105',
  soft: 'bg-brand-soft text-brand-ink hover:brightness-[0.97]',
  ghost: 'bg-transparent text-muted hover:bg-hover hover:text-ink',
  outline: 'bg-transparent text-brand border-2 border-brand/35 hover:bg-brand-soft',
};

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5',
  md: 'h-11 px-5 text-sm rounded-2xl gap-2',
  lg: 'h-[52px] px-7 text-[15px] rounded-2xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  caps?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, caps, block, className, children, disabled, ...rest },
  ref,
) {
  const is3d = ['primary', 'secondary', 'success', 'danger', 'warn'].includes(variant);
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'no-drag inline-flex select-none items-center justify-center font-extrabold whitespace-nowrap',
        is3d && 'press',
        SIZE[size],
        VARIANT[variant],
        caps && 'uppercase tracking-wider',
        block && 'w-full',
        'disabled:bg-sunken disabled:text-faint disabled:border-transparent disabled:shadow-[0_4px_0_var(--border)] disabled:hover:bg-sunken disabled:brightness-100 disabled:opacity-70',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'no-drag inline-flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn('rounded-3xl border-2 border-line bg-elev p-5 shadow-card', onClick && 'cursor-pointer transition-colors hover:bg-hover', className)}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h3 className="text-[13px] font-extrabold uppercase tracking-wider text-faint">{children}</h3>
      {action}
    </div>
  );
}

type Tone = 'brand' | 'ok' | 'bad' | 'warn' | 'info' | 'neutral';

const TONE: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-ok-soft text-ok-ink',
  bad: 'bg-bad-soft text-bad-ink',
  warn: 'bg-warn-soft text-warn-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-sunken text-muted',
};

export function Badge({ tone = 'neutral', className, children, icon }: { tone?: Tone; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold break-words', TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
  icon,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'no-drag inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-[13px] font-bold transition-colors',
        active ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-elev text-muted hover:bg-hover hover:text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  color = 'var(--brand)',
  height = 12,
  className,
  track = 'var(--bg-sunken)',
}: {
  value: number;
  color?: string;
  height?: number;
  className?: string;
  track?: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn('relative w-full overflow-hidden rounded-full', className)} style={{ height, background: track }}>
      <div
        className="relative h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${v * 100}%`, background: color, minWidth: v > 0 ? height : 0 }}
      >
        {height >= 10 && v > 0.04 && (
          <div className="absolute top-[22%] right-2 left-2 h-[22%] rounded-full bg-white/35" />
        )}
      </div>
    </div>
  );
}

export function Ring({
  value,
  size = 44,
  stroke = 5,
  color = 'var(--brand)',
  track = 'var(--bg-sunken)',
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      {children !== undefined && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin text-brand', className)} />;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[13px] font-extrabold text-ink">{children}</span>
      {hint && <span className="text-xs font-semibold text-faint">{hint}</span>}
    </label>
  );
}

const fieldClass =
  'no-drag w-full rounded-2xl border-2 border-line bg-elev px-4 text-[14px] font-semibold text-ink placeholder:text-faint placeholder:font-medium outline-none transition-colors focus:border-brand disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldClass, 'h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldClass, 'resize-none py-3 leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, 'h-11 cursor-pointer appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', className)} {...rest}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239294ae' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('no-drag relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line-strong')}
    >
      <span
        className={cn('absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('no-drag inline-flex flex-wrap gap-1 rounded-2xl bg-sunken p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-xl font-bold transition-all',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-[13px]',
            o.value === value ? 'bg-elev text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border-2 border-b-4 border-line bg-elev px-1.5 font-mono text-[11px] font-bold text-muted">
      {children}
    </kbd>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line px-8 py-12 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <h3 className="text-lg font-extrabold">{title}</h3>
      {children && <div className="max-w-md text-sm font-semibold text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Stat({ label, value, icon, tone = 'var(--brand)', sub }: { label: string; value: ReactNode; icon: ReactNode; tone?: string; sub?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-line bg-elev p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl leading-tight font-black">{value}</div>
        <div className="truncate text-xs font-bold text-faint">{label}</div>
        {sub && <div className="text-[11px] font-semibold text-muted">{sub}</div>}
      </div>
    </div>
  );
}
