// @ts-check

/**
 * The board's key bindings, as data.
 *
 * `action` names the handler that runs (wired in useKeyboardShortcuts); `combo`
 * is the display spelling read by the shortcuts reference. Tool keys live in
 * `constants/toolMeta.js` and are appended by the hook. Bindings, tooltips and
 * the shortcuts dialog all read these tables, so none can promise a key that
 * does nothing.
 *
 * The arrow keys do double duty. They have always meant undo and redo here, and
 * people rely on that, but arrows are also how you nudge a selection on every
 * other canvas tool. Both fit: with something selected the arrows move it, and
 * with an empty selection Left/Right fall back to undo and redo. Ctrl+Z is
 * unaffected either way, so the primary spelling of undo never moves.
 *
 * Kept free of React so the reference and its tests can import it directly.
 */

/** Board units moved per arrow press, and per arrow press with shift held. */
export const NUDGE_STEP = 1;
export const NUDGE_STEP_LARGE = 10;

export const BOARD_SHORTCUTS = Object.freeze([
  { action: "redo", key: "z", ctrl: true, shift: true, combo: "mod+shift+Z", description: "Redo" },
  { action: "undo", key: "z", ctrl: true, combo: "mod+Z", description: "Undo" },
  { action: "selectAll", key: "a", ctrl: true, combo: "mod+A", description: "Select all" },
  { action: "clearSelection", key: "Escape", combo: "Escape", description: "Clear selection" },

  { action: "nudgeLeftLarge", key: "ArrowLeft", shift: true, combo: "shift+ArrowLeft", description: "Nudge left" },
  { action: "nudgeRightLarge", key: "ArrowRight", shift: true, combo: "shift+ArrowRight", description: "Nudge right" },
  { action: "nudgeUpLarge", key: "ArrowUp", shift: true, combo: "shift+ArrowUp", description: "Nudge up" },
  { action: "nudgeDownLarge", key: "ArrowDown", shift: true, combo: "shift+ArrowDown", description: "Nudge down" },

  { action: "nudgeLeft", key: "ArrowLeft", combo: "ArrowLeft", description: "Nudge left, or undo with nothing selected" },
  { action: "nudgeRight", key: "ArrowRight", combo: "ArrowRight", description: "Nudge right, or redo with nothing selected" },
  { action: "nudgeUp", key: "ArrowUp", combo: "ArrowUp", description: "Nudge up" },
  { action: "nudgeDown", key: "ArrowDown", combo: "ArrowDown", description: "Nudge down" },

  { action: "copy", key: "c", ctrl: true, combo: "mod+C", description: "Copy" },
  { action: "cut", key: "x", ctrl: true, combo: "mod+X", description: "Cut" },
  { action: "paste", key: "v", ctrl: true, combo: "mod+V", description: "Paste" },
  { action: "duplicate", key: "d", ctrl: true, combo: "mod+D", description: "Duplicate" },

  { action: "ungroup", key: "g", ctrl: true, shift: true, combo: "mod+shift+G", description: "Ungroup" },
  { action: "group", key: "g", ctrl: true, combo: "mod+G", description: "Group" },

  { action: "bringToFront", key: "]", ctrl: true, combo: "mod+]", description: "Bring to front" },
  { action: "sendToBack", key: "[", ctrl: true, combo: "mod+[", description: "Send to back" },
  { action: "bringForward", key: "]", combo: "]", description: "Bring forward" },
  { action: "sendBackward", key: "[", combo: "[", description: "Send backward" },

  { action: "delete", key: "Delete", combo: "Delete", description: "Delete selection" },
  { action: "delete", key: "Backspace", combo: "Backspace", description: "Delete selection" },
]);

/**
 * Display combo for an action — the first binding when it has several — so
 * buttons and menus can show the real key without restating it.
 *
 * @param {string} action
 * @returns {string | undefined}
 */
export function getShortcutCombo(action) {
  return BOARD_SHORTCUTS.find((binding) => binding.action === action)?.combo;
}

/** Opens the shortcuts dialog; bound by the shell, which owns that dialog. */
export const SHOW_SHORTCUTS_COMBO = "?";
