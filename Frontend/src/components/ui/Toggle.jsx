/**
 * Toggle — binary switch. Track fills with brand when on.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label = "Toggle",
  className = "",
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill p-0.5",
        "transition-colors duration-150 ease-standard",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-brand" : "bg-border-strong",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "h-4 w-4 rounded-full bg-white shadow-raised",
          "transition-transform duration-150 ease-standard",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
