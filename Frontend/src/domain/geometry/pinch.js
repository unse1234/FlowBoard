// @ts-check

/**
 * Two-finger gesture maths.
 *
 * One formula covers pinch-zoom and two-finger pan together: the world point
 * that sat under the fingers' midpoint when the gesture began stays under the
 * midpoint as it moves, while the scale follows the change in finger spread.
 *
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x: number, y: number, scale: number }} Transform
 */

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {Object} input
 * @param {Transform} input.startTransform - stage transform when the gesture began
 * @param {[Point, Point]} input.startPoints - the two touches when it began (screen px)
 * @param {[Point, Point]} input.points - the two touches now
 * @param {number} input.minScale
 * @param {number} input.maxScale
 * @returns {Transform}
 */
export function computePinchTransform({ startTransform, startPoints, points, minScale, maxScale }) {
  const [startA, startB] = startPoints;
  const [a, b] = points;

  const startDistance = Math.hypot(startB.x - startA.x, startB.y - startA.y);
  const distance = Math.hypot(b.x - a.x, b.y - a.y);

  // Two touches on the same pixel have no spread to compare against; treat
  // that as a pure pan rather than dividing by zero.
  const ratio = startDistance > 0 ? distance / startDistance : 1;
  const scale = clamp(startTransform.scale * ratio, minScale, maxScale);

  const startMid = { x: (startA.x + startB.x) / 2, y: (startA.y + startB.y) / 2 };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  const worldX = (startMid.x - startTransform.x) / startTransform.scale;
  const worldY = (startMid.y - startTransform.y) / startTransform.scale;

  return {
    scale,
    x: mid.x - worldX * scale,
    y: mid.y - worldY * scale,
  };
}
