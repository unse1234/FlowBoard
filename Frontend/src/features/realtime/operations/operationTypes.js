// @ts-check

export const OPERATION_TYPES = Object.freeze({
  CREATE_SHAPE: "CREATE_SHAPE",
  UPDATE_SHAPE: "UPDATE_SHAPE",
  MOVE_SHAPE: "MOVE_SHAPE",
  DELETE_SHAPE: "DELETE_SHAPE",
  ROTATE_SHAPE: "ROTATE_SHAPE",
  RESIZE_SHAPE: "RESIZE_SHAPE",
  CHANGE_STYLE: "CHANGE_STYLE",
  BRING_FORWARD: "BRING_FORWARD",
  SEND_BACKWARD: "SEND_BACKWARD",
  GROUP: "GROUP",
  UNGROUP: "UNGROUP",
  UNDO: "UNDO",
  REDO: "REDO",
});

export const SUPPORTED_OPERATION_TYPES = new Set(Object.values(OPERATION_TYPES));

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
