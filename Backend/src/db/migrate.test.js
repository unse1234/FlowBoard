const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  MIGRATIONS_DIRECTORY,
  planMigrations,
  readMigrations,
  runMigrations,
} = require("./migrate");

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

function withMigrationDirectory(t, files) {
  const directory = mkdtempSync(path.join(tmpdir(), "flowboard-migrations-"));

  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), contents);
  }

  t.after(() => rmSync(directory, { recursive: true, force: true }));

  return directory;
}

/** Records every statement so ordering and transaction boundaries are assertable. */
function createFakeDatabase({ applied = [], failOn = null } = {}) {
  const statements = [];
  const client = {
    async query(text, values) {
      statements.push({ text: text.trim(), values });

      if (failOn && text.includes(failOn)) throw new Error("syntax error");
      if (text.startsWith("SELECT id, checksum")) return { rows: applied };

      return { rows: [], rowCount: 0 };
    },
    released: 0,
    release() {
      client.released += 1;
    },
  };

  return {
    statements,
    client,
    getPool: () => ({ connect: async () => client }),
  };
}

const text = (database) => database.statements.map((entry) => entry.text);

test("reads migrations in filename order with a checksum each", (t) => {
  const directory = withMigrationDirectory(t, {
    "0002_add_sessions.sql": "CREATE TABLE sessions ();",
    "0001_create_users.sql": "CREATE TABLE users ();",
    "notes.md": "not a migration",
  });

  const migrations = readMigrations(directory);

  assert.deepEqual(
    migrations.map((migration) => migration.id),
    ["0001_create_users", "0002_add_sessions"],
  );
  assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
  assert.equal(migrations[0].useTransaction, true);
});

test("rejects a filename that would make ordering ambiguous", (t) => {
  const directory = withMigrationDirectory(t, { "add-users.sql": "SELECT 1;" });

  assert.throws(() => readMigrations(directory), /NNNN_lower_snake_case/);
});

test("a migration can opt out of running in a transaction", (t) => {
  const directory = withMigrationDirectory(t, {
    // CREATE INDEX CONCURRENTLY cannot run inside one.
    "0001_index.sql": "-- flowboard:no-transaction\nCREATE INDEX CONCURRENTLY x ON users (id);",
  });

  assert.equal(readMigrations(directory)[0].useTransaction, false);
});

test("a missing migrations directory is not an error", () => {
  assert.deepEqual(readMigrations(path.join(tmpdir(), "flowboard-does-not-exist")), []);
});

test("plans only what has not run", () => {
  const available = [
    { id: "0001_a", checksum: "aaa" },
    { id: "0002_b", checksum: "bbb" },
  ];

  const { pending, problems } = planMigrations(available, [{ id: "0001_a", checksum: "aaa" }]);

  assert.deepEqual(pending.map((migration) => migration.id), ["0002_b"]);
  assert.deepEqual(problems, []);
});

test("catches a migration edited after it was applied", () => {
  const { problems } = planMigrations(
    [{ id: "0001_a", checksum: "changed" }],
    [{ id: "0001_a", checksum: "original" }],
  );

  // Otherwise two environments quietly end up with different schemas.
  assert.equal(problems.length, 1);
  assert.match(problems[0], /has changed since it was applied/);
});

test("catches a migration deleted after it was applied", () => {
  const { problems } = planMigrations([], [{ id: "0001_a", checksum: "aaa" }]);

  assert.match(problems[0], /missing from the migrations directory/);
});

test("catches a migration inserted behind the latest applied one", () => {
  const { problems } = planMigrations(
    [
      { id: "0001_a", checksum: "aaa" },
      { id: "0002_late_arrival", checksum: "bbb" },
      { id: "0003_c", checksum: "ccc" },
    ],
    [
      { id: "0001_a", checksum: "aaa" },
      { id: "0003_c", checksum: "ccc" },
    ],
  );

  // Merging a branch can produce this: applying it now would give this
  // environment a different schema history from one that migrated earlier.
  assert.equal(problems.length, 1);
  assert.match(problems[0], /sorts before the applied "0003_c"/);
});

test("takes the advisory lock before migrating and releases it after", async (t) => {
  const directory = withMigrationDirectory(t, { "0001_a.sql": "CREATE TABLE a ();" });
  const database = createFakeDatabase();

  await runMigrations({ database, directory, logger: SILENT_LOGGER });

  const statements = text(database);
  // Several instances boot at once during a rolling deploy; the lock is what
  // stops them all running the same migration.
  assert.match(statements[0], /pg_advisory_lock/);
  assert.match(statements.at(-1), /pg_advisory_unlock/);
  assert.equal(database.client.released, 1);
});

