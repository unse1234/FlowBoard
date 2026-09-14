import assert from "node:assert/strict";
import test from "node:test";
import {
  addToSelection,
  canUseTransformer,
  getBendableSelection,
  getSelectedShapes,
  resolveSelectedShapes,
  toggleSelection,
} from "./selectionModel.js";

const shapes = [
  { id: "a", type: "rect" },
  { id: "b", type: "line" },
  { id: "c", type: "note" },
];

test("resolves selected shapes in board order, not click order", () => {
  const selected = resolveSelectedShapes(shapes, ["c", "a"]);

  assert.deepEqual(selected.map((s) => s.id), ["a", "c"]);
});

test("derives a single selectedShape from the head of the selection", () => {
  const { selectedShape, selectedShapes } = getSelectedShapes({
    shapes,
    selectedIds: ["a", "c"],
    editingTextId: null,
  });

  assert.equal(selectedShape.id, "a");
  assert.equal(selectedShapes.length, 2);
});

test("reports no selection cleanly", () => {
  const { selectedShape, selectedShapes } = getSelectedShapes({
    shapes,
    selectedIds: [],
    editingTextId: null,
  });

  assert.equal(selectedShape, null);
  assert.deepEqual(selectedShapes, []);
});

test("keeps the transformer off a lone line but on once it joins a group", () => {
  assert.equal(canUseTransformer({ selectedShapes: [shapes[1]], editingTextId: null }), false);
  assert.equal(
    canUseTransformer({ selectedShapes: [shapes[0], shapes[1]], editingTextId: null }),
    true,
  );
});

test("keeps the transformer off while editing text and with nothing selected", () => {
  assert.equal(canUseTransformer({ selectedShapes: [shapes[0]], editingTextId: "a" }), false);
  assert.equal(canUseTransformer({ selectedShapes: [], editingTextId: null }), false);
});

test("exposes a bendable shape only when it is the sole selection", () => {
  assert.equal(getBendableSelection([shapes[1]]).id, "b");
  assert.equal(getBendableSelection([shapes[0]]), null);
  assert.equal(getBendableSelection([shapes[0], shapes[1]]), null);
});

test("toggles an id in and out of the selection", () => {
  assert.deepEqual(toggleSelection(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleSelection(["a", "b"], "a"), ["b"]);
  assert.deepEqual(toggleSelection([], "a"), ["a"]);
});

test("merges without duplicates and keeps first-seen order", () => {
  assert.deepEqual(addToSelection(["a"], ["b", "a", "c"]), ["a", "b", "c"]);
  assert.deepEqual(addToSelection([], ["b"]), ["b"]);
});
