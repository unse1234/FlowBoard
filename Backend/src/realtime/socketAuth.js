const { connectionRefusal } = require("./realtimeErrors");

/**
 * Authentication for every Socket.IO connection (Phase D).
 *
 * The same credentials as the HTTP API, not a second system: the client sends
 * its access token in the handshake's `auth` option, the token is verified
 * like a bearer token, and the session behind it is checked against the
 * database like `requireLiveSession` does. Only then is the connection
 * accepted, with who it is fixed in `socket.data`:
 *
 *   socket.data.userId, .sessionId, .tokenVersion, .displayName, .emailVerified
 *
 * Nothing a client sends later can change these. Every gateway reads identity
 * from here and never from an event's payload (rule 12).
 *
 * Runs on reconnection too, recovered connections included
 * (`skipMiddlewares: false`), so a recovered socket is re-authenticated with
 * whatever token the client holds now.
 *
 * @param {Object} options
 * @param {ReturnType<typeof import("../auth/accessTokens").createAccessTokens>} options.accessTokens
 * @param {ReturnType<typeof import("../auth/sessionRepository").createSessionRepository>} options.sessions
 * @param {{ consume(key: string): Promise<{ allowed: boolean }> } | null} [options.limiter]
 *   connection attempts per account, in PostgreSQL
 */
function createSocketAuth({ accessTokens, sessions, limiter = null, logger = console }) {
  return async function authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || token.length === 0) {
        next(connectionRefusal("AUTH_REQUIRED"));
        return;
      }

      // No I/O: a forged or expired token costs nothing.
      const verified = accessTokens.verify(token);
      if (!verified.valid) {
        if (verified.reason !== "expired") {
          logger.warn?.("[realtime] Handshake token rejected.", { reason: verified.reason });
        }
        next(connectionRefusal("AUTH_REQUIRED"));
        return;
      }
      const { userId, sessionId, tokenVersion } = verified.claims;

      if (limiter && !(await limiter.consume(`user:${userId}`)).allowed) {
        next(connectionRefusal("RATE_LIMITED"));
        return;
      }

      const user = await sessions.findSessionUser({ userId, sessionId });
      if (!user || user.tokenVersion !== tokenVersion || user.status !== "active") {
        next(connectionRefusal("SESSION_ENDED"));
        return;
      }

      // A recovered connection carries the state of the one it replaces. It
      // may only be taken over by the same account.
      if (socket.recovered && socket.data.userId && socket.data.userId !== userId) {
        logger.warn?.("[realtime] Recovered connection presented another account's token.");
        next(connectionRefusal("AUTH_REQUIRED"));
        return;
      }

      socket.data.userId = userId;
      socket.data.sessionId = sessionId;
      socket.data.tokenVersion = tokenVersion;
      socket.data.displayName = user.displayName;
      socket.data.emailVerified = Boolean(user.emailVerifiedAt);
      next();
    } catch (error) {
      logger.error?.("[realtime] Handshake check failed.", { message: error?.message });
      next(connectionRefusal("UNAVAILABLE"));
    }
  };
}

module.exports = {
  createSocketAuth,
};
