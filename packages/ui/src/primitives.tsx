import * as React from "react";
import { cn } from "./cn";

// ------------------------------------------------------------------ button

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-primary text-white hover:opacity-90 focus-visible:outline-brand-primary disabled:opacity-50",
  secondary:
    "bg-surface-raised text-ink border border-edge hover:bg-surface-muted focus-visible:outline-brand-primary disabled:opacity-50",
  ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50",
  danger: "bg-critical text-white hover:opacity-90 disabled:opacity-50",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

// -------------------------------------------------------------------- card

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-edge bg-surface-raised shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-edge px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

// ------------------------------------------------------------------- badge

const BADGE_TONES = {
  neutral: "bg-surface-muted text-ink-muted border-edge",
  positive: "bg-positive/10 text-positive border-positive/20",
  caution: "bg-caution/10 text-caution border-caution/20",
  critical: "bg-critical/10 text-critical border-critical/20",
  brand: "bg-brand-secondary/10 text-brand-secondary border-brand-secondary/20",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Status tones for the domain vocabularies. Anything unmapped stays neutral,
 * so a new provider status never renders as "success" by accident.
 */
const STATUS_TONES: Record<string, BadgeTone> = {
  ACTIVE: "positive",
  COMPLETED: "positive",
  CLEARED: "positive",
  APPROVED: "positive",
  KYC_APPROVED: "positive",
  RAIN_ACCOUNT_ACTIVE: "positive",
  VIRTUAL_CARD_ACTIVE: "positive",
  CARD_ELIGIBLE: "positive",

  PENDING: "caution",
  PENDING_APPROVAL: "caution",
  PROCESSING: "caution",
  SUBMITTED_TO_RAIN: "caution",
  FUNDING_PENDING: "caution",
  KYC_PENDING: "caution",
  KYC_REVIEW: "caution",
  TERMS_PENDING: "caution",
  RAIN_ACCOUNT_PENDING: "caution",
  VIRTUAL_CARD_PENDING: "caution",
  MANUAL_REVIEW: "caution",
  FROZEN: "caution",
  DRAFT: "neutral",
  INVITED: "neutral",

  FAILED: "critical",
  REJECTED: "critical",
  DECLINED: "critical",
  REVERSED: "critical",
  KYC_REJECTED: "critical",
  COUNTRY_UNSUPPORTED: "critical",
  ACCOUNT_RESTRICTED: "critical",
  CARD_INELIGIBLE: "critical",
  PROVIDER_ERROR: "critical",
  SUSPENDED: "critical",
  CANCELLED: "neutral",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} className={className}>
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

// ------------------------------------------------------------------ inputs

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink",
          "placeholder:text-ink-subtle",
          "focus:border-brand-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary/20",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink",
        "focus:border-brand-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary/20",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-xs font-medium text-ink-muted", className)} {...props} />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-critical">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------- table

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-edge px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-edge px-4 py-3 text-ink", className)} {...props} />;
}

// -------------------------------------------------------------- stat tile

export function Stat({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: BadgeTone;
}) {
  const valueTone =
    tone === "positive"
      ? "text-positive"
      : tone === "critical"
        ? "text-critical"
        : tone === "caution"
          ? "text-caution"
          : "text-ink";

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular", valueTone)}>{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-ink-subtle">{sublabel}</p> : null}
    </Card>
  );
}

// ------------------------------------------------------------ empty state

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-subtle">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: BadgeTone;
  title?: string;
  children: React.ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border-edge bg-surface-muted text-ink-muted",
    positive: "border-positive/30 bg-positive/5 text-ink",
    caution: "border-caution/30 bg-caution/5 text-ink",
    critical: "border-critical/30 bg-critical/5 text-ink",
    brand: "border-brand-secondary/30 bg-brand-secondary/5 text-ink",
  };

  return (
    <div className={cn("rounded-card border px-4 py-3 text-sm", tones[tone])}>
      {title ? <p className="mb-1 font-medium text-ink">{title}</p> : null}
      {children}
    </div>
  );
}
