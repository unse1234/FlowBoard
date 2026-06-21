import { DEFAULT_STYLE } from "../constants/canvas";

/**
 * Merges shape's custom style with global default style
 * Shape properties take precedence, filling gaps with defaults
 *
 * @param {Object} shape - Shape object with optional style property
 * @returns {Object} Complete style object with all properties defined
 */
export const getShapeStyle = (shape) => ({
  ...DEFAULT_STYLE,
  ...(shape?.style ?? {}),
});

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
