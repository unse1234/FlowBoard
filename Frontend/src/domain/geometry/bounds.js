// @ts-check

import { LINE_SHAPES } from "../shapes/shapeTypes.js";

/**
 * Axis-aligned bounds for every shape family.
 *
 * Box shapes store width/height that may be negative mid-draw, so they are
 * normalised here rather than trusted. Line shapes store `points` relative to
 * their own x/y, so the extent has to be walked and then offset.
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Bounds
 */

const isFiniteNumber = (value) => Number.isFinite(value);

/**
 * @param {Object} shape
 * @returns {Bounds | null}
 */
export function getShapeBounds(shape) {
  if (!shape) return null;

  if (LINE_SHAPES.has(shape.type)) return getLineBounds(shape);

  const x = Number(shape.x);
  const y = Number(shape.y);
  const width = Number(shape.width ?? 0);
  const height = Number(shape.height ?? 0);

  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;

  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/**
 * @param {Object} shape
 * @returns {Bounds | null}
 */
function getLineBounds(shape) {
  const points = Array.isArray(shape.points) ? shape.points : [];
  const x = Number(shape.x);
  const y = Number(shape.y);

  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (points.length < 2) return { x, y, width: 0, height: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Step in pairs; a trailing odd value is ignored rather than read as an x.
  for (let index = 0; index + 1 < points.length; index += 2) {
    const pointX = Number(points[index]);
    const pointY = Number(points[index + 1]);
    if (!isFiniteNumber(pointX) || !isFiniteNumber(pointY)) continue;

    if (pointX < minX) minX = pointX;
    if (pointX > maxX) maxX = pointX;
    if (pointY < minY) minY = pointY;
    if (pointY > maxY) maxY = pointY;
  }

  if (minX === Infinity) return { x, y, width: 0, height: 0 };

  return {
    x: x + minX,
    y: y + minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Union of every shape's bounds.
 *
 * @param {Object[]} shapes
 * @returns {Bounds | null} null when there is nothing to measure
 */
export function getShapesBoundingBox(shapes) {
  if (!Array.isArray(shapes) || shapes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    const bounds = getShapeBounds(shape);
    if (!bounds) continue;

    if (bounds.x < minX) minX = bounds.x;
    if (bounds.y < minY) minY = bounds.y;
    if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
    if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
  }

  if (minX === Infinity) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * @param {Bounds} bounds
 * @returns {{ x: number, y: number }}
 */
export function getBoundsCenter(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

/**
 * Overlap test, used by marquee selection. Touching edges count as a hit.
 *
 * @param {Bounds} a
 * @param {Bounds} b
 * @returns {boolean}
 */
export function boundsIntersect(a, b) {
  if (!a || !b) return false;

  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/**
 * True when `inner` sits entirely within `outer`.
 *
 * @param {Bounds} outer
 * @param {Bounds} inner
 * @returns {boolean}
 */
export function boundsContain(outer, inner) {
  if (!outer || !inner) return false;

  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Normalise two arbitrary corner points into bounds. Used by the marquee, where
 * the drag can run in any direction.
 *
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @returns {Bounds}
 */
export function boundsFromPoints(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
