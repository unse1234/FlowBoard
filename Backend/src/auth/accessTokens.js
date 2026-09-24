const { createHmac, timingSafeEqual } = require("node:crypto");

/**
 * Short-lived access tokens: JWTs signed with HMAC-SHA256.
 *
 * ADR 0002 chose the token model, and ADR 0005 chose to sign with `node:crypto`
 * rather than a library. This module is therefore the whole of FlowBoard's JWT
 * handling, and it is deliberately narrow. It issues exactly one shape of
 * token, and accepts nothing else.
 *
 * - **One algorithm.** The header must say HS256. A verifier that honours the
 *   header's `alg` is how the classic JWT forgeries work: `none`, or an HMAC
 *   keyed with a public key. No other value is ever looked at.
 * - **The key is chosen by `kid`, never by trying each one.** Several keys
 *   verify, so a signing key can be rotated without signing everyone out; only
 *   the first signs.
 * - **The signature is checked before the payload is parsed.** Nothing an
 *   attacker wrote is interpreted until the token is known to be ours.
 * - **`verify` never throws.** It answers `{ valid: false, reason }` for
 *   anything wrong, and the reason is for the log, never for the client.
 *
 * Verification needs no I/O, which is the point of ADR 0002: every API request
 * and socket handshake can authenticate without a database round trip. The
 * cost is that a token stays valid until it expires. `tokenVersion` is carried
 * so that code which already reads the user row can reject a token issued
 * before a "sign out everywhere".
 */

const ALGORITHM = "HS256";
const TOKEN_TYPE = "JWT";

/**
 * A denial-of-service guard, not a format rule. FlowBoard's own tokens are
 * about 400 characters, and anything far larger is not one of them.
 */
const MAX_TOKEN_LENGTH = 2048;

/**
 * How far in the future `iat` may be. Instances sign and verify with their own
 * clocks, so one running a little behind would otherwise reject tokens a peer
 * issued a moment ago. Only `iat` gets this leeway: stretching `exp` would
 * lengthen every token's life.
 */
const CLOCK_SKEW_SECONDS = 30;

/** HMAC-SHA256 output, and therefore the only valid signature length. */
const SIGNATURE_BYTES = 32;

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Header fields FlowBoard writes. Any other, `jku`, `jwk` and `crit` included, is rejected. */
const HEADER_FIELDS = new Set(["alg", "typ", "kid"]);

/**
 * @typedef {{ id: string, secret: Buffer }} SigningKey
 *
 * @typedef {Object} AccessTokenConfig
 * @property {SigningKey[]} keys  The first signs; all of them verify.
 * @property {number} ttlSeconds
 * @property {string} issuer
 * @property {string} audience
 *
 * @typedef {Object} AccessTokenClaims
 * @property {string} userId
 * @property {string} sessionId      the auth_sessions row the token was issued from
 * @property {number} tokenVersion   users.token_version when it was issued
 * @property {Date} issuedAt
 * @property {Date} expiresAt
 */

/**
 * @param {Object} options
 * @param {AccessTokenConfig} options.config
 * @param {() => number} [options.now]  milliseconds since the epoch; injectable for tests
 */
