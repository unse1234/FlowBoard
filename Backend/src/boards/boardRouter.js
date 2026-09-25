const express = require("express");
const { createRequireAuth, setBearerChallenge } = require("../auth/authenticate");
const { generateOpaqueToken, hashOpaqueToken, isOpaqueToken } = require("../auth/opaqueTokens");
const { createLiveSessionCheck } = require("../auth/routeKit");
const { createSessionRepository } = require("../auth/sessionRepository");
const { BOARD_ACTIONS, requireBoardAction, requireVerified } = require("./boardAccess");
const { BOARD_LIMITS, BoardError, toApiError } = require("./boardErrors");
const { createBoardRepository } = require("./boardRepository");
const { isUuid, parseBoardTitle, parseInviteOptions, parseMemberRole } = require("./boardRequest");

/**
 * The board and invitation API (spec Phase C, E-21, ADR 0008):
 *
 *   GET    /api/boards                            boards I own or am on
 *   POST   /api/boards                            create a private board
 *   GET    /api/boards/:id                        a board, its owner and members
 *   PATCH  /api/boards/:id                        rename                (owner)
 *   DELETE /api/boards/:id                        delete                (owner)
 *   PATCH  /api/boards/:id/members/:userId        change a role         (owner, verified)
 *   DELETE /api/boards/:id/members/:userId        remove, or leave      (owner or self)
 *   POST   /api/boards/:id/transfer               hand the board over   (owner, verified)
 *   GET    /api/boards/:id/invites                open invitations      (owner, verified)
 *   POST   /api/boards/:id/invites                invite                (owner, verified)
 *   DELETE /api/boards/:id/invites/:inviteId      withdraw              (owner, verified)
 *   POST   /api/invites/preview                   what an invitation is for
 *   POST   /api/invites/accept                    join                  (verified)
 *
 * Bearer tokens only, never a cookie, so no route here is a CSRF target and
 * the web app calls it directly, like the AI endpoint. Every request re-checks
 * the session against the database: board access must not outlive a sign-out,
 * a password change or a deleted account. Invitation tokens travel in request
 * bodies, never in a URL that a log would keep.
 *
 * Every change to who may reach a board publishes `board-access-changed`, and
 * the realtime gateway re-checks the sockets in that board's room at once.
 */
