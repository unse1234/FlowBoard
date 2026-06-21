import { useEffect } from "react";

// Prevent keyboard shortcuts from interfering with form input operations
const FORM_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

/**
 * useKeyboardShortcuts Hook - Handles global keyboard shortcuts
 *
 * Listens for arrow key input to trigger undo (left) and redo (right) operations.
 * Disabled when focus is on form elements to prevent interfering with text editing.
 *
 * @param {Object} config - Keyboard action handlers
 * @param {Function} config.undo - Function to execute on left arrow press
 * @param {Function} config.redo - Function to execute on right arrow press
 * @param {Function} config.onDelete - Function to execute on delete/backspace
 */
export function useKeyboardShortcuts({ undo, redo, onDelete }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      // Skip shortcuts when user is typing in form fields
      if (activeElement && FORM_TAGS.includes(activeElement.tagName)) {
        return;
      }

      if (e.key === "ArrowLeft") {
        undo();
      }
      if (e.key === "ArrowRight") {
        redo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        onDelete?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDelete, redo, undo]);
}
