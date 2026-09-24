const assert = require("node:assert/strict");
const test = require("node:test");
const { SOCKET_EVENTS } = require("./socketEvents");
const { once, record, settle, startRealtimeServer } = require("./testRealtimeServer");

/**
 * The voice gateway, against a real Socket.IO server.
 *
 * The server never carries audio: it only introduces peers to each other and
 * passes their WebRTC negotiation along. The behaviour worth pinning is
 * therefore almost entirely about *who* receives each message, which is why
 * these tests use real clients rather than fakes.
 *
 * As with the board gateway, behaviour that is a known finding is pinned and
 * labelled, so Phase 5 changes it deliberately.
 */

const joinVoice = (socket, roomId, userId, username = "Someone") =>
  socket.emitWithAck(SOCKET_EVENTS.VOICE_JOIN, { roomId, userId, username });

test("joining a voice room is acknowledged", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();

  const ack = await joinVoice(socket, "room-1", "user_a");

  assert.equal(ack.ok, true);
  assert.equal(ack.roomId, "room-1");
});

test("joining without a room id is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();

  for (const roomId of [undefined, null, "", "  "]) {
    const ack = await joinVoice(socket, roomId, "user_a");
    assert.equal(ack.ok, false);
    assert.match(ack.error, /roomId/);
  }
});

test("a newcomer is told who is already in the room", async (t) => {
  const server = await startRealtimeServer(t);
  const [first, second] = [await server.client(), await server.client()];
  await joinVoice(first, "room-1", "user_a", "Ada");

  const introductions = record(second, SOCKET_EVENTS.VOICE_JOIN);
  await joinVoice(second, "room-1", "user_b", "Bob");

  // Without this the newcomer would not know whom to offer a connection to.
  const received = await introductions.waitFor(1);
  assert.equal(received[0].userId, "user_a");
  assert.equal(received[0].username, "Ada");
});

test("the room is told about a newcomer", async (t) => {
  const server = await startRealtimeServer(t);
  const [first, second] = [await server.client(), await server.client()];
  await joinVoice(first, "room-1", "user_a", "Ada");

  const announced = once(first, SOCKET_EVENTS.VOICE_JOIN);
  await joinVoice(second, "room-1", "user_b", "Bob");

  const event = await announced;
  assert.equal(event.userId, "user_b");
  assert.equal(event.username, "Bob");
});

test("a newcomer is not introduced to itself", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();

  const introductions = record(socket, SOCKET_EVENTS.VOICE_JOIN);
  await joinVoice(socket, "room-1", "user_a");
  await settle();

  assert.equal(introductions.received.length, 0);
});

test("voice rooms are isolated from each other", async (t) => {
  const server = await startRealtimeServer(t);
  const [inRoomOne, inRoomTwo] = [await server.client(), await server.client()];
  await joinVoice(inRoomOne, "room-1", "user_a");

  const leaked = record(inRoomOne, SOCKET_EVENTS.VOICE_JOIN);
  await joinVoice(inRoomTwo, "room-2", "user_b");
  await settle();

  assert.equal(leaked.received.length, 0);
});

test("an offer goes only to its target", async (t) => {
  const server = await startRealtimeServer(t);
  const [caller, target, bystander] = [
    await server.client(),
    await server.client(),
    await server.client(),
  ];
  await joinVoice(caller, "room-1", "user_a");
  await joinVoice(target, "room-1", "user_b");
  await joinVoice(bystander, "room-1", "user_c");

  const delivered = once(target, SOCKET_EVENTS.VOICE_OFFER);
  const overheard = record(bystander, SOCKET_EVENTS.VOICE_OFFER);

  const ack = await caller.emitWithAck(SOCKET_EVENTS.VOICE_OFFER, {
    roomId: "room-1",
    userId: "user_a",
    targetId: "user_b",
    offer: { type: "offer", sdp: "v=0" },
  });
  assert.equal(ack.ok, true);

  const event = await delivered;
  assert.equal(event.userId, "user_a");
  assert.equal(event.targetId, "user_b");
  assert.deepEqual(event.offer, { type: "offer", sdp: "v=0" });

  // Broadcasting SDP to the whole room would hand every participant connection
  // metadata meant for one peer.
  await settle();
  assert.equal(overheard.received.length, 0);
});

