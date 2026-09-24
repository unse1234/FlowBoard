const assert = require("node:assert/strict");
const test = require("node:test");
const { isTrustedOrigin } = require("./originCheck");

const TRUSTED = Object.freeze(["http://localhost:5173", "https://app.flowboard.example"]);

const request = (method, origin) => ({
  method,
  get: (name) => (name.toLowerCase() === "origin" ? origin : undefined),
});

test("a state-changing request from a listed origin is trusted", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(isTrustedOrigin(request(method, "https://app.flowboard.example"), TRUSTED), true, method);
  }
});

test("a state-changing request from anywhere else is not", () => {
  const untrusted = {
    "another site": "https://evil.example",
    "a sibling subdomain": "https://user-content.flowboard.example",
    "the right host over http": "http://app.flowboard.example",
    "the right host on another port": "https://app.flowboard.example:8443",
    "a trailing slash": "https://app.flowboard.example/",
    "a path": "https://app.flowboard.example/login",
    "different case": "HTTPS://APP.FLOWBOARD.EXAMPLE",
    "a lookalike suffix": "https://app.flowboard.example.evil.example",
    // Sandboxed frames, file: pages and some redirects: could be anyone.
    "the null origin": "null",
    "an empty header": "",
    "no header at all": undefined,
  };

  for (const [label, origin] of Object.entries(untrusted)) {
    assert.equal(isTrustedOrigin(request("POST", origin), TRUSTED), false, label);
  }
});

test("null is never trusted, even if someone configures it", () => {
  assert.equal(isTrustedOrigin(request("POST", "null"), [...TRUSTED, "null"]), false);
});

test("safe methods are not checked", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(isTrustedOrigin(request(method, "https://evil.example"), TRUSTED), true, method);
    assert.equal(isTrustedOrigin(request(method, undefined), TRUSTED), true, method);
  }
});
