const assert = require("node:assert/strict");
const test = require("node:test");
const { io: connect } = require("socket.io-client");
const { BASE_CONFIG, SKIP, TRUSTED_ORIGIN, readSetCookie, startAuthServer } = require("../auth/testServer");
const { SOCKET_EVENTS } = require("./socketEvents");
const { buildOperation, once, record, settle } = require("./testRealtimeServer");

/**
 * The authenticated realtime layer (Phase D) against a real PostgreSQL and
 * real Socket.IO clients: handshake, board authorisation, identity, and
 * revocation reaching sockets that are already open.
 */

const PASSWORD = "a-perfectly-fine-passphrase";
const COOKIE = BASE_CONFIG.auth.cookie.name;

async function account(server, name, { verified = true } = {}) {
  const email = `${name.toLowerCase()}@example.com`;
  assert.equal((await server.signup({ email, password: PASSWORD, displayName: name })).status, 202);
  if (verified) {
    await server.database.query("UPDATE users SET email_verified_at = now() WHERE email_normalized = $1", [email]);
  }
  return signIn(server, { email, name });
}

async function signIn(server, who, password = PASSWORD) {
  const response = await server.login({ email: who.email, password });
  const body = await response.json();
  return {
    ...who,
    id: body.user.id,
    token: body.accessToken,
    refreshToken: readSetCookie(response, COOKIE).value,
  };
}

async function http(server, method, path, who, body) {
  const response = await server.authed(method, path, who.token, body);
  return { status: response.status, body: await response.json() };
}

/** A board owned by `owner`, with each `[person, role]` joined through an invitation. */
async function boardWith(server, owner, members = []) {
  const { body } = await http(server, "POST", "/api/boards", owner, { title: "Roadmap" });
  const boardId = body.board.id;
  for (const [person, role] of members) {
    const invite = await http(server, "POST", `/api/boards/${boardId}/invites`, owner, { role });
    assert.equal((await http(server, "POST", "/api/invites/accept", person, { token: invite.body.token })).status, 200);
  }
  return boardId;
}

/**
 * A socket.io client, resolved once connected, or with the refusal. Closed
 * when the test ends.
 */
function socketFor(t, server, { token, origin = TRUSTED_ORIGIN, ...options } = {}) {
  const socket = connect(server.baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: token === undefined ? {} : { token },
    extraHeaders: origin ? { origin } : {},
    ...options,
  });
  t.after(() => socket.disconnect());

  return new Promise((resolve) => {
    socket.once("connect", () => resolve({ socket, refused: null }));
    socket.once("connect_error", (error) => resolve({ socket, refused: error }));
  });
}

async function connected(t, server, who, options) {
  const { socket, refused } = await socketFor(t, server, { token: who.token, ...options });
  assert.equal(refused, null, `setup: ${who.name} connects (${refused?.message})`);
  return socket;
}

const ask = (socket, event, payload) => socket.timeout(2_000).emitWithAck(event, payload);
const join = (socket, boardId) => ask(socket, SOCKET_EVENTS.BOARD_JOIN, { boardId });
const send = (socket, boardId, overrides = {}) =>
  ask(socket, SOCKET_EVENTS.BOARD_EVENT, { operation: buildOperation({ boardId, ...overrides }) });

// --- The handshake ------------------------------------------------------------

test("a connection without a valid token is refused", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);

  const missing = await socketFor(t, server, {});
  const garbage = await socketFor(t, server, { token: "not.a.token" });

  assert.equal(missing.refused?.data?.code, "AUTH_REQUIRED");
  assert.equal(garbage.refused?.data?.code, "AUTH_REQUIRED");
});

test("a token whose session has ended is refused at the handshake", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  await server.logout(ada.refreshToken);

  const { refused } = await socketFor(t, server, { token: ada.token });

  assert.equal(refused?.data?.code, "SESSION_ENDED");
});

test("a page from another origin cannot open a socket, even with a good token", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");

  const foreign = await socketFor(t, server, { token: ada.token, origin: "https://evil.test" });
  const none = await socketFor(t, server, { token: ada.token, origin: null });

  assert.ok(foreign.refused, "a foreign origin connected");
  assert.ok(none.refused, "no origin connected");
});

