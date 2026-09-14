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

// How close, in screen pixels, an edge has to come before it snaps. Divided by
// the zoom at use, so the pull feels the same however far in or out you are.
export const SNAP_THRESHOLD = 8;

// Spacing of the optional background grid, in world units.
export const GRID_SIZE = 20;

// World units a pasted or duplicated shape is offset by, so a copy never lands
// exactly on the thing it was copied from.
export const PASTE_OFFSET = 12;

// Sticky notes. Notes are placed at a fixed size rather than drag-sized, so the
// defaults below are the whole geometry of a freshly dropped note.
export const NOTE_DEFAULTS = {
  width: 200,
  height: 200,
  padding: 14,
  fill: "#fef08a",
  // Notes start smaller than the shared 24px default, which would fit barely
  // three words across a 200px note. The style panel can still change it.
  fontSize: 16,
};

// Note background colours, offered instead of the stroke swatches when a note
// is selected — on a note the fill is the colour the user actually means.
export const NOTE_SWATCHES = [
  "#fef08a",
  "#bfdbfe",
  "#bbf7d0",
  "#fecaca",
  "#e9d5ff",
  "#fed7aa",
];

// Fill colours: white plus the note pastels, so fills and notes share a family.
export const FILL_SWATCHES = ["#ffffff", ...NOTE_SWATCHES];

// Spoken names for swatches, used as their accessible labels.
export const COLOR_NAMES = {
  "#111827": "Ink",
  "#2563eb": "Blue",
  "#dc2626": "Red",
  "#f59e0b": "Amber",
  "#16a34a": "Green",
  "#a855f7": "Purple",
  "#ffffff": "White",
  "#fef08a": "Yellow",
  "#bfdbfe": "Sky",
  "#bbf7d0": "Mint",
  "#fecaca": "Rose",
  "#e9d5ff": "Lilac",
  "#fed7aa": "Peach",
};

// Text size presets. Notes start at S (16) and text at M (24) — the defaults.
export const FONT_SIZE_PRESETS = [
  { value: 16, label: "S" },
  { value: 24, label: "M" },
  { value: 32, label: "L" },
  { value: 48, label: "XL" },
];

// Canvas faces. Both are always loaded: Inter by index.css, Excalifont locally.
export const FONT_FAMILIES = [
  { value: "Inter", label: "Sans" },
  { value: "Excalifont", label: "Hand" },
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
