const { createHash } = require("node:crypto");

/**
 * A fixed-window rate limit whose counters live in PostgreSQL (chunk 7.2).
 *
 * Correct across instances: each request is one atomic upsert against a row
 * shared by every process, so ten instances allow the configured limit, not
 * ten times it. In-memory limits (`Backend/src/ai/rateLimiter.js`) do not have
 * this property. AUTH_DECISIONS.md E-17 and ADR 0006 record why PostgreSQL
 * rather than Redis.
 *
 * A fixed window lets a burst of up to twice the limit straddle a boundary.
 * At sign-in limits of a handful a minute, that costs nothing worth the
 * complexity of a sliding window.
 *
 * Times come from the database clock, so every instance agrees on where a
 * window begins.
 */

/** Sweep expired rows once every this many requests, per process. */
const DEFAULT_SWEEP_EVERY = 500;

/** Rows swept at a time, so a sweep never becomes a long-running statement. */
const SWEEP_BATCH = 1_000;

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * @param {Object} options
 * @param {{ query: Function }} options.database
 * @param {string} options.name  namespaces the buckets: "sign-in", "refresh", ...
 * @param {number} options.limit  requests allowed per window, per key
 * @param {number} [options.windowSeconds]
 * @param {number} [options.sweepEvery]
 * @param {Pick<Console, "warn">} [options.logger]
 */
function createPostgresRateLimiter({
  database,
  name,
  limit,
  windowSeconds = 60,
  sweepEvery = DEFAULT_SWEEP_EVERY,
  logger = console,
}) {
  if (!NAME_PATTERN.test(name)) throw new TypeError(`Invalid rate limit name "${name}".`);
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer.");
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new TypeError("windowSeconds must be a positive integer.");
  }

  let requestsSinceSweep = 0;

  function sweep() {
    database
      .query(
        `DELETE FROM rate_limit_counters
         WHERE ctid IN (
           SELECT ctid FROM rate_limit_counters WHERE expires_at < now() LIMIT $1
         )`,
        [SWEEP_BATCH],
      )
      .catch((error) => {
        // Housekeeping. A failed sweep leaves rows for the next one; it must
        // never fail the request that happened to trigger it.
        logger.warn?.("[rate-limit] Sweep failed.", { message: error?.message });
      });
  }

  return {
    name,
    limit,

    /**
     * Count one request against `key`.
     *
     * The count goes up whether or not the request is allowed, so hammering
     * past the limit keeps the window full rather than draining it.
     *
     * @param {string} key  an address, an account id, ...
     * @returns {Promise<{ allowed: boolean, remaining: number, retryAfterSeconds: number }>}
     */
    async consume(key) {
      const bucket = `${name}:${createHash("sha256").update(String(key), "utf8").digest("hex")}`;

      const { rows } = await database.query(
        `WITH window_bounds AS (
           SELECT to_timestamp(floor(extract(epoch FROM now()) / $2) * $2) AS start
         )
         INSERT INTO rate_limit_counters (bucket, window_start, hits, expires_at)
         SELECT $1, start, 1, start + make_interval(secs => $2) FROM window_bounds
         ON CONFLICT (bucket, window_start)
           DO UPDATE SET hits = rate_limit_counters.hits + 1
         RETURNING hits,
                   GREATEST(1, ceil(extract(epoch FROM (expires_at - now()))))::int AS retry_after`,
        [bucket, windowSeconds],
      );

      requestsSinceSweep += 1;
      if (requestsSinceSweep >= sweepEvery) {
        requestsSinceSweep = 0;
        sweep();
      }

      const { hits, retry_after: retryAfterSeconds } = rows[0];
      return {
        allowed: hits <= limit,
        remaining: Math.max(0, limit - hits),
        retryAfterSeconds,
      };
    },
  };
}

module.exports = {
  createPostgresRateLimiter,
};
