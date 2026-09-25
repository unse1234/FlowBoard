import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_CLIENT_MESSAGES,
  AuthRequestError,
  changePassword,
  connectProvider,
  deleteAccount,
  disconnectIdentity,
  fetchCurrentUser,
  getDeletionPreflight,
  listIdentities,
  listProviders,
  listSessions,
  refreshSession,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  revokeOtherSessions,
  revokeSession,
  signIn,
  signOut,
  signUp,
  startProviderSignIn,
  updateDisplayName,
  verifyEmail,
} from "./authClient.js";

const USER = Object.freeze({
  id: "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  emailVerified: false,
  hasPassword: true,
});

const SESSION_BODY = Object.freeze({
  ok: true,
  user: USER,
  accessToken: "header.payload.signature",
  accessTokenExpiresAt: "2026-09-24T12:15:00.000Z",
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A fetch that records each call and answers with the given response. */
function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return typeof response === "function" ? response(url, init) : response;
  };
  return { calls, fetchImpl };
}

const BASE = { baseUrl: "https://api.example/" };

test("signing in posts the credentials with cookies allowed, and returns the session", async () => {
  const { calls, fetchImpl } = recordingFetch(jsonResponse(200, SESSION_BODY));

  const session = await signIn({ email: "ada@example.com", password: "pw", fetchImpl, ...BASE });

  assert.equal(calls[0].url, "https://api.example/api/auth/login");
  assert.equal(calls[0].init.method, "POST");
  // The browser only stores a Set-Cookie from a cross-origin response it was
  // allowed to send credentials to.
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.cache, "no-store");
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: "ada@example.com", password: "pw" });

  assert.deepEqual(session.user, USER);
  assert.equal(session.accessToken, SESSION_BODY.accessToken);
  assert.deepEqual(session.accessTokenExpiresAt, new Date(SESSION_BODY.accessTokenExpiresAt));
});

test("with no base URL given, requests go to this page's own origin", async () => {
  const { calls, fetchImpl } = recordingFetch(jsonResponse(200, SESSION_BODY));

  // No baseUrl: what the app does. A relative path is same-origin by
  // definition, which is what lets the SameSite=Strict cookie through (E-15).
  await refreshSession({ fetchImpl });

  assert.equal(calls[0].url, "/api/auth/refresh");
});

test("refresh and sign-out send the cookie and no body", async () => {
  const refresh = recordingFetch(jsonResponse(200, SESSION_BODY));
  const logout = recordingFetch(jsonResponse(200, { ok: true }));

  await refreshSession({ fetchImpl: refresh.fetchImpl, ...BASE });
  await signOut({ fetchImpl: logout.fetchImpl, ...BASE });

  assert.equal(refresh.calls[0].url, "https://api.example/api/auth/refresh");
  assert.equal(logout.calls[0].url, "https://api.example/api/auth/logout");
  for (const { init } of [refresh.calls[0], logout.calls[0]]) {
    assert.equal(init.credentials, "include");
    assert.equal(init.body, undefined);
  }
});

test("signup and me never send the cookie", async () => {
  const signup = recordingFetch(jsonResponse(202, { ok: true }));
  const me = recordingFetch(jsonResponse(200, { ok: true, user: USER }));

  await signUp({ email: "a@b.co", password: "p", displayName: "A", fetchImpl: signup.fetchImpl, ...BASE });
  const user = await fetchCurrentUser({ accessToken: "t0k3n", fetchImpl: me.fetchImpl, ...BASE });

  assert.equal(signup.calls[0].init.credentials, "omit");
  assert.equal(me.calls[0].init.credentials, "omit");
  assert.equal(me.calls[0].init.method, "GET");
  // me authenticates by bearer token, and only by that.
  assert.equal(me.calls[0].init.headers.Authorization, "Bearer t0k3n");
  assert.deepEqual(user, USER);
});

