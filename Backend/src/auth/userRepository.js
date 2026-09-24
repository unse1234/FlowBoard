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
    async createUser({ email, emailNormalized, displayName, passwordHash }) {
      const { rows } = await database.query(
        `INSERT INTO users (email, email_normalized, display_name, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email_normalized) WHERE deleted_at IS NULL DO NOTHING
         RETURNING id, created_at`,
        [email, emailNormalized, displayName, passwordHash],
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
        `SELECT id, email, display_name, password_hash, token_version,
                email_verified_at, status
         FROM users
         WHERE email_normalized = $1 AND deleted_at IS NULL`,
        [emailNormalized],
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
  };
}

/** A row as the rest of the application sees it. */
function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
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
