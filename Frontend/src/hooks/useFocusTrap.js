import { useEffect } from "react";

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (node) => node.getClientRects().length > 0,
  );
}

/**
 * Hold keyboard focus inside a modal surface while it is active.
 *
 * On activation focus moves to `initialFocusRef` or, failing that, the container
 * itself — so a screen reader announces the dialog's label rather than landing
 * on its close button. Tab and Shift+Tab cycle within the container. On
 * deactivation focus returns to whatever held it before, if it still exists.
 *
 * @param {{ current: HTMLElement | null }} containerRef
 * @param {boolean} active
 * @param {{ initialFocusRef?: { current: HTMLElement | null } }} [options]
 */
export function useFocusTrap(containerRef, active, { initialFocusRef } = {}) {
  useEffect(() => {
    if (!active) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused = document.activeElement;

    const frame = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? container;
      target.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (event.key !== "Tab") return;

      const nodes = getFocusable(container);
      if (nodes.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      const outside = !container.contains(current) || current === container;

      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);

      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef, initialFocusRef]);
}
