// @ts-check

import { normalizeShapeId } from "../../../domain/board/shapeIdentity.js";
import {
  OPERATION_LIMITS,
  OPERATION_TYPES,
  ORDERING_OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
  SUPPORTED_OPERATION_TYPES,
} from "./operationTypes.js";

/**
 * @import { BoardOperation } from "./operationTypes"
 */

/** Payload fields that hold a batch, each capped at maxBatchEntries. */
const BATCH_FIELDS = ["shapes", "patches", "placements", "shapeIds"];

const UTF8 = new TextEncoder();

/**
 * @param {unknown} operation
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validateOperation(operation) {
  if (!operation || typeof operation !== "object") {
    return { valid: false, reason: "Operation must be an object." };
  }

  // Before anything walks the payload's lists or serialises it.
  const bounds = checkBounds(operation);
  if (!bounds.valid) return bounds;

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

  for (const field of /** @type {const} */ (["boardId", "userId", "operationId"])) {
    if (candidate[field].length > OPERATION_LIMITS.maxIdLength) {
      return {
        valid: false,
        reason: `Operation ${field} is longer than ${OPERATION_LIMITS.maxIdLength} characters.`,
      };
    }
  }

  if (!Number.isFinite(candidate.timestamp)) {
    return { valid: false, reason: "Operation requires a finite timestamp." };
  }

  return validateOperationPayload(candidate);
}

/**
 * Check an operation's type and payload, without its envelope — for an edit a
 * client applies to its own board before publishing it, such as an undo.
 *
 * @param {Partial<BoardOperation>} operation
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validateOperationPayload(operation) {
  if (!operation.type || !SUPPORTED_OPERATION_TYPES.has(operation.type)) {
    return { valid: false, reason: "Operation type is unsupported." };
  }

  if (!operation.payload || typeof operation.payload !== "object") {
    return { valid: false, reason: "Operation requires an object payload." };
  }

  return validatePayload(operation);
}

/**
 * @param {Partial<BoardOperation>} operation
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validatePayload(operation) {
  const payload = operation.payload ?? {};
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
    const shape = payload.shape;
    if (!shape || typeof shape !== "object") {
      return { valid: false, reason: "CREATE_SHAPE requires payload.shape." };
    }

    if (!isShapeId(shape.id)) {
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
      (shape) => shape && typeof shape === "object" && isShapeId(shape.id),
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
    const placements = payload.placements;
    if (!Array.isArray(placements) || placements.length === 0) {
      return { valid: false, reason: "REORDER_SHAPES requires a non-empty payload.placements." };
    }

    const everyPlacementIsValid = placements.every((entry) => {
      if (!entry || typeof entry !== "object") return false;

      if (!isShapeId(entry.shapeId)) return false;
      if (entry.afterShapeId === null) return true;

      return (
        isShapeId(entry.afterShapeId) &&
        normalizeShapeId(entry.afterShapeId) !== normalizeShapeId(entry.shapeId)
      );
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
 * Keys an UPDATE_SHAPES entry removes. Optional; a shape's id is never one.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isUnsetList(value) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= OPERATION_LIMITS.maxUnsetKeys &&
      value.every(
        (key) =>
          typeof key === "string" &&
          key.trim().length > 0 &&
          key.length <= OPERATION_LIMITS.maxIdLength &&
          key !== "id",
      ))
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasShapeIdList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isShapeId)
  );
}

/**
 * A shape or group id: present, and no longer than maxIdLength.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isShapeId(value) {
  const id = normalizeShapeId(value);
  return id !== null && id.length <= OPERATION_LIMITS.maxIdLength;
}

/**
 * The operation's nesting and serialised size, against OPERATION_LIMITS.
 *
 * Nesting is measured first, without recursion: serialising a deeply nested
 * value is itself what exhausts the stack (F-28).
 *
 * @param {object} operation
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function checkBounds(operation) {
  if (nestsDeeperThan(operation, OPERATION_LIMITS.maxDepth)) {
    return {
      valid: false,
      reason: `Operation nests more than ${OPERATION_LIMITS.maxDepth} levels deep.`,
    };
  }

  const bytes = UTF8.encode(JSON.stringify(operation)).length;
  if (bytes > OPERATION_LIMITS.maxOperationBytes) {
    return {
      valid: false,
      reason: `Operation is ${bytes} bytes; the limit is ${OPERATION_LIMITS.maxOperationBytes}.`,
    };
  }

  return { valid: true };
}

/**
 * Whether an object nests more than `limit` levels, counting itself as 1.
 *
 * @param {object} value
 * @param {number} limit
 * @returns {boolean}
 */
function nestsDeeperThan(value, limit) {
  /** @type {[object, number][]} */
  const pending = [[value, 1]];

  while (pending.length > 0) {
    const [node, depth] = /** @type {[object, number]} */ (pending.pop());
    if (depth > limit) return true;

    for (const child of Object.values(node)) {
      if (child !== null && typeof child === "object") pending.push([child, depth + 1]);
    }
  }

  return false;
}
