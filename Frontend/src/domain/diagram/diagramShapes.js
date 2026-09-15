import {
  COLOR_NAMES,
  DEFAULT_STYLE,
  NOTE_SWATCHES,
  STROKE_SWATCHES,
} from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";
import { boundsIntersect, getShapeBounds, getShapesBoundingBox } from "../geometry/bounds.js";
import { createNoteShape, createShape, createTextShape } from "../shapes/shapeFactory.js";
import { LABEL_TEXT, layoutDiagram } from "./diagramLayout.js";

/**
 * Turning a generated diagram into ordinary FlowBoard shapes.
 *
 * Nothing here is AI-specific. Every shape comes from the factories the drawing
 * tools use, with FlowBoard's own ids, default style and palette, so an
 * inserted diagram is indistinguishable from one drawn by hand: it selects,
 * edits, syncs, saves, undoes and exports like anything else.
 *
 * Boxes have no text of their own, so a labelled node is a box and a text shape
 * centred on it, sharing a groupId — they move as one, and double-clicking the
 * text edits it. An edge is an arrow whose points the layout routed, grouped
 * with its label when it has one. Notes carry their own text.
 *
 * Node types, colours and directions mirror Backend/src/ai/diagramSchema.js;
 * diagramContract.test.js fails if the two drift.
 */

export const DIAGRAM_NODE_TYPES = Object.freeze(["rect", "circle", "diamond", "note"]);
export const DIAGRAM_COLORS = Object.freeze(["ink", "blue", "purple", "green", "amber", "red"]);
export const DIAGRAM_DIRECTIONS = Object.freeze(["down", "right"]);

// Above the server's limits. These only bound a response that somehow skipped
// its validation.
const MAX_NODES = 60;
const MAX_EDGES = 120;

const NODE_TOOLS = Object.freeze({
  rect: TOOLS.RECT,
  circle: TOOLS.CIRCLE,
  diamond: TOOLS.DIAMOND,
  note: TOOLS.NOTE,
});

/** Colour names onto the stroke swatches the style panel offers: ink, blue, red… */
const STROKE_COLORS = Object.freeze(
  Object.fromEntries(STROKE_SWATCHES.map((hex) => [COLOR_NAMES[hex].toLowerCase(), hex])),
);

/** The same hues as note fills, which are the pastel swatches. */
const NOTE_FILLS = Object.freeze({
  ink: NOTE_SWATCHES[0],
  blue: NOTE_SWATCHES[1],
  green: NOTE_SWATCHES[2],
  red: NOTE_SWATCHES[3],
  purple: NOTE_SWATCHES[4],
  amber: NOTE_SWATCHES[5],
});

/**
 * Read a diagram defensively.
 *
 * The server has already validated it. This only guarantees that whatever
 * arrives, the layout sees unique ids, known node types and edges between
 * nodes that exist.
 *
 * @param {unknown} diagram
 */
export function normalizeDiagram(diagram) {
  const source = diagram && typeof diagram === "object" ? diagram : {};
  const nodes = [];
  const ids = new Set();

  for (const node of Array.isArray(source.nodes) ? source.nodes.slice(0, MAX_NODES) : []) {
    const id = typeof node?.id === "string" ? node.id : "";
    const label = cleanText(node?.label);
    if (!id || !label || ids.has(id)) continue;

    const normalized = {
      id,
      label,
      type: DIAGRAM_NODE_TYPES.includes(node.type) ? node.type : "rect",
    };
    if (DIAGRAM_COLORS.includes(node.color)) normalized.color = node.color;

    ids.add(id);
    nodes.push(normalized);
  }

  const edges = [];
  const seen = new Set();

  for (const edge of Array.isArray(source.edges) ? source.edges.slice(0, MAX_EDGES) : []) {
    const from = edge?.from;
    const to = edge?.to;
    const key = JSON.stringify([from, to]);
    if (!ids.has(from) || !ids.has(to) || from === to || seen.has(key)) continue;

    const normalized = { from, to };
    const label = cleanText(edge.label);
    if (label) normalized.label = label;
    if (edge.dashed === true) normalized.dashed = true;

    seen.add(key);
    edges.push(normalized);
  }

  return {
    title: cleanText(source.title),
    direction: DIAGRAM_DIRECTIONS.includes(source.direction) ? source.direction : "down",
    nodes,
    edges,
  };
}

