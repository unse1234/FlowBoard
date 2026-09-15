const MAX_TRACKED_CLIENTS = 10_000;

/**
 * A fixed-window request limit per client, held in memory.
 *
 * The AI endpoint has no sign-in in front of it and every call spends the
 * server's Gemini quota, so one client must not be able to drain it. Behind a
 * reverse proxy every request can appear to come from the proxy; configure
 * Express's "trust proxy" setting for that deployment so request.ip is the
 * real client.
 */
function createRateLimiter({ limit, windowMs = 60_000, now = Date.now }) {
  const windows = new Map();

  return {
    /**
     * Count one request against `key`.
     *
     * @param {string} key
     * @returns {{ allowed: true } | { allowed: false, retryAfterSeconds: number }}
     */
    consume(key) {
      const currentTime = now();
      if (windows.size > MAX_TRACKED_CLIENTS) removeExpired(windows, currentTime);

      let window = windows.get(key);
      if (!window || window.resetAt <= currentTime) {
        window = { count: 0, resetAt: currentTime + windowMs };
        windows.set(key, window);
      }

      if (window.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - currentTime) / 1000)),
        };
      }

      window.count += 1;
      return { allowed: true };
    },
  };
}

function removeExpired(windows, currentTime) {
  for (const [key, window] of windows) {
    if (window.resetAt <= currentTime) windows.delete(key);
  }
}

module.exports = {
  createRateLimiter,
};
