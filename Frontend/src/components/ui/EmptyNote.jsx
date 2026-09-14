import { cx } from "./cx.js";

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
