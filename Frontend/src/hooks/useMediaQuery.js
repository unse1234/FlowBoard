import { useCallback, useSyncExternalStore } from "react";

const NOOP_UNSUBSCRIBE = () => {};

/**
 * useMediaQuery — subscribe to a CSS media query from React.
 *
 * The shell needs the desktop/mobile split in JS (not only in CSS) because the
 * two layouts render different components — a bottom sheet on mobile versus a
 * docked panel on desktop — rather than the same markup at two widths.
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

/** Matches the Tailwind `lg` breakpoint the shell switches layouts at. */
export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}
