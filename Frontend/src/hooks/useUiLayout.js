import { useCallback, useEffect, useState } from "react";
import { useIsDesktop } from "./useMediaQuery.js";

/**
 * Mobile sheets. Only one is open at a time — they all occupy the bottom of the
 * screen, so they are a single slot rather than independent booleans.
 */
export const MOBILE_SHEETS = Object.freeze({
  TOOLS: "tools",
  CHAT: "chat",
  PARTICIPANTS: "participants",
  SETTINGS: "settings",
});

const LAYOUT_STORAGE_KEY = "flowboard_layout";

function loadStoredLayout() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * useUiLayout — owns which chrome is visible.
 *
 * Drives the four desktop presentations from the design: all panels open, left
 * panel collapsed to the rail, minimal (both panels hidden), and the mobile
 * layout where side panels become bottom sheets.
 *
 * Panel visibility persists across reloads; the open sheet deliberately does
 * not, since a sheet is a transient interaction.
 */
export function useUiLayout() {
  const isDesktop = useIsDesktop();

  const [leftPanelOpen, setLeftPanelOpen] = useState(
    () => loadStoredLayout()?.leftPanelOpen ?? true,
  );
  const [rightPanelOpen, setRightPanelOpen] = useState(
    () => loadStoredLayout()?.rightPanelOpen ?? true,
  );
  const [openSheetId, setOpenSheetId] = useState(null);

  // Sheets belong to the mobile layout only. Deriving this rather than clearing
  // it in an effect means a resize to desktop cannot leave a sheet stranded on
  // screen for a frame, and the phone-sized state is still there on the way back.
  const mobileSheet = isDesktop ? null : openSheetId;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({ leftPanelOpen, rightPanelOpen }),
      );
    } catch {
      // Layout preference is a convenience; a full quota is not worth failing on.
    }
  }, [leftPanelOpen, rightPanelOpen]);

  const isMinimal = !leftPanelOpen && !rightPanelOpen;

  const toggleLeftPanel = useCallback(
    () => setLeftPanelOpen((open) => !open),
    [],
  );
  const toggleRightPanel = useCallback(
    () => setRightPanelOpen((open) => !open),
    [],
  );

  /** Minimal mode hides both panels; leaving it restores both. */
  const toggleMinimal = useCallback(() => {
    setLeftPanelOpen((open) => {
      const nextMinimal = open || rightPanelOpen;
      setRightPanelOpen(!nextMinimal);
      return !nextMinimal;
    });
  }, [rightPanelOpen]);

  const openSheet = useCallback((sheet) => setOpenSheetId(sheet), []);
  const closeSheet = useCallback(() => setOpenSheetId(null), []);
  const toggleSheet = useCallback(
    (sheet) => setOpenSheetId((current) => (current === sheet ? null : sheet)),
    [],
  );

  return {
    isDesktop,
    leftPanelOpen,
    rightPanelOpen,
    isMinimal,
    toggleLeftPanel,
    toggleRightPanel,
    toggleMinimal,
    setLeftPanelOpen,
    setRightPanelOpen,
    mobileSheet,
    openSheet,
    closeSheet,
    toggleSheet,
  };
}