function createBoardRouters({ database, accessTokens, accountEvents, limiter = null, appUrl = null, logger = console }) {
  const boards = createBoardRepository({ database });
  const requireAuth = createRequireAuth({ accessTokens, logger });
  const requireLiveSession = createLiveSessionCheck({ sessions: createSessionRepository({ database }) });

  /**
   * Authenticate, check the session is live, and count the request against
   * this account's allowance. Every route below starts here.
   */
  async function begin(request) {
    const user = await requireLiveSession(request);
    if (limiter) {
      const limit = await limiter.consume(`user:${user.id}`);
      if (!limit.allowed) {
        throw new BoardError("TOO_MANY_ATTEMPTS", {
          retryAfterSeconds: limit.retryAfterSeconds,
          detail: "board API limit",
        });
      }
    }
    return user;
  }

  /** The caller's access to the board in the path, checked for `action`. */
  async function authorize(request, user, action) {
    const { boardId } = request.params;
    const access = isUuid(boardId) ? await boards.findAccess({ boardId, userId: user.id }) : null;
    requireBoardAction(access, action);
    return access;
  }

  const changed = (boardId) => accountEvents.publish({ type: "board-access-changed", boardId });

  /** Each route answers its own failures, in the envelope, with nothing diagnostic sent. */
  const handle = (route) => async (request, response) => {
    try {
      await route(request, response);
    } catch (error) {
      sendError(response, error, logger);
    }
  };

  const boardsRouter = express.Router();
  boardsRouter.use(requireAuth);

  boardsRouter.get(
    "/",
    handle(async (request, response) => {
      const user = await begin(request);
      const list = await boards.listBoardsForUser(user.id);
      response.set("Cache-Control", "no-store");
      response.json({ ok: true, boards: list.map(boardSummary) });
    }),
  );

  // A private board: working alone needs no confirmed address (E-20).
  boardsRouter.post(
    "/",
    handle(async (request, response) => {
      const user = await begin(request);
      const title = parseBoardTitle(request.body?.title, { optional: true });

      if ((await boards.countOwnedBoards(user.id)) >= BOARD_LIMITS.OWNED_BOARDS) {
        throw new BoardError("BOARD_LIMIT_REACHED");
      }

      const board = await boards.createBoard({ ownerId: user.id, title });
      logger.info?.("[boards] Board created.", { boardId: board.id, userId: user.id });
      response.status(201).json({
        ok: true,
        board: boardSummary({ ...board, role: "owner", ownerName: user.displayName, memberCount: 0 }),
      });
    }),
  );

  boardsRouter.get(
    "/:boardId",
    handle(async (request, response) => {
      const user = await begin(request);
      const access = await authorize(request, user, BOARD_ACTIONS.VIEW);
      const detail = await boards.getBoardDetail(access.boardId);
      if (!detail) throw new BoardError("BOARD_NOT_FOUND", { detail: "deleted meanwhile" });

      // Addresses are the owner's to see, to tell collaborators apart. Other
      // members see names only.
      const isOwner = access.role === "owner";
      response.set("Cache-Control", "no-store");
      response.json({
        ok: true,
        board: {
          ...boardSummary({ ...detail, role: access.role, ownerName: detail.owner.displayName, memberCount: detail.members.length }),
          owner: { id: detail.owner.id, displayName: detail.owner.displayName, ...(isOwner ? { email: detail.owner.email } : {}) },
          members: detail.members.map((member) => ({
            id: member.id,
            displayName: member.displayName,
            role: member.role,
            joinedAt: member.joinedAt,
            ...(isOwner ? { email: member.email } : {}),
          })),
        },
      });
    }),
  );

  boardsRouter.patch(
    "/:boardId",
    handle(async (request, response) => {
      const user = await begin(request);
      const access = await authorize(request, user, BOARD_ACTIONS.MANAGE);
      const board = await boards.renameBoard({ boardId: access.boardId, title: parseBoardTitle(request.body?.title) });
      if (!board) throw new BoardError("BOARD_NOT_FOUND", { detail: "deleted meanwhile" });
      response.json({ ok: true, board: { id: board.id, title: board.title, updatedAt: board.updatedAt } });
    }),
  );

  boardsRouter.delete(
    "/:boardId",
    handle(async (request, response) => {
      const user = await begin(request);
      const access = await authorize(request, user, BOARD_ACTIONS.MANAGE);
      await boards.deleteBoard(access.boardId);
      logger.info?.("[boards] Board deleted.", { boardId: access.boardId, userId: user.id });
      changed(access.boardId);
      response.json({ ok: true });
    }),
  );

  boardsRouter.patch(
    "/:boardId/members/:userId",
    handle(async (request, response) => {
      const user = await begin(request);
      requireVerified(user);
      const access = await authorize(request, user, BOARD_ACTIONS.MANAGE);
      const role = parseMemberRole(request.body?.role);

      const { userId } = request.params;
      if (!isUuid(userId) || !(await boards.setMemberRole({ boardId: access.boardId, userId, role }))) {
        throw new BoardError("MEMBER_NOT_FOUND");
      }
      logger.info?.("[boards] Role changed.", { boardId: access.boardId, memberId: userId, role });
      changed(access.boardId);
      response.json({ ok: true });
    }),
  );

  // The owner removes someone, or a member removes themselves ("leave").
  boardsRouter.delete(
    "/:boardId/members/:userId",
    handle(async (request, response) => {
      const user = await begin(request);
      const { userId } = request.params;
      const leaving = userId === user.id;
      const access = await authorize(request, user, leaving ? BOARD_ACTIONS.VIEW : BOARD_ACTIONS.MANAGE);
      if (!leaving) requireVerified(user);

      if (!isUuid(userId) || !(await boards.removeMember({ boardId: access.boardId, userId }))) {
        // The owner "leaving" lands here too: ownership moves only by transfer.
        throw new BoardError("MEMBER_NOT_FOUND");
      }
      logger.info?.(leaving ? "[boards] Left a board." : "[boards] Member removed.", {
        boardId: access.boardId,
        memberId: userId,
      });
      changed(access.boardId);
      response.json({ ok: true });
    }),
  );

  boardsRouter.post(
    "/:boardId/transfer",
    handle(async (request, response) => {
      const user = await begin(request);
      requireVerified(user);
      const access = await authorize(request, user, BOARD_ACTIONS.MANAGE);
      const toUserId = request.body?.userId;
      if (!isUuid(toUserId)) throw new BoardError("TRANSFER_TARGET_INVALID");

      const moved = await database.transaction((tx) =>
        boards.transferOwnership(
          { boardId: access.boardId, fromUserId: user.id, toUserId, keepPreviousOwnerAs: "editor" },
          tx,
        ),
      );
      if (!moved) throw new BoardError("TRANSFER_TARGET_INVALID", { detail: "not a member, or owner changed" });

      logger.info?.("[boards] Ownership handed over.", { boardId: access.boardId, from: user.id, to: toUserId });
      changed(access.boardId);
      response.json({ ok: true });
    }),
  );

  boardsRouter.get(
    "/:boardId/invites",
    handle(async (request, response) => {
      const user = await begin(request);
      requireVerified(user);
      const access = await authorize(request, user, BOARD_ACTIONS.MANAGE);
      response.set("Cache-Control", "no-store");
      response.json({ ok: true, invites: await boards.listLiveInvites(access.boardId) });
    }),
  );

  /**
   * Make an invitation. The token is in this response and nowhere else: the
   * database keeps only its digest, so a lost link is replaced, not recovered.
   */
  boardsRouter.post(
    "/:boardId/invites",
    handle(async (request, response) => {
      const user = await begin(request);
      requireVerified(user);
      const access = await authorize(request, user, BOARD_ACTIONS.MANAGE);
      const options = parseInviteOptions(request.body ?? {});

      if ((await boards.countLiveInvites(access.boardId)) >= BOARD_LIMITS.LIVE_INVITES_PER_BOARD) {
        throw new BoardError("INVITE_LIMIT_REACHED");
      }

      const token = generateOpaqueToken();
      const invite = await boards.createInvite({
        boardId: access.boardId,
        createdBy: user.id,
        tokenHash: token.hash,
        ...options,
      });
      logger.info?.("[boards] Invitation created.", { boardId: access.boardId, inviteId: invite.id, role: invite.role });

      response.set("Cache-Control", "no-store");
      response.status(201).json({
        ok: true,
        invite,
        token: token.token,
        url: appUrl ? `${appUrl}/invite/${token.token}` : null,
      });
    }),
  );

  boardsRouter.delete(
    "/:boardId/invites/:inviteId",
    handle(async (request, response) => {
      const user = await begin(request);
      requireVerified(user);
      const access = await authorize(request, user, BOARD_ACTIONS.MANAGE);
      const { inviteId } = request.params;
      if (isUuid(inviteId)) await boards.revokeInvite({ boardId: access.boardId, inviteId });
      // Idempotent: withdrawing one already gone is the same outcome.
      response.json({ ok: true });
    }),
  );

  const invitesRouter = express.Router();
  invitesRouter.use(requireAuth);

  /**
   * What an invitation is for, so the page can say "Ada invited you to
   * Roadmap" before anyone commits. Any signed-in account may ask, so an
   * unconfirmed one can be told to confirm first. Spends nothing.
   */
  invitesRouter.post(
    "/preview",
    handle(async (request, response) => {
      const user = await begin(request);
      const token = request.body?.token;
      const invite = isOpaqueToken(token) ? await boards.findLiveInvite(hashOpaqueToken(token)) : null;
      if (!invite) throw new BoardError("INVITE_INVALID");

      const access = await boards.findAccess({ boardId: invite.boardId, userId: user.id });
      response.set("Cache-Control", "no-store");
      response.json({
        ok: true,
        invite: {
          boardTitle: invite.title,
          invitedBy: invite.ownerName,
          role: invite.role,
          expiresAt: invite.expiresAt,
          // Already on it: the page can go straight there.
          boardId: access ? invite.boardId : null,
          currentRole: access?.role ?? null,
        },
      });
    }),
  );

  /**
   * Join a board. Needs a signed-in account with a confirmed address (E-20):
   * possessing the link is never enough on its own.
   */
  invitesRouter.post(
    "/accept",
    handle(async (request, response) => {
      const user = await begin(request);
      requireVerified(user);
      const token = request.body?.token;
      if (!isOpaqueToken(token)) throw new BoardError("INVITE_INVALID", { detail: "malformed token" });

      const result = await database.transaction((tx) =>
        boards.acceptInvite(
          { tokenHash: hashOpaqueToken(token), userId: user.id, memberLimit: BOARD_LIMITS.MEMBERS_PER_BOARD },
          tx,
        ),
      );
      if (result.outcome === "invalid") throw new BoardError("INVITE_INVALID");
      if (result.outcome === "full") throw new BoardError("MEMBER_LIMIT_REACHED");

      if (result.outcome === "joined") {
        logger.info?.("[boards] Joined a board.", { boardId: result.boardId, userId: user.id, role: result.role });
        changed(result.boardId);
      }
      response.json({
        ok: true,
        board: { id: result.boardId, title: result.title },
        role: result.role,
        joined: result.outcome === "joined",
      });
    }),
  );

  return { boardsRouter, invitesRouter };
}

