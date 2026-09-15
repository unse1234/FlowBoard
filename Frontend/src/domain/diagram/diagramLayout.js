import { NOTE_DEFAULTS } from "../../constants/canvas.js";

/**
 * Deterministic layout for generated diagrams.
 *
 * The model says what a diagram contains; this decides where everything goes,
 * so the same response always draws the same way and nothing the model returns
 * can position a shape.
 *
 * It is a small layered layout. Nodes are ranked along the flow by their
 * longest path from a start, ordered within each rank to cut crossings, and
 * centred rank by rank. An edge between neighbouring ranks runs straight, or
 * with one elbow through the gap between them. Every other edge — one that
 * skips ranks or loops back — is a detour: it leaves through the gap after its
 * source, runs along a lane beside the diagram, and returns through the gap
 * before its target, so no edge is drawn through a node.
 *
 * Positions are worked out along the flow (`main`) and across it (`cross`),
 * and only turned into x and y at the end, so "down" and "right" share one
 * algorithm.
 *
 * @typedef {{ id: string, label: string, type: string, color?: string }} DiagramNode
 * @typedef {{ from: string, to: string, label?: string, dashed?: boolean }} DiagramEdge
 * @typedef {{ direction: string, nodes: DiagramNode[], edges: DiagramEdge[] }} Diagram
 * @typedef {(text: string, font: { fontSize: number, fontFamily: string }) => number} MeasureText
 */

/** Metrics of FlowBoard's text shape (TextShape in renderingStrategies.jsx). */
export const LABEL_TEXT = Object.freeze({
  fontSize: 16,
  lineHeight: 1.25,
  padding: 2,
  // Room beyond the measured text, so the renderer never wraps a line the
  // layout kept whole.
  slack: 6,
});

/** NoteShape's line height; its padding is NOTE_DEFAULTS.padding. */
const NOTE_LINE_HEIGHT = 1.3;

const SPACING = Object.freeze({
  down: { rankGap: 96, nodeGap: 56 },
  // Wider, because a label on an edge between two ranks has to fit across the gap.
  right: { rankGap: 220, nodeGap: 44 },
});

const LANE_CLEARANCE = 56;
const LANE_SPACING = 20;
const LABEL_OFFSET = 6;
const EDGE_LABEL_MAX_WIDTH = 120;
const LOOSE_NODES_PER_ROW = 4;
const ORDERING_SWEEPS = 4;

/**
 * How each node type sizes itself around its label. An ellipse's largest inner
 * rectangle is 1/√2 of its size and a diamond's is half, so those grow faster.
 */
const NODE_BOXES = Object.freeze({
  rect: { maxTextWidth: 180, minWidth: 150, minHeight: 64, fit: (w, h) => [w + 40, h + 32] },
  circle: {
    maxTextWidth: 140,
    minWidth: 130,
    minHeight: 80,
    fit: (w, h) => [(w + 16) * Math.SQRT2, (h + 12) * Math.SQRT2],
  },
  diamond: {
    maxTextWidth: 120,
    minWidth: 160,
    minHeight: 100,
    fit: (w, h) => [(w + 16) * 2, (h + 12) * 2],
  },
  note: {
    maxTextWidth: 160,
    minWidth: 160,
    minHeight: 96,
    fit: (w, h) => [
      w + NOTE_DEFAULTS.padding * 2 + LABEL_TEXT.slack * 2,
      h + NOTE_DEFAULTS.padding * 2 + LABEL_TEXT.slack * 2,
    ],
  },
});

/**
 * A rough text width for when no canvas is available to measure with.
 *
 * @type {MeasureText}
 */
export const estimateTextWidth = (text, { fontSize }) => Array.from(text).length * fontSize * 0.56;

/**
 * @param {Diagram} diagram - normalised: unique ids, known types
 * @param {{ measureText?: MeasureText, fontFamily?: string }} [options]
 */
