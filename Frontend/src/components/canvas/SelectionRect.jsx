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
 * @param {Object} palette - Canvas colour tokens
 */
export default function SelectionRect({ bounds, scale, palette }) {
  if (!bounds) return null;

  return (
    <Rect
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      fill={palette.selectionFill}
      stroke={palette.selection}
      strokeWidth={1 / scale}
      dash={[4 / scale, 3 / scale]}
      listening={false}
    />
  );
}
