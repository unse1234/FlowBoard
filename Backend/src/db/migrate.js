const { createHash } = require("node:crypto");
const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

/**
 * Forward-only SQL migrations.
 *
 * Migrations live in Backend/migrations as plain .sql files named
 * `NNNN_description.sql` and run in filename order. There is no "down": a
 * mistake is corrected by a new migration, because rolling back a schema under
 * a running deployment loses data.
 *
 * Several instances start at once during a rolling deploy, so the whole run
 * happens under a PostgreSQL advisory lock. The first instance migrates; the
 * others wait, then find nothing to do.
 *
 * Each migration and its bookkeeping row commit together, so a failure can
 * never leave a migration recorded as applied when it was not.
 */

/** Any constant works; it only has to be the same in every instance. */
const MIGRATION_LOCK_KEY = 4017235190;

const MIGRATIONS_DIRECTORY = path.join(__dirname, "..", "..", "migrations");

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Statements like CREATE INDEX CONCURRENTLY cannot run inside a transaction.
 * A migration that needs that says so on its first line, and accepts that a
 * failure may leave it half-applied.
 */
const NO_TRANSACTION_MARKER = "-- flowboard:no-transaction";

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          text        PRIMARY KEY,
    checksum    text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    duration_ms integer     NOT NULL
  )
`;

/**
 * Read the migrations on disk, in the order they must run.
 *
 * @param {string} [directory]
 * @returns {{ id: string, fileName: string, sql: string, checksum: string, useTransaction: boolean }[]}
 */
function readMigrations(directory = MIGRATIONS_DIRECTORY) {
  let entries;

  try {
    entries = readdirSync(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const fileNames = entries.filter((name) => name.endsWith(".sql")).sort();

  for (const fileName of fileNames) {
    if (!MIGRATION_FILE_PATTERN.test(fileName)) {
      throw new Error(
        `Migration "${fileName}" must be named NNNN_lower_snake_case.sql so ordering stays unambiguous.`,
      );
    }
  }

  return fileNames.map((fileName) => {
    // Line endings are normalised before hashing, and what runs is what was
    // hashed. git with core.autocrlf checks the same commit out as LF on one
    // machine and CRLF on another, and hashing raw bytes read that conversion
    // as an edited migration, so a database migrated from one checkout refused
    // to migrate from the other (finding F-20). Every checksum recorded before
    // this was taken over LF bytes, so they all still match.
    const sql = readFileSync(path.join(directory, fileName), "utf8").replace(/\r\n/g, "\n");

    return {
      id: fileName.replace(/\.sql$/, ""),
      fileName,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
      useTransaction: !sql.trimStart().startsWith(NO_TRANSACTION_MARKER),
    };
  });
}

/**
 * Work out what still needs to run.
 *
 * Pure, so the interesting cases — a migration edited after it was applied, a
 * migration deleted, one inserted behind the head — are testable without a
 * database.
 *
 * @param {{ id: string, checksum: string }[]} available
 * @param {{ id: string, checksum: string }[]} applied
 */
function planMigrations(available, applied) {
  const appliedById = new Map(applied.map((row) => [row.id, row]));
  const availableIds = new Set(available.map((migration) => migration.id));
  const pending = [];
  const problems = [];

  for (const migration of available) {
    const appliedMigration = appliedById.get(migration.id);

    if (!appliedMigration) {
      pending.push(migration);
      continue;
    }

    if (appliedMigration.checksum !== migration.checksum) {
      // Editing an applied migration means environments silently disagree about
      // their schema. The fix is a new migration, never a rewrite of this one.
      problems.push(
        `Migration "${migration.id}" has changed since it was applied. Add a new migration instead of editing it.`,
      );
    }
  }

  for (const row of applied) {
    if (!availableIds.has(row.id)) {
      problems.push(
        `Migration "${row.id}" is recorded as applied but is missing from the migrations directory.`,
      );
    }
  }

  // A migration numbered below one already applied would run out of order
  // across environments, so it is caught rather than quietly applied.
  const highestApplied = applied.map((row) => row.id).sort().at(-1);
  if (highestApplied) {
    for (const migration of pending) {
      if (migration.id < highestApplied) {
        problems.push(
          `Migration "${migration.id}" sorts before the applied "${highestApplied}". Renumber it above the latest migration.`,
        );
      }
    }
  }

  return { pending, problems };
}

/**
 * Apply every pending migration.
 *
 * @param {Object} options
 * @param {{ getPool(): import("pg").Pool }} options.database
 * @param {string} [options.directory]
 * @param {Pick<Console, "info" | "warn" | "error">} [options.logger]
 * @returns {Promise<{ applied: string[], alreadyApplied: number }>}
 */
async function runMigrations({ database, directory = MIGRATIONS_DIRECTORY, logger = console }) {
  const available = readMigrations(directory);
  const client = await database.getPool().connect();

  try {
    // Session-level, so it is held for this whole run and released with the
    // connection even if the process is killed mid-migration.
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(CREATE_MIGRATIONS_TABLE);

    const { rows: applied } = await client.query(
      "SELECT id, checksum FROM schema_migrations ORDER BY id",
    );
    const { pending, problems } = planMigrations(available, applied);

    if (problems.length > 0) {
      throw new Error(`Migration state is inconsistent:\n  - ${problems.join("\n  - ")}`);
    }

    if (pending.length === 0) {
      logger.info?.(`[migrate] Up to date (${applied.length} applied).`);
      return { applied: [], alreadyApplied: applied.length };
    }

    const appliedNow = [];

    for (const migration of pending) {
      const startedAt = performance.now();
      logger.info?.(`[migrate] Applying ${migration.id}…`);

      if (migration.useTransaction) await client.query("BEGIN");

      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (id, checksum, duration_ms) VALUES ($1, $2, $3)",
          [migration.id, migration.checksum, Math.round(performance.now() - startedAt)],
        );

        if (migration.useTransaction) await client.query("COMMIT");
      } catch (error) {
        if (migration.useTransaction) await client.query("ROLLBACK").catch(() => {});

        throw new Error(`Migration "${migration.id}" failed: ${error?.message}`, { cause: error });
      }

      appliedNow.push(migration.id);
      logger.info?.(
        `[migrate] Applied ${migration.id} in ${Math.round(performance.now() - startedAt)}ms.`,
      );
    }

    return { applied: appliedNow, alreadyApplied: applied.length };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

if (require.main === module) {
  const { getServerConfig, loadLocalEnvFile } = require("../config/serverConfig");
  const { createDatabase } = require("./createDatabase");

  loadLocalEnvFile();
  const config = getServerConfig();

  if (!config.database.connectionString) {
    console.error("[migrate] DATABASE_URL is not set.");
    process.exit(1);
  }

  const database = createDatabase({ config: config.database });

  runMigrations({ database })
    .then(({ applied }) => {
      console.info(
        applied.length === 0
          ? "[migrate] Nothing to do."
          : `[migrate] Applied ${applied.length} migration(s).`,
      );
    })
    .catch((error) => {
      console.error(`[migrate] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => database.close());
}

module.exports = {
  MIGRATIONS_DIRECTORY,
  MIGRATION_LOCK_KEY,
  planMigrations,
  readMigrations,
  runMigrations,
};
