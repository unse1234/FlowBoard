-- Boards, who may use them, and invitations (AUTH_DECISIONS.md E-21, ADR 0008).
--
-- The database is the only authority on who may open or change a board. A
-- Socket.IO room is transport; knowing a board's id grants nothing.
--
-- Board content is not stored here. It lives in the realtime server's
-- operation log and in each browser, as before; persisting it is later work.

CREATE TABLE boards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT: an account that still owns a board cannot be deleted. Deleting
  -- an account first deletes its private boards and requires each shared one
  -- to be handed to a member or deleted (E-22), so no board is ever ownerless.
  owner_id    uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  title       text        NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT boards_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120)
);

-- "My boards", and the check for boards blocking an account's deletion.
CREATE INDEX boards_owner_id_idx ON boards (owner_id);

CREATE TRIGGER boards_set_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Everyone on a board but its owner, who is boards.owner_id and never also a
-- row here. Deleting either the board or the account removes the membership.
CREATE TABLE board_members (
  board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       text        NOT NULL,
  joined_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (board_id, user_id),

  CONSTRAINT board_members_role_check CHECK (role IN ('editor', 'viewer'))
);

-- "Boards shared with me", and removing an account's memberships.
CREATE INDEX board_members_user_id_idx ON board_members (user_id);

-- The owner and the members are disjoint, whichever side changes. Handing a
-- board over deletes the new owner's member row before changing owner_id.
CREATE FUNCTION board_members_exclude_owner() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM boards WHERE id = NEW.board_id AND owner_id = NEW.user_id) THEN
    RAISE EXCEPTION 'the owner of board % cannot also be a member', NEW.board_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER board_members_exclude_owner
  BEFORE INSERT OR UPDATE ON board_members
  FOR EACH ROW
  EXECUTE FUNCTION board_members_exclude_owner();

CREATE FUNCTION boards_owner_not_member() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM board_members WHERE board_id = NEW.id AND user_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'the new owner of board % is still listed as a member', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER boards_owner_not_member
  BEFORE UPDATE OF owner_id ON boards
  FOR EACH ROW
  EXECUTE FUNCTION boards_owner_not_member();

-- An invitation is a random token in a link, stored only as its SHA-256
-- digest. It grants a role when a signed-in, verified account accepts it,
-- until it expires, is used up, or is revoked.
CREATE TABLE board_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  token_hash  bytea       NOT NULL,

  -- Who made it. Kept after that account is gone only as null: a board's
  -- invitations are withdrawn whenever it changes hands, so none outlive it.
  created_by  uuid        REFERENCES users (id) ON DELETE SET NULL,

  role        text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  max_uses    integer     NOT NULL DEFAULT 1,
  use_count   integer     NOT NULL DEFAULT 0,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT board_invites_token_hash_key UNIQUE (token_hash),
  CONSTRAINT board_invites_token_hash_length_check CHECK (octet_length(token_hash) = 32),
  CONSTRAINT board_invites_role_check CHECK (role IN ('editor', 'viewer')),
  CONSTRAINT board_invites_uses_check
    CHECK (max_uses BETWEEN 1 AND 50 AND use_count BETWEEN 0 AND max_uses),
  CONSTRAINT board_invites_expiry_check CHECK (expires_at > created_at)
);

-- A board's invitations, for the owner's list and for withdrawing them all.
CREATE INDEX board_invites_board_id_idx ON board_invites (board_id);
