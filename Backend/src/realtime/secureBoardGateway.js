const { BOARD_ACTIONS, roleAllows } = require("../boards/boardAccess");
const { isUuid } = require("../boards/boardRequest");
const { validateOperation } = require("../operations/operationValidator");
const { refusal } = require("./realtimeErrors");
const { SOCKET_EVENTS } = require("./socketEvents");
const { createTokenBucket } = require("./tokenBucket");

/**
 * The board gateway for authenticated sockets (Phase D, E-21), used whenever
 * a database is configured. `boardGateway.js` remains only for a server
 * without one, where no identity exists at all.
 *
 * - **Identity** comes from `socket.data`, set by `socketAuth.js`. A payload's
 *   `userId` or `user` is ignored, and every stored or relayed operation has
 *   its `userId` replaced with the socket's (finding F-2).
 * - **Joining** a board is authorised against the database before the socket
 *   enters the room or sees one operation (rule 15). The room is transport;
 *   the database decides.
 * - **Changing** a board needs a role that allows editing. The role is
 *   re-read from the database at least every `recheckMs`, and at once when
 *   access changes (`revokeBoardAccess`), so a removed or downgraded member
 *   stops being able to edit without reconnecting.
 * - **Limits** are per socket, and differ by kind: joins are rare, edits
 *   bursty, cursors frequent but disposable.
 * - Each socket's board events are handled in order, one at a time, so an
 *   access check that waits on the database cannot reorder its operations.
 *
 * Rooms: `user:<userId>` for everything about an account, `board:<boardId>`
 * for a board's traffic.
 */

const DEFAULT_LIMITS = Object.freeze({
  join: { capacity: 10, refillPerSecond: 0.5 },
  mutation: { capacity: 150, refillPerSecond: 50 },
  presence: { capacity: 30, refillPerSecond: 25 },
});

/** How stale a socket's cached role may get before an edit re-reads it. */
const DEFAULT_RECHECK_MS = 30_000;

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MAX_CURSOR_COORDINATE = 1e7;

/**
 * @param {import("socket.io").Server} io
 * @param {Object} options
 * @param {import("../operations/operationStore").OperationStore} options.operationStore
 * @param {ReturnType<typeof import("./boardAuthorizer").createBoardAuthorizer>} options.authorizer
 */
