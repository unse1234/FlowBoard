const assert = require("node:assert/strict");
const test = require("node:test");
const { hashOpaqueToken } = require("../auth/opaqueTokens");
const { SKIP, startAuthServer } = require("../auth/testServer");

/**
 * The board and invitation API (spec Phase C) against a real PostgreSQL.
 * The negative cases carry the weight: every role against every action, and
 * every way an invitation can be dead.
 */

const PASSWORD = "a-perfectly-fine-passphrase";

/** Sign up, optionally confirm the address, and sign in. */
async function account(server, name, { verified = true } = {}) {
  const email = `${name.toLowerCase()}@example.com`;
  assert.equal((await server.signup({ email, password: PASSWORD, displayName: name })).status, 202);
  if (verified) {
    await server.database.query("UPDATE users SET email_verified_at = now() WHERE email_normalized = $1", [email]);
  }
  const response = await server.login({ email, password: PASSWORD });
  const body = await response.json();
  return { email, name, id: body.user.id, token: body.accessToken };
}

function api(server) {
  const call = async (method, path, who, body) => {
    const response = await server.authed(method, path, who?.token, body);
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return {
    call,
    create: (who, title) => call("POST", "/api/boards", who, title === undefined ? {} : { title }),
    list: (who) => call("GET", "/api/boards", who),
    get: (who, boardId) => call("GET", `/api/boards/${boardId}`, who),
    rename: (who, boardId, title) => call("PATCH", `/api/boards/${boardId}`, who, { title }),
    remove: (who, boardId) => call("DELETE", `/api/boards/${boardId}`, who),
    invite: (who, boardId, options = {}) => call("POST", `/api/boards/${boardId}/invites`, who, options),
    invites: (who, boardId) => call("GET", `/api/boards/${boardId}/invites`, who),
    revoke: (who, boardId, inviteId) => call("DELETE", `/api/boards/${boardId}/invites/${inviteId}`, who),
    accept: (who, token) => call("POST", "/api/invites/accept", who, { token }),
    preview: (who, token) => call("POST", "/api/invites/preview", who, { token }),
    setRole: (who, boardId, userId, role) => call("PATCH", `/api/boards/${boardId}/members/${userId}`, who, { role }),
    removeMember: (who, boardId, userId) => call("DELETE", `/api/boards/${boardId}/members/${userId}`, who),
    transfer: (who, boardId, userId) => call("POST", `/api/boards/${boardId}/transfer`, who, { userId }),
  };
}

/** A server, an owner with a board, and a verified second person. */
async function sharedSetup(t, options) {
  const server = await startAuthServer(t, options);
  const boards = api(server);
  const ada = await account(server, "Ada");
  const grace = await account(server, "Grace");
  const { body } = await boards.create(ada, "Roadmap");
  return { server, boards, ada, grace, boardId: body.board.id };
}

async function join(boards, owner, boardId, person, options) {
  const { body } = await boards.invite(owner, boardId, options);
  const accepted = await boards.accept(person, body.token);
  assert.equal(accepted.status, 200, `setup: ${person.name} joins`);
  return body;
}

// --- Private by default ----------------------------------------------------

test("a new board is private: listed for its owner, invisible to everyone else", { skip: SKIP }, async (t) => {
  const { boards, ada, grace, boardId } = await sharedSetup(t);

  const mine = await boards.list(ada);
  assert.deepEqual(
    mine.body.boards.map((board) => [board.title, board.role, board.memberCount]),
    [["Roadmap", "owner", 0]],
  );
  assert.deepEqual((await boards.list(grace)).body.boards, []);

  // Knowing the id grants nothing, and says nothing about whether it exists.
  const theirs = await boards.get(grace, boardId);
  const nonsense = await boards.get(grace, "00000000-0000-4000-8000-000000000000");
  assert.equal(theirs.status, 404);
  assert.deepEqual(theirs.body, nonsense.body);
  assert.equal(theirs.body.code, "BOARD_NOT_FOUND");
});

test("an unconfirmed account can make, rename and delete its own boards", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const boards = api(server);
  const newbie = await account(server, "Newbie", { verified: false });

  const created = await boards.create(newbie);
  assert.equal(created.status, 201);
  assert.equal(created.body.board.title, "Untitled board");
  const boardId = created.body.board.id;

  assert.equal((await boards.rename(newbie, boardId, "  My sketches ")).body.board.title, "My sketches");
  assert.equal((await boards.remove(newbie, boardId)).status, 200);
  assert.equal((await boards.get(newbie, boardId)).status, 404);
});

