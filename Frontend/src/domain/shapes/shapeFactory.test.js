import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STYLE, NOTE_DEFAULTS } from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";
import { BOX_SHAPES, TEXT_EDITABLE_SHAPES } from "./shapeTypes.js";
import { createNoteShape, createShape, createTextShape } from "./shapeFactory.js";

const point = { x: 10, y: 20 };

test("a note is a fixed-size box that carries its own text", () => {
  const note = createNoteShape({ id: "n1", point, style: DEFAULT_STYLE });

  assert.equal(note.type, TOOLS.NOTE);
  assert.equal(note.x, 10);
  assert.equal(note.y, 20);
  assert.equal(note.width, NOTE_DEFAULTS.width);
  assert.equal(note.height, NOTE_DEFAULTS.height);
  assert.equal(note.text, "");
  assert.equal(note.version, 1);
});

test("a note forces its fill on so the card is always visible", () => {
  const note = createNoteShape({ id: "n1", point, style: DEFAULT_STYLE });

  assert.equal(note.style.fillEnabled, true);
  assert.equal(note.style.fill, NOTE_DEFAULTS.fill);
  assert.equal(note.style.fontSize, NOTE_DEFAULTS.fontSize);
});

test("a note keeps a fill the user actually chose", () => {
  const note = createNoteShape({
    id: "n1",
    point,
    style: { ...DEFAULT_STYLE, fill: "#bfdbfe" },
  });

  assert.equal(note.style.fill, "#bfdbfe");
});

test("notes take part in the box and text-editing shape families", () => {
  assert.equal(BOX_SHAPES.has(TOOLS.NOTE), true, "so bounds and the transformer work");
  assert.equal(TEXT_EDITABLE_SHAPES.has(TOOLS.NOTE), true);
  assert.equal(TEXT_EDITABLE_SHAPES.has(TOOLS.TEXT), true);
  assert.equal(TEXT_EDITABLE_SHAPES.has(TOOLS.RECT), false);
});

test("existing shape factories are unchanged", () => {
  const rect = createShape({ id: "r1", type: TOOLS.RECT, point, style: DEFAULT_STYLE });
  assert.deepEqual([rect.width, rect.height], [0, 0]);

  const line = createShape({ id: "l1", type: TOOLS.LINE, point, style: DEFAULT_STYLE });
  assert.deepEqual(line.points, [0, 0]);

  const text = createTextShape({ id: "t1", point, style: DEFAULT_STYLE });
  assert.equal(text.type, TOOLS.TEXT);
  assert.equal(text.width, 240);
});
