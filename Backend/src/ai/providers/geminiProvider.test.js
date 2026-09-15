const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiError } = require("@google/genai");
const { createGeminiProvider } = require("./geminiProvider");

const CONFIG = { geminiApiKey: "test-key", geminiModel: "gemini-test" };
const REQUEST = {
  systemInstruction: "rules",
  prompt: "<request>\nx\n</request>",
  schema: { type: "object" },
};
const OK_RESPONSE = { text: '{"nodes":[]}', candidates: [{ finishReason: "STOP" }] };

function providerWith(generateContent, options = {}) {
  return createGeminiProvider(CONFIG, {
    createClient: () => ({ models: { generateContent } }),
    retryDelayMs: 0,
    ...options,
  });
}

test("refuses to call Gemini without an API key", async () => {
  let clientCreated = false;
  const provider = createGeminiProvider(
    { geminiApiKey: null, geminiModel: "gemini-test" },
    {
      createClient: () => {
        clientCreated = true;
      },
    },
  );

  await assert.rejects(provider.generateJson(REQUEST), { code: "AI_NOT_CONFIGURED" });
  assert.equal(clientCreated, false);
});

test("asks Gemini for JSON that follows the schema", async () => {
  let call = null;
  const provider = providerWith(async (params) => {
    call = params;
    return OK_RESPONSE;
  });

  const result = await provider.generateJson(REQUEST);

  assert.equal(result.text, OK_RESPONSE.text);
  assert.equal(call.model, "gemini-test");
  assert.equal(call.contents, REQUEST.prompt);
  assert.equal(call.config.systemInstruction, "rules");
  assert.equal(call.config.responseMimeType, "application/json");
  assert.deepEqual(call.config.responseJsonSchema, REQUEST.schema);
  assert.ok(call.config.abortSignal instanceof AbortSignal);
});

test("maps Gemini failures onto AI error codes", async () => {
  const cases = [
    [new ApiError({ status: 429, message: "Resource exhausted" }), "AI_RATE_LIMITED"],
    [
      new ApiError({ status: 400, message: "API key not valid. Please pass a valid API key." }),
      "AI_MISCONFIGURED",
    ],
    [new ApiError({ status: 403, message: "Permission denied" }), "AI_MISCONFIGURED"],
    [new ApiError({ status: 404, message: "models/gemini-test is not found" }), "AI_MISCONFIGURED"],
    [new ApiError({ status: 503, message: "The model is overloaded." }), "AI_UNAVAILABLE"],
    [new ApiError({ status: 400, message: "Invalid JSON schema" }), "AI_REQUEST_FAILED"],
    [new TypeError("fetch failed"), "AI_UNAVAILABLE"],
  ];

  for (const [thrown, code] of cases) {
    const provider = providerWith(async () => {
      throw thrown;
    });

    await assert.rejects(provider.generateJson(REQUEST), { code }, thrown.message);
  }
});

test("retries once when Gemini is briefly overloaded", async () => {
  let calls = 0;
  const provider = providerWith(async () => {
    calls += 1;
    if (calls === 1) throw new ApiError({ status: 503, message: "high demand" });
    return OK_RESPONSE;
  });

  const result = await provider.generateJson(REQUEST);

  assert.equal(result.text, OK_RESPONSE.text);
  assert.equal(calls, 2);
});

test("never retries a rate limit or a rejected request", async () => {
  for (const status of [429, 400]) {
    let calls = 0;
    const provider = providerWith(async () => {
      calls += 1;
      throw new ApiError({ status, message: "no" });
    });

    await assert.rejects(provider.generateJson(REQUEST));
    assert.equal(calls, 1, `status ${status}`);
  }
});

test("reads Gemini's suggested retry delay from a rate-limit error", async () => {
  const provider = providerWith(async () => {
    throw new ApiError({
      status: 429,
      message: '{"error":{"details":[{"@type":"RetryInfo","retryDelay":"37s"}]}}',
    });
  });

  await assert.rejects(provider.generateJson(REQUEST), { retryAfterSeconds: 37 });
});

test("reports a used-up daily quota differently from a busy minute", async () => {
  const provider = providerWith(async () => {
    throw new ApiError({
      status: 429,
      message:
        '{"error":{"details":[{"@type":"QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},{"@type":"RetryInfo","retryDelay":"10s"}]}}',
    });
  });

  await assert.rejects(provider.generateJson(REQUEST), (error) => {
    assert.equal(error.code, "AI_QUOTA_EXHAUSTED");
    assert.equal(error.retryAfterSeconds, undefined);
    return true;
  });
});

test("gives up once the timeout passes", async () => {
  const provider = providerWith(
    ({ config }) =>
      new Promise((_resolve, reject) => {
        config.abortSignal.addEventListener("abort", () => reject(config.abortSignal.reason), {
          once: true,
        });
      }),
    { timeoutMs: 20 },
  );

  await assert.rejects(provider.generateJson(REQUEST), { code: "AI_TIMEOUT" });
});

test("reports a request the caller cancelled as cancelled", async () => {
  const controller = new AbortController();
  const provider = providerWith(
    ({ config }) =>
      new Promise((_resolve, reject) => {
        config.abortSignal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  );

  const pending = provider.generateJson({ ...REQUEST, signal: controller.signal });
  controller.abort();

  await assert.rejects(pending, { code: "REQUEST_CANCELLED" });
});

test("treats blocked, truncated and empty replies as failures", async () => {
  const cases = [
    [{ promptFeedback: { blockReason: "SAFETY" } }, "AI_BLOCKED"],
    [{ candidates: [{ finishReason: "SAFETY" }] }, "AI_BLOCKED"],
    [{ text: '{"nodes":', candidates: [{ finishReason: "MAX_TOKENS" }] }, "AI_INVALID_RESPONSE"],
    [{ text: "  ", candidates: [{ finishReason: "STOP" }] }, "AI_INVALID_RESPONSE"],
    [{}, "AI_INVALID_RESPONSE"],
  ];

  for (const [response, code] of cases) {
    const provider = providerWith(async () => response);

    await assert.rejects(provider.generateJson(REQUEST), { code }, JSON.stringify(response));
  }
});

test("never keeps anything shaped like an API key in error detail", async () => {
  const keyLike = "AIza" + "Sy".repeat(18);
  const provider = providerWith(async () => {
    throw new ApiError({ status: 500, message: `upstream echoed ${keyLike}` });
  });

  await assert.rejects(provider.generateJson(REQUEST), (error) => {
    assert.equal(error.code, "AI_UNAVAILABLE");
    assert.ok(!error.detail.includes(keyLike));
    assert.ok(error.detail.includes("[redacted]"));
    return true;
  });
});
