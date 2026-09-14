import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KbdCombo } from "./Kbd.jsx";

const SHOW_DELAY = 450;
/** After a tooltip hides, the next one within this window shows at once. */
const WARM_WINDOW = 400;
const GAP = 8;
const VIEWPORT_MARGIN = 8;

// Shared across every tooltip, so sweeping along a toolbar stays warm.
let lastHiddenAt = 0;

/**
 * useTooltip — hover/focus tooltip for a single trigger.
 *
 * Never shown for touch (there is no hover, and a long press already means
 * something on the canvas); shown immediately on keyboard focus. The bubble is
 * positioned imperatively in a layout effect, so opening costs one render.
 *
 * The tooltip is a visual echo of the trigger's accessible name. Anything it
 * adds — a shortcut — is exposed to assistive tech separately
 * (`aria-keyshortcuts`), so it is not wired through `aria-describedby`.
 *
 * @param {Object} options
 * @param {import("react").ReactNode} options.label
 * @param {string} [options.shortcut] - combo, e.g. "mod+Z"
 * @param {'top'|'bottom'|'left'|'right'} [options.placement]
 * @param {boolean} [options.disabled]
 */
export function useTooltip({ label, shortcut, placement = "top", disabled = false }) {
  const id = useId();
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const timerRef = useRef(null);
  const isOpenRef = useRef(false);
  const [anchor, setAnchor] = useState(null);

  const visible = Boolean(anchor) && !disabled && Boolean(label);

  const open = useCallback(
    (immediate) => {
      if (disabled || !label) return;

      window.clearTimeout(timerRef.current);

      const reveal = () => {
        const node = triggerRef.current;
        if (node) setAnchor(node.getBoundingClientRect());
      };

      if (immediate || Date.now() - lastHiddenAt < WARM_WINDOW) reveal();
      else timerRef.current = window.setTimeout(reveal, SHOW_DELAY);
    },
    [disabled, label],
  );

  const close = useCallback(() => {
    window.clearTimeout(timerRef.current);
    if (isOpenRef.current) lastHiddenAt = Date.now();
    setAnchor(null);
  }, []);

  useEffect(() => {
    isOpenRef.current = visible;
  }, [visible]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // A tooltip left open while the page scrolls or a key is pressed is stale.
  useEffect(() => {
    if (!visible) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, visible]);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!visible || !bubble) return;

    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let side = placement;
    if (side === "top" && anchor.top - GAP - height < VIEWPORT_MARGIN) side = "bottom";
    else if (side === "bottom" && anchor.bottom + GAP + height > viewportHeight - VIEWPORT_MARGIN) side = "top";
    else if (side === "left" && anchor.left - GAP - width < VIEWPORT_MARGIN) side = "right";
    else if (side === "right" && anchor.right + GAP + width > viewportWidth - VIEWPORT_MARGIN) side = "left";

    let top;
    let left;

    if (side === "top" || side === "bottom") {
      top = side === "top" ? anchor.top - GAP - height : anchor.bottom + GAP;
      left = anchor.left + anchor.width / 2 - width / 2;
    } else {
      top = anchor.top + anchor.height / 2 - height / 2;
      left = side === "left" ? anchor.left - GAP - width : anchor.right + GAP;
    }

    left = Math.min(Math.max(left, VIEWPORT_MARGIN), viewportWidth - VIEWPORT_MARGIN - width);
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), viewportHeight - VIEWPORT_MARGIN - height);

    bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    bubble.style.visibility = "visible";
  }, [anchor, placement, visible]);

  const triggerProps = {
    onPointerEnter: (event) => {
      if (event.pointerType !== "touch") open(false);
    },
    onPointerLeave: close,
    onPointerDown: close,
    onFocus: (event) => {
      if (event.currentTarget.matches?.(":focus-visible")) open(true);
    },
    onBlur: close,
  };

  const tooltip = visible
    ? createPortal(
        <div
          ref={bubbleRef}
          id={id}
          role="tooltip"
          style={{ visibility: "hidden" }}
          className={[
            "fb-tooltip pointer-events-none fixed left-0 top-0 z-100",
            "flex max-w-64 items-center gap-2 rounded-md border px-2 py-1",
            "border-tooltip-border bg-tooltip text-label text-tooltip-text shadow-popover",
          ].join(" ")}
        >
          <span className="truncate">{label}</span>
          {shortcut ? <KbdCombo combo={shortcut} tone="inverse" /> : null}
        </div>,
        document.body,
      )
    : null;

  return { triggerRef, triggerProps, tooltip };
}
