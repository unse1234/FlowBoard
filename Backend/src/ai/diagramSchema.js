const { isPlainObject, sanitizeText } = require("./sanitize");

/**
 * What an AI-generated diagram may contain.
 *
 * The model describes a diagram logically — nodes, what kind of thing each one
 * is, and which leads to which. It never supplies positions, sizes, colour
 * values, URLs or anything executable, and its ids never reach the board:
 * FlowBoard lays the diagram out and creates its own shapes on the client.
 *
 * Mirrored by Frontend/src/domain/diagram/diagramShapes.js, which maps these
 * node types and colours onto native shapes. The frontend's
 * diagramContract.test.js fails if the two drift.
 */

const DIAGRAM_NODE_TYPES = Object.freeze(["rect", "circle", "diamond", "note"]);
const DIAGRAM_COLORS = Object.freeze(["ink", "blue", "purple", "green", "amber", "red"]);
const DIAGRAM_DIRECTIONS = Object.freeze(["down", "right"]);

const DIAGRAM_LIMITS = Object.freeze({
  maxNodes: 30,
  maxEdges: 60,
  maxIdLength: 64,
  maxLabelLength: 60,
  maxEdgeLabelLength: 30,
  maxTitleLength: 80,
});

/**
 * The structured-output schema sent to the model. It shapes the reply, but it
 * is a request rather than a guarantee, so validateDiagram checks every value
 * regardless.
 *
 * Array lengths are stated in descriptions rather than minItems/maxItems:
 * current Gemini models reject a schema containing those keywords as an
 * invalid argument. validateDiagram enforces the limits either way.
 */
const DIAGRAM_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: `A short title for the diagram, at most ${DIAGRAM_LIMITS.maxTitleLength} characters.`,
    },
    direction: {
      type: "string",
      enum: [...DIAGRAM_DIRECTIONS],
      description: '"down" for step-by-step flows, "right" for architectures and pipelines.',
    },
    nodes: {
      type: "array",
      description: `Between 1 and ${DIAGRAM_LIMITS.maxNodes} nodes.`,
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: 'A short unique slug, such as "login".' },
          label: {
            type: "string",
            description: `Text shown on the node: 1-5 words, at most ${DIAGRAM_LIMITS.maxLabelLength} characters.`,
          },
          type: { type: "string", enum: [...DIAGRAM_NODE_TYPES] },
          color: { type: "string", enum: [...DIAGRAM_COLORS] },
        },
        required: ["id", "label", "type"],
      },
    },
    edges: {
      type: "array",
      description: `At most ${DIAGRAM_LIMITS.maxEdges} edges.`,
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "The id of the source node." },
          to: { type: "string", description: "The id of the target node." },
          label: {
            type: "string",
            description: `Optional, at most ${DIAGRAM_LIMITS.maxEdgeLabelLength} characters.`,
          },
          dashed: {
            type: "boolean",
            description: "true for optional, asynchronous or failure paths.",
          },
        },
        required: ["from", "to"],
      },
    },
  },
  required: ["title", "direction", "nodes", "edges"],
};

/**
 * Decide whether a parsed model reply is a diagram FlowBoard can draw.
 *
 * Structural problems reject the whole reply: a diagram with a duplicated id or
 * an unknown node type cannot be drawn faithfully. Smaller problems are
 * repaired instead of failing a generation the user waited for — text is
 * cleaned and shortened, unknown colours and unexpected properties are dropped,
 * and edges that point nowhere, loop to themselves or repeat are skipped.
 *
 * @returns {{ valid: true, diagram: object, droppedEdges: number }
 *   | { valid: false, code: string, reason: string }}
 */
function validateDiagram(candidate) {
  if (!isPlainObject(candidate)) return invalid("The response is not a JSON object.");

  const rawNodes = candidate.nodes;
  const rawEdges = candidate.edges ?? [];

  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    return invalid("The response has no nodes.");
  }
  if (rawNodes.length > DIAGRAM_LIMITS.maxNodes) {
    return invalid(
      `The response has ${rawNodes.length} nodes; the limit is ${DIAGRAM_LIMITS.maxNodes}.`,
    );
  }
  if (!Array.isArray(rawEdges)) return invalid("The response's edges are not a list.");
  if (rawEdges.length > DIAGRAM_LIMITS.maxEdges) {
    return invalid(
      `The response has ${rawEdges.length} edges; the limit is ${DIAGRAM_LIMITS.maxEdges}.`,
    );
  }

  const nodes = [];
  const nodeIds = new Set();

  for (const [index, rawNode] of rawNodes.entries()) {
    if (!isPlainObject(rawNode)) return invalid(`Node ${index} is not an object.`);

    const id = typeof rawNode.id === "string" ? rawNode.id.trim() : "";
    if (!id || id.length > DIAGRAM_LIMITS.maxIdLength) {
      return invalid(`Node ${index} has a missing or oversized id.`);
    }
    if (nodeIds.has(id)) return invalid(`Node id ${quote(id)} is used more than once.`);

    if (!DIAGRAM_NODE_TYPES.includes(rawNode.type)) {
      return {
        valid: false,
        code: "AI_UNSUPPORTED_ELEMENT",
        reason: `Node ${quote(id)} has unsupported type ${quote(rawNode.type)}.`,
      };
    }

    const label = sanitizeText(rawNode.label, DIAGRAM_LIMITS.maxLabelLength);
    if (!label) return invalid(`Node ${quote(id)} has no label.`);

    const node = { id, type: rawNode.type, label };
    if (DIAGRAM_COLORS.includes(rawNode.color)) node.color = rawNode.color;

    nodeIds.add(id);
    nodes.push(node);
  }

  const edges = [];
  const edgeKeys = new Set();
  let droppedEdges = 0;

  for (const rawEdge of rawEdges) {
    const from = typeof rawEdge?.from === "string" ? rawEdge.from.trim() : "";
    const to = typeof rawEdge?.to === "string" ? rawEdge.to.trim() : "";
    const key = JSON.stringify([from, to]);

    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to || edgeKeys.has(key)) {
      droppedEdges += 1;
      continue;
    }

    const edge = { from, to };
    const label = sanitizeText(rawEdge.label, DIAGRAM_LIMITS.maxEdgeLabelLength);
    if (label) edge.label = label;
    if (rawEdge.dashed === true) edge.dashed = true;

    edgeKeys.add(key);
    edges.push(edge);
  }

  return {
    valid: true,
    diagram: {
      title: sanitizeText(candidate.title, DIAGRAM_LIMITS.maxTitleLength),
      direction: DIAGRAM_DIRECTIONS.includes(candidate.direction) ? candidate.direction : "down",
      nodes,
      edges,
    },
    droppedEdges,
  };
}

function invalid(reason) {
  return { valid: false, code: "AI_INVALID_RESPONSE", reason };
}

/** A value for a log line, quoted and kept short whatever the model sent. */
function quote(value) {
  return JSON.stringify(String(value).slice(0, 40));
}

module.exports = {
  DIAGRAM_COLORS,
  DIAGRAM_DIRECTIONS,
  DIAGRAM_LIMITS,
  DIAGRAM_NODE_TYPES,
  DIAGRAM_RESPONSE_SCHEMA,
  validateDiagram,
};
