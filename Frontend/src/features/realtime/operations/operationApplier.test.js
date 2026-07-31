import assert from "node:assert/strict";
import test from "node:test";
import { createBoardOperation, OperationApplier, OPERATION_TYPES } from "./index.js";

const boardId = "board_test";
const userId = "user_test";

test("applies CREATE_SHAPE once and ignores duplicate operation ids", () => {
  const applier = new OperationApplier();
  const operation = createBoardOperation({
    boardId,
    userId,
    type: OPERATION_TYPES.CREATE_SHAPE,
    operationId: "op_create_1",
    payload: {
      shape: {
        id: "shape_1",
        type: "rect",
        x: 10,
        y: 20,
      },
    },
  });

  const first = applier.apply([], operation);
  const second = applier.apply(first.shapes, operation);

  assert.equal(first.status, "applied");
  assert.equal(first.shapes.length, 1);
  assert.equal(second.status, "duplicate");
  assert.equal(second.shapes, first.shapes);
});

test("patches existing shapes without allowing payloads to replace shape identity", () => {
  const applier = new OperationApplier();
  const shapes = [{ id: "shape_1", type: "rect", x: 0, y: 0, version: 1 }];
  const operation = createBoardOperation({
    boardId,
    userId,
    type: OPERATION_TYPES.MOVE_SHAPE,
    operationId: "op_move_1",
    timestamp: 123,
    payload: {
      shapeId: "shape_1",
      patch: {
        id: "shape_other",
        x: 40,
        y: 50,
      },
    },
  });

  const result = applier.apply(shapes, operation);

  assert.equal(result.status, "applied");
  assert.equal(result.shapes[0].id, "shape_1");
  assert.equal(result.shapes[0].x, 40);
  assert.equal(result.shapes[0].updatedAt, 123);
  assert.equal(result.shapes[0].version, 2);
});

test("returns not_found for operations targeting missing shapes", () => {
  const applier = new OperationApplier();
  const operation = createBoardOperation({
    boardId,
    userId,
    type: OPERATION_TYPES.DELETE_SHAPE,
    operationId: "op_delete_missing",
    payload: { shapeId: "missing_shape" },
  });

  const result = applier.apply([], operation);

  assert.equal(result.status, "not_found");
  assert.deepEqual(result.shapes, []);
});
