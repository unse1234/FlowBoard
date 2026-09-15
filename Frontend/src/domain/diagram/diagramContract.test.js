import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { TOOLS } from "../../constants/tools.js";
import { AI_PROMPT_MAX_LENGTH } from "../../features/ai/aiClient.js";
import { BOARD_CONTEXT_LIMITS, buildBoardContext } from "./boardContext.js";
import { DIAGRAM_COLORS, DIAGRAM_DIRECTIONS, DIAGRAM_NODE_TYPES } from "./diagramShapes.js";

const require = createRequire(import.meta.url);
const backendSchema = require("../../../../Backend/src/ai/diagramSchema.js");
const backendRequest = require("../../../../Backend/src/ai/diagramRequest.js");

/**
 * The AI diagram contract lives on both sides: the server tells the model which
 * node types and colours exist and rejects anything else, and the client maps
 * exactly those onto shapes. As with the operation contract, drift would fail
 * silently — a node type the client cannot draw, a board context the server
 * throws away — so these tests make it loud.
 */

test("frontend and backend agree on node types, colours and directions", () => {
  assert.deepEqual([...DIAGRAM_NODE_TYPES].sort(), [...backendSchema.DIAGRAM_NODE_TYPES].sort());
  assert.deepEqual([...DIAGRAM_COLORS].sort(), [...backendSchema.DIAGRAM_COLORS].sort());
  assert.deepEqual([...DIAGRAM_DIRECTIONS].sort(), [...backendSchema.DIAGRAM_DIRECTIONS].sort());
});

test("every diagram node type is a shape FlowBoard can draw", () => {
  const tools = new Set(Object.values(TOOLS));

  for (const type of DIAGRAM_NODE_TYPES) assert.ok(tools.has(type), type);
});

test("the prompt limit is the same on both sides", () => {
  assert.equal(AI_PROMPT_MAX_LENGTH, backendRequest.MAX_PROMPT_LENGTH);
});

test("the frontend's board context fits the backend's limits", () => {
  const backend = backendRequest.BOARD_CONTEXT_LIMITS;

  assert.ok(BOARD_CONTEXT_LIMITS.maxNodes + BOARD_CONTEXT_LIMITS.maxConnections <= backend.maxElements);
  assert.ok(BOARD_CONTEXT_LIMITS.maxLabelLength <= backend.maxLabelLength);
});

test("the backend accepts the frontend's board context without dropping anything", () => {
  const board = buildBoardContext([
    { id: "r1", type: TOOLS.RECT, x: 0.4, y: 10, width: 200, height: 80, groupId: "g1" },
    { id: "t1", type: TOOLS.TEXT, x: 60, y: 30, width: 80, height: 30, text: "API", groupId: "g1" },
    { id: "d1", type: TOOLS.DIAMOND, x: 0, y: 300, width: 160, height: 100 },
    { id: "n1", type: TOOLS.NOTE, x: 400, y: 0, width: 200, height: 200, text: "L".repeat(300) },
    { id: "a1", type: TOOLS.ARROW, x: 100, y: 90, points: [0, 0, 0, 210], groupId: "g2" },
    { id: "t2", type: TOOLS.TEXT, x: 110, y: 180, width: 60, height: 30, text: "checks", groupId: "g2" },
  ]);

  const parsed = backendRequest.parseDiagramRequest({ prompt: "Add caching", board });

  assert.equal(board.length, 4);
  assert.deepEqual(parsed.board, board);
});
