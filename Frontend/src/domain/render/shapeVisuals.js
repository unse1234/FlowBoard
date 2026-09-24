// @ts-check

import { getShapeStyle, getStrokeDash } from "../../utils/styleUtils.js";

/**
 * How a shape should be drawn, as plain data.
 *
 * Separated from the renderers so it can be tested without a build step: the
 * strategies are .jsx and Node cannot run them directly, which is why four
 * bugs in these decisions went unnoticed.
 *
 * The rule the whole module exists to enforce: **opacity belongs to the shape,
 * so it is applied once, to the outermost node, and never to an inner one.**
 * Konva multiplies a group's opacity into its children, so setting it in both
 * places composites it twice — and a shape drawn from two overlapping strokes
 * then reads darker where they cross than where they do not.
 */

/** How far a shape fades while the eraser is over it. */
export const ERASING_OPACITY = 0.25;

/**
 * The opacity of the outermost node of a shape.
 *
 * While erasing, the shape's own opacity is scaled rather than replaced, so a
 * shape that is already faint does not become *more* visible as it is about to
 * be deleted.
 *
 * @param {Object} shape
 * @param {{ isErasing?: boolean }} [options]
 * @returns {number}
 */
export function getShapeOpacity(shape, { isErasing = false } = {}) {
  const { opacity = 1 } = getShapeStyle(shape);

  return isErasing ? opacity * ERASING_OPACITY : opacity;
}

/**
 * Konva props for a shape's outline.
 *
 * Deliberately carries **no** opacity: these go on inner nodes, which inherit
 * it from the group above them.
 *
 * @param {Object} shape
 * @param {{ isDark?: boolean }} [options]
 */
export function getStrokeProps(shape, { isDark = false } = {}) {
  const style = getShapeStyle(shape, { isDark });
  const edgeIsRound = style.edgeStyle === "round";

  return {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    dash: getStrokeDash(style),
    lineCap: edgeIsRound ? "round" : "butt",
    lineJoin: edgeIsRound ? "round" : "miter",
  };
}

/**
 * The colour a shape's interior is painted, or undefined for no fill.
 *
 * The same answer for both rendering styles. A sketchy shape used to wash its
 * fill down to 18%, so the colour a person picked looked nothing like the
 * swatch they picked it from — and looked different again after switching to
 * the clean style. The sketchiness is in the strokes, not in the fill.
 *
 * @param {Object} shape
 * @param {{ isDark?: boolean }} [options]
 * @returns {string | undefined}
 */
export function getFillColor(shape, { isDark = false } = {}) {
  const style = getShapeStyle(shape, { isDark });

  return style.fillEnabled ? style.fill : undefined;
}

/**
 * Whether a shape's corners and joins are rounded.
 *
 * @param {Object} shape
 * @returns {boolean}
 */
export function isRoundEdged(shape) {
  return getShapeStyle(shape).edgeStyle === "round";
}
