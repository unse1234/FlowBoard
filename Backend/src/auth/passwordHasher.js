const { Algorithm, hash, verify } = require("@node-rs/argon2");

/**
 * Password hashing, per docs/decisions/0004-password-hashing.md.
 *
 * Argon2id, with the algorithm and its parameters stored inside each hash as a
 * PHC string:
 *
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt>$<digest>
 *
 * That makes raising the cost later a configuration change rather than a
 * migration: `needsRehash` reports a hash made with weaker settings, and the
 * login path re-hashes it while it already holds the plaintext.
 *
 * Nothing here ever logs a password or a hash.
 */

/**
 * Argon2 has no bcrypt-style truncation problem, so this is not about
 * correctness — it stops a caller making the server spend memory and CPU on a
 * multi-megabyte "password".
 */
const MAX_PASSWORD_BYTES = 1024;

/** Anything a real user could plausibly type stays far inside the cap. */
const PHC_PATTERN = /^\$(argon2(?:id|i|d))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/;

/**
 * @param {Object} dependencies
 * @param {{ memoryCostKib: number, timeCost: number, parallelism: number }} dependencies.config
 * @param {Pick<Console, "info" | "warn" | "error">} [dependencies.logger]
 * @param {{ hash: Function, verify: Function }} [dependencies.argon2]
 *   Injected so tests can assert *that* hashing happened, rather than inferring
 *   it from how long something took. Wall-clock assertions are unreliable here:
 *   `node --test` runs test files in parallel, so a measurement competes with
 *   other files starting servers and querying the database.
 */
function createPasswordHasher({ config, logger = console, argon2 = { hash, verify } }) {
  const options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: config.memoryCostKib,
    timeCost: config.timeCost,
    parallelism: config.parallelism,
  };

  // Built once, on first use, so a login for an address that does not exist can
  // do the same work as one that does. Lazy, so process start pays nothing.
  let dummyHashPromise = null;

  /**
   * @param {string} password
   * @returns {Promise<string>} a PHC string safe to store
   */
  async function hashPassword(password) {
    assertHashablePassword(password);

    return argon2.hash(password, options);
  }

  /**
   * Check a password against a stored hash.
   *
   * Never throws and never distinguishes *why* it failed. A missing hash (an
   * OAuth-only account), a corrupted row and a wrong password all return false,
   * so none of them can be told apart by a caller — or by an attacker reading
   * status codes.
   *
   * @param {unknown} storedHash
   * @param {unknown} password
   * @returns {Promise<boolean>}
   */
  async function verifyPassword(storedHash, password) {
    if (!isNonEmptyString(storedHash)) return false;
    if (!isHashablePassword(password)) return false;

    try {
      return await argon2.verify(storedHash, password, options);
    } catch (error) {
      // A row that cannot be parsed is a data problem worth knowing about, but
      // the hash itself never goes into the log.
      logger.warn?.("[auth] Stored password hash could not be verified.", {
        message: error?.message,
      });

      return false;
    }
  }

  /**
   * Was this hash made with weaker settings than we now use?
   *
   * Call it only after a successful verify, when the plaintext is in hand, and
   * replace the stored hash if it says yes. An unreadable hash reports true so
   * it gets replaced rather than lingering.
   *
   * @param {unknown} storedHash
   * @returns {boolean}
   */
  function needsRehash(storedHash) {
    if (!isNonEmptyString(storedHash)) return false;

    const match = PHC_PATTERN.exec(storedHash);
    if (!match) return true;

    const [, algorithm, , memoryCost, timeCost, parallelism] = match;

    return (
      algorithm !== "argon2id" ||
      Number(memoryCost) < options.memoryCost ||
      Number(timeCost) < options.timeCost ||
      Number(parallelism) < options.parallelism
    );
  }

  /**
   * Spend the same effort as a real verification, and report failure.
   *
   * For the login path when no account matches the address. Returning early
   * there would make a non-existent address answer measurably faster than a
   * wrong password, which is a user-enumeration oracle.
   *
   * @param {unknown} password
   * @returns {Promise<false>}
   */
  async function burnVerificationWork(password) {
    dummyHashPromise ??= argon2.hash("flowboard-nonexistent-account", options);

    try {
      await verifyPassword(await dummyHashPromise, password);
    } catch {
      // The result is discarded either way; this only has to take the time.
    }

    return false;
  }

  return {
    hashPassword,
    verifyPassword,
    needsRehash,
    burnVerificationWork,
    /** The parameters in force, for logging at startup and for tests. */
    getParameters() {
      return {
        memoryCostKib: options.memoryCost,
        timeCost: options.timeCost,
        parallelism: options.parallelism,
      };
    },
  };
}

function assertHashablePassword(password) {
  if (!isNonEmptyString(password)) {
    throw new TypeError("Password must be a non-empty string.");
  }

  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new TypeError(`Password must be at most ${MAX_PASSWORD_BYTES} bytes.`);
  }
}

/** The same rules as assertHashablePassword, as a predicate for the verify path. */
function isHashablePassword(password) {
  return (
    isNonEmptyString(password) && Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

module.exports = {
  MAX_PASSWORD_BYTES,
  createPasswordHasher,
};