export function layoutDiagram(diagram, { measureText = estimateTextWidth, fontFamily = "Inter" } = {}) {
  const direction = diagram.direction === "right" ? "right" : "down";
  const { rankGap, nodeGap } = SPACING[direction];
  const measure = (text) => measureText(text, { fontSize: LABEL_TEXT.fontSize, fontFamily });

  const nodes = diagram.nodes.map((node) => ({ ...node, ...measureNode(node, measure) }));
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));

  const links = [];
  for (const edge of diagram.edges) {
    const source = indexById.get(edge.from);
    const target = indexById.get(edge.to);
    if (source === undefined || target === undefined || source === target) continue;

    links.push({ edge, source, target });
  }

  const { layers, layerOf } = orderLayers(rankNodes(nodes.length, links), links);
  const along = (node) => (direction === "down" ? node.height : node.width);
  const across = (node) => (direction === "down" ? node.width : node.height);

  // Ranks follow one another along the flow, each centred across it.
  const bands = [];
  const boxes = [];
  let cursor = 0;

  for (const layer of layers) {
    const thickness = Math.max(...layer.map((index) => along(nodes[index])));
    const span =
      layer.reduce((total, index) => total + across(nodes[index]), 0) +
      nodeGap * (layer.length - 1);
    let offset = -span / 2;

    for (const index of layer) {
      const node = nodes[index];
      boxes[index] = {
        main: cursor + (thickness - along(node)) / 2,
        cross: offset,
        along: along(node),
        across: across(node),
      };
      offset += across(node) + nodeGap;
    }

    bands.push({ start: cursor, end: cursor + thickness });
    cursor += thickness + rankGap;
  }

  const lanes = assignLanes({ links, layerOf, boxes, rankGap });

  const routes = links.map(({ source, target }, index) => {
    const from = boxes[source];
    const to = boxes[target];
    const start = { main: from.main + from.along, cross: from.cross + from.across / 2 };
    const end = { main: to.main, cross: to.cross + to.across / 2 };
    const lane = lanes.get(index);

    if (!lane) {
      if (Math.abs(start.cross - end.cross) < 1) {
        return [start, { main: end.main, cross: start.cross }];
      }

      const turn = (bands[layerOf[source]].end + bands[layerOf[target]].start) / 2;
      return [start, { main: turn, cross: start.cross }, { main: turn, cross: end.cross }, end];
    }

    const exit = bands[layerOf[source]].end + lane.inset;
    const entry = bands[layerOf[target]].start - lane.inset;

    return [
      start,
      { main: exit, cross: start.cross },
      { main: exit, cross: lane.cross },
      { main: entry, cross: lane.cross },
      { main: entry, cross: end.cross },
      end,
    ];
  });

  const toPoint =
    direction === "down"
      ? ({ main, cross }) => ({ x: cross, y: main })
      : ({ main, cross }) => ({ x: main, y: cross });

  const placedNodes = nodes.map((node, index) => {
    const { x, y } = toPoint(boxes[index]);
    const placed = {
      id: node.id,
      type: node.type,
      label: node.label,
      lines: node.lines,
      x,
      y,
      width: node.width,
      height: node.height,
    };
    if (node.color) placed.color = node.color;

    if (node.type !== "note") {
      placed.labelBox = {
        lines: node.lines,
        width: node.labelWidth,
        height: node.labelHeight,
        x: x + (node.width - node.labelWidth) / 2,
        y: y + (node.height - node.labelHeight) / 2,
      };
    }

    return placed;
  });

  const nodeExtent = getExtent(placedNodes);
  const centre = {
    x: nodeExtent.x + nodeExtent.width / 2,
    y: nodeExtent.y + nodeExtent.height / 2,
  };

  const placedEdges = links.map(({ edge }, index) => {
    const points = routes[index].map(toPoint);

    return {
      from: edge.from,
      to: edge.to,
      dashed: edge.dashed === true,
      points,
      label: edge.label
        ? placeEdgeLabel(points, edge.label, {
            measure,
            direction,
            centre,
            rankGap,
            lane: lanes.get(index),
          })
        : null,
    };
  });

  // Move the whole diagram so its top-left corner is the origin.
  const extent = getExtent([
    ...placedNodes,
    ...placedEdges.flatMap((edge) => [
      ...edge.points.map((point) => ({ ...point, width: 0, height: 0 })),
      ...(edge.label ? [edge.label] : []),
    ]),
  ]);
  const shift = (box) => ({
    ...box,
    x: Math.round(box.x - extent.x),
    y: Math.round(box.y - extent.y),
  });

  return {
    direction,
    width: Math.ceil(extent.width),
    height: Math.ceil(extent.height),
    nodes: placedNodes.map((node) =>
      node.labelBox ? { ...shift(node), labelBox: shift(node.labelBox) } : shift(node),
    ),
    edges: placedEdges.map((edge) => ({
      ...edge,
      points: edge.points.flatMap((point) => [
        Math.round(point.x - extent.x),
        Math.round(point.y - extent.y),
      ]),
      label: edge.label ? shift(edge.label) : null,
    })),
  };
}