// --- Joining a board ------------------------------------------------------------

test("only people on a board can join it, and never before the check", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const mallory = await account(server, "Mallory");
  const boardId = await boardWith(server, ada);

  const owner = await connected(t, server, ada);
  assert.deepEqual(await join(owner, boardId), { ok: true, boardId, role: "owner", replayedOperationCount: 0 });
  await send(owner, boardId);

  const outsider = await connected(t, server, mallory);
  const replay = record(outsider, SOCKET_EVENTS.BOARD_EVENT);
  const refused = await join(outsider, boardId);
  const nonsense = await join(outsider, "00000000-0000-4000-8000-000000000000");
  const malformed = await join(outsider, "room-legacy");

  assert.equal(refused.code, "BOARD_NOT_FOUND");
  assert.deepEqual(refused, nonsense);
  assert.equal(malformed.code, "BOARD_NOT_FOUND");
  await settle();
  assert.equal(replay.received.length, 0, "an outsider saw the board's history");
});

test("an unconfirmed account cannot collaborate, even on its own board", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const newbie = await account(server, "Newbie", { verified: false });
  const boardId = await boardWith(server, newbie);

  const socket = await connected(t, server, newbie);

  assert.equal((await join(socket, boardId)).code, "EMAIL_NOT_VERIFIED");
});

test("joining replays the board's history", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "editor"]]);
  const owner = await connected(t, server, ada);
  await join(owner, boardId);
  await send(owner, boardId);
  await send(owner, boardId);

  const late = await connected(t, server, grace);
  const replay = record(late, SOCKET_EVENTS.BOARD_EVENT);
  const joined = await join(late, boardId);

  assert.equal(joined.replayedOperationCount, 2);
  await replay.waitFor(2);
  assert.ok(replay.received.every((event) => event.replay === true));
});

// --- Changing a board -------------------------------------------------------------

test("editors change the board; viewers watch but cannot", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const linus = await account(server, "Linus");
  const boardId = await boardWith(server, ada, [
    [grace, "editor"],
    [linus, "viewer"],
  ]);
  const editor = await connected(t, server, grace);
  const viewer = await connected(t, server, linus);
  await join(editor, boardId);
  assert.equal((await join(viewer, boardId)).role, "viewer");
  const seen = record(viewer, SOCKET_EVENTS.BOARD_EVENT);

  assert.equal((await send(editor, boardId)).ok, true);
  await seen.waitFor(1);

  const refused = await send(viewer, boardId);
  assert.equal(refused.code, "EDIT_FORBIDDEN");
});

test("who made a change is the server's to say, whatever the client claims", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "editor"]]);
  const owner = await connected(t, server, ada);
  const editor = await connected(t, server, grace);
  await join(owner, boardId);
  await join(editor, boardId);
  const seen = record(owner, SOCKET_EVENTS.BOARD_EVENT);

  await send(editor, boardId, { userId: ada.id });

  const [event] = await seen.waitFor(1);
  assert.equal(event.operation.userId, grace.id);
});

test("a change for a board the socket has not joined is refused", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const mallory = await account(server, "Mallory");
  const boardId = await boardWith(server, ada);
  const theirs = await boardWith(server, mallory);
  const socket = await connected(t, server, mallory);
  await join(socket, theirs);

  assert.equal((await send(socket, boardId)).code, "NOT_JOINED");
  assert.equal((await ask(socket, SOCKET_EVENTS.BOARD_EVENT, { operation: { boardId } })).code, "INVALID_PAYLOAD");
});

test("a flood of changes is cut off by the socket's allowance", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const boardId = await boardWith(server, ada);
  const socket = await connected(t, server, ada);
  await join(socket, boardId);

  const answers = await Promise.all(Array.from({ length: 220 }, () => send(socket, boardId)));

  assert.ok(answers.some((answer) => answer.code === "RATE_LIMITED"), "no change was refused");
  assert.ok(answers.filter((answer) => answer.ok).length >= 150);
});

