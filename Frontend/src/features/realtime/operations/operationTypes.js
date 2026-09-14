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
  UNDO: "UNDO",
  REDO: "REDO",
});

export const SUPPORTED_OPERATION_TYPES = new Set(Object.values(OPERATION_TYPES));

/** Operations that rearrange the shape array rather than edit a shape. */
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
 * @typedef {typeof OPERATION_TYPES[keyof typeof OPERATION_TYPES]} OperationType
 * @typedef {string} BoardId
 * @typedef {string} UserId
 * @typedef {string} OperationId
 * @typedef {string} ShapeId
 *
 * @typedef {Record<string, unknown> & { id: ShapeId, type: string }} BoardShape
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
