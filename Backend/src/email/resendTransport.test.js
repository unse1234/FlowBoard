const assert = require("node:assert/strict");
const test = require("node:test");
const { EmailDeliveryError, RESEND_EMAILS_URL, createResendTransport } = require("./resendTransport");

const API_KEY = "re_test_0123456789abcdef";
const MESSAGE = Object.freeze({
  from: "FlowBoard <no-reply@flowboard.test>",
  to: "ada@example.com",
  subject: "Confirm your email address for FlowBoard",
  html: "<p>token=secret-token-value</p>",
  text: "token=secret-token-value",
  idempotencyKey: "verify-email:abc",
  tags: [{ name: "kind", value: "verify-email" }],
});

/** A fetch that answers from a script, one entry per call, recording each request. */
function scriptedFetch(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const step = script[calls.length - 1];
    if (!step) throw new Error("unexpected extra call");
    if (step instanceof Error) throw step;
    return new Response(JSON.stringify(step.body), { status: step.status });
  };
  return { fetchImpl, calls };
}

function transportWith(script) {
  const { fetchImpl, calls } = scriptedFetch(script);
  const sleeps = [];
  const transport = createResendTransport({
    apiKey: API_KEY,
    fetchImpl,
    retryDelaysMs: [10, 20],
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { transport, calls, sleeps };
}

test("sends one POST to Resend with the key, the idempotency key and the message", async () => {
  const { transport, calls } = transportWith([{ status: 200, body: { id: "msg-1" } }]);

  const result = await transport.send(MESSAGE);

  assert.deepEqual(result, { id: "msg-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RESEND_EMAILS_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, `Bearer ${API_KEY}`);
  assert.equal(calls[0].init.headers["idempotency-key"], "verify-email:abc");
  assert.deepEqual(calls[0].body, {
    from: MESSAGE.from,
    to: [MESSAGE.to],
    subject: MESSAGE.subject,
    html: MESSAGE.html,
    text: MESSAGE.text,
    tags: MESSAGE.tags,
  });
});

test("a failure that can clear is retried under the same idempotency key", async () => {
  const cases = [
    ["a 500", { status: 500, body: { name: "application_error" } }],
    ["a 503", { status: 503, body: { name: "service_unavailable" } }],
    ["the per-second limit", { status: 429, body: { name: "rate_limit_exceeded" } }],
    ["the same key still in flight", { status: 409, body: { name: "concurrent_idempotent_requests" } }],
    ["the network", new TypeError("fetch failed")],
  ];

  for (const [label, failure] of cases) {
    const { transport, calls, sleeps } = transportWith([failure, { status: 200, body: { id: "msg-2" } }]);

    assert.deepEqual(await transport.send(MESSAGE), { id: "msg-2" }, label);
    assert.equal(calls.length, 2, label);
    assert.equal(calls[1].init.headers["idempotency-key"], calls[0].init.headers["idempotency-key"], label);
    assert.deepEqual(sleeps, [10], label);
  }
});

test("a failure that will repeat is not retried", async () => {
  const cases = [
    ["the daily quota", 429, "daily_quota_exceeded"],
    ["the monthly quota", 429, "monthly_quota_exceeded"],
    ["an unverified domain", 403, "validation_error"],
    ["a bad key", 401, "missing_api_key"],
    ["a rejected payload", 422, "missing_required_field"],
    ["a key reused for another payload", 409, "invalid_idempotent_request"],
  ];

  for (const [label, status, name] of cases) {
    const { transport, calls } = transportWith([{ status, body: { name, message: "no" } }]);

    await assert.rejects(transport.send(MESSAGE), (error) => {
      assert.ok(error instanceof EmailDeliveryError, label);
      assert.equal(error.status, status, label);
      assert.equal(error.type, name, label);
      return true;
    });
    assert.equal(calls.length, 1, label);
  }
});

test("gives up after the configured retries", async () => {
  const outage = { status: 503, body: { name: "service_unavailable" } };
  const { transport, calls, sleeps } = transportWith([outage, outage, outage]);

  await assert.rejects(transport.send(MESSAGE), EmailDeliveryError);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [10, 20]);
});

test("a success without an id is a failure, not a guess", async () => {
  const { transport } = transportWith([{ status: 200, body: {} }]);
  await assert.rejects(transport.send(MESSAGE), EmailDeliveryError);
});

test("an error says what Resend answered and nothing that was sent", async () => {
  const { transport } = transportWith([{ status: 422, body: { name: "validation_error", message: "bad" } }]);

  const error = await transport.send(MESSAGE).catch((caught) => caught);
  const described = `${error.message} ${JSON.stringify(error)}`;

  assert.match(error.message, /422/);
  assert.ok(!described.includes(API_KEY), "the API key");
  assert.ok(!described.includes("secret-token-value"), "the body");
  assert.ok(!described.includes(MESSAGE.to), "the recipient");
});

test("every email needs an idempotency key Resend will accept", async () => {
  const { transport, calls } = transportWith([]);

  await assert.rejects(transport.send({ ...MESSAGE, idempotencyKey: "" }), TypeError);
  await assert.rejects(transport.send({ ...MESSAGE, idempotencyKey: undefined }), TypeError);
  await assert.rejects(transport.send({ ...MESSAGE, idempotencyKey: "k".repeat(257) }), TypeError);
  assert.equal(calls.length, 0);
});

test("needs an API key", () => {
  assert.throws(() => createResendTransport({ apiKey: "" }), /RESEND_API_KEY/);
  assert.throws(() => createResendTransport({ apiKey: undefined }), /RESEND_API_KEY/);
});
