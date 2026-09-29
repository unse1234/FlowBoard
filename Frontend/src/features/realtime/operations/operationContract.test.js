import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  OPERATION_LIMITS,
  ORDERING_OPERATION_TYPES,
  OPERATION_TYPES,
  SINGLE_PATCH_OPERATION_TYPES,
} from "./operationTypes.js";
import { validateOperation } from "./operationValidator.js";

const require = createRequire(import.meta.url);
const backend = require("../../../../../Backend/src/operations/operationTypes.js");
const backendValidator = require("../../../../../Backend/src/operations/operationValidator.js");

/**
 * The operation contract is duplicated: ESM on the frontend, CommonJS on the
 * backend, with no build step linking them. A type added to only one side fails
 * silently — the server rejects the emit, or a peer drops the operation — so
 * these tests exist to make the drift loud.
 */

test("frontend and backend agree on every operation type", () => {
  assert.deepEqual(
    Object.keys(OPERATION_TYPES).sort(),
    Object.keys(backend.OPERATION_TYPES).sort(),
    "operation type keys have drifted",
  );

  for (const [key, value] of Object.entries(OPERATION_TYPES)) {
    assert.equal(backend.OPERATION_TYPES[key], value, key + " value has drifted");
  }
});

test("frontend and backend agree on the operation category sets", () => {
  assert.deepEqual(
    [...ORDERING_OPERATION_TYPES].sort(),
    [...backend.ORDERING_OPERATION_TYPES].sort(),
  );
  assert.deepEqual(
    [...SINGLE_PATCH_OPERATION_TYPES].sort(),
    [...backend.SINGLE_PATCH_OPERATION_TYPES].sort(),
  );
});

test("both validators reach the same verdict on the same operations", () => {
  const base = {
    boardId: "board_1",
    userId: "user_1",
    operationId: "op_1",
    timestamp: 1,
  };

  const cases = [
    { ...base, type: OPERATION_TYPES.CREATE_SHAPE, payload: { shape: { id: "s1" } } },
    { ...base, type: OPERATION_TYPES.CREATE_SHAPE, payload: { shape: {} } },
    { ...base, type: OPERATION_TYPES.CREATE_SHAPES, payload: { shapes: [{ id: "s1" }] } },
    { ...base, type: OPERATION_TYPES.CREATE_SHAPES, payload: { shapes: [] } },
    { ...base, type: OPERATION_TYPES.CREATE_SHAPES, payload: { shapes: [{}] } },
    {
      ...base,
      type: OPERATION_TYPES.UPDATE_SHAPES,
      payload: { patches: [{ shapeId: "s1", patch: { x: 1 } }] },
    },
    { ...base, type: OPERATION_TYPES.UPDATE_SHAPES, payload: { patches: [{ shapeId: "s1" }] } },
    { ...base, type: OPERATION_TYPES.DELETE_SHAPES, payload: { shapeIds: ["s1", "s2"] } },
    { ...base, type: OPERATION_TYPES.DELETE_SHAPES, payload: { shapeIds: [] } },
    { ...base, type: OPERATION_TYPES.BRING_FORWARD, payload: { shapeId: "s1" } },
    { ...base, type: OPERATION_TYPES.BRING_FORWARD, payload: { shapeIds: ["s1"] } },
    { ...base, type: OPERATION_TYPES.BRING_TO_FRONT, payload: {} },
    { ...base, type: OPERATION_TYPES.GROUP, payload: { groupId: "g1", shapeIds: ["s1"] } },
    { ...base, type: OPERATION_TYPES.GROUP, payload: { shapeIds: ["s1"] } },
    { ...base, type: OPERATION_TYPES.UNGROUP, payload: { groupId: "g1" } },
    { ...base, type: OPERATION_TYPES.UNGROUP, payload: {} },
    { ...base, type: OPERATION_TYPES.MOVE_SHAPE, payload: { shapeId: "s1", patch: {} } },
    { ...base, type: OPERATION_TYPES.MOVE_SHAPE, payload: {} },
    { ...base, type: "NOT_A_REAL_TYPE", payload: {} },
  ];

  for (const operation of cases) {
    const label = operation.type + " " + JSON.stringify(operation.payload);

    assert.equal(
      validateOperation(operation).valid,
      backendValidator.validateOperation(operation).valid,
      "validators disagree on " + label,
    );
  }
});

test("both validators accept undo's inverse edits and reject malformed ones", () => {
  const base = {
    boardId: "board_1",
    userId: "user_1",
    operationId: "op_1",
    timestamp: 1,
  };
  const update = (entry) => ({
    ...base,
    type: OPERATION_TYPES.UPDATE_SHAPES,
    payload: { patches: [{ shapeId: "s1", patch: {}, ...entry }] },
  });
  const reorder = (placements) => ({
    ...base,
    type: OPERATION_TYPES.REORDER_SHAPES,
    payload: { placements },
  });

  const cases = [
    [update({ unset: ["groupId"] }), true],
    [update({ unset: [] }), true],
    [update({ unset: ["id"] }), false],
    [update({ unset: "groupId" }), false],
    [update({ unset: [""] }), false],
    [
      reorder([
        { shapeId: "s1", afterShapeId: null },
        { shapeId: "s2", afterShapeId: "s1" },
      ]),
      true,
    ],
    [reorder([]), false],
    [reorder([{ shapeId: "s1" }]), false],
    [reorder([{ shapeId: "s1", afterShapeId: "s1" }]), false],
    [reorder([{ afterShapeId: null }]), false],
    [{ ...base, type: OPERATION_TYPES.REORDER_SHAPES, payload: {} }, false],
  ];

  for (const [operation, expected] of cases) {
    const label = operation.type + " " + JSON.stringify(operation.payload);

    assert.equal(validateOperation(operation).valid, expected, "frontend on " + label);
    assert.equal(backendValidator.validateOperation(operation).valid, expected, "backend on " + label);
  }
});

