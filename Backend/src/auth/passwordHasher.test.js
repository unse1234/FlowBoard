const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_PASSWORD_BYTES, createPasswordHasher } = require("./passwordHasher");

const SILENT_LOGGER = { info() {}, warn() {}, error() {} };

/**
 * Deliberately below the configured default.
 *
 * These tests run on every `npm test`, and real parameters cost ~30ms a hash.
 * What is under test is this module's behaviour, not Argon2 itself, so the
 * suite uses the cheapest settings the library accepts. One test below pins the
 * real defaults so a weakening of the shipped configuration still fails.
 */
const CHEAP = { memoryCostKib: 64, timeCost: 1, parallelism: 1 };

const createHasher = (config = CHEAP, logger = SILENT_LOGGER) =>
  createPasswordHasher({ config, logger });

test("a hash records the algorithm and parameters it was made with", async () => {
  const hasher = createHasher();

  const stored = await hasher.hashPassword("correct horse battery staple");

  // The PHC prefix is what makes raising the cost later a config change rather
  // than a migration.
  assert.match(stored, /^\$argon2id\$v=19\$m=64,t=1,p=1\$/);
});

test("the same password hashes differently every time", async () => {
  const hasher = createHasher();

  const first = await hasher.hashPassword("same password");
  const second = await hasher.hashPassword("same password");

  // A per-hash salt. Equal hashes would mean identical passwords are visible to
  // anyone reading the table.
  assert.notEqual(first, second);
});

test("the stored hash never contains the password", async () => {
  const hasher = createHasher();

  const stored = await hasher.hashPassword("hunter2");

  assert.equal(stored.includes("hunter2"), false);
});

test("verifies the right password and rejects a wrong one", async () => {
  const hasher = createHasher();
  const stored = await hasher.hashPassword("s3cret-passphrase");

  assert.equal(await hasher.verifyPassword(stored, "s3cret-passphrase"), true);
  assert.equal(await hasher.verifyPassword(stored, "s3cret-passphras"), false);
  assert.equal(await hasher.verifyPassword(stored, "S3cret-passphrase"), false);
  assert.equal(await hasher.verifyPassword(stored, ""), false);
});

test("verification is unicode-exact", async () => {
  const hasher = createHasher();
  const stored = await hasher.hashPassword("pässwörd-日本語-🔑");

  assert.equal(await hasher.verifyPassword(stored, "pässwörd-日本語-🔑"), true);
  assert.equal(await hasher.verifyPassword(stored, "passwörd-日本語-🔑"), false);
});

test("an account with no password fails verification instead of erroring", async () => {
  const hasher = createHasher();

  // users.password_hash is null for an OAuth-only account. This must be a
  // failed login, not a 500, and certainly not a success.
  for (const absent of [null, undefined, "", 0, false, {}, []]) {
    assert.equal(await hasher.verifyPassword(absent, "anything"), false);
  }
});

test("a corrupted stored hash fails verification instead of throwing", async () => {
  const warnings = [];
  const hasher = createHasher(CHEAP, {
    ...SILENT_LOGGER,
    warn: (message, detail) => warnings.push({ message, detail }),
  });

  const result = await hasher.verifyPassword("$argon2id$not-a-real-hash", "anything");

  // A bad row must not become an error that looks different from a wrong
  // password, or it tells an attacker which accounts are broken.
  assert.equal(result, false);
  assert.equal(warnings.length, 1);
});

test("a failed verification never logs the password or the hash", async () => {
  const logged = [];
  const record = (message, detail) => logged.push(JSON.stringify({ message, detail }));
  const hasher = createHasher(CHEAP, { info: record, warn: record, error: record });

  await hasher.verifyPassword("$argon2id$corrupt$$$", "hunter2");

  const everything = logged.join(" ");
  assert.equal(everything.includes("hunter2"), false);
  assert.equal(everything.includes("corrupt"), false);
});

test("hashing rejects input that is not a usable password", async () => {
  const hasher = createHasher();

  for (const invalid of [null, undefined, "", 42, {}, []]) {
    await assert.rejects(() => hasher.hashPassword(invalid), TypeError);
  }
});

test("a password at the byte cap works and one past it is refused", async () => {
  const hasher = createHasher();

  const atCap = "a".repeat(MAX_PASSWORD_BYTES);
  const stored = await hasher.hashPassword(atCap);
  assert.equal(await hasher.verifyPassword(stored, atCap), true);

  // Unbounded input would let a caller make the server spend memory and CPU at
  // will, so the cap is a denial-of-service guard rather than a policy.
  await assert.rejects(() => hasher.hashPassword("a".repeat(MAX_PASSWORD_BYTES + 1)), TypeError);
});

test("the cap counts bytes, not characters", async () => {
  const hasher = createHasher();

  // Four bytes each in UTF-8, so a quarter as many fit.
  const justOver = "🔑".repeat(MAX_PASSWORD_BYTES / 4 + 1);

  await assert.rejects(() => hasher.hashPassword(justOver), TypeError);
});

test("verification refuses an oversized password without hashing it", async () => {
  const hasher = createHasher();
  const stored = await hasher.hashPassword("short");

  // Otherwise the verify path would be a way around the cap on the hash path.
  assert.equal(await hasher.verifyPassword(stored, "a".repeat(MAX_PASSWORD_BYTES + 1)), false);
});

