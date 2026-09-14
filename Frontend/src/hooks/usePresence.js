import { useEffect, useState } from "react";

/**
 * Keep an element mounted long enough to play its exit animation.
 *
 * Returns `mounted` (render it at all) and `state` ("open" | "closed"), which
 * drives the `data-state` enter/exit animation classes in index.css. Opening
 * mounts immediately; closing unmounts after `exitDuration`.
 *
 * Previous `open` is tracked in state and compared during render — React's
 * documented pattern for adjusting state when a prop changes — so no effect
 * has to set state synchronously.
 *
 * @param {boolean} open
 * @param {number} [exitDuration=160]
 */
export function usePresence(open, exitDuration = 160) {
  const [previousOpen, setPreviousOpen] = useState(open);
  const [isExiting, setIsExiting] = useState(false);

  if (previousOpen !== open) {
    setPreviousOpen(open);
    setIsExiting(!open);
  }

  useEffect(() => {
    if (!isExiting) return undefined;

    const timeoutId = window.setTimeout(() => setIsExiting(false), exitDuration);
    return () => window.clearTimeout(timeoutId);
  }, [exitDuration, isExiting]);

  return {
    mounted: open || isExiting,
    state: open ? "open" : "closed",
  };
}
