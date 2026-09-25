const { createPublicKey, verify: verifySignature } = require("node:crypto");

/**
 * OpenID Connect ID tokens from Google and Microsoft, verified with
 * `node:crypto` (spec Phase E, ADR 0009): no JWT library, as for FlowBoard's
 * own tokens (ADR 0005).
 *
 * The token arrives straight from the provider's token endpoint over TLS, and
 * the spec still asks for every check, so every check is made:
 * - the signature, RS256 only, by a key from the provider's published set;
 * - the issuer, exactly;
 * - the audience, which must include FlowBoard's client id (and, with
 *   several audiences, `azp` must be it);
 * - expiry and issue time, with a minute of clock skew;
 * - the nonce FlowBoard sent, so a token minted for another sign-in is refused.
 *
 * Anything else, including any other algorithm, answers invalid. The reason
 * is for the log, never for the browser.
 */

const MAX_TOKEN_LENGTH = 16_384;
const CLOCK_SKEW_SECONDS = 60;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * A provider's signing keys, fetched when first needed and cached. A token
 * signed by a key not in the cache triggers one refetch (providers rotate
 * keys), at most once a minute, so a stream of bad `kid`s cannot turn this
 * into a request amplifier.
 *
 * @param {{ url: string, fetchImpl?: typeof fetch, ttlMs?: number, now?: () => number }} options
 */
function createKeySet({ url, fetchImpl = globalThis.fetch, ttlMs = 60 * 60 * 1000, now = () => Date.now() }) {
  let keys = new Map();
  let fetchedAt = -Infinity;
  let pending = null;

  async function load() {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`key set answered ${response.status}`);
    const body = await response.json();
    const next = new Map();
    for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
      if (jwk?.kty === "RSA" && typeof jwk.kid === "string" && (jwk.use === undefined || jwk.use === "sig")) {
        next.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
      }
    }
    keys = next;
    fetchedAt = now();
  }

  function refresh() {
    pending ??= load().finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    async get(kid) {
      if (now() - fetchedAt > ttlMs) await refresh();
      if (!keys.has(kid) && now() - fetchedAt > 60_000) await refresh();
      return keys.get(kid) ?? null;
    },
  };
}

/**
 * @param {string} token
 * @param {Object} expected
 * @param {{ get(kid: string): Promise<import("node:crypto").KeyObject | null> }} expected.keySet
 * @param {(claims: Object) => boolean} expected.issuer  whether this `iss` is right for these claims
 * @param {string} expected.audience  the client id
 * @param {string} expected.nonce
 * @param {() => number} [expected.now]  milliseconds
 * @returns {Promise<{ valid: true, claims: Object } | { valid: false, reason: string }>}
 */
async function verifyIdToken(token, { keySet, issuer, audience, nonce, now = () => Date.now() }) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return invalid("malformed");
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every((part) => BASE64URL.test(part))) return invalid("malformed");

  const header = decode(parts[0]);
  const claims = decode(parts[1]);
  if (!header || !claims) return invalid("malformed");
  if (header.alg !== "RS256" || typeof header.kid !== "string") return invalid("algorithm");

  const key = await keySet.get(header.kid);
  if (!key) return invalid("unknown key");
  const signed = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`, "ascii"),
    key,
    Buffer.from(parts[2], "base64url"),
  );
  if (!signed) return invalid("signature");

  if (typeof claims.iss !== "string" || !issuer(claims)) return invalid("issuer");

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) return invalid("audience");
  if (audiences.length > 1 && claims.azp !== audience) return invalid("authorized party");

  const seconds = Math.floor(now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_SECONDS < seconds) return invalid("expired");
  if (Number.isFinite(claims.iat) && claims.iat - CLOCK_SKEW_SECONDS > seconds) return invalid("issued in the future");

  if (typeof claims.nonce !== "string" || claims.nonce !== nonce) return invalid("nonce");
  if (typeof claims.sub !== "string" || claims.sub === "") return invalid("subject");

  return { valid: true, claims };
}

function decode(part) {
  try {
    const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function invalid(reason) {
  return { valid: false, reason };
}

module.exports = {
  createKeySet,
  verifyIdToken,
};
