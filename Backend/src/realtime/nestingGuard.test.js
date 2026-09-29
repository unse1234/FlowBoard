const assert = require("node:assert/strict");
const test = require("node:test");
const { Manager } = require("socket.io-client");
const { MAX_MESSAGE_DEPTH, nestsDeeperThan } = require("./nestingGuard");
const { SOCKET_EVENTS } = require("./socketEvents");
const { buildOperation, once, record, settle, startRealtimeServer } = require("./testRealtimeServer");

/**
 * Finding F-28: Socket.IO's encoder walks every outgoing packet recursively,
 * so relaying part of a message nested deeply enough overflows the stack, and
 * the uncaught RangeError stops the whole server.
 *
 * The attacks here are hand-written frames, because socket.io-client cannot
 * encode them either. Without the guard, each one takes the process down, and
 * the test with it.
 */

const HOSTILE_DEPTH = 50_000;
const hostile = () => "[".repeat(HOSTILE_DEPTH) + "0" + "]".repeat(HOSTILE_DEPTH);

/** Send an event as a raw frame, skipping the client's encoder. `payloadJson` goes in as written. */
function sendRaw(socket, event, payloadJson) {
  socket.io.engine.send(`2[${JSON.stringify(event)},${payloadJson}]`);
}

/** Arrays nested `levels` deep around a number. */
function nested(levels) {
  let value = 0;
  for (let level = 0; level < levels; level += 1) value = [value];
  return value;
}

const join = (socket, boardId, user = { id: "user_a", username: "A" }) =>
  socket.emitWithAck(SOCKET_EVENTS.BOARD_JOIN, { boardId, user });

const joinVoice = (socket, roomId, userId) =>
  socket.emitWithAck(SOCKET_EVENTS.VOICE_JOIN, { roomId, userId, username: userId });

/** The server still accepts connections and relays a board's edits. */
async function stillServing(server) {
  const author = await server.client();
  const peer = await server.client();
  await join(author, "board-check");
  await join(peer, "board-check");
  const seen = record(peer, SOCKET_EVENTS.BOARD_EVENT);

  assert.equal((await author.emitWithAck(SOCKET_EVENTS.BOARD_EVENT, { operation: buildOperation({ boardId: "board-check" }) })).ok, true);
  await seen.waitFor(1);
}

test("depth is measured without recursion, counting an object or array as one level", () => {
  assert.equal(nestsDeeperThan(undefined, 2), false);
  assert.equal(nestsDeeperThan("text", 2), false);
  assert.equal(nestsDeeperThan({ a: [1] }, 2), false);
  assert.equal(nestsDeeperThan({ a: [[1]] }, 2), true);
  assert.equal(nestsDeeperThan(nested(200_000), MAX_MESSAGE_DEPTH), true);
});

test("an operation nested too deeply is refused before it is stored or relayed", async (t) => {
  const server = await startRealtimeServer(t);
  const author = await server.client();
  const peer = await server.client();
  await join(author, "board-1");
  await join(peer, "board-1");
  const seen = record(peer, SOCKET_EVENTS.BOARD_EVENT);
  const dropped = once(author, "disconnect");

  const operation = JSON.stringify(buildOperation({ payload: { shape: { id: "s1", x: "DEEP" } } }));
  sendRaw(author, SOCKET_EVENTS.BOARD_EVENT, `{"operation":${operation.replace('"DEEP"', hostile())}}`);

  // Nothing a FlowBoard client sends nests like this, so the sender is let go.
  assert.equal(await dropped, "io server disconnect");
  await settle();
  assert.equal(seen.received.length, 0);
  assert.equal(server.operationStore.list("board-1").length, 0);
  await stillServing(server);
});

test("a presence update nested too deeply is refused before it is relayed", async (t) => {
  const server = await startRealtimeServer(t);
  const sender = await server.client();
  const peer = await server.client();
  await join(sender, "board-1");
  await join(peer, "board-1");
  const seen = record(peer, SOCKET_EVENTS.PRESENCE_UPDATE);

  sendRaw(sender, SOCKET_EVENTS.PRESENCE_UPDATE, `{"boardId":"board-1","presence":{"cursor":${hostile()}}}`);

  await once(sender, "disconnect");
  await settle();
  // The only presence the peer sees is the sender leaving.
  assert.ok(seen.received.every((event) => event.presence?.status === "offline"));
  await stillServing(server);
});

test("voice signalling nested too deeply is refused before it is relayed", async (t) => {
  const server = await startRealtimeServer(t);
  const alice = await server.client();
  const bob = await server.client();
  await joinVoice(alice, "room-1", "alice");
  await joinVoice(bob, "room-1", "bob");
  const offers = record(bob, SOCKET_EVENTS.VOICE_OFFER);

  sendRaw(alice, SOCKET_EVENTS.VOICE_OFFER, `{"roomId":"room-1","targetId":"bob","offer":${hostile()}}`);
  await once(alice, "disconnect");

  // A claimed userId is relayed too, to everyone already in the room.
  const mallory = await server.client();
  sendRaw(mallory, SOCKET_EVENTS.VOICE_JOIN, `{"roomId":"room-1","userId":${hostile()}}`);
  await once(mallory, "disconnect");

  await settle();
  assert.equal(offers.received.length, 0);

  const carol = await server.client();
  await joinVoice(carol, "room-1", "carol");
  assert.equal((await carol.emitWithAck(SOCKET_EVENTS.VOICE_OFFER, { roomId: "room-1", targetId: "bob", offer: { type: "offer", sdp: "v=0" } })).ok, true);
  await offers.waitFor(1);
});

test("a handshake whose auth nests too deeply is refused before it connects", async (t) => {
  const server = await startRealtimeServer(t);
  // A bare engine connection, so the connect packet can be written by hand:
  // the presence relay falls back to the handshake's userId.
  const manager = new Manager(server.url, {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
    // What a browser on the web app sends; the origin gate refuses others first.
    extraHeaders: { origin: "http://localhost:5173" },
  });
  t.after(() => manager.engine?.close());
  await new Promise((resolve, reject) => manager.open((error) => (error ? reject(error) : resolve())));
  const reply = new Promise((resolve) => manager.on("packet", resolve));

  manager.engine.send(`0{"userId":${hostile()}}`);

  const packet = await reply;
  assert.equal(packet.type, 4, "a connect error");
  assert.match(packet.data.message, /nests too deeply/);
  await stillServing(server);
});

test("ordinary nesting passes, up to the limit", async (t) => {
  const server = await startRealtimeServer(t);
  const sender = await server.client();
  const peer = await server.client();
  await join(sender, "board-1");
  await join(peer, "board-1");
  const seen = record(peer, SOCKET_EVENTS.PRESENCE_UPDATE);

  // [event, { boardId, presence }] adds two levels around what `presence` holds.
  const presence = (levels) => ({ boardId: "board-1", presence: { cursor: nested(levels) } });
  sender.emit(SOCKET_EVENTS.PRESENCE_UPDATE, presence(MAX_MESSAGE_DEPTH - 3));
  await seen.waitFor(1);

  const dropped = once(sender, "disconnect");
  sender.emit(SOCKET_EVENTS.PRESENCE_UPDATE, presence(MAX_MESSAGE_DEPTH - 2));
  assert.equal(await dropped, "io server disconnect");
});
