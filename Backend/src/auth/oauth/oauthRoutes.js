const { createHash, randomBytes } = require("node:crypto");
const { AuthError } = require("../authErrors");
const { parseEmailAddress } = require("../emailAddress");
const { generateOpaqueToken, hashOpaqueToken, isOpaqueToken } = require("../opaqueTokens");
const { publicUser } = require("../routeKit");
const { createSessionRepository } = require("../sessionRepository");
const { parseDisplayName } = require("../signupRequest");
const { createUserRepository } = require("../userRepository");
const { createOAuthRepository } = require("./oauthRepository");
const { OAuthFailure } = require("./providers");

/**
 * Sign-in with Google, GitHub and Microsoft (spec Phase E, E-23, ADR 0009),
 * on the /api/auth router behind its edge and origin checks:
 *
 *   GET    /providers                      which are configured
 *   POST   /oauth/:provider/start          begin signing in (signed out)
 *   POST   /oauth/:provider/connect        begin linking, or proving identity
 *                                          again (signed in)
 *   GET    /oauth/:provider/callback       where the provider sends the browser back
 *   GET    /identities                     this account's connected providers
 *   DELETE /identities/:identityId         disconnect one, never the last way in
 *
 * The rules that matter most (E-23):
 * - An identity is found by the provider's stable id only, never an email.
 * - An unknown identity whose email belongs to an existing account is
 *   refused, never merged: "sign in with your existing account, then connect
 *   this provider". A new account is created only from a verified email.
 * - Linking happens only from a signed-in account (`connect`), and an
 *   identity already linked anywhere is refused.
 *
 * Every sign-in in progress is protected three ways: a single-use `state`
 * (stored hashed), a random value in an HttpOnly cookie that must come back
 * with it (so a callback from someone else's sign-in finds no match), and
 * PKCE, plus a nonce checked inside Google's and Microsoft's ID tokens.
 *
 * The callback answers with a redirect to the web app, `/?oauth=<outcome>`
 * or `/?oauth_error=<code>`. The web app reads that, clears it, and says what
 * happened. Details stay in the log.
 */

const STATE_TTL_SECONDS = 10 * 60;
const MAX_CODE_LENGTH = 2_048;
const INTENTS = new Set(["link", "reauthenticate"]);

