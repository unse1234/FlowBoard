const assert = require("node:assert/strict");
const test = require("node:test");
const { buildPoolOptions, createDatabase } = require("./createDatabase");

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

const CONFIG = {
  connectionString: "postgres://user:secret@localhost:5432/flowboard",
  poolMax: 10,
  idleTimeoutMs: 30_000,
  connectionTimeoutMs: 5_000,
  statementTimeoutMs: 10_000,
  ssl: false,
  applicationName: "flowboard",
};

/**
 * A stand-in for pg.Pool.
 *
 * The real driver needs a database; what these tests are about is the
 * behaviour this module adds on top of it — timeouts, transaction handling,
 * client release and what reaches the log.
 */
function createFakePool({ queryImpl, connectImpl } = {}) {
  const pool = {
    queries: [],
    released: [],
    ended: 0,
    handlers: new Map(),

    on(event, handler) {
      pool.handlers.set(event, handler);
    },
    emit(event, payload) {
      pool.handlers.get(event)?.(payload);
    },
    async query(text, values) {
      pool.queries.push({ text, values });

      return queryImpl ? queryImpl(text, values) : { rows: [], rowCount: 0 };
    },
    async connect() {
      return connectImpl ? connectImpl() : createFakeClient();
    },
    async end() {
      pool.ended += 1;
    },
  };

  return pool;
}

function createFakeClient({ failOn = null, failRollback = false } = {}) {
  return {
    statements: [],
    releasedWith: undefined,
    released: 0,

    async query(text, values) {
      this.statements.push(text);

      if (failRollback && text === "ROLLBACK") {
        throw new Error("connection lost");
      }
      if (failOn && text.includes(failOn)) {
        throw new Error("statement failed");
      }

      return { rows: [], rowCount: 0, values };
    },
    release(error) {
      this.released += 1;
      this.releasedWith = error;
    },
  };
}

function createDatabaseWithFake(pool, overrides = {}) {
  return createDatabase({
    config: CONFIG,
    logger: SILENT_LOGGER,
    createPool: () => pool,
    ...overrides,
  });
}

test("maps config onto pool options, including both statement timeouts", () => {
  const options = buildPoolOptions(CONFIG);

  assert.equal(options.connectionString, CONFIG.connectionString);
  assert.equal(options.max, 10);
  assert.equal(options.idleTimeoutMillis, 30_000);
  assert.equal(options.connectionTimeoutMillis, 5_000);
  // Server-side and client-side: either alone leaves a gap.
  assert.equal(options.statement_timeout, 10_000);
  assert.equal(options.query_timeout, 10_000);
  assert.equal(options.application_name, "flowboard");
  assert.equal(options.ssl, false);
  // The pool must not close itself when idle; the process decides when to exit.
  assert.equal(options.allowExitOnIdle, false);
});

test("refuses to start without a connection string", () => {
  assert.throws(
    () => createDatabase({ config: { ...CONFIG, connectionString: null } }),
    /connectionString/,
  );
});

test("an idle client error is logged, not thrown", () => {
  const pool = createFakePool();
  const logged = [];

  createDatabaseWithFake(pool, {
    logger: { ...SILENT_LOGGER, error: (message, detail) => logged.push({ message, detail }) },
  });

  // node-postgres emits this when an idle connection dies. Node treats an
  // unhandled "error" event as fatal, so a database blip would otherwise take
  // the whole server down.
  assert.doesNotThrow(() => pool.emit("error", new Error("connection terminated")));
  assert.equal(logged.length, 1);
  assert.match(logged[0].detail.message, /connection terminated/);
});

test("passes statements and values straight through", async () => {
  const pool = createFakePool({ queryImpl: () => ({ rows: [{ id: 1 }], rowCount: 1 }) });
  const database = createDatabaseWithFake(pool);

  const result = await database.query("SELECT id FROM users WHERE email = $1", ["a@b.test"]);

  assert.deepEqual(result.rows, [{ id: 1 }]);
  assert.deepEqual(pool.queries[0], {
    text: "SELECT id FROM users WHERE email = $1",
    values: ["a@b.test"],
  });
});

