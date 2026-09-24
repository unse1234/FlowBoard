const assert = require("node:assert/strict");
const { createHmac, randomBytes } = require("node:crypto");
const test = require("node:test");
const { CLOCK_SKEW_SECONDS, MAX_TOKEN_LENGTH, createAccessTokens } = require("./accessTokens");

const CURRENT_KEY = { id: "2026-09", secret: randomBytes(32) };
const PREVIOUS_KEY = { id: "2026-06", secret: randomBytes(32) };

const CONFIG = Object.freeze({
  keys: [CURRENT_KEY, PREVIOUS_KEY],
  ttlSeconds: 900,
  issuer: "flowboard",
  audience: "flowboard-api",
});

const SUBJECT = Object.freeze({
  userId: "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b",
  sessionId: "9e8d7c6b-5a49-4382-a716-f5e4d3c2b1a0",
  tokenVersion: 0,
});

/** A clock tests can move. Starts at a whole second so iat/exp arithmetic is exact. */
function createClock(start = Date.UTC(2026, 8, 24, 12, 0, 0)) {
  let current = start;
  return {
    now: () => current,
    advance(seconds) {
      current += seconds * 1000;
    },
  };
}

function tokensAt(clock, config = CONFIG) {
  return createAccessTokens({ config, now: clock.now });
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * Sign an arbitrary header and payload, the way an attacker holding a key, or
 * a buggy issuer, would. Lets each check in `verify` be tested on its own.
 */
function forge(header, payload, secret = CURRENT_KEY.secret) {
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function validPayload(clock, overrides = {}) {
  const iat = Math.floor(clock.now() / 1000);
  return {
    iss: "flowboard",
    aud: "flowboard-api",
    sub: SUBJECT.userId,
    sid: SUBJECT.sessionId,
    ver: 0,
    iat,
    exp: iat + 900,
    ...overrides,
  };
}

const HEADER = Object.freeze({ alg: "HS256", typ: "JWT", kid: CURRENT_KEY.id });

test("a token it issues verifies, and carries who and which session", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);

  const { token, expiresAt } = tokens.issue({ ...SUBJECT, tokenVersion: 3 });
  const result = tokens.verify(token);

  assert.equal(result.valid, true);
  assert.deepEqual(result.claims, {
    userId: SUBJECT.userId,
    sessionId: SUBJECT.sessionId,
    tokenVersion: 3,
    issuedAt: new Date(clock.now()),
    expiresAt: new Date(clock.now() + 900_000),
  });
  assert.deepEqual(expiresAt, result.claims.expiresAt);
});

test("a token is a compact JWS signed with the first key", () => {
  const tokens = tokensAt(createClock());
  const { token } = tokens.issue(SUBJECT);
  const [header, payload, signature] = token.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), HEADER);
  assert.deepEqual(Object.keys(JSON.parse(Buffer.from(payload, "base64url"))).sort(), [
    "aud",
    "exp",
    "iat",
    "iss",
    "sid",
    "sub",
    "ver",
  ]);
  assert.equal(Buffer.from(signature, "base64url").length, 32);
});

test("a token carries no personal data", () => {
  const { token } = tokensAt(createClock()).issue(SUBJECT);
  const payload = Buffer.from(token.split(".")[1], "base64url").toString();

  // Anyone holding a JWT can read it: it is signed, not encrypted.
  assert.doesNotMatch(payload, /@|email|name/i);
});

test("a token is rejected from the second it expires", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);
  const { token } = tokens.issue(SUBJECT);

  clock.advance(899);
  assert.equal(tokens.verify(token).valid, true);

  clock.advance(1);
  assert.deepEqual(tokens.verify(token), { valid: false, reason: "expired" });
});

test("a token from a peer whose clock runs slightly ahead is accepted, a far-future one is not", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);
  const now = Math.floor(clock.now() / 1000);

  const slightlyAhead = forge(HEADER, validPayload(clock, { iat: now + CLOCK_SKEW_SECONDS }));
  const farAhead = forge(HEADER, validPayload(clock, { iat: now + CLOCK_SKEW_SECONDS + 1 }));

  assert.equal(tokens.verify(slightlyAhead).valid, true);
  assert.deepEqual(tokens.verify(farAhead), { valid: false, reason: "not_yet_valid" });
});

