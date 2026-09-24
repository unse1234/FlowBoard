import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STYLE } from "../../constants/canvas.js";
import {
  ERASING_OPACITY,
  getFillColor,
  getShapeOpacity,
  getStrokeProps,
  isRoundEdged,
} from "./shapeVisuals.js";

/**
 * These exist because four rendering bugs survived unnoticed: the decisions
 * they cover lived inside .jsx that Node cannot run without a build step, so
 * nothing ever asserted them.
 */

const shape = (style = {}) => ({ id: "shape-1", type: "rect", style: { ...style } });

test("a shape is drawn at its own opacity", () => {
  assert.equal(getShapeOpacity(shape({ opacity: 0.4 })), 0.4);
  assert.equal(getShapeOpacity(shape()), DEFAULT_STYLE.opacity);
});

test("the eraser fades a shape rather than replacing its opacity", () => {
  const faint = shape({ opacity: 0.4 });

  // Replacing it with a constant would make an already-faint shape more
  // visible as it is about to be deleted.
  assert.equal(getShapeOpacity(faint, { isErasing: true }), 0.4 * ERASING_OPACITY);
  assert.equal(getShapeOpacity(shape({ opacity: 1 }), { isErasing: true }), ERASING_OPACITY);
});

test("stroke props carry no opacity", () => {
  // The bug this guards: opacity here lands on inner nodes, where Konva
  // multiplies it by the group's. On a sketchy shape drawn from two
  // overlapping strokes, the overlap then reads darker than the rest — two
  // strokes at 0.5 composite to 0.75.
  const props = getStrokeProps(shape({ opacity: 0.5 }));

  assert.equal("opacity" in props, false);
});

test("stroke props describe the outline", () => {
  const props = getStrokeProps(shape({ stroke: "#d93a3a", strokeWidth: 4 }));

  assert.equal(props.stroke, "#d93a3a");
  assert.equal(props.strokeWidth, 4);
  assert.deepEqual(props.dash, []);
});

test("a dashed or dotted stroke gets a dash pattern that scales with width", () => {
  assert.deepEqual(getStrokeProps(shape({ strokeStyle: "dashed", strokeWidth: 2 })).dash, [10, 6]);
  assert.deepEqual(getStrokeProps(shape({ strokeStyle: "dotted", strokeWidth: 2 })).dash, [1, 5]);
});

test("round edges round the caps and joins too", () => {
  const round = getStrokeProps(shape({ edgeStyle: "round" }));
  assert.equal(round.lineCap, "round");
  assert.equal(round.lineJoin, "round");

  const sharp = getStrokeProps(shape({ edgeStyle: "sharp" }));
  assert.equal(sharp.lineCap, "butt");
  assert.equal(sharp.lineJoin, "miter");
  assert.equal(isRoundEdged(shape({ edgeStyle: "sharp" })), false);
});

test("a near-black stroke is drawn light on the dark canvas", () => {
  const ink = shape({ stroke: "#111827" });

  assert.equal(getStrokeProps(ink, { isDark: false }).stroke, "#111827");
  assert.equal(getStrokeProps(ink, { isDark: true }).stroke, "#ffffff");
});

test("a chosen colour keeps its stroke on the dark canvas", () => {
  const red = shape({ stroke: "#d93a3a" });

  assert.equal(getStrokeProps(red, { isDark: true }).stroke, "#d93a3a");
});

test("no fill means no fill", () => {
  assert.equal(getFillColor(shape({ fillEnabled: false, fill: "#d93a3a" })), undefined);
  assert.equal(getFillColor(shape()), undefined);
});

test("an enabled fill is the colour that was chosen", () => {
  assert.equal(getFillColor(shape({ fillEnabled: true, fill: "#d93a3a" })), "#d93a3a");
});

test("fill does not depend on the rendering style", () => {
  // The bug this guards: the sketchy style washed its fill down to 18%, so the
  // same colour looked solid in one style and almost absent in the other — and
  // sketchy is the default, so that was what most people saw.
  const filled = { fillEnabled: true, fill: "#15803d" };

  assert.equal(
    getFillColor(shape({ ...filled, renderStyle: "rough" })),
    getFillColor(shape({ ...filled, renderStyle: "clean" })),
  );
});

test("fill is returned as chosen on the dark canvas", () => {
  // Only near-black strokes flip; a fill is the colour someone picked from a
  // swatch and has to match it.
  assert.equal(
    getFillColor(shape({ fillEnabled: true, fill: "#fef08a" }), { isDark: true }),
    "#fef08a",
  );
});

test("a shape with no style at all still draws", () => {
  const bare = { id: "shape-2", type: "rect" };

  assert.equal(getShapeOpacity(bare), DEFAULT_STYLE.opacity);
  assert.equal(getStrokeProps(bare).stroke, DEFAULT_STYLE.stroke);
  assert.equal(getFillColor(bare), undefined);
});
