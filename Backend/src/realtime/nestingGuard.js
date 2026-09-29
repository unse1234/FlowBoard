/**
 * Refuse any socket message nested deeper than a FlowBoard client ever sends,
 * before a handler sees it (finding F-28).
 *
 * Socket.IO's encoder walks every outgoing packet recursively. A handler that
 * passes on part of what a client sent (an operation, a presence update, a
 * voice signal, the handshake's userId) would otherwise let one message of
 * deeply nested arrays overflow the stack while it is relayed, and the
 * uncaught RangeError stops the process.
 *
 * Two places are checked: the handshake's `auth`, which the presence relay
 * falls back to, and every incoming event. Depth is measured without
 * recursion, so measuring cannot overflow the stack either.
 */

/**
 * The web app's deepest message is 8 levels (an edit to a line's points,
 * inside its operation and envelope). Overflowing the encoder takes thousands.
 */
const MAX_MESSAGE_DEPTH = 32;

const REFUSAL_MESSAGE = "Message nests too deeply.";

/**
 * @param {import("socket.io").Server} io
 * @param {{ maxDepth?: number, logger?: Pick<Console, "warn" | "error"> }} [options]
 */
function registerNestingGuard(io, { maxDepth = MAX_MESSAGE_DEPTH, logger = console } = {}) {
  io.use((socket, next) => {
    if (!nestsDeeperThan(socket.handshake.auth, maxDepth)) return next();

    logger.warn?.("[realtime] Refused a handshake nested too deeply.", { socketId: socket.id });
    return next(new Error(REFUSAL_MESSAGE));
  });

  io.on("connection", (socket) => {
    // The packet is [event, ...args], with any acknowledgement callback last;
    // a function is not walked.
    socket.use((packet, next) => next(nestsDeeperThan(packet, maxDepth) ? new Error(REFUSAL_MESSAGE) : undefined));

    // A refused event surfaces here rather than at any handler. Nothing a
    // FlowBoard client sends nests like that, so the sender is let go.
    socket.on("error", (error) => {
      if (error?.message !== REFUSAL_MESSAGE) {
        logger.error?.("[realtime] Socket error.", { socketId: socket.id, message: error?.message });
        return;
      }

      logger.warn?.("[realtime] Refused an event nested too deeply; disconnecting.", { socketId: socket.id });
      socket.disconnect(true);
    });
  });
}

/** Whether a value nests more than `limit` levels, counting each object or array as one. */
function nestsDeeperThan(value, limit) {
  if (value === null || typeof value !== "object") return false;

  const pending = [[value, 1]];
  while (pending.length > 0) {
    const [node, depth] = pending.pop();
    if (depth > limit) return true;

    for (const child of Object.values(node)) {
      if (child !== null && typeof child === "object") pending.push([child, depth + 1]);
    }
  }

  return false;
}

module.exports = {
  MAX_MESSAGE_DEPTH,
  nestsDeeperThan,
  registerNestingGuard,
};
