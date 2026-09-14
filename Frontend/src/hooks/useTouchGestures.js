import { useEffect, useRef } from "react";
import { computePinchTransform } from "../domain/geometry/pinch.js";

/**
 * Pinch-zoom and two-finger pan on the canvas.
 *
 * Listens in the capture phase on the element wrapping the Konva stage, so it
 * sees touches before Konva does. One finger passes straight through to the
 * normal drawing handlers. The moment a second finger lands the gesture takes
 * over: `onGestureStart` abandons whatever the first finger began, and every
 * touch event is stopped from reaching Konva until all fingers lift — so a
 * pinch never draws, drags a shape or selects something on release.
 *
 * Transform updates are coalesced to one per animation frame.
 *
 * @param {{ current: HTMLElement | null }} containerRef
 * @param {Object} options
 * @param {{ x: number, y: number, scale: number }} options.transform
 * @param {(transform: { x: number, y: number, scale: number }) => void} options.onTransform
 * @param {() => void} [options.onGestureStart]
 * @param {number} options.minScale
 * @param {number} options.maxScale
 */
export function useTouchGestures(
  containerRef,
  { transform, onTransform, onGestureStart, minScale, maxScale },
) {
  const transformRef = useRef(transform);
  const handlersRef = useRef({ onTransform, onGestureStart });

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    handlersRef.current = { onTransform, onGestureStart };
  }, [onGestureStart, onTransform]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const pointers = new Map();
    let gesture = null;
    let pending = null;
    let frame = 0;

    const firstTwo = () => Array.from(pointers.values()).slice(0, 2);

    const flush = () => {
      frame = 0;
      if (!pending) return;

      handlersRef.current.onTransform(pending);
      pending = null;
    };

    // (Re)anchor on the current two touches, from the latest transform —
    // including one still waiting for its frame, so re-anchoring never jumps.
    const anchor = () => {
      gesture = {
        startTransform: pending ?? transformRef.current,
        startPoints: firstTwo(),
      };
    };

    const handlePointerDown = (event) => {
      if (event.pointerType !== "touch") return;

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size < 2) return;

      event.stopPropagation();

      if (!gesture) handlersRef.current.onGestureStart?.();
      anchor();
    };

    const handlePointerMove = (event) => {
      if (event.pointerType !== "touch" || !pointers.has(event.pointerId)) return;

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!gesture) return;

      event.stopPropagation();
      if (pointers.size < 2) return;

      pending = computePinchTransform({
        startTransform: gesture.startTransform,
        startPoints: gesture.startPoints,
        points: firstTwo(),
        minScale,
        maxScale,
      });

      if (!frame) frame = window.requestAnimationFrame(flush);
    };

    const handlePointerEnd = (event) => {
      if (event.pointerType !== "touch") return;

      pointers.delete(event.pointerId);
      if (!gesture) return;

      event.stopPropagation();

      if (pointers.size === 0) gesture = null;
      else if (pointers.size >= 2) anchor();
    };

    // Konva also listens to touch events (tap, drag); keep them away too.
    const handleTouch = (event) => {
      if (gesture || event.touches.length > 1) event.stopPropagation();
    };

    const capture = { capture: true };
    element.addEventListener("pointerdown", handlePointerDown, capture);
    element.addEventListener("pointermove", handlePointerMove, capture);
    element.addEventListener("pointerup", handlePointerEnd, capture);
    element.addEventListener("pointercancel", handlePointerEnd, capture);
    element.addEventListener("touchstart", handleTouch, capture);
    element.addEventListener("touchmove", handleTouch, capture);
    element.addEventListener("touchend", handleTouch, capture);
    element.addEventListener("touchcancel", handleTouch, capture);

    return () => {
      window.cancelAnimationFrame(frame);
      element.removeEventListener("pointerdown", handlePointerDown, capture);
      element.removeEventListener("pointermove", handlePointerMove, capture);
      element.removeEventListener("pointerup", handlePointerEnd, capture);
      element.removeEventListener("pointercancel", handlePointerEnd, capture);
      element.removeEventListener("touchstart", handleTouch, capture);
      element.removeEventListener("touchmove", handleTouch, capture);
      element.removeEventListener("touchend", handleTouch, capture);
      element.removeEventListener("touchcancel", handleTouch, capture);
    };
  }, [containerRef, maxScale, minScale]);
}
