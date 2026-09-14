// @ts-check

import { TOOLS } from "./tools.js";

/** Tool names as the UI speaks them. */
export const TOOL_LABELS = Object.freeze({
  [TOOLS.SELECT]: "Select",
  [TOOLS.PAN]: "Hand",
  [TOOLS.RECT]: "Rectangle",
  [TOOLS.CIRCLE]: "Ellipse",
  [TOOLS.DIAMOND]: "Diamond",
  [TOOLS.LINE]: "Line",
  [TOOLS.ARROW]: "Arrow",
  [TOOLS.PEN]: "Pen",
  [TOOLS.LASER]: "Laser pointer",
  [TOOLS.ERASER]: "Eraser",
  [TOOLS.TEXT]: "Text",
  [TOOLS.NOTE]: "Sticky note",
  [TOOLS.IMAGE]: "Image",
});

/** Names for shapes already on the board (a pen stroke is a drawing). */
export const SHAPE_LABELS = Object.freeze({
  ...TOOL_LABELS,
  [TOOLS.PEN]: "Drawing",
});

/**
 * Single-key tool shortcuts.
 *
 * The keyboard hook binds exactly these and every tooltip reads them from here,
 * so a hint can never promise a key that does nothing. Image has no key: it
 * opens a file picker, which browsers only allow from a click.
 */
export const TOOL_SHORTCUTS = Object.freeze({
  [TOOLS.SELECT]: "V",
  [TOOLS.PAN]: "H",
  [TOOLS.RECT]: "R",
  [TOOLS.CIRCLE]: "O",
  [TOOLS.DIAMOND]: "D",
  [TOOLS.LINE]: "L",
  [TOOLS.ARROW]: "A",
  [TOOLS.PEN]: "P",
  [TOOLS.LASER]: "K",
  [TOOLS.ERASER]: "E",
  [TOOLS.TEXT]: "T",
  [TOOLS.NOTE]: "N",
});

/** Tools whose new shapes take their look from the style inspector. */
export const STYLEABLE_TOOLS = new Set([
  TOOLS.RECT,
  TOOLS.CIRCLE,
  TOOLS.DIAMOND,
  TOOLS.LINE,
  TOOLS.ARROW,
  TOOLS.PEN,
  TOOLS.TEXT,
  TOOLS.NOTE,
]);
