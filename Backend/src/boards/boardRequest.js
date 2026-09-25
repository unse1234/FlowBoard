const { BoardError, MAX_BOARD_TITLE_LENGTH } = require("./boardErrors");

/**
 * Validation at the boundary of the board API (rule 9): each function takes a
 * value straight from a request and returns it clean, or throws a BoardError
 * the route answers with directly.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The roles an invitation or a member can have. The owner is not one: ownership moves only by transfer. */
const MEMBER_ROLES = Object.freeze(["editor", "viewer"]);

const DEFAULT_TITLE = "Untitled board";

const INVITE_DEFAULTS = Object.freeze({ role: "editor", expiresInDays: 7, maxUses: 1 });

/**
 * Control, zero-width and bidirectional-formatting characters, which would let
 * a title render as something other than what it says. The same ranges as a
 * display name (`auth/signupRequest.js`).
 */
const UNSAFE_TITLE_CODE_POINTS = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];

/**
 * A board title: NFC, trimmed, 1-120 characters, nothing invisible.
 *
 * @param {unknown} value
 * @param {{ optional?: boolean }} [options]  optional: a missing title becomes the default
 */
function parseBoardTitle(value, { optional = false } = {}) {
  if (value === undefined && optional) return DEFAULT_TITLE;
  if (typeof value !== "string") throw new BoardError("BOARD_TITLE_REQUIRED");

  const title = value.normalize("NFC").trim();
  if (title === "") {
    if (optional) return DEFAULT_TITLE;
    throw new BoardError("BOARD_TITLE_REQUIRED");
  }
  if (Array.from(title).length > MAX_BOARD_TITLE_LENGTH) throw new BoardError("BOARD_TITLE_TOO_LONG");

  for (const character of title) {
    const codePoint = character.codePointAt(0);
    if (UNSAFE_TITLE_CODE_POINTS.some(([from, to]) => codePoint >= from && codePoint <= to)) {
      throw new BoardError("BOARD_TITLE_REQUIRED", { detail: "unsafe characters" });
    }
  }
  return title;
}

/** @returns {"editor" | "viewer"} */
function parseMemberRole(value) {
  if (!MEMBER_ROLES.includes(value)) throw new BoardError("ROLE_INVALID", { detail: `role ${String(value).slice(0, 20)}` });
  return value;
}

/**
 * An invitation's settings, each optional, defaulting to one use by an
 * editor within seven days.
 *
 * @returns {{ role: "editor" | "viewer", expiresInDays: number, maxUses: number }}
 */
function parseInviteOptions(body = {}) {
  const role = body.role === undefined ? INVITE_DEFAULTS.role : parseMemberRole(body.role);
  const expiresInDays = body.expiresInDays === undefined ? INVITE_DEFAULTS.expiresInDays : body.expiresInDays;
  const maxUses = body.maxUses === undefined ? INVITE_DEFAULTS.maxUses : body.maxUses;

  const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!inRange(expiresInDays, 1, 30) || !inRange(maxUses, 1, 50)) {
    throw new BoardError("INVITE_OPTIONS_INVALID");
  }
  return { role, expiresInDays, maxUses };
}

/** Whether a path parameter could be an id; anything else is never looked up. */
function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

module.exports = {
  DEFAULT_TITLE,
  INVITE_DEFAULTS,
  MEMBER_ROLES,
  isUuid,
  parseBoardTitle,
  parseInviteOptions,
  parseMemberRole,
};
