const assert = require("node:assert/strict");
const test = require("node:test");
const { DIAGRAM_LIMITS, validateDiagram } = require("./diagramSchema");

const node = (id, extra = {}) => ({ id, label: `Step ${id}`, type: "rect", ...extra });

test("accepts a well-formed diagram and keeps only known fields", () => {
  const result = validateDiagram({
    title: "Login",
    direction: "right",
    nodes: [
      node("a", { color: "blue", x: 10, onClick: "alert(1)" }),
      node("b", { type: "diamond" }),
    ],
    edges: [{ from: "a", to: "b", label: "Yes", dashed: true, points: [1, 2] }],
    script: "<script>",
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.diagram, {
    title: "Login",
    direction: "right",
    nodes: [
      { id: "a", type: "rect", label: "Step a", color: "blue" },
      { id: "b", type: "diamond", label: "Step b" },
    ],
    edges: [{ from: "a", to: "b", label: "Yes", dashed: true }],
  });
});

test("repairs what it safely can", () => {
  const result = validateDiagram({
    direction: "sideways",
    nodes: [node("a", { color: "#ff0000" })],
  });

  assert.equal(result.valid, true);
  assert.equal(result.diagram.direction, "down");
  assert.equal(result.diagram.title, "");
  assert.equal(result.diagram.nodes[0].color, undefined);
  assert.deepEqual(result.diagram.edges, []);
});

test("rejects replies that are not a drawable diagram", () => {
  const tooManyNodes = Array.from({ length: DIAGRAM_LIMITS.maxNodes + 1 }, (_, index) =>
    node(`n${index}`),
  );
  const tooManyEdges = Array.from({ length: DIAGRAM_LIMITS.maxEdges + 1 }, () => ({
    from: "a",
    to: "b",
  }));

  const cases = [
    [null, "null"],
    ["nodes", "a string"],
    [[], "an array"],
    [{ nodes: [] }, "no nodes"],
    [{ nodes: "a,b" }, "nodes that are not a list"],
    [{ nodes: [node("a")], edges: "a->b" }, "edges that are not a list"],
    [{ nodes: tooManyNodes }, "too many nodes"],
    [{ nodes: [node("a"), node("b")], edges: tooManyEdges }, "too many edges"],
    [{ nodes: [node("a"), node("a")] }, "a duplicated id"],
    [{ nodes: [{ label: "No id", type: "rect" }] }, "a missing id"],
    [{ nodes: [node("x".repeat(DIAGRAM_LIMITS.maxIdLength + 1))] }, "an oversized id"],
    [{ nodes: [node("a", { label: "   " })] }, "a blank label"],
    [{ nodes: [node("a", { label: 42 })] }, "a label that is not text"],
    [{ nodes: ["a"] }, "a node that is not an object"],
  ];

  for (const [candidate, description] of cases) {
    const result = validateDiagram(candidate);

    assert.equal(result.valid, false, description);
    assert.equal(result.code, "AI_INVALID_RESPONSE", description);
    assert.equal(typeof result.reason, "string", description);
  }
});

test("reports an unsupported node type distinctly", () => {
  const result = validateDiagram({ nodes: [node("a", { type: "hexagon" })] });

  assert.equal(result.valid, false);
  assert.equal(result.code, "AI_UNSUPPORTED_ELEMENT");
  assert.match(result.reason, /hexagon/);
});

test("skips edges that point nowhere, loop to themselves or repeat", () => {
  const result = validateDiagram({
    nodes: [node("a"), node("b")],
    edges: [
      { from: "a", to: "b" },
      { from: "a", to: "b", label: "again" },
      { from: "a", to: "missing" },
      { from: "b", to: "b" },
      { from: "b", to: "a" },
      "a->b",
      null,
      { from: 1, to: 2 },
    ],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.diagram.edges, [
    { from: "a", to: "b" },
    { from: "b", to: "a" },
  ]);
  assert.equal(result.droppedEdges, 6);
});

test("cleans and shortens text", () => {
  const nul = String.fromCharCode(0);
  const rightToLeftOverride = String.fromCharCode(0x202e);
  const zeroWidthSpace = String.fromCharCode(0x200b);

  const result = validateDiagram({
    title: "T".repeat(200),
    nodes: [
      node("a", { label: `  Login${nul}\n\n  ${rightToLeftOverride}Page${zeroWidthSpace}  ` }),
      node("b", { label: "Word ".repeat(40) }),
    ],
    edges: [{ from: "a", to: "b", label: "L".repeat(100) }],
  });

  assert.equal(result.valid, true);

  const [first, second] = result.diagram.nodes;
  assert.equal(first.label, "Login Page");
  assert.ok(Array.from(second.label).length <= DIAGRAM_LIMITS.maxLabelLength);
  assert.ok(second.label.endsWith("…"));
  assert.ok(Array.from(result.diagram.title).length <= DIAGRAM_LIMITS.maxTitleLength);
  assert.ok(
    Array.from(result.diagram.edges[0].label).length <= DIAGRAM_LIMITS.maxEdgeLabelLength,
  );
});

test("never splits an emoji when shortening", () => {
  const rocket = String.fromCodePoint(0x1f680);
  const result = validateDiagram({ nodes: [node("a", { label: rocket.repeat(100) })] });
  const label = result.diagram.nodes[0].label;

  assert.equal(Array.from(label).length, DIAGRAM_LIMITS.maxLabelLength);
  assert.ok(Array.from(label).slice(0, -1).every((character) => character === rocket));
});
