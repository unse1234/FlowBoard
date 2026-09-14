import { useId } from "react";
import { cx } from "./cx.js";

/**
 * SliderRow — labelled range with a live value.
 *
 * The filled part of the track follows the value through `--fb-range-pct`
 * (styled in index.css), so the control reads at a glance without the number.
 */
export function SliderRow({
  icon: Icon,
  label,
  value,
  displayValue,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  onChange,
  className = "",
}) {
  const id = useId();
  const span = max - min || 1;
  const percent = Math.min(100, Math.max(0, ((value - min) / span) * 100));

  return (
    <div className={cx("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-label text-text-muted">
          {Icon ? <Icon size={14} strokeWidth={1.75} aria-hidden="true" /> : null}
          {label}
        </label>
        <output htmlFor={id} className="text-label tabular-nums text-text">
          {displayValue ?? value}
        </output>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(Number(event.target.value))}
        style={{ "--fb-range-pct": `${percent}%` }}
      />
    </div>
  );
}
