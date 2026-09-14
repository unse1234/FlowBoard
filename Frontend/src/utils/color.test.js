import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STYLE, STROKE_SWATCHES } from "../constants/canvas.js";
import { getContrastRatio, needsLightInkOnDarkCanvas, parseHexColor } from "./color.js";

test("parses short and long hex colours", () => {
  assert.deepEqual(parseHexColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHexColor("#2563EB"), { r: 37, g: 99, b: 235 });
  assert.deepEqual(parseHexColor("16a34a"), { r: 22, g: 163, b: 74 });
  assert.equal(parseHexColor("blue"), null);
  assert.equal(parseHexColor(undefined), null);
});

test("measures WCAG contrast", () => {
  assert.ok(Math.abs(getContrastRatio("#000000", "#ffffff") - 21) < 1e-9);
  assert.equal(getContrastRatio("#2563eb", "#2563eb"), 1);
  assert.equal(getContrastRatio("#2563eb", "not a colour"), null);
});

test("keeps every coloured palette swatch as chosen on the dark canvas", () => {
  const coloured = STROKE_SWATCHES.filter((swatch) => swatch !== DEFAULT_STYLE.stroke);
  assert.ok(coloured.length > 0);

  for (const swatch of coloured) {
    assert.equal(needsLightInkOnDarkCanvas(swatch), false, swatch);
  }
});

test("draws near-black inks light on the dark canvas", () => {
  for (const ink of [DEFAULT_STYLE.stroke, "#000000", "#222222", "#333333"]) {
    assert.equal(needsLightInkOnDarkCanvas(ink), true, ink);
  }
});

test("leaves colours it cannot read alone", () => {
  for (const value of ["", "transparent", null, undefined]) {
    assert.equal(needsLightInkOnDarkCanvas(value), false);
  }
});
