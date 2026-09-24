import { DEFAULT_STYLE } from "../constants/canvas.js";
import { needsLightInkOnDarkCanvas } from "./color.js";

const normalizeHexColor = (color) =>
  String(color || "")
    .trim()
    .replace(/^#/, "")
    .slice(0, 6)
    .toLowerCase();

const hexToRgb = (hex) => {
  const normalized = normalizeHexColor(hex);
  if (normalized.length !== 6) {
    return null;
  }

  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
};

const isDarkColor = (color) => {
  const rgb = hexToRgb(color);
  if (!rgb) return false;

  const brightness = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  return brightness < 128;
};

/**
 * Picks text ink that stays readable on a given background.
 *
 * Notes carry their own fill, so their text cannot use the themed stroke colour
 * — getShapeStyle flips dark strokes to white in dark mode, which would put
 * white text on a pale yellow note.
 *
 * @param {string} background - Background colour the text sits on
 * @returns {string} A readable ink colour
 */
export const getReadableInk = (background) =>
  isDarkColor(background) ? "#f8fafc" : "#111827";

/**
 * The stored style merged over the defaults, without the dark-mode stroke flip.
 *
 * Style controls compare against this rather than getShapeStyle, so the ink
 * swatch stays selected on the dark canvas where ink strokes render white. It
 * is also what an edit may write back into a shape: the drawn colour must never
 * be saved, or ink drawn on the dark canvas turns white for good.
 *
 * @param {Object} shape
 * @returns {Object}
 */
export const getBaseShapeStyle = (shape) => ({
  ...DEFAULT_STYLE,
  ...(shape?.style ?? {}),
});

/**
 * The style a shape is drawn with: its stored style over the defaults, adjusted
 * for the canvas it is drawn on.
 *
 * On the dark canvas a near-black stroke is drawn white so it stays visible.
 * Only strokes that would all but vanish are swapped; a chosen blue, red or
 * green keeps its colour.
 *
 * The theme is passed in rather than read from the page. Shape renderers are
 * memoised, so a component that draws with this has to receive the theme as a
 * prop for a theme change to reach it.
 *
 * @param {Object} shape - Shape object with optional style property
 * @param {{ isDark?: boolean }} [canvas] - whether the canvas is dark
 * @returns {Object} Complete style object with all properties defined
 */
export const getShapeStyle = (shape, { isDark = false } = {}) => {
  const baseStyle = getBaseShapeStyle(shape);

  if (isDark && needsLightInkOnDarkCanvas(baseStyle.stroke)) {
    return {
      ...baseStyle,
      stroke: "#ffffff",
    };
  }

  return baseStyle;
};

/**
 * Converts stroke style setting to Konva dash array format
 * Used for visual patterns: dashed (- - -), dotted (· · ·), or solid
 *
 * @param {Object} style - Style object with strokeStyle and strokeWidth
 * @returns {Array} Dash pattern array [dashLength, gapLength] or [] for solid
 */
export const getStrokeDash = (style) => {
  if (style.strokeStyle === "dashed")
    return [style.strokeWidth * 5, style.strokeWidth * 3];

  if (style.strokeStyle === "dotted") return [1, style.strokeWidth * 2.5];

  return [];
};
