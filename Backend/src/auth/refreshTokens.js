const { createHash, randomBytes } = require("node:crypto");

/**
 * Refresh tokens: opaque, random, and stored only as a hash (ADR 0002).
 *
 * The token is 32 random bytes, sent as 43 characters of base64url. There is
 * nothing in it to parse or trust. It is looked up by its SHA-256 digest, and a
 * copy of the database therefore signs nobody in. SHA-256 rather than a
 * password hash is deliberate: 256 random bits cannot be guessed, and the
 * lookup has to be an exact match on an index.
 */

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** @returns {{ token: string, hash: Buffer }} */
function generateRefreshToken() {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

/** The digest stored in, and looked up from, refresh_tokens.token_hash. */
function hashRefreshToken(token) {
  return createHash("sha256").update(token, "ascii").digest();
}

/**
 * The HttpOnly cookie that carries the refresh token.
 *
 * Every attribute is decided once, here, from configuration. Setting and
 * clearing must name the same path, SameSite and Secure, or a browser treats
 * them as different cookies and "signing out" leaves the real one in place.
 *
 * @param {{ name: string, secure: boolean, sameSite: "strict" | "lax" | "none", path: string }} settings
 */
function createRefreshCookie({ name, secure, sameSite, path }) {
  const attributes = { httpOnly: true, secure, sameSite, path };

  return {
    name,

    /**
     * The refresh token the request carries, or null.
     *
     * Null for a value that is not shaped like one of ours, so nothing
     * malformed ever reaches a query. Null too when the cookie appears more
     * than once. A browser sends two same-named cookies only when one was set
     * by someone else, for example a sibling subdomain planting its own token
     * to sign the victim into the attacker's account. Guessing which one is
     * genuine is exactly the mistake that attack relies on.
     *
     * @param {import("express").Request} request
     * @returns {string | null}
     */
    read(request) {
      const values = readCookieValues(request.headers.cookie, name);
      if (values.length !== 1) return null;

      return REFRESH_TOKEN_PATTERN.test(values[0]) ? values[0] : null;
    },

    /**
     * @param {import("express").Response} response
     * @param {string} token
     * @param {Date} expiresAt  when the token itself stops being accepted
     */
    set(response, token, expiresAt) {
      response.cookie(name, token, {
        ...attributes,
        // Max-Age, relative to now, rather than Expires: a client with a wrong
        // clock still keeps the cookie exactly as long as the token lives.
        maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
      });
    },

    /** @param {import("express").Response} response */
    clear(response) {
      response.clearCookie(name, attributes);
    },
  };
}

/**
 * Every value sent for one cookie name.
 *
 * Deliberately minimal: FlowBoard reads one cookie, whose values are
 * base64url and need no decoding, so a general parser, or a dependency for
 * one, would only add surface.
 */
function readCookieValues(header, name) {
  if (typeof header !== "string" || header.length === 0) return [];

  const values = [];
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) values.push(pair.slice(separator + 1).trim());
  }

  return values;
}

module.exports = {
  REFRESH_TOKEN_PATTERN,
  createRefreshCookie,
  generateRefreshToken,
  hashRefreshToken,
};