test("commits each migration together with its bookkeeping row", async (t) => {
  const directory = withMigrationDirectory(t, { "0001_a.sql": "CREATE TABLE a ();" });
  const database = createFakeDatabase();

  const result = await runMigrations({ database, directory, logger: SILENT_LOGGER });

  const statements = text(database);
  const begin = statements.indexOf("BEGIN");
  const insert = statements.findIndex((entry) => entry.startsWith("INSERT INTO schema_migrations"));
  const commit = statements.indexOf("COMMIT");

  // The insert has to be inside the same transaction, or a crash between them
  // would record a migration that never ran.
  assert.ok(begin !== -1 && begin < insert && insert < commit);
  assert.deepEqual(result.applied, ["0001_a"]);
});

test("a failing migration rolls back and reports which one failed", async (t) => {
  const directory = withMigrationDirectory(t, { "0001_broken.sql": "CREATE TABLE broken (" });
  const database = createFakeDatabase({ failOn: "CREATE TABLE broken" });

  await assert.rejects(
    runMigrations({ database, directory, logger: SILENT_LOGGER }),
    /Migration "0001_broken" failed/,
  );

  assert.ok(text(database).includes("ROLLBACK"));
  // The lock must still come off, or every later deploy would hang on it.
  assert.match(text(database).at(-1), /pg_advisory_unlock/);
  assert.equal(database.client.released, 1);
});

test("does nothing when everything has already run", async (t) => {
  const directory = withMigrationDirectory(t, { "0001_a.sql": "CREATE TABLE a ();" });
  const { checksum } = readMigrations(directory)[0];
  const database = createFakeDatabase({ applied: [{ id: "0001_a", checksum }] });

  const result = await runMigrations({ database, directory, logger: SILENT_LOGGER });

  assert.deepEqual(result.applied, []);
  assert.equal(result.alreadyApplied, 1);
  assert.equal(text(database).includes("BEGIN"), false);
});

test("refuses to migrate when the recorded state is inconsistent", async (t) => {
  const directory = withMigrationDirectory(t, { "0001_a.sql": "CREATE TABLE a ();" });
  const database = createFakeDatabase({ applied: [{ id: "0001_a", checksum: "different" }] });

  await assert.rejects(
    runMigrations({ database, directory, logger: SILENT_LOGGER }),
    /Migration state is inconsistent/,
  );

  assert.equal(text(database).includes("BEGIN"), false);
});

test("the checked-in migrations are readable and well named", () => {
  const migrations = readMigrations(MIGRATIONS_DIRECTORY);

  assert.ok(migrations.length > 0, "expected at least one migration in Backend/migrations");
  assert.equal(migrations[0].id, "0001_create_users");

  const ids = migrations.map((migration) => migration.id);
  assert.deepEqual(ids, [...ids].sort(), "migrations must sort into their run order");
  assert.equal(new Set(ids).size, ids.length, "migration ids must be unique");
});

test("line endings do not change a migration's checksum", (t) => {
  const sql = "-- users\nCREATE TABLE users ();\nCREATE INDEX users_idx ON users (id);\n";
  const lf = withMigrationDirectory(t, { "0001_a.sql": sql });
  const crlf = withMigrationDirectory(t, { "0001_a.sql": sql.replace(/\n/g, "\r\n") });
  const edited = withMigrationDirectory(t, {
    "0001_a.sql": `${sql}DROP TABLE users;\n`.replace(/\n/g, "\r\n"),
  });

  // git with core.autocrlf checks one commit out either way (finding F-20).
  assert.equal(readMigrations(crlf)[0].checksum, readMigrations(lf)[0].checksum);
  // What runs is what was hashed.
  assert.equal(readMigrations(crlf)[0].sql, sql);
  // A real edit is still an edit, whatever the line endings.
  assert.notEqual(readMigrations(edited)[0].checksum, readMigrations(lf)[0].checksum);
});

test("a CRLF checkout of a migration applied from LF is up to date", async (t) => {
  const sql = "CREATE TABLE a ();\nCREATE TABLE b ();\n";
  const [recorded] = readMigrations(withMigrationDirectory(t, { "0001_a.sql": sql }));
  const directory = withMigrationDirectory(t, { "0001_a.sql": sql.replace(/\n/g, "\r\n") });
  const database = createFakeDatabase({ applied: [{ id: "0001_a", checksum: recorded.checksum }] });

  const result = await runMigrations({ database, directory, logger: SILENT_LOGGER });

  assert.deepEqual(result.applied, []);
});

test("0001 hashes to the checksum databases recorded, on any checkout", () => {
  const [users] = readMigrations(MIGRATIONS_DIRECTORY);

  // Taken from schema_migrations on a database migrated before F-20 was fixed.
  // If this fails, 0001 has been edited, or the normalisation changed, and
  // every existing database would refuse to migrate.
  assert.equal(users.id, "0001_create_users");
  assert.equal(users.checksum, "1eca2330cb98751d9e86285b72b2a18aa00808347a7f0e5b6c7a274e352cfb03");
});
