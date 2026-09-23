const express = require("express");
const { AuthError, toAuthError } = require("./authErrors");
const { parseSignupRequest } = require("./signupRequest");
const { createUserRepository } = require("./userRepository");

/**
 * HTTP routes for authentication, mounted at /api/auth.
 *
 * The same shape as Backend/src/ai/aiRouter.js: a factory taking its
 * dependencies, validation at the boundary, one response envelope, and
 * diagnostics logged rather than returned.
 *
 * The rate limiter is injected rather than built here, so this module does not
 * decide where the counters live. That matters because Phase 7 replaces the
 * current in-process limiter with a shared one.
 */
function createAuthRouter({ database, passwordHasher, rateLimiter = null, logger = console }) {
  const router = express.Router();
  const users = createUserRepository({ database });

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
    const limit = rateLimiter?.consume(getClientKey(request));
    if (limit && !limit.allowed) {
      sendError(
        response,
        new AuthError("TOO_MANY_ATTEMPTS", { retryAfterSeconds: limit.retryAfterSeconds }),
      );
      return;
    }

    try {
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

  return router;
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
 * Behind a reverse proxy every request can appear to come from the proxy;
 * configure Express's "trust proxy" for that deployment so this is the real
 * client. Noted in README.md alongside the same caveat for the AI limiter.
 */
function getClientKey(request) {
  return request.ip ?? request.socket?.remoteAddress ?? "unknown";
}

module.exports = {
  createAuthRouter,
  handleAuthRequestError,
};
