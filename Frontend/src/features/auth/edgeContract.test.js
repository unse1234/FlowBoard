import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const backendEdge = require("../../../../Backend/src/http/edgeRequest.js");
const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));

/**
 * The edge contract: Vercel's route (Frontend/vercel.json) adds a secret
 * header, and the backend (Backend/src/http/edgeRequest.js) refuses auth
 * requests without it (chunk 7.1). If either side renames the header, every
 * sign-in in production fails with ORIGIN_NOT_ALLOWED, and nothing local
 * notices. So this does.
 */

const authRoute = vercel.routes?.find((route) => route.src === "/api/auth/(.*)");
const secretTransform = authRoute?.transforms?.find(
  (transform) => transform.type === "request.headers" && transform.op === "set",
);

test("Vercel forwards /api/auth to the API, path intact", () => {
  assert.ok(authRoute, "vercel.json has no /api/auth route");
  assert.match(authRoute.dest, /^https:\/\/[a-z0-9-]+\.onrender\.com\/api\/auth\/\$1$/);
});

test("the header Vercel sets is the one the backend checks", () => {
  assert.ok(secretTransform, "the /api/auth route sets no request header");
  assert.equal(secretTransform.target.key, backendEdge.EDGE_SECRET_HEADER);
});

test("the secret comes from Vercel's environment, never from this file", () => {
  assert.equal(secretTransform.args, "$AUTH_PROXY_SECRET");
  assert.deepEqual(secretTransform.env, ["AUTH_PROXY_SECRET"]);
});

// ── Web app security headers (finding F-6, chunk 7.6) ──────────────────────

const pageHeaders = Object.fromEntries(
  (vercel.headers?.find((rule) => rule.source === "/(.*)")?.headers ?? []).map(({ key, value }) => [key, value]),
);

test("every page is served with the safe headers enforced", () => {
  assert.equal(pageHeaders["X-Content-Type-Options"], "nosniff");
  assert.equal(pageHeaders["Referrer-Policy"], "strict-origin-when-cross-origin");
  // Voice chat needs the microphone; nothing needs the camera.
  assert.match(pageHeaders["Permissions-Policy"], /microphone=\(self\)/);
  assert.match(pageHeaders["Permissions-Policy"], /camera=\(\)/);
});

test("the CSP reports rather than blocks until it has been seen clean in a browser", () => {
  assert.ok(pageHeaders["Content-Security-Policy-Report-Only"], "no report-only CSP");
  assert.equal(pageHeaders["Content-Security-Policy"], undefined);
});

test("the CSP allows the API the auth route forwards to, over HTTPS and WebSocket", () => {
  const apiOrigin = new URL(authRoute.dest.replace("$1", "")).origin;
  const csp = pageHeaders["Content-Security-Policy-Report-Only"];

  assert.ok(csp.includes(apiOrigin), `connect-src lacks ${apiOrigin}`);
  assert.ok(csp.includes(apiOrigin.replace("https://", "wss://")), "connect-src lacks the socket");
  // Turnstile's script and frame.
  assert.match(csp, /script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
});
