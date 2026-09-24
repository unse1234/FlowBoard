/**
 * Response headers for FlowBoard's API.
 *
 * This server answers with JSON and nothing else: two probes, the auth routes
 * and the AI route. That shapes the whole set — a policy written for an app
 * that serves HTML would be mostly inapplicable here, and the one header that
 * matters most for a JSON API (nosniff) is easy to overlook in one.
 *
 * **This does not give the FlowBoard web app a Content-Security-Policy.** The
 * app is built by Vite and served by something else entirely, so its headers
 * come from wherever that is. Finding F-6 is only half closed by this file.
 *
 * Written out rather than taken from a package: the list is short, every entry
 * has a reason specific to this API, and a reader can see exactly what is sent.
 */

/**
 * Policy for a response that is never a document.
 *
 * `default-src 'none'` means that if one of these responses were ever coaxed
 * into being rendered as a page, it could load nothing at all. The rest close
 * the ways a document can be abused without loading anything: being framed,
 * having its base URL rewritten, or being used to submit a form.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Express middleware setting the headers every response carries.
 *
 * @param {{ hstsMaxAgeSeconds: number }} config
 */
function createSecurityHeaders(config) {
  const hsts =
    config.hstsMaxAgeSeconds > 0
      ? `max-age=${config.hstsMaxAgeSeconds}; includeSubDomains`
      : null;

  return function securityHeaders(_request, response, next) {
    // The most important one here. Without it a browser may sniff a JSON body
    // as HTML and run script it finds inside — which turns any endpoint that
    // echoes input into a cross-site scripting vector.
    response.setHeader("X-Content-Type-Options", "nosniff");

    response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);

    // The older companion to frame-ancestors, for anything that does not
    // understand CSP.
    response.setHeader("X-Frame-Options", "DENY");

    // API paths carry board and account identifiers. Sending none at all costs
    // nothing, because no navigation starts from these responses.
    response.setHeader("Referrer-Policy", "no-referrer");

    // Ignored over plain HTTP, so it is safe to send in development. It is a
    // commitment for the domain and its subdomains, which is why the age is
    // configurable and "preload" is deliberately not set: preloading is
    // effectively irreversible and should be a separate, deliberate choice.
    if (hsts) response.setHeader("Strict-Transport-Security", hsts);

    next();
  };
}

/**
 * Deliberately not set, so that a future reader does not have to work out
 * whether they were forgotten:
 *
 * - **Cross-Origin-Resource-Policy.** The web app is on a different origin from
 *   this API, and CORS already governs who may read these responses. Setting it
 *   to `same-site` would add nothing that CORS does not already do, while
 *   risking a deployment where the two are not siblings.
 * - **Permissions-Policy.** It governs browser features inside a document, and
 *   these responses are never documents.
 * - **X-XSS-Protection.** Deprecated, and the filter it enabled introduced bugs
 *   of its own. Browsers ignore it.
 */

module.exports = {
  CONTENT_SECURITY_POLICY,
  createSecurityHeaders,
};
