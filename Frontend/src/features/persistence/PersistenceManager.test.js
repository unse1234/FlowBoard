import assert from "node:assert/strict";
import test from "node:test";
import { PersistenceManager } from "./PersistenceManager.js";

test("saves and loads versioned board shapes", () => {
  const storage = createMemoryStorage();
  const manager = new PersistenceManager({ storage });

  manager.saveBoard({
    boardId: "board_test",
    shapes: [{ id: "shape_1", type: "rect" }],
    updatedAt: 123,
  });

  const restored = manager.loadBoard("board_test");

  assert.deepEqual(restored, {
    shapes: [{ id: "shape_1", type: "rect" }],
    updatedAt: 123,
  });
});

test("clears corrupt board data", () => {
  const storage = createMemoryStorage();
  storage.setItem("flowboard:board:board_test", "{bad json");
  const manager = new PersistenceManager({ storage, logger: { warn() {} } });

  const restored = manager.loadBoard("board_test");

  assert.equal(restored, null);
  assert.equal(storage.getItem("flowboard:board:board_test"), null);
});

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