function createAccessTokens({ config, now = Date.now }) {
  const keys = config?.keys;

  // Refusing to start is the safe failure. The alternative, issuing tokens
  // signed with nothing or with a default, is how a secret ends up in a repo.
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error("Access-token signing keys are not configured. Set AUTH_ACCESS_TOKEN_KEYS.");
  }

  const keysById = new Map(keys.map((key) => [key.id, key.secret]));
  const signingKey = keys[0];
  const nowSeconds = () => Math.floor(now() / 1000);

  /**
   * Sign a token for a signed-in session.
   *
   * @param {{ userId: string, sessionId: string, tokenVersion: number }} subject
   * @returns {{ token: string, expiresAt: Date }}
   */
  function issue({ userId, sessionId, tokenVersion }) {
    // A bad argument here is a programming error, not a client's, so it throws.
    if (!UUID_PATTERN.test(String(userId))) throw new TypeError("userId must be a UUID.");
    if (!UUID_PATTERN.test(String(sessionId))) throw new TypeError("sessionId must be a UUID.");
    if (!Number.isInteger(tokenVersion) || tokenVersion < 0) {
      throw new TypeError("tokenVersion must be a non-negative integer.");
    }

    const issuedAt = nowSeconds();
    const expiresAt = issuedAt + config.ttlSeconds;

    const header = encodeJson({ alg: ALGORITHM, typ: TOKEN_TYPE, kid: signingKey.id });
    const payload = encodeJson({
      iss: config.issuer,
      aud: config.audience,
      sub: userId,
      sid: sessionId,
      ver: tokenVersion,
      iat: issuedAt,
      exp: expiresAt,
    });

    const signature = sign(signingKey.secret, `${header}.${payload}`).toString("base64url");

    return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000) };
  }

  /**
   * Check a token presented by a client.
   *
   * @param {unknown} token
   * @returns {{ valid: true, claims: AccessTokenClaims } | { valid: false, reason: string }}
   */
  function verify(token) {
    if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      return invalid("malformed");
    }

    const segments = token.split(".");
    if (segments.length !== 3 || !segments.every((segment) => SEGMENT_PATTERN.test(segment))) {
      return invalid("malformed");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = segments;

    // The header has to be read to find the key, so it is the one part parsed
    // before the signature is checked, and it is held to an exact shape.
    const header = decodeJson(encodedHeader);
    if (!isPlainObject(header) || !Object.keys(header).every((field) => HEADER_FIELDS.has(field))) {
      return invalid("malformed");
    }
    if (header.alg !== ALGORITHM || header.typ !== TOKEN_TYPE) return invalid("unsupported_algorithm");

    const secret = typeof header.kid === "string" ? keysById.get(header.kid) : undefined;
    if (!secret) return invalid("unknown_key");

    const signature = decodeCanonical(encodedSignature);
    if (!signature || signature.length !== SIGNATURE_BYTES) return invalid("malformed");

    const expected = sign(secret, `${encodedHeader}.${encodedPayload}`);
    if (!timingSafeEqual(signature, expected)) return invalid("bad_signature");

    // From here the token is known to be one this service signed.
    const payload = decodeJson(encodedPayload);
    if (!isPlainObject(payload)) return invalid("invalid_claims");

    const { iss, aud, sub, sid, ver, iat, exp } = payload;
    if (
      iss !== config.issuer ||
      aud !== config.audience ||
      typeof sub !== "string" ||
      !UUID_PATTERN.test(sub) ||
      typeof sid !== "string" ||
      !UUID_PATTERN.test(sid) ||
      !Number.isInteger(ver) ||
      ver < 0 ||
      !Number.isInteger(iat) ||
      !Number.isInteger(exp) ||
      exp <= iat
    ) {
      return invalid("invalid_claims");
    }

    const current = nowSeconds();
    if (current >= exp) return invalid("expired");
    if (iat > current + CLOCK_SKEW_SECONDS) return invalid("not_yet_valid");

    return {
      valid: true,
      claims: {
        userId: sub,
        sessionId: sid,
        tokenVersion: ver,
        issuedAt: new Date(iat * 1000),
        expiresAt: new Date(exp * 1000),
      },
    };
  }

  return { issue, verify };
}

function sign(secret, signingInput) {
  return createHmac("sha256", secret).update(signingInput, "ascii").digest();
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(segment) {
  const bytes = decodeCanonical(segment);
  if (!bytes) return null;

  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    // Not JSON, so not a token of ours. The caller turns null into a reason.
    return null;
  }
}

/**
 * Decode base64url, accepting only the one spelling that encodes these bytes.
 *
 * Node's decoder ignores the unused low bits of the last character, so several
 * strings decode to the same bytes. Rejecting all but the canonical one means a
 * token has exactly one valid string form, which matters as soon as anything
 * keys on the token text: a log search, a cache, a denylist.
 */
function decodeCanonical(segment) {
  const bytes = Buffer.from(segment, "base64url");
  return bytes.toString("base64url") === segment ? bytes : null;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(reason) {
  return { valid: false, reason };
}

module.exports = {
  ALGORITHM,
  CLOCK_SKEW_SECONDS,
  MAX_TOKEN_LENGTH,
  createAccessTokens,
};