function registerSecureBoardGateway(
  io,
  {
    operationStore,
    authorizer,
    limits = DEFAULT_LIMITS,
    recheckMs = DEFAULT_RECHECK_MS,
    now = () => Date.now(),
    logger = console,
  },
) {
  /** Take the socket off its board: the room, the cached role, and a goodbye to peers. */
  function leaveBoard(socket) {
    const boardId = socket.data.boardId;
    if (!boardId) return;

    socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, offlinePresence(socket, boardId));
    socket.leave(boardRoom(boardId));
    socket.data.boardId = null;
    socket.data.role = null;
    socket.data.checkedAt = 0;
  }

  /**
   * Re-read the socket's access to its board, and act on the answer: keep the
   * role current, or remove the socket from the board and say why. Returns
   * whether it may still be there.
   */
  async function reauthorize(socket) {
    const boardId = socket.data.boardId;
    if (!boardId) return false;

    const result = await authorizer.check(socket, boardId, BOARD_ACTIONS.VIEW);
    // The socket may have left or moved on while the check ran.
    if (socket.data.boardId !== boardId) return false;

    if (!result.allowed) {
      leaveBoard(socket);
      socket.emit(SOCKET_EVENTS.BOARD_ACCESS_REVOKED, { boardId, code: result.code });
      if (result.code === "SESSION_ENDED") endSocket(socket, "session-ended");
      return false;
    }

    if (result.role !== socket.data.role) {
      socket.data.role = result.role;
      socket.emit(SOCKET_EVENTS.BOARD_ROLE_CHANGED, { boardId, role: result.role });
    }
    socket.data.checkedAt = now();
    return true;
  }

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.userId));

    const buckets = {
      join: createTokenBucket({ ...limits.join, now }),
      mutation: createTokenBucket({ ...limits.mutation, now }),
      presence: createTokenBucket({ ...limits.presence, now }),
    };

    // Board events run one at a time per socket, in arrival order.
    let queue = Promise.resolve();
    const inOrder = (handler) => (payload, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      queue = queue
        .then(() => handler(payload, reply))
        .catch((error) => {
          logger.error?.("[realtime] Board event failed.", { message: error?.message });
          reply(refusal("UNAVAILABLE"));
        });
    };

    // A recovered connection is back in its rooms without having asked. Its
    // access may have changed while it was away, so it is checked again now.
    if (socket.recovered && socket.data.boardId) {
      queue = queue.then(() => reauthorize(socket)).catch(() => leaveBoard(socket));
    }

    socket.on(
      SOCKET_EVENTS.BOARD_JOIN,
      inOrder(async (payload, reply) => {
        if (!buckets.join.take()) return reply(refusal("RATE_LIMITED"));

        const boardId = payload?.boardId;
        if (!isUuid(boardId)) return reply(refusal("BOARD_NOT_FOUND"));

        const result = await authorizer.check(socket, boardId, BOARD_ACTIONS.VIEW);
        if (!result.allowed) {
          if (result.code === "SESSION_ENDED") {
            reply(refusal("SESSION_ENDED"));
            endSocket(socket, "session-ended");
            return undefined;
          }
          return reply(refusal(result.code));
        }

        if (socket.data.boardId && socket.data.boardId !== boardId) leaveBoard(socket);
        socket.data.boardId = boardId;
        socket.data.role = result.role;
        socket.data.checkedAt = now();
        socket.join(boardRoom(boardId));

        const operations = operationStore.list(boardId);
        reply({ ok: true, boardId, role: result.role, replayedOperationCount: operations.length });
        for (const operation of operations) {
          socket.emit(SOCKET_EVENTS.BOARD_EVENT, { operation, replay: true, serverTimestamp: now() });
        }
        logger.info?.("[realtime] Joined a board.", { boardId, userId: socket.data.userId, role: result.role });
        return undefined;
      }),
    );

    socket.on(
      SOCKET_EVENTS.BOARD_LEAVE,
      inOrder(async (_payload, reply) => {
        leaveBoard(socket);
        reply({ ok: true });
      }),
    );

    socket.on(
      SOCKET_EVENTS.BOARD_EVENT,
      inOrder(async (payload, reply) => {
        if (!buckets.mutation.take()) return reply(refusal("RATE_LIMITED"));

        const operation = payload?.operation;
        const validation = validateOperation(operation);
        if (!validation.valid) return reply(refusal("INVALID_PAYLOAD", validation.reason));

        const boardId = socket.data.boardId;
        if (!boardId || operation.boardId !== boardId) return reply(refusal("NOT_JOINED"));

        if (now() - socket.data.checkedAt >= recheckMs && !(await reauthorize(socket))) {
          return reply(refusal("BOARD_NOT_FOUND"));
        }
        if (!roleAllows(socket.data.role, BOARD_ACTIONS.EDIT)) return reply(refusal("EDIT_FORBIDDEN"));

        // Who made it is the server's to say (F-2).
        const trusted = { ...operation, userId: socket.data.userId };
        const result = operationStore.add(trusted);
        reply({ ok: true, duplicate: result.duplicate, operationId: trusted.operationId });
        if (result.duplicate) return undefined;

        socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.BOARD_EVENT, { operation: trusted, serverTimestamp: now() });
        return undefined;
      }),
    );

    // Not queued: a cursor is worth nothing late, and the room membership
    // checked here is removed at once when access is withdrawn.
    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, (payload, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      if (!buckets.presence.take()) return reply(refusal("RATE_LIMITED"));

      const boardId = socket.data.boardId;
      if (!boardId || payload?.boardId !== boardId) return reply(refusal("NOT_JOINED"));

      socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
        boardId,
        userId: socket.data.userId,
        username: socket.data.displayName,
        color: readColor(payload?.user?.color ?? payload?.presence?.color),
        presence: readPresence(payload?.presence),
        serverTimestamp: now(),
      });
      return reply({ ok: true });
    });

    socket.on("disconnect", () => {
      const boardId = socket.data.boardId;
      if (boardId) socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, offlinePresence(socket, boardId));
    });
  });

  return {
    /**
     * Access to a board changed (a member removed or re-roled, the board
     * deleted or handed over). Every socket on it is checked again now.
     */
    async revokeBoardAccess(boardId) {
      const sockets = await io.in(boardRoom(boardId)).fetchSockets();
      await Promise.all(
        sockets.map((remote) => {
          const socket = io.sockets.sockets.get(remote.id);
          return socket ? reauthorize(socket).catch(() => leaveBoard(socket)) : undefined;
        }),
      );
      // A deleted board's history has nobody left to serve.
      if (!(await authorizer.boardExists(boardId))) operationStore.remove(boardId);
    },

    /**
     * Close the sockets of sessions that ended: a sign-out, a device removed
     * from the list, a password reset or change, a replayed refresh token.
     */
    async endSessions(userId, sessionIds) {
      const ended = new Set(sessionIds);
      for (const remote of await io.in(userRoom(userId)).fetchSockets()) {
        const socket = io.sockets.sockets.get(remote.id);
        if (socket && ended.has(socket.data.sessionId)) endSocket(socket, "session-ended", leaveBoard);
      }
    },

    /** Close every socket of an account that no longer exists. */
    async endAccount(userId) {
      for (const remote of await io.in(userRoom(userId)).fetchSockets()) {
        const socket = io.sockets.sockets.get(remote.id);
        if (socket) endSocket(socket, "account-deleted", leaveBoard);
      }
    },

    /** The account's name changed: presence shows the new one from now on. */
    async refreshAccount(userId, { displayName }) {
      for (const remote of await io.in(userRoom(userId)).fetchSockets()) {
        const socket = io.sockets.sockets.get(remote.id);
        if (socket && displayName) socket.data.displayName = displayName;
      }
    },
  };
}

