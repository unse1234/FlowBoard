const express = require("express");
const { isIP } = require("node:net");
const { createEdgeRequestReader } = require("../http/edgeRequest");
const { isTrustedOrigin } = require("../http/originCheck");
const { AuthError, invalidCredentials, toAuthError } = require("./authErrors");
const { createRequireAuth, setBearerChallenge } = require("./authenticate");
const { parseLoginRequest } = require("./loginRequest");
const { generateRefreshToken, hashRefreshToken } = require("./refreshTokens");
const { ROTATION, createSessionRepository } = require("./sessionRepository");
const { parseSignupRequest } = require("./signupRequest");
const { createUserRepository } = require("./userRepository");

/** Matches the CHECK on auth_sessions.user_agent. */
const MAX_USER_AGENT_LENGTH = 512;

/**
 * HTTP routes for authentication, mounted at /api/auth.
 *
 * The same shape as Backend/src/ai/aiRouter.js: a factory taking its
 * dependencies, validation at the boundary, one response envelope, and
 * diagnostics logged rather than returned.
 *
 * The rate limiter is injected rather than built here, so this module does not
 * decide where the counters live. In production they are in PostgreSQL
 * (Backend/src/http/rateLimiter.js), shared by every instance.
 *
 * @param {Object} options
 * @param {ReturnType<typeof import("./accessTokens").createAccessTokens>} options.accessTokens
 * @param {ReturnType<typeof import("./refreshTokens").createRefreshCookie>} options.refreshCookie
 * @param {{ idleTtlSeconds: number, sessionTtlSeconds: number, reuseGraceSeconds: number }} options.sessionLifetimes
 * @param {readonly string[]} options.trustedOrigins  pages allowed to change state here
 * @param {string | null} [options.edgeSecret]  AUTH_PROXY_SECRET; null where no edge is in front
 * @param {{ name: string, consume(key: string): Promise<{ allowed: boolean, retryAfterSeconds: number }> } | null} [options.signInLimiter]
 *   sign-in and sign-up, which each cost a password hash
 * @param {typeof options.signInLimiter} [options.sessionLimiter]
 *   refresh, sign-out and me, which do not
 */
