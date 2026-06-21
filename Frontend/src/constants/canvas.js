// Canvas zoom configuration
export const SCALE_BY = 1.1; // Zoom multiplier per scroll increment
export const MIN_SCALE = 0.1; // Minimum zoom level (10%)
export const MAX_SCALE = 30; // Maximum zoom level (500%)

export const RENDER_STYLES = {
  ROUGH: "rough",
  CLEAN: "clean",
};

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