/**
 * Break a label into lines no wider than `maxWidth`.
 *
 * Lines are balanced — the wrap width is narrowed as far as it goes without
 * adding a line — so a centred two-line label is two similar lines rather than
 * a long one and a stray word. A word too wide on its own is split.
 *
 * @param {string} text
 * @param {number} maxWidth
 * @param {(text: string) => number} measure
 * @returns {string[]}
 */
export function wrapLabel(text, maxWidth, measure) {
  const words = String(text)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitWord(word, maxWidth, measure));
  if (words.length === 0) return [""];

  const lines = wrapWords(words, maxWidth, measure);
  if (lines.length < 2) return lines;

  let narrow = Math.max(...words.map(measure));
  let wide = maxWidth;
  let balanced = lines;

  while (wide - narrow > 1) {
    const middle = (narrow + wide) / 2;
    const attempt = wrapWords(words, middle, measure);

    if (attempt.length > lines.length) {
      narrow = middle;
    } else {
      balanced = attempt;
      wide = middle;
    }
  }

  return balanced;
}

function wrapWords(words, maxWidth, measure) {
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (!line || measure(candidate) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function splitWord(word, maxWidth, measure) {
  if (measure(word) <= maxWidth) return [word];

  const pieces = [];
  let piece = "";

  for (const character of word) {
    if (piece && measure(piece + character) > maxWidth) {
      pieces.push(piece);
      piece = character;
    } else {
      piece += character;
    }
  }

  if (piece) pieces.push(piece);
  return pieces;
}

function measureTextBlock(text, maxWidth, measure, lineHeight = LABEL_TEXT.lineHeight) {
  const lines = wrapLabel(text, maxWidth, measure);
  const textWidth = Math.ceil(Math.max(0, ...lines.map(measure)));
  const textHeight = Math.ceil(lines.length * LABEL_TEXT.fontSize * lineHeight);

  return {
    lines,
    textWidth,
    textHeight,
    width: textWidth + LABEL_TEXT.padding * 2 + LABEL_TEXT.slack,
    height: textHeight + LABEL_TEXT.padding * 2,
  };
}

function measureNode(node, measure) {
  const box = NODE_BOXES[node.type] ?? NODE_BOXES.rect;
  const lineHeight = node.type === "note" ? NOTE_LINE_HEIGHT : LABEL_TEXT.lineHeight;
  const text = measureTextBlock(node.label, box.maxTextWidth, measure, lineHeight);
  const [fitWidth, fitHeight] = box.fit(text.textWidth, text.textHeight);

  return {
    lines: text.lines,
    labelWidth: text.width,
    labelHeight: text.height,
    width: toEven(Math.max(box.minWidth, fitWidth)),
    height: toEven(Math.max(box.minHeight, fitHeight)),
  };
}

/**
 * Rank every node along the flow.
 *
 * Cycles are broken first: an edge back to a node still on the depth-first
 * path is set aside, and searching from the nodes nothing points to keeps the
 * natural beginning of the flow first. Ranks are then longest paths over what
 * remains, and nodes with no edges at all get rows of their own at the end
 * instead of crowding the first rank.
 */
function rankNodes(count, links) {
  const outgoing = Array.from({ length: count }, () => []);
  const incoming = new Array(count).fill(0);

  links.forEach((link, index) => {
    outgoing[link.source].push(index);
    incoming[link.target] += 1;
  });

  const backLinks = new Set();
  const state = new Array(count).fill(0);
  const visit = (node) => {
    state[node] = 1;
    for (const index of outgoing[node]) {
      const next = links[index].target;
      if (state[next] === 1) backLinks.add(index);
      else if (state[next] === 0) visit(next);
    }
    state[node] = 2;
  };

  const everyNode = range(count);
  for (const node of [...everyNode.filter((index) => incoming[index] === 0), ...everyNode]) {
    if (state[node] === 0) visit(node);
  }

  const rank = new Array(count).fill(0);
  const waiting = new Array(count).fill(0);
  links.forEach((link, index) => {
    if (!backLinks.has(index)) waiting[link.target] += 1;
  });

  const queue = everyNode.filter((index) => waiting[index] === 0);
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];

    for (const index of outgoing[node]) {
      if (backLinks.has(index)) continue;

      const next = links[index].target;
      rank[next] = Math.max(rank[next], rank[node] + 1);
      waiting[next] -= 1;
      if (waiting[next] === 0) queue.push(next);
    }
  }

  const connected = new Array(count).fill(false);
  for (const link of links) {
    connected[link.source] = true;
    connected[link.target] = true;
  }

  const loose = everyNode.filter((index) => !connected[index]);
  if (loose.length > 0) {
    const allLoose = loose.length === count;
    const firstRank = allLoose
      ? 0
      : Math.max(...everyNode.filter((index) => connected[index]).map((index) => rank[index])) + 1;
    const perRow = allLoose ? Math.ceil(Math.sqrt(count)) : LOOSE_NODES_PER_ROW;

    loose.forEach((node, order) => {
      rank[node] = firstRank + Math.floor(order / perRow);
    });
  }

  return rank;
}

