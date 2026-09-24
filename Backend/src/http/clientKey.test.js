const assert = require("node:assert/strict");
const test = require("node:test");
const { rateLimitKeyFor } = require("./clientKey");

test("an IPv4 client is counted by its address", () => {
  assert.equal(rateLimitKeyFor("203.0.113.7"), "203.0.113.7");
});

test("an IPv6 client is counted by its /64, however it rotates within it", () => {
  const addresses = [
    "2001:db8:1234:5678::1",
    "2001:db8:1234:5678:ffff:ffff:ffff:ffff",
    "2001:0db8:1234:5678:0000:0000:0000:0042",
    "2001:DB8:1234:5678:a:b:c:d",
  ];

  const keys = new Set(addresses.map(rateLimitKeyFor));

  assert.deepEqual([...keys], ["2001:db8:1234:5678::/64"]);
});

test("different /64s are different clients", () => {
  assert.notEqual(rateLimitKeyFor("2001:db8:1234:5678::1"), rateLimitKeyFor("2001:db8:1234:5679::1"));
});

test("an IPv4-mapped IPv6 address is its IPv4 address", () => {
  assert.equal(rateLimitKeyFor("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(rateLimitKeyFor("::FFFF:203.0.113.7"), "203.0.113.7");
});

test("the loopback and compressed forms expand correctly", () => {
  assert.equal(rateLimitKeyFor("::1"), "0:0:0:0::/64");
  assert.equal(rateLimitKeyFor("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(rateLimitKeyFor("2001:db8::"), "2001:db8:0:0::/64");
});

test("anything that is not an address is its own key", () => {
  assert.equal(rateLimitKeyFor("edge-client-unknown"), "edge-client-unknown");
  assert.equal(rateLimitKeyFor(""), "unknown");
  assert.equal(rateLimitKeyFor(null), "unknown");
  assert.equal(rateLimitKeyFor(undefined), "unknown");
});