/**
 * Lay a diagram out and build its shapes.
 *
 * @param {unknown} diagram
 * @param {Object} options
 * @param {() => string} options.createShapeId
 * @param {() => string} options.createGroupId
 * @param {{ x: number, y: number }} [options.origin] - world position of the top-left corner
 * @param {import("./diagramLayout.js").MeasureText} [options.measureText]
 * @param {{ renderStyle?: string, fontFamily?: string }} [options.style] - the look the
 *   user has picked; only rendering style and font are taken from it
 * @returns {{ shapes: Object[], bounds: { x: number, y: number, width: number, height: number },
 *   title: string, nodeCount: number, edgeCount: number }}
 */
export function createDiagramShapes(
  diagram,
  { createShapeId, createGroupId, origin = { x: 0, y: 0 }, measureText, style = {} },
) {
  const normalized = normalizeDiagram(diagram);
  if (normalized.nodes.length === 0) {
    throw new Error("The diagram has no nodes to draw.");
  }

  const baseStyle = {
    ...DEFAULT_STYLE,
    renderStyle: style.renderStyle ?? DEFAULT_STYLE.renderStyle,
    fontFamily: style.fontFamily ?? DEFAULT_STYLE.fontFamily,
  };
  const labelStyle = { ...baseStyle, fontSize: LABEL_TEXT.fontSize };
  const layout = layoutDiagram(normalized, { measureText, fontFamily: baseStyle.fontFamily });
  const at = (x, y) => ({ x: origin.x + x, y: origin.y + y });

  const createLabel = (box, groupId) => ({
    ...createTextShape({
      id: createShapeId(),
      point: at(box.x, box.y),
      style: labelStyle,
      text: box.lines.join("\n"),
    }),
    width: box.width,
    height: box.height,
    groupId,
  });

  const shapes = [];

  // Array order is draw order: edges go first so arrows sit beneath the nodes they join.
  for (const edge of layout.edges) {
    const [startX, startY] = edge.points;
    const arrow = {
      ...createShape({
        id: createShapeId(),
        type: TOOLS.ARROW,
        point: at(startX, startY),
        style: { ...baseStyle, strokeStyle: edge.dashed ? "dashed" : "solid" },
      }),
      points: edge.points.map((value, index) => value - (index % 2 === 0 ? startX : startY)),
    };

    if (!edge.label) {
      shapes.push(arrow);
      continue;
    }

    const groupId = createGroupId();
    shapes.push({ ...arrow, groupId }, createLabel(edge.label, groupId));
  }

  for (const node of layout.nodes) {
    if (node.type === "note") {
      shapes.push({
        ...createNoteShape({
          id: createShapeId(),
          point: at(node.x, node.y),
          style: { ...baseStyle, fill: NOTE_FILLS[node.color ?? "ink"] },
          text: node.lines.join("\n"),
        }),
        width: node.width,
        height: node.height,
      });
      continue;
    }

    const groupId = createGroupId();
    shapes.push(
      {
        ...createShape({
          id: createShapeId(),
          type: NODE_TOOLS[node.type],
          point: at(node.x, node.y),
          style: { ...baseStyle, stroke: STROKE_COLORS[node.color ?? "ink"] },
        }),
        width: node.width,
        height: node.height,
        groupId,
      },
      createLabel(node.labelBox, groupId),
    );
  }

  return {
    shapes,
    bounds: { ...at(0, 0), width: layout.width, height: layout.height },
    title: normalized.title,
    nodeCount: layout.nodes.length,
    edgeCount: layout.edges.length,
  };
}

/**
 * Where a new block of content should go: centred in view when that space is
 * clear, otherwise just right of everything already on the board, so an insert
 * never lands on top of existing work.
 *
 * @param {{ width: number, height: number }} size
 * @param {{ x: number, y: number, width: number, height: number }} visibleBounds
 * @param {Object[]} existingShapes
 * @param {number} [gap]
 * @returns {{ x: number, y: number }}
 */
export function getDiagramPlacement(size, visibleBounds, existingShapes, gap = 80) {
  const centred = {
    x: Math.round(visibleBounds.x + (visibleBounds.width - size.width) / 2),
    y: Math.round(visibleBounds.y + (visibleBounds.height - size.height) / 2),
  };
  const clearance = {
    x: centred.x - gap / 2,
    y: centred.y - gap / 2,
    width: size.width + gap,
    height: size.height + gap,
  };

  const blocked = existingShapes.some((shape) => {
    const bounds = getShapeBounds(shape);
    return Boolean(bounds) && boundsIntersect(clearance, bounds);
  });
  if (!blocked) return centred;

  const content = getShapesBoundingBox(existingShapes);
  if (!content) return centred;

  return {
    x: Math.round(content.x + content.width + gap * 2),
    y: Math.round(content.y),
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
