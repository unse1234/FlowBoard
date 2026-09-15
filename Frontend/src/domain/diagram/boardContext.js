import { TOOLS } from "../../constants/tools.js";
import { getShapeBounds } from "../geometry/bounds.js";

/**
 * A compact description of the board, for the AI.
 *
 * The model needs to know what is on the board and how it connects, not how it
 * is drawn. So this keeps each shape's type, text and rough geometry, reads
 * text sitting on a box as that box's label, resolves arrows to the shapes
 * their ends touch, and leaves everything else out: styles, versions, real ids,
 * image data and pen strokes. Ids are short and local to one request.
 *
 * Stays inside BOARD_CONTEXT_LIMITS in Backend/src/ai/diagramRequest.js;
 * diagramContract.test.js checks.
 */
export const BOARD_CONTEXT_LIMITS = Object.freeze({
  maxNodes: 60,
  maxConnections: 80,
  maxLabelLength: 80,
});

const BOX_TYPES = new Set([TOOLS.RECT, TOOLS.CIRCLE, TOOLS.DIAMOND]);
const CONNECTOR_TYPES = new Set([TOOLS.ARROW, TOOLS.LINE]);

/** How far outside a shape an arrow may stop and still count as touching it. */
const ENDPOINT_TOLERANCE = 24;

/**
 * @param {Object[]} shapes
 * @returns {Object[]} nodes `{ id, type, label?, x, y, width, height }`, then
 *   connections `{ type, from, to, label? }`
 */
export function buildBoardContext(shapes) {
  const list = Array.isArray(shapes) ? shapes.filter(Boolean) : [];
  const boxes = list.filter((shape) => BOX_TYPES.has(shape.type));
  const connectorGroups = new Set(
    list.filter((shape) => CONNECTOR_TYPES.has(shape.type) && shape.groupId).map((shape) => shape.groupId),
  );

  const boxLabels = new Map();
  const connectorLabels = new Map();
  const labelTexts = new Set();

  for (const shape of list) {
    const text = cleanText(shape.type === TOOLS.TEXT ? shape.text : "");
    if (!text) continue;

    if (shape.groupId && connectorGroups.has(shape.groupId)) {
      connectorLabels.set(shape.groupId, [...(connectorLabels.get(shape.groupId) ?? []), text]);
      labelTexts.add(shape.id);
      continue;
    }

    const owner = findLabelOwner(shape, boxes);
    if (owner) {
      boxLabels.set(owner.id, [...(boxLabels.get(owner.id) ?? []), text]);
      labelTexts.add(shape.id);
    }
  }

  const elements = [];
  const nodes = [];

  for (const shape of list) {
    if (nodes.length >= BOARD_CONTEXT_LIMITS.maxNodes) break;

    const isBox = BOX_TYPES.has(shape.type);
    const isNote = shape.type === TOOLS.NOTE;
    const isFreeText = shape.type === TOOLS.TEXT && !labelTexts.has(shape.id);
    if (!isBox && !isNote && !isFreeText) continue;

    const label = truncate(isBox ? (boxLabels.get(shape.id) ?? []).join(" ") : cleanText(shape.text));
    if (isFreeText && !label) continue;

    const bounds = getShapeBounds(shape);
    if (!bounds) continue;

    const node = { id: `n${nodes.length + 1}`, type: shape.type };
    if (label) node.label = label;
    Object.assign(node, {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });

    elements.push(node);
    nodes.push({ id: node.id, bounds });
  }

  let connections = 0;

  for (const shape of list) {
    if (connections >= BOARD_CONTEXT_LIMITS.maxConnections) break;
    if (!CONNECTOR_TYPES.has(shape.type)) continue;

    const ends = getLineEnds(shape);
    const from = ends && findNodeAt(ends.start, nodes);
    const to = ends && findNodeAt(ends.end, nodes);
    if (!from || !to || from === to) continue;

    const connection = { type: shape.type, from: from.id, to: to.id };
    const label = truncate((connectorLabels.get(shape.groupId) ?? []).join(" "));
    if (label) connection.label = label;

    elements.push(connection);
    connections += 1;
  }

  return elements;
}

/** The box a text labels: the one box in its group, or the smallest box it sits on. */
function findLabelOwner(text, boxes) {
  if (text.groupId) {
    const grouped = boxes.filter((box) => box.groupId === text.groupId);
    if (grouped.length === 1) return grouped[0];
  }

  const bounds = getShapeBounds(text);
  if (!bounds) return null;

  const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  return findSmallestContaining(centre, boxes.map((box) => ({ box, bounds: getShapeBounds(box) })), 0)
    ?.box ?? null;
}

function findNodeAt(point, nodes) {
  return findSmallestContaining(point, nodes, ENDPOINT_TOLERANCE);
}

function findSmallestContaining(point, candidates, tolerance) {
  let best = null;
  let bestArea = Infinity;

  for (const candidate of candidates) {
    const { bounds } = candidate;
    if (!bounds) continue;

    const inside =
      point.x >= bounds.x - tolerance &&
      point.x <= bounds.x + bounds.width + tolerance &&
      point.y >= bounds.y - tolerance &&
      point.y <= bounds.y + bounds.height + tolerance;
    const area = bounds.width * bounds.height;

    if (inside && area < bestArea) {
      best = candidate;
      bestArea = area;
    }
  }

  return best;
}

function getLineEnds(shape) {
  const points = Array.isArray(shape.points) ? shape.points.map(Number) : [];
  if (points.length < 4) return null;

  const x = Number(shape.x);
  const y = Number(shape.y);
  const start = { x: x + points[0], y: y + points[1] };
  const end = { x: x + points[points.length - 2], y: y + points[points.length - 1] };

  return [start.x, start.y, end.x, end.y].every(Number.isFinite) ? { start, end } : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(text) {
  const characters = Array.from(text);
  if (characters.length <= BOARD_CONTEXT_LIMITS.maxLabelLength) return text;

  return characters.slice(0, BOARD_CONTEXT_LIMITS.maxLabelLength - 1).join("").trimEnd() + "…";
}
