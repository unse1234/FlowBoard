const { AiError } = require("./aiErrors");
const { isPlainObject, sanitizeText, stripControlCharacters } = require("./sanitize");

const MAX_PROMPT_LENGTH = 2000;

/**
 * Limits on the board context a client may send. The frontend's summary stays
 * well inside them; they exist so a hand-written request cannot turn one
 * generation into an enormous, expensive prompt.
 */
const BOARD_CONTEXT_LIMITS = Object.freeze({
  maxElements: 160,
  maxLabelLength: 80,
  maxIdLength: 32,
  maxCoordinate: 1_000_000,
});

const BOARD_NODE_TYPES = new Set(["rect", "circle", "diamond", "note", "text"]);
const BOARD_CONNECTION_TYPES = new Set(["arrow", "line"]);
const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const BOARD_NODE_NUMBERS = ["x", "y", "width", "height"];

/**
 * Check and normalise a diagram request.
 *
 * @returns {{ prompt: string, board: object[] | null }}
 * @throws {AiError} PROMPT_REQUIRED, PROMPT_TOO_LONG or INVALID_BOARD
 */
function parseDiagramRequest({ prompt, board } = {}) {
  return {
    prompt: parsePrompt(prompt),
    board: parseBoardContext(board),
  };
}

function parsePrompt(value) {
  if (typeof value !== "string") throw new AiError("PROMPT_REQUIRED");

  // Far past the limit whatever it contains; not worth scanning.
  if (value.length > MAX_PROMPT_LENGTH * 4) throw promptTooLong(value.length);

  const prompt = stripControlCharacters(value).trim();
  if (!prompt) throw new AiError("PROMPT_REQUIRED");

  const length = Array.from(prompt).length;
  if (length > MAX_PROMPT_LENGTH) throw promptTooLong(length);

  return prompt;
}

function promptTooLong(length) {
  return new AiError("PROMPT_TOO_LONG", {
    detail: `Prompt has ${length} characters; the limit is ${MAX_PROMPT_LENGTH}.`,
  });
}

/**
 * Reduce client-sent board context to known fields.
 *
 * The context only informs the model, so an individual element that does not
 * fit is skipped rather than failing the request. A board that is not a list,
 * or is larger than the limit, is rejected outright.
 */
function parseBoardContext(value) {
  if (value === undefined || value === null) return null;

  if (!Array.isArray(value)) {
    throw new AiError("INVALID_BOARD", { detail: "board must be an array." });
  }
  if (value.length > BOARD_CONTEXT_LIMITS.maxElements) {
    throw new AiError("INVALID_BOARD", {
      detail: `board has ${value.length} elements; the limit is ${BOARD_CONTEXT_LIMITS.maxElements}.`,
    });
  }

  const nodes = [];
  const nodeIds = new Set();

  for (const element of value) {
    if (!isPlainObject(element) || !BOARD_NODE_TYPES.has(element.type)) continue;

    const id = parseBoardId(element.id);
    if (!id || nodeIds.has(id)) continue;

    const node = { id, type: element.type };
    const label = sanitizeText(element.label, BOARD_CONTEXT_LIMITS.maxLabelLength);
    if (label) node.label = label;

    for (const key of BOARD_NODE_NUMBERS) {
      const number = parseCoordinate(element[key]);
      if (number !== null) node[key] = number;
    }

    nodeIds.add(id);
    nodes.push(node);
  }

  const connections = [];

  for (const element of value) {
    if (!isPlainObject(element) || !BOARD_CONNECTION_TYPES.has(element.type)) continue;

    const from = parseBoardId(element.from);
    const to = parseBoardId(element.to);
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;

    const connection = { type: element.type, from, to };
    const label = sanitizeText(element.label, BOARD_CONTEXT_LIMITS.maxLabelLength);
    if (label) connection.label = label;

    connections.push(connection);
  }

  return nodes.length > 0 ? [...nodes, ...connections] : null;
}

function parseBoardId(value) {
  if (typeof value !== "string") return null;

  const id = value.trim();
  if (!id || id.length > BOARD_CONTEXT_LIMITS.maxIdLength) return null;

  return BOARD_ID_PATTERN.test(id) ? id : null;
}

function parseCoordinate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const limit = BOARD_CONTEXT_LIMITS.maxCoordinate;
  return Math.round(Math.min(limit, Math.max(-limit, value)));
}

module.exports = {
  BOARD_CONTEXT_LIMITS,
  MAX_PROMPT_LENGTH,
  parseDiagramRequest,
};
