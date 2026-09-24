const assert = require("node:assert/strict");
const test = require("node:test");
const { validateOperation } = require("./operationValidator");

test("validates required operation envelope fields", () => {
  const result = validateOperation({
    boardId: "board_test",
    operationId: "op_test",
    userId: "user_test",
    type: "CREATE_SHAPE",
    timestamp: Date.now(),
    payload: {
      shape: {
        id: "shape_test",
        type: "rect",
      },
    },
  });

  assert.equal(result.valid, true);
});

test("rejects operations missing a joined shape id", () => {
  const result = validateOperation({
    boardId: "board_test",
    operationId: "op_test",
    userId: "user_test",
    type: "MOVE_SHAPE",
    timestamp: Date.now(),
    payload: {},
  });

  assert.equal(result.valid, false);
});

const envelope = {
  boardId: "board_test",
  operationId: "op_test",
  userId: "user_test",
  timestamp: 1,
};

test("accepts UPDATE_SHAPES entries that unset keys, but never the id", () => {
  const withUnset = (unset) =>
    validateOperation({
      ...envelope,
      type: "UPDATE_SHAPES",
      payload: { patches: [{ shapeId: "s1", patch: {}, unset }] },
    });

  assert.equal(withUnset(undefined).valid, true);
  assert.equal(withUnset(["groupId"]).valid, true);
  assert.equal(withUnset(["id"]).valid, false);
  assert.equal(withUnset("groupId").valid, false);
});

test("validates REORDER_SHAPES placements", () => {
  const reorder = (placements) =>
    validateOperation({ ...envelope, type: "REORDER_SHAPES", payload: { placements } });

  assert.equal(
    reorder([
      { shapeId: "s1", afterShapeId: null },
      { shapeId: "s2", afterShapeId: "s1" },
    ]).valid,
    true,
  );
  assert.equal(reorder([]).valid, false);
  assert.equal(reorder([{ shapeId: "s1" }]).valid, false);
  assert.equal(reorder([{ shapeId: "s1", afterShapeId: "s1" }]).valid, false);
});
