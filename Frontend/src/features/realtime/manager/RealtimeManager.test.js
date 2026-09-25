import assert from "node:assert/strict";
import test from "node:test";
import { SOCKET_EVENTS } from "../socket/socketEvents.js";
import { CONNECTION_STATE } from "./ConnectionState.js";
import { RealtimeManager } from "./RealtimeManager.js";

const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const SILENT = { info() {}, warn() {}, error() {} };

/** A SocketService stand-in: the test scripts acknowledgements and fires server events. */
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
      return answers.length ? answers.shift() : { ok: true };
    },
  };
  return socket;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function managerWith(socket) {
  const manager = new RealtimeManager({
    socketService: socket,
    boardId: BOARD_ID,
    user: { id: "u-ada", username: "Ada" },
    logger: SILENT,
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
