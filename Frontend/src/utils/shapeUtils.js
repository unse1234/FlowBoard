import { TOOLS } from "../constants/tools";
import { BENDABLE_SHAPES, BOX_SHAPES, LINE_SHAPES } from "../domain/shapes/shapeTypes";
import { getDistanceToSegment } from "./geometry";
import { getShapeStyle } from "./styleUtils";

/**
 * Identifies if a shape is line-like (line, arrow, or pen)
 * Used to apply specialized rendering and interaction logic
 *
 * @param {Object} shape - Shape object to test
 * @returns {boolean} True if shape is a line-type
 */
export const isLineLike = (shape) => LINE_SHAPES.has(shape?.type);

/**
 * Identifies if a shape can have editable breakpoints (joints)
 * Only lines and arrows support curve bending through breakpoint manipulation
 *
 * @param {Object} shape - Shape object to test
 * @returns {boolean} True if shape supports breakpoint editing
 */
export const isBendable = (shape) => BENDABLE_SHAPES.has(shape?.type);

/**
 * Retrieves display points for a line based on bend style
 * For curved lines, returns simplified point set; for straight, returns all points
 *
 * @param {Object} shape - Shape object with points array and style
 * @returns {Array} Display points [x1, y1, x2, y2, ...]
 */
export const getLinePoints = (shape) => {
  const style = getShapeStyle(shape);
  if (style.bendStyle !== "straight" || shape.points.length <= 4) {
    return shape.points;
  }

  // For straight lines with many points, show only endpoints (simplified visualization)
  return [
    shape.points[0],
    shape.points[1],
    shape.points[shape.points.length - 2],
    shape.points[shape.points.length - 1],
  ];
};

/**
 * Calculates normalized bounding box for a shape
 * Handles negative width/height by computing correct coordinates
 *
 * @param {Object} shape - Shape object with x, y, width, height
 * @returns {Object} Normalized box {x, y, width, height}
 */
export const getBox = (shape) => ({
  x: Math.min(shape.x, shape.x + shape.width),
  y: Math.min(shape.y, shape.y + shape.height),
  width: Math.abs(shape.width),
  height: Math.abs(shape.height),
});

/**
 * Normalizes rectangle and circle shapes after drawing/transform
 * Ensures dimensions are positive and position is at top-left corner
 *
 * @param {Object} shape - Shape to normalize
 * @returns {Object} Normalized shape or original if not rect/circle
 */
export const normalizeBoxShape = (shape) => {
  if (!BOX_SHAPES.has(shape.type)) return shape;

  const box = getBox(shape);

  return {
    ...shape,
    ...box,
  };
};

/**
 * Inserts a new breakpoint on a line when user clicks to edit
 * Finds the closest point on the line to the click and inserts there
 *
 * @param {Object} shape - Line or arrow shape to modify
 * @param {Object} worldPoint - Click position in world coordinates {x, y}
 * @returns {Object} Updated shape with new breakpoint inserted
 */
export const insertBreakpoint = (shape, worldPoint) => {
  if (!isBendable(shape)) return shape;

  const localPoint = {
    x: worldPoint.x - shape.x,
    y: worldPoint.y - shape.y,
  };

  let insertIndex = shape.points.length;
  let shortest = Infinity;

  // Find the line segment closest to the click point
  for (let i = 0; i < shape.points.length - 2; i += 2) {
    const start = { x: shape.points[i], y: shape.points[i + 1] };
    const end = { x: shape.points[i + 2], y: shape.points[i + 3] };

    const dist = getDistanceToSegment(localPoint, start, end);

    if (dist < shortest) {
      shortest = dist;
      insertIndex = i + 2;
    }
  }

  const points = [...shape.points];
  points.splice(insertIndex, 0, localPoint.x, localPoint.y);

  return {
    ...shape,
    points,
    style: {
      ...getShapeStyle(shape),
      // Switch from straight to corner mode when first breakpoint is added
      bendStyle:
        shape.style?.bendStyle === "straight"
          ? "corner"
          : getShapeStyle(shape).bendStyle,
    },
  };
};
