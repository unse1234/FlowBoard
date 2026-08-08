// @ts-check

/**
 * @param {unknown} id
 * @returns {string | null}
 */
export const normalizeShapeId = (id) => {
  if (id === null || id === undefined || id === "") return null;

  return String(id);
};

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export const isShapeIdEqual = (left, right) => {
  const normalizedLeft = normalizeShapeId(left);
  const normalizedRight = normalizeShapeId(right);

  return normalizedLeft !== null && normalizedLeft === normalizedRight;
};

/**
 * @param {Iterable<unknown>} ids
 * @returns {Set<string>}
 */
export const normalizeShapeIdSet = (ids) => {
  const normalizedIds = new Set();

  for (const id of ids) {
    const normalizedId = normalizeShapeId(id);
    if (normalizedId) normalizedIds.add(normalizedId);
  }

  return normalizedIds;
};
