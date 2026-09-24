import assert from "node:assert/strict";
import test from "node:test";
import {
  bringShapesToFront,
  moveShapesBackward,
  moveShapesForward,
  placeShapes,
  sendShapesToBack,
} from "./shapeOrdering.js";

const board = (...ids) => ids.map((id) => ({ id }));
const order = (shapes) => shapes.map((shape) => shape.id);

test("moves a single shape one step in each direction", () => {
  const shapes = board("a", "b", "c");

  assert.deepEqual(order(moveShapesForward(shapes, ["b"])), ["a", "c", "b"]);
  assert.deepEqual(order(moveShapesBackward(shapes, ["b"])), ["b", "a", "c"]);
});

test("returns the original array when a shape is already at the edge", () => {
  const shapes = board("a", "b", "c");

  assert.equal(moveShapesForward(shapes, ["c"]), shapes, "top cannot go further");
  assert.equal(moveShapesBackward(shapes, ["a"]), shapes, "bottom cannot go further");
});

test("shuffles a contiguous run together without scrambling its order", () => {
  const shapes = board("a", "b", "c", "d");

  assert.deepEqual(order(moveShapesForward(shapes, ["b", "c"])), ["a", "d", "b", "c"]);
  assert.deepEqual(order(moveShapesBackward(shapes, ["b", "c"])), ["b", "c", "a", "d"]);
});

test("moves a non-contiguous selection independently", () => {
  const shapes = board("a", "b", "c", "d");

  assert.deepEqual(order(moveShapesForward(shapes, ["a", "c"])), ["b", "a", "d", "c"]);
});

test("brings a selection to the front preserving relative order", () => {
  const shapes = board("a", "b", "c", "d");

  assert.deepEqual(order(bringShapesToFront(shapes, ["a", "c"])), ["b", "d", "a", "c"]);
});

test("sends a selection to the back preserving relative order", () => {
  const shapes = board("a", "b", "c", "d");

  assert.deepEqual(order(sendShapesToBack(shapes, ["b", "d"])), ["b", "d", "a", "c"]);
});

test("returns the original array when the order would not change", () => {
  const shapes = board("a", "b", "c");

  assert.equal(bringShapesToFront(shapes, ["c"]), shapes);
  assert.equal(sendShapesToBack(shapes, ["a"]), shapes);
  assert.equal(bringShapesToFront(shapes, []), shapes);
  assert.equal(moveShapesForward(shapes, ["missing"]), shapes);
});

test("ignores ids that are not on the board", () => {
  const shapes = board("a", "b");

  assert.deepEqual(order(bringShapesToFront(shapes, ["a", "ghost"])), ["b", "a"]);
});

test("places a shape directly above an anchor, or at the bottom", () => {
  const shapes = board("a", "b", "c", "d");

  assert.deepEqual(order(placeShapes(shapes, [{ shapeId: "d", afterShapeId: "a" }])), [
    "a",
    "d",
    "b",
    "c",
  ]);
  assert.deepEqual(order(placeShapes(shapes, [{ shapeId: "c", afterShapeId: null }])), [
    "c",
    "a",
    "b",
    "d",
  ]);
});

test("runs placements in order, so a run listed bottom to top lands together", () => {
  const shapes = board("c", "d", "a", "b");

  const placed = placeShapes(shapes, [
    { shapeId: "a", afterShapeId: null },
    { shapeId: "b", afterShapeId: "a" },
  ]);

  assert.deepEqual(order(placed), ["a", "b", "c", "d"]);
});

test("skips a placement whose shape or anchor is gone, and keeps the array when nothing moved", () => {
  const shapes = board("a", "b", "c");

  assert.equal(placeShapes(shapes, [{ shapeId: "ghost", afterShapeId: "a" }]), shapes);
  assert.equal(placeShapes(shapes, [{ shapeId: "c", afterShapeId: "ghost" }]), shapes);
  assert.equal(placeShapes(shapes, [{ shapeId: "b", afterShapeId: "a" }]), shapes, "already there");
  assert.equal(placeShapes(shapes, [{ shapeId: "a", afterShapeId: null }]), shapes, "already bottom");
});