test("signup carries a Turnstile token only when there is one", async () => {
  const withToken = recordingFetch(jsonResponse(202, { ok: true }));
  const without = recordingFetch(jsonResponse(202, { ok: true }));
  const details = { email: "a@b.co", password: "p", displayName: "A" };

  await signUp({ ...details, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX", fetchImpl: withToken.fetchImpl, ...BASE });
  await signUp({ ...details, fetchImpl: without.fetchImpl, ...BASE });

  assert.equal(JSON.parse(withToken.calls[0].init.body).turnstileToken, "XXXX.DUMMY.TOKEN.XXXX");
  assert.equal("turnstileToken" in JSON.parse(without.calls[0].init.body), false);
});

test("the session list is read with the bearer token and its dates parsed", async () => {
  const { calls, fetchImpl } = recordingFetch(
    jsonResponse(200, {
      ok: true,
      sessions: [
        {
          id: "s-1",
          createdAt: "2026-09-20T10:00:00.000Z",
          lastUsedAt: "2026-09-25T09:00:00.000Z",
          userAgent: "Chrome",
          ipAddress: "203.0.113.7",
          current: true,
        },
      ],
    }),
  );

  const sessions = await listSessions({ accessToken: "t0k3n", fetchImpl, ...BASE });

  assert.equal(calls[0].url, "https://api.example/api/auth/sessions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer t0k3n");
  assert.equal(calls[0].init.credentials, "omit");
  assert.deepEqual(sessions[0].lastUsedAt, new Date("2026-09-25T09:00:00.000Z"));
  assert.equal(sessions[0].current, true);
});

test("a session list that is not what it should be is refused", async () => {
  for (const body of [{ ok: true }, { ok: true, sessions: [{ id: 1 }] }, { ok: true, sessions: [{ id: "s", current: "yes" }] }]) {
    const { fetchImpl } = recordingFetch(jsonResponse(200, body));
    await assert.rejects(listSessions({ accessToken: "t", fetchImpl, ...BASE }), { code: "BAD_RESPONSE" });
  }
});

test("ending sessions uses the right method and path, with the bearer token", async () => {
  const one = recordingFetch(jsonResponse(200, { ok: true }));
  const others = recordingFetch(jsonResponse(200, { ok: true, revoked: 2 }));

  await revokeSession({ accessToken: "t", sessionId: "a/b", fetchImpl: one.fetchImpl, ...BASE });
  const revoked = await revokeOtherSessions({ accessToken: "t", fetchImpl: others.fetchImpl, ...BASE });

  assert.equal(one.calls[0].init.method, "DELETE");
  // An id is always encoded into the path, never spliced in raw.
  assert.equal(one.calls[0].url, "https://api.example/api/auth/sessions/a%2Fb");
  assert.equal(others.calls[0].url, "https://api.example/api/auth/sessions/revoke-others");
  assert.equal(others.calls[0].init.method, "POST");
  assert.equal(revoked, 2);
});

test("a server error surfaces its code, message and status", async () => {
  const { fetchImpl } = recordingFetch(
    jsonResponse(401, {
      ok: false,
      code: "INVALID_CREDENTIALS",
      error: "That email address and password don't match.",
    }),
  );

  await assert.rejects(signIn({ email: "a@b.co", password: "x", fetchImpl, ...BASE }), (error) => {
    assert.ok(error instanceof AuthRequestError);
    assert.equal(error.code, "INVALID_CREDENTIALS");
    assert.equal(error.message, "That email address and password don't match.");
    assert.equal(error.status, 401);
    return true;
  });
});

test("an unreachable server is NETWORK, and a slow one TIMEOUT", async () => {
  const unreachable = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(refreshSession({ fetchImpl: unreachable, ...BASE }), {
    code: "NETWORK",
    message: AUTH_CLIENT_MESSAGES.NETWORK,
  });

  const hanging = (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
    );
  await assert.rejects(refreshSession({ fetchImpl: hanging, timeoutMs: 20, ...BASE }), {
    code: "TIMEOUT",
    message: AUTH_CLIENT_MESSAGES.TIMEOUT,
  });
});

test("a caller can cancel a request", async () => {
  const controller = new AbortController();
  const hanging = (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
    );

  const pending = signIn({ email: "a", password: "b", fetchImpl: hanging, signal: controller.signal, ...BASE });
  controller.abort();

  await assert.rejects(pending, { code: "CANCELLED" });
});

test("a response that is not a whole session is refused, never half-trusted", async () => {
  const broken = [
    { ...SESSION_BODY, accessToken: "" },
    { ...SESSION_BODY, accessToken: undefined },
    { ...SESSION_BODY, accessTokenExpiresAt: "soon" },
    { ...SESSION_BODY, user: { ...USER, emailVerified: "no" } },
    { ...SESSION_BODY, user: null },
    { ok: true },
  ];

  for (const body of broken) {
    const { fetchImpl } = recordingFetch(jsonResponse(200, body));
    await assert.rejects(refreshSession({ fetchImpl, ...BASE }), { code: "BAD_RESPONSE" }, JSON.stringify(body));
  }
});

test("a 404 means accounts are switched off on that server", async () => {
  // Express's own "Cannot POST" page: no auth routes are mounted without a
  // database.
  const { fetchImpl } = recordingFetch({
    ok: false,
    status: 404,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  });

  await assert.rejects(refreshSession({ fetchImpl, ...BASE }), {
    code: "AUTH_UNAVAILABLE",
    message: AUTH_CLIENT_MESSAGES.UNAVAILABLE,
    status: 404,
  });
});

test("a non-JSON error page becomes a readable error, not a crash", async () => {
  const { fetchImpl } = recordingFetch({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  });

  await assert.rejects(signOut({ fetchImpl, ...BASE }), {
    code: "HTTP_502",
    message: AUTH_CLIENT_MESSAGES.BAD_RESPONSE,
  });
});

test("the user object carries only the named fields", async () => {
  const { fetchImpl } = recordingFetch(
    jsonResponse(200, { ...SESSION_BODY, user: { ...USER, passwordHash: "$argon2id$..." } }),
  );

  const { user } = await refreshSession({ fetchImpl, ...BASE });

  assert.deepEqual(Object.keys(user).sort(), ["displayName", "email", "emailVerified", "hasPassword", "id"]);
  assert.ok(Object.isFrozen(user));
});

test("hasPassword is read when present, and assumed from an older server", async () => {
  const social = recordingFetch(jsonResponse(200, { ...SESSION_BODY, user: { ...USER, hasPassword: false } }));
  const older = recordingFetch(jsonResponse(200, SESSION_BODY));

  assert.equal((await refreshSession({ fetchImpl: social.fetchImpl, ...BASE })).user.hasPassword, false);
  assert.equal((await refreshSession({ fetchImpl: older.fetchImpl, ...BASE })).user.hasPassword, true);
});

test("renaming patches me with the bearer token and returns the account", async () => {
  const { calls, fetchImpl } = recordingFetch(
    jsonResponse(200, { ok: true, user: { ...USER, displayName: "Augusta Ada King", hasPassword: true } }),
  );

  const user = await updateDisplayName({ accessToken: "access", displayName: "Augusta Ada King", fetchImpl, ...BASE });

  assert.equal(calls[0].url, "https://api.example/api/auth/me");
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.headers.Authorization, "Bearer access");
  assert.deepEqual(JSON.parse(calls[0].init.body), { displayName: "Augusta Ada King" });
  assert.equal(user.displayName, "Augusta Ada King");
});

test("a password change lets the browser store its new cookie, and returns the new session", async () => {
  const { calls, fetchImpl } = recordingFetch(jsonResponse(200, SESSION_BODY));

  const session = await changePassword({
    accessToken: "access",
    currentPassword: "old-passphrase",
    newPassword: "new-passphrase-here",
    fetchImpl,
    ...BASE,
  });

  assert.equal(calls[0].url, "https://api.example/api/auth/password");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    newPassword: "new-passphrase-here",
    currentPassword: "old-passphrase",
  });
  assert.equal(session.accessToken, SESSION_BODY.accessToken);

  // Setting a first password sends no current one at all.
  await changePassword({ accessToken: "access", newPassword: "new-passphrase-here", fetchImpl, ...BASE });
  assert.deepEqual(JSON.parse(calls[1].init.body), { newPassword: "new-passphrase-here" });
});

