/**
 * SliderRow — icon + value readout above a range input.
 *
 * Used for stroke width and opacity in the style panel and the mobile tools
 * sheet, so both surfaces stay in step automatically.
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
  return (
    <div className={["space-y-2", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-text-muted">
          {Icon ? <Icon size={14} strokeWidth={2} /> : null}
          <span className="text-[11px] font-medium">{label}</span>
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-text">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange?.(Number(event.target.value))}
      />
    </div>
  );
}
