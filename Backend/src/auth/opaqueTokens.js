const { createHash, randomBytes } = require("node:crypto");

/**
 * Random tokens that travel in a link or a cookie and are stored only as a
 * SHA-256 digest: email verification, password reset, board invitations, and
 * the OAuth state binding.
 *
 * The same construction as refresh tokens (`refreshTokens.js`): 32 random
 * bytes as 43 characters of base64url, nothing inside to parse or trust.
 * SHA-256 rather than a password hash because 256 random bits cannot be
 * guessed and the lookup must be an exact match on an index.
 */

const OPAQUE_TOKEN_BYTES = 32;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** @returns {{ token: string, hash: Buffer }} */
function generateOpaqueToken() {
  const token = randomBytes(OPAQUE_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashOpaqueToken(token) };
}

/** The digest stored in the database and looked up by. */
function hashOpaqueToken(token) {
  return createHash("sha256").update(token, "ascii").digest();
}

/**
 * Whether a value from a request could be one of these tokens. Anything else
 * is refused before it reaches a query.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
function isOpaqueToken(value) {
  return typeof value === "string" && OPAQUE_TOKEN_PATTERN.test(value);
}

module.exports = {
  generateOpaqueToken,
  hashOpaqueToken,
  isOpaqueToken,
};
