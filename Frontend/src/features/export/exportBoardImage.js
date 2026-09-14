// @ts-check

import { getShapesBoundingBox } from "../../domain/geometry/bounds.js";

/** World units of breathing room around the content. */
export const EXPORT_PADDING = 32;

/** Output density relative to world units — 2 keeps text and strokes crisp. */
export const EXPORT_PIXEL_RATIO = 2;

/**
 * Browsers cap canvas dimensions (lower on some mobile devices); staying under
 * a common floor avoids a silently blank export on a very large board.
 */
export const MAX_EXPORT_DIMENSION = 8192;

/** Konva nodes carrying this name are interaction chrome, never exported. */
export const OVERLAY_NAME = "fb-overlay";

/**
 * The stage-space rectangle framing the content, and the pixel ratio that
 * renders it at `pixelRatio` × world resolution whatever the current zoom.
 *
 * `toCanvas` measures its rectangle in stage (screen) pixels and multiplies by
 * its pixel ratio, so dividing the requested density by the zoom cancels the
 * zoom out. The ratio is then capped so neither side exceeds the canvas limit.
 *
 * @param {{x: number, y: number, width: number, height: number}} bounds - world space
 * @param {{x: number, y: number, scale: number}} transform - stage transform
 * @param {{ padding?: number, pixelRatio?: number, maxDimension?: number }} [options]
 */
export function getExportFrame(
  bounds,
  transform,
  {
    padding = EXPORT_PADDING,
    pixelRatio = EXPORT_PIXEL_RATIO,
    maxDimension = MAX_EXPORT_DIMENSION,
  } = {},
) {
  const scale = transform.scale || 1;

  const rect = {
    x: transform.x + (bounds.x - padding) * scale,
    y: transform.y + (bounds.y - padding) * scale,
    width: (bounds.width + padding * 2) * scale,
    height: (bounds.height + padding * 2) * scale,
  };

  const requested = pixelRatio / scale;
  const limit = Math.min(maxDimension / rect.width, maxDimension / rect.height);

  return { rect, pixelRatio: Math.min(requested, limit) };
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
export function getExportFileName(date = new Date()) {
  const pad = (/** @type {number} */ value) => String(value).padStart(2, "0");

  return `flowboard-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.png`;
}

/**
 * Render the board's content to a PNG blob.
 *
 * Interaction chrome (grid, guides, marquee, cursors, line handles, the
 * transformer) is hidden for the capture and restored afterwards, and the
 * transparent stage is composited onto the canvas colour so the image looks
 * like the board.
 *
 * @param {Object} input
 * @param {any} input.stage - Konva Stage
 * @param {Object[]} input.shapes
 * @param {string} input.background
 * @returns {Promise<Blob | null>} null when there is nothing to export
 */
export async function exportBoardImage({ stage, shapes, background }) {
  const bounds = getShapesBoundingBox(shapes);
  if (!stage || !bounds) return null;

  const transform = { x: stage.x(), y: stage.y(), scale: stage.scaleX() };
  const { rect, pixelRatio } = getExportFrame(bounds, transform);

  const hidden = [...stage.find(`.${OVERLAY_NAME}`), ...stage.find("Transformer")].filter(
    (node) => node.visible(),
  );
  hidden.forEach((node) => node.visible(false));

  try {
    const content = stage.toCanvas({ ...rect, pixelRatio });

    const output = document.createElement("canvas");
    output.width = content.width;
    output.height = content.height;

    const context = output.getContext("2d");
    if (!context) return null;

    context.fillStyle = background;
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(content, 0, 0);

    return await new Promise((resolve) => output.toBlob(resolve, "image/png"));
  } finally {
    hidden.forEach((node) => node.visible(true));
    stage.batchDraw();
  }
}

/**
 * @param {Blob} blob
 * @param {string} fileName
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
