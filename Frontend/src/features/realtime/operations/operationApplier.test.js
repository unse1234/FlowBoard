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

const op = (type, payload, operationId) =>
  createBoardOperation({ boardId, userId, type, payload, operationId, timestamp: 500 });

test("CREATE_SHAPES appends every new shape in one operation", () => {
  const applier = new OperationApplier();
  const result = applier.apply(
    [{ id: "a", type: "rect" }],
    op(OPERATION_TYPES.CREATE_SHAPES, { shapes: [{ id: "b" }, { id: "c" }] }, "op_cs_1"),
  );

  assert.equal(result.status, "applied");
  assert.deepEqual(result.shapes.map((s) => s.id), ["a", "b", "c"]);
});

test("CREATE_SHAPES skips shapes that already exist instead of failing", () => {
  const applier = new OperationApplier();
  const shapes = [{ id: "a", type: "rect" }];

  const partial = applier.apply(
    shapes,
    op(OPERATION_TYPES.CREATE_SHAPES, { shapes: [{ id: "a" }, { id: "b" }] }, "op_cs_2"),
  );
  assert.equal(partial.status, "applied");
  assert.deepEqual(partial.shapes.map((s) => s.id), ["a", "b"]);

  const allExisting = applier.apply(
    shapes,
    op(OPERATION_TYPES.CREATE_SHAPES, { shapes: [{ id: "a" }] }, "op_cs_3"),
  );
  assert.equal(allExisting.status, "conflict");
});

test("UPDATE_SHAPES patches many shapes and preserves their identity", () => {
  const applier = new OperationApplier();
  const shapes = [
    { id: "a", type: "rect", x: 0, version: 1 },
    { id: "b", type: "rect", x: 0, version: 1 },
    { id: "c", type: "rect", x: 0, version: 1 },
  ];

  const result = applier.apply(
    shapes,
    op(
      OPERATION_TYPES.UPDATE_SHAPES,
      {
        patches: [
          { shapeId: "a", patch: { id: "hijack", x: 10 } },
          { shapeId: "c", patch: { x: 30 } },
        ],
      },
      "op_us_1",
    ),
  );

  assert.equal(result.status, "applied");
  assert.deepEqual(result.shapes.map((s) => s.x), [10, 0, 30]);
  assert.equal(result.shapes[0].id, "a", "payload must not rewrite identity");
  assert.equal(result.shapes[0].version, 2);
  assert.equal(result.shapes[0].updatedAt, 500);
  assert.equal(result.shapes[1].version, 1, "untouched shape keeps its version");
});

test("UPDATE_SHAPES reports not_found only when nothing matched", () => {
  const applier = new OperationApplier();
  const shapes = [{ id: "a", type: "rect" }];

  const partial = applier.apply(
    shapes,
    op(
      OPERATION_TYPES.UPDATE_SHAPES,
      { patches: [{ shapeId: "a", patch: { x: 1 } }, { shapeId: "ghost", patch: { x: 2 } }] },
      "op_us_2",
    ),
  );
  assert.equal(partial.status, "applied");

  const missing = applier.apply(
    shapes,
    op(OPERATION_TYPES.UPDATE_SHAPES, { patches: [{ shapeId: "ghost", patch: {} }] }, "op_us_3"),
  );
  assert.equal(missing.status, "not_found");
});

test("DELETE_SHAPES removes many shapes in one operation", () => {
  const applier = new OperationApplier();
  const shapes = [{ id: "a" }, { id: "b" }, { id: "c" }];

  const result = applier.apply(
    shapes,
    op(OPERATION_TYPES.DELETE_SHAPES, { shapeIds: ["a", "c", "ghost"] }, "op_ds_1"),
  );

  assert.equal(result.status, "applied");
  assert.deepEqual(result.shapes.map((s) => s.id), ["b"]);
});

test("ordering operations accept both the singular and plural payloads", () => {
  const applier = new OperationApplier();
  const shapes = [{ id: "a" }, { id: "b" }, { id: "c" }];

  const single = applier.apply(
    shapes,
    op(OPERATION_TYPES.BRING_FORWARD, { shapeId: "a" }, "op_or_1"),
  );
  assert.deepEqual(single.shapes.map((s) => s.id), ["b", "a", "c"]);

  const plural = applier.apply(
    shapes,
    op(OPERATION_TYPES.SEND_TO_BACK, { shapeIds: ["b", "c"] }, "op_or_2"),
  );
  assert.deepEqual(plural.shapes.map((s) => s.id), ["b", "c", "a"]);
});

test("ordering reports noop when the stack cannot move further", () => {
  const applier = new OperationApplier();
  const shapes = [{ id: "a" }, { id: "b" }];

  const result = applier.apply(
    shapes,
    op(OPERATION_TYPES.BRING_FORWARD, { shapeId: "b" }, "op_or_3"),
  );

  assert.equal(result.status, "noop");
  assert.equal(result.shapes, shapes);
});

test("GROUP stamps a groupId and UNGROUP removes it", () => {
  const applier = new OperationApplier();
  const shapes = [{ id: "a" }, { id: "b" }, { id: "c" }];

  const grouped = applier.apply(
    shapes,
    op(OPERATION_TYPES.GROUP, { groupId: "g1", shapeIds: ["a", "b"] }, "op_g_1"),
  );
  assert.equal(grouped.status, "applied");
  assert.deepEqual(grouped.shapes.map((s) => s.groupId), ["g1", "g1", undefined]);

  const ungrouped = applier.apply(
    grouped.shapes,
    op(OPERATION_TYPES.UNGROUP, { groupId: "g1" }, "op_g_2"),
  );
  assert.equal(ungrouped.status, "applied");
  assert.equal("groupId" in ungrouped.shapes[0], false, "groupId is removed, not nulled");
});

test("UNGROUP on an already-ungrouped board is a noop", () => {
  const applier = new OperationApplier();

  const result = applier.apply(
    [{ id: "a" }],
    op(OPERATION_TYPES.UNGROUP, { groupId: "g1" }, "op_g_3"),
  );

  assert.equal(result.status, "noop");
});
