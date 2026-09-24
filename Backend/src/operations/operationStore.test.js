const assert = require("node:assert/strict");
const test = require("node:test");
const { OperationStore } = require("./operationStore");

/**
 * The server's record of what has happened to each board.
 *
 * Entirely in memory, which is finding F-3: a restart loses every collaborative
 * board. These tests pin what it does today so Step 2 can replace it with
 * something durable and know exactly what has to keep working.
 */

const operation = (operationId, boardId = "board-1") => ({
  operationId,
  boardId,
  userId: "user_a",
  type: "CREATE_SHAPE",
  timestamp: 1,
  payload: { shape: { id: "shape-1", type: "rect" } },
});

test("an operation is stored and listed back", () => {
  const store = new OperationStore();

  const result = store.add(operation("op-1"));

  assert.deepEqual(result, { stored: true, duplicate: false });
  assert.deepEqual(store.list("board-1"), [operation("op-1")]);
});

test("the same operation id is stored once", () => {
  const store = new OperationStore();
  store.add(operation("op-1"));

  const second = store.add(operation("op-1"));

  // A client that retries after a dropped acknowledgement must not double the
  // edit.
  assert.deepEqual(second, { stored: false, duplicate: true });
  assert.equal(store.list("board-1").length, 1);
});

test("a re-sent operation does not overwrite the stored one", () => {
  const store = new OperationStore();
  store.add(operation("op-1"));

  store.add({ ...operation("op-1"), payload: { shape: { id: "different", type: "circle" } } });

  // First write wins, so a replay cannot be used to rewrite history under an id
  // that peers have already applied.
  assert.deepEqual(store.list("board-1")[0].payload.shape, { id: "shape-1", type: "rect" });
});

test("operations are listed in the order they arrived", () => {
  const store = new OperationStore();
  for (const id of ["op-1", "op-2", "op-3"]) store.add(operation(id));

  // Replay order is apply order; a board rebuilt out of order is a different
  // board.
  assert.deepEqual(
    store.list("board-1").map((entry) => entry.operationId),
    ["op-1", "op-2", "op-3"],
  );
});

test("boards do not share operations", () => {
  const store = new OperationStore();
  store.add(operation("op-1", "board-1"));
  store.add(operation("op-2", "board-2"));

  assert.deepEqual(store.list("board-1").map((entry) => entry.operationId), ["op-1"]);
  assert.deepEqual(store.list("board-2").map((entry) => entry.operationId), ["op-2"]);
});

test("the same operation id on two boards is kept for both", () => {
  const store = new OperationStore();

  const first = store.add(operation("op-1", "board-1"));
  const second = store.add(operation("op-1", "board-2"));

  // De-duplication is per board, so two clients that happen to generate the
  // same id on different boards do not erase each other.
  assert.equal(first.stored, true);
  assert.equal(second.stored, true);
});

test("an unknown board lists nothing", () => {
  const store = new OperationStore();

  assert.deepEqual(store.list("never-used"), []);
});

test("each store is independent", () => {
  const first = new OperationStore();
  const second = new OperationStore();

  first.add(operation("op-1"));

  // Nothing is shared at module level, so one server instance's boards are not
  // another's — which is also why this cannot span instances (F-3, and the
  // reason Step 2 needs durable storage).
  assert.equal(second.list("board-1").length, 0);
});

test("F-5: nothing is ever evicted", () => {
  const store = new OperationStore();

  for (let index = 0; index < 500; index += 1) store.add(operation(`op-${index}`));

  // There is no cap, no age limit and no compaction, so memory and replay cost
  // rise with every edit a board has ever received.
  assert.equal(store.list("board-1").length, 500);
});