test("changing any claim breaks the signature", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);
  const [header, , signature] = tokens.issue({ ...SUBJECT, tokenVersion: 2 }).token.split(".");

  // Someone else's account, the classic edit.
  const otherUser = encode(validPayload(clock, { sub: "00000000-0000-4000-8000-000000000000", ver: 2 }));
  // An older token_version, to look like a token from before a "sign out everywhere".
  const olderVersion = encode(validPayload(clock, { ver: 0 }));
  // A longer life.
  const longerLife = encode(validPayload(clock, { ver: 2, exp: Math.floor(clock.now() / 1000) + 86_400 }));

  for (const payload of [otherUser, olderVersion, longerLife]) {
    assert.deepEqual(tokens.verify(`${header}.${payload}.${signature}`), {
      valid: false,
      reason: "bad_signature",
    });
  }
});

test("a token signed with a secret it does not hold is rejected", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);

  // The right kid, so the lookup succeeds and the signature has to decide.
  const forged = forge(HEADER, validPayload(clock), randomBytes(32));

  assert.deepEqual(tokens.verify(forged), { valid: false, reason: "bad_signature" });
});

test("alg none and every other algorithm are refused whatever the signature", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);
  const payload = encode(validPayload(clock));

  const unsigned = `${encode({ alg: "none", typ: "JWT", kid: CURRENT_KEY.id })}.${payload}.`;
  // The trailing empty segment fails the shape check first; either way it must not pass.
  assert.equal(tokens.verify(unsigned).valid, false);

  for (const alg of ["none", "HS512", "RS256", "ES256", "hs256"]) {
    const token = forge({ ...HEADER, alg }, validPayload(clock));
    assert.deepEqual(tokens.verify(token), { valid: false, reason: "unsupported_algorithm" }, alg);
  }
});

test("a header carrying anything beyond alg, typ and kid is refused", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);

  // jku and jwk tell a careless verifier where to fetch the key from.
  for (const extra of [{ jku: "https://evil.example/keys" }, { jwk: { kty: "oct" } }, { crit: ["exp"] }]) {
    const token = forge({ ...HEADER, ...extra }, validPayload(clock));
    assert.deepEqual(tokens.verify(token), { valid: false, reason: "malformed" });
  }
});

test("a key can be rotated without signing anyone out", () => {
  const clock = createClock();
  const beforeRotation = tokensAt(clock, { ...CONFIG, keys: [PREVIOUS_KEY] });
  const afterRotation = tokensAt(clock);
  const afterRetirement = tokensAt(clock, { ...CONFIG, keys: [CURRENT_KEY] });

  const oldToken = beforeRotation.issue(SUBJECT).token;

  // Still listed, so still verifies, though it no longer signs.
  assert.equal(afterRotation.verify(oldToken).valid, true);
  assert.equal(JSON.parse(Buffer.from(afterRotation.issue(SUBJECT).token.split(".")[0], "base64url")).kid, CURRENT_KEY.id);
  // Removed, so its tokens are gone.
  assert.deepEqual(afterRetirement.verify(oldToken), { valid: false, reason: "unknown_key" });
});

test("a token naming no key, or an unknown one, is rejected", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);

  const { kid, ...withoutKid } = HEADER;
  assert.equal(kid, CURRENT_KEY.id);

  assert.deepEqual(tokens.verify(forge(withoutKid, validPayload(clock))), {
    valid: false,
    reason: "unknown_key",
  });
  assert.deepEqual(tokens.verify(forge({ ...HEADER, kid: "made-up" }, validPayload(clock))), {
    valid: false,
    reason: "unknown_key",
  });
  // An inherited property name must not find a key.
  assert.deepEqual(tokens.verify(forge({ ...HEADER, kid: "constructor" }, validPayload(clock))), {
    valid: false,
    reason: "unknown_key",
  });
});

