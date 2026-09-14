import { useEffect, useRef, useState } from "react";
import { isEditableTarget } from "../features/shortcuts/shortcutRegistry.js";

/**
 * Tracks whether space is being held for temporary panning.
 *
 * Space-to-pan is a hold, not a toggle, so it cannot live in the shortcut
 * registry — that fires on keydown and knows nothing about release. The state
 * drives the cursor and disables shape dragging; the ref lets the pointer
 * handlers read it without taking a dependency that would churn their identity.
 *
 * A window blur clears the hold, otherwise alt-tabbing mid-pan would leave the
 * board stuck in pan mode with no key to release.
 */
export function useCanvasPan() {
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const isSpaceHeldRef = useRef(false);

  useEffect(() => {
    const setHeld = (held) => {
      if (isSpaceHeldRef.current === held) return;

      isSpaceHeldRef.current = held;
      setIsSpaceHeld(held);
    };

    const handleKeyDown = (event) => {
      if (event.code !== "Space") return;
      if (isEditableTarget(event.target)) return;

      // Space would otherwise scroll the page under the canvas.
      event.preventDefault();
      setHeld(true);
    };

    const handleKeyUp = (event) => {
      if (event.code !== "Space") return;

      setHeld(false);
    };

    const handleBlur = () => setHeld(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return { isSpaceHeld, isSpaceHeldRef };
}
