import assert from "node:assert/strict";
import test from "node:test";
import { TOOLS } from "../../constants/tools.js";
import { BOARD_CONTEXT_LIMITS, buildBoardContext } from "./boardContext.js";
import { createDiagramShapes } from "./diagramShapes.js";

const DIAGRAM = {
  direction: "right",
  nodes: [
    { id: "client", label: "React Client", type: "rect" },
    { id: "api", label: "Express API", type: "rect" },
    { id: "db", label: "MongoDB", type: "circle" },
    { id: "hint", label: "Hosted on Render", type: "note" },
  ],
  edges: [
    { from: "client", to: "api", label: "REST" },
    { from: "api", to: "db" },
  ],
};

function counter(prefix) {
  let count = 0;
  return () => `${prefix}_${++count}`;
}

function diagramShapes() {
  return createDiagramShapes(DIAGRAM, {
    createShapeId: counter("shape"),
    createGroupId: counter("grp"),
  }).shapes;
}

test("describes a diagram by its labelled nodes and the connections between them", () => {
  const context = buildBoardContext(diagramShapes());
  const nodes = context.filter((element) => element.id);
  const connections = context.filter((element) => element.from);
  const labelOf = new Map(nodes.map((node) => [node.id, node.label]));

  assert.deepEqual(nodes.map((node) => node.label).sort(), [
    "Express API",
    "Hosted on Render",
    "MongoDB",
    "React Client",
  ]);
  assert.deepEqual(
    connections.map((connection) => [labelOf.get(connection.from), labelOf.get(connection.to), connection.label]),
    [
      ["React Client", "Express API", "REST"],
      ["Express API", "MongoDB", undefined],
    ],
  );
  for (const node of nodes) {
    assert.deepEqual(Object.keys(node), ["id", "type", "label", "x", "y", "width", "height"]);
  }
});

test("leaves out styles, real ids, image data and pen strokes", () => {
  const shapes = [
    ...diagramShapes(),
    { id: "pen_1", type: TOOLS.PEN, x: 0, y: 0, points: [0, 0, 10, 10], style: {} },
    {
      id: "img_1",
      type: TOOLS.IMAGE,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      image: { src: "data:image/png;base64,AAAA" },
    },
  ];

  const serialized = JSON.stringify(buildBoardContext(shapes));

  assert.ok(!serialized.includes("style"));
  assert.ok(!serialized.includes("shape_"));
  assert.ok(!serialized.includes("grp_"));
  assert.ok(!serialized.includes("data:image"));
  assert.ok(!serialized.includes(TOOLS.PEN));
});

test("reads text sitting on a box as its label, grouped or not", () => {
  const context = buildBoardContext([
    { id: "r1", type: TOOLS.RECT, x: 0, y: 0, width: 200, height: 100 },
    { id: "t1", type: TOOLS.TEXT, x: 60, y: 35, width: 80, height: 30, text: "Payments" },
    { id: "t2", type: TOOLS.TEXT, x: 400, y: 0, width: 120, height: 30, text: "  Sprint   plan " },
  ]);

  assert.deepEqual(context, [
    { id: "n1", type: TOOLS.RECT, label: "Payments", x: 0, y: 0, width: 200, height: 100 },
    { id: "n2", type: TOOLS.TEXT, label: "Sprint plan", x: 400, y: 0, width: 120, height: 30 },
  ]);
});

test("ignores arrows that do not join two shapes", () => {
  const context = buildBoardContext([
    { id: "r1", type: TOOLS.RECT, x: 0, y: 0, width: 100, height: 100 },
    { id: "a1", type: TOOLS.ARROW, x: 500, y: 500, points: [0, 0, 100, 0] },
    { id: "a2", type: TOOLS.ARROW, x: 50, y: 100, points: [0, 0, 0, 400] },
  ]);

  assert.deepEqual(context.map((element) => element.id ?? element.type), ["n1"]);
});

test("caps how much of the board it describes", () => {
  const shapes = Array.from({ length: 100 }, (_, index) => ({
    id: `r${index}`,
    type: TOOLS.NOTE,
    x: index * 300,
    y: 0,
    width: 200,
    height: 200,
    text: "Long ".repeat(50),
  }));

  const context = buildBoardContext(shapes);

  assert.equal(context.length, BOARD_CONTEXT_LIMITS.maxNodes);
  assert.ok(context.every((node) => Array.from(node.label).length <= BOARD_CONTEXT_LIMITS.maxLabelLength));
});
