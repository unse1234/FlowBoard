/**
 * Button — text/label button primitive.
 *
 * Colors come from `--fb-*` tokens, which re-resolve under `.dark`, so no
 * variant needs a `dark:` override.
 *
 * @param {'primary'|'secondary'|'ghost'|'ink'|'danger'} variant
 * @param {'xs'|'sm'|'md'} size
 */

const VARIANT_CLASSES = {
  primary:
    "bg-brand text-on-brand border border-transparent hover:bg-brand-hover shadow-raised",
  secondary:
    "bg-surface text-text border border-border hover:bg-surface-hover",
  ghost: "bg-transparent text-text-muted border border-transparent hover:bg-surface-hover hover:text-text",
  ink: "bg-ink text-on-ink border border-transparent hover:opacity-90",
  danger:
    "bg-danger-bg text-danger border border-transparent hover:brightness-95",
};

const SIZE_CLASSES = {
  xs: "h-7 px-2.5 text-[12px] gap-1.5 rounded-button",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-button",
  md: "h-9 px-4 text-[13px] gap-2 rounded-button",
};

export function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  fullWidth = false,
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={[
        "inline-flex select-none items-center justify-center font-medium",
        "transition-colors duration-150 ease-standard",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-inherit",
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.secondary,
        SIZE_CLASSES[size] ?? SIZE_CLASSES.sm,
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
