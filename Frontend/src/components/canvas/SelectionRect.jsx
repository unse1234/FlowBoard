import { Rect } from "react-konva";

/**
 * The drag-selection marquee.
 *
 * Drawn in world coordinates inside the board layer, so its stroke is divided by
 * the zoom to keep a constant on-screen weight. It never listens for events —
 * the rectangle sits over the shapes it is about to select.
 *
 * @param {Object} bounds - World-space {x, y, width, height}, or null when idle
 * @param {number} scale - Current canvas zoom
 */
export default function SelectionRect({ bounds, scale }) {
  if (!bounds) return null;

  return (
    <Rect
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      fill="#2563eb"
      opacity={0.08}
      stroke="#2563eb"
      strokeWidth={1 / scale}
      dash={[4 / scale, 3 / scale]}
      listening={false}
    />
  );
}
