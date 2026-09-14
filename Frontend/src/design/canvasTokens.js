// @ts-check

/**
 * Canvas colour tokens.
 *
 * Konva paints to a bitmap and cannot resolve CSS variables, so the colours the
 * canvas draws with are mirrored here from the `--fb-*` palettes in index.css.
 * Change the two together.
 *
 * Only interaction chrome lives here — selection, guides, grid, cursors. Shape
 * colours belong to the shapes themselves and are never themed.
 */

const LIGHT = Object.freeze({
  background: "#f8f8f7",
  selection: "#3a6df0",
  selectionFill: "rgba(58, 109, 240, 0.08)",
  handleFill: "#ffffff",
  guide: "#ff3d71",
  grid: "rgba(34, 34, 34, 0.12)",
  minimapShape: "rgba(34, 34, 34, 0.3)",
  laser: "#ff3b30",
  eraserTrail: "rgba(34, 34, 34, 0.22)",
  cursorOutline: "#ffffff",
  cursorLabelText: "#ffffff",
});

const DARK = Object.freeze({
  background: "#151515",
  selection: "#7c9dff",
  selectionFill: "rgba(124, 157, 255, 0.12)",
  handleFill: "#151515",
  guide: "#ff5c8a",
  grid: "rgba(255, 255, 255, 0.09)",
  minimapShape: "rgba(255, 255, 255, 0.32)",
  laser: "#ff5f57",
  eraserTrail: "rgba(255, 255, 255, 0.25)",
  cursorOutline: "#151515",
  cursorLabelText: "#ffffff",
});

/**
 * @param {string} theme - "light" | "dark"
 * @returns {typeof LIGHT}
 */
export function getCanvasPalette(theme) {
  return theme === "dark" ? DARK : LIGHT;
}
