import { Check } from "lucide-react";
import { useRef } from "react";
import { toAriaKeyShortcuts } from "../../features/shortcuts/formatShortcut.js";
import { cx } from "./cx.js";
import { KbdCombo } from "./Kbd.jsx";
import { Popover } from "./Popover.jsx";

/**
 * Menu — dropdown and context menu.
 *
 * Items are data: `{ id, label, icon, shortcut, hint, onSelect, disabled,
 * danger }`, `{ type: "checkbox", checked, … }`, `{ type: "separator" }` or
 * `{ type: "label", label }`. Falsy entries are skipped, so callers can write
 * `condition && item`.
 *
 * Keyboard: arrows move, Home/End jump, Enter/Space activate, Escape and Tab
 * close. Pass `anchorPoint` instead of `anchorRef` for a context menu.
 */
export function Menu({
  open,
  onClose,
  anchorRef,
  anchorPoint,
  placement = "bottom-end",
  label,
  items = [],
  className = "",
}) {
  const listRef = useRef(null);

  const handleKeyDown = (event) => {
    const list = listRef.current;
    if (!list) return;

    const buttons = Array.from(
      list.querySelectorAll("[data-menu-item]:not([disabled])"),
    );
    if (buttons.length === 0) return;

    const index = buttons.indexOf(document.activeElement);
    const focusAt = (next) => {
      event.preventDefault();
      buttons[(next + buttons.length) % buttons.length].focus();
    };

    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index < 0 ? buttons.length - 1 : index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(buttons.length - 1);
        break;
      case "Tab":
        event.preventDefault();
        onClose?.("tab");
        break;
      default:
    }
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      anchorPoint={anchorPoint}
      placement={placement}
      role="presentation"
      className={cx("min-w-56 p-1", className)}
    >
      <div
        ref={listRef}
        role="menu"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="flex flex-col"
      >
        {items.filter(Boolean).map((item, index) => (
          <MenuEntry
            key={item.id ?? `${item.type ?? "item"}-${index}`}
            item={item}
            onClose={onClose}
          />
        ))}
      </div>
    </Popover>
  );
}

function MenuEntry({ item, onClose }) {
  if (item.type === "separator") {
    return <div role="separator" className="-mx-1 my-1 h-px bg-divider" />;
  }

  if (item.type === "label") {
    return (
      <div
        role="presentation"
        className="px-2 pb-1 pt-2 text-caption uppercase tracking-[0.06em] text-text-muted"
      >
        {item.label}
      </div>
    );
  }

  const Icon = item.icon;
  const isCheckbox = item.type === "checkbox";

  return (
    <button
      type="button"
      data-menu-item
      role={isCheckbox ? "menuitemcheckbox" : "menuitem"}
      aria-checked={isCheckbox ? Boolean(item.checked) : undefined}
      aria-keyshortcuts={item.shortcut ? toAriaKeyShortcuts(item.shortcut) : undefined}
      disabled={item.disabled}
      onClick={() => {
        if (!item.keepOpen) onClose?.("select");
        item.onSelect?.();
      }}
      className={cx(
        "group flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-left text-body",
        "transition-colors duration-100 pointer-coarse:h-11",
        "focus-visible:outline-none disabled:pointer-events-none disabled:text-text-disabled",
        item.danger
          ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft"
          : "text-text hover:bg-hover focus-visible:bg-hover",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "grid size-4 shrink-0 place-items-center group-disabled:text-text-disabled",
          item.danger ? "text-danger" : "text-text-muted group-hover:text-text",
        )}
      >
        {Icon ? <Icon size={16} strokeWidth={1.75} /> : null}
      </span>

      <span className="min-w-0 flex-1 truncate">{item.label}</span>

      {item.hint ? (
        <span className="text-caption text-text-muted">{item.hint}</span>
      ) : null}

      {isCheckbox ? (
        <Check
          size={14}
          strokeWidth={2.25}
          aria-hidden="true"
          className={item.checked ? "text-text" : "invisible"}
        />
      ) : null}

      {item.shortcut ? <KbdCombo combo={item.shortcut} className="ml-3" /> : null}
    </button>
  );
}
