const { AuthError } = require("./authErrors");

/**
 * Authentication for HTTP routes: a verified `request.user`, or a 401.
 *
 * Reads only the `Authorization: Bearer` header. Never a query string, which
 * ends up in logs and browser history. Never the cookie, which would make
 * every protected route a CSRF target (the cookie only ever reaches
 * /api/auth, and only to be exchanged for this token).
 *
 * Verification does no I/O, which is ADR 0002's point: any instance can
 * authenticate any request with a signature check. The price is that a token
 * outlives a sign-out by up to 15 minutes. A route that must not, such as
 * GET /api/auth/me or anything that changes an account, also checks the
 * session and `token_version`, since it reads the user row anyway.
 */

/** RFC 6750 section 2.1. The token itself is checked by accessTokens.verify. */
const BEARER_PATTERN = /^Bearer +([A-Za-z0-9._-]+)$/i;

/** Named in every challenge, so a client can tell which protection space answered. */
const REALM = "flowboard";

/**
 * @param {Object} options
 * @param {ReturnType<typeof import("./accessTokens").createAccessTokens>} options.accessTokens
 * @param {Pick<Console, "warn">} [options.logger]
 * @returns {import("express").RequestHandler}
 */
function createRequireAuth({ accessTokens, logger = console }) {
  return function requireAuth(request, response, next) {
    const header = request.get("authorization");
    const match = typeof header === "string" ? BEARER_PATTERN.exec(header.trim()) : null;

    if (!match) {
      // No credentials at all: RFC 6750 section 3.1 says the challenge
      // carries no error code, so a client can tell "sign in" from
      // "your token is bad".
      challenge(response, null);
      return;
    }

    const result = accessTokens.verify(match[1]);

    if (!result.valid) {
      // An expired token is routine, since the client refreshes and retries.
      // Anything else is worth a line in the log.
      if (result.reason !== "expired") {
        logger.warn?.("[auth] Access token rejected.", { reason: result.reason, path: request.path });
      }
      challenge(response, "invalid_token");
      return;
    }

    // Frozen, so nothing downstream can quietly change who the request is from.
    request.user = Object.freeze({
      id: result.claims.userId,
      sessionId: result.claims.sessionId,
      tokenVersion: result.claims.tokenVersion,
    });

    next();
  };
}

/**
 * The one answer to an unauthenticated request.
 *
 * The body is the same whatever went wrong, so it says nothing about why a
 * token failed. The challenge header carries only what RFC 6750 defines.
 */
function challenge(response, error) {
  setBearerChallenge(response, error);

  const authError = new AuthError("AUTHENTICATION_REQUIRED");
  response.status(authError.status).json(authError.toResponseBody());
}

/**
 * RFC 6750 requires this header on every 401 from a bearer-protected route,
 * including one a route produces itself after the signature checked out.
 *
 * @param {import("express").Response} response
 * @param {"invalid_token" | null} error  null when no credentials were sent
 */
function setBearerChallenge(response, error) {
  const parameters = [`realm="${REALM}"`];
  if (error) parameters.push(`error="${error}"`);

  response.set("WWW-Authenticate", `Bearer ${parameters.join(", ")}`);
}

module.exports = {
  createRequireAuth,
  setBearerChallenge,
};
