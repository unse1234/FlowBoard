import { useMemo } from "react";
import { TOOLS } from "../constants/tools.js";
import { useShortcuts } from "../features/shortcuts/useShortcuts.js";

/**
 * Single-key tool shortcuts, matching the hints shown in the toolbar tooltips.
 * Keep the two in step — a tooltip that promises a key that does nothing is
 * worse than no tooltip.
 */
const TOOL_SHORTCUTS = {
  v: TOOLS.SELECT,
  r: TOOLS.RECT,
  o: TOOLS.CIRCLE,
  d: TOOLS.DIAMOND,
  l: TOOLS.LINE,
  a: TOOLS.ARROW,
  p: TOOLS.PEN,
  t: TOOLS.TEXT,
  n: TOOLS.NOTE,
  h: TOOLS.PAN,
  k: TOOLS.LASER,
  e: TOOLS.ERASER,
};

/** Board units moved per arrow press, and per arrow press with shift held. */
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;

/**
 * useKeyboardShortcuts — the board's key bindings, as data.
 *
 * The arrow keys do double duty. They have always meant undo and redo here, and
 * people rely on that, but arrows are also how you nudge a selection on every
 * other canvas tool. Both fit: with something selected the arrows move it, and
 * with an empty selection they fall back to undo and redo. Ctrl+Z is unaffected
 * either way, so the primary spelling of undo never moves.
 *
 * @param {Object} config
 * @param {Function} config.undo
 * @param {Function} config.redo
 * @param {Function} config.onDelete
 * @param {Function} [config.onSelectAll]
 * @param {Function} [config.onClearSelection]
 * @param {(dx: number, dy: number) => boolean} [config.onNudge] - returns false
 *   when there is no selection to move
 * @param {Function} [config.setTool]
 */
export function useKeyboardShortcuts({
  undo,
  redo,
  onDelete,
  onSelectAll,
  onClearSelection,
  onNudge,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onGroup,
  onUngroup,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  setTool,
}) {
  const shortcuts = useMemo(() => {
    const nudgeOr = (dx, dy, fallback) => () => {
      if (onNudge?.(dx, dy)) return;
      fallback?.();
    };

    const bindings = [
      { key: "z", ctrl: true, shift: true, description: "Redo", handler: () => redo() },
      { key: "z", ctrl: true, description: "Undo", handler: () => undo() },
      {
        key: "a",
        ctrl: true,
        description: "Select all",
        handler: () => onSelectAll?.(),
      },
      {
        key: "Escape",
        description: "Clear selection",
        handler: () => onClearSelection?.(),
      },

      // Large nudges first is not required — modifier matching is strict — but
      // keeping the pairs adjacent makes the table readable.
      {
        key: "ArrowLeft",
        shift: true,
        description: "Nudge left",
        handler: nudgeOr(-NUDGE_STEP_LARGE, 0),
      },
      {
        key: "ArrowRight",
        shift: true,
        description: "Nudge right",
        handler: nudgeOr(NUDGE_STEP_LARGE, 0),
      },
      {
        key: "ArrowUp",
        shift: true,
        description: "Nudge up",
        handler: nudgeOr(0, -NUDGE_STEP_LARGE),
      },
      {
        key: "ArrowDown",
        shift: true,
        description: "Nudge down",
        handler: nudgeOr(0, NUDGE_STEP_LARGE),
      },

      {
        key: "ArrowLeft",
        description: "Nudge left, or undo with nothing selected",
        handler: nudgeOr(-NUDGE_STEP, 0, undo),
      },
      {
        key: "ArrowRight",
        description: "Nudge right, or redo with nothing selected",
        handler: nudgeOr(NUDGE_STEP, 0, redo),
      },
      { key: "ArrowUp", description: "Nudge up", handler: nudgeOr(0, -NUDGE_STEP) },
      { key: "ArrowDown", description: "Nudge down", handler: nudgeOr(0, NUDGE_STEP) },

      { key: "c", ctrl: true, description: "Copy", handler: () => onCopy?.() },
      { key: "x", ctrl: true, description: "Cut", handler: () => onCut?.() },
      { key: "v", ctrl: true, description: "Paste", handler: () => onPaste?.() },
      {
        key: "d",
        ctrl: true,
        description: "Duplicate",
        handler: () => onDuplicate?.(),
      },

      {
        key: "g",
        ctrl: true,
        shift: true,
        description: "Ungroup",
        handler: () => onUngroup?.(),
      },
      { key: "g", ctrl: true, description: "Group", handler: () => onGroup?.() },

      {
        key: "]",
        ctrl: true,
        description: "Bring to front",
        handler: () => onBringToFront?.(),
      },
      {
        key: "[",
        ctrl: true,
        description: "Send to back",
        handler: () => onSendToBack?.(),
      },
      { key: "]", description: "Bring forward", handler: () => onBringForward?.() },
      { key: "[", description: "Send backward", handler: () => onSendBackward?.() },

      { key: "Delete", description: "Delete selection", handler: () => onDelete?.() },
      { key: "Backspace", description: "Delete selection", handler: () => onDelete?.() },
    ];

    if (setTool) {
      for (const [key, tool] of Object.entries(TOOL_SHORTCUTS)) {
        bindings.push({
          key,
          description: "Select the " + tool + " tool",
          handler: () => setTool(tool),
        });
      }
    }

    return bindings;
  }, [
    onBringForward,
    onBringToFront,
    onClearSelection,
    onCopy,
    onCut,
    onDelete,
    onDuplicate,
    onGroup,
    onPaste,
    onNudge,
    onSelectAll,
    onSendBackward,
    onSendToBack,
    onUngroup,
    redo,
    setTool,
    undo,
  ]);

  useShortcuts(shortcuts);
}
