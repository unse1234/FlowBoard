import { Line } from "react-konva";
import { getVisibleWorldBounds } from "../../domain/geometry/viewport.js";

/** Below this on-screen spacing the grid reads as noise, so it is not drawn. */
const MIN_VISIBLE_SPACING = 6;

/**
 * Background grid.
 *
 * Only the lines crossing the visible region are built, so the node count stays
 * tied to the size of the window rather than to how far the board has been
 * panned. The colour is a mid neutral at low opacity, which reads correctly on
 * both the light and dark canvas without needing the theme.
 */
export default function CanvasGrid({ transform, viewportSize, gridSize }) {
  if (!gridSize || gridSize * transform.scale < MIN_VISIBLE_SPACING) return null;

  const view = getVisibleWorldBounds(transform, viewportSize);
  const strokeWidth = 1 / transform.scale;

  const firstX = Math.floor(view.x / gridSize) * gridSize;
  const firstY = Math.floor(view.y / gridSize) * gridSize;
  const right = view.x + view.width;
  const bottom = view.y + view.height;

  const lines = [];

  for (let x = firstX; x <= right; x += gridSize) {
    lines.push(
      <Line
        key={`v${x}`}
        points={[x, view.y, x, bottom]}
        stroke="#94a3b8"
        strokeWidth={strokeWidth}
        opacity={0.25}
        listening={false}
      />,
    );
  }

  for (let y = firstY; y <= bottom; y += gridSize) {
    lines.push(
      <Line
        key={`h${y}`}
        points={[view.x, y, right, y]}
        stroke="#94a3b8"
        strokeWidth={strokeWidth}
        opacity={0.25}
        listening={false}
      />,
    );
  }

  return <>{lines}</>;
}
