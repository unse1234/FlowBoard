import { cx } from "./cx.js";

/**
 * Panel — a padded surface. `flat` is for wells nested inside another surface,
 * where a second shadow would read as clutter.
 */
export function Panel({ className = "", padding = "p-3", flat = false, children, ...props }) {
  return (
    <div
      className={cx(
        "rounded-lg text-text",
        flat
          ? "border border-border bg-surface-muted"
          : "border border-border bg-surface shadow-island",
        padding,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * SectionLabel — the small uppercase overline that opens a panel section.
 * Muted rather than soft, so it still clears 4.5:1 at 11px.
 */
export function SectionLabel({ as = "p", className = "", children, ...props }) {
  const Component = as;

  return (
    <Component
      className={cx("text-caption uppercase tracking-[0.06em] text-text-muted", className)}
      {...props}
    >
      {children}
    </Component>
  );
}
