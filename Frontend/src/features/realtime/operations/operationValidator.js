// @ts-check

import { normalizeShapeId } from "../../../domain/board/shapeIdentity.js";
import { OPERATION_TYPES, SUPPORTED_OPERATION_TYPES } from "./operationTypes.js";

/**
 * @import { BoardOperation } from "./operationTypes"
 */

/**
 * @param {unknown} operation
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validateOperation(operation) {
  if (!operation || typeof operation !== "object") {
    return { valid: false, reason: "Operation must be an object." };
  }

  /** @type {Partial<BoardOperation>} */
  const candidate = operation;

  if (!candidate.boardId || typeof candidate.boardId !== "string") {
    return { valid: false, reason: "Operation requires a string boardId." };
  }

  if (!candidate.userId || typeof candidate.userId !== "string") {
    return { valid: false, reason: "Operation requires a string userId." };
  }

  if (!candidate.operationId || typeof candidate.operationId !== "string") {
    return { valid: false, reason: "Operation requires a string operationId." };
  }

  if (!Number.isFinite(candidate.timestamp)) {
    return { valid: false, reason: "Operation requires a finite timestamp." };
  }

  if (!candidate.type || !SUPPORTED_OPERATION_TYPES.has(candidate.type)) {
    return { valid: false, reason: "Operation type is unsupported." };
  }

  if (!candidate.payload || typeof candidate.payload !== "object") {
    return { valid: false, reason: "Operation requires an object payload." };
  }

  return validatePayload(candidate);
}

/**
 * @param {Partial<BoardOperation>} operation
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validatePayload(operation) {
  const payload = operation.payload ?? {};

  if (operation.type === OPERATION_TYPES.CREATE_SHAPE) {
    const shape = payload.shape;
    if (!shape || typeof shape !== "object") {
      return { valid: false, reason: "CREATE_SHAPE requires payload.shape." };
    }

    if (!normalizeShapeId(shape.id)) {
      return { valid: false, reason: "CREATE_SHAPE requires shape.id." };
    }

    return { valid: true };
  }

  if (
    operation.type === OPERATION_TYPES.DELETE_SHAPE ||
    operation.type === OPERATION_TYPES.UPDATE_SHAPE ||
    operation.type === OPERATION_TYPES.MOVE_SHAPE ||
    operation.type === OPERATION_TYPES.ROTATE_SHAPE ||
    operation.type === OPERATION_TYPES.RESIZE_SHAPE ||
    operation.type === OPERATION_TYPES.CHANGE_STYLE
  ) {
    if (!normalizeShapeId(payload.shapeId)) {
      return { valid: false, reason: `${operation.type} requires payload.shapeId.` };
    }
  }

  return { valid: true };
}
