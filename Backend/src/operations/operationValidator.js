const {
  OPERATION_TYPES,
  ORDERING_OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
  SUPPORTED_OPERATION_TYPES,
} = require("./operationTypes");

function validateOperation(operation) {
  if (!operation || typeof operation !== "object") {
    return { valid: false, reason: "Operation must be an object." };
  }

  if (!isNonEmptyString(operation.boardId)) {
    return { valid: false, reason: "Operation requires boardId." };
  }

  if (!isNonEmptyString(operation.userId)) {
    return { valid: false, reason: "Operation requires userId." };
  }

  if (!isNonEmptyString(operation.operationId)) {
    return { valid: false, reason: "Operation requires operationId." };
  }

  if (!Number.isFinite(operation.timestamp)) {
    return { valid: false, reason: "Operation requires timestamp." };
  }

  if (!SUPPORTED_OPERATION_TYPES.has(operation.type)) {
    return { valid: false, reason: "Unsupported operation type." };
  }

  if (!operation.payload || typeof operation.payload !== "object") {
    return { valid: false, reason: "Operation requires payload." };
  }

  return validatePayload(operation);
}

function validatePayload(operation) {
  const payload = operation.payload;
  const type = operation.type;

  if (type === OPERATION_TYPES.CREATE_SHAPE) {
    if (!payload.shape || typeof payload.shape !== "object") {
      return { valid: false, reason: "CREATE_SHAPE requires payload.shape." };
    }

    if (!isShapeId(payload.shape.id)) {
      return { valid: false, reason: "CREATE_SHAPE requires shape.id." };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.CREATE_SHAPES) {
    if (!Array.isArray(payload.shapes) || payload.shapes.length === 0) {
      return { valid: false, reason: "CREATE_SHAPES requires a non-empty payload.shapes." };
    }

    const everyShapeIsValid = payload.shapes.every(
      (shape) => shape && typeof shape === "object" && isShapeId(shape.id),
    );
    if (!everyShapeIsValid) {
      return { valid: false, reason: "CREATE_SHAPES requires every shape to have an id." };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.UPDATE_SHAPES) {
    if (!Array.isArray(payload.patches) || payload.patches.length === 0) {
      return { valid: false, reason: "UPDATE_SHAPES requires a non-empty payload.patches." };
    }

    const everyPatchIsValid = payload.patches.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        isShapeId(entry.shapeId) &&
        entry.patch &&
        typeof entry.patch === "object" &&
        isUnsetList(entry.unset),
    );
    if (!everyPatchIsValid) {
      return {
        valid: false,
        reason:
          "UPDATE_SHAPES requires every entry to have shapeId and patch, and any unset to list keys other than id.",
      };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.REORDER_SHAPES) {
    if (!Array.isArray(payload.placements) || payload.placements.length === 0) {
      return { valid: false, reason: "REORDER_SHAPES requires a non-empty payload.placements." };
    }

    const everyPlacementIsValid = payload.placements.every((entry) => {
      if (!entry || typeof entry !== "object" || !isShapeId(entry.shapeId)) return false;
      if (entry.afterShapeId === null) return true;

      return isShapeId(entry.afterShapeId) && String(entry.afterShapeId) !== String(entry.shapeId);
    });
    if (!everyPlacementIsValid) {
      return {
        valid: false,
        reason:
          "REORDER_SHAPES requires every placement to have shapeId and an afterShapeId that is null or another shape.",
      };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.DELETE_SHAPES) {
    if (!hasShapeIdList(payload.shapeIds)) {
      return { valid: false, reason: "DELETE_SHAPES requires a non-empty payload.shapeIds." };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.GROUP) {
    if (!isShapeId(payload.groupId)) {
      return { valid: false, reason: "GROUP requires payload.groupId." };
    }

    if (!hasShapeIdList(payload.shapeIds)) {
      return { valid: false, reason: "GROUP requires a non-empty payload.shapeIds." };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.UNGROUP) {
    if (!isShapeId(payload.groupId) && !hasShapeIdList(payload.shapeIds)) {
      return { valid: false, reason: "UNGROUP requires payload.groupId or payload.shapeIds." };
    }

    return { valid: true };
  }

  // Ordering ops accept either form: shapeId is the original single-shape
  // spelling and must keep validating, shapeIds is the multi-select one.
  if (ORDERING_OPERATION_TYPES.has(type)) {
    if (!isShapeId(payload.shapeId) && !hasShapeIdList(payload.shapeIds)) {
      return {
        valid: false,
        reason: type + " requires payload.shapeId or payload.shapeIds.",
      };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.DELETE_SHAPE || SINGLE_PATCH_OPERATION_TYPES.has(type)) {
    if (!isShapeId(payload.shapeId)) {
      return { valid: false, reason: type + " requires payload.shapeId." };
    }
  }

  return { valid: true };
}

function hasShapeIdList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isShapeId);
}

/** Keys an UPDATE_SHAPES entry removes. Optional; a shape's id is never one. */
function isUnsetList(value) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((key) => isNonEmptyString(key) && key !== "id"))
  );
}

function isShapeId(value) {
  if (value === null || value === undefined || value === "") return false;

  return isNonEmptyString(String(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
  validateOperation,
};