test("board titles are trimmed, bounded and visible characters only", { skip: SKIP }, async (t) => {
  const { boards, ada, boardId } = await sharedSetup(t);

  for (const [title, code] of [
    ["", "BOARD_TITLE_REQUIRED"],
    ["   ", "BOARD_TITLE_REQUIRED"],
    ["x".repeat(121), "BOARD_TITLE_TOO_LONG"],
    [`Plan${String.fromCodePoint(0x202e)}`, "BOARD_TITLE_REQUIRED"],
    [7, "BOARD_TITLE_REQUIRED"],
  ]) {
    assert.equal((await boards.rename(ada, boardId, title)).body.code, code, JSON.stringify(title));
  }
});

// --- Invitations -------------------------------------------------------------

test("an invitation is a token shown once and stored only as its digest", { skip: SKIP }, async (t) => {
  const { server, boards, ada, boardId } = await sharedSetup(t);

  const { status, body } = await boards.invite(ada, boardId);

  assert.equal(status, 201);
  assert.match(body.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(body.url, `http://localhost:5173/invite/${body.token}`);
  assert.equal(body.invite.role, "editor");
  assert.equal(body.invite.maxUses, 1);
  const days = (new Date(body.invite.expiresAt) - new Date(body.invite.createdAt)) / 86_400_000;
  assert.equal(Math.round(days), 7);

  const { rows } = await server.database.query("SELECT * FROM board_invites");
  assert.deepEqual(rows[0].token_hash, hashOpaqueToken(body.token));
  assert.ok(!JSON.stringify(rows).includes(body.token));
  // The owner's list shows the invitation, never its token.
  const listed = await boards.invites(ada, boardId);
  assert.equal(listed.body.invites.length, 1);
  assert.ok(!JSON.stringify(listed.body).includes(body.token));
});

test("accepting needs a signed-in account with a confirmed address", { skip: SKIP }, async (t) => {
  const { server, boards, ada, boardId } = await sharedSetup(t);
  const newbie = await account(server, "Newbie", { verified: false });
  const { body } = await boards.invite(ada, boardId);

  const anonymous = await boards.accept(undefined, body.token);
  assert.equal(anonymous.status, 401);

  const unconfirmed = await boards.accept(newbie, body.token);
  assert.equal(unconfirmed.status, 403);
  assert.equal(unconfirmed.body.code, "EMAIL_NOT_VERIFIED");

  // Neither attempt spent the invitation.
  await server.database.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [newbie.id]);
  const confirmed = await boards.accept(newbie, body.token);
  assert.equal(confirmed.status, 200);
  assert.deepEqual(confirmed.body, { ok: true, board: { id: boardId, title: "Roadmap" }, role: "editor", joined: true });
});

test("an unconfirmed owner cannot invite anyone", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const boards = api(server);
  const newbie = await account(server, "Newbie", { verified: false });
  const { body } = await boards.create(newbie, "Solo");

  const response = await boards.invite(newbie, body.board.id);

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "EMAIL_NOT_VERIFIED");
});

test("an invitation works as many times as it says, then fails closed", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);
  const linus = await account(server, "Linus");
  const margaret = await account(server, "Margaret");

  const single = (await boards.invite(ada, boardId)).body.token;
  assert.equal((await boards.accept(grace, single)).status, 200);
  const spent = await boards.accept(linus, single);
  assert.equal(spent.status, 410);
  assert.equal(spent.body.code, "INVITE_INVALID");

  const double = (await boards.invite(ada, boardId, { maxUses: 2, role: "viewer" })).body.token;
  assert.equal((await boards.accept(linus, double)).body.role, "viewer");
  assert.equal((await boards.accept(margaret, double)).status, 200);
  assert.equal((await boards.list(ada)).body.boards[0].memberCount, 3);
});

test("expired, withdrawn and made-up invitations all get the same answer", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);

  const expired = (await boards.invite(ada, boardId)).body.token;
  await server.database.query(
    "UPDATE board_invites SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'",
  );
  const withdrawn = await boards.invite(ada, boardId);
  assert.equal((await boards.revoke(ada, boardId, withdrawn.body.invite.id)).status, 200);

  const answers = [];
  for (const token of [expired, withdrawn.body.token, "A".repeat(43), "not-a-token", undefined]) {
    answers.push(await boards.accept(grace, token));
  }
  for (const answer of answers) {
    assert.equal(answer.status, 410);
    assert.deepEqual(answer.body, answers[0].body);
  }
  assert.deepEqual((await boards.list(grace)).body.boards, []);
});

