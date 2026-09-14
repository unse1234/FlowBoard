import { formatShortcut } from "../../features/shortcuts/formatShortcut.js";
import { cx } from "./cx.js";

const TONES = {
  default: "border border-border bg-surface-muted text-text-muted",
  inverse: "bg-white/15 text-current opacity-85",
};

/** Kbd — a single keycap. */
export function Kbd({ tone = "default", className = "", children }) {
  return (
    <kbd
      className={cx(
        "inline-grid h-4.5 min-w-4.5 place-items-center rounded-sm px-1",
        "font-sans text-kbd tabular-nums",
        TONES[tone] ?? TONES.default,
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * KbdCombo — keycaps for a combo string ("mod+shift+Z"), platform aware.
 * Hidden from assistive tech: the owning control carries aria-keyshortcuts.
 */
export function KbdCombo({ combo, tone = "default", className = "" }) {
  if (!combo) return null;

  return (
    <span aria-hidden="true" className={cx("inline-flex items-center gap-0.5", className)}>
      {formatShortcut(combo).map((key, index) => (
        <Kbd key={`${key}-${index}`} tone={tone}>
          {key}
        </Kbd>
      ))}
    </span>
  );
}
