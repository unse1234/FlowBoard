import { memo, useCallback } from "react";
import { TOOLS } from "../constants/tools";
import { renderShape } from "./renderers/renderingStrategies";
import { getShapeOpacity } from "../domain/render/shapeVisuals.js";
import { getBaseShapeStyle } from "../utils/styleUtils";
import { isLineLike } from "../utils/shapeUtils";

/**
 * ShapeRenderer — one board shape, as Konva nodes.
 *
 * Memoised, and every callback below is wrapped so its identity survives a
 * parent render. Both halves are needed: the board re-renders on every pointer
 * move while drawing, and an unmemoised renderer would reconcile every shape on
 * the board each frame. In particular the Konva `ref` must be stable — a fresh
 * arrow each render makes React detach (call with null) and reattach every node,
 * which thrashes the shape registry the Transformer reads from.
 *
 * `isDark` is a prop for the same reason: ink strokes are drawn white on the
 * dark canvas, and the memo only lets a theme change through if the theme is
 * part of what it compares.
 */
function ShapeRenderer({
  shape,
  tool,
  isErasing,
  isEditing,
  isPanMode,
  isDark = false,
  registerShapeRef,
  onShapeMouseDown,
  onShapeDoubleClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformStart,
  onTransformEnd,
}) {
  const shapeId = shape.id;
  const style = getBaseShapeStyle(shape);

  const handleRef = useCallback(
    (node) => registerShapeRef(shapeId, node),
    [registerShapeRef, shapeId],
  );

  const handleMouseDown = useCallback(
    (e) => onShapeMouseDown(e, shapeId),
    [onShapeMouseDown, shapeId],
  );
  const handleDoubleClick = useCallback(
    (e) => onShapeDoubleClick(e, shapeId),
    [onShapeDoubleClick, shapeId],
  );
  const handleDragStart = useCallback(
    (e) => onDragStart(shapeId, e),
    [onDragStart, shapeId],
  );
  const handleDragMove = useCallback(
    (e) => onDragMove(shapeId, e),
    [onDragMove, shapeId],
  );
  const handleDragEnd = useCallback(
    (e) => onDragEnd(shapeId, e),
    [onDragEnd, shapeId],
  );
  const handleTransformStart = useCallback(
    (e) => onTransformStart(shapeId, e),
    [onTransformStart, shapeId],
  );
  const handleTransformEnd = useCallback(
    (e) => onTransformEnd(shapeId, e),
    [onTransformEnd, shapeId],
  );

  const nodeProps = {
    id: String(shapeId),
    name: "shape",
    ref: handleRef,
    draggable: tool === TOOLS.SELECT && !isEditing && !isPanMode,
    // The shape's only opacity. Konva multiplies it into every child, so no
    // renderer below sets opacity again — doing so used to override this and
    // lose the erase preview on lines and text, and to composite twice on
    // sketchy shapes drawn from two overlapping strokes.
    opacity: getShapeOpacity(shape, { isErasing }),
    hitStrokeWidth: isLineLike(shape)
      ? Math.max(style.strokeWidth, 20)
      : undefined,
    onMouseDown: handleMouseDown,
    onTap: handleMouseDown,
    onDblClick: handleDoubleClick,
    onDblTap: handleDoubleClick,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onTransformStart: handleTransformStart,
    onTransformEnd: handleTransformEnd,
  };

  return renderShape({ shape, nodeProps, isEditing, isDark });
}

export default memo(ShapeRenderer);
