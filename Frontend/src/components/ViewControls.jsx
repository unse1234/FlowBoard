import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Scan,
  Undo2,
} from "lucide-react";
import { MAX_SCALE, MIN_SCALE } from "../constants/canvas";
import { cx, Divider, IconButton, Island, Menu } from "./ui/index.js";

const ZOOM_PRESETS = [0.5, 1, 2];
const ICON = { size: 16, strokeWidth: 1.75 };

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));

    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }

    document.documentElement.requestFullscreen?.().catch(() => {
      // Denied by the browser (permissions policy, or no user gesture).
    });
  }, []);

  const supported =
    typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen);

  return { isFullscreen, toggle, supported };
}

/**
 * ViewControls — bottom-left island: history and zoom.
 *
 * Undo and redo lead because they are used far more than zoom. The zoom
 * readout opens a menu holding presets, fit, reset and full screen, so the
 * island stays four buttons wide. Below desktop width the −/+ buttons fold
 * into that menu too.
 */
function ViewControls({
  scale,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onSetZoom,
  onResetZoom,
  onFitToScreen,
  canFitToScreen = false,
  showZoomButtons = true,
  touch = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const zoomButtonRef = useRef(null);
  const fullscreen = useFullscreen();
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const percent = Math.round(scale * 100);
  const size = touch ? "xl" : "md";
  const atMax = scale >= MAX_SCALE - 0.001;
  const atMin = scale <= MIN_SCALE + 0.001;

  const items = [
    { id: "zoom-in", label: "Zoom in", icon: Plus, disabled: atMax, onSelect: onZoomIn },
    { id: "zoom-out", label: "Zoom out", icon: Minus, disabled: atMin, onSelect: onZoomOut },
    { type: "separator" },
    ...ZOOM_PRESETS.map((preset) => ({
      id: `zoom-${preset}`,
      type: "checkbox",
      label: `Zoom to ${preset * 100}%`,
      checked: Math.abs(scale - preset) < 0.005,
      onSelect: () => onSetZoom(preset),
    })),
    { type: "separator" },
    {
      id: "fit",
      label: "Zoom to fit",
      icon: Scan,
      disabled: !canFitToScreen,
      onSelect: onFitToScreen,
    },
    { id: "reset", label: "Reset view", icon: RotateCcw, onSelect: onResetZoom },
    fullscreen.supported && { type: "separator" },
    fullscreen.supported && {
      id: "fullscreen",
      label: fullscreen.isFullscreen ? "Exit full screen" : "Full screen",
      icon: fullscreen.isFullscreen ? Minimize : Maximize,
      onSelect: fullscreen.toggle,
    },
  ];

  return (
    <Island
      role="toolbar"
      aria-label="History and zoom"
      className="flex items-center gap-0.5 p-1"
    >
      <IconButton label="Undo" shortcut="mod+Z" size={size} disabled={!canUndo} onClick={onUndo}>
        <Undo2 {...ICON} />
      </IconButton>
      <IconButton
        label="Redo"
        shortcut="mod+shift+Z"
        size={size}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 {...ICON} />
      </IconButton>

      <Divider vertical className="mx-1" />

      {showZoomButtons ? (
        <IconButton label="Zoom out" size={size} disabled={atMin} onClick={onZoomOut}>
          <Minus {...ICON} />
        </IconButton>
      ) : null}

      <button
        ref={zoomButtonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Zoom ${percent}%, zoom options`}
        onClick={() => setMenuOpen((open) => !open)}
        className={cx(
          "flex min-w-14 items-center justify-center gap-0.5 rounded-md px-1.5",
          "text-label tabular-nums text-text transition-colors duration-150 hover:bg-hover",
          touch ? "h-11" : "h-8",
          menuOpen && "bg-pressed",
        )}
      >
        {percent}%
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className="text-text-muted" />
      </button>

      {showZoomButtons ? (
        <IconButton label="Zoom in" size={size} disabled={atMax} onClick={onZoomIn}>
          <Plus {...ICON} />
        </IconButton>
      ) : null}

      <Menu
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={zoomButtonRef}
        placement="top-start"
        label="Zoom"
        items={items}
      />
    </Island>
  );
}

export default memo(ViewControls);
