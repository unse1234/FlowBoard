const assert = require("node:assert/strict");
const test = require("node:test");
const { getServerConfig } = require("./serverConfig");

test("reads AI settings from the environment with safe defaults", () => {
  assert.deepEqual(getServerConfig({}).ai, {
    geminiApiKey: null,
    geminiModel: "gemini-3.6-flash",
    rateLimitPerMinute: 10,
  });

  assert.deepEqual(
    getServerConfig({
      GEMINI_API_KEY: "  key  ",
      GEMINI_MODEL: "gemini-2.5-pro",
      AI_RATE_LIMIT_PER_MINUTE: "0",
    }).ai,
    { geminiApiKey: "key", geminiModel: "gemini-2.5-pro", rateLimitPerMinute: 0 },
  );

  assert.equal(getServerConfig({ GEMINI_API_KEY: "   " }).ai.geminiApiKey, null);
  assert.equal(getServerConfig({ AI_RATE_LIMIT_PER_MINUTE: "lots" }).ai.rateLimitPerMinute, 10);
});

test("matches configured origins however they are written", () => {
  assert.deepEqual(
    getServerConfig({ CLIENT_ORIGIN: "https://a.example/, http://localhost:5173" }).clientOrigin,
    ["https://a.example", "http://localhost:5173"],
  );
  assert.ok(getServerConfig({}).clientOrigin.every((origin) => !origin.endsWith("/")));
});
