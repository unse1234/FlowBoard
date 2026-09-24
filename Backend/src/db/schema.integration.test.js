const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
const test = require("node:test");
const { loadLocalEnvFile } = require("../config/serverConfig");
const { createDatabase } = require("./createDatabase");
const { runMigrations } = require("./migrate");

// So `npm test` picks up a developer's configured database without them having
// to repeat the variable on the command line. A missing .env is normal — in CI
// the variable is set directly — and anything already in the environment wins.
loadLocalEnvFile();

/**
 * Migrations and schema behaviour against a real PostgreSQL server.
 *
 * Set TEST_DATABASE_URL to run these. Without it the suite skips, so the unit
 * tests still run on a machine with no database — but nothing here is proven
 * until it has pointed at a real server at least once.
 *
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/flowboard_test npm test
 *
 * The database is emptied first, so it must be a throwaway.
 *
 * Every file that resets the schema shares one database, so the suite runs with
 * --test-concurrency=1 (see package.json). Without it, `node --test` runs files
 * in parallel and two of them drop the schema under each other, which shows up
 * as a handful of failures that move around between runs. Do not remove the
 * flag without first giving each file its own schema or database.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const SKIP = TEST_DATABASE_URL
  ? false
  : "set TEST_DATABASE_URL to run schema integration tests";

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

function connect() {
  return createDatabase({
    config: {
      connectionString: TEST_DATABASE_URL,
      poolMax: 4,
      idleTimeoutMs: 5_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 15_000,
      ssl: process.env.TEST_DATABASE_SSL === "require" ? { rejectUnauthorized: true } : false,
      applicationName: "flowboard-test",
    },
    logger: SILENT_LOGGER,
  });
}

/** A fresh schema for each test, so ordering never matters. */
async function freshDatabase(t) {
  const database = connect();
  t.after(() => database.close());

  await database.query("DROP SCHEMA public CASCADE");
  await database.query("CREATE SCHEMA public");
  await runMigrations({ database, logger: SILENT_LOGGER });

  return database;
}

const insertUser = (database, overrides = {}) => {
  const user = {
    email: "Ada@Example.com",
    emailNormalized: "ada@example.com",
    displayName: "Ada",
    ...overrides,
  };

  return database.query(
    `INSERT INTO users (email, email_normalized, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, token_version, status, created_at, updated_at`,
    [user.email, user.emailNormalized, user.displayName],
  );
};

test("migrations apply from an empty database", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  const { rows } = await database.query("SELECT id FROM schema_migrations ORDER BY id");

  assert.ok(rows.length > 0);
  assert.equal(rows[0].id, "0001_create_users");
});

test("migrations are idempotent", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  const second = await runMigrations({ database, logger: SILENT_LOGGER });

  // A second instance booting during a rolling deploy must find nothing to do.
  assert.deepEqual(second.applied, []);
});

test("a new user gets sane defaults", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  const { rows } = await insertUser(database);

  assert.match(rows[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(rows[0].token_version, 0);
  assert.equal(rows[0].status, "active");
});

test("an email address can hold only one live account", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  await insertUser(database);

  await assert.rejects(
    insertUser(database, { email: "ADA@example.com" }),
    /users_email_normalized_active_key/,
  );
});

test("deleting an account frees its address again", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const { rows } = await insertUser(database);

  await database.query("UPDATE users SET deleted_at = now(), status = 'pending_deletion' WHERE id = $1", [
    rows[0].id,
  ]);

  // The unique index excludes soft-deleted rows, so this must now succeed.
  await assert.doesNotReject(insertUser(database));
});

test("the login lookup uses the partial unique index", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  await insertUser(database);

  const { rows } = await database.query(
    `EXPLAIN (FORMAT JSON)
     SELECT id FROM users WHERE email_normalized = $1 AND deleted_at IS NULL`,
    ["ada@example.com"],
  );

  // Login runs on every sign-in attempt; a sequential scan here would become
  // the first thing to fall over under load.
  const plan = JSON.stringify(rows[0]["QUERY PLAN"]);
  assert.match(plan, /users_email_normalized_active_key/);
});

