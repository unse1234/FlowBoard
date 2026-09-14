// @ts-check

import { getShapeBounds } from "./bounds.js";

/**
 * Alignment snapping.
 *
 * Candidates are built once when a drag begins, not per frame: the set of things
 * you can snap to cannot change while you are dragging, and rebuilding it on
 * every pointer move would walk the whole board sixty times a second.
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Bounds
 * @typedef {{ vertical: number[], horizontal: number[] }} SnapCandidates
 * @typedef {{ orientation: "vertical" | "horizontal", position: number }} SnapGuide
 */

/**
 * The three lines a shape can snap by on each axis: its edges and its centre.
 *
 * @param {Bounds} bounds
 * @returns {{ vertical: number[], horizontal: number[] }}
 */
export function getSnapAnchors(bounds) {
  return {
    vertical: [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width],
    horizontal: [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height],
  };
}

/**
 * Collect every line the given shapes offer to snap against.
 *
 * @param {Object[]} shapes - usually the board minus whatever is being dragged
 * @returns {SnapCandidates}
 */
export function buildSnapCandidates(shapes) {
  const vertical = new Set();
  const horizontal = new Set();

  for (const shape of shapes) {
    const bounds = getShapeBounds(shape);
    if (!bounds) continue;

    const anchors = getSnapAnchors(bounds);
    anchors.vertical.forEach((value) => vertical.add(value));
    anchors.horizontal.forEach((value) => horizontal.add(value));
  }

  return {
    vertical: [...vertical].sort((a, b) => a - b),
    horizontal: [...horizontal].sort((a, b) => a - b),
  };
}

/**
 * Add the grid lines around a region to a candidate set.
 *
 * @param {SnapCandidates} candidates
 * @param {Bounds} bounds - the region being dragged
 * @param {number} gridSize
 * @returns {SnapCandidates}
 */
export function withGridCandidates(candidates, bounds, gridSize) {
  if (!gridSize || gridSize <= 0) return candidates;

  const snapTo = (value) => Math.round(value / gridSize) * gridSize;
  const vertical = new Set(candidates.vertical);
  const horizontal = new Set(candidates.horizontal);

  for (const value of getSnapAnchors(bounds).vertical) vertical.add(snapTo(value));
  for (const value of getSnapAnchors(bounds).horizontal) horizontal.add(snapTo(value));

  return {
    vertical: [...vertical].sort((a, b) => a - b),
    horizontal: [...horizontal].sort((a, b) => a - b),
  };
}

/**
 * @param {number[]} anchors
 * @param {number[]} candidates
 * @param {number} threshold
 * @returns {{ delta: number, position: number | null }}
 */
function findNearest(anchors, candidates, threshold) {
  let bestDelta = null;
  let bestPosition = null;

  for (const anchor of anchors) {
    for (const candidate of candidates) {
      const delta = candidate - anchor;
      if (Math.abs(delta) > threshold) continue;
      if (bestDelta !== null && Math.abs(delta) >= Math.abs(bestDelta)) continue;

      bestDelta = delta;
      bestPosition = candidate;
    }
  }

  return { delta: bestDelta ?? 0, position: bestPosition };
}

/**
 * Nudge a dragged region onto the nearest candidate lines.
 *
 * The two axes resolve independently, so a shape can snap its left edge to a
 * neighbour while its vertical position stays exactly where the pointer put it.
 *
 * @param {Bounds} bounds - where the drag would land unaided
 * @param {SnapCandidates} candidates
 * @param {number} threshold - in world units, so callers divide by the zoom
 * @returns {{ dx: number, dy: number, guides: SnapGuide[] }}
 */
export function resolveSnap(bounds, candidates, threshold) {
  const anchors = getSnapAnchors(bounds);
  const vertical = findNearest(anchors.vertical, candidates.vertical, threshold);
  const horizontal = findNearest(anchors.horizontal, candidates.horizontal, threshold);

  const guides = [];
  if (vertical.position !== null) {
    guides.push({ orientation: "vertical", position: vertical.position });
  }
  if (horizontal.position !== null) {
    guides.push({ orientation: "horizontal", position: horizontal.position });
  }

  return { dx: vertical.delta, dy: horizontal.delta, guides };
}
