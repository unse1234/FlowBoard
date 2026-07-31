import { DEFAULT_STYLE } from "../constants/canvas";
import { ThemeManager } from "../features/theme/ThemeManager.js";

const themeManager = new ThemeManager();

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
 * Merges shape's custom style with global default style
 * Shape properties take precedence, filling gaps with defaults
 *
 * @param {Object} shape - Shape object with optional style property
 * @returns {Object} Complete style object with all properties defined
 */
export const getShapeStyle = (shape) => {
  const baseStyle = {
    ...DEFAULT_STYLE,
    ...(shape?.style ?? {}),
  };

  if (themeManager.isDarkTheme() && isDarkColor(baseStyle.stroke)) {
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
