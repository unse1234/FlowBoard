/**
 * Every statement that touches `users`.
 *
 * Kept out of the routes so the SQL is in one place and each query can be read
 * against the schema and its indexes. Queries are parameterised without
 * exception (ENGINEERING_RULES.md rule 17).
 *
 * Every lookup includes `deleted_at IS NULL`, both because a soft-deleted
 * account must not be found and because the unique index is partial on exactly
 * that predicate — omitting it would silently stop the index being used.
 */

/** Postgres unique-violation. Kept as a named constant so its use reads clearly. */
const UNIQUE_VIOLATION = "23505";

function createUserRepository({ database }) {
  return {
    /**
     * Create an account, unless the address already has one.
     *
     * `ON CONFLICT DO NOTHING` rather than a prior existence check: two signups
     * for the same address arriving together would both pass a check and one
     * would then fail on the insert. Letting the database decide makes the race
     * impossible, and makes both outcomes look the same to the caller — which
     * is what signup needs (AUTH_DECISIONS.md E-12).
     *
     * @returns {Promise<{ created: boolean, user: { id: string } | null }>}
     */
    async createUser({ email, emailNormalized, displayName, passwordHash, emailVerified = false }, runner = database) {
      const { rows } = await runner.query(
        `INSERT INTO users (email, email_normalized, display_name, password_hash, email_verified_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END)
         ON CONFLICT (email_normalized) WHERE deleted_at IS NULL DO NOTHING
         RETURNING id, created_at`,
        [email, emailNormalized, displayName, passwordHash, emailVerified],
      );

      if (rows.length === 0) return { created: false, user: null };

      return { created: true, user: { id: rows[0].id, createdAt: rows[0].created_at } };
    },

    /**
     * The row a sign-in needs, or null.
     *
     * Returns `password_hash` and `token_version`, so the caller can verify and
     * then issue a token without a second query.
     *
     * @param {string} emailNormalized
     */
    async findByNormalizedEmail(emailNormalized) {
      const { rows } = await database.query(
        `SELECT id, email, email_normalized, display_name, password_hash, token_version,
                email_verified_at, status
         FROM users
         WHERE email_normalized = $1 AND deleted_at IS NULL`,
        [emailNormalized],
      );

      return rows.length === 0 ? null : toUser(rows[0]);
    },

    /**
     * An account by id, with its password hash, for the settings routes that
     * check the current password. Null for an unknown or deleted account.
     *
     * @param {string} userId
     */
    async findById(userId) {
      const { rows } = await database.query(
        `SELECT id, email, email_normalized, display_name, password_hash, token_version,
                email_verified_at, status
         FROM users
         WHERE id = $1 AND deleted_at IS NULL`,
        [userId],
      );

      return rows.length === 0 ? null : toUser(rows[0]);
    },

    /**
     * Change the name shown to collaborators. Nothing else about the account.
     *
     * @returns {Promise<Object | null>} the updated user
     */
    async updateDisplayName({ userId, displayName }) {
      const { rows } = await database.query(
        `UPDATE users SET display_name = $2
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, email, email_normalized, display_name, token_version, email_verified_at, status,
                   password_hash IS NOT NULL AS has_password`,
        [userId, displayName],
      );

      return rows.length === 0 ? null : toUser(rows[0]);
    },

    /**
     * Replace a stored hash, for a login that found the hash was made with
     * weaker parameters than are now configured.
     *
     * Scoped by id and by the hash that was just verified, so a concurrent
     * password change cannot be overwritten by this upgrade.
     *
     * @returns {Promise<boolean>} whether the row was still the one verified
     */
    async upgradePasswordHash({ userId, expectedHash, passwordHash }) {
      const { rowCount } = await database.query(
        `UPDATE users
         SET password_hash = $3
         WHERE id = $1 AND password_hash = $2 AND deleted_at IS NULL`,
        [userId, expectedHash, passwordHash],
      );

      return rowCount === 1;
    },

    /**
     * Record that the address was proven, if the account still has the
     * address the link was sent to. Verifying twice keeps the first time.
     *
     * @returns {Promise<boolean>} whether the account matched
     */
    async markEmailVerified({ userId, emailNormalized }, runner = database) {
      const { rowCount } = await runner.query(
        `UPDATE users
         SET email_verified_at = COALESCE(email_verified_at, now())
         WHERE id = $1 AND email_normalized = $2 AND deleted_at IS NULL`,
        [userId, emailNormalized],
      );
      return rowCount === 1;
    },

    /**
     * Replace the password and move `token_version` on, which invalidates
     * every access token issued before (ADR 0002). For a reset, and for a
     * change or first password set from account settings.
     *
     * `verifiedEmail` names the address a reset link was delivered to: using
     * the link proves the address, so an unverified one becomes verified. The
     * update then also requires the account to still have that address.
     *
     * `expectedHash` (settings) is the hash the caller just verified, or null
     * for an account that had none. The update then only applies if nothing
     * changed it in between, so two changes racing cannot silently overwrite
     * each other. Undefined skips the check (a reset proves the address, not
     * the old password).
     *
     * @returns {Promise<Object | null>} the updated user, or null if no account matched
     */
    async replacePassword({ userId, passwordHash, verifiedEmail = null, expectedHash }, runner = database) {
      const checkExpected = expectedHash !== undefined;
      const { rows } = await runner.query(
        `UPDATE users
         SET password_hash = $2,
             token_version = token_version + 1,
             email_verified_at = CASE WHEN $3::text IS NULL THEN email_verified_at
                                      ELSE COALESCE(email_verified_at, now()) END
         WHERE id = $1
           AND deleted_at IS NULL
           AND ($3::text IS NULL OR email_normalized = $3)
           AND (NOT $4::boolean OR password_hash IS NOT DISTINCT FROM $5)
         RETURNING id, email, email_normalized, display_name, password_hash, token_version,
                   email_verified_at, status`,
        [userId, passwordHash, verifiedEmail, checkExpected, checkExpected ? expectedHash : null],
      );
      return rows.length === 0 ? null : toUser(rows[0]);
    },
  };
}

/** A row as the rest of the application sees it. */
function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    // Whether the account can sign in with a password, for queries that
    // deliberately do not select the hash itself.
    hasPassword: row.has_password ?? (row.password_hash === undefined ? undefined : row.password_hash !== null),
    tokenVersion: row.token_version,
    emailVerifiedAt: row.email_verified_at,
    status: row.status,
  };
}

module.exports = {
  UNIQUE_VIOLATION,
  createUserRepository,
  toUser,
};