test("a slow query is reported without its values", async () => {
  let clock = 0;
  const originalNow = performance.now;
  performance.now = () => clock;

  try {
    const pool = createFakePool({
      queryImpl: () => {
        clock = 500;
        return { rows: [], rowCount: 0 };
      },
    });
    const warnings = [];
    const database = createDatabaseWithFake(pool, {
      logger: { ...SILENT_LOGGER, warn: (message, detail) => warnings.push(detail) },
      slowQueryMs: 200,
    });

    await database.query("SELECT * FROM users WHERE password_hash = $1", ["secret-hash"]);

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].durationMs, 500);
    // Values carry password hashes, tokens and emails; only the statement is safe.
    assert.equal(JSON.stringify(warnings[0]).includes("secret-hash"), false);
  } finally {
    performance.now = originalNow;
  }
});

test("a fast query is not reported", async () => {
  const pool = createFakePool();
  const warnings = [];
  const database = createDatabaseWithFake(pool, {
    logger: { ...SILENT_LOGGER, warn: (...args) => warnings.push(args) },
    slowQueryMs: 10_000,
  });

  await database.query("SELECT 1");

  assert.equal(warnings.length, 0);
});

test("a transaction commits and releases its connection", async () => {
  const client = createFakeClient();
  const pool = createFakePool({ connectImpl: () => client });
  const database = createDatabaseWithFake(pool);

  const result = await database.transaction(async (tx) => {
    await tx.query("INSERT INTO users (email) VALUES ($1)", ["a@b.test"]);
    return "done";
  });

  assert.equal(result, "done");
  assert.deepEqual(client.statements, [
    "BEGIN",
    "INSERT INTO users (email) VALUES ($1)",
    "COMMIT",
  ]);
  assert.equal(client.released, 1);
  assert.equal(client.releasedWith, undefined);
});

test("a failing transaction rolls back, releases, and rethrows", async () => {
  const client = createFakeClient({ failOn: "INSERT" });
  const pool = createFakePool({ connectImpl: () => client });
  const database = createDatabaseWithFake(pool);

  await assert.rejects(
    database.transaction(async (tx) => {
      await tx.query("INSERT INTO users (email) VALUES ($1)", ["a@b.test"]);
    }),
    /statement failed/,
  );

  assert.deepEqual(client.statements, ["BEGIN", "INSERT INTO users (email) VALUES ($1)", "ROLLBACK"]);
  assert.equal(client.released, 1);
});

test("a connection whose rollback fails is discarded, not returned to the pool", async () => {
  const client = createFakeClient({ failOn: "INSERT", failRollback: true });
  const pool = createFakePool({ connectImpl: () => client });
  const database = createDatabaseWithFake(pool);

  await assert.rejects(
    database.transaction(async (tx) => {
      await tx.query("INSERT INTO users (email) VALUES ($1)", ["a@b.test"]);
    }),
    // The original failure is what the caller needs, not the rollback's.
    /statement failed/,
  );

  // Released *with* an error, which removes it from the pool: it still holds an
  // open transaction, so handing it to the next caller would corrupt their work.
  assert.equal(client.released, 1);
  assert.ok(client.releasedWith instanceof Error);
});

test("ping runs a real statement", async () => {
  const pool = createFakePool();
  const database = createDatabaseWithFake(pool);

  await database.ping();

  // A pool holding idle clients can still point at a database that is gone,
  // so readiness has to ask the server something.
  assert.equal(pool.queries[0].text, "SELECT 1");
});

test("ping rejects when the database is unreachable", async () => {
  const pool = createFakePool({
    queryImpl: () => {
      throw new Error("ECONNREFUSED");
    },
  });
  const database = createDatabaseWithFake(pool);

  await assert.rejects(database.ping(), /ECONNREFUSED/);
});

test("close drains the pool once, however often it is called", async () => {
  const pool = createFakePool();
  const database = createDatabaseWithFake(pool);

  await database.close();
  await database.close();

  assert.equal(pool.ended, 1);
});
