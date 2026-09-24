const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EDGE_ADDRESS_HEADER,
  EDGE_SECRET_HEADER,
  UNKNOWN_EDGE_CLIENT,
  createEdgeRequestReader,
} = require("./edgeRequest");

const SECRET = "k3VQbq1Hk6yJ2mZ0x8wP4rT7uN5sL9cD2fG6hJ1aB3e";

/** An Express-shaped request: a socket address and some headers. */
function request({ ip = "10.0.0.7", headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ip, get: (name) => lower[name.toLowerCase()] };
}

test("with no edge configured, the socket address is the client", () => {
  const read = createEdgeRequestReader({ edgeSecret: null });

  assert.deepEqual(read(request({ ip: "203.0.113.9" })), { trusted: true, address: "203.0.113.9" });
});

test("with no edge configured, forwarded headers are ignored, not believed", () => {
  const read = createEdgeRequestReader({ edgeSecret: null });

  const result = read(
    request({ ip: "203.0.113.9", headers: { [EDGE_ADDRESS_HEADER]: "198.51.100.1", "x-forwarded-for": "198.51.100.2" } }),
  );

  assert.equal(result.address, "203.0.113.9");
});

test("with an edge configured, a request carrying the secret gets the address Vercel reported", () => {
  const read = createEdgeRequestReader({ edgeSecret: SECRET });

  const result = read(
    request({ headers: { [EDGE_SECRET_HEADER]: SECRET, [EDGE_ADDRESS_HEADER]: "198.51.100.23" } }),
  );

  assert.deepEqual(result, { trusted: true, address: "198.51.100.23" });
});

test("a request that went around the edge is not trusted, whatever it claims", () => {
  const read = createEdgeRequestReader({ edgeSecret: SECRET });

  const cases = {
    "no secret": { [EDGE_ADDRESS_HEADER]: "198.51.100.23" },
    "empty secret": { [EDGE_SECRET_HEADER]: "", [EDGE_ADDRESS_HEADER]: "198.51.100.23" },
    "a wrong secret": { [EDGE_SECRET_HEADER]: SECRET.replace("k", "K"), [EDGE_ADDRESS_HEADER]: "198.51.100.23" },
    // A different length must not throw out of timingSafeEqual.
    "a short secret": { [EDGE_SECRET_HEADER]: "x", [EDGE_ADDRESS_HEADER]: "198.51.100.23" },
    "a long secret": { [EDGE_SECRET_HEADER]: `${SECRET}${SECRET}`, [EDGE_ADDRESS_HEADER]: "198.51.100.23" },
  };

  for (const [label, headers] of Object.entries(cases)) {
    const result = read(request({ headers }));
    assert.equal(result.trusted, false, label);
    assert.equal(result.address, null, label);
  }
});

test("behind the edge, only Vercel's own header is read, never X-Forwarded-For", () => {
  const read = createEdgeRequestReader({ edgeSecret: SECRET });

  // X-Forwarded-For is appended to by Cloudflare and Render, and a client
  // could have started it. Vercel's copy is overwritten, not appended.
  const result = read(
    request({
      headers: {
        [EDGE_SECRET_HEADER]: SECRET,
        [EDGE_ADDRESS_HEADER]: "198.51.100.23",
        "x-forwarded-for": "6.6.6.6, 198.51.100.23, 104.16.0.1",
      },
    }),
  );

  assert.equal(result.address, "198.51.100.23");
});

test("IPv6 addresses are taken as they are", () => {
  const read = createEdgeRequestReader({ edgeSecret: SECRET });

  const result = read(request({ headers: { [EDGE_SECRET_HEADER]: SECRET, [EDGE_ADDRESS_HEADER]: "2001:db8::7" } }));

  assert.equal(result.address, "2001:db8::7");
});

test("if a proxy appended to Vercel's header, the first entry is still the client", () => {
  const read = createEdgeRequestReader({ edgeSecret: SECRET });

  const result = read(
    request({ headers: { [EDGE_SECRET_HEADER]: SECRET, [EDGE_ADDRESS_HEADER]: "198.51.100.23, 104.16.0.1" } }),
  );

  assert.equal(result.address, "198.51.100.23");
});

test("an edge request with no usable address shares one bucket, never gets none", () => {
  const read = createEdgeRequestReader({ edgeSecret: SECRET });

  for (const value of [undefined, "", "not-an-ip", "300.1.1.1", "  ,198.51.100.23"]) {
    const headers = { [EDGE_SECRET_HEADER]: SECRET };
    if (value !== undefined) headers[EDGE_ADDRESS_HEADER] = value;

    const result = read(request({ headers }));
    assert.equal(result.trusted, true, String(value));
    assert.equal(result.address, UNKNOWN_EDGE_CLIENT, String(value));
  }
});
