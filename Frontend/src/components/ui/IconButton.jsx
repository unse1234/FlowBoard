import { toAriaKeyShortcuts } from "../../features/shortcuts/formatShortcut.js";
import { assignRefs, cx, mergeHandlers } from "./cx.js";
import { useTooltip } from "./useTooltip.jsx";

/**
 * IconButton — square icon-only button with a built-in tooltip.
 *
 * `label` is required: it is the accessible name and the tooltip text. Pass
 * `tooltip={false}` where a visible label already sits next to the button.
 *
 * `active` paints the chosen tone. `pressed` is separate and only for true
 * toggles, so an ordinary button never announces itself as "pressed".
 *
 * @param {'sm'|'md'|'lg'|'xl'} size - 28 / 32 / 36 / 44px
 * @param {'ink'|'primary'|'soft'|'danger'|'selection'} tone
 */

const SIZES = {
  sm: "size-7 rounded-md",
  md: "size-8 rounded-md",
  lg: "size-9 rounded-md",
  xl: "size-11 rounded-lg",
};

const ACTIVE_TONES = {
  ink: "bg-ink text-on-ink",
  primary: "bg-primary text-on-primary",
  soft: "bg-pressed text-text",
  danger: "bg-danger-soft text-danger",
  selection: "bg-selection-soft text-selection",
};

export function IconButton({
  label: labelProp,
  title,
  tooltip,
  shortcut,
  tooltipPlacement = "top",
  active = false,
  pressed,
  tone = "ink",
  size = "md",
  disabled = false,
  className = "",
  ref,
  children,
  ...props
}) {
  // `title` is the pre-redesign spelling of `label`, accepted so older call
  // sites keep an accessible name and gain a tooltip instead of a native title.
  const label = labelProp ?? title;
  const tooltipLabel = tooltip === false ? null : (tooltip ?? label);
  const { triggerRef, triggerProps, tooltip: tooltipNode } = useTooltip({
    label: tooltipLabel,
    shortcut,
    placement: tooltipPlacement,
    disabled,
  });

  return (
    <>
      <button
        ref={(node) => assignRefs(node, triggerRef, ref)}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={shortcut ? toAriaKeyShortcuts(shortcut) : undefined}
        disabled={disabled}
        className={cx(
          "relative inline-grid shrink-0 select-none place-items-center",
          "transition-[background-color,color,transform] duration-150 ease-out",
          "active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40",
          SIZES[size] ?? SIZES.md,
          active
            ? (ACTIVE_TONES[tone] ?? ACTIVE_TONES.ink)
            : "text-text-muted hover:bg-hover hover:text-text",
          className,
        )}
        {...mergeHandlers(triggerProps, props)}
      >
        {children}
      </button>
      {tooltipNode}
    </>
  );
}
