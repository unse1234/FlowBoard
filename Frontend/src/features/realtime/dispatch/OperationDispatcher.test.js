import assert from "node:assert/strict";
import test from "node:test";
import { OperationApplier } from "../operations/operationApplier.js";
import { OPERATION_LIMITS, OPERATION_TYPES } from "../operations/operationTypes.js";
import { OperationDispatcher } from "./OperationDispatcher.js";

const SILENT = { warn() {}, error() {} };

function dispatcherWith() {
  const published = [];
  const refusals = [];
  const applier = new OperationApplier();
  const dispatcher = new OperationDispatcher({
    boardId: "board_test",
    userId: "user_test",
    realtimeManager: { publishOperation: (operation) => published.push(operation) },
    operationApplier: applier,
    setShapes: () => {},
    onRefused: (refused, sent) => refusals.push({ refused, sent }),
    logger: SILENT,
  });
  return { dispatcher, published, refusals, applier };
}

const shape = (index, size = 3000) => ({ id: `shape_${index}`, type: "pen", points: "x".repeat(size) });

test("an ordinary edit is published as one operation", () => {
  const { dispatcher, published, refusals } = dispatcherWith();

  const result = dispatcher.dispatchLocalOperation(OPERATION_TYPES.CREATE_SHAPE, { shape: shape(1) });

  assert.equal(published.length, 1);
  assert.deepEqual(result, published);
  assert.deepEqual(refusals, []);
});

test("an edit too large for one message is published in pieces, each marked as this client's own", () => {
  const { dispatcher, published, refusals, applier } = dispatcherWith();
  const shapes = Array.from({ length: 1000 }, (_, i) => shape(i));

  const result = dispatcher.dispatchLocalOperation(OPERATION_TYPES.CREATE_SHAPES, { shapes });

  assert.ok(published.length > 1);
  assert.deepEqual(result, published);
  assert.deepEqual(published.flatMap((operation) => operation.payload.shapes), shapes);
  // An echo of any piece is recognised as this client's own edit.
  assert.ok(published.every((operation) => applier.hasProcessed(operation.operationId)));
  assert.deepEqual(refusals, []);
});

test("what cannot be sent is reported, never published", () => {
  const { dispatcher, published, refusals } = dispatcherWith();
  const huge = shape("huge", OPERATION_LIMITS.maxOperationBytes);

  const whole = dispatcher.dispatchLocalOperation(OPERATION_TYPES.CREATE_SHAPE, { shape: huge });
  assert.deepEqual(whole, []);
  assert.equal(published.length, 0);
  assert.deepEqual(refusals.map((entry) => [entry.refused.length, entry.sent.partly]), [[1, false]]);

  dispatcher.dispatchLocalOperation(OPERATION_TYPES.CREATE_SHAPES, { shapes: [shape(1), huge] });
  assert.equal(published.length, 1);
  assert.deepEqual(published[0].payload.shapes, [shape(1)]);
  assert.deepEqual(refusals.map((entry) => [entry.refused.length, entry.sent.partly]), [[1, false], [1, true]]);
});
