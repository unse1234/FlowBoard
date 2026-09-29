import assert from "node:assert/strict";
import test from "node:test";
import { SOCKET_EVENTS } from "../socket/socketEvents.js";
import { CONNECTION_STATE } from "./ConnectionState.js";
import { RealtimeManager } from "./RealtimeManager.js";

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const SILENT = { info() {}, warn() {}, error() {} };

/**
 * A SocketService stand-in: the test scripts acknowledgements and fires server
 * events. An answer may be a function, called when the emit happens, to delay
 * the answer (return a promise) or give none (throw).
 */
function createFakeSocket({ recovered = false } = {}) {
  const handlers = new Map();
  const emitted = [];
  const answers = [];
  const socket = {
    connected: false,
    recovered,
    emitted,
    answer: (response) => answers.push(response),
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      return () => handlers.get(event).delete(handler);
    },
    fire(event, payload) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
    connect() {
      socket.connected = true;
      socket.fire(SOCKET_EVENTS.CONNECT);
    },
    disconnect() {
      socket.connected = false;
    },
    isConnected: () => socket.connected,
    wasRecovered: () => socket.recovered,
    async emitWithAck(event, payload) {
      emitted.push({ event, payload });
      const next = answers.length ? answers.shift() : { ok: true };
      return typeof next === "function" ? next() : next;
    },
  };
  return socket;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Timers the test runs by hand, to see what the manager scheduled and when. */
function createFakeTimers() {
  const scheduled = new Map();
  let nextId = 0;
  return {
    setTimeout(callback, ms) {
      nextId += 1;
      scheduled.set(nextId, { callback, ms });
      return nextId;
    },
    clearTimeout(id) {
      scheduled.delete(id);
    },
    /** The delays waiting to run, in the order they were set. */
    delays: () => [...scheduled.values()].map((entry) => entry.ms),
    runAll() {
      const due = [...scheduled.values()];
      scheduled.clear();
      for (const entry of due) entry.callback();
    },
  };
}

function managerWith(socket, timers = createFakeTimers()) {
  const manager = new RealtimeManager({
    socketService: socket,
    boardId: BOARD_ID,
    user: { id: "u-ada", username: "Ada" },
    logger: SILENT,
    timers,
  });
  const access = [];
  const statuses = [];
  manager.onAccess((event) => access.push(event));
  manager.onStatusChange((status) => statuses.push(status));
  return { manager, access, statuses };
}

const operation = (id) => ({ operationId: id, boardId: BOARD_ID, type: "CREATE_SHAPE", payload: {} });

test("the role the server grants on joining is reported", async () => {
  const socket = createFakeSocket();
  socket.answer({ ok: true, boardId: BOARD_ID, role: "viewer", replayedOperationCount: 0 });
  const { manager, access } = managerWith(socket);

  manager.connect();
  await settle();

  assert.deepEqual(access, [{ type: "role", role: "viewer" }]);
  assert.equal(manager.getRole(), "viewer");
});

test("a refused join says why, and the board is not joined", async () => {
  const socket = createFakeSocket();
  socket.answer({ ok: false, code: "BOARD_NOT_FOUND", error: "That board doesn't exist." });
  const { manager, access, statuses } = managerWith(socket);

  manager.connect();
  await settle();
  manager.publishOperation(operation("op-1"));
  await settle();

  assert.deepEqual(access, [{ type: "denied", code: "BOARD_NOT_FOUND" }]);
  assert.equal(statuses.at(-1), CONNECTION_STATE.ERROR);
  assert.ok(!socket.emitted.some((entry) => entry.event === SOCKET_EVENTS.BOARD_EVENT));
});

test("a refused handshake passes the server's code on", async () => {
  const socket = createFakeSocket();
  const { manager, access } = managerWith(socket);
  socket.connect = () => socket.fire(SOCKET_EVENTS.CONNECT_ERROR, Object.assign(new Error("ended"), { data: { code: "SESSION_ENDED" } }));

  manager.connect();

  assert.deepEqual(access, [{ type: "refused", code: "SESSION_ENDED" }]);
});

