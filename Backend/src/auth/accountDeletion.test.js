const assert = require("node:assert/strict");
const test = require("node:test");
const { io: connect } = require("socket.io-client");
const { SOCKET_EVENTS } = require("../realtime/socketEvents");
const { once } = require("../realtime/testRealtimeServer");
const { BASE_CONFIG, SKIP, TRUSTED_ORIGIN, readSetCookie, startAuthServer } = require("./testServer");

/**
 * Deleting an account (spec Phase B, E-22, E-24) against a real PostgreSQL.
 */

const PASSWORD = "a-perfectly-fine-passphrase";
const COOKIE = BASE_CONFIG.auth.cookie.name;

async function account(server, name) {
  const email = `${name.toLowerCase()}@example.com`;
  assert.equal((await server.signup({ email, password: PASSWORD, displayName: name })).status, 202);
  await server.database.query("UPDATE users SET email_verified_at = now() WHERE email_normalized = $1", [email]);
  const response = await server.login({ email, password: PASSWORD });
  const body = await response.json();
  return { name, email, id: body.user.id, token: body.accessToken, refreshToken: readSetCookie(response, COOKIE).value };
}

async function call(server, method, path, who, body) {
  const response = await server.authed(method, path, who.token, body);
  return { status: response.status, body: await response.json(), response };
}

const preflight = (server, who) => call(server, "GET", "/api/auth/delete-account", who);
const destroy = (server, who, body = { confirmation: "DELETE", password: PASSWORD }) =>
  call(server, "POST", "/api/auth/delete-account", who, body);

/** Ada owns "Roadmap", shared with Grace, and "Sketches", private. */
async function setup(t) {
  const server = await startAuthServer(t);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const shared = (await call(server, "POST", "/api/boards", ada, { title: "Roadmap" })).body.board.id;
  const solo = (await call(server, "POST", "/api/boards", ada, { title: "Sketches" })).body.board.id;
  const invite = await call(server, "POST", `/api/boards/${shared}/invites`, ada, {});
  assert.equal((await call(server, "POST", "/api/invites/accept", grace, { token: invite.body.token })).status, 200);
  await server.drainEmail();
  return { server, ada, grace, shared, solo };
}

test("the preflight names the shared boards to deal with first", { skip: SKIP }, async (t) => {
  const { server, ada, grace, shared } = await setup(t);

  const { body } = await preflight(server, ada);

  assert.deepEqual(body, {
    ok: true,
    sharedBoards: [{ id: shared, title: "Roadmap", members: [{ id: grace.id, displayName: "Grace", role: "editor" }] }],
    privateBoardCount: 1,
    proof: "password",
  });
});

test("deletion needs the word DELETE and the current password", { skip: SKIP }, async (t) => {
  const { server, grace } = await setup(t);

  assert.equal((await destroy(server, grace, { password: PASSWORD })).body.code, "DELETE_CONFIRMATION_REQUIRED");
  assert.equal((await destroy(server, grace, { confirmation: "delete", password: PASSWORD })).body.code, "DELETE_CONFIRMATION_REQUIRED");
  assert.equal((await destroy(server, grace, { confirmation: "DELETE" })).body.code, "CURRENT_PASSWORD_REQUIRED");
  assert.equal((await destroy(server, grace, { confirmation: "DELETE", password: "not-my-password" })).body.code, "CURRENT_PASSWORD_INCORRECT");

  assert.equal((await server.login({ email: grace.email, password: PASSWORD })).status, 200);
});

test("a board other people use blocks deletion until it is handed over", { skip: SKIP }, async (t) => {
  const { server, ada, grace, shared } = await setup(t);

  const blocked = await destroy(server, ada);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "ACCOUNT_HAS_SHARED_BOARDS");
  assert.equal((await server.login({ email: ada.email, password: PASSWORD })).status, 200, "nothing was deleted");

  assert.equal((await call(server, "POST", `/api/boards/${shared}/transfer`, ada, { userId: grace.id })).status, 200);
  assert.equal((await destroy(server, ada)).status, 200);

  // The board lives on with Grace as its owner, and nobody deleted on it.
  const board = await call(server, "GET", `/api/boards/${shared}`, grace);
  assert.equal(board.body.board.role, "owner");
  assert.equal(board.body.board.title, "Roadmap");
  assert.deepEqual(board.body.board.members, []);
});