/**
 * Group nodes into layers and order each one to reduce crossings.
 *
 * A few barycentre sweeps, alternately down and up: each node moves toward the
 * average position of its neighbours in the adjacent layer. Ties keep the
 * previous order, so the result is deterministic and a node listed early by the
 * model tends to stay first.
 */
function orderLayers(rank, links) {
  const count = rank.length;
  const byRank = [];
  for (let node = 0; node < count; node += 1) {
    (byRank[rank[node]] ??= []).push(node);
  }

  const layers = byRank.filter(Boolean);
  const layerOf = new Array(count);
  layers.forEach((layer, layerIndex) => {
    for (const node of layer) layerOf[node] = layerIndex;
  });

  const before = Array.from({ length: count }, () => []);
  const after = Array.from({ length: count }, () => []);
  for (const link of links) {
    if (layerOf[link.target] !== layerOf[link.source] + 1) continue;

    before[link.target].push(link.source);
    after[link.source].push(link.target);
  }

  const position = new Array(count);
  const place = (layer) =>
    layer.forEach((node, index) => {
      position[node] = (index + 0.5) / layer.length;
    });
  layers.forEach(place);

  for (let sweep = 0; sweep < ORDERING_SWEEPS; sweep += 1) {
    const downward = sweep % 2 === 0;
    const sequence = downward ? layers.slice(1) : layers.slice(0, -1).reverse();

    for (const layer of sequence) {
      const score = new Map(
        layer.map((node) => {
          const neighbours = downward ? before[node] : after[node];
          return [
            node,
            neighbours.length > 0 ? average(neighbours.map((other) => position[other])) : position[node],
          ];
        }),
      );

      layer.sort((a, b) => score.get(a) - score.get(b) || position[a] - position[b]);
      place(layer);
    }
  }

  return { layers, layerOf };
}

/**
 * Give each detour a lane.
 *
 * A detour runs on the side of the diagram nearer its two ends. Shorter
 * detours take the inner lanes and longer ones wrap around them, and outer
 * lanes turn closer to their nodes at both ends, so detours on the same side
 * nest rather than cross.
 *
 * @returns {Map<number, { side: string, cross: number, outer: number, inset: number }>}
 *   by link index; `outer` is the outermost lane on that side, where labels go
 */
