import assert from "node:assert/strict";
import test from "node:test";
import {
  boundsContain,
  boundsFromPoints,
  boundsIntersect,
  getBoundsCenter,
  getShapeBounds,
  getShapesBoundingBox,
} from "./bounds.js";

test("measures box shapes and normalises negative extents", () => {
  assert.deepEqual(getShapeBounds({ type: "rect", x: 10, y: 20, width: 30, height: 40 }), {
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  });

  // Mid-draw a box can have negative width/height; bounds must still be positive.
  assert.deepEqual(getShapeBounds({ type: "rect", x: 40, y: 60, width: -30, height: -40 }), {
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  });
});

test("measures every non-line shape family through the box path", () => {
  for (const type of ["circle", "diamond", "image", "text", "note"]) {
    assert.deepEqual(
      getShapeBounds({ type, x: 5, y: 5, width: 10, height: 10 }),
      { x: 5, y: 5, width: 10, height: 10 },
      `${type} bounds`,
    );
  }
});

test("measures line shapes from points offset by the shape origin", () => {
  const line = { type: "line", x: 100, y: 200, points: [0, 0, 50, -30] };

  assert.deepEqual(getShapeBounds(line), {
    x: 100,
    y: 170,
    width: 50,
    height: 30,
  });
});

test("measures multi-point pen strokes", () => {
  const pen = { type: "pen", x: 0, y: 0, points: [10, 10, 30, 5, 20, 40] };

  assert.deepEqual(getShapeBounds(pen), { x: 10, y: 5, width: 20, height: 35 });
});

test("handles degenerate line point arrays without throwing", () => {
  assert.deepEqual(getShapeBounds({ type: "pen", x: 7, y: 9, points: [] }), {
    x: 7,
    y: 9,
    width: 0,
    height: 0,
  });

  // A trailing unpaired value must not be read as an x coordinate.
  assert.deepEqual(getShapeBounds({ type: "line", x: 0, y: 0, points: [0, 0, 10, 10, 99] }), {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
});

test("returns null for unmeasurable shapes", () => {
  assert.equal(getShapeBounds(null), null);
  assert.equal(getShapeBounds({ type: "rect", x: NaN, y: 0, width: 1, height: 1 }), null);
});

test("unions bounds across mixed shape types", () => {
  const shapes = [
    { type: "rect", x: 0, y: 0, width: 10, height: 10 },
    { type: "line", x: 100, y: 100, points: [0, 0, 20, 20] },
  ];

  assert.deepEqual(getShapesBoundingBox(shapes), {
    x: 0,
    y: 0,
    width: 120,
    height: 120,
  });
});

test("returns null bounding box for an empty or unmeasurable board", () => {
  assert.equal(getShapesBoundingBox([]), null);
  assert.equal(getShapesBoundingBox(null), null);
  assert.equal(getShapesBoundingBox([{ type: "rect", x: NaN, y: NaN }]), null);
});

test("computes centre, intersection and containment", () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };

  assert.deepEqual(getBoundsCenter(outer), { x: 50, y: 50 });
  assert.equal(boundsContain(outer, { x: 10, y: 10, width: 10, height: 10 }), true);
  assert.equal(boundsContain(outer, { x: 90, y: 90, width: 20, height: 20 }), false);
  assert.equal(boundsIntersect(outer, { x: 90, y: 90, width: 20, height: 20 }), true);
  assert.equal(boundsIntersect(outer, { x: 200, y: 200, width: 10, height: 10 }), false);
});

test("builds bounds from drag corners in any direction", () => {
  const forward = boundsFromPoints({ x: 10, y: 10 }, { x: 40, y: 50 });
  const backward = boundsFromPoints({ x: 40, y: 50 }, { x: 10, y: 10 });

  assert.deepEqual(forward, { x: 10, y: 10, width: 30, height: 40 });
  assert.deepEqual(backward, forward);
});
