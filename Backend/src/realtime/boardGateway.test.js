const assert = require("node:assert/strict");
const test = require("node:test");
const { SOCKET_EVENTS } = require("./socketEvents");
const {
  buildOperation,
  once,
  record,
  settle,
  startRealtimeServer,
} = require("./testRealtimeServer");

/**
 * The board gateway, against a real Socket.IO server.
 *
 * These tests pin what the gateway does **today**, including the parts that are
 * wrong. Phase 5 rewrites its trust model, and rewriting untested code that
 * decides who may read and write a board is how a security hole ships. Where a
 * test records behaviour that is a known finding, it says so, so that a future
 * change to it reads as deliberate rather than as a regression.
 */

const join = (socket, boardId, user = { id: "user_a", username: "A" }) =>
  socket.emitWithAck(SOCKET_EVENTS.BOARD_JOIN, { boardId, user });

const publish = (socket, operation) =>
  socket.emitWithAck(SOCKET_EVENTS.BOARD_EVENT, { operation });

test("joining a board is acknowledged", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();

  const ack = await join(socket, "board-1");

  assert.equal(ack.ok, true);
  assert.equal(ack.boardId, "board-1");
  assert.equal(ack.replayedOperationCount, 0);
});

test("joining without a board id is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();

  for (const boardId of [undefined, null, "", "   ", 42]) {
    const ack = await join(socket, boardId);
    assert.equal(ack.ok, false, `expected ${JSON.stringify(boardId)} to be refused`);
    assert.match(ack.error, /boardId/);
  }
});

test("an operation reaches another client on the same board", async (t) => {
  const server = await startRealtimeServer(t);
  const [author, peer] = [await server.client(), await server.client()];
  await join(author, "board-1");
  await join(peer, "board-1");

  const delivered = once(peer, SOCKET_EVENTS.BOARD_EVENT);
  const operation = buildOperation();
  const ack = await publish(author, operation);

  assert.equal(ack.ok, true);
  assert.equal(ack.duplicate, false);

  const event = await delivered;
  assert.deepEqual(event.operation, operation);
  assert.equal(typeof event.serverTimestamp, "number");
  // Only a replay carries this, so a client can tell history from a live edit.
  assert.equal(event.replay, undefined);
});

test("an author does not receive its own operation back", async (t) => {
  const server = await startRealtimeServer(t);
  const author = await server.client();
  await join(author, "board-1");

  const echoes = record(author, SOCKET_EVENTS.BOARD_EVENT);
  await publish(author, buildOperation());
  await settle();

  // The author already applied it locally before publishing.
  assert.equal(echoes.received.length, 0);
});

test("boards are isolated from each other", async (t) => {
  const server = await startRealtimeServer(t);
  const [onBoardOne, onBoardTwo] = [await server.client(), await server.client()];
  await join(onBoardOne, "board-1");
  await join(onBoardTwo, "board-2");

  const leaked = record(onBoardTwo, SOCKET_EVENTS.BOARD_EVENT);
  await publish(onBoardOne, buildOperation({ boardId: "board-1" }));
  await settle();

  assert.equal(leaked.received.length, 0);
});

test("an operation for a board this socket has not joined is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();
  await join(socket, "board-1");

  const ack = await publish(socket, buildOperation({ boardId: "board-2" }));

  assert.equal(ack.ok, false);
  assert.match(ack.error, /has not joined/);
});

test("publishing before joining is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();

  const ack = await publish(socket, buildOperation());

  assert.equal(ack.ok, false);
});

test("an invalid operation is refused with a reason", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();
  await join(socket, "board-1");

  const cases = [
    [undefined, /must be an object/],
    [buildOperation({ operationId: undefined }), /operationId/],
    [buildOperation({ userId: undefined }), /userId/],
    [buildOperation({ timestamp: "now" }), /timestamp/],
    [buildOperation({ type: "DROP_TABLE" }), /Unsupported/],
    [buildOperation({ payload: undefined }), /payload/],
    [buildOperation({ payload: {} }), /CREATE_SHAPE/],
  ];

  for (const [operation, expected] of cases) {
    const ack = await publish(socket, operation);
    assert.equal(ack.ok, false, `expected refusal for ${JSON.stringify(operation?.type)}`);
    assert.match(ack.error, expected);
  }
});

test("the same operation sent twice is stored and broadcast once", async (t) => {
  const server = await startRealtimeServer(t);
  const [author, peer] = [await server.client(), await server.client()];
  await join(author, "board-1");
  await join(peer, "board-1");

  const delivered = record(peer, SOCKET_EVENTS.BOARD_EVENT);
  const operation = buildOperation();

  const first = await publish(author, operation);
  const second = await publish(author, operation);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  // Acknowledged either way, so a client retrying after a dropped ack is not
  // told its edit failed.
  assert.equal(second.ok, true);

  await delivered.waitFor(1);
  await settle();
  assert.equal(delivered.received.length, 1);
});