test("accepting again, or as the owner, spends nothing and changes nothing", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);
  const { token } = (await boards.invite(ada, boardId, { maxUses: 3 })).body;

  await boards.accept(grace, token);
  const again = await boards.accept(grace, token);
  const owner = await boards.accept(ada, token);

  assert.equal(again.body.joined, false);
  assert.equal(again.body.role, "editor");
  assert.equal(owner.body.role, "owner");
  const { rows } = await server.database.query("SELECT use_count FROM board_invites");
  assert.equal(rows[0].use_count, 1);
});

test("two people racing for the last use: exactly one gets in", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);
  const linus = await account(server, "Linus");
  const { token } = (await boards.invite(ada, boardId)).body;

  const results = await Promise.all([boards.accept(grace, token), boards.accept(linus, token)]);

  assert.deepEqual(results.map((result) => result.status).sort(), [200, 410]);
  assert.equal((await boards.get(ada, boardId)).body.board.members.length, 1);
});

test("a preview says what an invitation is for, and spends nothing", { skip: SKIP }, async (t) => {
  const { server, boards, ada, boardId } = await sharedSetup(t);
  const newbie = await account(server, "Newbie", { verified: false });
  const { token } = (await boards.invite(ada, boardId, { role: "viewer" })).body;

  const preview = await boards.preview(newbie, token);

  assert.equal(preview.status, 200);
  assert.equal(preview.body.invite.boardTitle, "Roadmap");
  assert.equal(preview.body.invite.invitedBy, "Ada");
  assert.equal(preview.body.invite.role, "viewer");
  assert.equal(preview.body.invite.boardId, null);
  assert.equal((await boards.preview(newbie, "A".repeat(43))).body.code, "INVITE_INVALID");
  const { rows } = await server.database.query("SELECT use_count FROM board_invites");
  assert.equal(rows[0].use_count, 0);
});

// --- Roles ---------------------------------------------------------------------

test("only the owner manages a board; editors and viewers are refused", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);
  const linus = await account(server, "Linus");
  await join(boards, ada, boardId, grace, { role: "editor" });
  await join(boards, ada, boardId, linus, { role: "viewer" });

  for (const member of [grace, linus]) {
    const attempts = [
      await boards.rename(member, boardId, "Mine now"),
      await boards.remove(member, boardId),
      await boards.invite(member, boardId),
      await boards.invites(member, boardId),
      await boards.setRole(member, boardId, ada.id, "viewer"),
      await boards.transfer(member, boardId, member.id),
    ];
    for (const attempt of attempts) {
      assert.equal(attempt.status, 403, member.name);
      assert.equal(attempt.body.code, "BOARD_FORBIDDEN", member.name);
    }
  }
  // An editor cannot remove someone else either.
  assert.equal((await boards.removeMember(grace, boardId, linus.id)).body.code, "BOARD_FORBIDDEN");
  assert.equal((await boards.get(ada, boardId)).body.board.title, "Roadmap");
});

test("members see names; only the owner sees addresses", { skip: SKIP }, async (t) => {
  const { boards, ada, grace, boardId } = await sharedSetup(t);
  await join(boards, ada, boardId, grace);

  const asOwner = (await boards.get(ada, boardId)).body.board;
  const asMember = (await boards.get(grace, boardId)).body.board;

  assert.equal(asOwner.members[0].email, "grace@example.com");
  assert.equal(asOwner.owner.email, "ada@example.com");
  assert.equal(asMember.role, "editor");
  assert.ok(!JSON.stringify(asMember).includes("@example.com"));
});

test("the owner changes roles and removes people, and each change is announced", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);
  await join(boards, ada, boardId, grace);
  const events = [];
  server.accountEvents.subscribe((event) => events.push(event));

  assert.equal((await boards.setRole(ada, boardId, grace.id, "viewer")).status, 200);
  assert.equal((await boards.get(grace, boardId)).body.board.role, "viewer");
  assert.equal((await boards.setRole(ada, boardId, grace.id, "owner")).body.code, "ROLE_INVALID");

  assert.equal((await boards.removeMember(ada, boardId, grace.id)).status, 200);
  assert.equal((await boards.get(grace, boardId)).status, 404);
  assert.equal((await boards.removeMember(ada, boardId, grace.id)).body.code, "MEMBER_NOT_FOUND");

  assert.deepEqual(
    events.map((event) => [event.type, event.boardId]),
    [
      ["board-access-changed", boardId],
      ["board-access-changed", boardId],
    ],
  );
});

