// @ts-check

export const SOCKET_EVENTS = Object.freeze({
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  CONNECT_ERROR: "connect_error",
  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",
  BOARD_EVENT: "board:event",
  PRESENCE_UPDATE: "presence:update",
  // Sent by a server with accounts (Backend/src/realtime/socketEvents.js).
  SESSION_ENDED: "session:ended",
  BOARD_ACCESS_REVOKED: "board:access-revoked",
  BOARD_ROLE_CHANGED: "board:role-changed",
});
