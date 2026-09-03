// Canvas zoom configuration
export const SCALE_BY = 1.1; // Zoom multiplier per scroll increment
export const MIN_SCALE = 0.1; // Minimum zoom level (10%)
export const MAX_SCALE = 30; // Maximum zoom level (500%)

export const RENDER_STYLES = {
  ROUGH: "rough",
  CLEAN: "clean",
};

// Quick-pick stroke colours, shared by the desktop style panel and the mobile
// tools sheet so both offer the same palette.
export const STROKE_SWATCHES = [
  "#111827",
  "#2563eb",
  "#dc2626",
  "#f59e0b",
  "#16a34a",
  "#a855f7",
];

// Default styling applied to new shapes
export const DEFAULT_STYLE = {
  stroke: "#111827",
  strokeWidth: 2,
  fill: "#ffffff",
  fillEnabled: false,
  opacity: 1,
  edgeStyle: "round",
  strokeStyle: "solid",
  bendStyle: "corner",
  renderStyle: RENDER_STYLES.ROUGH,
  fontFamily: "Inter",
  fontSize: 24,
};
