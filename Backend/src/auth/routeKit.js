const { isIP } = require("node:net");
const { rateLimitKeyFor } = require("../http/clientKey");
const { AuthError, toAuthError } = require("./authErrors");
const { setBearerChallenge } = require("./authenticate");
const { generateRefreshToken } = require("./refreshTokens");

/**
 * What every /api/auth route shares: one error envelope, the rate limits, the
 * live-session check, and the one way a response hands out tokens.
 *
 * Moved out of authRouter.js when email, account and OAuth routes arrived, so
 * each of them uses these rather than a copy. A copy of `requireLiveSession`
 * that forgot the token_version check would be a route that outlives a
 * password change.
 */

/** Matches the CHECK on auth_sessions.user_agent. */
const MAX_USER_AGENT_LENGTH = 512;

/**
 * @param {Object} options
 * @param {ReturnType<typeof import("./sessionRepository").createSessionRepository>} options.sessions
 * @param {ReturnType<typeof import("./accessTokens").createAccessTokens>} options.accessTokens
 * @param {ReturnType<typeof import("./refreshTokens").createRefreshCookie>} options.refreshCookie
 * @param {{ idleTtlSeconds: number, sessionTtlSeconds: number }} options.sessionLifetimes
 * @param {Pick<Console, "info" | "warn" | "error">} options.logger
 */
function createRouteKit({ sessions, accessTokens, refreshCookie, sessionLifetimes, logger }) {
  /**
   * Count a request against the client, and refuse it past the limit.
   *
   * @param {{ name: string, consume(key: string): Promise<{ allowed: boolean, retryAfterSeconds: number }> } | null} limiter
   * @param {import("express").Request} request
   * @param {string} [key]  defaults to the client's address
   */
  async function enforceLimit(limiter, request, key = getClientKey(request)) {
    if (!limiter) return;

    const limit = await limiter.consume(key);
    if (!limit.allowed) {
      throw new AuthError("TOO_MANY_ATTEMPTS", {
        retryAfterSeconds: limit.retryAfterSeconds,
        detail: `${limiter.name} limit reached`,
      });
    }
  }

  /**
   * The account behind the access token, checked against the database: its
   * session still live, its token_version current, the account active.
   *
   * For the routes that must not outlive a sign-out. requireAuth alone trusts
   * the signature, which stays valid for up to 15 minutes after one.
   */
  async function requireLiveSession(request) {
    const user = await sessions.findSessionUser({
      userId: request.user.id,
      sessionId: request.user.sessionId,
    });

    if (!user) throw new AuthError("AUTHENTICATION_REQUIRED", { detail: "session ended or account gone" });
    if (user.tokenVersion !== request.user.tokenVersion) {
      throw new AuthError("AUTHENTICATION_REQUIRED", { detail: "stale token_version" });
    }
    if (user.status !== "active") {
      throw new AuthError("ACCOUNT_UNAVAILABLE", { detail: `status ${user.status}` });
    }
    return user;
  }

  /** The one error path for routes behind requireAuth. */
  function sendAuthenticatedRouteError(response, error) {
    const authError = toAuthError(error);
    // A well-signed token that is no longer good gets the same challenge
    // requireAuth sends for a bad one (RFC 6750).
    if (authError.code === "AUTHENTICATION_REQUIRED") setBearerChallenge(response, "invalid_token");
    logFailure(logger, authError);
    sendError(response, authError);
  }

  /** The error path for routes without a bearer token. */
  function sendRouteError(response, error) {
    const authError = toAuthError(error);
    logFailure(logger, authError);
    sendError(response, authError);
  }

  /**
   * Create the session row and its first refresh token, and sign an access
   * token bound to that session.
   */
  async function startSession(user, request) {
    const refresh = generateRefreshToken();

    const { sessionId, tokenExpiresAt } = await sessions.createSession({
      userId: user.id,
      tokenHash: refresh.hash,
      sessionTtlSeconds: sessionLifetimes.sessionTtlSeconds,
      idleTtlSeconds: sessionLifetimes.idleTtlSeconds,
      userAgent: readUserAgent(request),
      ipAddress: readIpAddress(request),
    });

    const access = accessTokens.issue({
      userId: user.id,
      sessionId,
      tokenVersion: user.tokenVersion,
    });

    return {
      sessionId,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: tokenExpiresAt,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
    };
  }

  /**
   * The one way a response hands out tokens: sign-in, refresh, and a
   * password change that re-issues this device's session.
   *
   * `no-store` because a token must not sit in a browser or proxy cache,
   * which RFC 6749 section 5.1 requires of any response carrying one.
   */
  function sendSession(response, user, session) {
    refreshCookie.set(response, session.refreshToken, session.refreshTokenExpiresAt);
    response.set("Cache-Control", "no-store");
    response.json({
      ok: true,
      user: publicUser(user),
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    });
  }

  return {
    enforceLimit,
    requireLiveSession,
    sendAuthenticatedRouteError,
    sendRouteError,
    startSession,
    sendSession,
  };
}

/**
 * The fields a signed-in client may see about itself.
 *
 * Built by naming them rather than by deleting from the row, so a column added
 * later — `password_hash` being the one that matters — is absent by default
 * instead of leaking until someone notices.
 */
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    // Collaboration needs a verified address (D-5, enforced by the board API
    // and the socket gateway). Everything else works without one.
    emailVerified: Boolean(user.emailVerifiedAt),
    // Whether settings offer "change password" (needs the current one) or
    // "set a password" (an account that signs in only through a provider).
    hasPassword: user.hasPassword === true,
  };
}

/**
 * The User-Agent header, for telling sessions apart in Phase 3's list.
 *
 * Display only, and never trusted for anything. Cut to the column's limit
 * rather than refused, so an unusual browser can still sign in. Node decodes
 * header bytes as Latin-1, one character per byte, so a plain slice cannot
 * split a character.
 */
function readUserAgent(request) {
  const header = request.get("user-agent");
  if (typeof header !== "string" || header.trim() === "") return null;

  return header.trim().slice(0, MAX_USER_AGENT_LENGTH);
}

/**
 * The client's address for the session record, or null if there is no real
 * one to record. Set by the edge check at the top of the router.
 */
function readIpAddress(request) {
  const address = request.clientAddress;
  return typeof address === "string" && isIP(address) !== 0 ? address : null;
}

function sendError(response, error) {
  if (error.retryAfterSeconds) response.set("Retry-After", String(error.retryAfterSeconds));

  // toResponseBody is the only serialiser, so `detail` and `cause` cannot be
  // sent by accident.
  response.status(error.status).json(error.toResponseBody());
}

function logFailure(logger, error) {
  const entry = { code: error.code, status: error.status, detail: error.detail };

  if (error.code === "INTERNAL") {
    logger.error?.("[auth] Request failed unexpectedly.", entry, error.cause);
  } else if (error.status >= 500) {
    logger.error?.("[auth] Request failed.", entry);
  } else {
    logger.warn?.("[auth] Request rejected.", entry);
  }
}

/**
 * The rate-limit key: the client's address as the edge vouched for it
 * (7.1), not the socket's, which in production is Render's proxy for
 * everyone. For IPv6, its /64, since one connection can rotate through a
 * whole /64 (7.6).
 */
function getClientKey(request) {
  return rateLimitKeyFor(request.clientAddress);
}

module.exports = {
  createRouteKit,
  getClientKey,
  logFailure,
  publicUser,
  readIpAddress,
  readUserAgent,
  sendError,
};
