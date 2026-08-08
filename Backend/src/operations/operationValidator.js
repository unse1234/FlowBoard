const { OPERATION_TYPES, SUPPORTED_OPERATION_TYPES } = require("./operationTypes");

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
  const { payload, type } = operation;

  if (type === OPERATION_TYPES.CREATE_SHAPE) {
    if (!payload.shape || typeof payload.shape !== "object") {
      return { valid: false, reason: "CREATE_SHAPE requires payload.shape." };
    }

    if (!isNonEmptyString(String(payload.shape.id ?? ""))) {
      return { valid: false, reason: "CREATE_SHAPE requires shape.id." };
    }

    return { valid: true };
  }

  if (
    type === OPERATION_TYPES.DELETE_SHAPE ||
    type === OPERATION_TYPES.UPDATE_SHAPE ||
    type === OPERATION_TYPES.MOVE_SHAPE ||
    type === OPERATION_TYPES.ROTATE_SHAPE ||
    type === OPERATION_TYPES.RESIZE_SHAPE ||
    type === OPERATION_TYPES.CHANGE_STYLE ||
    type === OPERATION_TYPES.BRING_FORWARD ||
    type === OPERATION_TYPES.SEND_BACKWARD
  ) {
    if (!isNonEmptyString(String(payload.shapeId ?? ""))) {
      return { valid: false, reason: `${type} requires payload.shapeId.` };
    }
  }

  return { valid: true };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
  validateOperation,
};
