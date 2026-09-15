import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STYLE, NOTE_SWATCHES } from "../../constants/canvas.js";
import { TOOLS } from "../../constants/tools.js";
import { OperationApplier } from "../../features/realtime/operations/operationApplier.js";
import { OPERATION_TYPES } from "../../features/realtime/operations/operationTypes.js";
import { validateOperation } from "../../features/realtime/operations/operationValidator.js";
import { getShapeBounds } from "../geometry/bounds.js";
import { createDiagramShapes, getDiagramPlacement, normalizeDiagram } from "./diagramShapes.js";

const CHECKOUT = {
  title: "Checkout",
  direction: "down",
  nodes: [
    { id: "cart", label: "Review Cart", type: "rect", color: "blue" },
    { id: "paid", label: "Payment Approved?", type: "diamond", color: "amber" },
    { id: "order", label: "Create Order", type: "rect", color: "green" },
    { id: "retry", label: "Show Payment Error", type: "rect", color: "red" },
    { id: "done", label: "Done", type: "circle" },
    { id: "tip", label: "Payments go through Stripe", type: "note", color: "blue" },
  ],
  edges: [
    { from: "cart", to: "paid" },
    { from: "paid", to: "order", label: "Yes" },
    { from: "paid", to: "retry", label: "No", dashed: true },
    { from: "retry", to: "cart", label: "Try again", dashed: true },
    { from: "order", to: "done" },
  ],
};

const BOX_TYPES = new Set([TOOLS.RECT, TOOLS.CIRCLE, TOOLS.DIAMOND]);

function counter(prefix) {
  let count = 0;
  return () => `${prefix}_${++count}`;
}

function build(diagram = CHECKOUT, options = {}) {
  return createDiagramShapes(diagram, {
    createShapeId: counter("shape"),
    createGroupId: counter("grp"),
    ...options,
  });
}

function onOutline(point, box) {
  const within =
    point.x >= box.x - 1 &&
    point.x <= box.x + box.width + 1 &&
    point.y >= box.y - 1 &&
    point.y <= box.y + box.height + 1;
  const onEdge =
    Math.abs(point.x - box.x) <= 1 ||
    Math.abs(point.x - (box.x + box.width)) <= 1 ||
    Math.abs(point.y - box.y) <= 1 ||
    Math.abs(point.y - (box.y + box.height)) <= 1;

  return within && onEdge;
}

test("builds only ordinary FlowBoard shapes", () => {
  const { shapes, nodeCount, edgeCount } = build();
  const allowed = new Set([TOOLS.ARROW, TOOLS.RECT, TOOLS.CIRCLE, TOOLS.DIAMOND, TOOLS.NOTE, TOOLS.TEXT]);

  assert.equal(nodeCount, 6);
  assert.equal(edgeCount, 5);
  // 5 arrows + 3 edge labels + 5 boxes + 5 node labels + 1 note.
  assert.equal(shapes.length, 19);

  for (const shape of shapes) {
    assert.ok(allowed.has(shape.type), shape.type);
    assert.equal(shape.version, 1);
    assert.ok(Number.isFinite(shape.createdAt));
    assert.ok(Number.isFinite(shape.x) && Number.isFinite(shape.y));
    for (const key of Object.keys(DEFAULT_STYLE)) {
      assert.ok(key in shape.style, `${shape.type} style has ${key}`);
    }
  }
});

test("uses FlowBoard's own ids, never the model's", () => {
  const { shapes } = build();
  const modelIds = new Set(CHECKOUT.nodes.map((node) => node.id));
  const ids = shapes.map((shape) => shape.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("shape_") && !modelIds.has(id)));
  assert.ok(shapes.filter((shape) => shape.groupId).every((shape) => shape.groupId.startsWith("grp_")));
});

test("groups each node with a label centred on it", () => {
  const { shapes } = build();
  const boxes = shapes.filter((shape) => BOX_TYPES.has(shape.type));

  assert.equal(boxes.length, 5);
  for (const box of boxes) {
    const group = shapes.filter((shape) => shape.groupId === box.groupId);
    const label = group.find((shape) => shape.type === TOOLS.TEXT);

    assert.equal(group.length, 2);
    assert.ok(label.text.length > 0);
    assert.ok(Math.abs(label.x + label.width / 2 - (box.x + box.width / 2)) <= 1);
    assert.ok(Math.abs(label.y + label.height / 2 - (box.y + box.height / 2)) <= 1);
  }

  const note = shapes.find((shape) => shape.type === TOOLS.NOTE);
  assert.equal(note.groupId, undefined);
  assert.equal(note.text.replace(/\s+/g, " "), "Payments go through Stripe");
});

test("groups a labelled edge with its label and leaves plain edges alone", () => {
  const { shapes } = build();
  const arrows = shapes.filter((shape) => shape.type === TOOLS.ARROW);
  const labelled = arrows.filter((arrow) => arrow.groupId);

  assert.equal(arrows.length, 5);
  assert.equal(labelled.length, 3);
  for (const arrow of labelled) {
    const group = shapes.filter((shape) => shape.groupId === arrow.groupId);
    assert.deepEqual(group.map((shape) => shape.type).sort(), [TOOLS.ARROW, TOOLS.TEXT]);
  }
});

