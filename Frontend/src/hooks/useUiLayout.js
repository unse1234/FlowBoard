import { useCallback, useEffect, useState } from "react";
import { useIsCoarsePointer, useIsDesktop, useIsTabletUp } from "./useMediaQuery.js";

/**
 * Phone-layout sheets. Only one is open at a time — they all occupy the bottom
 * of the screen — so they are a single slot rather than independent booleans.
 */
export const SHEETS = Object.freeze({
  STYLE: "style",
  PEOPLE: "people",
  MENU: "menu",
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
 * useUiLayout — which chrome is visible, and which presentation to use.
 *
 * - desktop (≥ 1270): full tool dock, minimap
 * - tablet (768–1269): floating islands with a compact dock
 * - phone (< 768): top bar, bottom dock, sheets
 *
 * Inspector and minimap visibility persist across reloads; the open sheet does
 * not, since a sheet is a transient interaction. The pre-redesign
 * `rightPanelOpen` preference is honoured as the inspector preference.
 */
export function useUiLayout() {
  const isDesktop = useIsDesktop();
  const isTabletUp = useIsTabletUp();
  const isCoarsePointer = useIsCoarsePointer();

  const [inspectorOpen, setInspectorOpen] = useState(() => {
    const stored = loadStoredLayout();
    return stored?.inspectorOpen ?? stored?.rightPanelOpen ?? true;
  });
  const [minimapVisible, setMinimapVisible] = useState(
    () => loadStoredLayout()?.minimapVisible ?? true,
  );
  const [openSheetId, setOpenSheetId] = useState(null);

  // Sheets belong to the phone layout. Deriving this rather than clearing it in
  // an effect means widening the window cannot strand a sheet on screen.
  const sheet = isTabletUp ? null : openSheetId;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({ inspectorOpen, minimapVisible }),
      );
    } catch {
      // Layout preference is a convenience; a full quota is not worth failing on.
    }
  }, [inspectorOpen, minimapVisible]);

  const toggleInspector = useCallback(() => setInspectorOpen((open) => !open), []);
  const toggleMinimap = useCallback(() => setMinimapVisible((visible) => !visible), []);

  const openSheet = useCallback((id) => setOpenSheetId(id), []);
  const closeSheet = useCallback(() => setOpenSheetId(null), []);

  return {
    isDesktop,
    isTabletUp,
    isCoarsePointer,
    inspectorOpen,
    setInspectorOpen,
    toggleInspector,
    minimapVisible,
    toggleMinimap,
    sheet,
    openSheet,
    closeSheet,
  };
}
