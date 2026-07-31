const { SOCKET_EVENTS } = require("./socketEvents");

function registerVoiceGateway(io, { logger = console }) {
  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.VOICE_JOIN, async (payload, acknowledge) => {
      const roomId = sanitizeBoardId(payload?.roomId);
      const user = {
        id: payload?.userId ?? socket.id,
        username: payload?.username ?? "Guest",
      };

      if (!roomId) {
        acknowledge?.({ ok: false, error: "roomId is required." });
        return;
      }

      const voiceRoom = getVoiceRoom(roomId);
      const existingSockets = await io.in(voiceRoom).fetchSockets();

      for (const existingSocket of existingSockets) {
        const existingUser = existingSocket.data.voiceUser;
        if (!existingUser || existingUser.id === user.id) continue;

        socket.emit(SOCKET_EVENTS.VOICE_JOIN, {
          roomId,
          userId: existingUser.id,
          username: existingUser.username,
        });
      }

      socket.data.voiceRoomId = roomId;
      socket.data.voiceUser = user;
      socket.join(voiceRoom);

      acknowledge?.({ ok: true, roomId });
      socket.to(voiceRoom).emit(SOCKET_EVENTS.VOICE_JOIN, {
        roomId,
        userId: user.id,
        username: user.username,
      });
      logger.info?.(`Socket ${socket.id} joined voice room ${roomId}.`);
    });

    socket.on(SOCKET_EVENTS.VOICE_LEAVE, (payload, acknowledge) => {
      const roomId = sanitizeBoardId(
        payload?.roomId ?? socket.data.voiceRoomId,
      );
      const userId = payload?.userId ?? socket.data.voiceUser?.id ?? socket.id;

      if (roomId) {
        socket.to(getVoiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_LEAVE, {
          roomId,
          userId,
        });
        socket.leave(getVoiceRoom(roomId));
      }

      socket.data.voiceRoomId = null;
      socket.data.voiceUser = null;

      acknowledge?.({ ok: true });
    });

    socket.on(SOCKET_EVENTS.VOICE_OFFER, (payload, acknowledge) => {
      const roomId = sanitizeBoardId(payload?.roomId);
      const targetId = payload?.targetId;
      const senderId = payload?.userId ?? socket.id;

      if (!roomId || !targetId) {
        acknowledge?.({
          ok: false,
          error: "roomId and targetId are required.",
        });
        return;
      }

      socket.to(getVoiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_OFFER, {
        roomId,
        userId: senderId,
        targetId,
        offer: payload?.offer,
      });

      acknowledge?.({ ok: true });
    });

    socket.on(SOCKET_EVENTS.VOICE_ANSWER, (payload, acknowledge) => {
      const roomId = sanitizeBoardId(payload?.roomId);
      const targetId = payload?.targetId;
      const senderId = payload?.userId ?? socket.id;

      if (!roomId || !targetId) {
        acknowledge?.({
          ok: false,
          error: "roomId and targetId are required.",
        });
        return;
      }

      socket.to(getVoiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_ANSWER, {
        roomId,
        userId: senderId,
        targetId,
        answer: payload?.answer,
      });

      acknowledge?.({ ok: true });
    });

    socket.on(SOCKET_EVENTS.VOICE_ICE, (payload, acknowledge) => {
      const roomId = sanitizeBoardId(payload?.roomId);
      const targetId = payload?.targetId;
      const senderId = payload?.userId ?? socket.id;

      if (!roomId || !targetId || !payload?.candidate) {
        acknowledge?.({
          ok: false,
          error: "roomId, targetId and candidate are required.",
        });
        return;
      }

      socket.to(getVoiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_ICE, {
        roomId,
        userId: senderId,
        targetId,
        candidate: payload.candidate,
      });

      acknowledge?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const roomId = sanitizeBoardId(socket.data.voiceRoomId);
      if (!roomId) return;

      socket.to(getVoiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_LEAVE, {
        roomId,
        userId: socket.data.voiceUser?.id ?? socket.id,
      });
    });
  });
}

function getVoiceRoom(roomId) {
  return `voice:${roomId}`;
}

function sanitizeBoardId(boardId) {
  if (!boardId || typeof boardId !== "string") return null;

  return boardId.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || null;
}

module.exports = {
  registerVoiceGateway,
};
