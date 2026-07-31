// @ts-check

import {
  deleteShapeById,
  updateShapeById,
  getShapeById,
} from "../../../domain/board/shapeMutations.js";
import { isShapeIdEqual, normalizeShapeId } from "../../../domain/board/shapeIdentity.js";
import { OPERATION_TYPES } from "./operationTypes.js";
import { validateOperation } from "./operationValidator.js";

/**
 * @import { BoardOperation, BoardShape, OperationApplyResult } from "./operationTypes"
 */

export class OperationApplier {
  #processedOperationIds = new Set();

  /**
   * @param {BoardShape[]} shapes
   * @param {BoardOperation} operation
   * @returns {OperationApplyResult}
   */
  apply(shapes, operation) {
    const validation = validateOperation(operation);
    if (!validation.valid) {
      return { status: "invalid", shapes, reason: validation.reason };
    }

    if (this.#processedOperationIds.has(operation.operationId)) {
      return { status: "duplicate", shapes };
    }

    const result = applyValidatedOperation(shapes, operation);

    if (result.status === "applied" || result.status === "noop") {
      this.#processedOperationIds.add(operation.operationId);
    }

    return result;
  }

  /**
   * @param {string} operationId
   * @returns {boolean}
   */
  hasProcessed(operationId) {
    return this.#processedOperationIds.has(operationId);
  }

  /**
   * @param {string} operationId
   */
  markProcessed(operationId) {
    this.#processedOperationIds.add(operationId);
  }

  clearProcessedOperations() {
    this.#processedOperationIds.clear();
  }
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyValidatedOperation(shapes, operation) {
  switch (operation.type) {
    case OPERATION_TYPES.CREATE_SHAPE:
      return applyCreateShape(shapes, operation);
    case OPERATION_TYPES.DELETE_SHAPE:
      return applyDeleteShape(shapes, operation);
    case OPERATION_TYPES.UPDATE_SHAPE:
    case OPERATION_TYPES.MOVE_SHAPE:
    case OPERATION_TYPES.ROTATE_SHAPE:
    case OPERATION_TYPES.RESIZE_SHAPE:
    case OPERATION_TYPES.CHANGE_STYLE:
      return applyPatchShape(shapes, operation);
    case OPERATION_TYPES.BRING_FORWARD:
      return moveShapeInStack(shapes, operation, 1);
    case OPERATION_TYPES.SEND_BACKWARD:
      return moveShapeInStack(shapes, operation, -1);
    default:
      return {
        status: "noop",
        shapes,
        reason: `${operation.type} is part of the contract but is not implemented yet.`,
      };
  }
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyCreateShape(shapes, operation) {
  const shape = operation.payload.shape;

  if (!shape || typeof shape !== "object" || !normalizeShapeId(shape.id)) {
    return { status: "invalid", shapes, reason: "CREATE_SHAPE payload.shape is invalid." };
  }

  if (getShapeById(shapes, shape.id)) {
    return { status: "conflict", shapes, reason: "Shape already exists." };
  }

  return { status: "applied", shapes: [...shapes, /** @type {BoardShape} */ (shape)] };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyDeleteShape(shapes, operation) {
  const shapeId = normalizeShapeId(operation.payload.shapeId);
  if (!shapeId) return { status: "invalid", shapes, reason: "DELETE_SHAPE shapeId is invalid." };
  if (!getShapeById(shapes, shapeId)) return { status: "not_found", shapes };

  return { status: "applied", shapes: deleteShapeById(shapes, shapeId) };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyPatchShape(shapes, operation) {
  const shapeId = normalizeShapeId(operation.payload.shapeId);
  const patch = operation.payload.patch;

  if (!shapeId) return { status: "invalid", shapes, reason: `${operation.type} shapeId is invalid.` };
  if (!patch || typeof patch !== "object") {
    return { status: "invalid", shapes, reason: `${operation.type} requires payload.patch.` };
  }

  if (!getShapeById(shapes, shapeId)) return { status: "not_found", shapes };

  return {
    status: "applied",
    shapes: updateShapeById(shapes, shapeId, (shape) => ({
      ...shape,
      ...patch,
      id: shape.id,
      version: Math.max(Number(shape.version ?? 0) + 1, Number(patch.version ?? 0)),
      updatedAt: operation.timestamp,
    })),
  };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @param {1 | -1} direction
 * @returns {OperationApplyResult}
 */
function moveShapeInStack(shapes, operation, direction) {
  const shapeId = normalizeShapeId(operation.payload.shapeId);
  if (!shapeId) return { status: "invalid", shapes, reason: `${operation.type} shapeId is invalid.` };

  const index = shapes.findIndex((shape) => isShapeIdEqual(shape.id, shapeId));
  if (index === -1) return { status: "not_found", shapes };

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= shapes.length) return { status: "noop", shapes };

  const nextShapes = [...shapes];
  [nextShapes[index], nextShapes[nextIndex]] = [nextShapes[nextIndex], nextShapes[index]];

  return { status: "applied", shapes: nextShapes };
}
