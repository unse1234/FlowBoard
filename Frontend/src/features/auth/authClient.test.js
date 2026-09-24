import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_CLIENT_MESSAGES,
  AuthRequestError,
  fetchCurrentUser,
  listSessions,
  refreshSession,
  revokeOtherSessions,
  revokeSession,
  signIn,
  signOut,
  signUp,
} from "./authClient.js";

const USER = Object.freeze({
  id: "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  emailVerified: false,
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

  assert.deepEqual(Object.keys(user).sort(), ["displayName", "email", "emailVerified", "id"]);
  assert.ok(Object.isFrozen(user));
});
