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

test("loads a board saved before Phase 1, with no notes and no groupId", () => {
  const storage = createMemoryStorage();
  const manager = new PersistenceManager({ storage });

  // Exactly what an older build wrote: no groupId anywhere, no note shapes.
  storage.setItem(
    "flowboard:board:legacy",
    JSON.stringify({
      version: 1,
      boardId: "legacy",
      updatedAt: 1,
      shapes: [
        { id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10 },
        { id: "s2", type: "line", x: 5, y: 5, points: [0, 0, 10, 10] },
      ],
    }),
  );

  const restored = manager.loadBoard("legacy");

  assert.equal(restored.shapes.length, 2);
  assert.equal("groupId" in restored.shapes[0], false);
});

test("round-trips the fields Phase 1 added", () => {
  const storage = createMemoryStorage();
  const manager = new PersistenceManager({ storage });

  const shapes = [
    {
      id: "n1",
      type: "note",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      text: "hello",
      groupId: "grp_1",
      style: { fill: "#fef08a", fillEnabled: true },
    },
    { id: "s1", type: "rect", x: 0, y: 0, width: 10, height: 10, groupId: "grp_1" },
  ];

  manager.saveBoard({ boardId: "phase1", shapes, updatedAt: 2 });

  assert.deepEqual(manager.loadBoard("phase1").shapes, shapes);
});
