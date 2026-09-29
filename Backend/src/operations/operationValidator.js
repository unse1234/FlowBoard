const {
  OPERATION_LIMITS,
  OPERATION_TYPES,
  ORDERING_OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
  SUPPORTED_OPERATION_TYPES,
} = require("./operationTypes");

/** Payload fields that hold a batch, each capped at maxBatchEntries. */
const BATCH_FIELDS = ["shapes", "patches", "placements", "shapeIds"];

function validateOperation(operation) {
  if (!operation || typeof operation !== "object") {
    return { valid: false, reason: "Operation must be an object." };
  }

  // Before anything walks the payload's lists or serialises it.
  const bounds = checkBounds(operation);
  if (!bounds.valid) return bounds;

  if (!isNonEmptyString(operation.boardId)) {
    return { valid: false, reason: "Operation requires boardId." };
  }

  if (!isNonEmptyString(operation.userId)) {
    return { valid: false, reason: "Operation requires userId." };
  }

  if (!isNonEmptyString(operation.operationId)) {
    return { valid: false, reason: "Operation requires operationId." };
  }

  for (const field of ["boardId", "userId", "operationId"]) {
    if (operation[field].length > OPERATION_LIMITS.maxIdLength) {
      return {
        valid: false,
        reason: `Operation ${field} is longer than ${OPERATION_LIMITS.maxIdLength} characters.`,
      };
    }
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

  // Whatever the type: a list the applier walks is bounded wherever it appears.
  for (const field of BATCH_FIELDS) {
    if (Array.isArray(payload[field]) && payload[field].length > OPERATION_LIMITS.maxBatchEntries) {
      return {
        valid: false,
        reason: `${type} may carry at most ${OPERATION_LIMITS.maxBatchEntries} ${field}.`,
      };
    }
  }

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
        reason: `UPDATE_SHAPES requires every entry to have shapeId and patch, and any unset to list at most ${OPERATION_LIMITS.maxUnsetKeys} keys other than id.`,
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

/**
 * The operation's nesting and serialised size, against OPERATION_LIMITS.
 *
 * Nesting is measured first, without recursion: serialising a deeply nested
 * value is itself what exhausts the stack (F-28).
 */
function checkBounds(operation) {
  if (nestsDeeperThan(operation, OPERATION_LIMITS.maxDepth)) {
    return {
      valid: false,
      reason: `Operation nests more than ${OPERATION_LIMITS.maxDepth} levels deep.`,
    };
  }

  const bytes = Buffer.byteLength(JSON.stringify(operation), "utf8");
  if (bytes > OPERATION_LIMITS.maxOperationBytes) {
    return {
      valid: false,
      reason: `Operation is ${bytes} bytes; the limit is ${OPERATION_LIMITS.maxOperationBytes}.`,
    };
  }

  return { valid: true };
}

/** Whether an object nests more than `limit` levels, counting itself as 1. */
function nestsDeeperThan(value, limit) {
  const pending = [[value, 1]];

  while (pending.length > 0) {
    const [node, depth] = pending.pop();
    if (depth > limit) return true;

    for (const child of Object.values(node)) {
      if (child !== null && typeof child === "object") pending.push([child, depth + 1]);
    }
  }

  return false;
}

function hasShapeIdList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isShapeId);
}

/** Keys an UPDATE_SHAPES entry removes. Optional; a shape's id is never one. */
function isUnsetList(value) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= OPERATION_LIMITS.maxUnsetKeys &&
      value.every(
        (key) => isNonEmptyString(key) && key.length <= OPERATION_LIMITS.maxIdLength && key !== "id",
      ))
  );
}

function isShapeId(value) {
  if (value === null || value === undefined || value === "") return false;

  const id = String(value);
  return isNonEmptyString(id) && id.length <= OPERATION_LIMITS.maxIdLength;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
  validateOperation,
};
