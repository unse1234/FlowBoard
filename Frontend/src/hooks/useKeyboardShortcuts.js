import { useMemo } from "react";
import { TOOL_SHORTCUTS } from "../constants/toolMeta.js";
import {
  BOARD_SHORTCUTS,
  NUDGE_STEP,
  NUDGE_STEP_LARGE,
} from "../features/shortcuts/boardShortcuts.js";
import { useShortcuts } from "../features/shortcuts/useShortcuts.js";

/**
 * useKeyboardShortcuts — binds the board's shortcut tables to handlers.
 *
 * The bindings themselves are data in `features/shortcuts/boardShortcuts.js`
 * and `constants/toolMeta.js`; this hook only decides what each action does.
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

    const handlers = {
      redo: () => redo(),
      undo: () => undo(),
      selectAll: () => onSelectAll?.(),
      clearSelection: () => onClearSelection?.(),

      nudgeLeftLarge: nudgeOr(-NUDGE_STEP_LARGE, 0),
      nudgeRightLarge: nudgeOr(NUDGE_STEP_LARGE, 0),
      nudgeUpLarge: nudgeOr(0, -NUDGE_STEP_LARGE),
      nudgeDownLarge: nudgeOr(0, NUDGE_STEP_LARGE),

      nudgeLeft: nudgeOr(-NUDGE_STEP, 0, undo),
      nudgeRight: nudgeOr(NUDGE_STEP, 0, redo),
      nudgeUp: nudgeOr(0, -NUDGE_STEP),
      nudgeDown: nudgeOr(0, NUDGE_STEP),

      copy: () => onCopy?.(),
      cut: () => onCut?.(),
      paste: () => onPaste?.(),
      duplicate: () => onDuplicate?.(),

      ungroup: () => onUngroup?.(),
      group: () => onGroup?.(),

      bringToFront: () => onBringToFront?.(),
      sendToBack: () => onSendToBack?.(),
      bringForward: () => onBringForward?.(),
      sendBackward: () => onSendBackward?.(),

      delete: () => onDelete?.(),
    };

    const bindings = BOARD_SHORTCUTS.map(
      ({ action, key, ctrl, shift, alt, description }) => ({
        key,
        ctrl,
        shift,
        alt,
        description,
        handler: handlers[action],
      }),
    );

    if (setTool) {
      for (const [tool, key] of Object.entries(TOOL_SHORTCUTS)) {
        bindings.push({
          key: key.toLowerCase(),
          description: `Select the ${tool} tool`,
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
