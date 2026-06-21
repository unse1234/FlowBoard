import { TOOLS } from "../constants/tools";
import { renderShape } from "./renderers/renderingStrategies";
import { getShapeStyle } from "../utils/styleUtils";
import { isLineLike } from "../utils/shapeUtils";

export default function ShapeRenderer({
  shape,
  tool,
  isErasing,
  isEditing,
  registerShapeRef,
  onShapeMouseDown,
  onShapeDoubleClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformStart,
  onTransformEnd,
}) {
  const style = getShapeStyle(shape);
  const nodeProps = {
    id: String(shape.id),
    name: "shape",
    ref: (node) => registerShapeRef(shape.id, node),
    draggable: tool === TOOLS.SELECT && !isEditing,
    opacity: isErasing ? 0.25 : undefined,
    hitStrokeWidth: isLineLike(shape) ? Math.max(style.strokeWidth, 20) : undefined,
    onMouseDown: (e) => onShapeMouseDown(e, shape.id),
    onTap: (e) => onShapeMouseDown(e, shape.id),
    onDblClick: (e) => onShapeDoubleClick(e, shape.id),
    onDblTap: (e) => onShapeDoubleClick(e, shape.id),
    onDragStart: (e) => onDragStart(shape.id, e),
    onDragMove: (e) => onDragMove(shape.id, e),
    onDragEnd: (e) => onDragEnd(shape.id, e),
    onTransformStart: (e) => onTransformStart(shape.id, e),
    onTransformEnd: (e) => onTransformEnd(shape.id, e),
  };

  return renderShape({ shape, nodeProps, isEditing });
}
