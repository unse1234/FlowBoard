import assert from "node:assert/strict";
import test from "node:test";
import {
  ALIGNMENTS,
  AXES,
  getAlignmentPositions,
  getDistributionPositions,
} from "./alignment.js";

const box = (id, x, y, width = 10, height = 10) => ({ id, type: "rect", x, y, width, height });

test("aligns to the selection's own extent", () => {
  const shapes = [box("a", 0, 0), box("b", 50, 0), box("c", 100, 0)];

  const left = getAlignmentPositions(shapes, ALIGNMENTS.LEFT);
  assert.equal(left.get("b").x, 0);
  assert.equal(left.get("c").x, 0);
  assert.equal(left.has("a"), false, "the shape already in place is not moved");

  const right = getAlignmentPositions(shapes, ALIGNMENTS.RIGHT);
  assert.equal(right.get("a").x, 100);
});

test("aligns vertically without touching x", () => {
  const shapes = [box("a", 0, 0), box("b", 30, 100)];
  const positions = getAlignmentPositions(shapes, ALIGNMENTS.TOP);

  assert.deepEqual(positions.get("b"), { x: 30, y: 0 });
});

test("centres on the middle of the selection", () => {
  const shapes = [box("a", 0, 0, 10, 10), box("b", 90, 0, 10, 10)];
  const positions = getAlignmentPositions(shapes, ALIGNMENTS.CENTER_X);

  // Selection spans 0..100, so both centres move to 50.
  assert.equal(positions.get("a").x, 45);
  assert.equal(positions.get("b").x, 45);
});

test("moves a line by a delta rather than snapping its origin to its bounds", () => {
  const line = { id: "l", type: "line", x: 100, y: 0, points: [20, 0, 40, 0] };
  const shapes = [box("a", 0, 0), line];

  const positions = getAlignmentPositions(shapes, ALIGNMENTS.LEFT);

  // The line's bounds start at x=120, so aligning left of 0 shifts it by -120.
  assert.equal(positions.get("l").x, -20);
});

test("needs at least two shapes to align", () => {
  assert.equal(getAlignmentPositions([box("a", 0, 0)], ALIGNMENTS.LEFT).size, 0);
  assert.equal(getAlignmentPositions([], ALIGNMENTS.LEFT).size, 0);
});

test("evens out the gaps and leaves the outermost shapes alone", () => {
  const shapes = [box("a", 0, 0), box("b", 10, 0), box("c", 100, 0)];
  const positions = getDistributionPositions(shapes, AXES.HORIZONTAL);

  assert.equal(positions.get("b").x, 50);
  assert.equal(positions.has("a"), false);
  assert.equal(positions.has("c"), false);
});

test("distributes by centre regardless of the order shapes were selected", () => {
  const shapes = [box("c", 100, 0), box("a", 0, 0), box("b", 10, 0)];

  assert.equal(getDistributionPositions(shapes, AXES.HORIZONTAL).get("b").x, 50);
});

test("distributing is idempotent", () => {
  const shapes = [box("a", 0, 0), box("b", 50, 0), box("c", 100, 0)];

  assert.equal(getDistributionPositions(shapes, AXES.HORIZONTAL).size, 0);
});

test("needs at least three shapes to distribute", () => {
  const shapes = [box("a", 0, 0), box("b", 100, 0)];

  assert.equal(getDistributionPositions(shapes, AXES.HORIZONTAL).size, 0);
});