function assignLanes({ links, layerOf, boxes, rankGap }) {
  const crossMin = Math.min(...boxes.map((box) => box.cross));
  const crossMax = Math.max(...boxes.map((box) => box.cross + box.across));
  const detours = { before: [], after: [] };

  links.forEach(({ source, target }, index) => {
    if (layerOf[target] === layerOf[source] + 1) return;

    const centres = boxes[source].cross + boxes[source].across / 2 + boxes[target].cross + boxes[target].across / 2;
    detours[centres < 0 ? "before" : "after"].push({
      index,
      span: Math.abs(layerOf[target] - layerOf[source]),
    });
  });

  const lanes = new Map();

  for (const [side, list] of Object.entries(detours)) {
    list.sort((a, b) => a.span - b.span || a.index - b.index);

    const laneCross = (lane) =>
      side === "before"
        ? crossMin - LANE_CLEARANCE - lane * LANE_SPACING
        : crossMax + LANE_CLEARANCE + lane * LANE_SPACING;

    list.forEach(({ index }, lane) => {
      lanes.set(index, {
        side,
        cross: laneCross(lane),
        outer: laneCross(list.length - 1),
        // Short of the gap's midpoint, where neighbouring-rank elbows turn.
        inset: Math.min(rankGap * 0.45, rankGap * 0.2 + (list.length - 1 - lane) * 6),
      });
    });
  }

  return lanes;
}

/**
 * Put an edge's label where there is room for it.
 *
 * A detour's label sits just outside the outermost lane on its side, level
 * with its own lane, so it never lands on a neighbouring lane. In a
 * left-to-right diagram an elbow's middle stretch runs across the gap between
 * ranks, so the label sits over the final stretch, within the half of the gap
 * nearest the target. Otherwise the longest stretch has the room: above a
 * horizontal one, or beside a vertical one on the side facing away from the
 * diagram.
 */
function placeEdgeLabel(points, text, { measure, direction, centre, rankGap, lane }) {
  const sized = (maxWidth) => {
    const block = measureTextBlock(text, maxWidth, measure);
    return { lines: block.lines, width: block.width, height: block.height };
  };

  if (lane) {
    const size = sized(EDGE_LABEL_MAX_WIDTH);
    const [a, b] = [points[2], points[3]];

    if (direction === "down") {
      return {
        ...size,
        x: lane.side === "after" ? lane.outer + LABEL_OFFSET : lane.outer - LABEL_OFFSET - size.width,
        y: (a.y + b.y) / 2 - size.height / 2,
      };
    }

    return {
      ...size,
      x: (a.x + b.x) / 2 - size.width / 2,
      y: lane.side === "after" ? lane.outer + LABEL_OFFSET : lane.outer - LABEL_OFFSET - size.height,
    };
  }

  if (direction === "right" && points.length === 4) {
    const halfGap = rankGap / 2 - LABEL_OFFSET * 2 - LABEL_TEXT.padding * 2 - LABEL_TEXT.slack;
    // Narrow enough to stay in the half of the gap nearest the target, but
    // never so narrow that a word is broken in two.
    const longestWord = Math.max(...String(text).split(/\s+/).map(measure));
    const size = sized(Math.min(EDGE_LABEL_MAX_WIDTH, Math.max(halfGap, longestWord)));
    const end = points[3];

    return {
      ...size,
      x: end.x - size.width - LABEL_OFFSET,
      y: end.y - size.height - LABEL_OFFSET,
    };
  }

  const size = sized(EDGE_LABEL_MAX_WIDTH);
  let longest = [points[0], points[1]];
  let longestLength = -1;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    if (length > longestLength) {
      longest = [a, b];
      longestLength = length;
    }
  }

  const [a, b] = longest;
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  if (Math.abs(a.y - b.y) < 1) {
    return {
      ...size,
      x: middle.x - size.width / 2,
      y: middle.y - size.height - LABEL_OFFSET,
    };
  }

  return {
    ...size,
    x: middle.x < centre.x ? middle.x - size.width - LABEL_OFFSET : middle.x + LABEL_OFFSET,
    y: middle.y - size.height / 2,
  };
}

function getExtent(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function range(count) {
  return Array.from({ length: count }, (_, index) => index);
}

function toEven(value) {
  return Math.ceil(value / 2) * 2;
}