test("revoked access stops sending, and a role change is taken at once", async () => {
  const socket = createFakeSocket();
  socket.answer({ ok: true, boardId: BOARD_ID, role: "editor" });
  const { manager, access } = managerWith(socket);
  manager.connect();
  await settle();

  socket.fire(SOCKET_EVENTS.BOARD_ROLE_CHANGED, { boardId: BOARD_ID, role: "viewer" });
  assert.equal(manager.getRole(), "viewer");

  socket.fire(SOCKET_EVENTS.BOARD_ACCESS_REVOKED, { boardId: "another-board", code: "BOARD_NOT_FOUND" });
  socket.fire(SOCKET_EVENTS.BOARD_ACCESS_REVOKED, { boardId: BOARD_ID, code: "BOARD_NOT_FOUND" });
  manager.publishOperation(operation("op-2"));
  await settle();

  assert.deepEqual(access.slice(1), [
    { type: "role", role: "viewer" },
    { type: "revoked", code: "BOARD_NOT_FOUND" },
  ]);
  assert.equal(manager.getRole(), null);
  assert.ok(!socket.emitted.some((entry) => entry.event === SOCKET_EVENTS.BOARD_EVENT));
});

test("a session ended by the server is reported", async () => {
  const socket = createFakeSocket();
  const { manager, access } = managerWith(socket);
  manager.connect();
  await settle();

  socket.fire(SOCKET_EVENTS.SESSION_ENDED, { reason: "session-ended" });

  assert.deepEqual(access.at(-1), { type: "session-ended" });
});

test("a recovered connection skips the join and sends what was waiting", async () => {
  const socket = createFakeSocket();
  socket.answer({ ok: true, boardId: BOARD_ID, role: "editor" });
  const { manager } = managerWith(socket);
  manager.connect();
  await settle();

  // The connection drops; an edit waits; it comes back resumed.
  socket.connected = false;
  socket.fire(SOCKET_EVENTS.DISCONNECT, "transport close");
  manager.publishOperation(operation("op-3"));
  socket.recovered = true;
  socket.connect();
  await settle();

  const joins = socket.emitted.filter((entry) => entry.event === SOCKET_EVENTS.BOARD_JOIN);
  assert.equal(joins.length, 1, "joined again despite recovering");
  assert.ok(socket.emitted.some((entry) => entry.event === SOCKET_EVENTS.BOARD_EVENT && entry.payload.operation.operationId === "op-3"));
});

test("a connection that was not recovered joins again, for a full re-sync", async () => {
  const socket = createFakeSocket();
  socket.answer({ ok: true, boardId: BOARD_ID, role: "editor" });
  socket.answer({ ok: true, boardId: BOARD_ID, role: "editor" });
  const { manager } = managerWith(socket);
  manager.connect();
  await settle();

  socket.connected = false;
  socket.fire(SOCKET_EVENTS.DISCONNECT, "transport close");
  socket.connect();
  await settle();

  assert.equal(socket.emitted.filter((entry) => entry.event === SOCKET_EVENTS.BOARD_JOIN).length, 2);
});

test("a server without accounts grants no role, and nothing is reported", async () => {
  const socket = createFakeSocket();
  socket.answer({ ok: true, boardId: BOARD_ID, replayedOperationCount: 0 });
  const { manager, access } = managerWith(socket);

  manager.connect();
  await settle();

  assert.deepEqual(access, []);
  assert.equal(manager.getRole(), null);
});

// --- Sending and resending (Step 2 chunk 0.2, finding F-27) ---------------------

const sentIds = (socket) =>
  socket.emitted.filter((entry) => entry.event === SOCKET_EVENTS.BOARD_EVENT).map((entry) => entry.payload.operation.operationId);

/** A manager joined to the board, with hand-run timers and a record of rejections. */
async function joined() {
  const socket = createFakeSocket();
  socket.answer({ ok: true, boardId: BOARD_ID, role: "editor" });
  const timers = createFakeTimers();
  const { manager } = managerWith(socket, timers);
  const rejected = [];
  manager.onRejected((event) => rejected.push(event));
  manager.connect();
  await settle();
  return { socket, timers, manager, rejected };
}

test("an edit still awaiting its answer is not sent again when the next one goes", async () => {
  const { socket, manager } = await joined();
  let answerFirst;
  socket.answer(() => new Promise((resolve) => (answerFirst = resolve)));

  manager.publishOperation(operation("op-1"));
  manager.publishOperation(operation("op-2"));
  manager.publishOperation(operation("op-3"));
  await settle();

  assert.deepEqual(sentIds(socket), ["op-1", "op-2", "op-3"]);
  answerFirst({ ok: true });
});

