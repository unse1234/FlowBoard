import { memo, useCallback, useMemo, useRef } from "react";
import { Layer, Rect, Stage } from "react-konva";
import { getShapeBounds, getShapesBoundingBox } from "../domain/geometry/bounds.js";
import { getVisibleWorldBounds } from "../domain/geometry/viewport.js";
import { Island } from "./ui/index.js";

const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;

/** Fraction of the content extent left as breathing room around the edges. */
const PADDING_RATIO = 0.08;

/**
 * Shapes as flat blocks.
 *
 * Split out and memoised on the frame it is drawn in, so panning and zooming the
 * board — which changes the viewport rectangle on every frame — does not
 * re-render one node per shape alongside it.
 */
const MinimapShapes = memo(function MinimapShapes({ shapes, frame, scale, color }) {
  return (
    <>
      {shapes.map((shape) => {
        const bounds = getShapeBounds(shape);
        if (!bounds) return null;

        return (
          <Rect
            key={shape.id}
            x={(bounds.x - frame.x) * scale}
            y={(bounds.y - frame.y) * scale}
            width={Math.max(1, bounds.width * scale)}
            height={Math.max(1, bounds.height * scale)}
            fill={color}
            cornerRadius={1}
            listening={false}
          />
        );
      })}
    </>
  );
});

/**
 * Board overview with a draggable viewport rectangle.
 *
 * Deliberately its own Konva Stage rather than an inset of the board's: the main
 * stage fills the window and the pointer maths everywhere else depends on that,
 * so sharing it would break world-coordinate conversion and the text overlay.
 *
 * Shapes are drawn as plain blocks from their bounds — never through the real
 * renderers, which would mean sketchy double strokes and decoding every image a
 * second time for a 180px thumbnail.
 *
 * The frame is derived from the content alone, so it stays still while you pan;
 * the viewport rectangle is clamped so it stays visible even when the view is
 * somewhere the content is not. Pointer events (not mouse events) so it also
 * works on touch laptops and large tablets.
 *
 * Hidden from assistive tech: fit, zoom and pan controls offer the same
 * navigation without a pointer.
 */
function Minimap({ shapes, transform, viewportSize, palette, onNavigate }) {
  const isDraggingRef = useRef(false);

  const frame = useMemo(() => {
    const content = getShapesBoundingBox(shapes);
    if (!content) return null;

    const padX = Math.max(content.width * PADDING_RATIO, 20);
    const padY = Math.max(content.height * PADDING_RATIO, 20);

    return {
      x: content.x - padX,
      y: content.y - padY,
      width: content.width + padX * 2,
      height: content.height + padY * 2,
    };
  }, [shapes]);

  const scale = frame
    ? Math.min(MINIMAP_WIDTH / frame.width, MINIMAP_HEIGHT / frame.height)
    : 1;

  const navigateToPointer = useCallback(
    (event) => {
      if (!frame) return;

      const pointer = event.target.getStage()?.getPointerPosition();
      if (!pointer) return;

      onNavigate({
        x: frame.x + pointer.x / scale,
        y: frame.y + pointer.y / scale,
      });
    },
    [frame, onNavigate, scale],
  );

  const handlePointerDown = useCallback(
    (event) => {
      isDraggingRef.current = true;
      navigateToPointer(event);
    },
    [navigateToPointer],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!isDraggingRef.current) return;

      navigateToPointer(event);
    },
    [navigateToPointer],
  );

  const stopDragging = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // An empty board has nothing to overview and nowhere to navigate to.
  if (!frame) return null;

  const view = getVisibleWorldBounds(transform, viewportSize);
  const viewRect = {
    x: (view.x - frame.x) * scale,
    y: (view.y - frame.y) * scale,
    width: view.width * scale,
    height: view.height * scale,
  };

  return (
    <Island
      aria-hidden="true"
      className="fb-rise cursor-pointer touch-none overflow-hidden"
      style={{ width: MINIMAP_WIDTH + 2, height: MINIMAP_HEIGHT + 2 }}
    >
      <Stage
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
      >
        <Layer>
          <MinimapShapes
            shapes={shapes}
            frame={frame}
            scale={scale}
            color={palette.minimapShape}
          />

          {/* The viewport as a tinted pane, so shapes under it stay readable. */}
          <Rect
            x={Math.max(0, Math.min(viewRect.x, MINIMAP_WIDTH - 4))}
            y={Math.max(0, Math.min(viewRect.y, MINIMAP_HEIGHT - 4))}
            width={Math.min(viewRect.width, MINIMAP_WIDTH)}
            height={Math.min(viewRect.height, MINIMAP_HEIGHT)}
            stroke={palette.selection}
            strokeWidth={1.5}
            fill={palette.selectionFill}
            cornerRadius={2}
            listening={false}
          />
        </Layer>
      </Stage>
    </Island>
  );
}

export default memo(Minimap);