test("a joiner is replayed the board history, flagged as replay", async (t) => {
  const server = await startRealtimeServer(t);
  const author = await server.client();
  await join(author, "board-1");

  const operations = [buildOperation(), buildOperation(), buildOperation()];
  for (const operation of operations) await publish(author, operation);

  const latecomer = await server.client();
  const replayed = record(latecomer, SOCKET_EVENTS.BOARD_EVENT);
  const ack = await join(latecomer, "board-1");

  assert.equal(ack.replayedOperationCount, 3);

  const received = await replayed.waitFor(3);
  assert.deepEqual(
    received.map((event) => event.operation.operationId),
    operations.map((operation) => operation.operationId),
  );
  // Every replayed event says so, and none is missing the flag.
  assert.ok(received.every((event) => event.replay === true));
});

test("history is per board", async (t) => {
  const server = await startRealtimeServer(t);
  const author = await server.client();
  await join(author, "board-1");
  await publish(author, buildOperation({ boardId: "board-1" }));

  const elsewhere = await server.client();
  const ack = await join(elsewhere, "board-2");

  assert.equal(ack.replayedOperationCount, 0);
});

test("presence reaches the rest of the board but not the sender", async (t) => {
  const server = await startRealtimeServer(t);
  const [mover, watcher] = [await server.client(), await server.client()];
  await join(mover, "board-1", { id: "user_a", username: "Ada", color: "#2563eb" });
  await join(watcher, "board-1", { id: "user_b", username: "Bob" });

  const echoes = record(mover, SOCKET_EVENTS.PRESENCE_UPDATE);
  const seen = once(watcher, SOCKET_EVENTS.PRESENCE_UPDATE);

  await mover.emitWithAck(SOCKET_EVENTS.PRESENCE_UPDATE, {
    boardId: "board-1",
    user: { id: "user_a", username: "Ada", color: "#2563eb" },
    presence: { cursor: { x: 10, y: 20 } },
  });

  const event = await seen;
  assert.equal(event.userId, "user_a");
  assert.equal(event.username, "Ada");
  assert.equal(event.color, "#2563eb");
  assert.deepEqual(event.presence, { cursor: { x: 10, y: 20 } });

  await settle();
  assert.equal(echoes.received.length, 0);
});

test("presence for another board is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();
  await join(socket, "board-1");

  const ack = await socket.emitWithAck(SOCKET_EVENTS.PRESENCE_UPDATE, {
    boardId: "board-2",
    presence: {},
  });

  assert.equal(ack.ok, false);
  assert.match(ack.error, /has not joined/);
});

test("presence falls back to Guest when no name is given", async (t) => {
  const server = await startRealtimeServer(t);
  const [mover, watcher] = [await server.client(), await server.client()];
  await join(mover, "board-1", {});
  await join(watcher, "board-1");

  const seen = once(watcher, SOCKET_EVENTS.PRESENCE_UPDATE);
  await mover.emitWithAck(SOCKET_EVENTS.PRESENCE_UPDATE, { boardId: "board-1", presence: {} });

  assert.equal((await seen).username, "Guest");
});

test("leaving a board announces the departure", async (t) => {
  const server = await startRealtimeServer(t);
  const [leaver, watcher] = [await server.client(), await server.client()];
  await join(leaver, "board-1", { id: "user_a", username: "Ada" });
  await join(watcher, "board-1");

  const seen = once(watcher, SOCKET_EVENTS.PRESENCE_UPDATE);
  const ack = await leaver.emitWithAck(SOCKET_EVENTS.BOARD_LEAVE, { boardId: "board-1" });

  assert.equal(ack.ok, true);
  const event = await seen;
  assert.equal(event.userId, "user_a");
  assert.equal(event.presence.status, "offline");
});

test("a socket that has left stops receiving the board", async (t) => {
  const server = await startRealtimeServer(t);
  const [leaver, author] = [await server.client(), await server.client()];
  await join(leaver, "board-1");
  await join(author, "board-1");
  await leaver.emitWithAck(SOCKET_EVENTS.BOARD_LEAVE, { boardId: "board-1" });

  const leaked = record(leaver, SOCKET_EVENTS.BOARD_EVENT);
  await publish(author, buildOperation());
  await settle();

  assert.equal(leaked.received.length, 0);
});

