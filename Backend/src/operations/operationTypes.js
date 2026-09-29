/**
 * The realtime operation contract.
 *
 * Mirrors Frontend/src/features/realtime/operations/operationTypes.js. The two
 * are separate copies with no build step linking them, so any change must be
 * made in both — the frontend's operationContract.test.js asserts they match.
 *
 * Undo and redo are published as ordinary inverse operations, using `unset` on
 * UPDATE_SHAPES entries and REORDER_SHAPES; UNDO and REDO are reserved and
 * never sent.
 */
const OPERATION_TYPES = Object.freeze({
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

const SUPPORTED_OPERATION_TYPES = new Set(Object.values(OPERATION_TYPES));

/**
 * Operations that move shapes relative to where they are: a step, or to one end
 * of the stack. REORDER_SHAPES is not one of them — it names exact places.
 */
const ORDERING_OPERATION_TYPES = new Set([
  OPERATION_TYPES.BRING_FORWARD,
  OPERATION_TYPES.SEND_BACKWARD,
  OPERATION_TYPES.BRING_TO_FRONT,
  OPERATION_TYPES.SEND_TO_BACK,
]);

/** Operations whose payload patches a single shape by id. */
const SINGLE_PATCH_OPERATION_TYPES = new Set([
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
const OPERATION_LIMITS = Object.freeze({
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

module.exports = {
  OPERATION_TYPES,
  SUPPORTED_OPERATION_TYPES,
  ORDERING_OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
  OPERATION_LIMITS,
};