test("deleting a shared board also clears the way", { skip: SKIP }, async (t) => {
  const { server, ada, grace, shared } = await setup(t);

  await call(server, "DELETE", `/api/boards/${shared}`, ada);

  assert.equal((await destroy(server, ada)).status, 200);
  assert.deepEqual((await call(server, "GET", "/api/boards", grace)).body.boards, []);
});

test("a deleted account is gone at once: sessions, tokens, boards, memberships", { skip: SKIP }, async (t) => {
  const { server, ada, grace, shared } = await setup(t);
  await call(server, "POST", "/api/auth/resend-verification", grace, {}); // outstanding email token
  const graceElsewhere = await server.login({ email: grace.email, password: PASSWORD });
  const otherRefresh = readSetCookie(graceElsewhere, COOKIE).value;

  const deleted = await destroy(server, grace);

  assert.equal(deleted.status, 200);
  assert.equal(readSetCookie(deleted.response, COOKIE).value, "", "the refresh cookie is cleared");

  // Nothing signs in as Grace any more.
  assert.equal((await server.login({ email: grace.email, password: PASSWORD })).status, 401);
  assert.equal((await server.me(grace.token)).status, 401);
  for (const token of [grace.refreshToken, otherRefresh]) {
    assert.equal((await (await server.refresh(token)).json()).code, "SESSION_INVALID");
  }

  // Nothing of hers is left behind.
  const left = await server.database.query(
    `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
            (SELECT count(*) FROM auth_sessions WHERE user_id = $1)::int AS sessions,
            (SELECT count(*) FROM account_tokens WHERE user_id = $1)::int AS tokens,
            (SELECT count(*) FROM board_members WHERE user_id = $1)::int AS memberships`,
    [grace.id],
  );
  assert.deepEqual(left.rows[0], { users: 0, sessions: 0, tokens: 0, memberships: 0 });

  // Ada's board is untouched, and Grace is no longer on it.
  const board = await call(server, "GET", `/api/boards/${shared}`, ada);
  assert.deepEqual(board.body.board.members, []);

  await server.drainEmail();
  assert.equal(server.mailbox.to(grace.email).at(-1).subject, "Your FlowBoard account was deleted");
});

test("an owner's private boards go with the account", { skip: SKIP }, async (t) => {
  const { server, grace, solo } = await setup(t);
  const graceSolo = (await call(server, "POST", "/api/boards", grace, { title: "Mine" })).body.board.id;

  await destroy(server, grace);

  const { rows } = await server.database.query("SELECT id FROM boards ORDER BY title");
  assert.ok(!rows.some((row) => row.id === graceSolo));
  assert.ok(rows.some((row) => row.id === solo), "someone else's board was touched");
});

test("an account with no password must sign in with its provider again first", { skip: SKIP }, async (t) => {
  const { server, grace } = await setup(t);
  await server.database.query("UPDATE users SET password_hash = NULL WHERE id = $1", [grace.id]);

  assert.equal((await preflight(server, grace)).body.proof, "provider");
  assert.equal((await destroy(server, grace, { confirmation: "DELETE" })).body.code, "REAUTHENTICATION_REQUIRED");

  await server.database.query("UPDATE auth_sessions SET reauthenticated_at = now() WHERE user_id = $1", [grace.id]);
  assert.equal((await destroy(server, grace, { confirmation: "DELETE" })).status, 200);
});

test("the address is free for a new account afterwards", { skip: SKIP }, async (t) => {
  const { server, grace } = await setup(t);

  await destroy(server, grace);

  assert.equal((await server.signup({ email: grace.email, password: "a-second-life-passphrase", displayName: "Grace" })).status, 202);
  const again = await server.login({ email: grace.email, password: "a-second-life-passphrase" });
  assert.equal(again.status, 200);
  assert.notEqual((await again.json()).user.id, grace.id);
});

test("deletion closes the account's live connections", { skip: SKIP }, async (t) => {
  const { server, grace } = await setup(t);
  const socket = connect(server.baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: { token: grace.token },
    extraHeaders: { origin: TRUSTED_ORIGIN },
  });
  t.after(() => socket.disconnect());
  await once(socket, "connect");
  const ended = once(socket, SOCKET_EVENTS.SESSION_ENDED);
  const closed = once(socket, "disconnect");

  await destroy(server, grace);

  assert.deepEqual(await ended, { reason: "account-deleted" });
  await closed;
});
