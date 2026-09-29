// @ts-check

/**
 * The realtime operation contract.
 *
 * This file is mirrored by Backend/src/operations/operationTypes.js. The two are
 * separate copies (ESM here, CommonJS there) with no build step linking them, so
 * any change must be made in both — operationContract.test.js asserts they match.
 *
 * Batch variants exist alongside the singular ones rather than replacing them:
 * bulk edits (multi-select drag, paste, group) would otherwise emit one
 * operation per shape into an append-only log that is replayed in full on join.
 *
 * Undo and redo travel as ordinary operations: the client that undoes works out
 * the inverse edit and publishes that, so a peer applies it like any other
 * change and never needs anyone's history. Two parts of the contract exist for
 * those inverse edits — `unset` on an UPDATE_SHAPES entry, naming keys to
 * remove, and REORDER_SHAPES, which puts shapes back at a place in the stack.
 * UNDO and REDO are reserved and never sent.
 */
export const OPERATION_TYPES = Object.freeze({
  CREATE_SHAPE: "CREATE_SHAPE",
  UPDATE_SHAPE: "UPDATE_SHAPE",
  MOVE_SHAPE: "MOVE_SHAPE",
  DELETE_SHAPE: "DELETE_SHAPE",
  ROTATE_SHAPE: "ROTATE_SHAPE",
  RESIZE_SHAPE: "RESIZE_SHAPE",
  CHANGE_STYLE: "CHANGE_STYLE",
  CREATE_SHAPES: "CREATE_SHAPES",
  UPDATE_SHAPES: "UPDATE_SHAPES",
  DELETE_SHAPES: "DELETE_SHAPES",
  BRING_FORWARD: "BRING_FORWARD",
  SEND_BACKWARD: "SEND_BACKWARD",
  BRING_TO_FRONT: "BRING_TO_FRONT",
  SEND_TO_BACK: "SEND_TO_BACK",
  GROUP: "GROUP",
  UNGROUP: "UNGROUP",
  REORDER_SHAPES: "REORDER_SHAPES",
  UNDO: "UNDO",
  REDO: "REDO",
});

export const SUPPORTED_OPERATION_TYPES = new Set(Object.values(OPERATION_TYPES));

/**
 * Operations that move shapes relative to where they are: a step, or to one end
 * of the stack. REORDER_SHAPES is not one of them — it names exact places.
 */
export const ORDERING_OPERATION_TYPES = new Set([
  OPERATION_TYPES.BRING_FORWARD,
  OPERATION_TYPES.SEND_BACKWARD,
  OPERATION_TYPES.BRING_TO_FRONT,
  OPERATION_TYPES.SEND_TO_BACK,
]);

/** Operations whose payload patches a single shape by id. */
export const SINGLE_PATCH_OPERATION_TYPES = new Set([
  OPERATION_TYPES.UPDATE_SHAPE,
  OPERATION_TYPES.MOVE_SHAPE,
  OPERATION_TYPES.ROTATE_SHAPE,
  OPERATION_TYPES.RESIZE_SHAPE,
  OPERATION_TYPES.CHANGE_STYLE,
]);

/**
 * How large one operation may be (rule 10; findings F-9, F-27, F-28).
 *
 * Set from what the web app sends, measured 2026-09-29: the largest AI diagram
 * is 56 KB, a ten-second pen stroke 34 KB, and nothing nests deeper than 6.
 * Larger batches are split by the sender rather than refused.
 */
export const OPERATION_LIMITS = Object.freeze({
  // UTF-8 JSON, envelope included. Under the socket's 1 MB message cap
  // (REALTIME_MAX_MESSAGE_BYTES), so a large operation is refused with a
  // reason instead of dropping the connection.
  maxOperationBytes: 900_000,
  // Shapes, patches, ids or placements in one operation. Deleting or
  // reordering k shapes on a board of n costs k × n: 1,000 on 10,000 took
  // 30 ms, 5,000 took 600 ms.
  maxBatchEntries: 1_000,
  // Counting the operation itself as 1. Checked before anything serialises
  // the operation: Socket.IO's encoder recurses, and 20,000 levels of nested
  // arrays crash the process (F-28).
  maxDepth: 16,
  // Board, user, operation, shape and group ids, and keys to unset. The app's
  // are at most 42 characters.
  maxIdLength: 128,
  // Keys one UPDATE_SHAPES entry may remove.
  maxUnsetKeys: 64,
});

/**
 * @typedef {typeof OPERATION_TYPES[keyof typeof OPERATION_TYPES]} OperationType
 * @typedef {string} BoardId
 * @typedef {string} UserId
 * @typedef {string} OperationId
 * @typedef {string} ShapeId
 *
 * @typedef {Record<string, unknown> & { id: ShapeId, type: string }} BoardShape
 *
 * Move `shapeId` to sit directly above `afterShapeId`, or to the bottom of the
 * stack when that is null.
 * @typedef {{ shapeId: ShapeId, afterShapeId: ShapeId | null }} ShapePlacement
 *
 * @typedef {Object} BoardOperation
 * @property {BoardId} boardId
 * @property {OperationType} type
 * @property {Record<string, unknown>} payload
 * @property {number} timestamp
 * @property {UserId} userId
 * @property {OperationId} operationId
 *
 * @typedef {"applied" | "duplicate" | "invalid" | "not_found" | "conflict" | "noop"} OperationStatus
 *
 * @typedef {Object} OperationApplyResult
 * @property {OperationStatus} status
 * @property {BoardShape[]} shapes
 * @property {string} [reason]
 */
