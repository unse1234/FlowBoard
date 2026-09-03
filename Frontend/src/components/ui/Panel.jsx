/**
 * Panel — the floating card used for every side panel and popover.
 *
 * 1px border + soft shadow. Use `flat` for cards nested inside another panel,
 * where a second shadow would read as clutter.
 */
export function Panel({
  className = "",
  padding = "p-3",
  flat = false,
  children,
  ...props
}) {
  return (
    <div
      className={[
        flat
          ? "bg-surface-soft border border-border shadow-none"
          : "bg-surface border border-border shadow-panel",
        "rounded-panel text-text font-body",
        padding,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * SectionLabel — the small uppercase heading that opens each panel section.
 */
export function SectionLabel({ className = "", children, ...props }) {
  return (
    <p
      className={[
        "text-[10px] font-semibold uppercase tracking-[0.08em] text-text-soft",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </p>
  );
}
