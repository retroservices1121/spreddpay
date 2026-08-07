import * as React from "react";
import { cn } from "./cn";

/**
 * The Spredd Pay mark, transcribed from the landing page at spreddpay.com so the
 * portals and the marketing site are demonstrably the same product rather than
 * two approximations of it.
 *
 * Drawn as inline SVG, not an image: it stays crisp at any size, needs no
 * network request, and inherits the surrounding colour for the cut-out bars —
 * which is what lets it sit on any surface without a matte box around it.
 */
export function SpreddPayMark({
  size = 28,
  className,
  /** Colour of the cut-out bars. Defaults to the page background. */
  cutout = "#0b0b10",
  title = "Spredd Pay",
}: {
  size?: number;
  className?: string;
  cutout?: string;
  title?: string;
}) {
  // Unique per instance: two marks on one page must not share gradient ids, or
  // the second silently renders with the first's stops.
  const gradientId = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="36 36 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2d78" />
          <stop offset="0.5" stopColor="#c62fd4" />
          <stop offset="1" stopColor="#1f9ffa" />
        </linearGradient>
      </defs>
      <rect x="36" y="36" width="48" height="48" rx="14" fill={`url(#${gradientId})`} />
      <rect x="48" y="52" width="24" height="7" rx="3.5" fill={cutout} />
      <rect x="48" y="63" width="16" height="7" rx="3.5" fill={cutout} />
    </svg>
  );
}

/** Mark plus wordmark, for headers and sign-in screens. */
export function SpreddPayLogo({
  size = 28,
  showWordmark = true,
  wordmark = "Spredd Pay",
  suffix,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  wordmark?: string;
  /** e.g. "Operations" or "Partner" — set in the muted tone beside the name. */
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <SpreddPayMark size={size} />
      {showWordmark ? (
        <span className="truncate text-sm font-semibold tracking-tight text-ink">
          {wordmark}
          {suffix ? <span className="ml-1.5 font-normal text-ink-subtle">{suffix}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The landing page's signature gradient, as a text treatment.
 * `linear-gradient(138deg, #ff2d78, #c62fd4, #7a37e8, #1f9ffa)`
 */
export function GradientText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          "linear-gradient(138deg,#ff2d78 0%,#c62fd4 34%,#7a37e8 60%,#1f9ffa 100%)",
      }}
    >
      {children}
    </span>
  );
}