test("disconnecting announces the departure", async (t) => {
  const server = await startRealtimeServer(t);
  const [leaver, watcher] = [await server.client(), await server.client()];
  await join(leaver, "board-1", { id: "user_a", username: "Ada" });
  await join(watcher, "board-1");

  const seen = once(watcher, SOCKET_EVENTS.PRESENCE_UPDATE);
  leaver.disconnect();

  const event = await seen;
  assert.equal(event.userId, "user_a");
  assert.equal(event.presence.status, "offline");
});

test("disconnecting without having joined announces nothing", async (t) => {
  const server = await startRealtimeServer(t);
  const [idle, watcher] = [await server.client(), await server.client()];
  await join(watcher, "board-1");

  const heard = record(watcher, SOCKET_EVENTS.PRESENCE_UPDATE);
  idle.disconnect();
  await settle();

  assert.equal(heard.received.length, 0);
});

// --- behaviour that is a known finding --------------------------------------
//
// Pinned so Phase 5 changes it deliberately. Each of these tests is expected to
// be rewritten, not deleted: what replaces it should assert the opposite.

test("F-1: any client may join any board and is given its whole history", async (t) => {
  const server = await startRealtimeServer(t);
  const author = await server.client();
  await join(author, "secret-board");
  await publish(author, buildOperation({ boardId: "secret-board" }));

  // No credentials of any kind. Knowing the id is the only thing required.
  const stranger = await server.client();
  const replayed = record(stranger, SOCKET_EVENTS.BOARD_EVENT);
  const ack = await join(stranger, "secret-board");

  assert.equal(ack.ok, true);
  assert.equal(ack.replayedOperationCount, 1);
  await replayed.waitFor(1);

  // And may write to it.
  const write = await publish(stranger, buildOperation({ boardId: "secret-board" }));
  assert.equal(write.ok, true);
});

test("F-2: the server accepts whatever user an operation claims to be from", async (t) => {
  const server = await startRealtimeServer(t);
  const [impostor, watcher] = [await server.client(), await server.client()];
  await join(impostor, "board-1", { id: "user_impostor", username: "Impostor" });
  await join(watcher, "board-1");

  const delivered = once(watcher, SOCKET_EVENTS.BOARD_EVENT);
  await publish(impostor, buildOperation({ userId: "user_someone_else" }));

  // The operation is attributed to a user this socket never claimed to be, and
  // the gateway does not notice. Phase 5 must overwrite userId from the
  // authenticated session.
  assert.equal((await delivered).operation.userId, "user_someone_else");
});

test("F-8: board ids that differ only outside [A-Za-z0-9_-] share one room", async (t) => {
  const server = await startRealtimeServer(t);
  const [first, second] = [await server.client(), await server.client()];

  // sanitizeBoardId rewrites rather than rejects, and the rewrite is
  // many-to-one: all three of these become "team-room".
  const firstAck = await join(first, "team room");
  const secondAck = await join(second, "team.room");

  assert.equal(firstAck.boardId, "team-room");
  assert.equal(secondAck.boardId, "team-room");

  // So someone who guesses any spelling that sanitises to the same string is in
  // the same room as everyone else, and sees their history.
  const delivered = once(second, SOCKET_EVENTS.BOARD_EVENT);
  await publish(first, buildOperation({ boardId: "team-room" }));

  assert.ok(await delivered, "expected distinct spellings to share a room");
});

test("only the join path sanitises the board id, so an unsanitised operation is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();

  // Accepted here, and recorded on the socket in its rewritten form.
  const ack = await join(socket, "team room");
  assert.equal(ack.boardId, "team-room");

  // But board:event compares operation.boardId as sent against the sanitised
  // value, so the very id that was accepted at join cannot be published with.
  const refused = await publish(socket, buildOperation({ boardId: "team room" }));
  assert.equal(refused.ok, false);
  assert.match(refused.error, /has not joined/);

  // Only the rewritten form works. The frontend applies the same regex before
  // connecting, which is why this inconsistency does not bite in practice.
  const accepted = await publish(socket, buildOperation({ boardId: "team-room" }));
  assert.equal(accepted.ok, true);
});

test("F-5: the operation log is never trimmed, so replay grows without bound", async (t) => {
  const server = await startRealtimeServer(t);
  const author = await server.client();
  await join(author, "busy-board");

  for (let index = 0; index < 50; index += 1) {
    await publish(author, buildOperation({ boardId: "busy-board" }));
  }

  const latecomer = await server.client();
  const ack = await join(latecomer, "busy-board");

  // Every operation the board has ever received, one socket message each. There
  // is no snapshot and no compaction, so this number only ever rises.
  assert.equal(ack.replayedOperationCount, 50);
  assert.equal(server.operationStore.list("busy-board").length, 50);
});
