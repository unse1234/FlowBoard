export const updateShapeById = (shapes, id, updater) =>
  shapes.map((shape) => (shape.id === id ? updater(shape) : shape));

export const deleteShapeById = (shapes, id) =>
  shapes.filter((shape) => shape.id !== id);

export const deleteShapesById = (shapes, ids) =>
  shapes.filter((shape) => !ids.has(shape.id));

export const appendShape = (shapes, shape) => [...shapes, shape];

export const getShapeById = (shapes, id) =>
  shapes.find((shape) => shape.id === id) ?? null;
