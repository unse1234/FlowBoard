import { cx, mergeHandlers } from "./cx.js";
import { useTooltip } from "./useTooltip.jsx";

/**
 * Tooltip — wraps arbitrary content (an avatar, a status chip) in a hover and
 * focus tooltip. Icon buttons have tooltips built in; use this for the rest.
 */
export function Tooltip({
  label,
  shortcut,
  placement = "top",
  disabled = false,
  className = "",
  children,
  ...props
}) {
  const { triggerRef, triggerProps, tooltip } = useTooltip({
    label,
    shortcut,
    placement,
    disabled,
  });

  return (
    <>
      <span
        ref={triggerRef}
        className={cx("inline-flex", className)}
        {...mergeHandlers(triggerProps, props)}
      >
        {children}
      </span>
      {tooltip}
    </>
  );
}
