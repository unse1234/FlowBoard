import assert from "node:assert/strict";
import test from "node:test";
import { cloneShapes } from "./shapeCloning.js";

function counters() {
  let shape = 0;
  let group = 0;

  return {
    createShapeId: () => `s${(shape += 1)}`,
    createGroupId: () => `g${(group += 1)}`,
  };
}

test("gives every clone a fresh id and offsets it", () => {
  const clones = cloneShapes(
    [
      { id: "a", type: "rect", x: 10, y: 20 },
      { id: "b", type: "rect", x: 30, y: 40 },
    ],
    { ...counters(), offsetX: 5, offsetY: 7, timestamp: 100 },
  );

  assert.deepEqual(clones.map((s) => s.id), ["s1", "s2"]);
  assert.deepEqual(clones.map((s) => [s.x, s.y]), [[15, 27], [35, 47]]);
  assert.deepEqual(clones.map((s) => s.version), [1, 1]);
  assert.equal(clones[0].createdAt, 100);
});

test("remaps a duplicated group to one new group, distinct from the original", () => {
  const clones = cloneShapes(
    [
      { id: "a", groupId: "original", x: 0, y: 0 },
      { id: "b", groupId: "original", x: 0, y: 0 },
      { id: "c", x: 0, y: 0 },
    ],
    counters(),
  );

  assert.equal(clones[0].groupId, clones[1].groupId, "copies stay one group");
  assert.notEqual(clones[0].groupId, "original", "but not the original group");
  assert.equal("groupId" in clones[2], false, "ungrouped shapes stay ungrouped");
});

test("keeps two source groups separate in the copy", () => {
  const clones = cloneShapes(
    [
      { id: "a", groupId: "g-one", x: 0, y: 0 },
      { id: "b", groupId: "g-two", x: 0, y: 0 },
    ],
    counters(),
  );

  assert.notEqual(clones[0].groupId, clones[1].groupId);
});

test("detaches style and points so editing a copy cannot touch the original", () => {
  const original = {
    id: "a",
    x: 0,
    y: 0,
    style: { stroke: "#000" },
    points: [0, 0, 10, 10],
  };

  const [clone] = cloneShapes([original], counters());

  assert.notEqual(clone.style, original.style);
  assert.notEqual(clone.points, original.points);
  assert.deepEqual(clone.points, original.points);
});

test("shares the image payload rather than duplicating a data URL", () => {
  const original = { id: "a", x: 0, y: 0, image: { src: "data:image/png;base64,AAAA" } };

  const [clone] = cloneShapes([original], counters());

  assert.equal(clone.image, original.image, "megabytes are not copied");
});

test("clones nothing without failing", () => {
  assert.deepEqual(cloneShapes([], counters()), []);
});
