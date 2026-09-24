const { createHash } = require("node:crypto");

/**
 * Per-account sign-in backoff (chunk 7.4).
 *
 * Counts consecutive failed sign-ins against each submitted address. From
 * the THRESHOLD-th failure on, the next attempt is refused unchecked until a
 * delay has passed: BASE seconds, doubling per further failure, never above
 * CAP. A success clears the record, and a day without failures forgets it.
 *
 * Backoff, not lockout. An attacker who knows someone's address can keep that
 * account in backoff by failing on purpose, which is the price of any
 * per-account defence. The cap bounds it: the owner waits at most CAP between
 * attempts, where a lockout would shut them out entirely. When Turnstile
 * guards sign-in (E-18), a challenge can replace the wait.
 *
 * **Keyed on the address, never on the account.** An unknown address is
 * counted and throttled exactly like a registered one, so the throttle cannot
 * be asked whether an address is registered (AUTH_DECISIONS.md E-12).
 *
 * All times come from the database clock.
 */

const DEFAULTS = Object.freeze({
  threshold: 5,
  baseSeconds: 60,
  capSeconds: 15 * 60,
  // Failures further apart than this do not add up.
  decaySeconds: 24 * 60 * 60,
  sweepEvery: 500,
});

const keyFor = (emailNormalized) => createHash("sha256").update(emailNormalized, "utf8").digest("hex");

/**
 * @param {Object} options
 * @param {{ query: Function }} options.database
 * @param {Partial<typeof DEFAULTS>} [options.policy]
 * @param {Pick<Console, "warn">} [options.logger]
 */
function createLoginThrottle({ database, policy = {}, logger = console }) {
  const { threshold, baseSeconds, capSeconds, decaySeconds, sweepEvery } = { ...DEFAULTS, ...policy };
  let writesSinceSweep = 0;

  function maybeSweep() {
    writesSinceSweep += 1;
    if (writesSinceSweep < sweepEvery) return;
    writesSinceSweep = 0;

    database
      .query(
        `DELETE FROM login_throttles
         WHERE ctid IN (
           SELECT ctid FROM login_throttles
           WHERE last_failure_at < now() - make_interval(secs => $1)
             AND (blocked_until IS NULL OR blocked_until < now())
           LIMIT 1000
         )`,
        [decaySeconds],
      )
      .catch((error) => {
        // Housekeeping. It must never fail the sign-in that triggered it.
        logger.warn?.("[auth] Login throttle sweep failed.", { message: error?.message });
      });
  }

  return {
    policy: Object.freeze({ threshold, baseSeconds, capSeconds, decaySeconds }),

    /**
     * Whether an attempt against this address must wait, and for how long.
     * Checked before any password work, so a throttled guess costs nothing.
     *
     * @param {string} emailNormalized
     * @returns {Promise<{ blocked: boolean, retryAfterSeconds: number }>}
     */
    async check(emailNormalized) {
      const { rows } = await database.query(
        `SELECT GREATEST(1, ceil(extract(epoch FROM (blocked_until - now()))))::int AS wait
         FROM login_throttles
         WHERE account_key = $1 AND blocked_until > now()`,
        [keyFor(emailNormalized)],
      );

      return rows.length === 0
        ? { blocked: false, retryAfterSeconds: 0 }
        : { blocked: true, retryAfterSeconds: rows[0].wait };
    },

    /**
     * Count a failed attempt, and set the wait once the threshold is reached.
     *
     * The count is one atomic upsert, so concurrent failures all count. The
     * wait is then derived from the row's current count, not from what this
     * request saw, so two failures landing together still leave the wait that
     * matches the total.
     *
     * @param {string} emailNormalized
     */
    async recordFailure(emailNormalized) {
      const accountKey = keyFor(emailNormalized);

      await database.query(
        `INSERT INTO login_throttles AS t (account_key, failures, last_failure_at)
         VALUES ($1, 1, now())
         ON CONFLICT (account_key) DO UPDATE SET
           failures = CASE
             -- A long quiet spell starts the count again.
             WHEN t.last_failure_at < now() - make_interval(secs => $2) THEN 1
             ELSE t.failures + 1
           END,
           last_failure_at = now()`,
        [accountKey, decaySeconds],
      );

      await database.query(
        `UPDATE login_throttles
         SET blocked_until = now() + make_interval(secs => LEAST($2, $3 * power(2, failures - $4)))
         WHERE account_key = $1 AND failures >= $4`,
        [accountKey, capSeconds, baseSeconds, threshold],
      );

      maybeSweep();
    },

    /** A correct password: the address starts clean. */
    async recordSuccess(emailNormalized) {
      await database.query("DELETE FROM login_throttles WHERE account_key = $1", [keyFor(emailNormalized)]);
    },
  };
}

module.exports = {
  LOGIN_THROTTLE_DEFAULTS: DEFAULTS,
  createLoginThrottle,
};
