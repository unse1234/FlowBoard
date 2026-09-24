const assert = require("node:assert/strict");
const test = require("node:test");
const { loadLocalEnvFile } = require("../config/serverConfig");
const { createDatabase } = require("../db/createDatabase");
const { runMigrations } = require("../db/migrate");
const { generateRefreshToken } = require("./refreshTokens");
const { ROTATION, createSessionRepository } = require("./sessionRepository");

loadLocalEnvFile();

/**
 * Rotation under a controlled interleaving (chunk 2.4).
 *
 * The HTTP tests fire concurrent requests, but cannot make them overlap in the
 * few milliseconds that matter, so they cannot prove the session lock does
 * anything. A mutation run showed it: with the lock removed, they still passed.
 *
 * Here, rotation A is paused just after it reads the token, while it holds the
 * session lock, and rotation B is started. If the lock works, B cannot reach
 * its own read of the token until A commits, so it must see A's consumption.
 * If the token's state could be read without the lock, or before it, B reads
 * the token as unused while A is paused, and both rotate it.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const SKIP = TEST_DATABASE_URL ? false : "set TEST_DATABASE_URL to run session repository tests";
const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

/** Long enough that a B unblocked by a missing lock would certainly get there. */
const BLOCKED_PROOF_MS = 400;

/** The statement that reads a token's state, as opposed to the one that locks. */
const isTokenStateRead = (text) => text.includes("consumed_at IS NOT NULL AS consumed");

async function freshDatabase(t) {
  const database = createDatabase({
    config: {
      connectionString: TEST_DATABASE_URL,
      poolMax: 4,
      idleTimeoutMs: 5_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 15_000,
      ssl: false,
      applicationName: "flowboard-test",
    },
    logger: SILENT_LOGGER,
  });
  t.after(() => database.close());

  await database.query("DROP SCHEMA public CASCADE");
  await database.query("CREATE SCHEMA public");
  await runMigrations({ database, logger: SILENT_LOGGER });

  return database;
}

/** The same database, with a hook called after each statement inside a transaction. */
function instrument(database, afterQuery) {
  return {
    ...database,
    transaction: (run) =>
      database.transaction((tx) =>
        run({
          async query(text, values) {
            const result = await tx.query(text, values);
            await afterQuery(text);
            return result;
          },
        }),
      ),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sessionWithToken(database) {
  const { rows } = await database.query(
    "INSERT INTO users (email, email_normalized, display_name) VALUES ($1, $1, $2) RETURNING id",
    ["ada@example.com", "Ada"],
  );
  const token = generateRefreshToken();

  await createSessionRepository({ database }).createSession({
    userId: rows[0].id,
    tokenHash: token.hash,
    sessionTtlSeconds: 3_600,
    idleTtlSeconds: 3_600,
    userAgent: null,
    ipAddress: null,
  });

  return token;
}

const rotation = (tokenHash, reuseGraceSeconds) => ({
  tokenHash,
  successorHash: generateRefreshToken().hash,
  idleTtlSeconds: 3_600,
  reuseGraceSeconds,
});

test("a second rotation cannot read the token while the first holds the session", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const token = await sessionWithToken(database);

  const aHasRead = deferred();
  const releaseA = deferred();
  const bHasRead = deferred();

  const repositoryA = createSessionRepository({
    database: instrument(database, async (text) => {
      if (!isTokenStateRead(text)) return;
      aHasRead.resolve();
      await releaseA.promise;
    }),
  });
  const repositoryB = createSessionRepository({
    database: instrument(database, async (text) => {
      if (isTokenStateRead(text)) bHasRead.resolve();
    }),
  });

  // No grace window, so B's outcome shows plainly what it saw.
  const a = repositoryA.rotateRefreshToken(rotation(token.hash, 0));
  await aHasRead.promise;

  const b = repositoryB.rotateRefreshToken(rotation(token.hash, 0));
  const bReadWhileAHeld = await Promise.race([
    bHasRead.promise.then(() => true),
    sleep(BLOCKED_PROOF_MS).then(() => false),
  ]);

  releaseA.resolve();
  const [resultA, resultB] = await Promise.all([a, b]);

  assert.equal(bReadWhileAHeld, false, "B read the token while A held the session lock");
  assert.equal(resultA.outcome, ROTATION.ROTATED);
  // B arrived after A consumed the token, with no grace: that is reuse.
  assert.equal(resultB.outcome, ROTATION.REUSE_DETECTED);

  const { rows } = await database.query("SELECT count(*)::int AS count FROM refresh_tokens");
  assert.equal(rows[0].count, 2, "exactly one successor was issued");
});

test("a rotation that queued behind another, within the grace window, gets its own successor", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const token = await sessionWithToken(database);

  const aHasRead = deferred();
  const releaseA = deferred();

  const repositoryA = createSessionRepository({
    database: instrument(database, async (text) => {
      if (!isTokenStateRead(text)) return;
      aHasRead.resolve();
      await releaseA.promise;
    }),
  });
  const repository = createSessionRepository({ database });

  const a = repositoryA.rotateRefreshToken(rotation(token.hash, 20));
  await aHasRead.promise;
  const b = repository.rotateRefreshToken(rotation(token.hash, 20));

  // Hold A for longer than it would take B to finish, had B not been blocked.
  await sleep(BLOCKED_PROOF_MS);
  releaseA.resolve();
  const [resultA, resultB] = await Promise.all([a, b]);

  // Two tabs: both get in, and the session survives.
  assert.equal(resultA.outcome, ROTATION.ROTATED);
  assert.equal(resultB.outcome, ROTATION.ROTATED);
  assert.equal(resultB.withinGrace, true);

  const { rows } = await database.query("SELECT revoked_at FROM auth_sessions");
  assert.equal(rows[0].revoked_at, null);
});

test("time spent waiting behind a slow rotation does not count against the grace window", { skip: SKIP }, async (t) => {
  const database = await freshDatabase(t);
  const token = await sessionWithToken(database);

  const aHasRead = deferred();
  const releaseA = deferred();

  const repositoryA = createSessionRepository({
    database: instrument(database, async (text) => {
      if (!isTokenStateRead(text)) return;
      aHasRead.resolve();
      await releaseA.promise;
    }),
  });
  const repository = createSessionRepository({ database });

  // B arrives straight after A, inside a one-second window, then waits longer
  // than the window for A's lock. It was a race when it arrived, and still is.
  const a = repositoryA.rotateRefreshToken(rotation(token.hash, 1));
  await aHasRead.promise;
  const b = repository.rotateRefreshToken(rotation(token.hash, 1));

  await sleep(1_500);
  releaseA.resolve();
  const [, resultB] = await Promise.all([a, b]);

  assert.equal(resultB.outcome, ROTATION.ROTATED, "a queued tab was taken for a thief");
});