test("claims are checked even under a valid signature", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);

  const cases = {
    "another issuer": { iss: "someone-else" },
    "another audience": { aud: "another-api" },
    "subject not a uuid": { sub: "admin" },
    "uppercase uuid": { sub: SUBJECT.userId.toUpperCase() },
    "no session": { sid: undefined },
    "fractional version": { ver: 1.5 },
    "negative version": { ver: -1 },
    "version as text": { ver: "0" },
    "expiry as text": { exp: "9999999999" },
    "expires before issued": { exp: Math.floor(clock.now() / 1000) - 1 },
  };

  for (const [label, overrides] of Object.entries(cases)) {
    const token = forge(HEADER, validPayload(clock, overrides));
    assert.deepEqual(tokens.verify(token), { valid: false, reason: "invalid_claims" }, label);
  }

  // A payload that is not an object at all.
  assert.deepEqual(tokens.verify(forge(HEADER, ["not", "claims"])), {
    valid: false,
    reason: "invalid_claims",
  });
});

test("an unknown extra claim is tolerated, so adding one never breaks a rolling deploy", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);

  const token = forge(HEADER, validPayload(clock, { scope: "future" }));

  assert.equal(tokens.verify(token).valid, true);
});

test("a signature has exactly one valid spelling", () => {
  const tokens = tokensAt(createClock());
  const { token } = tokens.issue(SUBJECT);
  const [header, payload, signature] = token.split(".");

  // 32 bytes is 43 base64url characters, the last carrying two unused bits.
  // Node decodes every value of those bits to the same bytes.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = alphabet.indexOf(signature.at(-1));
  const sibling = `${signature.slice(0, -1)}${alphabet[last ^ 1]}`;

  assert.ok(Buffer.from(sibling, "base64url").equals(Buffer.from(signature, "base64url")));
  assert.deepEqual(tokens.verify(`${header}.${payload}.${sibling}`), {
    valid: false,
    reason: "malformed",
  });
});

test("garbage never throws, and is reported as malformed", () => {
  const tokens = tokensAt(createClock());
  const { token } = tokens.issue(SUBJECT);

  const garbage = [
    undefined,
    null,
    42,
    {},
    "",
    "Bearer abc",
    "a.b",
    `${token}.extra`,
    token.replace(".", ".."),
    `${token.slice(0, 10)}+${token.slice(11)}`,
    `${encode("not an object")}.${token.split(".")[1]}.${token.split(".")[2]}`,
    `${Buffer.from("{not json").toString("base64url")}.${token.split(".")[1]}.${token.split(".")[2]}`,
    "a".repeat(MAX_TOKEN_LENGTH + 1),
  ];

  for (const input of garbage) {
    const result = tokens.verify(input);
    assert.equal(result.valid, false, String(input).slice(0, 40));
    assert.equal(result.reason, "malformed", String(input).slice(0, 40));
  }
});

test("an oversized token is refused before any work is done on it, even if correctly signed", () => {
  const clock = createClock();
  const tokens = tokensAt(clock);

  const padded = forge(HEADER, validPayload(clock, { padding: "x".repeat(MAX_TOKEN_LENGTH) }));

  assert.ok(padded.length > MAX_TOKEN_LENGTH);
  assert.deepEqual(tokens.verify(padded), { valid: false, reason: "malformed" });
});

test("issuing for a malformed subject is a programming error, not a token", () => {
  const tokens = tokensAt(createClock());

  assert.throws(() => tokens.issue({ ...SUBJECT, userId: "user_123" }), TypeError);
  assert.throws(() => tokens.issue({ ...SUBJECT, sessionId: undefined }), TypeError);
  assert.throws(() => tokens.issue({ ...SUBJECT, tokenVersion: -1 }), TypeError);
  assert.throws(() => tokens.issue({ ...SUBJECT, tokenVersion: "0" }), TypeError);
});

test("without signing keys it refuses to exist", () => {
  for (const keys of [undefined, null, []]) {
    assert.throws(() => createAccessTokens({ config: { ...CONFIG, keys } }), /AUTH_ACCESS_TOKEN_KEYS/);
  }
});