test("an edit the server refuses for good is dropped and reported, and never sent again", async () => {
  const { socket, timers, manager, rejected } = await joined();
  socket.answer({ ok: false, code: "INVALID_PAYLOAD", error: "That message wasn't understood." });

  manager.publishOperation(operation("op-1"));
  await settle();

  assert.deepEqual(rejected.map((event) => [event.operation.operationId, event.code]), [["op-1", "INVALID_PAYLOAD"]]);
  assert.deepEqual(timers.delays(), [], "nothing scheduled to try again");

  // Neither the next edit nor a fresh connection sends it again.
  manager.publishOperation(operation("op-2"));
  socket.connected = false;
  socket.fire(SOCKET_EVENTS.DISCONNECT, "transport close");
  socket.answer({ ok: true, boardId: BOARD_ID, role: "editor" });
  socket.connect();
  await settle();

  assert.deepEqual(sentIds(socket), ["op-1", "op-2"]);
});

test("a passing refusal is tried again after a pause, without waiting for another edit", async () => {
  const { socket, timers, manager, rejected } = await joined();
  socket.answer({ ok: false, code: "RATE_LIMITED", error: "Slow down a little." });

  manager.publishOperation(operation("op-1"));
  await settle();
  assert.deepEqual(timers.delays(), [1000]);

  timers.runAll();
  await settle();

  assert.deepEqual(sentIds(socket), ["op-1", "op-1"]);
  assert.deepEqual(timers.delays(), [], "delivered, so nothing more is scheduled");
  assert.deepEqual(rejected, []);
});

test("no answer at all is tried again too, and the pause doubles while it lasts", async () => {
  const { socket, timers, manager } = await joined();
  const timeout = () => {
    throw new Error("operation has timed out");
  };
  // A server without accounts refuses without a code: a passing failure too.
  socket.answer(timeout);
  socket.answer({ ok: false, error: "Socket has not joined this board." });
  socket.answer(timeout);

  manager.publishOperation(operation("op-1"));
  const delays = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await settle();
    delays.push(...timers.delays());
    timers.runAll();
  }
  await settle();

  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.deepEqual(sentIds(socket), ["op-1", "op-1", "op-1", "op-1"]);
  assert.deepEqual(timers.delays(), []);
});

test("a delivered edit resets the pause for the next failure", async () => {
  const { socket, timers, manager } = await joined();
  socket.answer({ ok: false, code: "UNAVAILABLE" });
  manager.publishOperation(operation("op-1"));
  await settle();
  timers.runAll();
  await settle();

  socket.answer({ ok: false, code: "UNAVAILABLE" });
  manager.publishOperation(operation("op-2"));
  await settle();

  assert.deepEqual(timers.delays(), [1000]);
});

test("after a reconnect an unanswered edit goes again at once, and the stale answer changes nothing", async () => {
  const { socket, timers, manager, rejected } = await joined();
  let answerStale;
  let answerFresh;
  socket.answer(() => new Promise((resolve) => (answerStale = resolve)));
  manager.publishOperation(operation("op-1"));
  await settle();

  socket.connected = false;
  socket.fire(SOCKET_EVENTS.DISCONNECT, "transport close");
  socket.answer({ ok: true, boardId: BOARD_ID, role: "editor" });
  socket.answer(() => new Promise((resolve) => (answerFresh = resolve)));
  socket.connect();
  await settle();
  assert.deepEqual(sentIds(socket), ["op-1", "op-1"]);

  // The first attempt's answer finally arrives, as a failure, while the
  // second is still out: it neither schedules a retry nor frees op-1 to be
  // sent a third time.
  answerStale({ ok: false, code: "UNAVAILABLE" });
  await settle();
  assert.deepEqual(timers.delays(), []);
  manager.publishOperation(operation("op-2"));
  await settle();
  assert.deepEqual(sentIds(socket), ["op-1", "op-1", "op-2"]);

  answerFresh({ ok: true });
  await settle();
  manager.publishOperation(operation("op-3"));
  await settle();
  assert.deepEqual(sentIds(socket), ["op-1", "op-1", "op-2", "op-3"], "op-1 was delivered and is not sent again");
  assert.deepEqual(rejected, []);
});

test("disconnecting cancels a scheduled retry", async () => {
  const { socket, timers, manager } = await joined();
  socket.answer({ ok: false, code: "RATE_LIMITED" });
  manager.publishOperation(operation("op-1"));
  await settle();
  assert.deepEqual(timers.delays(), [1000]);

  await manager.disconnect();

  assert.deepEqual(timers.delays(), []);
});
