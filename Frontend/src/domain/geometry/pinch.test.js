import assert from "node:assert/strict";
import test from "node:test";
import { computePinchTransform } from "./pinch.js";

const limits = { minScale: 0.1, maxScale: 30 };
const identity = { x: 0, y: 0, scale: 1 };

test("moving both fingers together pans without zooming", () => {
  const next = computePinchTransform({
    ...limits,
    startTransform: identity,
    startPoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
    points: [{ x: 150, y: 130 }, { x: 250, y: 130 }],
  });

  assert.deepEqual(next, { scale: 1, x: 50, y: 30 });
});

test("spreading the fingers zooms around their midpoint", () => {
  const start = { x: 40, y: -20, scale: 2 };
  const next = computePinchTransform({
    ...limits,
    startTransform: start,
    startPoints: [{ x: 300, y: 300 }, { x: 400, y: 300 }],
    points: [{ x: 250, y: 300 }, { x: 450, y: 300 }],
  });

  assert.equal(next.scale, 4);

  // The world point under the midpoint (350, 300) is unchanged.
  const worldBefore = { x: (350 - start.x) / start.scale, y: (300 - start.y) / start.scale };
  const worldAfter = { x: (350 - next.x) / next.scale, y: (300 - next.y) / next.scale };
  assert.deepEqual(worldAfter, worldBefore);
});

test("clamps to the zoom limits", () => {
  const next = computePinchTransform({
    ...limits,
    startTransform: identity,
    startPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
  });

  assert.equal(next.scale, 30);
});

test("coincident starting touches pan instead of dividing by zero", () => {
  const next = computePinchTransform({
    ...limits,
    startTransform: identity,
    startPoints: [{ x: 50, y: 50 }, { x: 50, y: 50 }],
    points: [{ x: 60, y: 50 }, { x: 80, y: 50 }],
  });

  assert.equal(next.scale, 1);
  assert.ok(Number.isFinite(next.x) && Number.isFinite(next.y));
});
