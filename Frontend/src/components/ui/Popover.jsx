import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FOCUSABLE_SELECTOR } from "../../hooks/useFocusTrap.js";
import { usePresence } from "../../hooks/usePresence.js";
import { cx } from "./cx.js";

const VIEWPORT_MARGIN = 8;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getAnchorRect(anchorRef, anchorPoint) {
  if (anchorPoint) {
    return {
      top: anchorPoint.y,
      bottom: anchorPoint.y,
      left: anchorPoint.x,
      right: anchorPoint.x,
      width: 0,
      height: 0,
    };
  }

  return anchorRef?.current?.getBoundingClientRect() ?? null;
}

/**
 * Popover — a floating surface anchored to an element or a point.
 *
 * Rendered in a portal so no island's overflow can clip it. Positioned
 * imperatively (no render per frame), flipped when it would leave the viewport
 * and clamped to it, and re-placed when its own content resizes.
 *
 * Closes on an outside press or Escape — Escape is caught in the capture phase
 * so it closes the popover without also clearing the board selection. Focus
 * moves in on open and returns to where it came from on close.
 *
 * @param {string} placement - "<top|bottom>-<start|center|end>"
 * @param {'first'|'container'|'none'} initialFocus
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  anchorPoint,
  placement = "bottom-start",
  offset = 8,
  role = "dialog",
  label,
  initialFocus = "first",
  className = "",
  children,
}) {
  const panelRef = useRef(null);
  const { mounted, state } = usePresence(open, 120);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!mounted || !panel) return undefined;

    const place = () => {
      const rect = getAnchorRect(anchorRef, anchorPoint);
      if (!rect) return;

      const [side, align = "center"] = placement.split("-");
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const above = rect.top - offset - height;
      const below = rect.bottom + offset;
      let top = side === "top" ? above : below;

      if (side === "top" && above < VIEWPORT_MARGIN && below + height <= viewportHeight - VIEWPORT_MARGIN) {
        top = below;
      } else if (side === "bottom" && below + height > viewportHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN) {
        top = above;
      }

      let left =
        align === "start"
          ? rect.left
          : align === "end"
            ? rect.right - width
            : rect.left + rect.width / 2 - width / 2;

      left = clamp(left, VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - width);
      top = clamp(top, VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - height);

      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;

      const originX = align === "start" ? "left" : align === "end" ? "right" : "center";
      panel.style.transformOrigin = `${originX} ${top < rect.top ? "bottom" : "top"}`;
    };

    place();

    const observer = new ResizeObserver(place);
    observer.observe(panel);
    window.addEventListener("resize", place);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchorPoint, anchorRef, mounted, offset, placement]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (panelRef.current?.contains(target)) return;
      // The anchor toggles the popover itself; closing here would reopen it.
      if (anchorRef?.current?.contains(target)) return;

      onClose?.("outside");
    };

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      onClose?.("escape");
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [anchorRef, onClose, open]);

  useEffect(() => {
    if (!open) return undefined;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;

    const frame = window.requestAnimationFrame(() => {
      if (!panel || initialFocus === "none") return;

      const target =
        initialFocus === "first" ? panel.querySelector(FOCUSABLE_SELECTOR) : null;
      (target ?? panel).focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);

      const focusIsInside = panel?.contains(document.activeElement);
      if (
        focusIsInside &&
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [initialFocus, open]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={label}
      tabIndex={-1}
      data-state={state}
      style={{ left: -9999, top: -9999 }}
      className={cx(
        "fb-pop fixed z-60 rounded-lg border border-border bg-surface-raised text-text",
        "shadow-popover outline-none",
        state === "closed" && "pointer-events-none",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
