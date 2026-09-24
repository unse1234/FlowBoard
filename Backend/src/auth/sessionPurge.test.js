const assert = require("node:assert/strict");
const test = require("node:test");
const { createSessionRepository } = require("./sessionRepository");
const { SKIP, VALID_SIGNUP, startAuthServer } = require("./testServer");

/**
 * The purge of dead sessions (chunk 3.1), against a real PostgreSQL.
 *
 * Without it, refresh_tokens grows by a row per rotation forever (E-13). The
 * purge must take exactly the sessions dead for longer than the retention,
 * and nothing that is live or only recently dead.
 */

const CREDENTIALS = Object.freeze({ email: VALID_SIGNUP.email, password: VALID_SIGNUP.password });
const DAY = 24 * 60 * 60;

async function serverWithSessions(t, options) {
  const server = await startAuthServer(t, options);
  assert.equal((await server.signup(VALID_SIGNUP)).status, 202, "setup: signup");
  return server;
}

/** A session row in a given state, with two tokens, for the purge to consider. */
async function seedSession(server, { label, createdDaysAgo, expiresInDays, revokedDaysAgo = null }) {
  const { rows } = await server.database.query(
    `INSERT INTO auth_sessions (user_id, created_at, last_used_at, expires_at, revoked_at, revoked_reason, user_agent)
     SELECT id,
            now() - make_interval(days => $1),
            now() - make_interval(days => $1),
            now() + make_interval(days => $2),
            CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(days => $3::int) END,
            CASE WHEN $3::int IS NULL THEN NULL ELSE 'logout' END,
            $4
     FROM users LIMIT 1
     RETURNING id`,
    [createdDaysAgo, expiresInDays, revokedDaysAgo, label],
  );
  for (let index = 0; index < 2; index += 1) {
    await server.database.query(
      `INSERT INTO refresh_tokens (session_id, token_hash, created_at, expires_at)
       VALUES ($1, decode(md5(random()::text) || md5(random()::text), 'hex'),
               now() - make_interval(days => $2), now() + make_interval(days => $3))`,
      [rows[0].id, createdDaysAgo, Math.max(expiresInDays, -createdDaysAgo + 1)],
    );
  }
  return rows[0].id;
}

const remainingLabels = async (server) =>
  (await server.database.query("SELECT user_agent FROM auth_sessions WHERE user_agent LIKE 'seed:%' ORDER BY user_agent"))
    .rows.map((row) => row.user_agent);

test("the purge takes sessions dead beyond the retention, and nothing else", { skip: SKIP }, async (t) => {
  const server = await serverWithSessions(t);
  await seedSession(server, { label: "seed:live", createdDaysAgo: 5, expiresInDays: 25 });
  await seedSession(server, { label: "seed:revoked-recently", createdDaysAgo: 10, expiresInDays: 20, revokedDaysAgo: 3 });
  await seedSession(server, { label: "seed:revoked-long-ago", createdDaysAgo: 60, expiresInDays: 20, revokedDaysAgo: 45 });
  await seedSession(server, { label: "seed:expired-recently", createdDaysAgo: 40, expiresInDays: -10 });
  await seedSession(server, { label: "seed:expired-long-ago", createdDaysAgo: 90, expiresInDays: -60 });

  const deleted = await createSessionRepository({ database: server.database }).purgeDeadSessions({
    retentionSeconds: 30 * DAY,
  });

  assert.equal(deleted, 2);
  assert.deepEqual(await remainingLabels(server), [
    "seed:expired-recently",
    "seed:live",
    "seed:revoked-recently",
  ]);
});

test("a purged session's refresh tokens go with it", { skip: SKIP }, async (t) => {
  const server = await serverWithSessions(t);
  const doomed = await seedSession(server, { label: "seed:old", createdDaysAgo: 90, expiresInDays: -60 });
  const kept = await seedSession(server, { label: "seed:live", createdDaysAgo: 1, expiresInDays: 29 });

  await createSessionRepository({ database: server.database }).purgeDeadSessions({ retentionSeconds: 30 * DAY });

  const counts = async (sessionId) =>
    (await server.database.query("SELECT count(*)::int AS n FROM refresh_tokens WHERE session_id = $1", [sessionId]))
      .rows[0].n;
  assert.equal(await counts(doomed), 0);
  assert.equal(await counts(kept), 2);
});

test("one purge deletes a bounded batch, and the next takes the rest", { skip: SKIP }, async (t) => {
  const server = await serverWithSessions(t);
  for (let index = 0; index < 5; index += 1) {
    await seedSession(server, { label: `seed:old-${index}`, createdDaysAgo: 90, expiresInDays: -60 });
  }
  const repository = createSessionRepository({ database: server.database });

  assert.equal(await repository.purgeDeadSessions({ retentionSeconds: 30 * DAY, limit: 3 }), 3);
  assert.equal(await repository.purgeDeadSessions({ retentionSeconds: 30 * DAY, limit: 3 }), 2);
  assert.deepEqual(await remainingLabels(server), []);
});

test("signing in drives the purge, so a quiet deployment still cleans up", { skip: SKIP }, async (t) => {
  const server = await serverWithSessions(t, { auth: { sessionPurgeEvery: 1 } });
  await seedSession(server, { label: "seed:old", createdDaysAgo: 90, expiresInDays: -60 });

  assert.equal((await server.login(CREDENTIALS)).status, 200);
  // The purge runs after the response, off the request's critical path.
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.deepEqual(await remainingLabels(server), []);
});

test("the purge never touches a live session, however old it is", { skip: SKIP }, async (t) => {
  const server = await serverWithSessions(t);
  // Created long ago, still valid: a long-lived session, not a dead one.
  await seedSession(server, { label: "seed:old-but-live", createdDaysAgo: 300, expiresInDays: 60 });

  await createSessionRepository({ database: server.database }).purgeDeadSessions({ retentionSeconds: 30 * DAY });

  assert.deepEqual(await remainingLabels(server), ["seed:old-but-live"]);
});