test("a hash made with the current parameters needs no rehash", async () => {
  const hasher = createHasher();

  const stored = await hasher.hashPassword("password");

  assert.equal(hasher.needsRehash(stored), false);
});

test("a hash made with weaker parameters is flagged for rehash", async () => {
  const weak = createHasher({ memoryCostKib: 64, timeCost: 1, parallelism: 1 });
  const stored = await weak.hashPassword("password");

  // Raising the cost must upgrade existing accounts on their next login rather
  // than requiring a migration or a forced password reset.
  const strongerMemory = createHasher({ memoryCostKib: 128, timeCost: 1, parallelism: 1 });
  const strongerTime = createHasher({ memoryCostKib: 64, timeCost: 3, parallelism: 1 });

  assert.equal(strongerMemory.needsRehash(stored), true);
  assert.equal(strongerTime.needsRehash(stored), true);
});

test("a hash from a different algorithm is flagged for rehash", () => {
  const hasher = createHasher();

  // What a migration away from bcrypt or argon2i would leave behind.
  assert.equal(hasher.needsRehash("$argon2i$v=19$m=65536,t=3,p=1$c2FsdA$aGFzaA"), true);
  assert.equal(hasher.needsRehash("$2b$12$abcdefghijklmnopqrstuv"), true);
  assert.equal(hasher.needsRehash("plainly-not-a-hash"), true);
});

test("an absent hash is not reported as needing a rehash", () => {
  const hasher = createHasher();

  // An OAuth-only account has no password to upgrade; saying otherwise would
  // make the login path try to re-hash nothing.
  assert.equal(hasher.needsRehash(null), false);
  assert.equal(hasher.needsRehash(""), false);
});

test("burnVerificationWork reports failure and does real work", async () => {
  const hasher = createHasher();

  assert.equal(await hasher.burnVerificationWork("anything"), false);
  // Called again to cover the cached dummy hash, not just the first build.
  assert.equal(await hasher.burnVerificationWork("anything else"), false);
  assert.equal(await hasher.burnVerificationWork(null), false);
});

test("a login for an unknown address does the same argon2 work as a wrong password", async () => {
  // Asserted by counting the argon2 calls, not by timing them. An earlier
  // version of this test compared elapsed milliseconds and was flaky roughly
  // one run in six: `node --test` runs test files in parallel, so the
  // measurement competed with other files starting HTTP servers and querying
  // PostgreSQL. Counting the work is both deterministic and a stronger claim.
  const calls = [];
  const argon2 = {
    async hash(password, options) {
      calls.push({ kind: "hash", options });
      return "$argon2id$v=19$m=64,t=1,p=1$c2FsdA$ZGlnZXN0";
    },
    async verify(storedHash, password, options) {
      calls.push({ kind: "verify", options });
      return false;
    },
  };
  const hasher = createPasswordHasher({ config: CHEAP, logger: SILENT_LOGGER, argon2 });

  await hasher.burnVerificationWork("wrong");
  const firstCall = [...calls];
  calls.length = 0;
  await hasher.burnVerificationWork("wrong again");

  // Returning early for an unknown address would answer measurably faster than
  // a wrong password and leak which addresses are registered.
  assert.ok(
    firstCall.some((call) => call.kind === "verify"),
    "expected a real argon2 verification for an unknown address",
  );
  // The dummy hash is built once and reused, so every later attempt costs one
  // verification — exactly what a wrong password costs.
  assert.deepEqual(calls.map((call) => call.kind), ["verify"]);
});

test("the unknown-address path uses the same cost parameters as a real login", async () => {
  const seen = [];
  const argon2 = {
    async hash(password, options) {
      seen.push(options);
      return "$argon2id$v=19$m=64,t=1,p=1$c2FsdA$ZGlnZXN0";
    },
    async verify(storedHash, password, options) {
      seen.push(options);
      return false;
    },
  };
  const hasher = createPasswordHasher({ config: CHEAP, logger: SILENT_LOGGER, argon2 });

  await hasher.burnVerificationWork("wrong");

  // Cheaper parameters on the dummy path would reintroduce the timing gap this
  // function exists to close.
  assert.ok(seen.length > 0);
  for (const options of seen) {
    assert.equal(options.memoryCost, CHEAP.memoryCostKib);
    assert.equal(options.timeCost, CHEAP.timeCost);
    assert.equal(options.parallelism, CHEAP.parallelism);
  }
});

test("the shipped defaults meet OWASP's baseline", () => {
  const { getServerConfig } = require("../config/serverConfig");

  // The other tests run with cheap parameters, so this is what stops the real
  // configuration being weakened without anyone noticing.
  const shipped = createPasswordHasher({
    config: getServerConfig({}).auth.argon2,
    logger: SILENT_LOGGER,
  }).getParameters();

  assert.ok(shipped.memoryCostKib >= 19_456, "memory cost below OWASP baseline");
  assert.ok(shipped.timeCost >= 2, "time cost below OWASP baseline");
  assert.ok(shipped.parallelism >= 1);
});

test("a real hash at the shipped parameters round-trips", async () => {
  const { getServerConfig } = require("../config/serverConfig");
  const hasher = createPasswordHasher({
    config: getServerConfig({}).auth.argon2,
    logger: SILENT_LOGGER,
  });

  const stored = await hasher.hashPassword("production-parameters");

  assert.match(stored, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await hasher.verifyPassword(stored, "production-parameters"), true);
  assert.equal(hasher.needsRehash(stored), false);
});
