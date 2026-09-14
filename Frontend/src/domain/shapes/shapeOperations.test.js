import assert from "node:assert/strict";
import test from "node:test";
import { TOOLS } from "../../constants/tools.js";
import { applyStylePatch } from "./shapeOperations.js";

const textShape = {
  id: "t1",
  type: TOOLS.TEXT,
  x: 0,
  y: 0,
  width: 200,
  height: 40,
  version: 3,
  style: { fontSize: 20 },
};

test("scales a text box with its font size so the text is not clipped", () => {
  const next = applyStylePatch(textShape, { fontSize: 40 });

  assert.equal(next.style.fontSize, 40);
  assert.equal(next.width, 400);
  assert.equal(next.height, 80);
  assert.equal(next.version, 4);
});

test("keeps a note's size when its font changes", () => {
  const note = { ...textShape, type: TOOLS.NOTE };
  const next = applyStylePatch(note, { fontSize: 40 });

  assert.equal(next.width, 200);
  assert.equal(next.height, 40);
});

test("leaves geometry alone for patches that do not touch the font size", () => {
  const next = applyStylePatch(textShape, { stroke: "#2563eb", opacity: 0.5 });

  assert.equal(next.width, 200);
  assert.deepEqual(next.style, { fontSize: 20, stroke: "#2563eb", opacity: 0.5 });
});

test("merges several style keys as one change", () => {
  const rect = { id: "r1", type: TOOLS.RECT, width: 10, height: 10, style: {} };
  const next = applyStylePatch(rect, { fill: "#fef08a", fillEnabled: true });

  assert.deepEqual(next.style, { fill: "#fef08a", fillEnabled: true });
});
