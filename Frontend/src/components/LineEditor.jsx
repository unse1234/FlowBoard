import { Circle, Line } from "react-konva";
import { getBaseShapeStyle } from "../utils/styleUtils";
import { isBendable } from "../utils/shapeUtils";

/**
 * LineEditor Component
 *
 * Displays interactive line editing UI for bendable shapes (line, arrow).
 * Shows skeleton line and draggable breakpoints for precise line manipulation.
 * Scales all elements based on current zoom level for consistent visibility,
 * and enlarges the breakpoints on touch so a finger can grab them.
 *
 * @param {Object} selectedShape - Currently selected bendable shape
 * @param {number} scale - Current canvas zoom scale
 * @param {Object} palette - Canvas colour tokens
 * @param {boolean} touch - Coarse pointer
 * @param {Function} onAnchorDragMove - Callback when breakpoint is dragged
 */
export default function LineEditor({
  selectedShape,
  scale,
  palette,
  touch = false,
  onAnchorDragStart,
  onAnchorDragMove,
}) {
  if (!isBendable(selectedShape)) return null;

  const handleRadius = (touch ? 9 : 5.5) / scale;
  const skeletonWidth = 1.5 / scale;
  const style = getBaseShapeStyle(selectedShape);

  return (
    <>
      {/* Skeleton showing line geometry and bend style */}
      <Line
        x={selectedShape.x}
        y={selectedShape.y}
        points={selectedShape.points}
        stroke={palette.selection}
        strokeWidth={skeletonWidth}
        dash={[8 / scale, 6 / scale]}
        tension={style.bendStyle === "arc" ? 0.45 : 0}
        listening={false}
      />
      {/* Draggable breakpoint circles at each line vertex */}
      {selectedShape.points.map((point, index) => {
        // Skip Y coordinates (every other index is X, next is Y)
        if (index % 2 !== 0) return null;

        return (
          <Circle
            key={`${selectedShape.id}-${index}`}
            x={selectedShape.x + point}
            y={selectedShape.y + selectedShape.points[index + 1]}
            radius={handleRadius}
            fill={palette.handleFill}
            stroke={palette.selection}
            strokeWidth={1.5 / scale}
            draggable
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onDragStart={onAnchorDragStart}
            onDragMove={(e) => onAnchorDragMove(selectedShape.id, index, e)}
          />
        );
      })}
    </>
  );
}
