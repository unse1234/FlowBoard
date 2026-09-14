// @ts-check

import { SHAPE_LABELS, TOOL_LABELS } from "../../constants/toolMeta.js";
import { TOOLS } from "../../constants/tools.js";

/**
 * Inspector sections, and which apply to what.
 *
 * Only sections that visibly change a shape's rendering are offered for it —
 * a control that does nothing is worse than no control. With a mixed
 * selection the inspector shows the sections every selected type shares.
 */
export const SECTION = Object.freeze({
  STROKE: "stroke",
  FILL: "fill",
  NOTE_COLOR: "noteColor",
  STROKE_WIDTH: "strokeWidth",
  STROKE_STYLE: "strokeStyle",
  LINE_SHAPE: "lineShape",
  EDGES: "edges",
  SLOPPINESS: "sloppiness",
  FONT_SIZE: "fontSize",
  FONT_FAMILY: "fontFamily",
  OPACITY: "opacity",
});

const {
  STROKE,
  FILL,
  NOTE_COLOR,
  STROKE_WIDTH,
  STROKE_STYLE,
  LINE_SHAPE,
  EDGES,
  SLOPPINESS,
  FONT_SIZE,
  FONT_FAMILY,
  OPACITY,
} = SECTION;

const BOX = [STROKE, FILL, STROKE_WIDTH, STROKE_STYLE, EDGES, SLOPPINESS, OPACITY];
const CONNECTOR = [STROKE, STROKE_WIDTH, STROKE_STYLE, LINE_SHAPE, EDGES, SLOPPINESS, OPACITY];

/** @type {Readonly<Record<string, string[]>>} */
export const TYPE_SECTIONS = Object.freeze({
  [TOOLS.RECT]: BOX,
  [TOOLS.DIAMOND]: BOX,
  // An ellipse has no corners and no line ends, so edge style changes nothing.
  [TOOLS.CIRCLE]: [STROKE, FILL, STROKE_WIDTH, STROKE_STYLE, SLOPPINESS, OPACITY],
  [TOOLS.LINE]: CONNECTOR,
  [TOOLS.ARROW]: CONNECTOR,
  [TOOLS.PEN]: [STROKE, STROKE_WIDTH, STROKE_STYLE, EDGES, SLOPPINESS, OPACITY],
  // Text draws in its stroke colour and renders the same in either style.
  [TOOLS.TEXT]: [STROKE, FONT_SIZE, FONT_FAMILY, OPACITY],
  // A note's ink is derived from its fill, so its one colour control is the fill.
  [TOOLS.NOTE]: [NOTE_COLOR, FONT_SIZE, FONT_FAMILY, OPACITY],
  // Images draw the bitmap as-is; only arrangement applies.
  [TOOLS.IMAGE]: [],
});

const OPEN_ENDED = new Set([TOOLS.LINE, TOOLS.ARROW, TOOLS.PEN]);

/**
 * @param {string[][]} lists
 * @returns {string[]}
 */
function intersect(lists) {
  if (lists.length === 0) return [];
  return lists[0].filter((section) => lists.every((list) => list.includes(section)));
}

/**
 * @typedef {Object} InspectorModel
 * @property {"selection" | "tool"} mode
 * @property {string} title
 * @property {string} [subtitle]
 * @property {number} count - selected shapes (0 in tool mode)
 * @property {Set<string>} sections
 * @property {string} strokeLabel - "Color" for text, "Stroke" otherwise
 * @property {string} edgesLabel - "Ends" for open paths, "Corners" otherwise
 * @property {boolean} canAlign
 * @property {boolean} canDistribute
 */

/**
 * @param {string[]} types
 * @param {{ mode: "selection" | "tool", title: string, subtitle?: string, count: number }} base
 * @returns {InspectorModel}
 */
function describe(types, base) {
  return {
    ...base,
    sections: new Set(intersect(types.map((type) => TYPE_SECTIONS[type] ?? []))),
    strokeLabel: types.every((type) => type === TOOLS.TEXT) ? "Color" : "Stroke",
    edgesLabel: types.every((type) => OPEN_ENDED.has(type)) ? "Ends" : "Corners",
    canAlign: base.count > 1,
    canDistribute: base.count > 2,
  };
}

/**
 * What the inspector shows, or null when there is nothing to style.
 *
 * A selection always wins; without one, a drawing tool shows the style its new
 * shapes will get.
 *
 * @param {{ tool: string, selectedShapes: Array<{ type: string }> }} input
 * @returns {InspectorModel | null}
 */
export function getInspectorModel({ tool, selectedShapes }) {
  if (selectedShapes.length > 0) {
    const types = [...new Set(selectedShapes.map((shape) => shape.type))];

    return describe(types, {
      mode: "selection",
      count: selectedShapes.length,
      title:
        selectedShapes.length === 1
          ? (SHAPE_LABELS[types[0]] ?? "Selection")
          : `${selectedShapes.length} selected`,
    });
  }

  if (!TYPE_SECTIONS[tool]?.length) return null;

  const model = describe([tool], {
    mode: "tool",
    count: 0,
    title: TOOL_LABELS[tool],
    subtitle: "Style for new shapes",
  });

  // New notes always start at the note size, so a default text size would do
  // nothing; it is offered once a note exists.
  if (tool === TOOLS.NOTE) model.sections.delete(FONT_SIZE);

  return model;
}
