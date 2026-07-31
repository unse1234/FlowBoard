const { SOCKET_EVENTS } = require("./socketEvents");
const { validateOperation } = require("../operations/operationValidator");

function registerBoardGateway(io, { operationStore, logger = console }) {
  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.BOARD_JOIN, (payload, acknowledge) => {
      const boardId = sanitizeBoardId(payload?.boardId);
      const user = payload?.user ?? {};

      if (!boardId) {
        acknowledge?.({ ok: false, error: "boardId is required." });
        return;
      }

      socket.data.boardId = boardId;
      socket.data.user = user;
      socket.join(getBoardRoom(boardId));

      acknowledge?.({
        ok: true,
        boardId,
        replayedOperationCount: operationStore.list(boardId).length,
      });

      for (const operation of operationStore.list(boardId)) {
        socket.emit(SOCKET_EVENTS.BOARD_EVENT, {
          operation,
          replay: true,
          serverTimestamp: Date.now(),
        });
      }

      logger.info?.(`Socket ${socket.id} joined board ${boardId}.`);
    });

    socket.on(SOCKET_EVENTS.BOARD_LEAVE, (payload, acknowledge) => {
      const boardId = sanitizeBoardId(payload?.boardId ?? socket.data.boardId);
      if (boardId) {
        broadcastOfflinePresence(socket, boardId);
        socket.leave(getBoardRoom(boardId));
      }
      socket.data.boardId = null;

      acknowledge?.({ ok: true });
    });

    socket.on(SOCKET_EVENTS.BOARD_EVENT, (payload, acknowledge) => {
      const operation = payload?.operation;
      const validation = validateOperation(operation);

      if (!validation.valid) {
        acknowledge?.({ ok: false, error: validation.reason });
        return;
      }

      if (operation.boardId !== socket.data.boardId) {
        acknowledge?.({ ok: false, error: "Socket has not joined this board." });
        return;
      }

      const result = operationStore.add(operation);
      acknowledge?.({
        ok: true,
        duplicate: result.duplicate,
        operationId: operation.operationId,
      });

      if (result.duplicate) return;

      socket.to(getBoardRoom(operation.boardId)).emit(SOCKET_EVENTS.BOARD_EVENT, {
        operation,
        serverTimestamp: Date.now(),
      });
    });

    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, (payload, acknowledge) => {
      const boardId = sanitizeBoardId(payload?.boardId);

      if (!boardId || boardId !== socket.data.boardId) {
        acknowledge?.({ ok: false, error: "Socket has not joined this board." });
        return;
      }

      const user = payload?.user ?? socket.data.user ?? {};

      socket.to(getBoardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
        boardId,
        userId: user.id ?? socket.handshake.auth?.userId ?? socket.id,
        username: user.username ?? "Guest",
        color: user.color,
        presence: payload?.presence ?? {},
        serverTimestamp: Date.now(),
      });

      acknowledge?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const boardId = sanitizeBoardId(socket.data.boardId);
      if (!boardId) return;

      broadcastOfflinePresence(socket, boardId);
    });
  });
}

function broadcastOfflinePresence(socket, boardId) {
  const user = socket.data.user ?? {};

  socket.to(getBoardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
    boardId,
    userId: user.id ?? socket.handshake.auth?.userId ?? socket.id,
    username: user.username ?? "Guest",
    color: user.color,
    presence: {
      status: "offline",
    },
    serverTimestamp: Date.now(),
  });
}

function getBoardRoom(boardId) {
  return `board:${boardId}`;
}

function sanitizeBoardId(boardId) {
  if (!boardId || typeof boardId !== "string") return null;

  return boardId.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || null;
}

module.exports = {
  registerBoardGateway,
};
