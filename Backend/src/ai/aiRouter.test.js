const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../server");
const { AiError } = require("./aiErrors");
const { createDiagramService } = require("./diagramService");

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

const DIAGRAM = {
  title: "Login",
  direction: "down",
  nodes: [
    { id: "login", type: "rect", label: "Login" },
    { id: "home", type: "circle", label: "Dashboard" },
  ],
  edges: [{ from: "login", to: "home" }],
};

async function startServer(t, { diagramService, ai } = {}) {
  const config = {
    port: 0,
    clientOrigin: ["http://localhost:5173"],
    ai: { geminiApiKey: null, geminiModel: "gemini-test", rateLimitPerMinute: 0, ...ai },
  };
  const { httpServer, io } = createApp(config, { diagramService, logger: SILENT_LOGGER });

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    httpServer.closeAllConnections();
    return new Promise((resolve) => io.close(() => resolve()));
  });

  return `http://127.0.0.1:${httpServer.address().port}`;
}

async function postDiagram(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  return { response, body: await response.json() };
}

function serviceReplying(text) {
  return createDiagramService({
    provider: { name: "fake", model: "fake", generateJson: async () => ({ text }) },
    logger: SILENT_LOGGER,
  });
}

test("returns a generated diagram", async (t) => {
  const received = [];
  const baseUrl = await startServer(t, {
    diagramService: {
      async generateDiagram(request) {
        received.push(request);
        return DIAGRAM;
      },
    },
  });

  const { response, body } = await postDiagram(baseUrl, {
    prompt: "Create a login flow",
    board: [{ id: "n1", type: "rect" }],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, diagram: DIAGRAM });
  assert.equal(received[0].prompt, "Create a login flow");
  assert.deepEqual(received[0].board, [{ id: "n1", type: "rect" }]);
  assert.ok(received[0].signal instanceof AbortSignal);
});

test("rejects missing, empty and oversized prompts", async (t) => {
  const baseUrl = await startServer(t, { diagramService: serviceReplying(JSON.stringify(DIAGRAM)) });

  const cases = [
    [{}, "PROMPT_REQUIRED"],
    [{ prompt: "   " }, "PROMPT_REQUIRED"],
    [{ prompt: "x".repeat(2001) }, "PROMPT_TOO_LONG"],
  ];

  for (const [payload, code] of cases) {
    const { response, body } = await postDiagram(baseUrl, payload);

    assert.equal(response.status, 400, code);
    assert.equal(body.ok, false);
    assert.equal(body.code, code);
    assert.equal(typeof body.error, "string");
  }
});

test("answers a malformed JSON body in the same envelope", async (t) => {
  const baseUrl = await startServer(t);

  const { response, body } = await postDiagram(baseUrl, "{ not json");

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.code, "INVALID_JSON");
});

test("reports a server without a Gemini key as not configured", async (t) => {
  const baseUrl = await startServer(t);

  const { response, body } = await postDiagram(baseUrl, { prompt: "Create a login flow" });

  assert.equal(response.status, 503);
  assert.equal(body.code, "AI_NOT_CONFIGURED");
});

test("rejects an AI reply that is not a usable diagram", async (t) => {
  const baseUrl = await startServer(t, {
    diagramService: serviceReplying("Sure! Here is your diagram."),
  });

  const { response, body } = await postDiagram(baseUrl, { prompt: "Create a login flow" });

  assert.equal(response.status, 502);
  assert.equal(body.code, "AI_INVALID_RESPONSE");
});

test("passes on a provider rate limit without leaking provider detail", async (t) => {
  const baseUrl = await startServer(t, {
    diagramService: {
      async generateDiagram() {
        throw new AiError("AI_RATE_LIMITED", {
          detail: "upstream quota text",
          retryAfterSeconds: 37,
        });
      },
    },
  });

  const { response, body } = await postDiagram(baseUrl, { prompt: "x" });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "37");
  assert.deepEqual(Object.keys(body).sort(), ["code", "error", "ok"]);
  assert.ok(!JSON.stringify(body).includes("upstream"));
});

test("hides unexpected errors behind a generic message", async (t) => {
  const baseUrl = await startServer(t, {
    diagramService: {
      async generateDiagram() {
        throw new Error("secret detail at /srv/app.js:12");
      },
    },
  });

  const { response, body } = await postDiagram(baseUrl, { prompt: "x" });

  assert.equal(response.status, 500);
  assert.equal(body.code, "INTERNAL");
  assert.ok(!JSON.stringify(body).includes("secret"));
  assert.ok(!JSON.stringify(body).includes("app.js"));
});

test("limits how often one client can generate", async (t) => {
  const baseUrl = await startServer(t, {
    diagramService: { generateDiagram: async () => DIAGRAM },
    ai: { rateLimitPerMinute: 2 },
  });

  assert.equal((await postDiagram(baseUrl, { prompt: "x" })).response.status, 200);
  assert.equal((await postDiagram(baseUrl, { prompt: "x" })).response.status, 200);

  const { response, body } = await postDiagram(baseUrl, { prompt: "x" });
  assert.equal(response.status, 429);
  assert.equal(body.code, "RATE_LIMITED");
  assert.ok(Number(response.headers.get("retry-after")) > 0);
});

test("keeps the health check working", async (t) => {
  const baseUrl = await startServer(t);

  const response = await fetch(`${baseUrl}/health`);

  assert.deepEqual(await response.json(), { ok: true, service: "flowboard-realtime" });
});
