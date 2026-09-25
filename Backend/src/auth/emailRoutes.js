const { ACCOUNT_TOKEN, createAccountTokenRepository } = require("./accountTokenRepository");
const { AuthError, authErrorForEmailReason } = require("./authErrors");
const { parseEmailAddress } = require("./emailAddress");
const { hashOpaqueToken, isOpaqueToken } = require("./opaqueTokens");
const { createSessionRepository } = require("./sessionRepository");
const { parsePassword } = require("./signupRequest");
const { createUserRepository } = require("./userRepository");

/**
 * The email-driven account routes (Phase A), on the /api/auth router so the
 * edge and origin checks there run first:
 *
 * - `POST /verify-email`        use a verification link
 * - `POST /resend-verification` send a new one (signed in)
 * - `POST /forgot-password`     ask for a reset link
 * - `POST /reset-password`      use it
 *
 * The links open the web app, which posts the token here. Only a deliberate
 * request uses a token, never a GET that a mail scanner might prefetch.
 */

/** The one answer to a forgot-password request, whatever happened. */
const FORGOT_PASSWORD_MESSAGE = "If an account exists for that address, a password-reset email has been sent.";

/**
 * @param {import("express").Router} router
 * @param {Object} deps
 * @param {ReturnType<typeof import("./routeKit").createRouteKit>} deps.kit
 * @param {import("express").RequestHandler} deps.requireAuth
 * @param {ReturnType<typeof import("./accountEmails").createAccountEmails>} deps.accountEmails
 * @param {ReturnType<typeof import("../email/emailService").createEmailService>} deps.emailService
 * @param {ReturnType<typeof import("./accountEvents").createAccountEvents>} deps.accountEvents
 */
