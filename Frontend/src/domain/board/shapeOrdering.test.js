import assert from "node:assert/strict";
import test from "node:test";
import {
  bringShapesToFront,
  moveShapesBackward,
  moveShapesForward,
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