test("the database rejects a non-normalised email", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  await assert.rejects(
    insertUser(database, { emailNormalized: "Ada@Example.com" }),
    /users_email_normalized_lowercase_check/,
  );
});

test("the database rejects an unknown status", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const { rows } = await insertUser(database);

  await assert.rejects(
    database.query("UPDATE users SET status = 'banished' WHERE id = $1", [rows[0].id]),
    /users_status_check/,
  );
});

test("the database rejects a blank display name", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  await assert.rejects(
    insertUser(database, { displayName: "   " }),
    /users_display_name_present_check/,
  );
});

test("updated_at is set by the trigger, not by the statement", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const { rows } = await insertUser(database);

  // The statement asks for a date in 2000. The trigger must overwrite it.
  //
  // Deliberately not written as "updated_at is later than created_at": two
  // statements microseconds apart can read the same clock on a virtualised CI
  // host, which made that version fail there and pass locally. This asserts the
  // trigger's actual job, and does so without depending on time passing.
  const { rows: updated } = await database.query(
    `UPDATE users
     SET display_name = $2, updated_at = timestamptz '2000-01-01 00:00:00Z'
     WHERE id = $1
     RETURNING updated_at`,
    [rows[0].id, "Ada Lovelace"],
  );

  assert.ok(
    updated[0].updated_at > new Date("2020-01-01T00:00:00Z"),
    `trigger did not overwrite updated_at: got ${updated[0].updated_at.toISOString()}`,
  );
});

test("a transaction rolls back a failed multi-step write", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  await assert.rejects(
    database.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO users (email, email_normalized, display_name) VALUES ($1, $2, $3)",
        ["grace@example.com", "grace@example.com", "Grace"],
      );
      throw new Error("changed my mind");
    }),
    /changed my mind/,
  );

  const { rows } = await database.query("SELECT count(*)::int AS count FROM users");
  assert.equal(rows[0].count, 0);
});

/**
 * Addresses whose lowercasing is worth checking against the database.
 *
 * `users` has CHECK (email_normalized = lower(email_normalized)), so the
 * application's normalisation and PostgreSQL's lower() have to agree. If they
 * ever disagree, a legitimate signup fails on an insert rather than on
 * validation — a 500 instead of a message. PostgreSQL's lower() depends on the
 * database's collation, so this is a property of the deployment, not only of
 * the code, and belongs in an integration test.
 */
const LOWERCASE_CASES = [
  "ADA@EXAMPLE.COM",
  "Ada.Lovelace+Tag@Example.Co.Uk",
  "PÄSSWORD@exämple.de",
  "ÅNGSTRÖM@Example.COM",
  "ΑΘΗΝΑ@example.com",
  "МОСКВА@example.com",
  // Turkish dotted capital I, which lowercases to "i" plus a combining dot.
  "İSTANBUL@example.com",
];

test("the application and the database agree on lowercasing", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const { normalizeEmailAddress } = require("../auth/emailAddress");

  for (const input of LOWERCASE_CASES) {
    const normalized = normalizeEmailAddress(input);
    assert.ok(normalized, `${input} should be a valid address`);

    const { rows } = await database.query(
      "SELECT lower($1::text) AS pg_lower, ($1::text = lower($1::text)) AS check_passes",
      [normalized],
    );

    assert.equal(rows[0].pg_lower, normalized, `lower() disagrees for ${input}`);
    assert.equal(rows[0].check_passes, true, `CHECK would reject ${input}`);
  }
});

test("a normalised address inserts and is found again", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const { parseEmailAddress } = require("../auth/emailAddress");

  const parsed = parseEmailAddress("  Ada.Lovelace@Example.COM  ");
  assert.equal(parsed.valid, true);

  await database.query(
    "INSERT INTO users (email, email_normalized, display_name) VALUES ($1, $2, $3)",
    [parsed.email, parsed.emailNormalized, "Ada"],
  );

  // The whole point of the normalised column: someone who signed up with mixed
  // case must be found when they type it differently.
  const found = await database.query(
    "SELECT email FROM users WHERE email_normalized = $1 AND deleted_at IS NULL",
    [parseEmailAddress("ADA.LOVELACE@example.com").emailNormalized],
  );

  assert.equal(found.rowCount, 1);
  // The address is stored as typed, for display and for addressing mail.
  assert.equal(found.rows[0].email, "Ada.Lovelace@Example.COM");
});

