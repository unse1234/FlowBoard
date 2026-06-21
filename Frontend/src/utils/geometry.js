/**
 * Calculates the shortest distance from a point to a line segment
 * Uses perpendicular distance formula, clamped to segment endpoints
 * Used for hit detection on lines/arrows and breakpoint insertion
 *
 * @param {Object} point - Point to measure from {x, y}
 * @param {Object} start - Line segment start point {x, y}
 * @param {Object} end - Line segment end point {x, y}
 * @returns {number} Shortest distance from point to line segment
 */
export const getDistanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  // Parameter t represents position along segment (0 = start, 1 = end)
  // Clamped to [0, 1] to keep projection within segment bounds
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2),
  );

  const px = start.x + t * dx;
  const py = start.y + t * dy;

  return Math.hypot(point.x - px, point.y - py);
};
