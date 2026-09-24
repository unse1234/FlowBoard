const { createHash, timingSafeEqual } = require("node:crypto");
const { isIP } = require("node:net");

/**
 * Who is really on the other end of an /api/auth request (chunk 7.1).
 *
 * In production the browser never talks to this server directly for auth. It
 * calls the web app's own origin, and Vercel forwards the request here
 * (AUTH_DECISIONS.md E-15), through Cloudflare and Render's own proxy. By the
 * time it arrives, the socket address is Render's proxy, the same for everyone,
 * so rate limits keyed on it would be one limit for the whole site.
 *
 * Vercel knows the client's address, and documents that it overwrites
 * `X-Forwarded-For` (and its copy, `x-vercel-forwarded-for`) to stop clients
 * spoofing it. That value can be trusted only for a request that really came
 * through Vercel. Anyone can call Render directly and send the same header. So
 * the rewrite also adds a secret (`Frontend/vercel.json`, from the
 * `AUTH_PROXY_SECRET` environment variable, never committed), and:
 *
 * - **with the secret configured**, a request without it is refused, and one
 *   with it is attributed to the address Vercel reported;
 * - **without it** (development, where there is no edge), the socket address
 *   is the client and is used as is.
 */

/** Set by the Vercel route in Frontend/vercel.json. Never logged. */
const EDGE_SECRET_HEADER = "x-flowboard-edge-secret";

/** Vercel's own copy of the client address, which it overwrites on every request. */
const EDGE_ADDRESS_HEADER = "x-vercel-forwarded-for";

/**
 * Where a request's rate-limit key and session metadata come from when the
 * edge vouched for it but sent no usable address. One shared bucket: fails
 * towards stricter limits, never towards none.
 */
const UNKNOWN_EDGE_CLIENT = "edge-client-unknown";

const digest = (value) => createHash("sha256").update(value, "utf8").digest();

/**
 * @param {Object} options
 * @param {string | null} options.edgeSecret  AUTH_PROXY_SECRET, or null for no edge
 * @returns {(request: import("express").Request) => { trusted: boolean, address: string | null, reason?: string }}
 */
function createEdgeRequestReader({ edgeSecret }) {
  // Compared as digests, so the comparison takes the same time whatever the
  // presented value's length. timingSafeEqual alone requires equal lengths.
  const expected = edgeSecret ? digest(edgeSecret) : null;

  return function readEdgeRequest(request) {
    if (!expected) {
      return { trusted: true, address: socketAddress(request) };
    }

    const presented = request.get(EDGE_SECRET_HEADER);
    if (typeof presented !== "string" || presented === "") {
      return { trusted: false, address: null, reason: "no edge secret" };
    }
    if (!timingSafeEqual(digest(presented), expected)) {
      return { trusted: false, address: null, reason: "wrong edge secret" };
    }

    return { trusted: true, address: edgeAddress(request) };
  };
}

/**
 * The first entry of Vercel's address header, if it is an address at all.
 * Vercel overwrites it rather than appending, so there should only ever be
 * one. The first is taken in case a proxy between here and Vercel appends.
 */
function edgeAddress(request) {
  const header = request.get(EDGE_ADDRESS_HEADER);
  const first = typeof header === "string" ? header.split(",")[0].trim() : "";
  return isIP(first) !== 0 ? first : UNKNOWN_EDGE_CLIENT;
}

function socketAddress(request) {
  const address = request.ip ?? request.socket?.remoteAddress;
  return typeof address === "string" && address !== "" ? address : null;
}

module.exports = {
  EDGE_ADDRESS_HEADER,
  EDGE_SECRET_HEADER,
  UNKNOWN_EDGE_CLIENT,
  createEdgeRequestReader,
};
