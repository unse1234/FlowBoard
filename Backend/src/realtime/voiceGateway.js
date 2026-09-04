const { SOCKET_EVENTS } = require("./socketEvents");

function registerVoiceGateway(io, { logger = console }) {
  // Tracks which socket currently represents a given user in a given voice
  // room, so 1:1 signaling (offer/answer/ICE) can be routed directly to that
  // socket instead of being broadcast to the whole room and filtered
  // client-side. Broadcasting SDP offers/answers and ICE candidates (which
  // can reveal local network addresses) to every participant is unnecessary
  // fan-out and leaks connection metadata to sockets they were never meant
  // for.
  const voiceSocketsByUser = new Map();

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
      voiceSocketsByUser.set(voiceUserKey(roomId, user.id), socket.id);

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
        removeVoiceSocket(voiceSocketsByUser, roomId, userId, socket.id);
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

      const targetSocketId = voiceSocketsByUser.get(
        voiceUserKey(roomId, targetId),
      );
      if (!targetSocketId) {
        acknowledge?.({
          ok: false,
          error: "Target participant is not in this voice room.",
        });
        return;
      }

      io.to(targetSocketId).emit(SOCKET_EVENTS.VOICE_OFFER, {
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

      const targetSocketId = voiceSocketsByUser.get(
        voiceUserKey(roomId, targetId),
      );
      if (!targetSocketId) {
        acknowledge?.({
          ok: false,
          error: "Target participant is not in this voice room.",
        });
        return;
      }

      io.to(targetSocketId).emit(SOCKET_EVENTS.VOICE_ANSWER, {
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

      const targetSocketId = voiceSocketsByUser.get(
        voiceUserKey(roomId, targetId),
      );
      if (!targetSocketId) {
        acknowledge?.({
          ok: false,
          error: "Target participant is not in this voice room.",
        });
        return;
      }

      io.to(targetSocketId).emit(SOCKET_EVENTS.VOICE_ICE, {
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

      const userId = socket.data.voiceUser?.id ?? socket.id;
      removeVoiceSocket(voiceSocketsByUser, roomId, userId, socket.id);

      socket.to(getVoiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_LEAVE, {
        roomId,
        userId,
      });
    });
  });
}

function voiceUserKey(roomId, userId) {
  return `${roomId}::${userId}`;
}

function removeVoiceSocket(map, roomId, userId, socketId) {
  const key = voiceUserKey(roomId, userId);
  if (map.get(key) === socketId) {
    map.delete(key);
  }
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
