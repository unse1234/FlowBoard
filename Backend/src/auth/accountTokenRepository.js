/**
 * Every statement that touches `account_tokens` (migration 0006): the
 * single-use tokens behind "confirm your email" and "reset your password".
 *
 * Each function takes an optional query runner, so a caller can make a token
 * change part of a larger transaction: a reset consumes its token and replaces
 * the password in one commit, or neither happens.
 */

/** What a token is for, and how long its link works. */
const ACCOUNT_TOKEN = Object.freeze({
  VERIFY_EMAIL: Object.freeze({ purpose: "verify_email", ttlSeconds: 24 * 60 * 60 }),
  RESET_PASSWORD: Object.freeze({ purpose: "reset_password", ttlSeconds: 30 * 60 }),
});

function createAccountTokenRepository({ database }) {
  return {
    /**
     * Store a new token for this account and purpose, replacing any earlier
     * one. The replaced link stops working in the same statement.
     *
     * @param {{ userId: string, kind: typeof ACCOUNT_TOKEN.VERIFY_EMAIL, tokenHash: Buffer, emailNormalized: string }} token
     */
    async issue({ userId, kind, tokenHash, emailNormalized }, runner = database) {
      await runner.query(
        `INSERT INTO account_tokens (user_id, purpose, token_hash, email_normalized, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))
         ON CONFLICT (user_id, purpose) DO UPDATE
           SET token_hash = EXCLUDED.token_hash,
               email_normalized = EXCLUDED.email_normalized,
               created_at = now(),
               expires_at = EXCLUDED.expires_at`,
        [userId, kind.purpose, tokenHash, emailNormalized, kind.ttlSeconds],
      );
    },

    /**
     * Use a token: delete it and say whose it was, if it was still live.
     *
     * The delete is the claim. Of two requests presenting one token, exactly
     * one deletes the row, so a token works once however requests race. An
     * expired token is deleted too, since it can never work again.
     *
     * @returns {Promise<{ userId: string, emailNormalized: string } | null>}
     *   null for a token that is unknown, already used, expired, or for
     *   another purpose; the caller answers all four the same way
     */
    async consume({ kind, tokenHash }, runner = database) {
      const { rows } = await runner.query(
        `DELETE FROM account_tokens
         WHERE token_hash = $1 AND purpose = $2
         RETURNING user_id, email_normalized, expires_at > now() AS live`,
        [tokenHash, kind.purpose],
      );

      const row = rows[0];
      return row?.live ? { userId: row.user_id, emailNormalized: row.email_normalized } : null;
    },

    /** Void any outstanding token of this purpose, such as a reset link once the password has changed. */
    async discard({ userId, kind }, runner = database) {
      await runner.query("DELETE FROM account_tokens WHERE user_id = $1 AND purpose = $2", [
        userId,
        kind.purpose,
      ]);
    },
  };
}

module.exports = {
  ACCOUNT_TOKEN,
  createAccountTokenRepository,
};
