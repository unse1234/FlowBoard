import assert from "node:assert/strict";
import test from "node:test";
import { AiRequestError, requestDiagram } from "./aiClient.js";

const DIAGRAM = { title: "T", direction: "down", nodes: [{ id: "a", label: "A", type: "rect" }], edges: [] };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("posts the prompt to the server and returns the diagram", async () => {
  const calls = [];
  const diagram = await requestDiagram({
    prompt: "Create a login flow",
    baseUrl: "https://api.example/",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, { ok: true, diagram: DIAGRAM });
    },
  });

  assert.deepEqual(diagram, DIAGRAM);
  assert.equal(calls[0].url, "https://api.example/api/ai/generate-diagram");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { prompt: "Create a login flow" });
});

test("sends board context only when there is some", async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonResponse(200, { ok: true, diagram: DIAGRAM });
  };

  await requestDiagram({ prompt: "x", board: [], baseUrl: "http://s", fetchImpl });
  await requestDiagram({ prompt: "x", board: [{ id: "n1", type: "rect" }], baseUrl: "http://s", fetchImpl });

  assert.deepEqual(bodies[0], { prompt: "x" });
  assert.deepEqual(bodies[1], { prompt: "x", board: [{ id: "n1", type: "rect" }] });
});

test("surfaces the server's code and user-facing message", async () => {
  await assert.rejects(
    requestDiagram({
      prompt: "x",
      baseUrl: "http://s",
      fetchImpl: async () =>
        jsonResponse(429, { ok: false, code: "AI_RATE_LIMITED", error: "The AI service is busy." }),
    }),
    (error) => {
      assert.ok(error instanceof AiRequestError);
      assert.equal(error.code, "AI_RATE_LIMITED");
      assert.equal(error.message, "The AI service is busy.");
      return true;
    },
  );
});

test("copes with an error page that is not JSON", async () => {
  await assert.rejects(
    requestDiagram({
      prompt: "x",
      baseUrl: "http://s",
      fetchImpl: async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    }),
    { code: "HTTP_502" },
  );
});

test("reports an unreachable server", async () => {
  await assert.rejects(
    requestDiagram({
      prompt: "x",
      baseUrl: "http://s",
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    }),
    { code: "NETWORK" },
  );
});

function waitForAbort(_url, init) {
  return new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}

test("tells a cancelled request apart from a timed-out one", async () => {
  const controller = new AbortController();
  const pending = requestDiagram({
    prompt: "x",
    baseUrl: "http://s",
    signal: controller.signal,
    fetchImpl: waitForAbort,
  });
  controller.abort();
  await assert.rejects(pending, { code: "CANCELLED" });

  await assert.rejects(
    requestDiagram({ prompt: "x", baseUrl: "http://s", timeoutMs: 10, fetchImpl: waitForAbort }),
    { code: "TIMEOUT" },
  );
});
