import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STYLE } from "../constants/canvas.js";
import { insertBreakpoint } from "./shapeUtils.js";
import { getBaseShapeStyle, getShapeStyle } from "./styleUtils.js";

const ink = { id: "s1", type: "rect", style: { stroke: DEFAULT_STYLE.stroke } };
const blue = { id: "s2", type: "rect", style: { stroke: "#2563eb" } };

test("draws ink as stored on the light canvas", () => {
  assert.equal(getShapeStyle(ink).stroke, DEFAULT_STYLE.stroke);
  assert.equal(getShapeStyle(ink, { isDark: false }).stroke, DEFAULT_STYLE.stroke);
});

test("draws ink white on the dark canvas and keeps chosen colours", () => {
  assert.equal(getShapeStyle(ink, { isDark: true }).stroke, "#ffffff");
  assert.equal(getShapeStyle(blue, { isDark: true }).stroke, "#2563eb");
});

test("the stored style never follows the theme", () => {
  assert.equal(getBaseShapeStyle(ink).stroke, DEFAULT_STYLE.stroke);
  assert.deepEqual(getShapeStyle(ink, { isDark: true }), {
    ...getBaseShapeStyle(ink),
    stroke: "#ffffff",
  });
});

test("fills in defaults for a shape with no style", () => {
  assert.deepEqual(getShapeStyle({ id: "s3", type: "rect" }), DEFAULT_STYLE);
});

test("bending a line keeps its stored stroke", () => {
  const arrow = {
    id: "a1",
    type: "arrow",
    x: 0,
    y: 0,
    points: [0, 0, 100, 0],
    style: { stroke: DEFAULT_STYLE.stroke, bendStyle: "straight" },
  };

  const bent = insertBreakpoint(arrow, { x: 50, y: 10 });

  assert.deepEqual(bent.points, [0, 0, 50, 10, 100, 0]);
  assert.equal(bent.style.stroke, DEFAULT_STYLE.stroke);
  assert.equal(bent.style.bendStyle, "corner");
});