test("the singular ordering payload still validates, for older peers", () => {
  const operation = {
    boardId: "board_1",
    userId: "user_1",
    operationId: "op_1",
    timestamp: 1,
    type: OPERATION_TYPES.BRING_FORWARD,
    payload: { shapeId: "s1" },
  };

  assert.equal(validateOperation(operation).valid, true);
  assert.equal(backendValidator.validateOperation(operation).valid, true);
});

test("frontend and backend agree on the operation limits", () => {
  assert.deepEqual({ ...OPERATION_LIMITS }, { ...backend.OPERATION_LIMITS });
});

test("both validators draw every limit in the same place", () => {
  const limits = OPERATION_LIMITS;
  const base = {
    boardId: "board_1",
    userId: "user_1",
    operationId: "op_1",
    timestamp: 1,
  };

  /** A CREATE_SHAPE of exactly `bytes` UTF-8 bytes, padded with `fill`. */
  const sized = (bytes, fill = "x") => {
    const operation = { ...base, type: OPERATION_TYPES.CREATE_SHAPE, payload: { shape: { id: "s1", text: "" } } };
    const fillBytes = new TextEncoder().encode(fill).length;
    const missing = bytes - new TextEncoder().encode(JSON.stringify(operation)).length;
    operation.payload.shape.text = fill.repeat(Math.floor(missing / fillBytes)) + "x".repeat(missing % fillBytes);
    return operation;
  };
  /** An operation `levels` deep, counting itself as 1. */
  const deep = (levels) => {
    let value = 0;
    for (let level = 0; level < levels - 3; level += 1) value = [value];
    return { ...base, type: OPERATION_TYPES.CREATE_SHAPE, payload: { shape: { id: "s1", x: value } } };
  };
  const ids = (count) => Array.from({ length: count }, (_, i) => `s${i}`);
  const id = (length) => "i".repeat(length);

  const cases = [
    ["exactly the byte limit", sized(limits.maxOperationBytes), true],
    ["one byte over", sized(limits.maxOperationBytes + 1), false],
    ["over in bytes, under in characters (2-byte)", sized(limits.maxOperationBytes + 2, "é"), false],
    ["over in bytes, under in characters (4-byte)", sized(limits.maxOperationBytes + 2, "😀"), false],
    ["exactly the depth limit", deep(limits.maxDepth), true],
    ["one level deeper", deep(limits.maxDepth + 1), false],
    ["deep enough to overflow a recursive walk", deep(200_000), false],
    ["a full batch", { ...base, type: OPERATION_TYPES.DELETE_SHAPES, payload: { shapeIds: ids(limits.maxBatchEntries) } }, true],
    ["one entry over", { ...base, type: OPERATION_TYPES.DELETE_SHAPES, payload: { shapeIds: ids(limits.maxBatchEntries + 1) } }, false],
    [
      "an over-long list beside a valid groupId",
      { ...base, type: OPERATION_TYPES.UNGROUP, payload: { groupId: "g1", shapeIds: ids(limits.maxBatchEntries + 1) } },
      false,
    ],
    [
      "too many patches",
      {
        ...base,
        type: OPERATION_TYPES.UPDATE_SHAPES,
        payload: { patches: ids(limits.maxBatchEntries + 1).map((shapeId) => ({ shapeId, patch: {} })) },
      },
      false,
    ],
    ["an id at the limit", { ...base, operationId: id(limits.maxIdLength), type: OPERATION_TYPES.DELETE_SHAPE, payload: { shapeId: "s1" } }, true],
    ["an envelope id over it", { ...base, operationId: id(limits.maxIdLength + 1), type: OPERATION_TYPES.DELETE_SHAPE, payload: { shapeId: "s1" } }, false],
    ["a shape id over it", { ...base, type: OPERATION_TYPES.DELETE_SHAPE, payload: { shapeId: id(limits.maxIdLength + 1) } }, false],
    [
      "a placement's afterShapeId over it",
      { ...base, type: OPERATION_TYPES.REORDER_SHAPES, payload: { placements: [{ shapeId: "s1", afterShapeId: id(limits.maxIdLength + 1) }] } },
      false,
    ],
    [
      "as many unset keys as allowed",
      { ...base, type: OPERATION_TYPES.UPDATE_SHAPES, payload: { patches: [{ shapeId: "s1", patch: {}, unset: ids(limits.maxUnsetKeys) }] } },
      true,
    ],
    [
      "one unset key too many",
      { ...base, type: OPERATION_TYPES.UPDATE_SHAPES, payload: { patches: [{ shapeId: "s1", patch: {}, unset: ids(limits.maxUnsetKeys + 1) }] } },
      false,
    ],
  ];

  for (const [label, operation, expected] of cases) {
    assert.equal(validateOperation(operation).valid, expected, "frontend on " + label);
    assert.equal(backendValidator.validateOperation(operation).valid, expected, "backend on " + label);
  }
});
