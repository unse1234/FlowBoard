import { useEffect } from "react";
import { TOOLS } from "../constants/tools";

// Prevent keyboard shortcuts from interfering with form input operations
const FORM_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

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
  k: TOOLS.LASER,
  e: TOOLS.ERASER,
};

/**
 * useKeyboardShortcuts Hook - Handles global keyboard shortcuts
 *
 * Undo/redo respond to both the arrow keys and Ctrl/Cmd+Z, delete removes the
 * selection, and unmodified letter keys switch tools.
 *
 * @param {Object} config - Keyboard action handlers
 * @param {Function} config.undo - Undo the last change
 * @param {Function} config.redo - Redo the last undone change
 * @param {Function} config.onDelete - Remove the current selection
 * @param {Function} [config.setTool] - Activate a tool by id
 */
export function useKeyboardShortcuts({ undo, redo, onDelete, setTool }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      // Skip shortcuts when user is typing in form fields
      if (activeElement && FORM_TAGS.includes(activeElement.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.key === "ArrowLeft") {
        undo();
        return;
      }
      if (e.key === "ArrowRight") {
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        onDelete?.();
        return;
      }

      const shortcutTool = TOOL_SHORTCUTS[e.key.toLowerCase()];
      if (shortcutTool && setTool) {
        setTool(shortcutTool);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDelete, redo, setTool, undo]);
}
