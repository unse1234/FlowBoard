// @ts-check

import { normalizeShapeId, normalizeShapeIdSet } from "./shapeIdentity.js";

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
 * Put shapes at exact places in the stack.
 *
 * Each placement moves one shape to sit directly above another, or to the very
 * bottom when its anchor is null. Placements run in order, so a run of shapes
 * listed bottom to top, each anchored on the one before, lands as a run.
 *
 * This is how undo puts back an order it took away. The relative operations
 * above cannot say "back where it was": what one step passes depends on
 * everything else that has changed since.
 *
 * A placement whose shape or anchor is not on the board is skipped, so a shape
 * a collaborator deleted in the meantime changes nothing.
 *
 * @param {Object[]} shapes
 * @param {Iterable<{ shapeId: unknown, afterShapeId: unknown }>} placements
 * @returns {Object[]}
 */
export function placeShapes(shapes, placements) {
  let next = shapes;

  for (const { shapeId, afterShapeId } of placements) {
    const id = normalizeShapeId(shapeId);
    const from = id === null ? -1 : next.findIndex((shape) => idOf(shape) === id);
    if (from === -1) continue;

    const rest = [...next.slice(0, from), ...next.slice(from + 1)];
    let to = 0;

    if (afterShapeId !== null) {
      const anchorId = normalizeShapeId(afterShapeId);
      const anchor = anchorId === null ? -1 : rest.findIndex((shape) => idOf(shape) === anchorId);
      if (anchor === -1) continue;

      to = anchor + 1;
    }

    // Re-inserting where it was taken out leaves the order as it is.
    if (to === from) continue;

    next = [...rest.slice(0, to), next[from], ...rest.slice(to)];
  }

  return next;
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
