/**
 * The realtime operation contract.
 *
 * Mirrors Frontend/src/features/realtime/operations/operationTypes.js. The two
 * are separate copies with no build step linking them, so any change must be
 * made in both — the frontend's operationContract.test.js asserts they match.
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
  UNDO: "UNDO",
  REDO: "REDO",
});

const SUPPORTED_OPERATION_TYPES = new Set(Object.values(OPERATION_TYPES));

/** Operations that rearrange the shape array rather than edit a shape. */
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

module.exports = {
  OPERATION_TYPES,
  SUPPORTED_OPERATION_TYPES,
  ORDERING_OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
};
