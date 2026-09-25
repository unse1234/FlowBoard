const assert = require("node:assert/strict");
const test = require("node:test");
const { createTokenBucket } = require("./tokenBucket");

test("allows a burst up to capacity, then refuses until it refills", () => {
  let time = 0;
  const bucket = createTokenBucket({ capacity: 3, refillPerSecond: 2, now: () => time });

  assert.deepEqual([bucket.take(), bucket.take(), bucket.take(), bucket.take()], [true, true, true, false]);

  time += 500; // one token back
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), false);

  time += 60_000; // never more than capacity, however long it rests
  assert.deepEqual([bucket.take(), bucket.take(), bucket.take(), bucket.take()], [true, true, true, false]);
});

test("a bucket needs a positive size and rate", () => {
  assert.throws(() => createTokenBucket({ capacity: 0, refillPerSecond: 1 }), TypeError);
  assert.throws(() => createTokenBucket({ capacity: 1, refillPerSecond: 0 }), TypeError);
});