test("an answer goes only to its target", async (t) => {
  const server = await startRealtimeServer(t);
  const [caller, callee, bystander] = [
    await server.client(),
    await server.client(),
    await server.client(),
  ];
  await joinVoice(caller, "room-1", "user_a");
  await joinVoice(callee, "room-1", "user_b");
  await joinVoice(bystander, "room-1", "user_c");

  const delivered = once(caller, SOCKET_EVENTS.VOICE_ANSWER);
  const overheard = record(bystander, SOCKET_EVENTS.VOICE_ANSWER);

  await callee.emitWithAck(SOCKET_EVENTS.VOICE_ANSWER, {
    roomId: "room-1",
    userId: "user_b",
    targetId: "user_a",
    answer: { type: "answer", sdp: "v=0" },
  });

  assert.equal((await delivered).userId, "user_b");
  await settle();
  assert.equal(overheard.received.length, 0);
});

test("an ICE candidate goes only to its target", async (t) => {
  const server = await startRealtimeServer(t);
  const [caller, target, bystander] = [
    await server.client(),
    await server.client(),
    await server.client(),
  ];
  await joinVoice(caller, "room-1", "user_a");
  await joinVoice(target, "room-1", "user_b");
  await joinVoice(bystander, "room-1", "user_c");

  const delivered = once(target, SOCKET_EVENTS.VOICE_ICE);
  const overheard = record(bystander, SOCKET_EVENTS.VOICE_ICE);

  await caller.emitWithAck(SOCKET_EVENTS.VOICE_ICE, {
    roomId: "room-1",
    userId: "user_a",
    targetId: "user_b",
    candidate: { candidate: "candidate:1 1 udp 2113937151 192.168.1.5 54321 typ host" },
  });

  // An ICE candidate carries local network addresses, so fanning it out would
  // tell the whole room where everyone is on their network.
  assert.match((await delivered).candidate.candidate, /192\.168\.1\.5/);
  await settle();
  assert.equal(overheard.received.length, 0);
});

test("signalling to someone who is not in the room is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();
  await joinVoice(socket, "room-1", "user_a");

  for (const [event, extra] of [
    [SOCKET_EVENTS.VOICE_OFFER, { offer: {} }],
    [SOCKET_EVENTS.VOICE_ANSWER, { answer: {} }],
    [SOCKET_EVENTS.VOICE_ICE, { candidate: {} }],
  ]) {
    const ack = await socket.emitWithAck(event, {
      roomId: "room-1",
      userId: "user_a",
      targetId: "user_nobody",
      ...extra,
    });

    assert.equal(ack.ok, false, `${event} should refuse an absent target`);
    assert.match(ack.error, /not in this voice room/);
  }
});

test("signalling without a room or a target is refused", async (t) => {
  const server = await startRealtimeServer(t);
  const socket = await server.client();
  await joinVoice(socket, "room-1", "user_a");

  const missingTarget = await socket.emitWithAck(SOCKET_EVENTS.VOICE_OFFER, {
    roomId: "room-1",
    offer: {},
  });
  assert.equal(missingTarget.ok, false);

  const missingRoom = await socket.emitWithAck(SOCKET_EVENTS.VOICE_OFFER, {
    targetId: "user_b",
    offer: {},
  });
  assert.equal(missingRoom.ok, false);

  // A candidate is required as well as the addressing.
  const missingCandidate = await socket.emitWithAck(SOCKET_EVENTS.VOICE_ICE, {
    roomId: "room-1",
    targetId: "user_b",
  });
  assert.equal(missingCandidate.ok, false);
  assert.match(missingCandidate.error, /candidate/);
});

test("leaving tells the room", async (t) => {
  const server = await startRealtimeServer(t);
  const [leaver, remaining] = [await server.client(), await server.client()];
  await joinVoice(leaver, "room-1", "user_a");
  await joinVoice(remaining, "room-1", "user_b");

  const seen = once(remaining, SOCKET_EVENTS.VOICE_LEAVE);
  const ack = await leaver.emitWithAck(SOCKET_EVENTS.VOICE_LEAVE, {
    roomId: "room-1",
    userId: "user_a",
  });

  assert.equal(ack.ok, true);
  assert.equal((await seen).userId, "user_a");
});

