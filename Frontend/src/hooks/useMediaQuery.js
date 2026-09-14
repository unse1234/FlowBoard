import { useCallback, useSyncExternalStore } from "react";

const NOOP_UNSUBSCRIBE = () => {};

/**
 * useMediaQuery — subscribe to a CSS media query from React.
 *
 * The shell needs the breakpoint in JS (not only in CSS) because layouts render
 * different components — a bottom sheet on a phone versus a popover on a
 * laptop — rather than the same markup at two widths.
 *
 * Implemented with useSyncExternalStore so the value is read during render
 * instead of being copied into state by an effect; that removes the extra
 * render pass, and the first paint is never wrong.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onStoreChange) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return NOOP_UNSUBSCRIBE;
      }

      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onStoreChange);
      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Breakpoints, in rem so they track the user's browser font size exactly as
 * the Tailwind `md` / `lg` variants in index.css do.
 */
export const BREAKPOINT_QUERIES = Object.freeze({
  tabletUp: "(min-width: 48rem)",
  desktopUp: "(min-width: 79.375rem)",
});

/** ≥ 1270px — full tool dock, minimap. */
export function useIsDesktop() {
  return useMediaQuery(BREAKPOINT_QUERIES.desktopUp);
}

/** ≥ 768px — floating islands and popovers rather than the phone layout. */
export function useIsTabletUp() {
  return useMediaQuery(BREAKPOINT_QUERIES.tabletUp);
}

/** Touch-first input: larger targets, no hover-only affordances. */
export function useIsCoarsePointer() {
  return useMediaQuery("(pointer: coarse)");
}
