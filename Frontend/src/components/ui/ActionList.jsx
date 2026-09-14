import { cx } from "./cx.js";

/**
 * ActionList — the touch counterpart of `Menu`, for use inside a sheet.
 *
 * Takes the same item data as `Menu`, rendered as 48px rows. Checkbox items are
 * switches and leave the sheet open so several can be flipped in a row; every
 * other item reports back through `onAction`, which usually closes the sheet.
 */
export function ActionList({ items = [], onAction, className = "" }) {
  return (
    <div className={cx("flex flex-col", className)}>
      {items.filter(Boolean).map((item, index) => {
        if (item.type === "separator") {
          return (
            <div
              key={`separator-${index}`}
              role="separator"
              className="my-1.5 h-px bg-divider"
            />
          );
        }

        if (item.type === "label") {
          return (
            <p
              key={`label-${index}`}
              className="px-3 pb-1 pt-3 text-caption uppercase tracking-[0.06em] text-text-muted"
            >
              {item.label}
            </p>
          );
        }

        const Icon = item.icon;
        const isCheckbox = item.type === "checkbox";

        return (
          <button
            key={item.id ?? index}
            type="button"
            role={isCheckbox ? "switch" : undefined}
            aria-checked={isCheckbox ? Boolean(item.checked) : undefined}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              if (!isCheckbox && !item.keepOpen) onAction?.(item);
            }}
            className={cx(
              "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-body",
              "transition-colors duration-100 disabled:pointer-events-none disabled:text-text-disabled",
              item.danger
                ? "text-danger hover:bg-danger-soft active:bg-danger-soft"
                : "text-text hover:bg-hover active:bg-pressed",
            )}
          >
            {Icon ? (
              <Icon
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                className={item.danger ? "text-danger" : "text-text-muted"}
              />
            ) : (
              <span aria-hidden="true" className="size-4.5" />
            )}

            <span className="min-w-0 flex-1 truncate">{item.label}</span>

            {item.hint ? <span className="text-label text-text-muted">{item.hint}</span> : null}

            {isCheckbox ? <SwitchIndicator checked={Boolean(item.checked)} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Visual-only switch; the row itself carries role="switch". */
function SwitchIndicator({ checked }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex h-5 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150",
        checked ? "bg-ink" : "bg-border-strong",
      )}
    >
      <span
        className={cx(
          "size-4 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-150",
          checked ? "translate-x-3 bg-on-ink" : "bg-toggle-thumb",
        )}
      />
    </span>
  );
}