function registerEmailRoutes(
  router,
  {
    kit,
    database,
    passwordHasher,
    requireAuth,
    accountEmails,
    emailService,
    accountEvents,
    signInLimiter,
    sessionLimiter,
    loginThrottle,
    logger,
  },
) {
  const users = createUserRepository({ database });
  const sessions = createSessionRepository({ database });
  const tokens = createAccountTokenRepository({ database });

  /**
   * Confirm an address with the token from its link.
   *
   * Signed in or not: the link is often opened on another device. Unknown,
   * used, expired, replaced and stale tokens all answer TOKEN_INVALID.
   */
  router.post("/verify-email", async (request, response) => {
    try {
      await kit.enforceLimit(sessionLimiter, request);

      const token = request.body?.token;
      if (!isOpaqueToken(token)) throw new AuthError("TOKEN_INVALID", { detail: "malformed token" });

      const claim = await database.transaction(async (tx) => {
        const consumed = await tokens.consume(
          { kind: ACCOUNT_TOKEN.VERIFY_EMAIL, tokenHash: hashOpaqueToken(token) },
          tx,
        );
        if (!consumed) return null;
        // The address must still be the one the link went to.
        return (await users.markEmailVerified(consumed, tx)) ? consumed : null;
      });
      if (!claim) throw new AuthError("TOKEN_INVALID", { detail: "unknown, used, expired or stale token" });

      logger.info?.("[auth] Email verified.", { userId: claim.userId });
      accountEvents.publish({ type: "account-verified", userId: claim.userId });
      response.json({ ok: true });
    } catch (error) {
      kit.sendRouteError(response, error);
    }
  });

  /**
   * Send a fresh verification link to the signed-in account's address. The
   * previous link stops working.
   *
   * The account owner asked, so unlike forgot-password this may say what
   * happened: already verified, email unavailable, or the hourly cap.
   */
  router.post("/resend-verification", requireAuth, async (request, response) => {
    try {
      await kit.enforceLimit(sessionLimiter, request);
      const user = await kit.requireLiveSession(request);

      if (user.emailVerifiedAt) {
        response.json({ ok: true, alreadyVerified: true });
        return;
      }
      if (!accountEmails.enabled) throw new AuthError("EMAIL_UNAVAILABLE", { detail: "email not configured" });

      const cap = await accountEmails.countAddress(user.emailNormalized);
      if (!cap.allowed) {
        throw new AuthError("TOO_MANY_ATTEMPTS", {
          retryAfterSeconds: cap.retryAfterSeconds,
          detail: "per-address email cap",
        });
      }

      emailService.inBackground("verify-email", () => accountEmails.sendVerification(user));
      response.status(202).json({ ok: true, alreadyVerified: false });
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });

  /**
   * Ask for a reset link.
   *
   * Answers 202 with the same body for every well-formed address: registered
   * or not, capped or not, social-only or not. Everything that differs
   * happens after the response, in the background, so neither the answer nor
   * its timing says which it was.
   */
  router.post("/forgot-password", async (request, response) => {
    try {
      await kit.enforceLimit(signInLimiter, request);

      const parsed = parseEmailAddress(request.body?.email);
      if (!parsed.valid) throw authErrorForEmailReason(parsed.reason);

      // The same for every address, so it reveals nothing about any of them.
      if (!accountEmails.enabled) throw new AuthError("EMAIL_UNAVAILABLE", { detail: "email not configured" });

      emailService.inBackground("reset-password", async () => {
        const cap = await accountEmails.countAddress(parsed.emailNormalized);
        if (!cap.allowed) {
          logger.warn?.("[auth] Reset email not sent: per-address cap reached.");
          return;
        }

        const user = await users.findByNormalizedEmail(parsed.emailNormalized);
        if (!user || user.status !== "active") return;

        // An account with no password signs in through a provider. A reset
        // may give it one, but only through an address already proven to be
        // theirs; otherwise the link would hand the account to whoever
        // controls an address nobody confirmed.
        if (!user.passwordHash && !user.emailVerifiedAt) return;

        await accountEmails.sendPasswordReset(user);
      });

      response.status(202).json({ ok: true, message: FORGOT_PASSWORD_MESSAGE });
    } catch (error) {
      kit.sendRouteError(response, error);
    }
  });

  /**
   * Choose a new password with the token from a reset link.
   *
   * One transaction consumes the token, replaces the password, moves
   * `token_version` on (so every access token dies) and ends every session.
   * The person then signs in again, everywhere, with the new password.
   *
   * The link proves the address, so an unverified address becomes verified.
   */
  router.post("/reset-password", async (request, response) => {
    try {
      await kit.enforceLimit(signInLimiter, request);

      const token = request.body?.token;
      if (!isOpaqueToken(token)) throw new AuthError("TOKEN_INVALID", { detail: "malformed token" });
      const password = parsePassword(request.body?.password);

      // Before the transaction, so no lock is held across the hash.
      const passwordHash = await passwordHasher.hashPassword(password);

      const result = await database.transaction(async (tx) => {
        const claim = await tokens.consume(
          { kind: ACCOUNT_TOKEN.RESET_PASSWORD, tokenHash: hashOpaqueToken(token) },
          tx,
        );
        if (!claim) return null;

        const user = await users.replacePassword(
          { userId: claim.userId, passwordHash, verifiedEmail: claim.emailNormalized },
          tx,
        );
        if (!user) return null;

        const sessionIds = await sessions.revokeAllSessions({ userId: user.id, reason: "password_reset" }, tx);
        // Verified now, so an outstanding verification link has nothing left to do.
        await tokens.discard({ userId: user.id, kind: ACCOUNT_TOKEN.VERIFY_EMAIL }, tx);
        return { user, sessionIds };
      });
      if (!result) throw new AuthError("TOKEN_INVALID", { detail: "unknown, used, expired or stale token" });

      const { user, sessionIds } = result;
      logger.info?.("[auth] Password reset.", { userId: user.id, sessionsEnded: sessionIds.length });
      accountEvents.publish({ type: "sessions-ended", userId: user.id, sessionIds });

      // The owner just proved control of the address; a backoff built up by
      // someone guessing at it should not lock them out of the new password.
      await loginThrottle?.recordSuccess(user.emailNormalized).catch((error) => {
        logger.warn?.("[auth] Could not clear sign-in backoff after a reset.", { message: error?.message });
      });

      emailService.inBackground("password-changed", () =>
        emailService.sendPasswordChangedNotification({ user, reset: true, tokenVersion: user.tokenVersion }),
      );

      response.json({ ok: true });
    } catch (error) {
      kit.sendRouteError(response, error);
    }
  });
}

module.exports = {
  FORGOT_PASSWORD_MESSAGE,
  registerEmailRoutes,
};
