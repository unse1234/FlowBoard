/**
 * ComingSoon — the marker for surfaces that exist in the design but have no
 * implementation behind them yet.
 *
 * Everything in the mockup is rendered rather than hidden; unbuilt features are
 * shown in a visibly inert state so the layout matches the design and nobody
 * mistakes a stub for a bug.
 */

/** Inline "Soon" pill for a label row. */
export function SoonBadge({ className = "" }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-pill border border-border",
        "bg-surface-sunken px-1.5 py-px text-[9px] font-semibold uppercase",
        "tracking-[0.06em] text-text-soft",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      Soon
    </span>
  );
}

/** EmptyNote — quiet caption for an empty or unavailable list. */
export function EmptyNote({ children, className = "" }) {
  return (
    <p
      className={[
        "rounded-card border border-dashed border-border bg-surface-soft",
        "px-3 py-2.5 text-[12px] text-text-soft",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </p>
  );
}
