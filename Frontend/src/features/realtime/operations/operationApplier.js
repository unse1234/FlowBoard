// @ts-check

import {
  deleteShapesById,
  getShapeById,
  updateShapeById,
} from "../../../domain/board/shapeMutations.js";
import {
  normalizeShapeId,
  normalizeShapeIdSet,
} from "../../../domain/board/shapeIdentity.js";
import {
  assignGroupId,
  clearGroupId,
} from "../../../domain/board/shapeGrouping.js";
import {
  bringShapesToFront,
  moveShapesBackward,
  moveShapesForward,
  placeShapes,
  sendShapesToBack,
} from "../../../domain/board/shapeOrdering.js";
import {
  OPERATION_TYPES,
  ORDERING_OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
} from "./operationTypes.js";
import { validateOperation, validateOperationPayload } from "./operationValidator.js";

/**
 * @import { BoardOperation, BoardShape, OperationApplyResult, OperationType } from "./operationTypes"
 */

/**
 * Apply an operation's type and payload to a board, as a pure function.
 *
 * What a peer does with an operation, minus the envelope check and the
 * de-duplication. For a client applying an edit to its own board before it
 * publishes it — undo does — so both boards run exactly the same code.
 *
 * @param {BoardShape[]} shapes
 * @param {{ type: OperationType, payload: Record<string, any>, timestamp?: number }} operation
 * @returns {OperationApplyResult}
 */
export function applyOperationPayload(shapes, { type, payload, timestamp = Date.now() }) {
  const validation = validateOperationPayload({ type, payload });
  if (!validation.valid) {
    return { status: "invalid", shapes, reason: validation.reason };
  }

  return applyValidatedOperation(
    shapes,
    /** @type {BoardOperation} */ ({ type, payload, timestamp }),
  );
}

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
  const type = operation.type;

  if (type === OPERATION_TYPES.CREATE_SHAPE) return applyCreateShape(shapes, operation);
  if (type === OPERATION_TYPES.CREATE_SHAPES) return applyCreateShapes(shapes, operation);
  if (type === OPERATION_TYPES.DELETE_SHAPE) return applyDeleteShapes(shapes, operation);
  if (type === OPERATION_TYPES.DELETE_SHAPES) return applyDeleteShapes(shapes, operation);
  if (type === OPERATION_TYPES.UPDATE_SHAPES) return applyUpdateShapes(shapes, operation);
  if (SINGLE_PATCH_OPERATION_TYPES.has(type)) return applyPatchShape(shapes, operation);
  if (ORDERING_OPERATION_TYPES.has(type)) return applyOrdering(shapes, operation);
  if (type === OPERATION_TYPES.GROUP) return applyGroup(shapes, operation);
  if (type === OPERATION_TYPES.UNGROUP) return applyUngroup(shapes, operation);
  if (type === OPERATION_TYPES.REORDER_SHAPES) return applyReorder(shapes, operation);

  return {
    status: "noop",
    shapes,
    reason: type + " is part of the contract but is not implemented yet.",
  };
}

/**
 * Merge a patch into a shape without letting the payload rewrite its identity.
 *
 * A merge can only add or replace keys, so keys to take away — the groupId an
 * undone GROUP added — are listed separately in `unset`.
 *
 * @param {BoardShape} shape
 * @param {Record<string, unknown>} patch
 * @param {number} timestamp
 * @param {unknown} [unset]
 * @returns {BoardShape}
 */
