import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STYLE, NOTE_DEFAULTS } from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";
import { getTextEditorStyle } from "./textMetrics.js";

const transform = { x: 0, y: 0, scale: 1 };

const text = {
  id: "t1",
  type: TOOLS.TEXT,
  x: 0,
  y: 0,
  width: 200,
  height: 40,
  text: "Hello",
  style: { ...DEFAULT_STYLE },
};

test("types ink text in the colour the canvas draws it", () => {
  assert.equal(getTextEditorStyle({ shape: text, transform }).color, DEFAULT_STYLE.stroke);
  assert.equal(getTextEditorStyle({ shape: text, transform, isDark: true }).color, "#ffffff");
});

test("keeps note text readable on the note in either theme", () => {
  const note = {
    ...text,
    type: TOOLS.NOTE,
    style: { ...DEFAULT_STYLE, fill: NOTE_DEFAULTS.fill },
  };

  for (const isDark of [false, true]) {
    assert.equal(getTextEditorStyle({ shape: note, transform, isDark }).color, "#111827");
  }
});