// --- Revocation reaches open sockets ------------------------------------------------

test("a removed member is taken off the board at once, without reconnecting", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "editor"]]);
  const owner = await connected(t, server, ada);
  const editor = await connected(t, server, grace);
  await join(owner, boardId);
  await join(editor, boardId);
  const revoked = once(editor, SOCKET_EVENTS.BOARD_ACCESS_REVOKED);

  await http(server, "DELETE", `/api/boards/${boardId}/members/${grace.id}`, ada);

  assert.deepEqual(await revoked, { boardId, code: "BOARD_NOT_FOUND" });
  assert.ok(editor.connected, "removal from a board is not a sign-out");
  assert.equal((await send(editor, boardId)).code, "NOT_JOINED");

  // And what happens on the board no longer reaches them.
  const after = record(editor, SOCKET_EVENTS.BOARD_EVENT);
  await send(owner, boardId);
  await settle();
  assert.equal(after.received.length, 0);
});

test("a member turned into a viewer stops editing at once", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "editor"]]);
  const editor = await connected(t, server, grace);
  await join(editor, boardId);
  const changed = once(editor, SOCKET_EVENTS.BOARD_ROLE_CHANGED);

  await http(server, "PATCH", `/api/boards/${boardId}/members/${grace.id}`, ada, { role: "viewer" });

  assert.deepEqual(await changed, { boardId, role: "viewer" });
  assert.equal((await send(editor, boardId)).code, "EDIT_FORBIDDEN");
});

test("deleting a board takes everyone off it", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "viewer"]]);
  const owner = await connected(t, server, ada);
  const viewer = await connected(t, server, grace);
  await join(owner, boardId);
  await join(viewer, boardId);
  const ownerRevoked = once(owner, SOCKET_EVENTS.BOARD_ACCESS_REVOKED);
  const viewerRevoked = once(viewer, SOCKET_EVENTS.BOARD_ACCESS_REVOKED);

  await http(server, "DELETE", `/api/boards/${boardId}`, ada);

  await ownerRevoked;
  await viewerRevoked;
});

test("signing out elsewhere closes that session's sockets, and only those", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const phone = await signIn(server, ada);
  const laptopSocket = await connected(t, server, ada);
  const phoneSocket = await connected(t, server, phone);
  const ended = once(phoneSocket, SOCKET_EVENTS.SESSION_ENDED);
  const closed = once(phoneSocket, "disconnect");

  await server.logout(phone.refreshToken);

  assert.deepEqual(await ended, { reason: "session-ended" });
  await closed;
  await settle();
  assert.ok(laptopSocket.connected, "another session's socket was closed too");
});

test("a password change closes every other session's sockets", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const phone = await signIn(server, ada);
  const phoneSocket = await connected(t, server, phone);
  const closed = once(phoneSocket, "disconnect");

  await http(server, "POST", "/api/auth/password", ada, {
    currentPassword: PASSWORD,
    newPassword: "a-brand-new-passphrase",
  });

  await closed;
});

// --- Presence ------------------------------------------------------------------------

test("presence carries the server's identity and nothing a client added", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "viewer"]]);
  const owner = await connected(t, server, ada);
  const viewer = await connected(t, server, grace);

  // Not before joining.
  assert.equal((await ask(viewer, SOCKET_EVENTS.PRESENCE_UPDATE, { boardId, presence: {} })).code, "NOT_JOINED");

  await join(owner, boardId);
  await join(viewer, boardId);
  const seen = once(owner, SOCKET_EVENTS.PRESENCE_UPDATE);
  await ask(viewer, SOCKET_EVENTS.PRESENCE_UPDATE, {
    boardId,
    user: { id: ada.id, username: "Ada (really)", color: "#ff00aa" },
    presence: { status: "online", cursor: { x: 10, y: 20 }, script: "<img onerror=alert(1)>" },
  });

  const event = await seen;
  assert.equal(event.userId, grace.id);
  assert.equal(event.username, "Grace");
  assert.equal(event.color, "#ff00aa");
  assert.deepEqual(event.presence, { status: "online", cursor: { x: 10, y: 20 } });
});

