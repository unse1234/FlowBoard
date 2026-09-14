// @ts-check

/**
 * Collaborator colours.
 *
 * One seeded pick drives a person's avatar, cursor and cursor label, so they
 * have a single colour everywhere. Every hue holds at least 4.5:1 against the
 * white label text drawn on it, and stays visible on both the paper and the
 * graphite canvas.
 */
export const COLLABORATOR_COLORS = Object.freeze([
  "#2563eb",
  "#d93a3a",
  "#15803d",
  "#7c3aed",
  "#c2410c",
  "#0e7490",
  "#db2777",
  "#a16207",
]);

/**
 * Deterministic colour for a user id (or name).
 *
 * @param {unknown} seed
 * @returns {string}
 */
export function pickCollaboratorColor(seed) {
  const key = String(seed ?? "");
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  return COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length];
}