/** Tell the client why, then close. It must authenticate again to come back. */
function endSocket(socket, reason, beforeClose = () => {}) {
  beforeClose(socket);
  socket.emit(SOCKET_EVENTS.SESSION_ENDED, { reason });
  socket.disconnect(true);
}

function offlinePresence(socket, boardId) {
  return {
    boardId,
    userId: socket.data.userId,
    username: socket.data.displayName,
    presence: { status: "offline" },
    serverTimestamp: Date.now(),
  };
}

/** Only what presence is for: a status and a cursor. Anything else is dropped. */
function readPresence(presence) {
  const clean = {};
  if (presence?.status === "online" || presence?.status === "offline") clean.status = presence.status;

  const cursor = presence?.cursor;
  if (
    cursor &&
    Number.isFinite(cursor.x) &&
    Number.isFinite(cursor.y) &&
    Math.abs(cursor.x) <= MAX_CURSOR_COORDINATE &&
    Math.abs(cursor.y) <= MAX_CURSOR_COORDINATE
  ) {
    clean.cursor = { x: cursor.x, y: cursor.y };
  }
  return clean;
}

function readColor(color) {
  return typeof color === "string" && COLOR_PATTERN.test(color) ? color : undefined;
}

function boardRoom(boardId) {
  return `board:${boardId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

module.exports = {
  DEFAULT_LIMITS,
  DEFAULT_RECHECK_MS,
  boardRoom,
  registerSecureBoardGateway,
  userRoom,
};
