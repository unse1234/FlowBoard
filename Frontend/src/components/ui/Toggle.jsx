import { cx } from "./cx.js";

/**
 * Toggle — binary switch. The track fills with ink (lemon in dark) when on.
 * `onChange` receives the next value.
 */
export function Toggle({ checked, onChange, disabled = false, label = "Toggle", className = "" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cx(
        "relative inline-flex h-5 w-8 shrink-0 items-center rounded-full p-0.5",
        "transition-colors duration-150 ease-out disabled:opacity-45",
        checked ? "bg-ink" : "bg-border-strong",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "size-4 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.25)]",
          "transition-transform duration-150 ease-out",
          checked ? "translate-x-3 bg-on-ink" : "translate-x-0 bg-toggle-thumb",
        )}
      />
    </button>
  );
}
