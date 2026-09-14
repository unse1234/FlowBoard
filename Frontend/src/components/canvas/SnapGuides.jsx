import { Line } from "react-konva";
import { getVisibleWorldBounds } from "../../domain/geometry/viewport.js";

/**
 * Alignment guides shown while dragging.
 *
 * Each guide spans the visible region rather than just the two shapes involved,
 * which is what makes it read as an alignment line rather than a connector.
 */
export default function SnapGuides({ guides, transform, viewportSize }) {
  if (!guides || guides.length === 0) return null;

  const view = getVisibleWorldBounds(transform, viewportSize);
  const strokeWidth = 1 / transform.scale;
  const dash = [4 / transform.scale, 4 / transform.scale];

  return (
    <>
      {guides.map((guide) => (
        <Line
          key={`${guide.orientation}-${guide.position}`}
          points={
            guide.orientation === "vertical"
              ? [guide.position, view.y, guide.position, view.y + view.height]
              : [view.x, guide.position, view.x + view.width, guide.position]
          }
          stroke="#f43f5e"
          strokeWidth={strokeWidth}
          dash={dash}
          listening={false}
        />
      ))}
    </>
  );
}
