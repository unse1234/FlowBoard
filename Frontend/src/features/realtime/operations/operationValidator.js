// @ts-check

import { normalizeShapeId } from "../../../domain/board/shapeIdentity.js";
import {
  OPERATION_TYPES,
  ORDERING_OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
  SUPPORTED_OPERATION_TYPES,
} from "./operationTypes.js";

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
  const type = operation.type;

  if (type === OPERATION_TYPES.CREATE_SHAPE) {
    const shape = payload.shape;
    if (!shape || typeof shape !== "object") {
      return { valid: false, reason: "CREATE_SHAPE requires payload.shape." };
    }

    if (!normalizeShapeId(shape.id)) {
      return { valid: false, reason: "CREATE_SHAPE requires shape.id." };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.CREATE_SHAPES) {
    const shapes = payload.shapes;
    if (!Array.isArray(shapes) || shapes.length === 0) {
      return { valid: false, reason: "CREATE_SHAPES requires a non-empty payload.shapes." };
    }

    const everyShapeIsValid = shapes.every(
      (shape) => shape && typeof shape === "object" && normalizeShapeId(shape.id),
    );
    if (!everyShapeIsValid) {
      return { valid: false, reason: "CREATE_SHAPES requires every shape to have an id." };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.UPDATE_SHAPES) {
    const patches = payload.patches;
    if (!Array.isArray(patches) || patches.length === 0) {
      return { valid: false, reason: "UPDATE_SHAPES requires a non-empty payload.patches." };
    }

    const everyPatchIsValid = patches.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        normalizeShapeId(entry.shapeId) &&
        entry.patch &&
        typeof entry.patch === "object",
    );
    if (!everyPatchIsValid) {
      return {
        valid: false,
        reason: "UPDATE_SHAPES requires every entry to have shapeId and patch.",
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
    if (!normalizeShapeId(payload.groupId)) {
      return { valid: false, reason: "GROUP requires payload.groupId." };
    }

    if (!hasShapeIdList(payload.shapeIds)) {
      return { valid: false, reason: "GROUP requires a non-empty payload.shapeIds." };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.UNGROUP) {
    if (!normalizeShapeId(payload.groupId) && !hasShapeIdList(payload.shapeIds)) {
      return { valid: false, reason: "UNGROUP requires payload.groupId or payload.shapeIds." };
    }

    return { valid: true };
  }

  // Ordering ops accept either form: shapeId is the original single-shape
  // spelling and must keep validating, shapeIds is the multi-select one.
  if (ORDERING_OPERATION_TYPES.has(type)) {
    if (!normalizeShapeId(payload.shapeId) && !hasShapeIdList(payload.shapeIds)) {
      return {
        valid: false,
        reason: type + " requires payload.shapeId or payload.shapeIds.",
      };
    }

    return { valid: true };
  }

  if (type === OPERATION_TYPES.DELETE_SHAPE || SINGLE_PATCH_OPERATION_TYPES.has(type)) {
    if (!normalizeShapeId(payload.shapeId)) {
      return { valid: false, reason: type + " requires payload.shapeId." };
    }
  }

  return { valid: true };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasShapeIdList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((id) => Boolean(normalizeShapeId(id)))
  );
}
