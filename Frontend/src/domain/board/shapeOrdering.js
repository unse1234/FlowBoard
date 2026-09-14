// @ts-check

import { normalizeShapeIdSet } from "./shapeIdentity.js";

/**
 * Z-order operations.
 *
 * Array order *is* z-order — Konva paints children in order — so reordering is
 * always a rearrangement of this array, never a `zIndex` field. Introducing one
 * would mean a second sort key that every renderer, the applier and persistence
 * would have to agree on.
 *
 * Every function returns the original array reference when nothing moved, so
 * callers can skip a render and skip emitting an operation.
 */

const idOf = (shape) => String(shape.id);

/**
 * Move each selected shape one step towards the front.
 *
 * Walks from the top down so a run of selected shapes shuffles up together
 * instead of the top one repeatedly swapping with its own neighbours. A shape
 * blocked by another selected shape stays put, which keeps the group's internal
 * order stable.
 *
 * @param {Object[]} shapes
 * @param {Iterable<unknown>} ids
 * @returns {Object[]}
 */
export function moveShapesForward(shapes, ids) {
  const selected = normalizeShapeIdSet(ids);
  if (selected.size === 0) return shapes;

  const next = [...shapes];
  let moved = false;

  for (let index = next.length - 2; index >= 0; index -= 1) {
    if (!selected.has(idOf(next[index]))) continue;
    if (selected.has(idOf(next[index + 1]))) continue;

    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    moved = true;
  }

  return moved ? next : shapes;
}

/**
 * Move each selected shape one step towards the back.
 *
 * @param {Object[]} shapes
 * @param {Iterable<unknown>} ids
 * @returns {Object[]}
 */
export function moveShapesBackward(shapes, ids) {
  const selected = normalizeShapeIdSet(ids);
  if (selected.size === 0) return shapes;

  const next = [...shapes];
  let moved = false;

  for (let index = 1; index < next.length; index += 1) {
    if (!selected.has(idOf(next[index]))) continue;
    if (selected.has(idOf(next[index - 1]))) continue;

    [next[index], next[index - 1]] = [next[index - 1], next[index]];
    moved = true;
  }

  return moved ? next : shapes;
}

/**
 * Lift every selected shape above the rest, preserving relative order on both
 * sides of the split.
 *
 * @param {Object[]} shapes
 * @param {Iterable<unknown>} ids
 * @returns {Object[]}
 */
export function bringShapesToFront(shapes, ids) {
  const selected = normalizeShapeIdSet(ids);
  if (selected.size === 0) return shapes;

  const rest = shapes.filter((shape) => !selected.has(idOf(shape)));
  const moving = shapes.filter((shape) => selected.has(idOf(shape)));
  if (moving.length === 0) return shapes;

  const next = [...rest, ...moving];

  return isSameOrder(shapes, next) ? shapes : next;
}

/**
 * @param {Object[]} shapes
 * @param {Iterable<unknown>} ids
 * @returns {Object[]}
 */
export function sendShapesToBack(shapes, ids) {
  const selected = normalizeShapeIdSet(ids);
  if (selected.size === 0) return shapes;

  const rest = shapes.filter((shape) => !selected.has(idOf(shape)));
  const moving = shapes.filter((shape) => selected.has(idOf(shape)));
  if (moving.length === 0) return shapes;

  const next = [...moving, ...rest];

  return isSameOrder(shapes, next) ? shapes : next;
}

/**
 * @param {Object[]} a
 * @param {Object[]} b
 * @returns {boolean}
 */
function isSameOrder(a, b) {
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }

  return true;
}
