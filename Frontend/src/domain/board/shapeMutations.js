import { isShapeIdEqual, normalizeShapeIdSet } from "./shapeIdentity.js";

export const updateShapeById = (shapes, id, updater) =>
  shapes.map((shape) => (isShapeIdEqual(shape.id, id) ? updater(shape) : shape));

export const deleteShapeById = (shapes, id) =>
  shapes.filter((shape) => !isShapeIdEqual(shape.id, id));

export const deleteShapesById = (shapes, ids) => {
  const normalizedIds = normalizeShapeIdSet(ids);

  return shapes.filter((shape) => !normalizedIds.has(String(shape.id)));
};

export const appendShape = (shapes, shape) => [...shapes, shape];

export const getShapeById = (shapes, id) =>
  shapes.find((shape) => isShapeIdEqual(shape.id, id)) ?? null;
