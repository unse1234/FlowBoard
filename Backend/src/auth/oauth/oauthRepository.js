/**
 * Every statement that touches `auth_identities` and `oauth_states`
 * (migration 0009). Parameterised without exception (rule 17).
 */

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

function createOAuthRepository({ database }) {
  return {
    /** Remember a sign-in in progress until the provider sends the browser back. */
    async saveState({ stateHash, browserHash, provider, intent, codeVerifier, nonce, userId = null, sessionId = null, ttlSeconds }) {
      await database.query(
        `INSERT INTO oauth_states
           (state_hash, browser_hash, provider, intent, code_verifier, nonce, user_id, session_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(secs => $9))`,
        [stateHash, browserHash, provider, intent, codeVerifier, nonce, userId, sessionId, ttlSeconds],
      );
    },

    /**
     * Use a sign-in in progress: delete it and return it, if it had not yet
     * expired. Deleting is the claim, so a state works exactly once.
     */
    async takeState(stateHash) {
      const { rows } = await database.query(
        `DELETE FROM oauth_states WHERE state_hash = $1
         RETURNING browser_hash, provider, intent, code_verifier, nonce, user_id, session_id,
                   expires_at > now() AS live`,
        [stateHash],
      );
      const row = rows[0];
      if (!row?.live) return null;
      return {
        browserHash: row.browser_hash,
        provider: row.provider,
        intent: row.intent,
        codeVerifier: row.code_verifier,
        nonce: row.nonce,
        userId: row.user_id,
        sessionId: row.session_id,
      };
    },

    /** Forget sign-ins that were started and never finished. Bounded per call. */
    async sweepStates() {
      await database.query(
        `DELETE FROM oauth_states WHERE state_hash IN (
           SELECT state_hash FROM oauth_states WHERE expires_at < now() LIMIT 500
         )`,
      );
    },

    /** The account an identity belongs to, by the provider's stable id only. */
    async findIdentity({ provider, tenantId, subject }) {
      const { rows } = await database.query(
        `SELECT id, user_id FROM auth_identities
         WHERE provider = $1 AND provider_tenant_id = $2 AND provider_user_id = $3`,
        [provider, tenantId, subject],
      );
      return rows[0] ? { id: rows[0].id, userId: rows[0].user_id } : null;
    },

    async listIdentities(userId, runner = database) {
      const { rows } = await runner.query(
        `SELECT id, provider, email_at_link, created_at, last_used_at
         FROM auth_identities WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      return rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        email: row.email_at_link,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
      }));
    },

    /**
     * Link an identity to an account.
     *
     * @returns {Promise<{ id: string } | { conflict: "identity" | "provider" }>}
     *   `identity`: already linked to an account (this one or another);
     *   `provider`: this account already has one from that provider
     */
    async createIdentity({ userId, provider, tenantId, subject, email }, runner = database) {
      try {
        const { rows } = await runner.query(
          `INSERT INTO auth_identities (user_id, provider, provider_tenant_id, provider_user_id, email_at_link)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [userId, provider, tenantId, subject, email ? email.slice(0, 320) : null],
        );
        return { id: rows[0].id };
      } catch (error) {
        if (error?.code !== UNIQUE_VIOLATION) throw error;
        return { conflict: error.constraint === "auth_identities_user_provider_key" ? "provider" : "identity" };
      }
    },

    async touchIdentity(identityId) {
      await database.query("UPDATE auth_identities SET last_used_at = now() WHERE id = $1", [identityId]);
    },

    /**
     * Disconnect a provider, but never the account's last way in: only if
     * the account has a password or another identity.
     *
     * The account row is locked first, so two disconnects at once queue: each
     * sees the other's result, and they cannot both remove "the other one".
     *
     * @returns {Promise<{ removed: { id: string, provider: string } } | { refused: "last-method" } | { refused: "not-found" }>}
     */
    async removeIdentity({ userId, identityId }) {
      return database.transaction(async (tx) => {
        const { rows: users } = await tx.query(
          "SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1 FOR UPDATE",
          [userId],
        );
        const { rows: identities } = await tx.query("SELECT id, provider FROM auth_identities WHERE user_id = $1", [userId]);

        const target = identities.find((identity) => identity.id === identityId);
        if (!users[0] || !target) return { refused: "not-found" };
        if (!users[0].has_password && identities.length < 2) return { refused: "last-method" };

        await tx.query("DELETE FROM auth_identities WHERE id = $1", [identityId]);
        return { removed: { id: target.id, provider: target.provider } };
      });
    },
  };
}

module.exports = {
  createOAuthRepository,
};
