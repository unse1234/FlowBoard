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

// --- Limits (Step 2 chunk 0.1; findings F-9, F-27, F-28) --------------------

const { OPERATION_LIMITS } = require("./operationTypes");

/** A CREATE_SHAPE whose serialised size is exactly `bytes`, padded with `fill`. */
function operationOfBytes(bytes, fill = "x") {
  const operation = { ...envelope, type: "CREATE_SHAPE", payload: { shape: { id: "s1", text: "" } } };
  const fillBytes = Buffer.byteLength(fill, "utf8");
  const missing = bytes - Buffer.byteLength(JSON.stringify(operation), "utf8");
  operation.payload.shape.text = fill.repeat(Math.floor(missing / fillBytes)) + "x".repeat(missing % fillBytes);
  assert.equal(Buffer.byteLength(JSON.stringify(operation), "utf8"), bytes, "setup: exact size");
  return operation;
}

/** Arrays nested `levels` deep around a number. */
function nested(levels) {
  let value = 0;
  for (let i = 0; i < levels; i += 1) value = [value];
  return value;
}

test("an operation may be as large as the limit, and not a byte more", () => {
  const limit = OPERATION_LIMITS.maxOperationBytes;

  assert.equal(validateOperation(operationOfBytes(limit)).valid, true);

  const over = validateOperation(operationOfBytes(limit + 1));
  assert.equal(over.valid, false);
  assert.match(over.reason, /900001 bytes; the limit is 900000/);
});

test("size is counted in UTF-8 bytes, not characters", () => {
  const limit = OPERATION_LIMITS.maxOperationBytes;

  // Two bytes per character, then four: each fits by characters, not by bytes.
  for (const fill of ["é", "😀"]) {
    const operation = operationOfBytes(limit + 2, fill);
    assert.ok(JSON.stringify(operation).length < limit, `setup: under the limit in characters (${fill})`);
    assert.equal(validateOperation(operation).valid, false, fill);
  }
});

test("nesting is capped, and a hostile depth is refused without exhausting the stack", () => {
  // The operation, its payload and the shape are three levels.
  const withDepth = (levels) => ({
    ...envelope,
    type: "CREATE_SHAPE",
    payload: { shape: { id: "s1", x: nested(levels - 3) } },
  });

  assert.equal(validateOperation(withDepth(OPERATION_LIMITS.maxDepth)).valid, true);
  assert.match(validateOperation(withDepth(OPERATION_LIMITS.maxDepth + 1)).reason, /nests more than 16/);

  // Deep enough that JSON.stringify, or Socket.IO's encoder, overflows (F-28).
  const hostile = withDepth(200_000);
  assert.throws(() => JSON.stringify(hostile), RangeError, "setup: deep enough to overflow");
  assert.equal(validateOperation(hostile).valid, false);
});

test("every batch holds at most maxBatchEntries entries, whatever the operation", () => {
  const max = OPERATION_LIMITS.maxBatchEntries;
  const ids = (count) => Array.from({ length: count }, (_, i) => `s${i}`);
  const batches = {
    CREATE_SHAPES: (n) => ({ shapes: ids(n).map((id) => ({ id })) }),
    UPDATE_SHAPES: (n) => ({ patches: ids(n).map((shapeId) => ({ shapeId, patch: { x: 1 } })) }),
    REORDER_SHAPES: (n) => ({ placements: ids(n).map((shapeId) => ({ shapeId, afterShapeId: null })) }),
    DELETE_SHAPES: (n) => ({ shapeIds: ids(n) }),
    GROUP: (n) => ({ groupId: "g1", shapeIds: ids(n) }),
    // Valid by its groupId alone: the list is bounded anyway, because the applier walks it.
    UNGROUP: (n) => ({ groupId: "g1", shapeIds: ids(n) }),
    BRING_TO_FRONT: (n) => ({ shapeIds: ids(n) }),
    SEND_BACKWARD: (n) => ({ shapeIds: ids(n) }),
  };

  for (const [type, payloadOf] of Object.entries(batches)) {
    assert.equal(validateOperation({ ...envelope, type, payload: payloadOf(max) }).valid, true, `${type} at the limit`);

    const over = validateOperation({ ...envelope, type, payload: payloadOf(max + 1) });
    assert.equal(over.valid, false, `${type} over the limit`);
    assert.match(over.reason, /at most 1000/, type);
  }
});

test("ids are at most maxIdLength characters, in the envelope and the payload alike", () => {
  const fits = "i".repeat(OPERATION_LIMITS.maxIdLength);
  const tooLong = fits + "i";
  const cases = [
    (id) => ({ ...envelope, boardId: id, type: "DELETE_SHAPE", payload: { shapeId: "s1" } }),
    (id) => ({ ...envelope, userId: id, type: "DELETE_SHAPE", payload: { shapeId: "s1" } }),
    (id) => ({ ...envelope, operationId: id, type: "DELETE_SHAPE", payload: { shapeId: "s1" } }),
    (id) => ({ ...envelope, type: "CREATE_SHAPE", payload: { shape: { id } } }),
    (id) => ({ ...envelope, type: "DELETE_SHAPES", payload: { shapeIds: ["s1", id] } }),
    (id) => ({ ...envelope, type: "GROUP", payload: { groupId: id, shapeIds: ["s1"] } }),
    (id) => ({ ...envelope, type: "UNGROUP", payload: { groupId: id } }),
    (id) => ({ ...envelope, type: "MOVE_SHAPE", payload: { shapeId: id, patch: {} } }),
    (id) => ({ ...envelope, type: "REORDER_SHAPES", payload: { placements: [{ shapeId: "s1", afterShapeId: id }] } }),
    (id) => ({ ...envelope, type: "UPDATE_SHAPES", payload: { patches: [{ shapeId: "s1", patch: {}, unset: [id] }] } }),
  ];

  for (const [index, build] of cases.entries()) {
    assert.equal(validateOperation(build(fits)).valid, true, `case ${index} at the limit`);
    assert.equal(validateOperation(build(tooLong)).valid, false, `case ${index} over the limit`);
  }
});

test("an UPDATE_SHAPES entry unsets at most maxUnsetKeys keys", () => {
  const unset = (count) =>
    validateOperation({
      ...envelope,
      type: "UPDATE_SHAPES",
      payload: {
        patches: [{ shapeId: "s1", patch: {}, unset: Array.from({ length: count }, (_, i) => `key${i}`) }],
      },
    });

  assert.equal(unset(OPERATION_LIMITS.maxUnsetKeys).valid, true);
  assert.equal(unset(OPERATION_LIMITS.maxUnsetKeys + 1).valid, false);
});
