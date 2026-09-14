import { TOOLS } from "../../constants/tools.js";

export const DRAWABLE_TOOLS = new Set([
  TOOLS.RECT,
  TOOLS.CIRCLE,
  TOOLS.DIAMOND,
  TOOLS.LINE,
  TOOLS.ARROW,
  TOOLS.PEN,
  TOOLS.CIRCLE
]);

export const BOX_SHAPES = new Set([
  TOOLS.RECT,
  TOOLS.CIRCLE,
  TOOLS.DIAMOND,
  TOOLS.IMAGE,
  TOOLS.NOTE,
]);

/** Shapes whose body is edited through the text overlay. */
export const TEXT_EDITABLE_SHAPES = new Set([TOOLS.TEXT, TOOLS.NOTE]);

export const LINE_SHAPES = new Set([TOOLS.LINE, TOOLS.ARROW, TOOLS.PEN]);

export const BENDABLE_SHAPES = new Set([TOOLS.LINE, TOOLS.ARROW]);

export const TERMINAL_TOOLS = new Set([
  TOOLS.SELECT,
  TOOLS.PAN,
  TOOLS.LASER,
  TOOLS.ERASER,
  TOOLS.TEXT,
  TOOLS.IMAGE,
 
]);
