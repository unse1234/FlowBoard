import { useRef } from "react";
import { assignRefs, cx, mergeHandlers } from "./cx.js";
import { useTooltip } from "./useTooltip.jsx";

/**
 * Segmented — a single choice among a few options.
 *
 * A `radiogroup`: one tab stop, arrow keys move the choice (and apply it, as a
 * native radio group does). `iconOnly` hides labels visually; each option then
 * keeps its label as accessible name and tooltip.
 *
 * @param {Array<{value: string, label: string, icon?: any, disabled?: boolean}>} options
 * @param {'sm'|'md'} size
 */
export function Segmented({
  options = [],
  value,
  onChange,
  size = "sm",
  label,
  iconOnly = false,
  className = "",
}) {
  const buttonsRef = useRef([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  const handleKeyDown = (event, index) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;

    event.preventDefault();

    for (let step = 1; step <= options.length; step += 1) {
      const next = (index + (forward ? step : -step) + options.length) % options.length;
      if (options[next].disabled) continue;

      onChange?.(options[next].value);
      buttonsRef.current[next]?.focus();
      return;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("flex items-center gap-0.5 rounded-md bg-surface-muted p-0.5", className)}
    >
      {options.map((option, index) => (
        <SegmentedOption
          key={option.value}
          option={option}
          checked={index === selectedIndex}
          focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
          size={size}
          iconOnly={iconOnly}
          buttonRef={(node) => {
            buttonsRef.current[index] = node;
          }}
          onSelect={() => onChange?.(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        />
      ))}
    </div>
  );
}

function SegmentedOption({
  option,
  checked,
  focusable,
  size,
  iconOnly,
  buttonRef,
  onSelect,
  onKeyDown,
}) {
  const Icon = option.icon;
  const { triggerRef, triggerProps, tooltip } = useTooltip({
    label: iconOnly ? option.label : null,
    disabled: option.disabled,
  });

  return (
    <>
      <button
        ref={(node) => assignRefs(node, triggerRef, buttonRef)}
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={iconOnly ? option.label : undefined}
        tabIndex={focusable ? 0 : -1}
        disabled={option.disabled}
        className={cx(
          "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-inset px-2 text-label",
          "transition-[background-color,color,box-shadow] duration-150 ease-out disabled:opacity-40",
          size === "md" ? "h-8 pointer-coarse:h-10" : "h-7 pointer-coarse:h-9",
          checked
            ? "bg-segment-active text-text shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
            : "text-text-muted hover:text-text",
        )}
        {...mergeHandlers(triggerProps, { onClick: onSelect, onKeyDown })}
      >
        {Icon ? <Icon size={15} strokeWidth={checked ? 2 : 1.75} aria-hidden="true" /> : null}
        {iconOnly ? null : <span className="truncate">{option.label}</span>}
      </button>
      {tooltip}
    </>
  );
}
