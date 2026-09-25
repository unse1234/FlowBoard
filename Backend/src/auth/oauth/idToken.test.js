const assert = require("node:assert/strict");
const { createSign, generateKeyPairSync } = require("node:crypto");
const test = require("node:test");
const { createKeySet, verifyIdToken } = require("./idToken");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "k1", use: "sig", alg: "RS256" };
const NOW = Date.UTC(2026, 8, 25, 12);
const SECONDS = Math.floor(NOW / 1000);

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function sign(claims, { header = { alg: "RS256", kid: "k1", typ: "JWT" }, key = privateKey } = {}) {
  const body = `${b64(header)}.${b64(claims)}`;
  const signature = createSign("RSA-SHA256").update(body).sign(key).toString("base64url");
  return `${body}.${signature}`;
}

const CLAIMS = Object.freeze({
  iss: "https://accounts.google.com",
  aud: "client-1",
  sub: "1234567890",
  exp: SECONDS + 300,
  iat: SECONDS - 10,
  nonce: "nonce-1",
  email: "ada@gmail.com",
});

function keySetServing(keys = [JWK]) {
  let fetches = 0;
  let time = NOW;
  const keySet = createKeySet({
    url: "https://keys.test/jwks",
    now: () => time,
    fetchImpl: async () => {
      fetches += 1;
      return new Response(JSON.stringify({ keys }), { status: 200 });
    },
  });
  return { keySet, fetches: () => fetches, advance: (ms) => (time += ms) };
}

const EXPECT = {
  audience: "client-1",
  nonce: "nonce-1",
  now: () => NOW,
  issuer: (claims) => claims.iss === "https://accounts.google.com",
};

test("a well-formed token signed by a published key is accepted", async () => {
  const { keySet } = keySetServing();
  const result = await verifyIdToken(sign(CLAIMS), { keySet, ...EXPECT });

  assert.equal(result.valid, true);
  assert.equal(result.claims.sub, "1234567890");
});

test("every check refuses what it should", async () => {
  const { keySet } = keySetServing();
  const cases = [
    ["another key", sign(CLAIMS, { key: other.privateKey }), "signature"],
    ["alg none", `${b64({ alg: "none", kid: "k1" })}.${b64(CLAIMS)}.`, "malformed"],
    ["HS256", sign(CLAIMS, { header: { alg: "HS256", kid: "k1" } }), "algorithm"],
    ["unknown kid", sign(CLAIMS, { header: { alg: "RS256", kid: "k9" } }), "unknown key"],
    ["another issuer", sign({ ...CLAIMS, iss: "https://evil.test" }), "issuer"],
    ["another audience", sign({ ...CLAIMS, aud: "client-2" }), "audience"],
    ["several audiences, no azp", sign({ ...CLAIMS, aud: ["client-1", "client-2"] }), "authorized party"],
    ["expired", sign({ ...CLAIMS, exp: SECONDS - 120 }), "expired"],
    ["issued in the future", sign({ ...CLAIMS, iat: SECONDS + 600 }), "issued in the future"],
    ["another sign-in's nonce", sign({ ...CLAIMS, nonce: "nonce-2" }), "nonce"],
    ["no nonce", sign({ ...CLAIMS, nonce: undefined }), "nonce"],
    ["no subject", sign({ ...CLAIMS, sub: "" }), "subject"],
    ["garbage", "not.a.token", "malformed"],
    ["not a string", 42, "malformed"],
  ];

  for (const [label, token, reason] of cases) {
    assert.deepEqual(await verifyIdToken(token, { keySet, ...EXPECT }), { valid: false, reason }, label);
  }
});

test("several audiences pass when FlowBoard is the authorised party", async () => {
  const { keySet } = keySetServing();
  const token = sign({ ...CLAIMS, aud: ["client-1", "client-2"], azp: "client-1" });

  assert.equal((await verifyIdToken(token, { keySet, ...EXPECT })).valid, true);
});

test("keys are cached, and an unknown key refetches at most once a minute", async () => {
  const served = keySetServing();

  await verifyIdToken(sign(CLAIMS), { keySet: served.keySet, ...EXPECT });
  await verifyIdToken(sign(CLAIMS), { keySet: served.keySet, ...EXPECT });
  assert.equal(served.fetches(), 1);

  served.advance(30_000);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await verifyIdToken(sign(CLAIMS, { header: { alg: "RS256", kid: `rotated-${attempt}` } }), { keySet: served.keySet, ...EXPECT });
  }
  assert.equal(served.fetches(), 1, "a burst of unknown keys caused refetches");

  served.advance(61_000);
  await verifyIdToken(sign(CLAIMS, { header: { alg: "RS256", kid: "rotated" } }), { keySet: served.keySet, ...EXPECT });
  assert.equal(served.fetches(), 2);
});
