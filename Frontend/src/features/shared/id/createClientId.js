// @ts-check

const DEFAULT_PREFIX = "id";

/**
 * Creates a collision-resistant client-side identifier.
 *
 * The UUID path keeps locally-created shapes safe across multiple clients. The
 * fallback is only for older runtimes and still includes time plus entropy.
 *
 * @param {string} [prefix]
 * @returns {string}
 */
export function createClientId(prefix = DEFAULT_PREFIX) {
  const cleanPrefix = sanitizePrefix(prefix);
  const randomUUID = globalThis.crypto?.randomUUID;

  if (typeof randomUUID === "function") {
    return `${cleanPrefix}_${randomUUID.call(globalThis.crypto)}`;
  }

  const entropy = Math.random().toString(36).slice(2, 12);
  const timestamp = Date.now().toString(36);

  return `${cleanPrefix}_${timestamp}_${entropy}`;
}

/**
 * @param {string} prefix
 * @returns {string}
 */
function sanitizePrefix(prefix) {
  const cleanPrefix = String(prefix || DEFAULT_PREFIX)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");

  return cleanPrefix || DEFAULT_PREFIX;
}