test("draws each arrow from one node's outline to another's", () => {
  const { shapes } = build();
  const boxes = shapes.filter((shape) => BOX_TYPES.has(shape.type) || shape.type === TOOLS.NOTE);

  for (const arrow of shapes.filter((shape) => shape.type === TOOLS.ARROW)) {
    assert.deepEqual(arrow.points.slice(0, 2), [0, 0]);

    const start = { x: arrow.x, y: arrow.y };
    const end = { x: arrow.x + arrow.points.at(-2), y: arrow.y + arrow.points.at(-1) };
    const source = boxes.find((box) => onOutline(start, box));
    const target = boxes.find((box) => onOutline(end, box));

    assert.ok(source, "arrow starts on a node");
    assert.ok(target, "arrow ends on a node");
    assert.notEqual(source, target);
  }
});

test("maps colours and dashes onto the existing palette", () => {
  const { shapes } = build();
  const label = (text) => shapes.find((shape) => shape.type === TOOLS.TEXT && shape.text.replace(/\n/g, " ") === text);
  const boxFor = (text) => shapes.find((shape) => BOX_TYPES.has(shape.type) && shape.groupId === label(text).groupId);

  assert.equal(boxFor("Review Cart").style.stroke, "#2563eb");
  assert.equal(boxFor("Show Payment Error").style.stroke, "#dc2626");
  assert.equal(boxFor("Done").style.stroke, DEFAULT_STYLE.stroke);
  assert.equal(shapes.find((shape) => shape.type === TOOLS.NOTE).style.fill, NOTE_SWATCHES[1]);

  const arrowFor = (text) => shapes.find((shape) => shape.type === TOOLS.ARROW && shape.groupId === label(text).groupId);
  assert.equal(arrowFor("No").style.strokeStyle, "dashed");
  assert.equal(arrowFor("Yes").style.strokeStyle, "solid");
});

test("takes the rendering style and font the user picked, and nothing else", () => {
  const { shapes } = build(CHECKOUT, {
    style: { renderStyle: "clean", fontFamily: "Excalifont", stroke: "#ff00ff", opacity: 0.2 },
  });

  for (const shape of shapes) {
    assert.equal(shape.style.renderStyle, "clean");
    assert.equal(shape.style.fontFamily, "Excalifont");
    assert.notEqual(shape.style.stroke, "#ff00ff");
    assert.equal(shape.style.opacity, DEFAULT_STYLE.opacity);
  }
});

test("places the diagram at the requested origin", () => {
  const origin = { x: 1000, y: -500 };
  const { shapes, bounds } = build(CHECKOUT, { origin });

  assert.equal(bounds.x, origin.x);
  assert.equal(bounds.y, origin.y);
  for (const shape of shapes) {
    const shapeBounds = getShapeBounds(shape);
    assert.ok(shapeBounds.x >= bounds.x - 1 && shapeBounds.y >= bounds.y - 1);
    assert.ok(shapeBounds.x + shapeBounds.width <= bounds.x + bounds.width + 1);
    assert.ok(shapeBounds.y + shapeBounds.height <= bounds.y + bounds.height + 1);
  }
});

test("produces shapes a collaborator's board applies unchanged", () => {
  const { shapes } = build();
  const operation = {
    boardId: "room_1",
    userId: "user_1",
    operationId: "op_1",
    timestamp: Date.now(),
    type: OPERATION_TYPES.CREATE_SHAPES,
    payload: { shapes },
  };

  assert.equal(validateOperation(operation).valid, true);

  const result = new OperationApplier().apply([], operation);
  assert.equal(result.status, "applied");
  assert.deepEqual(result.shapes, shapes);
});

test("reads a malformed diagram defensively", () => {
  const diagram = normalizeDiagram({
    direction: "diagonal",
    nodes: [
      { id: "a", label: "  A  ", type: "hexagon", color: "#fff" },
      { id: "a", label: "Duplicate", type: "rect" },
      { id: "", label: "No id", type: "rect" },
      { id: "b", label: "", type: "rect" },
      { id: "c", label: "C", type: "circle", color: "green" },
      "not a node",
    ],
    edges: [
      { from: "a", to: "c", label: "  go ", dashed: "yes" },
      { from: "a", to: "c" },
      { from: "a", to: "missing" },
      { from: "c", to: "c" },
      null,
    ],
  });

  assert.deepEqual(diagram, {
    title: "",
    direction: "down",
    nodes: [
      { id: "a", label: "A", type: "rect" },
      { id: "c", label: "C", type: "circle", color: "green" },
    ],
    edges: [{ from: "a", to: "c", label: "go" }],
  });
});

test("refuses to draw a diagram with no nodes", () => {
  assert.throws(() => build({ nodes: [], edges: [] }));
  assert.throws(() => build(null));
});

test("places new content in view when there is room, and beside existing work when not", () => {
  const size = { width: 400, height: 300 };
  const visible = { x: 0, y: 0, width: 1200, height: 800 };

  assert.deepEqual(getDiagramPlacement(size, visible, []), { x: 400, y: 250 });

  const occupied = [{ id: "r1", type: TOOLS.RECT, x: 500, y: 300, width: 200, height: 200 }];
  const placement = getDiagramPlacement(size, visible, occupied);
  assert.ok(placement.x >= 700, "to the right of the existing shape");

  const farAway = [{ id: "r2", type: TOOLS.RECT, x: 5000, y: 5000, width: 10, height: 10 }];
  assert.deepEqual(getDiagramPlacement(size, visible, farAway), { x: 400, y: 250 });
});
