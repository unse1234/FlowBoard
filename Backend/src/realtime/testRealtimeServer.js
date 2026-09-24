const { io: connect } = require("socket.io-client");
const { getServerConfig } = require("../config/serverConfig");
const { createApp } = require("../server");

/**
 * A running FlowBoard server with real Socket.IO clients, for gateway tests.
 *
 * Not a `.test.js` file, so the runner does not execute it.
 *
 * These tests use genuine clients rather than fake socket objects. What the
 * gateways mostly do is decide *who* receives something — a room, one target
 * socket, everyone except the sender — and a fake that models rooms would be
 * asserting its own model rather than Socket.IO's.
 *
 * No database is configured, so the auth routes are absent. The gateways do not
 * touch one.
 */

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

/** Long enough for a local round trip, short enough that a hang fails fast. */
const EVENT_TIMEOUT_MS = 2_000;

/**
 * How long to wait before concluding something did *not* arrive.
 *
 * Only for negative assertions. A local emit that is going to arrive has
 * arrived well inside this.
 */
const SETTLE_MS = 150;

/**
 * @param {import("node:test").TestContext} t
 */
async function startRealtimeServer(t) {
  const defaults = getServerConfig({});
  const config = {
    ...defaults,
    port: 0,
    clientOrigin: ["http://localhost:5173"],
    ai: { ...defaults.ai, rateLimitPerMinute: 0 },
  };

  const { httpServer, io, operationStore } = createApp(config, {
    database: null,
    diagramService: { async generateDiagram() {} },
    logger: SILENT_LOGGER,
  });

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];

  t.after(async () => {
    for (const client of clients) client.disconnect();
    httpServer.closeAllConnections();
    await new Promise((resolve) => io.close(() => resolve()));
  });

  return {
    url,
    io,
    operationStore,

    /**
     * A connected client.
     *
     * websocket only: the polling fallback would make the first events arrive
     * over a different transport and make ordering assertions flaky.
     */
    async client(auth = {}) {
      const socket = connect(url, {
        transports: ["websocket"],
        auth,
        forceNew: true,
      });
      clients.push(socket);

      await once(socket, "connect");

      return socket;
    },
  };
}

/**
 * Resolve with the next `event` on `socket`, or reject if it never arrives.
 *
 * @returns {Promise<unknown>}
 */
function once(socket, event, timeoutMs = EVENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for "${event}".`));
    }, timeoutMs);

    function handler(payload) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

/**
 * Record every `event` a socket receives, for assertions about how many arrived
 * and in what order.
 *
 * @returns {{ received: unknown[], waitFor(count: number): Promise<unknown[]> }}
 */
function record(socket, event) {
  const received = [];
  socket.on(event, (payload) => received.push(payload));

  return {
    received,
    /** Wait until at least `count` have arrived. */
    async waitFor(count, timeoutMs = EVENT_TIMEOUT_MS) {
      const deadline = Date.now() + timeoutMs;

      while (received.length < count) {
        if (Date.now() > deadline) {
          throw new Error(
            `Timed out with ${received.length} of ${count} "${event}" events.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      return received;
    },
  };
}

/** Give anything in flight time to arrive, before asserting it did not. */
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

/** An operation that passes validation, for varying one field of. */
function buildOperation(overrides = {}) {
  return {
    operationId: `op_${Math.random().toString(36).slice(2)}`,
    boardId: "board-1",
    userId: "user_someone",
    type: "CREATE_SHAPE",
    timestamp: Date.now(),
    payload: { shape: { id: `shape_${Math.random().toString(36).slice(2)}`, type: "rect" } },
    ...overrides,
  };
}

module.exports = {
  EVENT_TIMEOUT_MS,
  SETTLE_MS,
  buildOperation,
  once,
  record,
  settle,
  startRealtimeServer,
};
