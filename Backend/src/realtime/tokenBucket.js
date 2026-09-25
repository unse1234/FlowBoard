/**
 * A token bucket: `capacity` actions at once, refilled at `refillPerSecond`.
 *
 * For per-socket limits on realtime events (Phase D). A socket lives on one
 * instance, so its budget belongs in that instance's memory; nothing here is
 * shared, and nothing needs to be. Connection attempts, which are not tied to
 * one socket, are limited in PostgreSQL instead.
 *
 * Bounded by construction: one small object per socket, gone with it (rule 36).
 */

/**
 * @param {{ capacity: number, refillPerSecond: number, now?: () => number }} options
 * @returns {{ take(): boolean }}
 */
function createTokenBucket({ capacity, refillPerSecond, now = () => Date.now() }) {
  if (!(capacity > 0) || !(refillPerSecond > 0)) {
    throw new TypeError("A token bucket needs a positive capacity and refill rate.");
  }

  let tokens = capacity;
  let updatedAt = now();

  return {
    /** Spend one token if there is one. False means over the limit: refuse the action. */
    take() {
      const current = now();
      tokens = Math.min(capacity, tokens + ((current - updatedAt) / 1000) * refillPerSecond);
      updatedAt = current;

      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

module.exports = {
  createTokenBucket,
};
