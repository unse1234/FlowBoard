/**
 * Every statement that touches `auth_sessions` and `refresh_tokens`.
 *
 * One session is one sign-in: the token "family" of ADR 0002, made a row of its
 * own so that revoking it cannot race a rotation (AUTH_DECISIONS.md E-13).
 * Queries are parameterised without exception (ENGINEERING_RULES.md rule 17).
 *
 * Times come from the database clock, `now()`, never from the application's.
 * Every instance then agrees on when a token expires, however far their own
 * clocks have drifted.
 */

const { toUser } = require("./userRepository");

/**
 * What exchanging a refresh token can come to.
 *
 * Only ROTATED continues. The router gives the same answer to every other
 * outcome except ACCOUNT_UNAVAILABLE, so a caller cannot tell a stolen token
 * that was noticed from one that simply expired.
 */
const ROTATION = Object.freeze({
  ROTATED: "rotated",
  UNKNOWN: "unknown",
  REVOKED: "revoked",
  REUSE_DETECTED: "reuse_detected",
  EXPIRED: "expired",
  ACCOUNT_GONE: "account_gone",
  ACCOUNT_UNAVAILABLE: "account_unavailable",
});

function createSessionRepository({ database }) {
  return {
    /**
     * Start a session with its first refresh token, as one unit.
     *
     * The token's idle expiry is capped by the session's absolute one, so a
     * token can never outlive the sign-in it belongs to.
     *
     * @param {Object} session
     * @param {string} session.userId
     * @param {Buffer} session.tokenHash
     * @param {number} session.sessionTtlSeconds
     * @param {number} session.idleTtlSeconds
     * @param {string | null} session.userAgent
     * @param {string | null} session.ipAddress
     * @returns {Promise<{ sessionId: string, sessionExpiresAt: Date, tokenExpiresAt: Date }>}
     */
    async createSession({ userId, tokenHash, sessionTtlSeconds, idleTtlSeconds, userAgent, ipAddress }) {
      return database.transaction(async (tx) => {
        const { rows: sessions } = await tx.query(
          `INSERT INTO auth_sessions (user_id, expires_at, user_agent, ip_address)
           VALUES ($1, now() + make_interval(secs => $2), $3, $4)
           RETURNING id, expires_at`,
          [userId, sessionTtlSeconds, userAgent, ipAddress],
        );
        const session = sessions[0];

        const { rows: tokens } = await tx.query(
          `INSERT INTO refresh_tokens (session_id, token_hash, expires_at)
           VALUES ($1, $2, LEAST(now() + make_interval(secs => $3), $4))
           RETURNING expires_at`,
          [session.id, tokenHash, idleTtlSeconds, session.expires_at],
        );

        return {
          sessionId: session.id,
          sessionExpiresAt: session.expires_at,
          tokenExpiresAt: tokens[0].expires_at,
        };
      });
    },

    /**
     * Exchange a refresh token for its successor, or refuse to.
     *
     * The session row is locked first and the token read afterwards, in a
     * separate statement. The order is the concurrency safety ADR 0002 asks
     * for. Two refreshes of one token queue on the lock. Because the token is
     * read only once the lock is held, the second sees the first one's
     * consumed_at. Had the token been read in the locking statement,
     * PostgreSQL would re-check only the locked row after the wait, and the
     * second refresh would find the token still unused and rotate it again.
     *
     * A token already consumed, presented again:
     * - within the grace window, is taken as a race between tabs or a retried
     *   request, and gets a successor of its own;
     * - after it, means a copy exists that should not. The session is revoked,
     *   which ends every token in it, including successors issued after this
     *   one (E-13).
     *
     * @param {Object} rotation
     * @param {Buffer} rotation.tokenHash      digest of the token presented
     * @param {Buffer} rotation.successorHash  digest of the token to issue
     * @param {number} rotation.idleTtlSeconds
     * @param {number} rotation.reuseGraceSeconds
     */
    async rotateRefreshToken({ tokenHash, successorHash, idleTtlSeconds, reuseGraceSeconds }) {
      return database.transaction(async (tx) => {
        // FOR UPDATE OF s: the session is the lock. The user row is only read,
        // and without password_hash, which a refresh never needs.
        const { rows: sessions } = await tx.query(
          `SELECT s.id              AS session_id,
                  s.revoked_at IS NOT NULL AS revoked,
                  s.expires_at      AS session_expires_at,
                  s.expires_at <= now() AS session_expired,
                  u.id, u.email, u.display_name, u.token_version,
                  u.email_verified_at, u.status, u.deleted_at
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.id = (SELECT session_id FROM refresh_tokens WHERE token_hash = $1)
           FOR UPDATE OF s`,
          [tokenHash],
        );

        if (sessions.length === 0) return { outcome: ROTATION.UNKNOWN };

        const session = sessions[0];
        const context = { sessionId: session.session_id, userId: session.id };

        if (session.revoked) return { outcome: ROTATION.REVOKED, ...context };

        // now(), not clock_timestamp(): the window measures when this request
        // arrived, which is when its transaction began, not how long it then
        // waited behind another rotation's lock. Measured from the lock, a
        // slow transaction ahead in the queue would turn two legitimate tabs
        // into "theft" and sign their owner out. A request that began before
        // the token was consumed is a race by definition, and is treated as one.
        const { rows: tokens } = await tx.query(
          `SELECT id,
                  consumed_at IS NOT NULL AS consumed,
                  consumed_at > now() - make_interval(secs => $2) AS within_grace,
                  expires_at <= now() AS expired
           FROM refresh_tokens
           WHERE token_hash = $1`,
          [tokenHash, reuseGraceSeconds],
        );
        const token = tokens[0];

        if (token.consumed && !token.within_grace) {
          await tx.query(
            `UPDATE auth_sessions
             SET revoked_at = now(), revoked_reason = 'reuse_detected'
             WHERE id = $1`,
            [session.session_id],
          );
          return { outcome: ROTATION.REUSE_DETECTED, ...context };
        }

        if (session.session_expired || token.expired) return { outcome: ROTATION.EXPIRED, ...context };

        // Soft-deleted: treated as gone. Deleting an account revokes its
        // sessions in Phase 6; this holds until then, and after.
        if (session.deleted_at) return { outcome: ROTATION.ACCOUNT_GONE, ...context };
        if (session.status !== "active") return { outcome: ROTATION.ACCOUNT_UNAVAILABLE, ...context };

        if (!token.consumed) {
          await tx.query("UPDATE refresh_tokens SET consumed_at = now() WHERE id = $1", [token.id]);
        }

        const { rows: successors } = await tx.query(
          `INSERT INTO refresh_tokens (session_id, token_hash, expires_at)
           VALUES ($1, $2, LEAST(now() + make_interval(secs => $3), $4))
           RETURNING expires_at`,
          [session.session_id, successorHash, idleTtlSeconds, session.session_expires_at],
        );

        await tx.query("UPDATE auth_sessions SET last_used_at = now() WHERE id = $1", [
          session.session_id,
        ]);

        return {
          outcome: ROTATION.ROTATED,
          ...context,
          user: toUser(session),
          tokenExpiresAt: successors[0].expires_at,
          // For the log: a grace-window replay is worth seeing if it is frequent.
          withinGrace: token.consumed,
        };
      });
    },

    /**
     * The account behind an access token, checked against the database.
     *
     * For the routes that must not outlive a sign-out. Answers null unless the
     * session is live and belongs to this user, and the account still exists.
     * The caller compares `tokenVersion` and `status`.
     *
     * @param {{ userId: string, sessionId: string }} claims
     */
    async findSessionUser({ userId, sessionId }) {
      const { rows } = await database.query(
        `SELECT u.id, u.email, u.display_name, u.token_version, u.email_verified_at, u.status
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1
           AND s.user_id = $2
           AND s.revoked_at IS NULL
           AND s.expires_at > now()
           AND u.deleted_at IS NULL`,
        [sessionId, userId],
      );

      return rows.length === 0 ? null : toUser(rows[0]);
    },

    /**
     * A user's live sessions, most recently used first (chunk 3.2).
     *
     * @param {string} userId
     */
    async listLiveSessions(userId) {
      const { rows } = await database.query(
        `SELECT id, created_at, last_used_at, expires_at, user_agent, ip_address
         FROM auth_sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY last_used_at DESC`,
        [userId],
      );

      return rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
        userAgent: row.user_agent,
        ipAddress: row.ip_address,
      }));
    },

    /**
     * End one live session, if and only if it belongs to this user.
     *
     * Scoped by user in the statement itself, so there is no check-then-act
     * gap, and another user's session id matches nothing.
     *
     * @returns {Promise<boolean>} whether a session was ended
     */
    async revokeUserSession({ userId, sessionId, reason }) {
      const { rowCount } = await database.query(
        `UPDATE auth_sessions
         SET revoked_at = now(), revoked_reason = $3
         WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
        [userId, sessionId, reason],
      );
      return rowCount === 1;
    },

    /**
     * End every live session of this user except one: "sign out everywhere
     * else".
     *
     * @returns {Promise<number>} sessions ended
     */
    async revokeOtherSessions({ userId, keepSessionId, reason }) {
      const { rowCount } = await database.query(
        `UPDATE auth_sessions
         SET revoked_at = now(), revoked_reason = $3
         WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL AND expires_at > now()`,
        [userId, keepSessionId, reason],
      );
      return rowCount;
    },

    /**
     * Delete sessions that died (revoked or expired) more than
     * `retentionSeconds` ago, their refresh tokens cascading with them
     * (chunk 3.1). The retention keeps a revoked session, a detected theft
     * especially, long enough to be looked into.
     *
     * Bounded per call, so a large backlog is worked through in small steps
     * rather than one long-running statement.
     *
     * @param {{ retentionSeconds: number, limit?: number }} purge
     * @returns {Promise<number>} sessions deleted
     */
    async purgeDeadSessions({ retentionSeconds, limit = 500 }) {
      const { rowCount } = await database.query(
        `DELETE FROM auth_sessions
         WHERE id IN (
           SELECT id FROM auth_sessions
           WHERE revoked_at < now() - make_interval(secs => $1)
              OR expires_at < now() - make_interval(secs => $1)
           LIMIT $2
         )`,
        [retentionSeconds, limit],
      );
      return rowCount;
    },

    /**
     * End the session a refresh token belongs to.
     *
     * Any token of the session will do, spent or not: whoever holds one can
     * end it, and ending a session is never something a thief gains from.
     * A session already revoked is left as it is, so its first reason stands.
     * A logout arriving after a reuse detection must not relabel the theft as
     * an ordinary sign-out.
     *
     * @param {{ tokenHash: Buffer, reason: string }} revocation
     * @returns {Promise<{ revoked: boolean, sessionId: string | null }>}
     */
    async revokeSessionByToken({ tokenHash, reason }) {
      const { rows } = await database.query(
        `UPDATE auth_sessions
         SET revoked_at = now(), revoked_reason = $2
         WHERE id = (SELECT session_id FROM refresh_tokens WHERE token_hash = $1)
           AND revoked_at IS NULL
         RETURNING id`,
        [tokenHash, reason],
      );

      return { revoked: rows.length === 1, sessionId: rows[0]?.id ?? null };
    },
  };
}

module.exports = {
  ROTATION,
  createSessionRepository,
};
