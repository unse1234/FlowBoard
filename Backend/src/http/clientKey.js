const { isIP } = require("node:net");

/**
 * The key a client's requests are counted under, for rate limits (7.6).
 *
 * IPv4: the address. IPv6: its /64 prefix. An ordinary IPv6 connection is
 * handed a whole /64, 2^64 addresses, and can use a fresh one per request, so
 * a per-address limit on IPv6 limits nothing at all. The /64 is the unit one
 * subscriber controls, which is what a limit is meant to count. An
 * IPv4-mapped IPv6 address (::ffff:203.0.113.7) is its IPv4 address.
 *
 * Anything that is not an address (the edge's "unknown client" marker, say)
 * is its own key, unchanged.
 *
 * @param {string | null | undefined} address
 * @returns {string}
 */
function rateLimitKeyFor(address) {
  if (typeof address !== "string" || address === "") return "unknown";

  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return address;

  const groups = expandIPv6(address);
  if (!groups) return address;

  // ::ffff:a.b.c.d, the IPv4-mapped form: the client is an IPv4 client.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }

  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

/**
 * Eight 16-bit groups for an IPv6 address, or null. Handles "::" and a
 * trailing dotted IPv4 part; a zone ("%eth0") is dropped.
 */
function expandIPv6(address) {
  let text = address.split("%")[0].toLowerCase();

  // A trailing IPv4 part becomes two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const bytes = dotted[1].split(".").map(Number);
    const tail = `${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
    text = text.slice(0, dotted.index) + tail;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail = halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;

  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((group) =>
    Number.parseInt(group, 16),
  );
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups
    : null;
}

module.exports = {
  rateLimitKeyFor,
};
