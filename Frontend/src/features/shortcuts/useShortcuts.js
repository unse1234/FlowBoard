import { useEffect, useRef } from "react";
import { findShortcut, isEditableTarget } from "./shortcutRegistry.js";

/**
 * Binds a shortcut list to the window.
 *
 * The list is held in a ref so a caller can rebuild its bindings on every render
 * (they close over current state) without this hook tearing the listener down
 * and re-adding it each time.
 *
 * @param {import("./shortcutRegistry.js").Shortcut[]} shortcuts
 */
export function useShortcuts(shortcuts) {
  const shortcutsRef = useRef(shortcuts);

  // Written after paint rather than during render; the listener only reads it
  // from a keydown, which can never run mid-render.
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const editable =
        isEditableTarget(event.target) || isEditableTarget(document.activeElement);

      const shortcut = findShortcut(shortcutsRef.current, event, { editable });
      if (!shortcut) return;

      event.preventDefault();
      shortcut.handler(event);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
