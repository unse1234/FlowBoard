// @ts-check

/**
 * Human- and assistive-tech-readable shortcut labels.
 *
 * Shortcuts are written once as a combo string — "R", "mod+Z", "mod+shift+Z" —
 * where `mod` is Cmd on Apple platforms and Ctrl everywhere else, matching how
 * the shortcut registry treats the two as one intent.
 */

const IS_APPLE =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

const APPLE_LABELS = { mod: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃" };
const OTHER_LABELS = { mod: "Ctrl", shift: "Shift", alt: "Alt", ctrl: "Ctrl" };

const KEY_LABELS = {
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  escape: "Esc",
  delete: "Del",
  backspace: "⌫",
  space: "Space",
  enter: "↵",
};

/**
 * @param {string} combo
 * @returns {string[]}
 */
function splitCombo(combo) {
  // "+" itself is a key, so split on "+" only between non-empty parts.
  return String(combo)
    .split(/\+(?!$)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Keycap labels for display.
 *
 * @param {string} combo
 * @param {{ apple?: boolean }} [options]
 * @returns {string[]}
 */
export function formatShortcut(combo, { apple = IS_APPLE } = {}) {
  const modifiers = apple ? APPLE_LABELS : OTHER_LABELS;

  return splitCombo(combo).map((part) => {
    const key = part.toLowerCase();
    if (key in modifiers) return modifiers[/** @type {keyof typeof modifiers} */ (key)];
    if (key in KEY_LABELS) return KEY_LABELS[/** @type {keyof typeof KEY_LABELS} */ (key)];

    return part.length === 1 ? part.toUpperCase() : part;
  });
}

/**
 * Value for the `aria-keyshortcuts` attribute.
 *
 * @param {string} combo
 * @param {{ apple?: boolean }} [options]
 * @returns {string}
 */
export function toAriaKeyShortcuts(combo, { apple = IS_APPLE } = {}) {
  return splitCombo(combo)
    .map((part) => {
      const key = part.toLowerCase();
      if (key === "mod") return apple ? "Meta" : "Control";
      if (key === "ctrl") return "Control";
      if (key === "shift") return "Shift";
      if (key === "alt") return "Alt";

      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
}
