import { cx } from "./cx.js";
import { Spinner } from "./Spinner.jsx";

/**
 * Button — text button primitive.
 *
 * `primary` is the lemon signal and belongs to at most one action per surface.
 * Colours come from `--fb-*` tokens, so no variant needs a `dark:` override.
 *
 * @param {'primary'|'secondary'|'ghost'|'ink'|'danger'} variant
 * @param {'xs'|'sm'|'md'|'lg'} size - 28 / 32 / 36 / 44px
 */

const VARIANTS = {
  primary: "border-primary-edge bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "border-border bg-surface text-text hover:bg-hover",
  ghost: "border-transparent bg-transparent text-text-muted hover:bg-hover hover:text-text",
  ink: "border-transparent bg-ink text-on-ink hover:opacity-90",
  danger: "border-transparent bg-danger-soft text-danger hover:bg-danger/18",
};

const SIZES = {
  xs: "h-7 gap-1.5 rounded-md px-2.5 text-label",
  sm: "h-8 gap-1.5 rounded-md px-3 text-label",
  md: "h-9 gap-2 rounded-md px-3.5 text-body font-medium",
  lg: "h-11 gap-2 rounded-lg px-4 text-body font-medium",
};

export function Button({
  variant = "secondary",
  size = "sm",
  fullWidth = false,
  loading = false,
  disabled = false,
  className = "",
  ref,
  children,
  ...props
}) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap border",
        "transition-[background-color,color,opacity,transform] duration-150 ease-out",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant] ?? VARIANTS.secondary,
        SIZES[size] ?? SIZES.sm,
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
}
