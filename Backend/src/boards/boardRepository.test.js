const assert = require("node:assert/strict");
const test = require("node:test");
const { generateOpaqueToken } = require("../auth/opaqueTokens");
const { SKIP, startAuthServer } = require("../auth/testServer");
const { createBoardRepository } = require("./boardRepository");

/**
 * Board repository behaviour that HTTP tests cannot pin down: what happens
 * when two acceptances of one invitation interleave. Controlled, not raced,
 * so the result does not depend on timing.
 */

async function seed(database) {
  const { rows: users } = await database.query(
    `INSERT INTO users (email, email_normalized, display_name, password_hash, email_verified_at)
     VALUES ('ada@example.com', 'ada@example.com', 'Ada', 'x', now()),
            ('grace@example.com', 'grace@example.com', 'Grace', 'x', now())
     RETURNING id`,
  );
  const [ada, grace] = users.map((row) => row.id);
  const { rows: boards } = await database.query("INSERT INTO boards (owner_id, title) VALUES ($1, 'Roadmap') RETURNING id", [ada]);
  return { ada, grace, boardId: boards[0].id };
}

/** Resolves once some session is waiting on a row lock. */
async function untilSomeoneWaits(database) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await database.query("SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted");
    if (rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("no session ever waited on a lock");
}

test("an acceptance waiting on the invitation sees the use the other one spent", { skip: SKIP }, async (t) => {
  const server = await startAuthServer(t);
  const { database } = server;
  const boards = createBoardRepository({ database });
  const { ada, grace, boardId } = await seed(database);
  const token = generateOpaqueToken();
  const invite = await boards.createInvite({
    boardId,
    createdBy: ada,
    tokenHash: token.hash,
    role: "editor",
    expiresInDays: 7,
    maxUses: 1,
  });

  let second;
  await database.transaction(async (first) => {
    // The first acceptance holds the invitation...
    await first.query("SELECT id FROM board_invites WHERE id = $1 FOR UPDATE", [invite.id]);

    // ...while the second starts, and must wait for it.
    second = database
      .transaction((tx) => boards.acceptInvite({ tokenHash: token.hash, userId: grace, memberLimit: 50 }, tx))
      .then((result) => ({ result }), (error) => ({ error }));
    await untilSomeoneWaits(database);

    // The first spends the last use and commits.
    await first.query("UPDATE board_invites SET use_count = max_uses WHERE id = $1", [invite.id]);
  });

  const outcome = await second;
  assert.equal(outcome.error, undefined, `the second failed instead of being refused: ${outcome.error?.message}`);
  assert.deepEqual(outcome.result, { outcome: "invalid" });
  const { rows } = await database.query("SELECT count(*)::int AS n FROM board_members");
  assert.equal(rows[0].n, 0);
});