test("differing case cannot create a second account", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const { parseEmailAddress } = require("../auth/emailAddress");

  const insert = (input) => {
    const parsed = parseEmailAddress(input);
    return database.query(
      "INSERT INTO users (email, email_normalized, display_name) VALUES ($1, $2, $3)",
      [parsed.email, parsed.emailNormalized, "Someone"],
    );
  };

  await insert("ada@example.com");

  await assert.rejects(insert("ADA@Example.COM"), /users_email_normalized_active_key/);
});

/**
 * auth_sessions and refresh_tokens (0002).
 *
 * The token behaviour itself — issuing, rotation, reuse detection — belongs to
 * chunks 2.3 and 2.4. These tests pin what the schema promises on its own, so
 * those chunks can rely on it rather than re-checking it.
 */

const tokenHash = () => createHash("sha256").update(randomBytes(32)).digest();

const insertSession = async (database, userId, overrides = {}) => {
  const session = {
    expiresAt: "now() + interval '30 days'",
    revokedAt: null,
    revokedReason: null,
    userAgent: null,
    ipAddress: null,
    ...overrides,
  };

  // expiresAt is an SQL expression chosen by the test, never input.
  const { rows } = await database.query(
    `INSERT INTO auth_sessions (user_id, expires_at, revoked_at, revoked_reason, user_agent, ip_address)
     VALUES ($1, ${session.expiresAt}, $2, $3, $4, $5)
     RETURNING *`,
    [userId, session.revokedAt, session.revokedReason, session.userAgent, session.ipAddress],
  );

  return rows[0];
};

const insertToken = async (database, sessionId, overrides = {}) => {
  const token = { hash: tokenHash(), expiresAt: "now() + interval '14 days'", ...overrides };

  const { rows } = await database.query(
    `INSERT INTO refresh_tokens (session_id, token_hash, expires_at)
     VALUES ($1, $2, ${token.expiresAt})
     RETURNING *`,
    [sessionId, token.hash],
  );

  return rows[0];
};

/** A migrated database with one user, for the session tests. */
async function databaseWithUser(t) {
  const database = await freshDatabase(t);
  const { rows } = await insertUser(database);
  return { database, userId: rows[0].id };
}

const countRows = async (database, table) => {
  const { rows } = await database.query(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0].count;
};

test("migrations record the sessions migration after the users one", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  const { rows } = await database.query("SELECT id FROM schema_migrations ORDER BY id");

  assert.deepEqual(
    rows.map((row) => row.id).slice(0, 2),
    ["0001_create_users", "0002_create_auth_sessions_and_refresh_tokens"],
  );
});

test("a new session and its token get sane defaults", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);

  const session = await insertSession(database, userId, {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    ipAddress: "2001:db8::1",
  });
  const hash = tokenHash();
  const token = await insertToken(database, session.id, { hash });

  assert.match(session.id, /^[0-9a-f-]{36}$/);
  assert.equal(session.revoked_at, null);
  assert.equal(session.revoked_reason, null);
  assert.ok(session.last_used_at instanceof Date);
  assert.ok(session.expires_at > session.created_at);
  assert.equal(session.ip_address, "2001:db8::1");

  assert.equal(token.session_id, session.id);
  assert.equal(token.consumed_at, null);
  // Stored and returned as the raw digest, so a lookup can compare bytes.
  assert.ok(Buffer.isBuffer(token.token_hash));
  assert.ok(token.token_hash.equals(hash));
});

test("a token hash can belong to only one token", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);
  const session = await insertSession(database, userId);
  const hash = tokenHash();
  await insertToken(database, session.id, { hash });

  // Even in another session: the hash alone must identify one token, because
  // it is the only thing the refresh request carries.
  const other = await insertSession(database, userId);

  await assert.rejects(insertToken(database, other.id, { hash }), /refresh_tokens_token_hash_key/);
});

