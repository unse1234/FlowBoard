/**
 * The Socket.IO handshake's origin allow-list (Phase D).
 *
 * A browser attaches `Origin` to every WebSocket and polling handshake, and a
 * page cannot forge it, so refusing unknown origins stops another site from
 * opening a socket in a visitor's browser (cross-site WebSocket hijacking).
 * Socket.IO's `cors` option only shapes polling responses; it does not refuse
 * a WebSocket from anywhere, which is why this runs in `allowRequest`.
 *
 * A missing Origin is refused too, as `/api/auth` does for writes
 * (`http/originCheck.js`). Browsers always send one here; a script without one
 * is not a FlowBoard page. Non-browser clients can forge any origin, and the
 * access token is what stops them.
 *
 * @param {readonly string[]} trustedOrigins  normalised, as serverConfig produces them
 * @returns {(request: import("node:http").IncomingMessage, callback: (error: string | null, success: boolean) => void) => void}
 */
function createOriginGate(trustedOrigins, { logger = console } = {}) {
  return function allowRequest(request, callback) {
    const origin = request.headers.origin;
    const allowed = typeof origin === "string" && origin !== "null" && trustedOrigins.includes(origin);

    if (!allowed) {
      logger.warn?.("[realtime] Handshake refused: origin not allowed.", {
        origin: String(origin ?? "none").slice(0, 200),
      });
    }
    callback(allowed ? null : "ORIGIN_NOT_ALLOWED", allowed);
  };
}

module.exports = {
  createOriginGate,
};
