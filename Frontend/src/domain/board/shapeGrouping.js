// @ts-check

import { isShapeIdEqual, normalizeShapeId, normalizeShapeIdSet } from "./shapeIdentity.js";

/**
 * Grouping, as a flat optional field.
 *
 * A group is just a shared `groupId` on otherwise independent shapes. There is
 * no container node and no nesting, so the shape array stays flat, z-order stays
 * array order, and a shape without the field behaves exactly as it always has —
 * which is what keeps older saved boards and older peers valid.
 *
 * Every function returns the original array reference when nothing changed, so
 * callers can skip the history entry and the operation.
 */

/**
 * @param {Object[]} shapes
 * @param {Iterable<unknown>} ids
 * @param {string} groupId
 * @returns {Object[]}
 */
export function assignGroupId(shapes, ids, groupId) {
  const targets = normalizeShapeIdSet(ids);
  const normalizedGroupId = normalizeShapeId(groupId);
  if (targets.size === 0 || !normalizedGroupId) return shapes;

  let changed = false;
  const next = shapes.map((shape) => {
    if (!targets.has(String(shape.id))) return shape;
    if (shape.groupId === normalizedGroupId) return shape;

    changed = true;
    return { ...shape, groupId: normalizedGroupId };
  });

  return changed ? next : shapes;
}

/**
 * Clear grouping, addressed either by group id or by an explicit shape list.
 *
 * @param {Object[]} shapes
 * @param {Object} target
 * @param {unknown} [target.groupId]
 * @param {Iterable<unknown>} [target.ids]
 * @returns {Object[]}
 */
export function clearGroupId(shapes, { groupId, ids } = {}) {
  const normalizedGroupId = normalizeShapeId(groupId);
  const targets = normalizeShapeIdSet(ids ?? []);
  if (!normalizedGroupId && targets.size === 0) return shapes;

  let changed = false;
  const next = shapes.map((shape) => {
    if (shape.groupId === undefined) return shape;

    const matchesGroup = normalizedGroupId
      ? isShapeIdEqual(shape.groupId, normalizedGroupId)
      : false;
    if (!matchesGroup && !targets.has(String(shape.id))) return shape;

    changed = true;
    const nextShape = { ...shape };
    delete nextShape.groupId;
    return nextShape;
  });

  return changed ? next : shapes;
}

/**
 * Pull in every shape that shares a group with something already selected.
 *
 * This runs when the selection is resolved rather than when a shape is clicked,
 * so a group behaves as one object no matter how the selection was made —
 * clicked, shift-clicked, marquee-dragged or selected wholesale.
 *
 * @param {Object[]} shapes
 * @param {Iterable<unknown>} ids
 * @returns {Set<string>}
 */
export function expandSelectionWithGroups(shapes, ids) {
  const selected = normalizeShapeIdSet(ids);
  if (selected.size === 0) return selected;

  const groupIds = new Set();
  for (const shape of shapes) {
    if (shape.groupId && selected.has(String(shape.id))) {
      groupIds.add(String(shape.groupId));
    }
  }

  if (groupIds.size === 0) return selected;

  const expanded = new Set(selected);
  for (const shape of shapes) {
    if (shape.groupId && groupIds.has(String(shape.groupId))) {
      expanded.add(String(shape.id));
    }
  }

  return expanded;
}

/**
 * @param {Object[]} selectedShapes
 * @returns {boolean} whether anything in the selection is grouped
 */
export function hasGroupedShape(selectedShapes) {
  return selectedShapes.some((shape) => Boolean(shape.groupId));
}