function createAuthRouter({
  database,
  passwordHasher,
  accessTokens,
  refreshCookie,
  sessionLifetimes,
  trustedOrigins,
  edgeSecret = null,
  signInLimiter = null,
  sessionLimiter = null,
  logger = console,
}) {
  const router = express.Router();
  const users = createUserRepository({ database });
  const sessions = createSessionRepository({ database });
  const requireAuth = createRequireAuth({ accessTokens, logger });
  const readEdgeRequest = createEdgeRequestReader({ edgeSecret });

  /**
   * Nothing reaches a route here except through FlowBoard's own edge, when
   * one is configured (7.1). That is what makes the client's address
   * trustworthy, and every limit and session record below depends on it.
   *
   * First of all, before the origin check and the rate limiter: a request
   * that went around the edge is not a user of this site.
   */
  router.use((request, response, next) => {
    const edge = readEdgeRequest(request);

    if (!edge.trusted) {
      const error = new AuthError("ORIGIN_NOT_ALLOWED", {
        detail: `${request.method} ${request.path}: ${edge.reason}`,
      });
      logFailure(logger, error);
      sendError(response, error);
      return;
    }

    request.clientAddress = edge.address;
    next();
  });

  /**
   * CSRF protection for every route here, before any of them runs.
   *
   * On the router rather than on each route, so a route added later is
   * protected by default instead of by someone remembering (rule 16). Also
   * before the rate limiter: a forged request should cost nothing, not a
   * slot of the victim's allowance.
   */
  router.use((request, response, next) => {
    if (isTrustedOrigin(request, trustedOrigins)) {
      next();
      return;
    }

    const error = new AuthError("ORIGIN_NOT_ALLOWED", {
      // Not sensitive, and what an operator needs to tell an attack from a
      // missing CLIENT_ORIGIN entry. Cut short so a header cannot flood the log.
      detail: `${request.method} ${request.path} from ${String(request.get("origin") ?? "no origin").slice(0, 200)}`,
    });
    logFailure(logger, error);
    sendError(response, error);
  });

  /**
   * Create an account.
   *
   * The status and body are identical whether or not the address already has an
   * account (AUTH_DECISIONS.md E-12). Three things keep that true, and each is
   * easy to undo by accident:
   *
   * 1. The password is hashed before the insert is attempted, on both paths.
   *    Skipping the hash for an address that already exists would answer in a
   *    fraction of the time and be the same oracle in the time domain.
   * 2. The insert decides the outcome, rather than a prior existence check, so
   *    two signups arriving together cannot produce an error on one of them.
   * 3. Both branches end at the same response.
   *
   * Timing is close but not identical: a real insert writes WAL and a no-op
   * conflict does not, measured at roughly 64ms against 51ms with heavily
   * overlapping ranges. Finding F-17 records the residual — do not "fix" it by
   * adding a random delay, which raises the sample count an attacker needs
   * without removing the signal.
   */
  router.post("/signup", async (request, response) => {
    try {
      await enforceSignInLimit(request);
      const signup = parseSignupRequest(request.body);
      const passwordHash = await passwordHasher.hashPassword(signup.password);

      const { created, user } = await users.createUser({
        email: signup.email,
        emailNormalized: signup.emailNormalized,
        displayName: signup.displayName,
        passwordHash,
      });

      // The address is deliberately absent from both lines: an operator can
      // find the account from the id, and a log full of addresses is a privacy
      // liability of its own (checklist section 26).
      if (created) {
        logger.info?.("[auth] Account created.", { userId: user.id });
        // Phase 4 sends the verification email here.
      } else {
        logger.info?.("[auth] Signup for an address that already has an account.");
        // Phase 4 sends "you already have an account, reset your password" here.
        // Until then this person gets no explanation, which is the accepted
        // cost recorded in E-12.
      }

      // 202 rather than 201: this request has been accepted, and whether it
      // created anything is exactly what the response must not reveal.
      response.status(202).json({ ok: true });
    } catch (error) {
      const authError = toAuthError(error);
      logFailure(logger, authError);
      sendError(response, authError);
    }
  });

  /**
   * Sign in: check an email address and password, and start a session.
   *
   * Success answers with a 15-minute access token in the body, for the client
   * to hold in memory, and sets the refresh token as an HttpOnly cookie that
   * script cannot read (ADR 0002).
   *
   * An unknown address, a wrong password and an account with no password all
   * answer INVALID_CREDENTIALS, and all do one Argon2 verification, so neither
   * the response nor the time taken says which it was.
   */
  router.post("/login", async (request, response) => {
    try {
      await enforceSignInLimit(request);
      const login = parseLoginRequest(request.body);
      const user = await users.findByNormalizedEmail(login.emailNormalized);

      // No account, or an account with no password. Both still pay for a
      // verification, because returning here without one would answer in a
      // fraction of the time and reveal which addresses are registered.
      if (!user || !user.passwordHash) {
        await passwordHasher.burnVerificationWork(login.password);
        throw invalidCredentials(user ? "no password set" : "no account");
      }

      const verified = await passwordHasher.verifyPassword(user.passwordHash, login.password);
      if (!verified) throw invalidCredentials("password mismatch");

      // Only now, with the password proven, may the answer acknowledge that
      // this account exists. Checking status any earlier would make it an
      // oracle.
      if (user.status !== "active") {
        throw new AuthError("ACCOUNT_UNAVAILABLE", { detail: `status ${user.status}` });
      }

      await upgradeHashIfStale(user, login.password);

      const session = await startSession(user, request);

      logger.info?.("[auth] Signed in.", { userId: user.id, sessionId: session.sessionId });

      sendSession(response, user, session);
    } catch (error) {
      const authError = toAuthError(error);
      logFailure(logger, authError);
      sendError(response, authError);
    }
  });

  /**
   * Exchange the refresh cookie for a new access token and a new refresh
   * token. This is how a page load, or a tab whose access token has expired,
   * gets back in without a password.
   *
   * Every refusal but one answers SESSION_INVALID and clears the cookie, so a
   * client holding a stolen token cannot learn whether it was noticed. The
   * exception is ACCOUNT_UNAVAILABLE, reachable only with a live session, and
   * therefore only by its owner, like the same answer at sign-in.
   *
   * Not behind the sign-in rate limiter. A refresh does no password work, and
   * several tabs refreshing together would exhaust a limit of five a minute.
   * The token is 256 random bits, so it cannot be guessed at any rate. Phase 7
   * gives it a generous limit of its own.
   */
  router.post("/refresh", async (request, response) => {
    try {
      // First, before the cookie is read: a refused request spends nothing.
      await enforceLimit(sessionLimiter, request);

      const presented = refreshCookie.read(request);
      if (!presented) throw new AuthError("SESSION_INVALID", { detail: "no usable refresh cookie" });

      const successor = generateRefreshToken();
      const result = await sessions.rotateRefreshToken({
        tokenHash: hashRefreshToken(presented),
        successorHash: successor.hash,
        idleTtlSeconds: sessionLifetimes.idleTtlSeconds,
        reuseGraceSeconds: sessionLifetimes.reuseGraceSeconds,
      });

      if (result.outcome === ROTATION.REUSE_DETECTED) {
        // A security event, not a routine rejection: someone holds a copy of a
        // token that was already exchanged. The session is already revoked.
        logger.warn?.("[auth] Refresh token replayed; session revoked.", {
          sessionId: result.sessionId,
          userId: result.userId,
        });
      }

      if (result.outcome === ROTATION.ACCOUNT_UNAVAILABLE) {
        throw new AuthError("ACCOUNT_UNAVAILABLE", { detail: "refresh for an inactive account" });
      }

      if (result.outcome !== ROTATION.ROTATED) {
        throw new AuthError("SESSION_INVALID", { detail: result.outcome });
      }

      const access = accessTokens.issue({
        userId: result.user.id,
        sessionId: result.sessionId,
        tokenVersion: result.user.tokenVersion,
      });

      if (result.withinGrace) {
        logger.info?.("[auth] Refreshed within the reuse grace window.", { sessionId: result.sessionId });
      }

      sendSession(response, result.user, {
        refreshToken: successor.token,
        refreshTokenExpiresAt: result.tokenExpiresAt,
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
      });
    } catch (error) {
      const authError = toAuthError(error);
      // A token that will never work again is removed from the browser, so the
      // client stops presenting it. Anything else, an outage included, leaves
      // the cookie alone: the session may be perfectly good.
      if (authError.code === "SESSION_INVALID") refreshCookie.clear(response);
      logFailure(logger, authError);
      sendError(response, authError);
    }
  });

  /**
   * Sign out of this device: end the session the refresh cookie belongs to.
   *
   * Always answers `{ ok: true }` and clears the cookie, whether there was a
   * cookie, a live session, or nothing at all. Signing out is idempotent, and
   * the answer says nothing about the token presented.
   *
   * The access token the client holds stays valid until it expires, at most
   * 15 minutes. Checking a session on every request is exactly the lookup
   * ADR 0002 avoids, so the client discards it. Anything that must not
   * outlive a sign-out, such as changing a password, checks the session
   * itself.
   */
  router.post("/logout", async (request, response) => {
    // A throttled sign-out is refused whole, before the cookie is touched, so
    // the browser and the server never disagree about whether it happened.
    // A limiter that cannot be reached is not a refusal: signing out proceeds,
    // and meets the same outage below.
    let refusal = null;
    try {
      await enforceLimit(sessionLimiter, request);
    } catch (error) {
      refusal = toAuthError(error);
    }
    if (refusal?.code === "TOO_MANY_ATTEMPTS") {
      logFailure(logger, refusal);
      sendError(response, refusal);
      return;
    }

    // Cleared before anything else can fail, so the browser is signed out even
    // if the database is not reachable to end the session.
    const presented = refreshCookie.read(request);
    refreshCookie.clear(response);

    try {
      if (presented) {
        const { revoked, sessionId } = await sessions.revokeSessionByToken({
          tokenHash: hashRefreshToken(presented),
          reason: "logout",
        });
        if (revoked) logger.info?.("[auth] Signed out.", { sessionId });
      }

      response.json({ ok: true });
    } catch (error) {
      const authError = toAuthError(error);
      logFailure(logger, authError);
      sendError(response, authError);
    }
  });

  /**
   * Who the access token belongs to, as the database sees them now.
   *
   * Stricter than `requireAuth` alone. It already reads the user row, so it
   * also refuses a token whose session has ended, whose `token_version` is
   * stale, or whose account is gone. A client can call this to know that a
   * sign-in is still good, not just that a token is well signed.
   */
  router.get("/me", requireAuth, async (request, response) => {
    try {
      await enforceLimit(sessionLimiter, request);

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

      response.set("Cache-Control", "no-store");
      response.json({ ok: true, user: publicUser(user) });
    } catch (error) {
      const authError = toAuthError(error);
      // The token was well signed but is no longer good: the same challenge
      // requireAuth sends for a bad one.
      if (authError.code === "AUTHENTICATION_REQUIRED") setBearerChallenge(response, "invalid_token");
      logFailure(logger, authError);
      sendError(response, authError);
    }
  });

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
   * The one way a response hands out tokens, for sign-in now and refresh next.
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

  /**
   * Count a request against the client, and refuse it past the limit.
   *
   * Two allowances. Sign-in and sign-up share a small one, because each costs
   * an Argon2 hash (finding F-16). Refresh, sign-out and me share a generous
   * one, because tabs make them routinely. Neither spends the other.
   */
  async function enforceLimit(limiter, request) {
    if (!limiter) return;

    const limit = await limiter.consume(getClientKey(request));
    if (!limit.allowed) {
      throw new AuthError("TOO_MANY_ATTEMPTS", {
        retryAfterSeconds: limit.retryAfterSeconds,
        detail: `${limiter.name} limit reached`,
      });
    }
  }

  const enforceSignInLimit = (request) => enforceLimit(signInLimiter, request);

  /**
   * Re-hash a password that was stored with weaker parameters than are now
   * configured, while the plaintext is in hand.
   *
   * A failure here must never fail the login: the password was correct, and the
   * stored hash is still valid — it is only older than we would like.
   */
  async function upgradeHashIfStale(user, password) {
    if (!passwordHasher.needsRehash(user.passwordHash)) return;

    try {
      const passwordHash = await passwordHasher.hashPassword(password);
      const upgraded = await users.upgradePasswordHash({
        userId: user.id,
        expectedHash: user.passwordHash,
        passwordHash,
      });

      // Not upgraded means the row changed under us — a password change in
      // another session. That session's hash is newer, so leaving it is right.
      if (upgraded) logger.info?.("[auth] Upgraded a stored password hash.", { userId: user.id });
    } catch (error) {
      logger.warn?.("[auth] Could not upgrade a stored password hash.", {
        userId: user.id,
        message: error?.message,
      });
    }
  }

  return router;
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
    // D-5 is unresolved: whether an unverified account may do anything is still
    // open, so this reports the fact and enforces no policy.
    emailVerified: Boolean(user.emailVerifiedAt),
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

/**
 * Answer in the same envelope when the body parser rejects a request before it
 * reaches a route — otherwise Express would reply with an HTML error page.
 */
function handleAuthRequestError(error, _request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error?.type === "entity.parse.failed") {
    sendError(response, new AuthError("INVALID_JSON"));
    return;
  }

  if (error?.type === "entity.too.large") {
    sendError(response, new AuthError("PAYLOAD_TOO_LARGE"));
    return;
  }

  next(error);
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
 * everyone.
 */
function getClientKey(request) {
  return request.clientAddress ?? "unknown";
}

module.exports = {
  createAuthRouter,
  handleAuthRequestError,
};
