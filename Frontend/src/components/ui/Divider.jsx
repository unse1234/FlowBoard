import { cx } from "./cx.js";

/** Divider — hairline rule. `vertical` separates groups inside a toolbar. */
export function Divider({ vertical = false, className = "" }) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cx("shrink-0 bg-divider", vertical ? "h-5 w-px" : "h-px w-full", className)}
    />
  );
}
