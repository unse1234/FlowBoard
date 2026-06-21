import { TOOLS } from "../../constants/tools";

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
]);

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
