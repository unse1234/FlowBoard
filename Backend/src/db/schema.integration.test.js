const assert = require("node:assert/strict");
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

test("updated_at moves on its own", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const { rows } = await insertUser(database);

  const { rows: updated } = await database.query(
    "UPDATE users SET display_name = $2 WHERE id = $1 RETURNING created_at, updated_at",
    [rows[0].id, "Ada Lovelace"],
  );

  // The trigger keeps this honest even for a statement that forgot to set it.
  assert.ok(updated[0].updated_at > updated[0].created_at);
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
