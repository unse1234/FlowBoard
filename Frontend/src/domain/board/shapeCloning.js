// @ts-check

/**
 * Copying shapes.
 *
 * Two things have to be regenerated rather than copied. Ids must be fresh or the
 * clone collides with its original the moment it reaches a peer. Group ids must
 * be remapped *consistently*: a duplicated group stays one group, but a separate
 * one from the original, so ungrouping the copy does not silently ungroup what
 * it was copied from.
 *
 * Image payloads are deliberately shared, not deep-copied. A shape's `image`
 * holds a base64 data URL that can run to megabytes, and nothing in the app ever
 * mutates one in place, so copying it would cost a great deal and buy nothing.
 */

/**
 * @param {Object[]} shapes
 * @param {Object} options
 * @param {() => string} options.createShapeId
 * @param {() => string} options.createGroupId
 * @param {number} [options.offsetX]
 * @param {number} [options.offsetY]
 * @param {number} [options.timestamp]
 * @returns {Object[]}
 */
export function cloneShapes(
  shapes,
  { createShapeId, createGroupId, offsetX = 0, offsetY = 0, timestamp = Date.now() },
) {
  const groupIds = new Map();

  return shapes.map((shape) => {
    const clone = {
      ...shape,
      id: createShapeId(),
      x: Number(shape.x ?? 0) + offsetX,
      y: Number(shape.y ?? 0) + offsetY,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Style and points are the only nested values that later edits replace
    // wholesale, so they are copied to keep the clone independent.
    if (shape.style) clone.style = { ...shape.style };
    if (Array.isArray(shape.points)) clone.points = [...shape.points];

    if (shape.groupId) {
      const original = String(shape.groupId);
      if (!groupIds.has(original)) groupIds.set(original, createGroupId());
      clone.groupId = groupIds.get(original);
    }

    return clone;
  });
}
