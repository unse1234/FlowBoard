const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const test = require("node:test");
const express = require("express");
const { createAccessTokens } = require("./accessTokens");
const { createRequireAuth } = require("./authenticate");

/**
 * The `requireAuth` middleware on its own (chunk 2.7).
 *
 * No database anywhere in this file, which is itself the point: verifying an
 * access token must need no I/O (ADR 0002).
 */

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };
const KEY = { id: "test", secret: randomBytes(32) };
const CONFIG = { keys: [KEY], ttlSeconds: 900, issuer: "flowboard", audience: "flowboard-api" };
const SUBJECT = {
  userId: "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b",
  sessionId: "9e8d7c6b-5a49-4382-a716-f5e4d3c2b1a0",
  tokenVersion: 2,
};

const UNAUTHENTICATED = Object.freeze({
  ok: false,
  code: "AUTHENTICATION_REQUIRED",
  error: "Sign in to continue.",
});

/** An app with one protected route that reports who it thinks the caller is. */
async function startApp(t, { now } = {}) {
  const accessTokens = createAccessTokens({ config: CONFIG, now });
  const app = express();
  app.use(express.json());
  app.post("/probe", createRequireAuth({ accessTokens, logger: SILENT_LOGGER }), (request, response) => {
    response.json({ user: request.user, frozen: Object.isFrozen(request.user) });
  });

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const url = `http://127.0.0.1:${server.address().port}/probe`;
  return {
    accessTokens,
    call: (headers = {}, { query = "", body = {} } = {}) =>
      fetch(`${url}${query}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
  };
}

test("a valid bearer token sets a frozen request.user and nothing more", async (t) => {
  const app = await startApp(t);
  const { token } = app.accessTokens.issue(SUBJECT);

  const response = await app.call({ authorization: `Bearer ${token}` });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: { id: SUBJECT.userId, sessionId: SUBJECT.sessionId, tokenVersion: 2 },
    frozen: true,
  });
});

test("the scheme is matched case-insensitively, as RFC 7235 requires", async (t) => {
  const app = await startApp(t);
  const { token } = app.accessTokens.issue(SUBJECT);

  assert.equal((await app.call({ authorization: `bearer ${token}` })).status, 200);
  assert.equal((await app.call({ authorization: `BEARER ${token}` })).status, 200);
});

test("no credentials is a bare challenge, with no error code", async (t) => {
  const app = await startApp(t);

  const response = await app.call();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), 'Bearer realm="flowboard"');
  assert.deepEqual(await response.json(), UNAUTHENTICATED);
});

test("a bad token is invalid_token, and the body never says why", async (t) => {
  let now = Date.UTC(2026, 8, 24, 12);
  const app = await startApp(t, { now: () => now });
  const { token } = app.accessTokens.issue(SUBJECT);
  const forged = createAccessTokens({
    config: { ...CONFIG, keys: [{ id: "test", secret: randomBytes(32) }] },
  }).issue(SUBJECT).token;

  const cases = {
    forged: forged,
    tampered: `${token.slice(0, -2)}${token.at(-2) === "A" ? "B" : "A"}${token.at(-1)}`,
    garbage: "not.a.token",
  };

  for (const [label, candidate] of Object.entries(cases)) {
    const response = await app.call({ authorization: `Bearer ${candidate}` });
    assert.equal(response.status, 401, label);
    assert.equal(
      response.headers.get("www-authenticate"),
      'Bearer realm="flowboard", error="invalid_token"',
      label,
    );
    assert.deepEqual(await response.json(), UNAUTHENTICATED, label);
  }

  now += 900_000;
  const expired = await app.call({ authorization: `Bearer ${token}` });
  assert.equal(expired.status, 401);
  assert.deepEqual(await expired.json(), UNAUTHENTICATED);
});

test("only the Authorization header counts", async (t) => {
  const app = await startApp(t);
  const { token } = app.accessTokens.issue(SUBJECT);

  const refused = {
    // A query string ends up in access logs and browser history.
    "a query parameter": app.call({}, { query: `?access_token=${token}` }),
    "a form-style body field": app.call({}, { body: { access_token: token } }),
    "another scheme": app.call({ authorization: `Basic ${token}` }),
    "no scheme": app.call({ authorization: token }),
    "the scheme alone": app.call({ authorization: "Bearer" }),
    "two tokens": app.call({ authorization: `Bearer ${token} ${token}` }),
  };

  for (const [label, pending] of Object.entries(refused)) {
    assert.equal((await pending).status, 401, label);
  }
});

test("a client cannot name itself in the body", async (t) => {
  const app = await startApp(t);
  const { token } = app.accessTokens.issue(SUBJECT);

  const response = await app.call(
    { authorization: `Bearer ${token}` },
    { body: { user: { id: "00000000-0000-4000-8000-000000000000" } } },
  );

  // request.user comes from the verified token, whatever the body claims
  // (ENGINEERING_RULES.md rule 12).
  assert.equal((await response.json()).user.id, SUBJECT.userId);
});
