import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Redo2,
  Scan,
  Undo2,
} from "lucide-react";
import { MAX_SCALE, MIN_SCALE } from "../constants/canvas";

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.5, 2, 3];

/**
 * ZoomPill — bottom-left cluster: zoom readout with a preset menu, undo, redo.
 *
 * Painted on the pill tokens so it reads as a canvas control rather than a
 * panel — dark in both themes, unlike the inverting ink chips.
 */
export function ZoomPill({ scale, onSetZoom, onResetZoom, onUndo, onRedo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  return (
    <div
      ref={containerRef}
      className={[
        "relative flex items-center gap-0.5 rounded-panel p-1",
        "border border-border bg-pill text-on-pill shadow-panel",
      ].join(" ")}
    >
      <button
        type="button"
        title="Zoom level"
        onClick={() => setMenuOpen((open) => !open)}
        className={[
          "flex h-8 items-center gap-1 rounded-button px-2",
          "text-[12px] font-semibold tabular-nums",
          "transition-colors duration-150 hover:bg-on-pill/12",
        ].join(" ")}
      >
        {Math.round(scale * 100)}%
        <ChevronDown size={13} className="opacity-70" />
      </button>

      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-on-pill/20" />

      <PillButton title="Undo (Ctrl+Z)" onClick={onUndo}>
        <Undo2 size={15} />
      </PillButton>
      <PillButton title="Redo (Ctrl+Shift+Z)" onClick={onRedo}>
        <Redo2 size={15} />
      </PillButton>

      {menuOpen && (
        <div
          role="menu"
          className={[
            "fb-animate-pop absolute bottom-full left-0 mb-2 w-32 overflow-hidden",
            "rounded-panel border border-border bg-surface p-1 shadow-popover",
          ].join(" ")}
        >
          {ZOOM_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              role="menuitem"
              onClick={() => {
                onSetZoom(preset);
                setMenuOpen(false);
              }}
              className={[
                "flex w-full items-center justify-between rounded-button px-2 py-1.5",
                "text-[12px] font-medium transition-colors duration-150",
                Math.abs(scale - preset) < 0.005
                  ? "bg-brand-soft text-brand"
                  : "text-text hover:bg-surface-hover",
              ].join(" ")}
            >
              {Math.round(preset * 100)}%
            </button>
          ))}

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onResetZoom();
              setMenuOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-button px-2 py-1.5 text-[12px] font-medium text-text hover:bg-surface-hover"
          >
            Reset view
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ViewControls — bottom-right cluster: zoom out/in and fullscreen.
 *
 * "Fit to screen" is in the design but needs a bounding box across every shape
 * type, which the geometry layer does not expose yet, so it renders disabled.
 */
export function ViewControls({ scale, onZoomIn, onZoomOut }) {
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    const handleChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));

    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {
        // Denied by the browser (permissions policy, or no user gesture) —
        // the button simply stays in its current state.
      });
    }
  };

  return (
    <div
      className={[
        "flex items-center gap-0.5 rounded-panel p-1",
        "border border-border bg-pill text-on-pill shadow-panel",
      ].join(" ")}
    >
      <PillButton disabled title="Fit to screen — not available yet">
        <Scan size={15} />
      </PillButton>

      <PillButton
        title="Zoom out"
        disabled={scale <= MIN_SCALE + 0.001}
        onClick={onZoomOut}
      >
        <Minus size={15} />
      </PillButton>

      <PillButton
        title="Zoom in"
        disabled={scale >= MAX_SCALE - 0.001}
        onClick={onZoomIn}
      >
        <Plus size={15} />
      </PillButton>

      <PillButton
        title={isFullscreen ? "Exit full screen" : "Full screen"}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
      </PillButton>
    </div>
  );
}

function PillButton({ title, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "grid h-8 w-8 place-items-center rounded-button",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-35",
        "enabled:hover:bg-on-pill/12",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