test("a member can leave; the owner cannot, only hand over or delete", { skip: SKIP }, async (t) => {
  const { boards, ada, grace, boardId } = await sharedSetup(t);
  await join(boards, ada, boardId, grace);

  assert.equal((await boards.removeMember(grace, boardId, grace.id)).status, 200);
  assert.equal((await boards.get(grace, boardId)).status, 404);
  assert.equal((await boards.removeMember(ada, boardId, ada.id)).body.code, "MEMBER_NOT_FOUND");
  assert.equal((await boards.get(ada, boardId)).body.board.role, "owner");
});

test("handing a board over: the new owner takes it, the old one stays as an editor", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);
  const linus = await account(server, "Linus");
  await join(boards, ada, boardId, grace);
  const open = (await boards.invite(ada, boardId)).body.token;

  assert.equal((await boards.transfer(ada, boardId, linus.id)).body.code, "TRANSFER_TARGET_INVALID");
  assert.equal((await boards.transfer(ada, boardId, grace.id)).status, 200);

  assert.equal((await boards.get(grace, boardId)).body.board.role, "owner");
  assert.equal((await boards.get(ada, boardId)).body.board.role, "editor");
  assert.equal((await boards.rename(ada, boardId, "Not mine")).body.code, "BOARD_FORBIDDEN");
  // The old owner's invitations went with the ownership.
  assert.equal((await boards.accept(linus, open)).body.code, "INVITE_INVALID");
});

test("deleting a board takes everyone's access with it", { skip: SKIP }, async (t) => {
  const { server, boards, ada, grace, boardId } = await sharedSetup(t);
  await join(boards, ada, boardId, grace);

  assert.equal((await boards.remove(ada, boardId)).status, 200);

  assert.equal((await boards.get(grace, boardId)).status, 404);
  const { rows } = await server.database.query("SELECT count(*)::int AS n FROM board_members");
  assert.equal(rows[0].n, 0);
});

// --- Sessions and limits ----------------------------------------------------

test("board access ends with the session", { skip: SKIP }, async (t) => {
  const { server, boards, ada, boardId } = await sharedSetup(t);
  await server.database.query("UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'logout'");

  const response = await boards.get(ada, boardId);

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "AUTHENTICATION_REQUIRED");
  assert.match(response.headers.get("www-authenticate"), /invalid_token/);
});

test("each account has a request allowance", { skip: SKIP }, async (t) => {
  const { boards, ada } = await sharedSetup(t, { boardsRateLimitPerMinute: 3 });

  // One request spent creating the board in setup.
  await boards.list(ada);
  await boards.list(ada);
  const refused = await boards.list(ada);

  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get("retry-after")) > 0);
});

test("open invitations and owned boards are capped", { skip: SKIP }, async (t) => {
  const { server, boards, ada, boardId } = await sharedSetup(t);

  for (let index = 0; index < 20; index += 1) assert.equal((await boards.invite(ada, boardId)).status, 201);
  assert.equal((await boards.invite(ada, boardId)).body.code, "INVITE_LIMIT_REACHED");

  await server.database.query(
    "INSERT INTO boards (owner_id, title) SELECT $1, 'Filler ' || n FROM generate_series(1, 99) AS n",
    [ada.id],
  );
  assert.equal((await boards.create(ada, "One too many")).body.code, "BOARD_LIMIT_REACHED");
});

test("invitation settings outside their bounds are refused", { skip: SKIP }, async (t) => {
  const { boards, ada, boardId } = await sharedSetup(t);

  for (const options of [{ expiresInDays: 0 }, { expiresInDays: 31 }, { maxUses: 0 }, { maxUses: 51 }, { maxUses: 1.5 }]) {
    assert.equal((await boards.invite(ada, boardId, options)).body.code, "INVITE_OPTIONS_INVALID", JSON.stringify(options));
  }
  assert.equal((await boards.invite(ada, boardId, { role: "owner" })).body.code, "ROLE_INVALID");
});

// --- The database's own guarantees -----------------------------------------------

test("the owner can never also be a member, and an owner cannot be deleted", { skip: SKIP }, async (t) => {
  const { server, ada, boardId } = await sharedSetup(t);

  await assert.rejects(
    server.database.query("INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'editor')", [boardId, ada.id]),
    { code: "23514" },
  );
  // restrict_violation: an account that still owns a board cannot go (E-22).
  await assert.rejects(server.database.query("DELETE FROM users WHERE id = $1", [ada.id]), {
    code: "23001",
    constraint: "boards_owner_id_fkey",
  });
});