// --- Voice ---------------------------------------------------------------------------

test("voice is for people on the board, and signals carry the server's identity", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const mallory = await account(server, "Mallory");
  const boardId = await boardWith(server, ada, [[grace, "viewer"]]);
  const adaVoice = await connected(t, server, ada);
  const graceVoice = await connected(t, server, grace);
  const malloryVoice = await connected(t, server, mallory);

  assert.equal((await ask(malloryVoice, SOCKET_EVENTS.VOICE_JOIN, { roomId: boardId })).code, "BOARD_NOT_FOUND");
  assert.equal((await ask(adaVoice, SOCKET_EVENTS.VOICE_JOIN, { roomId: boardId })).ok, true);
  const announced = once(adaVoice, SOCKET_EVENTS.VOICE_JOIN);
  assert.equal((await ask(graceVoice, SOCKET_EVENTS.VOICE_JOIN, { roomId: boardId, userId: ada.id })).ok, true);
  assert.equal((await announced).userId, grace.id);

  const offer = once(adaVoice, SOCKET_EVENTS.VOICE_OFFER);
  await ask(graceVoice, SOCKET_EVENTS.VOICE_OFFER, {
    roomId: boardId,
    userId: ada.id,
    targetId: ada.id,
    offer: { type: "offer", sdp: "v=0", extra: "dropped" },
  });
  assert.deepEqual(await offer, { roomId: boardId, userId: grace.id, targetId: ada.id, offer: { type: "offer", sdp: "v=0" } });

  const oversized = await ask(graceVoice, SOCKET_EVENTS.VOICE_OFFER, {
    roomId: boardId,
    targetId: ada.id,
    offer: { type: "offer", sdp: "x".repeat(100_001) },
  });
  assert.equal(oversized.code, "INVALID_PAYLOAD");
});

test("losing access to a board ends its voice too", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "editor"]]);
  const graceVoice = await connected(t, server, grace);
  await ask(graceVoice, SOCKET_EVENTS.VOICE_JOIN, { roomId: boardId });
  const revoked = once(graceVoice, SOCKET_EVENTS.BOARD_ACCESS_REVOKED);

  await http(server, "DELETE", `/api/boards/${boardId}/members/${grace.id}`, ada);

  await revoked;
  assert.equal(
    (await ask(graceVoice, SOCKET_EVENTS.VOICE_OFFER, { roomId: boardId, targetId: ada.id, offer: { type: "offer", sdp: "v=0" } })).code,
    "NOT_JOINED",
  );
});

// --- Recovery --------------------------------------------------------------------------

test("a recovered connection is re-checked: access lost while away is not restored", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const boardId = await boardWith(server, ada, [[grace, "editor"]]);
  const owner = await connected(t, server, ada);
  const editor = await connected(t, server, grace, { reconnection: true, reconnectionDelay: 50 });
  await join(owner, boardId);
  await join(editor, boardId);
  // Recovery resumes from the last broadcast received, so there has to be one.
  const seen = record(editor, SOCKET_EVENTS.BOARD_EVENT);
  await send(owner, boardId);
  await seen.waitFor(1);

  // The connection drops; while it is away, Grace is removed.
  const back = once(editor, "connect", 5_000);
  editor.io.engine.close();
  await http(server, "DELETE", `/api/boards/${boardId}/members/${grace.id}`, ada);
  const revoked = once(editor, SOCKET_EVENTS.BOARD_ACCESS_REVOKED, 5_000);
  await back;

  assert.equal(editor.recovered, true, "the connection was not recovered");
  assert.equal((await revoked).boardId, boardId);
  assert.equal((await send(editor, boardId)).code, "NOT_JOINED");
});

test("a connection is not recovered for a session that ended while away", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const socket = await connected(t, server, ada, { reconnection: true, reconnectionDelay: 50, reconnectionAttempts: 1 });

  const refused = once(socket, "connect_error", 5_000);
  socket.io.engine.close();
  await server.logout(ada.refreshToken);

  assert.equal((await refused).data?.code, "SESSION_ENDED");
});