function boardSummary(board) {
  return {
    id: board.id,
    title: board.title,
    role: board.role,
    ownerName: board.ownerName,
    memberCount: board.memberCount,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

function sendError(response, error, logger) {
  const apiError = toApiError(error);
  if (apiError.code === "AUTHENTICATION_REQUIRED") setBearerChallenge(response, "invalid_token");
  if (apiError.retryAfterSeconds) response.set("Retry-After", String(apiError.retryAfterSeconds));

  const entry = { code: apiError.code, status: apiError.status, detail: apiError.detail };
  if (apiError.code === "INTERNAL") logger.error?.("[boards] Request failed unexpectedly.", entry, apiError.cause);
  else if (apiError.status >= 500) logger.error?.("[boards] Request failed.", entry);
  else logger.warn?.("[boards] Request rejected.", entry);

  response.status(apiError.status).json(apiError.toResponseBody());
}

/** Body-parser failures in the same envelope, rather than Express's HTML page. */
function handleBoardRequestError(error, _request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error?.type === "entity.parse.failed") {
    response.status(400).json(new BoardError("INVALID_JSON").toResponseBody());
    return;
  }
  if (error?.type === "entity.too.large") {
    response.status(413).json(new BoardError("PAYLOAD_TOO_LARGE").toResponseBody());
    return;
  }
  next(error);
}

module.exports = {
  createBoardRouters,
  handleBoardRequestError,
};
