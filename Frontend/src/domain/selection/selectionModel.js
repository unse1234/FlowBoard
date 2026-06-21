import { isBendable } from "../../utils/shapeUtils";

export const canUseTransformer = ({ selectedShape, selectedId, editingTextId }) =>
  Boolean(selectedShape && !isBendable(selectedShape) && editingTextId !== selectedId);

export const getSelectedShapes = ({ shapes, selectedId, editingTextId }) => ({
  selectedShape: shapes.find((shape) => shape.id === selectedId) ?? null,
  editingTextShape: shapes.find((shape) => shape.id === editingTextId) ?? null,
});
