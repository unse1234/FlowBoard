import { cx } from "./cx.js";

/**
 * Badge — a small label tag (status, role, count). 4px corners, like the
 * Awwwards tags it takes after. Always carries text: tone alone is not a state.
 */

const VARIANTS = {
  neutral: "bg-surface-muted text-text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent text-on-accent",
  outline: "border border-border text-text-muted",
};

export function Badge({ variant = "neutral", className = "", children }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-caption",
        VARIANTS[variant === "default" ? "neutral" : variant] ?? VARIANTS.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}

const DOT_TONES = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-accent",
  brand: "bg-ink",
  muted: "bg-text-soft",
};

/**
 * StatusDot — the dot before a status label. `pulse` adds the live/speaking
 * ring. Decorative: the adjacent text carries the meaning.
 */
export function StatusDot({ tone = "muted", pulse = false, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-2 shrink-0 rounded-full",
        DOT_TONES[tone] ?? DOT_TONES.muted,
        pulse && "fb-speaking",
        className,
      )}
    />
  );
}
