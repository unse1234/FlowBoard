// @ts-check

/**
 * Declarative keyboard shortcuts.
 *
 * A binding is data, not a branch in an if-chain, so features can register their
 * own keys without every new shortcut growing one handler. Matching is strict
 * about modifiers: a binding that does not ask for shift will not fire when
 * shift is held, which is what keeps Ctrl+Z and Ctrl+Shift+Z distinct.
 *
 * @typedef {Object} Shortcut
 * @property {string} key            Compared case-insensitively (e.g. "z", "Delete", "ArrowLeft")
 * @property {boolean} [ctrl]        Matches Ctrl on Windows/Linux or Cmd on macOS
 * @property {boolean} [shift]
 * @property {boolean} [alt]
 * @property {boolean} [allowInEditable]  Fire even while typing in a field
 * @property {(event: KeyboardEvent) => void} handler
 * @property {string} [description]  For discoverability / future help UI
 */

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * True when keystrokes belong to the element rather than the board.
 *
 * Covers contentEditable as well as form fields — the tag list alone would let
 * a shortcut fire inside a rich-text host and silently eat the keystroke.
 *
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function isEditableTarget(target) {
  const element = /** @type {HTMLElement | null} */ (target);
  if (!element || typeof element !== "object") return false;
  if (EDITABLE_TAGS.has(element.tagName)) return true;

  return element.isContentEditable === true;
}

/**
 * @param {unknown} key
 * @returns {string}
 */
function normalizeKey(key) {
  return String(key ?? "").toLowerCase();
}

/**
 * @param {Shortcut} shortcut
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @returns {boolean}
 */
export function matchesShortcut(shortcut, event) {
  if (normalizeKey(shortcut.key) !== normalizeKey(event.key)) return false;

  // Ctrl and Cmd are the same intent; treating them as one keeps every binding
  // cross-platform without declaring each twice.
  const wantsCommand = shortcut.ctrl === true;
  const hasCommand = Boolean(event.ctrlKey || event.metaKey);
  if (wantsCommand !== hasCommand) return false;

  if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) return false;
  if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return false;

  return true;
}

/**
 * First binding that matches, or null.
 *
 * Order matters: register more specific bindings before general ones.
 *
 * @param {Shortcut[]} shortcuts
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @param {{ editable?: boolean }} [context]
 * @returns {Shortcut | null}
 */
export function findShortcut(shortcuts, event, context = {}) {
  for (const shortcut of shortcuts) {
    if (!shortcut) continue;
    if (context.editable && !shortcut.allowInEditable) continue;
    if (matchesShortcut(shortcut, event)) return shortcut;
  }

  return null;
}
