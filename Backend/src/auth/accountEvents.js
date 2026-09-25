/**
 * Things that happened to an account or a board which other parts of this
 * process must act on at once, above all the realtime gateway. A socket
 * authenticated before a sign-out, a password reset or a removal from a board
 * must not keep working until it happens to reconnect (Phase D).
 *
 * In-process only. The realtime layer is single-instance today (its operation
 * log is in memory too), so every socket that needs telling is in this
 * process. Running several instances needs a shared channel here, such as
 * Postgres LISTEN/NOTIFY or the Socket.IO Redis adapter; ADR 0003 and
 * ARCHITECTURE.md record that.
 *
 * Event types:
 * - `sessions-ended` { userId, sessionIds }: sign-out, a session ended from
 *   the device list, "sign out everywhere else", a password reset or change.
 * - `account-deleted` { userId }
 * - `board-access-changed` { boardId, userId }: removed, role changed, or
 *   the board deleted or handed to someone else. Listeners re-read the
 *   database rather than trusting the event's claims.
 * - `account-verified` { userId }
 */
function createAccountEvents({ logger = console } = {}) {
  const listeners = new Set();

  return {
    /**
     * Tell every listener. A listener that throws is logged and skipped: the
     * request that caused the event has already committed and must not fail.
     */
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error?.("[events] A listener failed.", { type: event?.type, message: error?.message });
        }
      }
    },

    /** @returns {() => void} unsubscribe */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

module.exports = {
  createAccountEvents,
};
