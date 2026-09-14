import assert from "node:assert/strict";
import test from "node:test";
import { TOOLS } from "../../constants/tools.js";
import { getInspectorModel, SECTION } from "./inspectorModel.js";

const shape = (type) => ({ type });

test("a rectangle offers box styling with corners", () => {
  const model = getInspectorModel({ tool: TOOLS.SELECT, selectedShapes: [shape(TOOLS.RECT)] });

  assert.equal(model.mode, "selection");
  assert.equal(model.title, "Rectangle");
  assert.ok(model.sections.has(SECTION.FILL));
  assert.ok(model.sections.has(SECTION.EDGES));
  assert.equal(model.edgesLabel, "Corners");
});

test("an ellipse has no edge control", () => {
  const model = getInspectorModel({ tool: TOOLS.SELECT, selectedShapes: [shape(TOOLS.CIRCLE)] });

  assert.equal(model.sections.has(SECTION.EDGES), false);
});

test("connectors call their edges ends and offer a path shape", () => {
  const model = getInspectorModel({ tool: TOOLS.SELECT, selectedShapes: [shape(TOOLS.ARROW)] });

  assert.equal(model.edgesLabel, "Ends");
  assert.ok(model.sections.has(SECTION.LINE_SHAPE));
});

test("a mixed selection shows only the sections every shape shares", () => {
  const model = getInspectorModel({
    tool: TOOLS.SELECT,
    selectedShapes: [shape(TOOLS.RECT), shape(TOOLS.TEXT)],
  });

  assert.deepEqual([...model.sections], [SECTION.STROKE, SECTION.OPACITY]);
  assert.equal(model.title, "2 selected");
  assert.equal(model.strokeLabel, "Stroke");
});

test("text calls its stroke colour just colour", () => {
  const model = getInspectorModel({ tool: TOOLS.SELECT, selectedShapes: [shape(TOOLS.TEXT)] });

  assert.equal(model.strokeLabel, "Color");
  assert.ok(model.sections.has(SECTION.FONT_SIZE));
});

test("an image is still a selection, with nothing to style", () => {
  const model = getInspectorModel({ tool: TOOLS.SELECT, selectedShapes: [shape(TOOLS.IMAGE)] });

  assert.equal(model.mode, "selection");
  assert.equal(model.sections.size, 0);
});

test("a drawing tool with nothing selected describes new shapes", () => {
  const model = getInspectorModel({ tool: TOOLS.PEN, selectedShapes: [] });

  assert.equal(model.mode, "tool");
  assert.equal(model.title, "Pen");
  assert.equal(model.subtitle, "Style for new shapes");
});

test("note defaults leave out text size, which new notes ignore", () => {
  const defaults = getInspectorModel({ tool: TOOLS.NOTE, selectedShapes: [] });
  const existing = getInspectorModel({ tool: TOOLS.SELECT, selectedShapes: [shape(TOOLS.NOTE)] });

  assert.equal(defaults.sections.has(SECTION.FONT_SIZE), false);
  assert.equal(existing.sections.has(SECTION.FONT_SIZE), true);
});

test("select, pan and the eraser with nothing selected show no inspector", () => {
  for (const tool of [TOOLS.SELECT, TOOLS.PAN, TOOLS.ERASER, TOOLS.LASER, TOOLS.IMAGE]) {
    assert.equal(getInspectorModel({ tool, selectedShapes: [] }), null, tool);
  }
});

test("alignment needs two shapes and distribution three", () => {
  const two = getInspectorModel({ tool: TOOLS.SELECT, selectedShapes: [shape(TOOLS.RECT), shape(TOOLS.RECT)] });
  const three = getInspectorModel({
    tool: TOOLS.SELECT,
    selectedShapes: [shape(TOOLS.RECT), shape(TOOLS.RECT), shape(TOOLS.RECT)],
  });

  assert.equal(two.canAlign, true);
  assert.equal(two.canDistribute, false);
  assert.equal(three.canDistribute, true);
});
