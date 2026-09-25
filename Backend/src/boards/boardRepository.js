const { BOARD_ROLES } = require("./boardAccess");

/**
 * Every statement that touches `boards`, `board_members` and `board_invites`
 * (migration 0008). Parameterised without exception (rule 17).
 *
 * Functions that are one step of a larger change take an optional query
 * runner, so a route can put them in one transaction.
 */

function createBoardRepository({ database }) {
  const repository = {
    /** @returns {Promise<{ id: string, title: string, ownerId: string, createdAt: Date, updatedAt: Date }>} */
    async createBoard({ ownerId, title }) {
      const { rows } = await database.query(
        `INSERT INTO boards (owner_id, title) VALUES ($1, $2)
         RETURNING id, title, owner_id, created_at, updated_at`,
        [ownerId, title],
      );
      return toBoard(rows[0]);
    },

    async countOwnedBoards(ownerId) {
      const { rows } = await database.query("SELECT count(*)::int AS n FROM boards WHERE owner_id = $1", [ownerId]);
      return rows[0].n;
    },

    /**
     * The boards a user owns or is on, most recently changed first, in one
     * query (rule 22).
     */
    async listBoardsForUser(userId) {
      const { rows } = await database.query(
        `SELECT b.id, b.title, b.owner_id, b.created_at, b.updated_at,
                o.display_name AS owner_name,
                CASE WHEN b.owner_id = $1 THEN 'owner' ELSE m.role END AS role,
                (SELECT count(*) FROM board_members c WHERE c.board_id = b.id)::int AS member_count
         FROM boards b
         JOIN users o ON o.id = b.owner_id
         LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = $1
         WHERE b.owner_id = $1 OR m.user_id IS NOT NULL
         ORDER BY b.updated_at DESC
         LIMIT 500`,
        [userId],
      );
      return rows.map((row) => ({
        ...toBoard(row),
        role: row.role,
        ownerName: row.owner_name,
        memberCount: row.member_count,
      }));
    },

    /**
     * The user's role on a board, or null if they have none (or it does not
     * exist). What every authorisation decision starts from.
     *
     * @returns {Promise<{ boardId: string, title: string, ownerId: string, role: string } | null>}
     */
    async findAccess({ boardId, userId }, runner = database) {
      const { rows } = await runner.query(
        `SELECT b.id, b.title, b.owner_id,
                CASE WHEN b.owner_id = $2 THEN 'owner' ELSE m.role END AS role
         FROM boards b
         LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = $2
         WHERE b.id = $1 AND (b.owner_id = $2 OR m.user_id IS NOT NULL)`,
        [boardId, userId],
      );
      const row = rows[0];
      return row ? { boardId: row.id, title: row.title, ownerId: row.owner_id, role: row.role } : null;
    },

    /** A board with its owner and members, for someone already allowed to see it. */
    async getBoardDetail(boardId) {
      const { rows: boards } = await database.query(
        `SELECT b.id, b.title, b.owner_id, b.created_at, b.updated_at,
                o.display_name AS owner_name, o.email AS owner_email
         FROM boards b JOIN users o ON o.id = b.owner_id
         WHERE b.id = $1`,
        [boardId],
      );
      if (boards.length === 0) return null;

      const { rows: members } = await database.query(
        `SELECT m.user_id, m.role, m.joined_at, u.display_name, u.email
         FROM board_members m JOIN users u ON u.id = m.user_id
         WHERE m.board_id = $1
         ORDER BY m.joined_at`,
        [boardId],
      );

      const board = boards[0];
      return {
        ...toBoard(board),
        owner: { id: board.owner_id, displayName: board.owner_name, email: board.owner_email },
        members: members.map((member) => ({
          id: member.user_id,
          displayName: member.display_name,
          email: member.email,
          role: member.role,
          joinedAt: member.joined_at,
        })),
      };
    },

    async renameBoard({ boardId, title }) {
      const { rows } = await database.query(
        `UPDATE boards SET title = $2 WHERE id = $1
         RETURNING id, title, owner_id, created_at, updated_at`,
        [boardId, title],
      );
      return rows[0] ? toBoard(rows[0]) : null;
    },

    async boardExists(boardId) {
      const { rows } = await database.query("SELECT 1 FROM boards WHERE id = $1", [boardId]);
      return rows.length === 1;
    },

    /** @returns {Promise<boolean>} whether a board was deleted */
    async deleteBoard(boardId, runner = database) {
      const { rowCount } = await runner.query("DELETE FROM boards WHERE id = $1", [boardId]);
      return rowCount === 1;
    },

    /** @returns {Promise<boolean>} whether that member existed */
    async setMemberRole({ boardId, userId, role }) {
      const { rowCount } = await database.query(
        "UPDATE board_members SET role = $3 WHERE board_id = $1 AND user_id = $2",
        [boardId, userId, role],
      );
      return rowCount === 1;
    },

    /** @returns {Promise<boolean>} whether that member existed */
    async removeMember({ boardId, userId }, runner = database) {
      const { rowCount } = await runner.query(
        "DELETE FROM board_members WHERE board_id = $1 AND user_id = $2",
        [boardId, userId],
      );
      return rowCount === 1;
    },

    async countMembers(boardId, runner = database) {
      const { rows } = await runner.query("SELECT count(*)::int AS n FROM board_members WHERE board_id = $1", [boardId]);
      return rows[0].n;
    },

    /**
     * Hand a board from its owner to one of its members, as one unit: the
     * board row is locked, the new owner stops being a member, owner_id moves,
     * and every open invitation is withdrawn (they were the previous owner's
     * to give). `keepPreviousOwnerAs` re-adds the previous owner with that role;
     * null removes them, as account deletion does.
     *
     * @returns {Promise<boolean>} false if the board changed hands meanwhile
     *   or the target is not a member
     */
    async transferOwnership({ boardId, fromUserId, toUserId, keepPreviousOwnerAs }, runner) {
      const { rows } = await runner.query("SELECT owner_id FROM boards WHERE id = $1 FOR UPDATE", [boardId]);
      if (rows[0]?.owner_id !== fromUserId) return false;

      const { rowCount } = await runner.query(
        "DELETE FROM board_members WHERE board_id = $1 AND user_id = $2",
        [boardId, toUserId],
      );
      if (rowCount !== 1) return false;

      await runner.query("UPDATE boards SET owner_id = $2 WHERE id = $1", [boardId, toUserId]);
      if (keepPreviousOwnerAs) {
        await runner.query("INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)", [
          boardId,
          fromUserId,
          keepPreviousOwnerAs,
        ]);
      }
      await runner.query(
        "UPDATE board_invites SET revoked_at = now() WHERE board_id = $1 AND revoked_at IS NULL",
        [boardId],
      );
      return true;
    },

    // --- Invitations -------------------------------------------------------

    async createInvite({ boardId, createdBy, tokenHash, role, expiresInDays, maxUses }) {
      const { rows } = await database.query(
        `INSERT INTO board_invites (board_id, created_by, token_hash, role, expires_at, max_uses)
         VALUES ($1, $2, $3, $4, now() + make_interval(days => $5), $6)
         RETURNING id, role, expires_at, max_uses, use_count, created_at`,
        [boardId, createdBy, tokenHash, role, expiresInDays, maxUses],
      );
      return toInvite(rows[0]);
    },

    /** Invitations that could still be accepted: not withdrawn, expired or used up. */
    async listLiveInvites(boardId) {
      const { rows } = await database.query(
        `SELECT id, role, expires_at, max_uses, use_count, created_at
         FROM board_invites
         WHERE board_id = $1 AND revoked_at IS NULL AND expires_at > now() AND use_count < max_uses
         ORDER BY created_at DESC`,
        [boardId],
      );
      return rows.map(toInvite);
    },

    async countLiveInvites(boardId) {
      const { rows } = await database.query(
        `SELECT count(*)::int AS n FROM board_invites
         WHERE board_id = $1 AND revoked_at IS NULL AND expires_at > now() AND use_count < max_uses`,
        [boardId],
      );
      return rows[0].n;
    },

    /** @returns {Promise<boolean>} whether a live invitation of this board was withdrawn */
    async revokeInvite({ boardId, inviteId }) {
      const { rowCount } = await database.query(
        `UPDATE board_invites SET revoked_at = now()
         WHERE id = $2 AND board_id = $1 AND revoked_at IS NULL`,
        [boardId, inviteId],
      );
      return rowCount === 1;
    },

    /**
     * An invitation by its token digest, if it could still be accepted, with
     * the board it is for. Read-only: for showing what an invitation is before
     * accepting it.
     */
    async findLiveInvite(tokenHash, runner = database, { lock = false } = {}) {
      const { rows } = await runner.query(
        `SELECT i.id, i.board_id, i.role, i.max_uses, i.use_count, i.expires_at,
                b.title, b.owner_id, o.display_name AS owner_name
         FROM board_invites i
         JOIN boards b ON b.id = i.board_id
         JOIN users o ON o.id = b.owner_id
         WHERE i.token_hash = $1 AND i.revoked_at IS NULL AND i.expires_at > now() AND i.use_count < i.max_uses
         ${lock ? "FOR UPDATE OF i" : ""}`,
        [tokenHash],
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            boardId: row.board_id,
            role: row.role,
            expiresAt: row.expires_at,
            usesLeft: row.max_uses - row.use_count,
            title: row.title,
            ownerId: row.owner_id,
            ownerName: row.owner_name,
          }
        : null;
    },

    /**
     * Accept an invitation: under a lock on it, so two people racing for the
     * last use cannot both get in.
     *
     * Someone already on the board (or its owner) keeps their role and spends
     * no use. Otherwise a member row is added with the invitation's role and
     * one use is counted.
     *
     * @returns {Promise<{ outcome: "invalid" } | { outcome: "full" } |
     *   { outcome: "joined" | "already", boardId: string, title: string, role: string }>}
     */
    async acceptInvite({ tokenHash, userId, memberLimit }, runner) {
      const invite = await repository.findLiveInvite(tokenHash, runner, { lock: true });
      if (!invite) return { outcome: "invalid" };

      const existing = await repository.findAccess({ boardId: invite.boardId, userId }, runner);
      if (existing) return { outcome: "already", boardId: invite.boardId, title: invite.title, role: existing.role };

      if ((await repository.countMembers(invite.boardId, runner)) >= memberLimit) return { outcome: "full" };

      await runner.query("INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)", [
        invite.boardId,
        userId,
        invite.role,
      ]);
      await runner.query("UPDATE board_invites SET use_count = use_count + 1 WHERE id = $1", [invite.id]);
      return { outcome: "joined", boardId: invite.boardId, title: invite.title, role: invite.role };
    },

    // --- Account deletion (E-22) ------------------------------------------

    /** The boards a user owns, each with how many other people are on it. */
    async listOwnedBoards(ownerId, runner = database) {
      const { rows } = await runner.query(
        `SELECT b.id, b.title, b.owner_id, b.created_at, b.updated_at,
                (SELECT count(*) FROM board_members m WHERE m.board_id = b.id)::int AS member_count
         FROM boards b WHERE b.owner_id = $1
         ORDER BY b.updated_at DESC`,
        [ownerId],
      );
      return rows.map((row) => ({ ...toBoard(row), memberCount: row.member_count }));
    },

    /** The boards a user is a member of (not owner), for telling their rooms. */
    async listMemberBoardIds(userId, runner = database) {
      const { rows } = await runner.query("SELECT board_id FROM board_members WHERE user_id = $1", [userId]);
      return rows.map((row) => row.board_id);
    },
  };
  return repository;
}

function toBoard(row) {
  return {
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInvite(row) {
  return {
    id: row.id,
    role: row.role,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    createdAt: row.created_at,
  };
}

module.exports = {
  BOARD_ROLES,
  createBoardRepository,
};
