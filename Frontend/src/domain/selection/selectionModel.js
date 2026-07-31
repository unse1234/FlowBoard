import { isShapeIdEqual } from "../board/shapeIdentity.js";
import { isBendable } from "../../utils/shapeUtils";

export const canUseTransformer = ({ selectedShape, selectedId, editingTextId }) =>
  Boolean(selectedShape && !isBendable(selectedShape) && !isShapeIdEqual(editingTextId, selectedId));

export const getSelectedShapes = ({ shapes, selectedId, editingTextId }) => ({
  selectedShape: shapes.find((shape) => isShapeIdEqual(shape.id, selectedId)) ?? null,
  editingTextShape: shapes.find((shape) => isShapeIdEqual(shape.id, editingTextId)) ?? null,
});