test("the database stores a digest, not the token's text", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);
  const session = await insertSession(database, userId);
  const raw = randomBytes(32);

  // The digest as hex, and the token as the cookie carries it: both are the
  // mistakes a length check can catch.
  for (const wrong of [
    Buffer.from(createHash("sha256").update(raw).digest("hex")),
    Buffer.from(raw.toString("base64url")),
  ]) {
    await assert.rejects(
      insertToken(database, session.id, { hash: wrong }),
      /refresh_tokens_token_hash_length_check/,
    );
  }
});

test("a revoked session must say why, and only a revoked one may", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);

  await assert.rejects(
    insertSession(database, userId, { revokedAt: new Date(), revokedReason: null }),
    /auth_sessions_revocation_check/,
  );
  await assert.rejects(
    insertSession(database, userId, { revokedAt: null, revokedReason: "logout" }),
    /auth_sessions_revocation_check/,
  );
});

test("every planned way of ending a session is accepted, and nothing else", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);

  // AUTH_PLAN.md names these. A reason missing here would fail the phase that
  // needs it at runtime, as a 500.
  for (const reason of [
    "logout",
    "reuse_detected",
    "revoked_by_user",
    "password_reset",
    "password_changed",
    "account_deleted",
  ]) {
    await assert.doesNotReject(
      insertSession(database, userId, { revokedAt: new Date(), revokedReason: reason }),
      `${reason} should be accepted`,
    );
  }

  await assert.rejects(
    insertSession(database, userId, { revokedAt: new Date(), revokedReason: "expired" }),
    /auth_sessions_revoked_reason_check/,
  );
});

test("neither a session nor a token can end before it starts", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);

  await assert.rejects(
    insertSession(database, userId, { expiresAt: "now() - interval '1 second'" }),
    /auth_sessions_expiry_check/,
  );

  const session = await insertSession(database, userId);

  await assert.rejects(
    insertToken(database, session.id, { expiresAt: "now()" }),
    /refresh_tokens_expiry_check/,
  );
});

test("a user agent is capped at 512 characters", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);

  await assert.doesNotReject(insertSession(database, userId, { userAgent: "a".repeat(512) }));
  await assert.rejects(
    insertSession(database, userId, { userAgent: "a".repeat(513) }),
    /auth_sessions_user_agent_length_check/,
  );
});

test("a session cannot belong to a user who does not exist", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  await assert.rejects(
    insertSession(database, "00000000-0000-4000-8000-000000000000"),
    /auth_sessions_user_id_fkey/,
  );
});

test("a token cannot belong to a session that does not exist", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);

  await assert.rejects(
    insertToken(database, "00000000-0000-4000-8000-000000000000"),
    /refresh_tokens_session_id_fkey/,
  );
});

test("purging an account removes its sessions and their tokens", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);
  const session = await insertSession(database, userId);
  await insertToken(database, session.id);
  await insertToken(database, session.id);

  await database.query("DELETE FROM users WHERE id = $1", [userId]);

  assert.equal(await countRows(database, "auth_sessions"), 0);
  assert.equal(await countRows(database, "refresh_tokens"), 0);
});

test("purging a session removes its tokens and no one else's", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);
  const doomed = await insertSession(database, userId);
  const kept = await insertSession(database, userId);
  await insertToken(database, doomed.id);
  const survivor = await insertToken(database, kept.id);

  await database.query("DELETE FROM auth_sessions WHERE id = $1", [doomed.id]);

  const { rows } = await database.query("SELECT id FROM refresh_tokens");
  assert.deepEqual(rows.map((row) => row.id), [survivor.id]);
});

test("the refresh lookup uses the token hash index", { skip: SKIP }, async (t) => {
  const { database, userId } = await databaseWithUser(t);
  const session = await insertSession(database, userId);
  const hash = tokenHash();
  await insertToken(database, session.id, { hash });

  const { rows } = await database.query(
    `EXPLAIN (FORMAT JSON)
     SELECT id, session_id FROM refresh_tokens WHERE token_hash = $1`,
    [hash],
  );

  // Every refresh, from every open tab, runs this. It must be an index probe.
  const plan = JSON.stringify(rows[0]["QUERY PLAN"]);
  assert.match(plan, /refresh_tokens_token_hash_key/);
});
