const { BOARD_ACTIONS } = require("../boards/boardAccess");
const { isUuid } = require("../boards/boardRequest");
const { refusal } = require("./realtimeErrors");
const { SOCKET_EVENTS } = require("./socketEvents");
const { createTokenBucket } = require("./tokenBucket");

/**
 * Voice signalling for authenticated sockets (Phase D), used whenever a
 * database is configured; `voiceGateway.js` remains for a server without one.
 *
 * Voice is collaboration on a board, so its room is a board, and joining it
 * is authorised exactly like joining the board (`boardAuthorizer.js`: a live
 * session, a confirmed address, a role on the board). The web app opens voice
 * on a socket of its own, so this gateway checks for itself rather than
 * relying on the board socket's admission. Losing access to the board takes
 * the socket out of its voice room at once (`revokeVoiceAccess`).
 *
 * Who is speaking comes from `socket.data`, never the payload. Offers,
 * answers and ICE candidates go to one named participant's socket, never to
 * the room, and only between sockets in the same voice room. Their shape and
 * size are checked, since they are relayed to someone else's browser.
 */

const DEFAULT_SIGNAL_LIMIT = Object.freeze({ capacity: 80, refillPerSecond: 20 });
const MAX_SDP_LENGTH = 100_000;
const MAX_CANDIDATE_LENGTH = 2_048;

/**
 * @param {import("socket.io").Server} io
 * @returns {{ leaveVoice(socket: import("socket.io").Socket): void }}
 */
function registerSecureVoiceGateway(io, { authorizer, signalLimit = DEFAULT_SIGNAL_LIMIT, logger = console }) {
  // `${roomId}::${userId}` → the socket speaking for that account in that
  // room, so a signal reaches one socket rather than the whole room.
  const voiceSockets = new Map();

  function leaveVoice(socket) {
    const roomId = socket.data.voiceRoomId;
    if (!roomId) return;

    const key = voiceKey(roomId, socket.data.userId);
    if (voiceSockets.get(key) === socket.id) voiceSockets.delete(key);
    socket.to(voiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_LEAVE, { roomId, userId: socket.data.userId });
    socket.leave(voiceRoom(roomId));
    socket.data.voiceRoomId = null;
  }

  io.on("connection", (socket) => {
    const signals = createTokenBucket(signalLimit);

    socket.on(SOCKET_EVENTS.VOICE_JOIN, async (payload, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      if (!signals.take()) return reply(refusal("RATE_LIMITED"));

      const roomId = payload?.roomId;
      if (!isUuid(roomId)) return reply(refusal("BOARD_NOT_FOUND"));

      const access = await authorizer.check(socket, roomId, BOARD_ACTIONS.VIEW);
      if (!access.allowed) return reply(refusal(access.code));

      if (socket.data.voiceRoomId && socket.data.voiceRoomId !== roomId) leaveVoice(socket);

      // Tell the newcomer who is already talking.
      for (const peer of await io.in(voiceRoom(roomId)).fetchSockets()) {
        if (peer.data.userId === socket.data.userId) continue;
        socket.emit(SOCKET_EVENTS.VOICE_JOIN, { roomId, userId: peer.data.userId, username: peer.data.displayName });
      }

      socket.data.voiceRoomId = roomId;
      socket.join(voiceRoom(roomId));
      voiceSockets.set(voiceKey(roomId, socket.data.userId), socket.id);

      reply({ ok: true, roomId });
      socket.to(voiceRoom(roomId)).emit(SOCKET_EVENTS.VOICE_JOIN, {
        roomId,
        userId: socket.data.userId,
        username: socket.data.displayName,
      });
      logger.info?.("[realtime] Joined voice.", { roomId, userId: socket.data.userId });
      return undefined;
    });

    socket.on(SOCKET_EVENTS.VOICE_LEAVE, (_payload, acknowledge) => {
      leaveVoice(socket);
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    });

    const relay = (event, field, read) => (payload, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      if (!signals.take()) return reply(refusal("RATE_LIMITED"));

      const roomId = payload?.roomId;
      if (!roomId || roomId !== socket.data.voiceRoomId) return reply(refusal("NOT_JOINED"));
      const value = read(payload[field]);
      if (typeof payload.targetId !== "string" || !value) return reply(refusal("INVALID_PAYLOAD"));

      const targetSocketId = voiceSockets.get(voiceKey(roomId, payload.targetId));
      if (!targetSocketId) return reply(refusal("NOT_JOINED", "Target participant is not in this voice room."));

      io.to(targetSocketId).emit(event, {
        roomId,
        userId: socket.data.userId,
        targetId: payload.targetId,
        [field]: value,
      });
      return reply({ ok: true });
    };

    socket.on(SOCKET_EVENTS.VOICE_OFFER, relay(SOCKET_EVENTS.VOICE_OFFER, "offer", readDescription));
    socket.on(SOCKET_EVENTS.VOICE_ANSWER, relay(SOCKET_EVENTS.VOICE_ANSWER, "answer", readDescription));
    socket.on(SOCKET_EVENTS.VOICE_ICE, relay(SOCKET_EVENTS.VOICE_ICE, "candidate", readCandidate));

    socket.on("disconnect", () => leaveVoice(socket));
  });

  return {
    leaveVoice,

    /**
     * Access to a board changed: every socket in its voice room is checked
     * again, and one that may no longer be there is taken out and told.
     */
    async revokeVoiceAccess(boardId) {
      for (const remote of await io.in(voiceRoom(boardId)).fetchSockets()) {
        const socket = io.sockets.sockets.get(remote.id);
        if (!socket) continue;
        const access = await authorizer.check(socket, boardId, BOARD_ACTIONS.VIEW).catch(() => ({ allowed: false }));
        if (!access.allowed && socket.data.voiceRoomId === boardId) {
          leaveVoice(socket);
          socket.emit(SOCKET_EVENTS.BOARD_ACCESS_REVOKED, { boardId, code: access.code ?? "BOARD_NOT_FOUND" });
        }
      }
    },
  };
}

/**
 * An SDP offer or answer, rebuilt from its two fields so nothing else is
 * relayed. Null for anything else or anything oversized.
 */
function readDescription(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    (value.type !== "offer" && value.type !== "answer") ||
    typeof value.sdp !== "string" ||
    value.sdp.length > MAX_SDP_LENGTH
  ) {
    return null;
  }
  return { type: value.type, sdp: value.sdp };
}

/** An ICE candidate (RTCIceCandidateInit), rebuilt from its known fields. */
function readCandidate(value) {
  if (value === null || typeof value !== "object") return null;
  const { candidate, sdpMid = null, sdpMLineIndex = null, usernameFragment = null } = value;

  const valid =
    typeof candidate === "string" &&
    candidate.length <= MAX_CANDIDATE_LENGTH &&
    (sdpMid === null || (typeof sdpMid === "string" && sdpMid.length <= 64)) &&
    (sdpMLineIndex === null || (Number.isInteger(sdpMLineIndex) && sdpMLineIndex >= 0 && sdpMLineIndex < 1024)) &&
    (usernameFragment === null || (typeof usernameFragment === "string" && usernameFragment.length <= 256));

  return valid ? { candidate, sdpMid, sdpMLineIndex, usernameFragment } : null;
}

function voiceKey(roomId, userId) {
  return `${roomId}::${userId}`;
}

function voiceRoom(roomId) {
  return `voice:${roomId}`;
}

module.exports = {
  registerSecureVoiceGateway,
};
