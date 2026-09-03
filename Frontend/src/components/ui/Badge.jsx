/**
 * Badge — small status pill (connection state, "Host", participant counts).
 */

const VARIANT_CLASSES = {
  default: "bg-surface-soft text-text-muted border-border",
  success: "bg-success-bg text-success border-transparent",
  warning: "bg-warning-bg text-warning border-transparent",
  danger: "bg-danger-bg text-danger border-transparent",
  info: "bg-brand-soft text-brand border-transparent",
  outline: "bg-transparent text-text-muted border-border",
};

export function Badge({ variant = "default", className = "", children }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5",
        "text-[10px] font-semibold tracking-[0.02em] whitespace-nowrap",
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

/**
 * StatusDot — the small filled circle that precedes a connection label.
 * `pulse` adds the speaking/active ring used in the participant list.
 */
export function StatusDot({ tone = "muted", pulse = false, className = "" }) {
  const TONE_CLASSES = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    brand: "bg-brand",
    muted: "bg-text-soft",
  };

  return (
    <span
      aria-hidden="true"
      className={[
        "inline-block h-2 w-2 shrink-0 rounded-full",
        TONE_CLASSES[tone] ?? TONE_CLASSES.muted,
        pulse ? "fb-speaking" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
