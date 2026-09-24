const assert = require("node:assert/strict");
const test = require("node:test");
const { CONTENT_SECURITY_POLICY, createSecurityHeaders } = require("./securityHeaders");

/** A minimal stand-in for an Express response, recording what was set. */
function createResponse() {
  const headers = new Map();

  return {
    headers,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    get(name) {
      return headers.get(name.toLowerCase());
    },
  };
}

function applyHeaders(config = { hstsMaxAgeSeconds: 15_552_000 }) {
  const response = createResponse();
  let calledNext = false;

  createSecurityHeaders(config)({}, response, () => {
    calledNext = true;
  });

  return { response, calledNext };
}

test("sets nosniff, which is the one that matters most for a JSON API", () => {
  const { response } = applyHeaders();

  // Without it a browser may sniff a JSON body as HTML and run script found
  // inside, turning any endpoint that echoes input into an XSS vector.
  assert.equal(response.get("X-Content-Type-Options"), "nosniff");
});

test("the content security policy forbids everything", () => {
  const { response } = applyHeaders();

  // These responses are never documents; if one were rendered as a page it
  // should be able to load nothing at all.
  assert.equal(response.get("Content-Security-Policy"), CONTENT_SECURITY_POLICY);
  assert.match(CONTENT_SECURITY_POLICY, /default-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /base-uri 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /form-action 'none'/);
});

test("refuses framing for clients that do not understand CSP", () => {
  const { response } = applyHeaders();

  assert.equal(response.get("X-Frame-Options"), "DENY");
});

test("sends no referrer", () => {
  const { response } = applyHeaders();

  // API paths carry board and account identifiers.
  assert.equal(response.get("Referrer-Policy"), "no-referrer");
});

test("HSTS covers subdomains and never asks for preloading", () => {
  const { response } = applyHeaders({ hstsMaxAgeSeconds: 15_552_000 });

  assert.equal(
    response.get("Strict-Transport-Security"),
    "max-age=15552000; includeSubDomains",
  );
  // Preloading is effectively irreversible, so it has to be a deliberate,
  // separate decision rather than something a default turns on.
  assert.doesNotMatch(response.get("Strict-Transport-Security"), /preload/);
});

test("HSTS is omitted entirely when the age is zero", () => {
  const { response } = applyHeaders({ hstsMaxAgeSeconds: 0 });

  // For a deployment not behind TLS yet: a max-age of 0 would actively clear an
  // existing policy, so the header is left off instead.
  assert.equal(response.get("Strict-Transport-Security"), undefined);
});

test("passes the request along", () => {
  const { calledNext } = applyHeaders();

  assert.equal(calledNext, true);
});

test("sets no header that browsers now ignore or that would fight CORS", () => {
  const { response } = applyHeaders();
  const names = [...response.headers.keys()];

  // Deprecated, and the filter it enabled introduced bugs of its own.
  assert.equal(names.includes("x-xss-protection"), false);
  // CORS already governs who may read these responses, and the web app is on a
  // different origin, so a same-site resource policy would risk breaking it for
  // no gain.
  assert.equal(names.includes("cross-origin-resource-policy"), false);
});
