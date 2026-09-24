const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AUTH_ERRORS,
  AuthError,
  CREDENTIAL_CHECK_CODES,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  authErrorForEmailReason,
  invalidCredentials,
  toAuthError,
} = require("./authErrors");
const { EMAIL_REASONS, parseEmailAddress } = require("./emailAddress");

test("an error carries its code, status and a message for the user", () => {
  const error = new AuthError("EMAIL_REQUIRED");

  assert.equal(error.code, "EMAIL_REQUIRED");
  assert.equal(error.status, 400);
  assert.equal(error.message, "Enter your email address.");
  assert.ok(error instanceof Error);
  assert.equal(error.name, "AuthError");
});

test("an unknown code becomes INTERNAL rather than an error with no status", () => {
  const error = new AuthError("NOT_A_REAL_CODE");

  // A typo must not produce a response with an undefined status.
  assert.equal(error.code, "INTERNAL");
  assert.equal(error.status, 500);
});

test("the response body excludes detail and cause", () => {
  const error = new AuthError("INVALID_CREDENTIALS", {
    detail: "no user row for ada@example.com",
    cause: new Error("SELECT failed: relation users does not exist"),
  });

  const body = error.toResponseBody();

  assert.deepEqual(body, {
    ok: false,
    code: "INVALID_CREDENTIALS",
    error: "That email address and password don't match.",
  });
  // The detail names an address and the cause names internals; neither may
  // leave the server.
  const serialised = JSON.stringify(body);
  assert.equal(serialised.includes("ada@example.com"), false);
  assert.equal(serialised.includes("relation users"), false);
});

test("the response body has exactly the three expected keys", () => {
  // Guards against a future field being added that happens to carry
  // diagnostics along with it.
  const body = new AuthError("INTERNAL", { detail: "secret" }).toResponseBody();

  assert.deepEqual(Object.keys(body).sort(), ["code", "error", "ok"]);
});

test("every catalogue entry is usable as a response", () => {
  for (const [code, definition] of Object.entries(AUTH_ERRORS)) {
    const error = new AuthError(code);

    assert.equal(error.code, code, `${code} did not round-trip`);
    assert.equal(error.status, definition.status);
    assert.ok(
      Number.isInteger(error.status) && error.status >= 400 && error.status <= 599,
      `${code} has an unusable status`,
    );
    assert.ok(definition.message.length > 0, `${code} has no message`);
    // A message is read by a person, so it ends as a sentence does.
    assert.match(definition.message, /[.!?]$/, `${code} message is not a sentence`);
  }
});

test("no message leaks internals", () => {
  // A user-facing string should never name a table, a column, a driver or a
  // stack frame.
  const forbidden = /users|password_hash|postgres|argon2|sql|select |undefined|null/i;

  for (const [code, definition] of Object.entries(AUTH_ERRORS)) {
    assert.doesNotMatch(definition.message, forbidden, `${code} message leaks internals`);
  }
});

test("nothing a credential check can answer hints at whether an account exists", () => {
  // The enumeration rule, enforced rather than commented. If someone adds a
  // "no account with that address" message and wires it into login, this fails.
  const revealing =
    /\b(exists?|existing|already|registered|unknown|unrecognised|unrecognized|not found|no account|no such|incorrect password|wrong password|verify your email)\b/i;

  for (const code of CREDENTIAL_CHECK_CODES) {
    const definition = AUTH_ERRORS[code];
    assert.ok(definition, `${code} is not in the catalogue`);
    assert.doesNotMatch(
      definition.message,
      revealing,
      `${code} tells a caller something about the account`,
    );
  }
});

test("the credential-check set excludes anything that implies an account", () => {
  // EMAIL_ALREADY_REGISTERED is the clearest example: reachable from signup
  // only, and never from a sign-in attempt.
  assert.equal(CREDENTIAL_CHECK_CODES.includes("EMAIL_ALREADY_REGISTERED"), false);
  assert.equal(CREDENTIAL_CHECK_CODES.includes("EMAIL_INVALID"), false);
});

test("a failed credential check is one answer with one status", () => {
  const unknownAddress = invalidCredentials("no user row");
  const wrongPassword = invalidCredentials("hash mismatch");
  const noPasswordSet = invalidCredentials("password_hash is null");

  const bodies = [unknownAddress, wrongPassword, noPasswordSet].map((error) =>
    error.toResponseBody(),
  );

  // Identical on the wire. Only `detail` differs, and that is logged.
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
  assert.equal(unknownAddress.status, 401);
  assert.equal(wrongPassword.status, 401);
  assert.equal(noPasswordSet.status, 401);

  // The reason is still recoverable server-side.
  assert.equal(noPasswordSet.detail, "password_hash is null");
});