function registerOAuthRoutes(
  router,
  { kit, database, providers, appUrl, refreshCookie, cookieSecure, requireAuth, emailService, sessionLimiter, signInLimiter, logger },
) {
  const users = createUserRepository({ database });
  const sessions = createSessionRepository({ database });
  const oauth = createOAuthRepository({ database });

  // Lax, not Strict: the provider sends the browser back with a top-level GET
  // from its own site, and a Strict cookie would not come with it.
  const bindingCookie = {
    name: cookieSecure ? "__Secure-flowboard_oauth" : "flowboard_oauth",
    options: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: "/api/auth/oauth",
      maxAge: STATE_TTL_SECONDS * 1000,
    },
  };

  const redirectUri = (providerId) => `${appUrl}/api/auth/oauth/${providerId}/callback`;

  router.get("/providers", (_request, response) => {
    response.json({
      ok: true,
      providers: Object.values(providers).map((provider) => ({ id: provider.id, label: provider.label })),
    });
  });

  /** Remember the sign-in, bind it to this browser, and hand back where to go. */
  async function begin(request, response, { intent, userId = null, sessionId = null }) {
    const provider = providers[request.params.provider];
    if (!provider) throw new AuthError("PROVIDER_UNAVAILABLE", { detail: `provider ${String(request.params.provider).slice(0, 20)}` });

    const state = generateOpaqueToken();
    const browser = generateOpaqueToken();
    const codeVerifier = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");

    // Now and then, clear out sign-ins nobody finished.
    if (Math.random() < 0.05) oauth.sweepStates().catch(() => {});

    await oauth.saveState({
      stateHash: state.hash,
      browserHash: browser.hash,
      provider: provider.id,
      intent,
      codeVerifier,
      nonce,
      userId,
      sessionId,
      ttlSeconds: STATE_TTL_SECONDS,
    });

    response.cookie(bindingCookie.name, browser.token, bindingCookie.options);
    response.set("Cache-Control", "no-store");
    response.json({
      ok: true,
      authorizationUrl: provider.authorizationUrl({
        state: state.token,
        codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
        nonce,
        redirectUri: redirectUri(provider.id),
      }),
    });
  }

  router.post("/oauth/:provider/start", async (request, response) => {
    try {
      await kit.enforceLimit(signInLimiter, request);
      await begin(request, response, { intent: "sign-in" });
    } catch (error) {
      kit.sendRouteError(response, error);
    }
  });

  router.post("/oauth/:provider/connect", requireAuth, async (request, response) => {
    try {
      await kit.enforceLimit(sessionLimiter, request);
      const user = await kit.requireLiveSession(request);
      const intent = request.body?.intent;
      if (!INTENTS.has(intent)) throw new AuthError("PROVIDER_UNAVAILABLE", { detail: "unknown intent" });
      await begin(request, response, { intent, userId: user.id, sessionId: request.user.sessionId });
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });

  router.get("/oauth/:provider/callback", async (request, response) => {
    const providerId = String(request.params.provider).slice(0, 20);
    const finish = (params) => {
      response.set("Cache-Control", "no-store");
      response.redirect(303, `/?${new URLSearchParams({ ...params, provider: providerId })}`);
    };
    const fail = (code, detail) => {
      logger.warn?.("[auth] Provider sign-in refused.", { provider: providerId, code, detail });
      finish({ oauth_error: code });
    };

    // Whatever happens next, this sign-in's cookie has done its job.
    const presentedBinding = readCookie(request, bindingCookie.name);
    response.clearCookie(bindingCookie.name, { ...bindingCookie.options, maxAge: undefined });

    try {
      await kit.enforceLimit(sessionLimiter, request);
    } catch {
      fail("rate_limited");
      return;
    }

    try {
      const provider = providers[providerId];
      const state = request.query.state;
      const stored = provider && isOpaqueToken(state) ? await oauth.takeState(hashOpaqueToken(state)) : null;
      if (
        !stored ||
        stored.provider !== providerId ||
        !isOpaqueToken(presentedBinding) ||
        !hashOpaqueToken(presentedBinding).equals(stored.browserHash)
      ) {
        fail("state_invalid", stored ? "browser binding mismatch" : "unknown or expired state");
        return;
      }

      if (typeof request.query.error === "string") {
        fail("cancelled", request.query.error.slice(0, 64));
        return;
      }
      const code = request.query.code;
      if (typeof code !== "string" || code.length === 0 || code.length > MAX_CODE_LENGTH) {
        fail("provider_failed", "no code");
        return;
      }

      const identity = await provider.exchange({
        code,
        codeVerifier: stored.codeVerifier,
        redirectUri: redirectUri(providerId),
        nonce: stored.nonce,
      });
      const key = { provider: providerId, tenantId: identity.tenantId, subject: identity.subject };

      if (stored.intent === "sign-in") {
        const outcome = await signIn(request, response, provider, key, identity);
        if (outcome.error) fail(outcome.error, outcome.detail);
        else finish({ oauth: outcome.done });
        return;
      }

      // Linking and proving identity again belong to the session that asked.
      const account = await sessions.findSessionUser({ userId: stored.userId, sessionId: stored.sessionId });
      if (!account || account.status !== "active") {
        fail("session_ended");
        return;
      }

      if (stored.intent === "reauthenticate") {
        const existing = await oauth.findIdentity(key);
        if (!existing || existing.userId !== account.id) {
          fail("wrong_account", "identity is not this account's");
          return;
        }
        await sessions.markReauthenticated({ userId: account.id, sessionId: stored.sessionId });
        await oauth.touchIdentity(existing.id);
        logger.info?.("[auth] Proved identity again with a provider.", { userId: account.id, provider: providerId });
        finish({ oauth: "reauthenticated" });
        return;
      }

      const linked = await oauth.createIdentity({ userId: account.id, ...key, email: identity.email });
      if (linked.conflict) {
        const existing = await oauth.findIdentity(key);
        if (existing?.userId === account.id) {
          finish({ oauth: "linked" });
          return;
        }
        fail(linked.conflict === "provider" ? "provider_already_linked" : "identity_in_use");
        return;
      }
      logger.info?.("[auth] Provider connected.", { userId: account.id, provider: providerId });
      emailService.inBackground("identity-linked", () =>
        emailService.sendIdentityLinkedNotification({ user: account, provider: provider.label, identityId: linked.id }),
      );
      finish({ oauth: "linked" });
    } catch (error) {
      if (error instanceof OAuthFailure) fail(error.code, error.message);
      else {
        logger.error?.("[auth] Provider sign-in failed unexpectedly.", { provider: providerId, message: error?.message });
        finish({ oauth_error: "provider_failed" });
      }
    }
  });

  /**
   * Sign in with an identity: the account it is linked to, or a new account
   * made from it, but never an existing account found by email.
   *
   * @returns {Promise<{ done: "signed-in" | "signed-up" } | { error: string, detail?: string }>}
   */
  async function signIn(request, response, provider, key, identity) {
    const existing = await oauth.findIdentity(key);
    if (existing) {
      const user = await users.findById(existing.userId);
      if (!user) return { error: "account_unavailable", detail: "linked account gone" };
      if (user.status !== "active") return { error: "account_unavailable", detail: `status ${user.status}` };
      await oauth.touchIdentity(existing.id);
      await startSession(request, response, user);
      logger.info?.("[auth] Signed in with a provider.", { userId: user.id, provider: provider.id });
      return { done: "signed-in" };
    }

    // A new account needs an address the provider vouches for.
    if (!identity.emailVerified || !identity.email) return { error: "email_unverified" };
    const parsed = parseEmailAddress(identity.email);
    if (!parsed.valid) return { error: "email_unusable", detail: parsed.reason };

    // Never merged by email (E-23): the owner links it from settings instead.
    if (await users.findByNormalizedEmail(parsed.emailNormalized)) return { error: "account_exists" };

    const created = await database.transaction(async (tx) => {
      const { created: made, user } = await users.createUser(
        {
          email: parsed.email,
          emailNormalized: parsed.emailNormalized,
          displayName: displayNameFrom(identity, parsed.email),
          // No password: this account signs in through its provider until
          // its owner sets one (never a made-up one).
          passwordHash: null,
          emailVerified: true,
        },
        tx,
      );
      if (!made) return null;
      const linked = await oauth.createIdentity({ userId: user.id, ...key, email: parsed.email }, tx);
      if (linked.conflict) throw new OAuthFailure("identity_in_use", "linked by a concurrent sign-in");
      return user;
    });
    // Someone signed up with that address in the meantime.
    if (!created) return { error: "account_exists", detail: "created concurrently" };

    const user = await users.findById(created.id);
    await startSession(request, response, user);
    logger.info?.("[auth] Account created with a provider.", { userId: user.id, provider: provider.id });
    return { done: "signed-up" };
  }

  async function startSession(request, response, user) {
    const session = await kit.startSession(user, request);
    refreshCookie.set(response, session.refreshToken, session.refreshTokenExpiresAt);
  }

  router.get("/identities", requireAuth, async (request, response) => {
    try {
      await kit.enforceLimit(sessionLimiter, request);
      const user = await kit.requireLiveSession(request);
      response.set("Cache-Control", "no-store");
      response.json({
        ok: true,
        user: publicUser(user),
        identities: await oauth.listIdentities(user.id),
        available: Object.values(providers).map((provider) => ({ id: provider.id, label: provider.label })),
      });
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });

  router.delete("/identities/:identityId", requireAuth, async (request, response) => {
    try {
      await kit.enforceLimit(sessionLimiter, request);
      const user = await kit.requireLiveSession(request);
      const result = await oauth.removeIdentity({ userId: user.id, identityId: String(request.params.identityId) });

      if (result.refused === "last-method") throw new AuthError("LAST_SIGN_IN_METHOD");
      if (result.refused) throw new AuthError("IDENTITY_NOT_FOUND");

      const label = providers[result.removed.provider]?.label ?? result.removed.provider;
      logger.info?.("[auth] Provider disconnected.", { userId: user.id, provider: result.removed.provider });
      emailService.inBackground("identity-unlinked", () =>
        emailService.sendIdentityUnlinkedNotification({ user, provider: label, identityId: result.removed.id }),
      );
      response.json({ ok: true });
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });
}

/** The provider's name for the person if it passes the signup rules, else the address's local part. */
function displayNameFrom(identity, email) {
  for (const candidate of [identity.name, email.split("@")[0]]) {
    if (typeof candidate !== "string") continue;
    try {
      return parseDisplayName(Array.from(candidate).slice(0, 80).join(""));
    } catch {
      // Not usable as a name; try the next.
    }
  }
  return "FlowBoard user";
}

/** One cookie from the Cookie header (this server has no cookie parser). */
function readCookie(request, name) {
  const header = request.get("cookie");
  if (typeof header !== "string") return null;
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  // Two with one name means one was planted: trust neither.
  return matches.length === 1 ? decodeURIComponent(matches[0].slice(name.length + 1)) : null;
}

module.exports = {
  registerOAuthRoutes,
};
