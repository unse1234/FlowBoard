const { ACCOUNT_TOKEN, createAccountTokenRepository } = require("./accountTokenRepository");
const { AuthError } = require("./authErrors");
const { publicUser } = require("./routeKit");
const { createSessionRepository } = require("./sessionRepository");
const { parseDisplayName, parsePassword } = require("./signupRequest");
const { createUserRepository } = require("./userRepository");

/**
 * Account settings (spec Phase B), on the /api/auth router behind its edge
 * and origin checks:
 *
 * - `PATCH /me`       change the display name
 * - `POST /password`  change the password, or set a first one
 *
 * Deleting the account lives in `accountDeletion.js`, since it reaches into
 * boards as well as the account.
 */

/**
 * @param {import("express").Router} router
 * @param {Object} deps
 * @param {ReturnType<typeof import("./routeKit").createRouteKit>} deps.kit
 */
function registerAccountRoutes(
  router,
  {
    kit,
    database,
    passwordHasher,
    requireAuth,
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
   * Change the name collaborators see. Nothing else: not the address, not a
   * linked identity, and no password needed, since a name grants nothing.
   */
  router.patch("/me", requireAuth, async (request, response) => {
    try {
      await kit.enforceLimit(sessionLimiter, request);
      const current = await kit.requireLiveSession(request);
      const displayName = parseDisplayName(request.body?.displayName);

      const user = await users.updateDisplayName({ userId: current.id, displayName });
      if (!user) throw new AuthError("AUTHENTICATION_REQUIRED", { detail: "account gone" });

      logger.info?.("[auth] Display name changed.", { userId: user.id });
      accountEvents.publish({ type: "account-changed", userId: user.id, displayName: user.displayName });

      response.set("Cache-Control", "no-store");
      response.json({ ok: true, user: publicUser(user) });
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });

  /**
   * Change the password, or set one for an account that signs in only through
   * a provider.
   *
   * - **With a password:** the current one is required, and wrong guesses
   *   count toward the same per-address backoff as sign-in, so a stolen
   *   session cannot be used to guess it.
   * - **Without one:** a recent provider sign-in on this session is the proof
   *   (migration 0007). "Forgot password?" is the other way in: a reset link
   *   to the account's verified address.
   *
   * Either way every session ends, this one included, and this device gets a
   * new one in the response (with a new refresh cookie). A stolen token for
   * the old session is then worth nothing, and so is every access token issued
   * before, because `token_version` moves on.
   */
  router.post("/password", requireAuth, async (request, response) => {
    try {
      // Costs a hash and possibly a verification, like sign-in.
      await kit.enforceLimit(signInLimiter, request);
      const session = await kit.requireLiveSession(request);
      const newPassword = parsePassword(request.body?.newPassword);

      const account = await users.findById(session.id);
      if (!account) throw new AuthError("AUTHENTICATION_REQUIRED", { detail: "account gone" });
      const settingFirstPassword = !account.passwordHash;

      if (settingFirstPassword) {
        if (!session.recentlyReauthenticated) {
          throw new AuthError("REAUTHENTICATION_REQUIRED", { detail: "set password without a recent sign-in" });
        }
      } else {
        await proveCurrentPassword(account, request.body?.currentPassword);
      }

      const passwordHash = await passwordHasher.hashPassword(newPassword);

      const result = await database.transaction(async (tx) => {
        const user = await users.replacePassword(
          { userId: account.id, passwordHash, expectedHash: account.passwordHash },
          tx,
        );
        if (!user) return null;

        const sessionIds = await sessions.revokeAllSessions({ userId: user.id, reason: "password_changed" }, tx);
        // A reset link sent before the change must not undo it.
        await tokens.discard({ userId: user.id, kind: ACCOUNT_TOKEN.RESET_PASSWORD }, tx);
        return { user, sessionIds };
      });
      // Changed or deleted by another request since the check above.
      if (!result) throw new AuthError("AUTHENTICATION_REQUIRED", { detail: "account changed meanwhile" });

      const { user, sessionIds } = result;
      logger.info?.(settingFirstPassword ? "[auth] Password set." : "[auth] Password changed.", {
        userId: user.id,
        sessionsEnded: sessionIds.length,
      });
      accountEvents.publish({ type: "sessions-ended", userId: user.id, sessionIds });

      emailService.inBackground(settingFirstPassword ? "password-set" : "password-changed", () =>
        settingFirstPassword
          ? emailService.sendPasswordSetNotification({ user, tokenVersion: user.tokenVersion })
          : emailService.sendPasswordChangedNotification({ user, reset: false, tokenVersion: user.tokenVersion }),
      );

      // This device carries on, in a new session.
      kit.sendSession(response, user, await kit.startSession(user, request));
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });

  /**
   * Throws unless `presented` is the account's current password. Failures
   * count toward the per-address sign-in backoff, and a backoff in force
   * refuses before any verification is done.
   */
  async function proveCurrentPassword(account, presented) {
    if (typeof presented !== "string" || presented === "") {
      throw new AuthError("CURRENT_PASSWORD_REQUIRED");
    }

    const throttle = await loginThrottle?.check(account.emailNormalized);
    if (throttle?.blocked) {
      throw new AuthError("TOO_MANY_ATTEMPTS", {
        retryAfterSeconds: throttle.retryAfterSeconds,
        detail: "per-address backoff, current password",
      });
    }

    if (!(await passwordHasher.verifyPassword(account.passwordHash, presented))) {
      await loginThrottle?.recordFailure(account.emailNormalized);
      throw new AuthError("CURRENT_PASSWORD_INCORRECT");
    }
    await loginThrottle?.recordSuccess(account.emailNormalized);
  }

  return { proveCurrentPassword };
}

module.exports = {
  registerAccountRoutes,
};
