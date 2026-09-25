const { BoardError } = require("./boardErrors");

/**
 * Who may do what to a board: the one place that decides (rule 14), for the
 * HTTP API and the realtime gateway alike (E-21, ADR 0008).
 *
 * Deny by default (rule 16). An action this table does not name is refused,
 * and so is a role it does not know.
 *
 * | Action   | owner | editor | viewer |
 * | -------- | ----- | ------ | ------ |
 * | view     |  yes  |  yes   |  yes   |  open it, see who is there, presence
 * | edit     |  yes  |  yes   |   -    |  change its content
 * | manage   |  yes  |   -    |   -    |  rename, invite, members, roles, hand over, delete
 *
 * Separately, anything involving another person needs a confirmed address
 * (E-20): joining the realtime board, inviting, accepting an invitation,
 * managing members. An owner working alone on their own board does not.
 */

const BOARD_ROLES = Object.freeze({ OWNER: "owner", EDITOR: "editor", VIEWER: "viewer" });

const BOARD_ACTIONS = Object.freeze({ VIEW: "view", EDIT: "edit", MANAGE: "manage" });

const ALLOWED_ROLES = Object.freeze({
  [BOARD_ACTIONS.VIEW]: new Set([BOARD_ROLES.OWNER, BOARD_ROLES.EDITOR, BOARD_ROLES.VIEWER]),
  [BOARD_ACTIONS.EDIT]: new Set([BOARD_ROLES.OWNER, BOARD_ROLES.EDITOR]),
  [BOARD_ACTIONS.MANAGE]: new Set([BOARD_ROLES.OWNER]),
});

/**
 * @param {string | null | undefined} role
 * @param {string} action
 */
function roleAllows(role, action) {
  return Boolean(role) && Object.hasOwn(ALLOWED_ROLES, action) && ALLOWED_ROLES[action].has(role);
}

/**
 * Throw unless `access` (from `boardRepository.findAccess`) permits `action`.
 *
 * No access at all answers BOARD_NOT_FOUND, like a board that does not exist,
 * so a board id reveals nothing to someone who is not on it.
 *
 * @param {{ role: string } | null} access
 * @param {string} action
 */
function requireBoardAction(access, action) {
  if (!access || !roleAllows(access.role, BOARD_ACTIONS.VIEW)) {
    throw new BoardError("BOARD_NOT_FOUND", { detail: `no access for ${action}` });
  }
  if (!roleAllows(access.role, action)) {
    throw new BoardError(action === BOARD_ACTIONS.EDIT ? "EDIT_FORBIDDEN" : "BOARD_FORBIDDEN", {
      detail: `${access.role} may not ${action}`,
    });
  }
}

/**
 * Throw unless the account's address is confirmed: the gate on collaboration.
 *
 * @param {{ emailVerifiedAt?: Date | null }} user
 */
function requireVerified(user) {
  if (!user?.emailVerifiedAt) throw new BoardError("EMAIL_NOT_VERIFIED");
}

module.exports = {
  BOARD_ACTIONS,
  BOARD_ROLES,
  requireBoardAction,
  requireVerified,
  roleAllows,
};
