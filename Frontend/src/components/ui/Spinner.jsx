import { LoaderCircle } from "lucide-react";
import { cx } from "./cx.js";

/** Spinner — indeterminate progress. Always pair it with text that says what is loading. */
export function Spinner({ size = 14, className = "" }) {
  return (
    <LoaderCircle
      size={size}
      strokeWidth={2}
      aria-hidden="true"
      className={cx("shrink-0 animate-spin", className)}
    />
  );
}
