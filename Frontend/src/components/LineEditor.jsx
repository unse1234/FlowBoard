import { Circle, Line } from "react-konva";
import { getShapeStyle } from "../utils/styleUtils";
import { isBendable } from "../utils/shapeUtils";

/**
 * LineEditor Component
 *
 * Displays interactive line editing UI for bendable shapes (line, arrow).
 * Shows skeleton line and draggable breakpoints for precise line manipulation.
 * Scales all elements based on current zoom level for consistent visibility.
 *
 * @param {Object} selectedShape - Currently selected bendable shape
 * @param {number} scale - Current canvas zoom scale
 * @param {Function} onAnchorDragMove - Callback when breakpoint is dragged
 */
export default function LineEditor({
  selectedShape,
  scale,
  onAnchorDragStart,
  onAnchorDragMove,
}) {
  if (!isBendable(selectedShape)) return null;

  const handleRadius = 6 / scale;
  const skeletonWidth = 1.5 / scale;
  const style = getShapeStyle(selectedShape);

  return (
    <>
      {/* Skeleton showing line geometry and bend style */}
      <Line
        x={selectedShape.x}
        y={selectedShape.y}
        points={selectedShape.points}
        stroke="#2563eb"
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
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={2 / scale}
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
