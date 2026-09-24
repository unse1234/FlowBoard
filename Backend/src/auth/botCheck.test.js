const assert = require("node:assert/strict");
const test = require("node:test");
const { SITEVERIFY_URL, createTurnstileVerifier } = require("./botCheck");
const { SKIP, VALID_SIGNUP, startAuthServer } = require("./testServer");

/**
 * Turnstile on signup (chunk 7.5). Cloudflare is never called: every test
 * scripts what siteverify answers.
 */

const SECRET = "0x4AAAAAAAtestsecretvalue000000000";
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

/** A fetch that answers siteverify as scripted, and records what it was sent. */
function siteverify(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (typeof answer === "function") return answer();
    return { ok: true, status: 200, json: async () => answer };
  };
  return { calls, fetchImpl };
}

const verifier = (fetchImpl) => createTurnstileVerifier({ secretKey: SECRET, fetchImpl, logger: SILENT_LOGGER });

test("a passing token is accepted, and the check is sent as Cloudflare documents", async () => {
  const { calls, fetchImpl } = siteverify({ success: true, action: "signup" });

  await verifier(fetchImpl).verify(TOKEN, { remoteIp: "198.51.100.23" });

  assert.equal(calls[0].url, SITEVERIFY_URL);
  assert.equal(calls[0].body.secret, SECRET);
  assert.equal(calls[0].body.response, TOKEN);
  assert.equal(calls[0].body.remoteip, "198.51.100.23");
  assert.match(calls[0].body.idempotency_key, /^[0-9a-f-]{36}$/);
});

test("a failing, replayed or expired token is refused", async () => {
  for (const codes of [["invalid-input-response"], ["timeout-or-duplicate"]]) {
    const { fetchImpl } = siteverify({ success: false, "error-codes": codes });
    await assert.rejects(verifier(fetchImpl).verify(TOKEN), { code: "BOT_CHECK_FAILED" }, codes[0]);
  }
});

test("a token solved for another action cannot be spent on signup", async () => {
  const { fetchImpl } = siteverify({ success: true, action: "login" });

  await assert.rejects(verifier(fetchImpl).verify(TOKEN), { code: "BOT_CHECK_FAILED" });
});

test("a missing or oversized token is refused without asking Cloudflare", async () => {
  const { calls, fetchImpl } = siteverify({ success: true });

  for (const token of [undefined, null, "", 42, "x".repeat(2049)]) {
    await assert.rejects(verifier(fetchImpl).verify(token), { code: "BOT_CHECK_FAILED" }, String(token).slice(0, 10));
  }
  assert.equal(calls.length, 0);
});

test("when Cloudflare cannot be reached, signup fails closed", async () => {
  const cases = {
    "network error": () => {
      throw new TypeError("fetch failed");
    },
    "server error": () => ({ ok: false, status: 502, json: async () => ({}) }),
    "not json": () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }),
  };

  for (const [label, answer] of Object.entries(cases)) {
    const { fetchImpl } = siteverify(answer);
    await assert.rejects(verifier(fetchImpl).verify(TOKEN), { code: "BOT_CHECK_UNAVAILABLE" }, label);
  }
});

test("an error log never carries the secret key", async () => {
  const logged = [];
  const failing = createTurnstileVerifier({
    secretKey: SECRET,
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
    logger: { error: (...args) => logged.push(JSON.stringify(args)), warn() {} },
  });

  await assert.rejects(failing.verify(TOKEN));

  assert.equal(logged.length, 1);
  assert.equal(logged[0].includes(SECRET), false);
});

test("without a secret key there is no verifier", () => {
  assert.throws(() => createTurnstileVerifier({ secretKey: "" }), /TURNSTILE_SECRET_KEY/);
});

// ── Through the signup route ───────────────────────────────────────────────

async function turnstileServer(t, answer) {
  const cloudflare = siteverify(answer);
  const server = await startAuthServer(t, {
    auth: { turnstileSecretKey: SECRET },
    fetchImpl: cloudflare.fetchImpl,
  });
  return { server, cloudflare };
}

test("with Turnstile on, signup needs a passing token", { skip: SKIP }, async (t) => {
  const { server } = await turnstileServer(t, { success: true, action: "signup" });

  const without = await server.signup(VALID_SIGNUP);
  const withToken = await server.signup({ ...VALID_SIGNUP, turnstileToken: TOKEN });

  assert.equal(without.status, 400);
  assert.equal((await without.json()).code, "BOT_CHECK_FAILED");
  assert.equal(withToken.status, 202);
  assert.equal(await server.countUsers(), 1);
});

test("a failed check creates nothing and costs no password hash", { skip: SKIP }, async (t) => {
  const { server } = await turnstileServer(t, { success: false, "error-codes": ["invalid-input-response"] });

  const response = await server.signup({ ...VALID_SIGNUP, turnstileToken: TOKEN });

  assert.equal(response.status, 400);
  assert.equal(await server.countUsers(), 0);
});

test("an invalid form is refused before the token is spent", { skip: SKIP }, async (t) => {
  const { server, cloudflare } = await turnstileServer(t, { success: true, action: "signup" });

  const response = await server.signup({ ...VALID_SIGNUP, password: "short", turnstileToken: TOKEN });

  // The single-use token was never sent, so the person can fix the password
  // and submit again without solving a new challenge.
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "PASSWORD_TOO_SHORT");
  assert.equal(cloudflare.calls.length, 0);
});

test("an outage refuses signup with a message that says to wait", { skip: SKIP }, async (t) => {
  const { server } = await turnstileServer(t, () => {
    throw new TypeError("fetch failed");
  });

  const response = await server.signup({ ...VALID_SIGNUP, turnstileToken: TOKEN });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    code: "BOT_CHECK_UNAVAILABLE",
    error: "We couldn't check you're human just now. Try again in a moment.",
  });
  assert.equal(await server.countUsers(), 0);
});

test("sign-in is not gated by Turnstile", { skip: SKIP }, async (t) => {
  const { server } = await turnstileServer(t, { success: true, action: "signup" });
  await server.signup({ ...VALID_SIGNUP, turnstileToken: TOKEN });

  const login = await server.login({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });

  assert.equal(login.status, 200);
});
