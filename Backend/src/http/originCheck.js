/**
 * CSRF protection for routes a cookie authenticates (chunk 2.6).
 *
 * The refresh cookie is ambient authority: a browser attaches it to any
 * request for /api/auth, including one a hostile page triggers with an HTML
 * form. `SameSite=Strict` stops that on its own for a cross-site page, but not
 * for a page on a sibling subdomain, and not at all under the
 * `AUTH_COOKIE_SAME_SITE=none` escape hatch (E-15). So the server also checks
 * where the request came from.
 *
 * It uses the `Origin` header. Browsers attach it to every POST, same-origin
 * included, and a page cannot set or forge it. A request with a state-changing
 * method passes only if `Origin` is present and on the configured list.
 *
 * Deliberately not added:
 * - A CSRF token. It protects against nothing the `Origin` check does not,
 *   since only a browser carries the cookie and every current browser sends
 *   `Origin`. It would also need its own storage and delivery.
 * - A `Referer` fallback. A missing `Origin` on a POST means a non-browser
 *   client, which has no victim's cookie to ride, or a privacy tool stripping
 *   headers. Refusing is the safe answer for both.
 */

/** Methods that never change state here, so never need the check. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * @param {{ method: string, get(name: string): string | undefined }} request
 * @param {readonly string[]} trustedOrigins  normalised, as serverConfig produces them
 * @returns {boolean}
 */
function isTrustedOrigin(request, trustedOrigins) {
  if (SAFE_METHODS.has(request.method)) return true;

  const origin = request.get("origin");

  // "null" is what sandboxed frames, file: pages and some redirects send. It
  // can come from anywhere, so it is never trusted, even if configured.
  if (typeof origin !== "string" || origin === "" || origin === "null") return false;

  // Exact match. Browsers send the serialised origin, lowercase with no path
  // and no trailing slash, so anything else did not come from a browser.
  return trustedOrigins.includes(origin);
}

module.exports = {
  isTrustedOrigin,
};
