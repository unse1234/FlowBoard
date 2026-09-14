import assert from "node:assert/strict";
import test from "node:test";
import { getVisibleWorldBounds } from "./viewport.js";

test("maps an untransformed viewport straight onto world space", () => {
  const bounds = getVisibleWorldBounds(
    { x: 0, y: 0, scale: 1 },
    { width: 800, height: 600 },
  );

  assert.deepEqual(bounds, { x: 0, y: 0, width: 800, height: 600 });
});

test("panning moves the visible region the opposite way", () => {
  const bounds = getVisibleWorldBounds(
    { x: -100, y: -50, scale: 1 },
    { width: 800, height: 600 },
  );

  assert.deepEqual(bounds, { x: 100, y: 50, width: 800, height: 600 });
});

test("zooming in shows less of the board", () => {
  const bounds = getVisibleWorldBounds(
    { x: 0, y: 0, scale: 2 },
    { width: 800, height: 600 },
  );

  assert.deepEqual(bounds, { x: 0, y: 0, width: 400, height: 300 });
});

test("survives a zero scale rather than dividing by it", () => {
  const bounds = getVisibleWorldBounds(
    { x: 0, y: 0, scale: 0 },
    { width: 800, height: 600 },
  );

  assert.equal(Number.isFinite(bounds.width), true);
});
