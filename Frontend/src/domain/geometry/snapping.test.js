import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSnapCandidates,
  getSnapAnchors,
  resolveSnap,
  withGridCandidates,
} from "./snapping.js";

const box = (x, y, width, height) => ({ type: "rect", x, y, width, height });

test("offers both edges and the centre on each axis", () => {
  const anchors = getSnapAnchors({ x: 0, y: 10, width: 100, height: 50 });

  assert.deepEqual(anchors.vertical, [0, 50, 100]);
  assert.deepEqual(anchors.horizontal, [10, 35, 60]);
});

test("builds a sorted, de-duplicated candidate set", () => {
  const candidates = buildSnapCandidates([box(0, 0, 100, 100), box(0, 0, 100, 100)]);

  assert.deepEqual(candidates.vertical, [0, 50, 100]);
  assert.deepEqual(candidates.horizontal, [0, 50, 100]);
});

test("includes line shapes in the candidate set", () => {
  const candidates = buildSnapCandidates([
    { type: "line", x: 10, y: 10, points: [0, 0, 20, 0] },
  ]);

  assert.deepEqual(candidates.vertical, [10, 20, 30]);
});

test("snaps a near miss onto the neighbouring edge", () => {
  const candidates = buildSnapCandidates([box(0, 0, 100, 100)]);
  const result = resolveSnap({ x: 103, y: 0, width: 50, height: 100 }, candidates, 8);

  assert.equal(result.dx, -3, "left edge pulled back onto the neighbour's right edge");
  assert.equal(result.dy, 0);
  assert.deepEqual(result.guides, [
    { orientation: "vertical", position: 100 },
    { orientation: "horizontal", position: 0 },
  ]);
});

test("leaves a shape alone when nothing is within the threshold", () => {
  const candidates = buildSnapCandidates([box(0, 0, 100, 100)]);
  const result = resolveSnap({ x: 400, y: 400, width: 10, height: 10 }, candidates, 8);

  assert.deepEqual(result, { dx: 0, dy: 0, guides: [] });
});

test("resolves the two axes independently", () => {
  const candidates = buildSnapCandidates([box(0, 0, 100, 100)]);
  const result = resolveSnap({ x: 98, y: 400, width: 10, height: 10 }, candidates, 8);

  assert.equal(result.dx, 2);
  assert.equal(result.dy, 0, "vertical is untouched");
  assert.deepEqual(result.guides, [{ orientation: "vertical", position: 100 }]);
});

test("prefers the closest candidate when several are in range", () => {
  const candidates = { vertical: [10, 12], horizontal: [] };
  const result = resolveSnap({ x: 13, y: 0, width: 0, height: 0 }, candidates, 8);

  assert.equal(result.dx, -1, "snaps to 12, not 10");
});

test("adds grid lines around the dragged region when a grid is on", () => {
  const candidates = withGridCandidates(
    { vertical: [], horizontal: [] },
    { x: 23, y: 23, width: 0, height: 0 },
    20,
  );

  assert.deepEqual(candidates.vertical, [20]);
  assert.deepEqual(candidates.horizontal, [20]);
});

test("leaves candidates untouched when the grid is off", () => {
  const candidates = { vertical: [1], horizontal: [2] };

  assert.equal(withGridCandidates(candidates, { x: 0, y: 0, width: 0, height: 0 }, 0), candidates);
});