test("email reasons map onto user-facing answers", () => {
  assert.equal(authErrorForEmailReason(EMAIL_REASONS.REQUIRED).code, "EMAIL_REQUIRED");

  for (const reason of [
    EMAIL_REASONS.TOO_LONG,
    EMAIL_REASONS.LOCAL_PART_TOO_LONG,
    EMAIL_REASONS.DOMAIN_TOO_LONG,
  ]) {
    assert.equal(authErrorForEmailReason(reason).code, "EMAIL_TOO_LONG");
  }

  // The structural reasons collapse: which rule was broken helps nobody.
  for (const reason of [EMAIL_REASONS.INVALID_FORMAT, EMAIL_REASONS.UNSUPPORTED]) {
    assert.equal(authErrorForEmailReason(reason).code, "EMAIL_INVALID");
  }
});

test("the specific email reason survives in detail for the log", () => {
  const error = authErrorForEmailReason(EMAIL_REASONS.UNSUPPORTED);

  assert.equal(error.detail, EMAIL_REASONS.UNSUPPORTED);
  assert.equal(JSON.stringify(error.toResponseBody()).includes("UNSUPPORTED"), false);
});

test("every reason parseEmailAddress can return has a mapping", () => {
  // Adding a reason to emailAddress.js without mapping it here would otherwise
  // surface as a generic INTERNAL to the user.
  for (const reason of Object.values(EMAIL_REASONS)) {
    const error = authErrorForEmailReason(reason);

    assert.notEqual(error.code, "INTERNAL", `${reason} has no mapping`);
    assert.equal(error.status, 400);
  }
});

test("a real rejected address produces a sensible answer end to end", () => {
  const result = parseEmailAddress("ada@example.com\nBcc: victim@example.com");
  assert.equal(result.valid, false);

  const error = authErrorForEmailReason(result.reason);

  assert.equal(error.code, "EMAIL_INVALID");
  assert.equal(error.status, 400);
  // The injected header must not be echoed back.
  assert.equal(error.toResponseBody().error.includes("Bcc"), false);
});

test("an unexpected failure becomes INTERNAL and keeps its cause", () => {
  const thrown = new Error("connect ECONNREFUSED 127.0.0.1:5432");

  const error = toAuthError(thrown);

  assert.equal(error.code, "INTERNAL");
  assert.equal(error.status, 500);
  assert.equal(error.cause, thrown);
  assert.equal(error.detail, "connect ECONNREFUSED 127.0.0.1:5432");
  // The connection details stay server-side.
  assert.equal(error.toResponseBody().error.includes("5432"), false);
});

test("toAuthError passes an AuthError through unchanged", () => {
  const original = new AuthError("EMAIL_REQUIRED");

  assert.equal(toAuthError(original), original);
});

test("toAuthError copes with something that is not an Error", () => {
  for (const thrown of ["a string", 42, null, undefined, { message: "object" }]) {
    const error = toAuthError(thrown);

    assert.equal(error.code, "INTERNAL");
    assert.equal(typeof error.detail, "string");
  }
});

test("retryAfterSeconds is carried for a rate limit", () => {
  const error = new AuthError("TOO_MANY_ATTEMPTS", { retryAfterSeconds: 42 });

  assert.equal(error.status, 429);
  assert.equal(error.retryAfterSeconds, 42);
  // It belongs in a Retry-After header, not in the body.
  assert.equal("retryAfterSeconds" in error.toResponseBody(), false);
});

test("the password length policy is coherent and states itself to the user", () => {
  assert.ok(MIN_PASSWORD_LENGTH >= 8, "below the NIST minimum");
  assert.ok(MAX_PASSWORD_LENGTH >= 64, "OWASP says do not cap below 64");
  assert.ok(MIN_PASSWORD_LENGTH < MAX_PASSWORD_LENGTH);

  // A user cannot comply with a requirement they are not told.
  assert.match(AUTH_ERRORS.PASSWORD_TOO_SHORT.message, new RegExp(String(MIN_PASSWORD_LENGTH)));
  assert.match(AUTH_ERRORS.PASSWORD_TOO_LONG.message, new RegExp(String(MAX_PASSWORD_LENGTH)));
});

test("the policy maximum stays inside the hasher's byte guard", () => {
  const { MAX_PASSWORD_BYTES } = require("./passwordHasher");

  // Worst case four bytes per code point. If the policy allowed more than the
  // hasher accepts, a password that passes validation would throw at hashing.
  assert.ok(
    MAX_PASSWORD_LENGTH * 4 <= MAX_PASSWORD_BYTES,
    "a policy-valid password could exceed the hasher's cap",
  );
});
