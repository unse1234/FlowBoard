/**
 * IconButton — square icon-only button.
 *
 * `active` paints the ink chip used by the toolbar and every segmented control
 * in the design. Ink inverts under `.dark`, so the active chip stays the
 * highest-contrast element in both themes.
 *
 * @param {boolean} active
 * @param {'sm'|'md'|'lg'} size
 * @param {'ink'|'brand'|'soft'} tone - how the active state is painted
 */

const SIZE_CLASSES = {
  sm: "h-7 w-7 rounded-md",
  md: "h-8 w-8 rounded-button",
  lg: "h-9 w-9 rounded-button",
};

const ACTIVE_TONES = {
  ink: "bg-ink text-on-ink",
  brand: "bg-brand text-on-brand",
  soft: "bg-brand-soft text-brand",
};

export function IconButton({
  active = false,
  tone = "ink",
  size = "md",
  title,
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      className={[
        "grid shrink-0 place-items-center border border-transparent",
        "transition-colors duration-150 ease-standard",
        "disabled:cursor-not-allowed disabled:opacity-40",
        SIZE_CLASSES[size] ?? SIZE_CLASSES.md,
        active
          ? ACTIVE_TONES[tone] ?? ACTIVE_TONES.ink
          : "text-text-muted hover:bg-surface-hover hover:text-text disabled:hover:bg-transparent",
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
