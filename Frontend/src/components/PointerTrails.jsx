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
 */
export default function PointerTrails({ laserPoints, eraserPoints, scale }) {
  return (
    <>
      {/* Laser pointer trail - thin red line with glow effect */}
      {laserPoints.length > 2 && (
        <Line
          points={laserPoints}
          stroke="#ef4444"
          strokeWidth={3 / scale}
          opacity={0.85}
          lineCap="round"
          lineJoin="round"
          shadowBlur={10 / scale}
          shadowColor="#ef4444"
          listening={false}
        />
      )}

      {/* Eraser trail - thicker silver line for visual feedback */}
      {eraserPoints.length > 2 && (
        <Line
          points={eraserPoints}
          stroke="#C0C0C0"
          strokeWidth={6 / scale}
          opacity={0.5}
          lineCap="round"
          lineJoin="round"
          shadowBlur={8 / scale}
          shadowColor="#C0C0C0"
          listening={false}
        />
      )}
    </>
  );
}
