import { Line } from "react-konva";

/**
 * PointerTrails Component
 *
 * Renders temporary visual trails for laser pointer and eraser tools.
 * Both trails are disabled for hit detection (listening={false}) to avoid
 * interfering with shape interaction. Scales trail width based on zoom level
 * for consistent appearance across zoom levels.
 *
 * @param {Array} laserPoints - Points array for laser trail [x1, y1, x2, y2, ...]
 * @param {Array} eraserPoints - Points array for eraser trail [x1, y1, x2, y2, ...]
 * @param {number} scale - Current canvas zoom scale
 * @param {string} laserColor - Theme laser token
 * @param {string} eraserColor - Theme eraser-trail token
 */
export default function PointerTrails({
  laserPoints,
  eraserPoints,
  scale,
  laserColor,
  eraserColor,
}) {
  return (
    <>
      {/* Laser pointer trail - thin line with a glow */}
      {laserPoints.length > 2 && (
        <Line
          points={laserPoints}
          stroke={laserColor}
          strokeWidth={3 / scale}
          opacity={0.9}
          lineCap="round"
          lineJoin="round"
          shadowBlur={10 / scale}
          shadowColor={laserColor}
          listening={false}
        />
      )}

      {/* Eraser trail - a soft, wider stroke that follows the pointer */}
      {eraserPoints.length > 2 && (
        <Line
          points={eraserPoints}
          stroke={eraserColor}
          strokeWidth={8 / scale}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}
    </>
  );
}
