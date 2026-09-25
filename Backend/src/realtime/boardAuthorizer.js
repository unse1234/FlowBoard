const { BOARD_ACTIONS, roleAllows } = require("../boards/boardAccess");

/**
 * Whether a connected socket may use a board, decided from the database each
 * time it is asked (Phase D, E-21). The rules themselves are
 * `boards/boardAccess.js`, shared with the HTTP API.
 *
 * One answer covers everything that has to hold at once:
 * 1. the socket's session is still live (not signed out, not reset, the
 *    account not deleted) and its token_version current;
 * 2. the address is confirmed: every realtime board is collaboration (E-20);
 * 3. the account has a role on this board that allows the action.
 *
 * @returns {{ check(socket: import("socket.io").Socket, boardId: string, action: string):
 *   Promise<{ allowed: true, role: string } | { allowed: false, code: string }> }}
 */
function createBoardAuthorizer({ sessions, boards }) {
  return {
    async check(socket, boardId, action = BOARD_ACTIONS.VIEW) {
      const { userId, sessionId, tokenVersion } = socket.data;

      const user = await sessions.findSessionUser({ userId, sessionId });
      if (!user || user.tokenVersion !== tokenVersion || user.status !== "active") {
        return { allowed: false, code: "SESSION_ENDED" };
      }
      // Kept current for presence, which shows it to collaborators.
      socket.data.displayName = user.displayName;
      socket.data.emailVerified = Boolean(user.emailVerifiedAt);
      if (!user.emailVerifiedAt) return { allowed: false, code: "EMAIL_NOT_VERIFIED" };

      const access = await boards.findAccess({ boardId, userId });
      if (!access || !roleAllows(access.role, BOARD_ACTIONS.VIEW)) return { allowed: false, code: "BOARD_NOT_FOUND" };
      if (!roleAllows(access.role, action)) return { allowed: false, code: "EDIT_FORBIDDEN", role: access.role };

      return { allowed: true, role: access.role };
    },

    /** Whether the board still exists at all, for clearing a deleted one's history. */
    boardExists: (boardId) => boards.boardExists(boardId),
  };
}

module.exports = {
  createBoardAuthorizer,
};
