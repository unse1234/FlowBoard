import assert from "node:assert/strict";
import test from "node:test";
import { getExportFileName, getExportFrame } from "./exportBoardImage.js";

const bounds = { x: 100, y: 50, width: 200, height: 100 };

test("frames the content with padding, in stage space at the current zoom", () => {
  const { rect } = getExportFrame(bounds, { x: 10, y: 20, scale: 2 }, { padding: 10 });

  assert.deepEqual(rect, { x: 190, y: 100, width: 440, height: 240 });
});

test("renders at the requested density whatever the zoom", () => {
  const zoomedOut = getExportFrame(bounds, { x: 0, y: 0, scale: 0.5 }, { pixelRatio: 2 });
  const zoomedIn = getExportFrame(bounds, { x: 0, y: 0, scale: 4 }, { pixelRatio: 2 });

  // Output pixels per world unit = rect scale × pixel ratio = requested density.
  assert.equal(0.5 * zoomedOut.pixelRatio, 2);
  assert.equal(4 * zoomedIn.pixelRatio, 2);
});

test("caps the pixel ratio so the image stays under the canvas limit", () => {
  const huge = { x: 0, y: 0, width: 50000, height: 1000 };
  const { rect, pixelRatio } = getExportFrame(huge, { x: 0, y: 0, scale: 1 }, {
    padding: 0,
    pixelRatio: 2,
    maxDimension: 8192,
  });

  assert.ok(rect.width * pixelRatio <= 8192 + 1e-9);
});

test("names files by date and time", () => {
  assert.equal(getExportFileName(new Date(2026, 8, 4, 9, 5)), "flowboard-2026-09-04-0905.png");
});