test("a participant who left can no longer be signalled", async (t) => {
  const server = await startRealtimeServer(t);
  const [leaver, caller] = [await server.client(), await server.client()];
  await joinVoice(leaver, "room-1", "user_a");
  await joinVoice(caller, "room-1", "user_b");
  await leaver.emitWithAck(SOCKET_EVENTS.VOICE_LEAVE, { roomId: "room-1", userId: "user_a" });

  const ack = await caller.emitWithAck(SOCKET_EVENTS.VOICE_OFFER, {
    roomId: "room-1",
    userId: "user_b",
    targetId: "user_a",
    offer: {},
  });

  // The registry entry is removed on leave, so peers stop trying to reach a
  // socket that is gone.
  assert.equal(ack.ok, false);
});

test("disconnecting tells the room", async (t) => {
  const server = await startRealtimeServer(t);
  const [leaver, remaining] = [await server.client(), await server.client()];
  await joinVoice(leaver, "room-1", "user_a");
  await joinVoice(remaining, "room-1", "user_b");

  const seen = once(remaining, SOCKET_EVENTS.VOICE_LEAVE);
  leaver.disconnect();

  assert.equal((await seen).userId, "user_a");
});

test("disconnecting without having joined tells nobody", async (t) => {
  const server = await startRealtimeServer(t);
  const [idle, participant] = [await server.client(), await server.client()];
  await joinVoice(participant, "room-1", "user_a");

  const heard = record(participant, SOCKET_EVENTS.VOICE_LEAVE);
  idle.disconnect();
  await settle();

  assert.equal(heard.received.length, 0);
});

test("rejoining from a new socket replaces the old route", async (t) => {
  const server = await startRealtimeServer(t);
  const [original, caller] = [await server.client(), await server.client()];
  await joinVoice(original, "room-1", "user_a");
  await joinVoice(caller, "room-1", "user_b");

  // A reconnect: the same user arrives on a different socket.
  const reconnected = await server.client();
  await joinVoice(reconnected, "room-1", "user_a");

  const delivered = once(reconnected, SOCKET_EVENTS.VOICE_OFFER);
  const stale = record(original, SOCKET_EVENTS.VOICE_OFFER);

  await caller.emitWithAck(SOCKET_EVENTS.VOICE_OFFER, {
    roomId: "room-1",
    userId: "user_b",
    targetId: "user_a",
    offer: {},
  });

  // Signalling has to follow the user to their current socket, or a reconnect
  // would leave them unreachable.
  await delivered;
  await settle();
  assert.equal(stale.received.length, 0);
});

// --- behaviour that is a known finding --------------------------------------

test("F-7: joining a voice room needs no board membership and no identity", async (t) => {
  const server = await startRealtimeServer(t);
  const participant = await server.client();
  await joinVoice(participant, "private-room", "user_a", "Ada");

  // Never joined the board, never authenticated, and picked its own user id.
  const stranger = await server.client();
  const introductions = record(stranger, SOCKET_EVENTS.VOICE_JOIN);
  const ack = await joinVoice(stranger, "private-room", "user_intruder", "Intruder");

  assert.equal(ack.ok, true);

  // And is handed the participant list, which is itself a disclosure.
  const received = await introductions.waitFor(1);
  assert.equal(received[0].userId, "user_a");
  assert.equal(received[0].username, "Ada");
});

test("F-2: a voice participant may claim any user id", async (t) => {
  const server = await startRealtimeServer(t);
  const [impostor, watcher] = [await server.client(), await server.client()];
  await joinVoice(watcher, "room-1", "user_b");

  const announced = once(watcher, SOCKET_EVENTS.VOICE_JOIN);
  await joinVoice(impostor, "room-1", "user_someone_else", "Not Me");

  // Nothing ties the claimed id to the socket, so a participant can appear in
  // the room as anyone.
  assert.equal((await announced).userId, "user_someone_else");
});
