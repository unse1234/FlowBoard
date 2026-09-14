import { cx } from "./cx.js";

/** Inline "Soon" tag. Legacy — removed with the pre-redesign shell. */
export function SoonBadge({ className = "" }) {
  return (
    <span
      className={cx(
        "inline-flex h-4 items-center rounded-sm bg-surface-muted px-1",
        "text-kbd uppercase tracking-[0.06em] text-text-muted",
        className,
      )}
    >
      Soon
    </span>
  );
}

/** EmptyNote — quiet caption for an empty list. */
export function EmptyNote({ children, className = "" }) {
  return (
    <p
      className={cx(
        "rounded-md border border-dashed border-border px-3 py-2.5 text-label font-normal text-text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
