import {
  Circle,
  Diamond,
  Eraser,
  Hand,
  ImagePlus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Slash,
  Square,
  StickyNote,
  Type,
  Zap,
} from "lucide-react";
import { TOOLS } from "../../constants/tools.js";

/**
 * Tool icons. Labels and shortcut keys live in constants/toolMeta.js, which the
 * keyboard hook also reads, so the dock can never advertise a key that is not
 * bound.
 */
export const TOOL_ICONS = Object.freeze({
  [TOOLS.SELECT]: MousePointer2,
  [TOOLS.PAN]: Hand,
  [TOOLS.RECT]: Square,
  [TOOLS.CIRCLE]: Circle,
  [TOOLS.DIAMOND]: Diamond,
  [TOOLS.LINE]: Slash,
  [TOOLS.ARROW]: MoveUpRight,
  [TOOLS.PEN]: Pencil,
  [TOOLS.LASER]: Zap,
  [TOOLS.ERASER]: Eraser,
  [TOOLS.TEXT]: Type,
  [TOOLS.NOTE]: StickyNote,
  [TOOLS.IMAGE]: ImagePlus,
});

/** Tools that open a file picker rather than activating directly. */
export const FILE_TOOLS = new Set([TOOLS.IMAGE]);

export const SHAPE_TOOLS = Object.freeze([
  TOOLS.RECT,
  TOOLS.CIRCLE,
  TOOLS.DIAMOND,
  TOOLS.LINE,
  TOOLS.ARROW,
]);

/**
 * Dock layouts, as groups of entries. An entry is a tool id, `"lock"`, or a
 * flyout: `{ flyout, label, tools, lock? }`.
 *
 * - full (desktop): every tool visible, grouped Navigate · Shapes · Connectors ·
 *   Draw · Content · Lock.
 * - compact (tablet): shapes collapse into a flyout that remembers the last one
 *   used; the laser, images and tool lock move into More.
 * - touch (phone): six 44px targets. Pan also moves into More, since two
 *   fingers pan the canvas anyway.
 */
export const DOCK_LAYOUTS = Object.freeze({
  full: [
    [TOOLS.SELECT, TOOLS.PAN],
    [TOOLS.RECT, TOOLS.CIRCLE, TOOLS.DIAMOND],
    [TOOLS.LINE, TOOLS.ARROW],
    [TOOLS.PEN, TOOLS.LASER, TOOLS.ERASER],
    [TOOLS.TEXT, TOOLS.NOTE, TOOLS.IMAGE],
    ["lock"],
  ],
  compact: [
    [TOOLS.SELECT, TOOLS.PAN],
    [{ flyout: "shapes", label: "Shapes", tools: SHAPE_TOOLS }, TOOLS.PEN, TOOLS.ERASER],
    [TOOLS.TEXT, TOOLS.NOTE],
    [{ flyout: "more", label: "More tools", tools: [TOOLS.LASER, TOOLS.IMAGE], lock: true }],
  ],
  touch: [
    [TOOLS.SELECT],
    [{ flyout: "shapes", label: "Shapes", tools: SHAPE_TOOLS }, TOOLS.PEN, TOOLS.ERASER, TOOLS.TEXT],
    [
      {
        flyout: "more",
        label: "More tools",
        tools: [TOOLS.PAN, TOOLS.NOTE, TOOLS.IMAGE, TOOLS.LASER],
        lock: true,
      },
    ],
  ],
});
