import assert from "node:assert/strict";
import test from "node:test";
import { createBoardOperation } from "./createBoardOperation.js";
import { OPERATION_LIMITS, OPERATION_TYPES } from "./operationTypes.js";
import { validateOperation } from "./operationValidator.js";
import { splitOperation } from "./splitOperation.js";

const boardId = "board_test";
const userId = "user_test";
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

function ids() {
  let next = 0;
  return () => `op_piece_${(next += 1)}`;
}

const operationOf = (type, payload) => createBoardOperation({ boardId, userId, type, payload, operationId: "op_original" });

/** A shape of about `size` bytes, like a stroke with many points. */
const shape = (index, size = 3000) => ({ id: `shape_${index}`, type: "pen", points: "x".repeat(size) });

test("an edit within the limits is sent as it is", () => {
  const operation = operationOf(OPERATION_TYPES.CREATE_SHAPE, { shape: shape(1) });

  const { operations, refused } = splitOperation(operation, { createId: ids() });

  assert.deepEqual(operations, [operation]);
  assert.equal(operations[0], operation);
  assert.deepEqual(refused, []);
});

test("a board seed too large for one message becomes several, in order, each within the limits", () => {
  // 1,000 shapes of 3 KB: the mixed board measured in chunk 0.1, about 3 MB.
  const shapes = Array.from({ length: 1000 }, (_, i) => shape(i));
  const operation = operationOf(OPERATION_TYPES.CREATE_SHAPES, { shapes });
  assert.equal(validateOperation(operation).valid, false, "setup: too large as one operation");

  const { operations, refused } = splitOperation(operation, { createId: ids() });

  assert.deepEqual(refused, []);
  assert.ok(operations.length >= 4 && operations.length <= 5, `${operations.length} pieces for about 3 MB`);
  for (const piece of operations) {
    assert.equal(validateOperation(piece).valid, true);
    assert.equal(piece.type, OPERATION_TYPES.CREATE_SHAPES);
    assert.ok(bytes(piece) <= OPERATION_LIMITS.maxOperationBytes);
  }
  assert.deepEqual(operations.flatMap((piece) => piece.payload.shapes), shapes);
  assert.equal(new Set(operations.map((piece) => piece.operationId)).size, operations.length);
  assert.ok(!operations.some((piece) => piece.operationId === "op_original"));
});

test("a batch with more entries than allowed is cut by count", () => {
  const count = OPERATION_LIMITS.maxBatchEntries * 2 + 500;
  const shapeIds = Array.from({ length: count }, (_, i) => `shape_${i}`);
  const cases = {
    [OPERATION_TYPES.DELETE_SHAPES]: { shapeIds },
    [OPERATION_TYPES.UPDATE_SHAPES]: { patches: shapeIds.map((shapeId) => ({ shapeId, patch: { x: 1 } })) },
    [OPERATION_TYPES.REORDER_SHAPES]: { placements: shapeIds.map((shapeId) => ({ shapeId, afterShapeId: null })) },
    [OPERATION_TYPES.GROUP]: { groupId: "group_1", shapeIds },
    [OPERATION_TYPES.UNGROUP]: { groupId: "group_1", shapeIds },
  };

  for (const [type, payload] of Object.entries(cases)) {
    const { operations, refused } = splitOperation(operationOf(type, payload), { createId: ids() });

    assert.deepEqual(refused, [], type);
    assert.deepEqual(operations.map((piece) => Object.values(piece.payload).find(Array.isArray).length), [1000, 1000, 500], type);
    for (const piece of operations) {
      assert.equal(validateOperation(piece).valid, true, type);
      // The rest of the payload travels with every piece: a group keeps its id.
      if (payload.groupId) assert.equal(piece.payload.groupId, "group_1", type);
    }
  }
});

test("an entry too large for any operation is refused, and the rest still goes", () => {
  const huge = shape("huge", OPERATION_LIMITS.maxOperationBytes);
  const shapes = [shape(1), huge, shape(2)];

  const { operations, refused } = splitOperation(operationOf(OPERATION_TYPES.CREATE_SHAPES, { shapes }), { createId: ids() });

  // Set aside, so the entries around it still travel together.
  assert.equal(operations.length, 1);
  assert.deepEqual(operations[0].payload.shapes, [shapes[0], shapes[2]]);
  assert.equal(refused.length, 1);
  assert.deepEqual(refused[0].operation.payload.shapes, [huge]);
  assert.match(refused[0].reason, /bytes; the limit is/);
});

test("an edit that cannot be split is refused whole, not sent to fail", () => {
  const shapeIds = Array.from({ length: OPERATION_LIMITS.maxBatchEntries + 1 }, (_, i) => `shape_${i}`);
  // Moving two halves of a selection forward is not moving it all at once.
  const forward = operationOf(OPERATION_TYPES.BRING_FORWARD, { shapeIds });
  const oneImage = operationOf(OPERATION_TYPES.CREATE_SHAPE, { shape: shape("image", OPERATION_LIMITS.maxOperationBytes) });

  for (const operation of [forward, oneImage]) {
    const { operations, refused } = splitOperation(operation, { createId: ids() });

    assert.deepEqual(operations, []);
    assert.equal(refused.length, 1);
    assert.equal(refused[0].operation, operation);
  }
});

test("an entry invalid for another reason costs its own piece, not the whole edit", () => {
  const shapes = Array.from({ length: OPERATION_LIMITS.maxBatchEntries + 1 }, (_, i) => ({ id: `shape_${i}` }));
  shapes[3] = { id: "i".repeat(OPERATION_LIMITS.maxIdLength + 1) };

  const { operations, refused } = splitOperation(operationOf(OPERATION_TYPES.CREATE_SHAPES, { shapes }), { createId: ids() });

  // The piece holding the bad id is refused; the other piece goes.
  assert.equal(operations.length, 1);
  assert.equal(refused.length, 1);
  assert.ok(refused[0].operation.payload.shapes.includes(shapes[3]));
});
