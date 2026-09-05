/**
 * UI primitives.
 *
 * Small, unstyled-by-default building blocks so every screen looks like one
 * product. Icons come from lucide-react — no emoji, no letter placeholders.
 */
import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, CheckCircle2, Info, XCircle, Loader2, type LucideIcon,
} from 'lucide-react';

// ------------------------------------------------------------------ Card

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold tracking-tight text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-xs leading-relaxed text-muted', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-line px-5 py-3', className)} {...props} />;
}

// ---------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:opacity-90 disabled:opacity-50',
  secondary: 'border border-line bg-surface text-ink hover:bg-raised disabled:opacity-50',
  ghost: 'text-muted hover:bg-raised hover:text-ink disabled:opacity-50',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50',
  subtle: 'bg-raised text-ink hover:brightness-95 disabled:opacity-50',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({
  className, variant = 'secondary', size = 'md', icon: Icon, loading, children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href, className, variant = 'secondary', size = 'md', icon: Icon, children,
}: {
  href: string; className?: string; variant?: ButtonVariant; size?: ButtonSize;
  icon?: LucideIcon; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
      )}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </Link>
  );
}

// ----------------------------------------------------------------- Badge

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'brand';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-muted border-line',
  ok: 'bg-ok/10 text-ok border-ok/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  danger: 'bg-danger/10 text-danger border-danger/25',
  info: 'bg-info/10 text-info border-info/25',
  brand: 'bg-brand/10 text-brand border-brand/25',
};

export function Badge({
  tone = 'neutral', className, children,
}: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
      BADGE_TONES[tone], className,
    )}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Alerts

const ALERT_ICONS = {
  info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle,
} as const;

const ALERT_TONES = {
  info: 'border-info/25 bg-info/5 text-info',
  success: 'border-ok/25 bg-ok/5 text-ok',
  warning: 'border-warn/25 bg-warn/5 text-warn',
  error: 'border-danger/25 bg-danger/5 text-danger',
} as const;

export function Alert({
  tone = 'info', title, children, className,
}: {
  tone?: keyof typeof ALERT_ICONS; title?: string;
  children?: React.ReactNode; className?: string;
}) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div className={cn('flex gap-3 rounded-lg border p-3', ALERT_TONES[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-xs leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-1', 'text-ink/80')}>{children}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Fields

export function Field({
  label, hint, error, required, children, className,
}: {
  label: string; hint?: string; error?: string; required?: boolean;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-ink">
        {label}
        {required ? <span className="ml-1 text-danger">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-[11px] leading-relaxed text-faint">{hint}</p> : null}
      {error ? <p className="text-[11px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}

const CONTROL = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink ' +
  'placeholder:text-faint transition-colors focus:border-brand disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, 'min-h-[90px] resize-y', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(CONTROL, 'appearance-none pr-8', className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Checkbox({
  label, description, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-[rgb(var(--brand))]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink">{label}</span>
        {description ? <span className="block text-[11px] leading-relaxed text-faint">{description}</span> : null}
      </span>
    </label>
  );
}

// ----------------------------------------------------------------- Table

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-scroll">
      <table className={cn('w-full min-w-[560px] text-left text-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn(
      'border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint',
      className,
    )} {...props} />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-4 py-3 align-middle text-ink', className)} {...props} />;
}

// ------------------------------------------------------------ Empty/state

export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: LucideIcon; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-raised p-3">
        <Icon className="h-5 w-5 text-faint" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs leading-relaxed text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label, value, hint, icon: Icon, tone = 'neutral',
}: {
  label: string; value: React.ReactNode; hint?: string;
  icon?: LucideIcon; tone?: BadgeTone;
}) {
  const toneClass = {
    neutral: 'text-ink', ok: 'text-ok', warn: 'text-warn',
    danger: 'text-danger', info: 'text-info', brand: 'text-brand',
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-faint" aria-hidden /> : null}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums tracking-tight', toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({
  title, description, actions, breadcrumb,
}: {
  title: string; description?: string;
  actions?: React.ReactNode; breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb}
        <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A DEMO marker. Demo data is always labelled, never passed off as real. */
export function DemoBadge() {
  return <Badge tone="warn">DEMO</Badge>;
}
