const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BOARD_CONTEXT_LIMITS,
  MAX_PROMPT_LENGTH,
  parseDiagramRequest,
} = require("./diagramRequest");

test("requires a prompt", () => {
  for (const prompt of [undefined, null, "", "   \n\t ", 42, { text: "x" }]) {
    assert.throws(() => parseDiagramRequest({ prompt }), { code: "PROMPT_REQUIRED" });
  }

  assert.throws(() => parseDiagramRequest(), { code: "PROMPT_REQUIRED" });
});

test("limits prompt length in characters, not bytes", () => {
  const atLimit = parseDiagramRequest({ prompt: "a".repeat(MAX_PROMPT_LENGTH) });
  assert.equal(atLimit.prompt.length, MAX_PROMPT_LENGTH);

  assert.throws(() => parseDiagramRequest({ prompt: "a".repeat(MAX_PROMPT_LENGTH + 1) }), {
    code: "PROMPT_TOO_LONG",
  });
  assert.throws(() => parseDiagramRequest({ prompt: "a".repeat(100_000) }), {
    code: "PROMPT_TOO_LONG",
  });

  const rocket = String.fromCodePoint(0x1f680);
  assert.doesNotThrow(() => parseDiagramRequest({ prompt: rocket.repeat(MAX_PROMPT_LENGTH) }));
});

test("keeps line breaks in a prompt but drops other control characters", () => {
  const bell = String.fromCharCode(7);
  const { prompt } = parseDiagramRequest({ prompt: `  Login${bell}\nthen dashboard  ` });

  assert.equal(prompt, "Login\nthen dashboard");
});

test("treats a missing or empty board as no context", () => {
  assert.equal(parseDiagramRequest({ prompt: "x" }).board, null);
  assert.equal(parseDiagramRequest({ prompt: "x", board: null }).board, null);
  assert.equal(parseDiagramRequest({ prompt: "x", board: [] }).board, null);
});

test("rejects a board that is not a list or is too large", () => {
  assert.throws(() => parseDiagramRequest({ prompt: "x", board: { nodes: [] } }), {
    code: "INVALID_BOARD",
  });

  const oversized = Array.from({ length: BOARD_CONTEXT_LIMITS.maxElements + 1 }, (_, index) => ({
    id: `n${index}`,
    type: "rect",
  }));
  assert.throws(() => parseDiagramRequest({ prompt: "x", board: oversized }), {
    code: "INVALID_BOARD",
  });
});

test("reduces board context to known, bounded fields", () => {
  const { board } = parseDiagramRequest({
    prompt: "Add caching",
    board: [
      {
        id: "n1",
        type: "rect",
        label: "  API  ",
        x: 10.6,
        y: -5e9,
        width: 200,
        height: Infinity,
        image: "data:image/png;base64,AAAA",
        style: { stroke: "red" },
      },
      { id: "n2", type: "diamond", label: "L".repeat(500) },
      { id: "n1", type: "rect", label: "duplicate id" },
      { id: "bad id!", type: "rect" },
      { id: "n3", type: "image", label: "not a context type" },
      { id: "n4", type: "pen" },
      { type: "arrow", from: "n1", to: "n2", label: "calls" },
      { type: "arrow", from: "n1", to: "missing" },
      { type: "script", from: "n1", to: "n2" },
      "n1->n2",
    ],
  });

  assert.equal(board.length, 3);
  assert.deepEqual(board[0], {
    id: "n1",
    type: "rect",
    label: "API",
    x: 11,
    y: -BOARD_CONTEXT_LIMITS.maxCoordinate,
    width: 200,
  });
  assert.equal(board[1].id, "n2");
  assert.ok(Array.from(board[1].label).length <= BOARD_CONTEXT_LIMITS.maxLabelLength);
  assert.deepEqual(board[2], { type: "arrow", from: "n1", to: "n2", label: "calls" });
});
