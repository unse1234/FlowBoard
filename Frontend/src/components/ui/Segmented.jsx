/**
 * Segmented — pill tab control (Stroke/Fill, Draw/Shapes/Text/More).
 *
 * Options may individually opt out with `disabled`, which is how the design's
 * not-yet-built tabs are represented rather than hiding them.
 *
 * @param {Array<{value: string, label: string, icon?: any, disabled?: boolean, title?: string}>} options
 */
export function Segmented({
  options = [],
  value,
  onChange,
  size = "sm",
  className = "",
}) {
  const height = size === "md" ? "h-9" : "h-8";

  return (
    <div
      role="tablist"
      className={[
        "flex items-center gap-1 rounded-button bg-surface-sunken p-1",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={option.disabled}
            title={option.title ?? option.label}
            onClick={() => onChange?.(option.value)}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2",
              height,
              "text-[12px] font-medium transition-colors duration-150 ease-standard",
              "disabled:cursor-not-allowed disabled:opacity-40",
              isActive
                ? "bg-ink text-on-ink shadow-raised"
                : "text-text-muted hover:text-text enabled:hover:bg-surface-hover",
            ].join(" ")}
          >
            {Icon ? <Icon size={14} strokeWidth={2} /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
