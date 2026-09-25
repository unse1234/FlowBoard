const { randomUUID } = require("node:crypto");

/**
 * An email transport that keeps every message in memory, for tests.
 *
 * Never wired in production: server.js builds the Resend transport from
 * RESEND_API_KEY, and uses this only when a test passes it in. It honours
 * idempotency keys the way Resend does, so a test can prove a retry or a
 * repeated event would not reach the inbox twice.
 */
function createMemoryTransport() {
  const sent = [];
  const byKey = new Map();
  let failures = [];

  return {
    name: "memory",
    sent,

    /** The next `count` sends reject with `error` (a delivery failure). */
    failNext(error, count = 1) {
      failures = [...failures, ...Array.from({ length: count }, () => error)];
    },

    async send(message) {
      if (failures.length > 0) {
        const [error, ...rest] = failures;
        failures = rest;
        throw error;
      }

      const existing = byKey.get(message.idempotencyKey);
      if (existing) return { id: existing.id };

      const record = Object.freeze({ id: randomUUID(), ...message });
      byKey.set(message.idempotencyKey, record);
      sent.push(record);
      return { id: record.id };
    },

    /** Messages to one address, oldest first. */
    to(address) {
      return sent.filter((message) => message.to === address);
    },

    /** The first `?token=` in a message's text, as the recipient would click it. */
    tokenFrom(message) {
      const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(message?.text ?? "");
      return match ? match[1] : null;
    },
  };
}

module.exports = {
  createMemoryTransport,
};
