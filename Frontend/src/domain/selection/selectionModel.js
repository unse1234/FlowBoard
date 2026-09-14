// @ts-check

import { isShapeIdEqual, normalizeShapeIdSet } from "../board/shapeIdentity.js";
import { expandSelectionWithGroups } from "../board/shapeGrouping.js";
import { isBendable } from "../../utils/shapeUtils.js";

/**
 * Selection is a list of ids, in the order the user picked them.
 *
 * Most of the app only ever cares about "the" selected shape, so a single
 * `selectedShape` is still derived from the head of the list — that keeps the
 * style panel, the line editor and the text overlay working unchanged while
 * multi-shape actions read the full array.
 */

/**
 * Selected shapes, in board order, with groups pulled in whole.
 *
 * Expanding here rather than at click time means a group behaves as one object
 * however it was selected — clicked, shift-clicked, marquee-dragged or via
 * select-all — and it stops behaving that way the instant it is ungrouped.
 *
 * @param {Object[]} shapes
 * @param {Iterable<unknown>} selectedIds
 * @returns {Object[]}
 */
export function resolveSelectedShapes(shapes, selectedIds) {
  const ids = normalizeShapeIdSet(selectedIds);
  if (ids.size === 0) return [];

  const expanded = expandSelectionWithGroups(shapes, ids);

  return shapes.filter((shape) => expanded.has(String(shape.id)));
}

/**
 * @param {Object} input
 * @param {Object[]} input.shapes
 * @param {string[]} input.selectedIds
 * @param {unknown} input.editingTextId
 */
export function getSelectedShapes({ shapes, selectedIds, editingTextId }) {
  const selectedShapes = resolveSelectedShapes(shapes, selectedIds);

  return {
    selectedShapes,
    selectedShape: selectedShapes[0] ?? null,
    editingTextShape:
      shapes.find((shape) => isShapeIdEqual(shape.id, editingTextId)) ?? null,
  };
}

/**
 * Whether the Konva Transformer should be attached.
 *
 * A lone line or arrow is edited through its own breakpoint handles instead, so
 * the transformer stays off for that case — but once it is part of a larger
 * selection the transformer is the only thing that can move the group, so it
 * comes back.
 *
 * @param {Object} input
 * @param {Object[]} input.selectedShapes
 * @param {unknown} input.editingTextId
 * @returns {boolean}
 */
export function canUseTransformer({ selectedShapes, editingTextId }) {
  if (editingTextId) return false;
  if (selectedShapes.length === 0) return false;
  if (selectedShapes.length === 1) return !isBendable(selectedShapes[0]);

  return true;
}

/**
 * The single shape whose breakpoints should be editable, if any.
 *
 * @param {Object[]} selectedShapes
 * @returns {Object | null}
 */
export function getBendableSelection(selectedShapes) {
  if (selectedShapes.length !== 1) return null;

  return isBendable(selectedShapes[0]) ? selectedShapes[0] : null;
}

/**
 * Add or remove one id, for shift-clicking.
 *
 * @param {string[]} selectedIds
 * @param {unknown} id
 * @returns {string[]}
 */
export function toggleSelection(selectedIds, id) {
  const target = String(id);
  if (selectedIds.some((selected) => isShapeIdEqual(selected, target))) {
    return selectedIds.filter((selected) => !isShapeIdEqual(selected, target));
  }

  return [...selectedIds, target];
}

/**
 * Merge two id lists without duplicates, preserving first-seen order.
 *
 * @param {string[]} selectedIds
 * @param {Iterable<unknown>} ids
 * @returns {string[]}
 */
export function addToSelection(selectedIds, ids) {
  const next = [...selectedIds];
  const seen = normalizeShapeIdSet(selectedIds);

  for (const id of ids) {
    const normalized = String(id);
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}