test("the email routes post what the server needs and never send the cookie", async () => {
  const { calls, fetchImpl } = recordingFetch(jsonResponse(200, { ok: true }));

  await verifyEmail({ token: "t-verify", fetchImpl, ...BASE });
  await resetPassword({ token: "t-reset", password: "a-new-passphrase", fetchImpl, ...BASE });
  await requestPasswordReset({ email: "ada@example.com", fetchImpl, ...BASE });

  assert.deepEqual(
    calls.map((call) => [call.url, JSON.parse(call.init.body)]),
    [
      ["https://api.example/api/auth/verify-email", { token: "t-verify" }],
      ["https://api.example/api/auth/reset-password", { token: "t-reset", password: "a-new-passphrase" }],
      ["https://api.example/api/auth/forgot-password", { email: "ada@example.com" }],
    ],
  );
  assert.ok(calls.every((call) => call.init.credentials === "omit"));
});

test("a reset request resolves with the server's own wording", async () => {
  const message = "If an account exists for that address, a password-reset email has been sent.";
  const { fetchImpl } = recordingFetch(jsonResponse(202, { ok: true, message }));

  assert.equal(await requestPasswordReset({ email: "ada@example.com", fetchImpl, ...BASE }), message);
});

test("resending verification uses the bearer token and reports an address already confirmed", async () => {
  const { calls, fetchImpl } = recordingFetch(jsonResponse(200, { ok: true, alreadyVerified: true }));

  const result = await resendVerification({ accessToken: "access", fetchImpl, ...BASE });

  assert.equal(calls[0].url, "https://api.example/api/auth/resend-verification");
  assert.equal(calls[0].init.headers.Authorization, "Bearer access");
  assert.deepEqual(result, { alreadyVerified: true });
});

