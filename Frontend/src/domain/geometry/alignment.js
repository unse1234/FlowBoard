// @ts-check

import { getShapeBounds, getShapesBoundingBox } from "./bounds.js";

/**
 * Aligning and distributing a selection.
 *
 * Everything is computed as a delta applied to `shape.x` / `shape.y` rather than
 * by writing the target coordinate directly. For a line or a pen stroke the
 * origin is not the top-left of its bounds, so assigning the bounds position
 * would teleport the geometry instead of moving it.
 */

export const ALIGNMENTS = Object.freeze({
  LEFT: "left",
  CENTER_X: "centerX",
  RIGHT: "right",
  TOP: "top",
  CENTER_Y: "centerY",
  BOTTOM: "bottom",
});

export const AXES = Object.freeze({
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
});

const VERTICAL_ALIGNMENTS = new Set([
  ALIGNMENTS.TOP,
  ALIGNMENTS.CENTER_Y,
  ALIGNMENTS.BOTTOM,
]);

/**
 * @param {Object} bounds
 * @param {string} alignment
 * @returns {number}
 */
function edgeOf(bounds, alignment) {
  switch (alignment) {
    case ALIGNMENTS.LEFT:
      return bounds.x;
    case ALIGNMENTS.CENTER_X:
      return bounds.x + bounds.width / 2;
    case ALIGNMENTS.RIGHT:
      return bounds.x + bounds.width;
    case ALIGNMENTS.TOP:
      return bounds.y;
    case ALIGNMENTS.CENTER_Y:
      return bounds.y + bounds.height / 2;
    case ALIGNMENTS.BOTTOM:
      return bounds.y + bounds.height;
    default:
      return 0;
  }
}

/**
 * Where each shape should move to line up with the selection's own extent.
 *
 * @param {Object[]} shapes - the selected shapes
 * @param {string} alignment
 * @returns {Map<string, { x: number, y: number }>} empty when there is nothing to do
 */
export function getAlignmentPositions(shapes, alignment) {
  const positions = new Map();
  if (shapes.length < 2) return positions;

  const selectionBounds = getShapesBoundingBox(shapes);
  if (!selectionBounds) return positions;

  const isVertical = VERTICAL_ALIGNMENTS.has(alignment);
  const target = edgeOf(selectionBounds, alignment);

  for (const shape of shapes) {
    const bounds = getShapeBounds(shape);
    if (!bounds) continue;

    const delta = target - edgeOf(bounds, alignment);
    if (delta === 0) continue;

    positions.set(String(shape.id), {
      x: isVertical ? shape.x : shape.x + delta,
      y: isVertical ? shape.y + delta : shape.y,
    });
  }

  return positions;
}

/**
 * Even out the gaps between shape centres along one axis.
 *
 * The outermost two stay put and define the span, which is what makes repeated
 * presses idempotent rather than slowly drifting the whole selection.
 *
 * @param {Object[]} shapes
 * @param {string} axis
 * @returns {Map<string, { x: number, y: number }>}
 */
export function getDistributionPositions(shapes, axis) {
  const positions = new Map();
  if (shapes.length < 3) return positions;

  const isHorizontal = axis === AXES.HORIZONTAL;
  const centreOf = (bounds) =>
    isHorizontal ? bounds.x + bounds.width / 2 : bounds.y + bounds.height / 2;

  const measured = shapes
    .map((shape) => ({ shape, bounds: getShapeBounds(shape) }))
    .filter((entry) => entry.bounds !== null)
    .sort((a, b) => centreOf(a.bounds) - centreOf(b.bounds));

  if (measured.length < 3) return positions;

  const first = centreOf(measured[0].bounds);
  const last = centreOf(measured[measured.length - 1].bounds);
  const step = (last - first) / (measured.length - 1);

  for (let index = 1; index < measured.length - 1; index += 1) {
    const { shape, bounds } = measured[index];
    const delta = first + step * index - centreOf(bounds);
    if (delta === 0) continue;

    positions.set(String(shape.id), {
      x: isHorizontal ? shape.x + delta : shape.x,
      y: isHorizontal ? shape.y : shape.y + delta,
    });
  }

  return positions;
}
