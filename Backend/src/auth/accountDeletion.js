const { createBoardRepository } = require("../boards/boardRepository");
const { AuthError } = require("./authErrors");
const { createUserRepository } = require("./userRepository");

/**
 * Deleting an account (spec Phase B, E-22, E-24), on the /api/auth router:
 *
 * - `GET  /delete-account`  what deletion would do: the shared boards that
 *                           must be handed over or deleted first, how many
 *                           private boards go with the account, and which
 *                           proof of identity it will ask for
 * - `POST /delete-account`  do it
 *
 * Deletion is immediate and final (E-24). One transaction removes the
 * account row, and the database takes everything that hangs off it:
 * sessions and their refresh tokens, email tokens, board memberships,
 * provider identities. The account's own boards are deleted first, and only
 * if none of them still has other people on it: a board with collaborators
 * is never deleted out from under them, never reassigned by guesswork, and
 * never left ownerless (E-22). `boards.owner_id ON DELETE RESTRICT` makes the
 * last of those true even if this code were wrong.
 *
 * Then, after the commit: every socket of the account is closed, every board
 * it was a member of re-checks its sockets, the refresh cookie is cleared,
 * and a notice goes to the address the account had.
 */

/** Typed exactly, so a stray click or an autofilled field cannot delete an account. */
const DELETE_CONFIRMATION = "DELETE";

function registerAccountDeletion(
  router,
  { kit, database, requireAuth, refreshCookie, emailService, accountEvents, proveCurrentPassword, signInLimiter, sessionLimiter, logger },
) {
  const users = createUserRepository({ database });
  const boards = createBoardRepository({ database });

  router.get("/delete-account", requireAuth, async (request, response) => {
    try {
      await kit.enforceLimit(sessionLimiter, request);
      const user = await kit.requireLiveSession(request);
      const owned = await boards.listOwnedBoards(user.id);
      // Everyone on every board this account owns, in one query (rule 22).
      const members = await boards.listMembersOfOwnedBoards(user.id);

      const shared = owned
        .filter((board) => board.memberCount > 0)
        .map((board) => ({
          id: board.id,
          title: board.title,
          members: members
            .filter((member) => member.boardId === board.id)
            .map((member) => ({ id: member.id, displayName: member.displayName, role: member.role })),
        }));

      response.set("Cache-Control", "no-store");
      response.json({
        ok: true,
        sharedBoards: shared,
        privateBoardCount: owned.length - shared.length,
        proof: user.hasPassword ? "password" : "provider",
      });
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });

  router.post("/delete-account", requireAuth, async (request, response) => {
    try {
      // A password may be checked: limited like sign-in.
      await kit.enforceLimit(signInLimiter, request);
      const session = await kit.requireLiveSession(request);

      if (request.body?.confirmation !== DELETE_CONFIRMATION) {
        throw new AuthError("DELETE_CONFIRMATION_REQUIRED");
      }

      // A fresh proof of identity, whatever the session: the password, or a
      // provider sign-in in the last few minutes (migration 0007).
      const account = await users.findById(session.id);
      if (!account) throw new AuthError("AUTHENTICATION_REQUIRED", { detail: "account gone" });
      if (account.passwordHash) {
        await proveCurrentPassword(account, request.body?.password);
      } else if (!session.recentlyReauthenticated) {
        throw new AuthError("REAUTHENTICATION_REQUIRED", { detail: "delete without a recent sign-in" });
      }

      const result = await database.transaction(async (tx) => {
        // Lock the account's boards: an invitation accepted meanwhile waits,
        // and then finds the board gone, rather than joining one about to be.
        await tx.query("SELECT id FROM boards WHERE owner_id = $1 FOR UPDATE", [account.id]);
        const owned = await boards.listOwnedBoards(account.id, tx);
        const stillShared = owned.filter((board) => board.memberCount > 0);
        if (stillShared.length > 0) {
          throw new AuthError("ACCOUNT_HAS_SHARED_BOARDS", { detail: `${stillShared.length} shared boards` });
        }

        const memberOf = await boards.listMemberBoardIds(account.id, tx);
        for (const board of owned) await boards.deleteBoard(board.id, tx);
        await tx.query("DELETE FROM users WHERE id = $1", [account.id]);

        return { deletedBoardIds: owned.map((board) => board.id), memberOf };
      });

      logger.info?.("[auth] Account deleted.", {
        userId: account.id,
        boardsDeleted: result.deletedBoardIds.length,
        membershipsRemoved: result.memberOf.length,
      });

      accountEvents.publish({ type: "account-deleted", userId: account.id });
      for (const boardId of [...result.deletedBoardIds, ...result.memberOf]) {
        accountEvents.publish({ type: "board-access-changed", boardId });
      }

      emailService.inBackground("account-deleted", () =>
        emailService.sendAccountDeletedNotification({
          user: { id: account.id, email: account.email, displayName: account.displayName },
        }),
      );

      refreshCookie.clear(response);
      response.json({ ok: true });
    } catch (error) {
      kit.sendAuthenticatedRouteError(response, error);
    }
  });
}

module.exports = {
  DELETE_CONFIRMATION,
  registerAccountDeletion,
};
