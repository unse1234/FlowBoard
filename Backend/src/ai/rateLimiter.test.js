const assert = require("node:assert/strict");
const test = require("node:test");
const { createRateLimiter } = require("./rateLimiter");

test("allows up to the limit in a window, then says when to retry", () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });

  assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("a").allowed, true);
  assert.deepEqual(limiter.consume("a"), { allowed: false, retryAfterSeconds: 60 });
  assert.equal(limiter.consume("b").allowed, true, "each client has its own count");

  now = 45_000;
  assert.deepEqual(limiter.consume("a"), { allowed: false, retryAfterSeconds: 15 });

  now = 60_000;
  assert.equal(limiter.consume("a").allowed, true, "a new window starts");
});