test("a dead link surfaces as TOKEN_INVALID with the server's message", async () => {
  const { fetchImpl } = recordingFetch(
    jsonResponse(400, { ok: false, code: "TOKEN_INVALID", error: "This link has expired or has already been used." }),
  );

  await assert.rejects(verifyEmail({ token: "t", fetchImpl, ...BASE }), (error) => {
    assert.ok(error instanceof AuthRequestError);
    assert.equal(error.code, "TOKEN_INVALID");
    assert.equal(error.status, 400);
    return true;
  });
});

test("deletion reads its preflight, then deletes with the cookie allowed to clear", async () => {
  const preflight = { ok: true, sharedBoards: [], privateBoardCount: 2, proof: "password" };
  const read = recordingFetch(jsonResponse(200, preflight));
  const result = await getDeletionPreflight({ accessToken: "access", fetchImpl: read.fetchImpl, ...BASE });

  assert.equal(read.calls[0].url, "https://api.example/api/auth/delete-account");
  assert.equal(read.calls[0].init.method, "GET");
  assert.deepEqual(result, { sharedBoards: [], privateBoardCount: 2, proof: "password" });

  const done = recordingFetch(jsonResponse(200, { ok: true }));
  await deleteAccount({ accessToken: "access", confirmation: "DELETE", password: "pw", fetchImpl: done.fetchImpl, ...BASE });

  assert.equal(done.calls[0].init.method, "POST");
  assert.equal(done.calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(done.calls[0].init.body), { confirmation: "DELETE", password: "pw" });
});

test("providers are listed, and a server without accounts lists none", async () => {
  const on = recordingFetch(jsonResponse(200, { ok: true, providers: [{ id: "google", label: "Google" }] }));
  const off = recordingFetch(jsonResponse(404, null));

  assert.deepEqual(await listProviders({ fetchImpl: on.fetchImpl, ...BASE }), [{ id: "google", label: "Google" }]);
  assert.deepEqual(await listProviders({ fetchImpl: off.fetchImpl, ...BASE }), []);
});

test("starting a provider sign-in lets the binding cookie through and returns the provider's address", async () => {
  const authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=s";
  const { calls, fetchImpl } = recordingFetch(jsonResponse(200, { ok: true, authorizationUrl }));

  assert.equal(await startProviderSignIn({ provider: "google", fetchImpl, ...BASE }), authorizationUrl);
  assert.equal(calls[0].url, "https://api.example/api/auth/oauth/google/start");
  assert.equal(calls[0].init.credentials, "include");

  await connectProvider({ accessToken: "access", provider: "github", intent: "link", fetchImpl, ...BASE }).catch(() => {});
  assert.equal(calls[1].url, "https://api.example/api/auth/oauth/github/connect");
  assert.equal(calls[1].init.headers.Authorization, "Bearer access");
  assert.deepEqual(JSON.parse(calls[1].init.body), { intent: "link" });
});

test("a sign-in address that is not the provider's own is refused, never followed", async () => {
  for (const authorizationUrl of ["https://evil.test/login", "http://accounts.google.com/", "javascript:alert(1)", 42]) {
    const { fetchImpl } = recordingFetch(jsonResponse(200, { ok: true, authorizationUrl }));
    await assert.rejects(startProviderSignIn({ provider: "google", fetchImpl, ...BASE }), { code: "BAD_RESPONSE" }, String(authorizationUrl));
  }
});

test("connected accounts are read, and one disconnected, with the bearer token", async () => {
  const { calls, fetchImpl } = recordingFetch(
    jsonResponse(200, {
      ok: true,
      user: { ...USER, hasPassword: false },
      identities: [{ id: "i-1", provider: "google", email: "ada@gmail.com" }],
      available: [{ id: "google", label: "Google" }],
    }),
  );

  const result = await listIdentities({ accessToken: "access", fetchImpl, ...BASE });
  await disconnectIdentity({ accessToken: "access", identityId: "i-1", fetchImpl, ...BASE });

  assert.equal(result.hasPassword, false);
  assert.equal(result.identities[0].provider, "google");
  assert.equal(calls[1].init.method, "DELETE");
  assert.equal(calls[1].url, "https://api.example/api/auth/identities/i-1");
});
