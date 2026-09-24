const { Pool } = require("pg");

/**
 * FlowBoard's PostgreSQL access layer.
 *
 * One pool per process, created at startup and drained on shutdown. Every
 * query goes through here so that timeouts, slow-query reporting and
 * transaction handling are decided once rather than at each call site.
 *
 * Pool sizing is a cluster-wide budget, not a per-instance one: the server runs
 * as N instances (docs/decisions/0003-multi-instance-from-the-start.md), so
 * `max` multiplied by the instance count must stay inside the server's
 * `max_connections`. Past that, put a connection pooler in front rather than
 * raising `max`.
 */

/** A query slower than this is reported. Chosen to be noisy before users notice. */
const DEFAULT_SLOW_QUERY_MS = 200;

/** How much of a statement appears in a log line. */
const LOGGED_SQL_LENGTH = 120;

/** `sslmode=` in a URL query or a key/value connection string. */
const SSLMODE_PATTERN = /(?:^|[?&\s])sslmode=/i;

/**
 * Refuse TLS settings given in two places (finding F-23).
 *
 * node-postgres parses the connection string after the options, and a
 * `sslmode` there replaces the `ssl` option outright. So `DATABASE_SSL`
 * would be silently ignored whenever the URL names a mode, which managed
 * providers' URLs always do, and a later `pg` release that gives `require`
 * its weaker libpq meaning would drop certificate checks without a word.
 * One place only: the URL's `sslmode`, or `DATABASE_SSL`.
 */
function assertSingleTlsSource(databaseConfig) {
  if (databaseConfig.ssl && SSLMODE_PATTERN.test(databaseConfig.connectionString)) {
    throw new Error(
      "DATABASE_URL sets sslmode and DATABASE_SSL is also set, and the URL would silently win. " +
        "Configure TLS in one place: sslmode=verify-full in the URL, or DATABASE_SSL alone.",
    );
  }
}

/**
 * Translate FlowBoard's database config into node-postgres pool options.
 *
 * Exported because a mistake here is invisible until the system is under load,
 * which is the worst time to discover it.
 */
function buildPoolOptions(databaseConfig) {
  return {
    connectionString: databaseConfig.connectionString,
    max: databaseConfig.poolMax,
    idleTimeoutMillis: databaseConfig.idleTimeoutMs,
    // Fail a request that cannot get a connection instead of queueing it
    // forever: under load, queueing turns a slow database into a hung server.
    connectionTimeoutMillis: databaseConfig.connectionTimeoutMs,
    // statement_timeout is enforced by PostgreSQL and survives a client that
    // stops listening; query_timeout is enforced here. Both, because either
    // alone leaves a gap.
    statement_timeout: databaseConfig.statementTimeoutMs,
    query_timeout: databaseConfig.statementTimeoutMs,
    // Names this process in pg_stat_activity, so a misbehaving instance can be
    // identified from the database side.
    application_name: databaseConfig.applicationName,
    ssl: databaseConfig.ssl,
    // Keep the pool alive through idle periods; the process decides when to
    // exit, not the pool.
    allowExitOnIdle: false,
  };
}

/**
 * @param {Object} options
 * @param {Object} options.config - the `database` section of the server config
 * @param {Pick<Console, "info" | "warn" | "error">} [options.logger]
 * @param {(poolOptions: object) => import("pg").Pool} [options.createPool]
 * @param {number} [options.slowQueryMs]
 */
function createDatabase({
  config,
  logger = console,
  createPool = (poolOptions) => new Pool(poolOptions),
  slowQueryMs = DEFAULT_SLOW_QUERY_MS,
}) {
  if (!config?.connectionString) {
    throw new Error("createDatabase requires config.connectionString.");
  }
  assertSingleTlsSource(config);

  const pool = createPool(buildPoolOptions(config));

  // node-postgres emits this when an *idle* client dies — a network drop, a
  // database failover, an administrator terminating the backend. Node treats an
  // unhandled "error" event as fatal, so without this listener a brief database
  // blip would take the whole server down with it.
  pool.on("error", (error) => {
    logger.error?.("[db] Idle client error.", { message: error?.message });
  });

  let closed = false;

  /**
   * Run a parameterised statement.
   *
   * Values are never logged: they carry password hashes, tokens and email
   * addresses.
   *
   * @param {string} text
   * @param {unknown[]} [values]
   */
  async function query(text, values = []) {
    const startedAt = performance.now();

    try {
      return await pool.query(text, values);
    } finally {
      reportIfSlow(text, performance.now() - startedAt);
    }
  }

  /**
   * Run several statements as one unit.
   *
   * The callback receives a handle whose queries all run on the same
   * connection; anything thrown rolls the transaction back.
   *
   * @template T
   * @param {(tx: { query: typeof query }) => Promise<T>} run
   * @returns {Promise<T>}
   */
  async function transaction(run) {
    const client = await pool.connect();
    let released = false;

    const tx = {
      async query(text, values = []) {
        const startedAt = performance.now();

        try {
          return await client.query(text, values);
        } finally {
          reportIfSlow(text, performance.now() - startedAt);
        }
      },
    };

    try {
      await client.query("BEGIN");
      const result = await run(tx);
      await client.query("COMMIT");

      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        // The connection still holds an open transaction and cannot be reused.
        // Releasing it with an error removes it from the pool instead of
        // handing the next caller a poisoned client.
        logger.error?.("[db] Rollback failed; discarding the connection.", {
          message: rollbackError?.message,
        });
        client.release(rollbackError);
        released = true;
      }

      throw error;
    } finally {
      if (!released) client.release();
    }
  }

  /**
   * Can this process actually reach the database right now?
   *
   * Used by the readiness probe, so it runs a real statement rather than
   * inspecting pool state — a pool with idle clients can still be pointed at a
   * database that is gone.
   */
  async function ping() {
    await query("SELECT 1");
  }

  /** Drain the pool during shutdown. Safe to call more than once. */
  async function close() {
    if (closed) return;
    closed = true;

    await pool.end();
  }

  function reportIfSlow(text, durationMs) {
    if (durationMs < slowQueryMs) return;

    logger.warn?.("[db] Slow query.", {
      durationMs: Math.round(durationMs),
      sql: summariseSql(text),
    });
  }

  return {
    query,
    transaction,
    ping,
    close,
    /** Escape hatch for the migration runner, which needs a dedicated session. */
    getPool() {
      return pool;
    },
  };
}

/** One line of a statement, clipped, for a log entry. */
function summariseSql(text) {
  const collapsed = String(text).replace(/\s+/g, " ").trim();

  return collapsed.length <= LOGGED_SQL_LENGTH
    ? collapsed
    : `${collapsed.slice(0, LOGGED_SQL_LENGTH - 1)}…`;
}

module.exports = {
  buildPoolOptions,
  createDatabase,
  DEFAULT_SLOW_QUERY_MS,
};
