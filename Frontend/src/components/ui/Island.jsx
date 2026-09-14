import { cx } from "./cx.js";

/**
 * Island — the floating surface every cluster of chrome sits on.
 *
 * Hairline border and a soft level-1 shadow; no backdrop blur, which would cost
 * a full re-composite of the canvas underneath on every frame.
 */
export function Island({ as = "div", className = "", ref, children, ...props }) {
  const Component = as;

  return (
    <Component
      ref={ref}
      className={cx("rounded-lg border border-border bg-surface text-text shadow-island", className)}
      {...props}
    >
      {children}
    </Component>
  );
}
