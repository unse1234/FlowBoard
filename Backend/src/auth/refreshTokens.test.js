const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const test = require("node:test");
const {
  REFRESH_TOKEN_PATTERN,
  createRefreshCookie,
  generateRefreshToken,
  hashRefreshToken,
} = require("./refreshTokens");

const SETTINGS = Object.freeze({
  name: "__Secure-flowboard_refresh",
  secure: true,
  sameSite: "strict",
  path: "/api/auth",
});

const requestWithCookie = (cookie) => ({ headers: cookie === undefined ? {} : { cookie } });

/** Records what a route asked Express to do, so the attributes can be compared. */
function createResponseRecorder() {
  const calls = [];
  return {
    calls,
    cookie: (name, value, options) => calls.push({ method: "cookie", name, value, options }),
    clearCookie: (name, options) => calls.push({ method: "clearCookie", name, options }),
  };
}

test("a refresh token is 256 random bits as base64url, and never the same twice", () => {
  const first = generateRefreshToken();
  const second = generateRefreshToken();

  assert.match(first.token, REFRESH_TOKEN_PATTERN);
  assert.equal(Buffer.from(first.token, "base64url").length, 32);
  assert.notEqual(first.token, second.token);
});

test("what is stored is the SHA-256 of the token, never the token", () => {
  const { token, hash } = generateRefreshToken();

  assert.equal(hash.length, 32);
  assert.ok(hash.equals(createHash("sha256").update(token).digest()));
  assert.ok(hash.equals(hashRefreshToken(token)));
  assert.equal(hash.includes(Buffer.from(token)), false);
});

test("the cookie reader returns the one token it finds among other cookies", () => {
  const cookie = createRefreshCookie(SETTINGS);
  const { token } = generateRefreshToken();

  assert.equal(
    cookie.read(requestWithCookie(`theme=dark; ${SETTINGS.name}=${token}; other=1`)),
    token,
  );
});

test("the cookie reader answers null for anything that is not exactly one well-formed token", () => {
  const cookie = createRefreshCookie(SETTINGS);
  const { token } = generateRefreshToken();
  const { token: planted } = generateRefreshToken();

  const cases = {
    "no cookie header": undefined,
    "empty header": "",
    "other cookies only": "theme=dark",
    "a similar name": `x${SETTINGS.name}=${token}`,
    "the unprefixed name": `flowboard_refresh=${token}`,
    "too short": `${SETTINGS.name}=${token.slice(1)}`,
    "not base64url": `${SETTINGS.name}=${token.slice(1)}+`,
    "quoted": `${SETTINGS.name}="${token.slice(2)}"`,
    "empty value": `${SETTINGS.name}=`,
    // A second same-named cookie is what a planted one looks like. Picking
    // either could sign the victim into the attacker's account.
    "sent twice": `${SETTINGS.name}=${planted}; ${SETTINGS.name}=${token}`,
  };

  for (const [label, header] of Object.entries(cases)) {
    assert.equal(cookie.read(requestWithCookie(header)), null, label);
  }
});

test("setting and clearing the cookie name the same attributes", () => {
  const cookie = createRefreshCookie(SETTINGS);
  const response = createResponseRecorder();

  cookie.set(response, "token", new Date(Date.now() + 60_000));
  cookie.clear(response);

  const [set, clear] = response.calls;
  const { maxAge, ...setAttributes } = set.options;

  // A browser matches on name, path and domain. A clear that names another
  // path leaves the real cookie in place and signs nobody out.
  assert.deepEqual(setAttributes, { httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth" });
  assert.deepEqual(clear.options, setAttributes);
  assert.equal(set.name, clear.name);
  assert.ok(maxAge > 55_000 && maxAge <= 60_000, `maxAge ${maxAge}`);
});

test("a cookie for a token that has already expired is set to expire at once", () => {
  const cookie = createRefreshCookie(SETTINGS);
  const response = createResponseRecorder();

  cookie.set(response, "token", new Date(Date.now() - 1_000));

  assert.equal(response.calls[0].options.maxAge, 0);
});