function patchShape(shape, patch, timestamp, unset) {
  const base = { ...shape };
  if (Array.isArray(unset)) {
    for (const key of unset) delete base[key];
  }

  return {
    ...base,
    ...patch,
    id: shape.id,
    version: Math.max(Number(shape.version ?? 0) + 1, Number(patch.version ?? 0)),
    updatedAt: timestamp,
  };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyCreateShape(shapes, operation) {
  const shape = operation.payload.shape;

  if (getShapeById(shapes, shape.id)) {
    return { status: "conflict", shapes, reason: "Shape already exists." };
  }

  return { status: "applied", shapes: [...shapes, shape] };
}

/**
 * Append every shape that is not already present.
 *
 * Shapes that already exist are skipped rather than failing the whole batch: a
 * paste replayed twice should converge, not abort halfway through.
 *
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyCreateShapes(shapes, operation) {
  const incoming = operation.payload.shapes;
  const existingIds = normalizeShapeIdSet(shapes.map((shape) => shape.id));

  const additions = incoming.filter((shape) => {
    const id = normalizeShapeId(shape.id);
    if (!id || existingIds.has(id)) return false;

    existingIds.add(id);
    return true;
  });

  if (additions.length === 0) {
    return { status: "conflict", shapes, reason: "Every shape already exists." };
  }

  return { status: "applied", shapes: [...shapes, ...additions] };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyDeleteShapes(shapes, operation) {
  const ids = resolveShapeIds(operation.payload);
  const present = ids.filter((id) => Boolean(getShapeById(shapes, id)));

  if (present.length === 0) return { status: "not_found", shapes };

  return { status: "applied", shapes: deleteShapesById(shapes, present) };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyPatchShape(shapes, operation) {
  const shapeId = normalizeShapeId(operation.payload.shapeId);
  const patch = operation.payload.patch;

  if (!patch || typeof patch !== "object") {
    return { status: "invalid", shapes, reason: operation.type + " requires payload.patch." };
  }

  if (!getShapeById(shapes, shapeId)) return { status: "not_found", shapes };

  return {
    status: "applied",
    shapes: updateShapeById(shapes, shapeId, (shape) =>
      patchShape(shape, patch, operation.timestamp),
    ),
  };
}

/**
 * Apply many patches in one pass.
 *
 * Patches naming shapes that are not on this board are skipped; the batch only
 * reports not_found when none of them match, mirroring the singular operation.
 *
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyUpdateShapes(shapes, operation) {
  const entriesById = new Map();

  for (const entry of operation.payload.patches) {
    const id = normalizeShapeId(entry.shapeId);
    if (id) entriesById.set(id, entry);
  }

  let matched = 0;
  const nextShapes = shapes.map((shape) => {
    const entry = entriesById.get(normalizeShapeId(shape.id));
    if (!entry) return shape;

    matched += 1;
    return patchShape(shape, entry.patch, operation.timestamp, entry.unset);
  });

  if (matched === 0) return { status: "not_found", shapes };

  return { status: "applied", shapes: nextShapes };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyOrdering(shapes, operation) {
  const ids = resolveShapeIds(operation.payload);
  const present = ids.filter((id) => Boolean(getShapeById(shapes, id)));

  if (present.length === 0) return { status: "not_found", shapes };

  const reorder = {
    [OPERATION_TYPES.BRING_FORWARD]: moveShapesForward,
    [OPERATION_TYPES.SEND_BACKWARD]: moveShapesBackward,
    [OPERATION_TYPES.BRING_TO_FRONT]: bringShapesToFront,
    [OPERATION_TYPES.SEND_TO_BACK]: sendShapesToBack,
  }[operation.type];

  const nextShapes = reorder(shapes, present);

  // The ordering helpers return the original array reference when nothing
  // moved, which is exactly the signal that this operation was a no-op.
  if (nextShapes === shapes) return { status: "noop", shapes };

  return { status: "applied", shapes: nextShapes };
}

/**
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyGroup(shapes, operation) {
  const nextShapes = assignGroupId(
    shapes,
    operation.payload.shapeIds,
    normalizeShapeId(operation.payload.groupId),
  );

  if (nextShapes === shapes) return { status: "not_found", shapes };

  return { status: "applied", shapes: nextShapes };
}

/**
 * Clear grouping, addressed either by group id or by an explicit shape list.
 *
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyUngroup(shapes, operation) {
  const nextShapes = clearGroupId(shapes, {
    groupId: operation.payload.groupId,
    ids: operation.payload.shapeIds ?? [],
  });

  if (nextShapes === shapes) return { status: "noop", shapes };

  return { status: "applied", shapes: nextShapes };
}

/**
 * Move shapes to exact places in the stack.
 *
 * @param {BoardShape[]} shapes
 * @param {BoardOperation} operation
 * @returns {OperationApplyResult}
 */
function applyReorder(shapes, operation) {
  const placements = operation.payload.placements;
  const anyPresent = placements.some((entry) => Boolean(getShapeById(shapes, entry.shapeId)));

  if (!anyPresent) return { status: "not_found", shapes };

  const nextShapes = placeShapes(shapes, placements);
  if (nextShapes === shapes) return { status: "noop", shapes };

  return { status: "applied", shapes: nextShapes };
}

/**
 * Ordering and delete operations accept either spelling of their target.
 *
 * @param {Record<string, any>} payload
 * @returns {string[]}
 */
function resolveShapeIds(payload) {
  const list = Array.isArray(payload.shapeIds) ? payload.shapeIds : [payload.shapeId];

  return Array.from(normalizeShapeIdSet(list));
}
