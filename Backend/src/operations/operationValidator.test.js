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
