-- FlowBoard sessions: one row per sign-in, and the refresh tokens it has used.
--
-- ADR 0002 calls a sign-in and everything rotated from it a token "family".
-- The family is its own row here rather than a family_id repeated on every
-- token, for three reasons:
--
--   * Revoking a family must be race-free. Updating every token that shares a
--     family_id cannot see a successor inserted by a rotation committing at the
--     same moment, so a stolen family could survive its own revocation. With a
--     session row, rotation and revocation both go through that one row, and a
--     revoked session invalidates every token in it, whenever they were made.
--   * Phase 3 lists and revokes sessions. That is a query on this table, not a
--     DISTINCT over a token history that grows with every rotation.
--   * The absolute session lifetime belongs to the sign-in. Rotation extends a
--     token, never the session.
--
-- "Session" is overloaded in this codebase (Socket.IO connections,
-- sessionStorage), hence auth_sessions.

CREATE TABLE auth_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Removed with the account when a soft-deleted user is finally purged.
  user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Moved forward on every rotation, so Phase 3 can show when a device was
  -- last active without reading its token history.
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  -- The absolute limit. However often it is refreshed, a session ends here
  -- and its owner signs in again.
  expires_at      timestamptz NOT NULL,

  -- Revocation is final. A revoked session never becomes live again: signing
  -- in creates a new one.
  revoked_at      timestamptz,
  revoked_reason  text,

  -- The device that signed in, as the request described it, so a person
  -- reviewing their sessions can tell them apart. Display only: neither is
  -- ever used to decide anything.
  user_agent      text,
  ip_address      inet,

  CONSTRAINT auth_sessions_expiry_check
    CHECK (expires_at > created_at),

  -- A revocation always says why, and a reason never appears without one.
  CONSTRAINT auth_sessions_revocation_check
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),

  -- Every path that ends a session, named in AUTH_PLAN.md. Adding one is a
  -- deliberate schema change, not a typo that silently lands.
  CONSTRAINT auth_sessions_revoked_reason_check
    CHECK (revoked_reason IN (
      'logout',            -- Phase 2: the owner signed out on this device
      'reuse_detected',    -- Phase 2: a consumed refresh token was replayed
      'revoked_by_user',   -- Phase 3: ended from the session list
      'password_reset',    -- Phase 4: a reset ends every session
      'password_changed',  -- Phase 6: a change ends every other session
      'account_deleted'    -- Phase 6
    )),

  -- The application truncates before inserting; this makes it true of every
  -- row, so a hostile header cannot bloat the table.
  CONSTRAINT auth_sessions_user_agent_length_check
    CHECK (user_agent IS NULL OR char_length(user_agent) <= 512)
);

-- Every session belonging to a user: the Phase 3 list, "revoke all", and the
-- cascade when an account is purged, which would otherwise scan the table.
CREATE INDEX auth_sessions_user_id_idx
  ON auth_sessions (user_id);

CREATE TABLE refresh_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id   uuid        NOT NULL REFERENCES auth_sessions (id) ON DELETE CASCADE,

  -- SHA-256 of the token. The token itself is never stored, so a copy of this
  -- table signs nobody in. A fast hash is right here, unlike for passwords:
  -- the token is 256 random bits, so there is nothing to guess, and the lookup
  -- has to be an exact match on an index.
  token_hash   bytea       NOT NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  -- The idle limit: a token not exchanged by then is dead. Each successor gets
  -- a fresh one, capped by the session's expires_at.
  expires_at   timestamptz NOT NULL,

  -- Set when the token is exchanged for its successor. A consumed token
  -- presented again means a copy exists somewhere else, and the whole session
  -- is revoked, apart from a short grace window for two tabs refreshing at the
  -- same moment (chunk 2.4).
  --
  -- Consumed tokens are therefore kept, not deleted: removing one would turn
  -- the replay of a stolen token into an ordinary "unknown token" and let the
  -- thief's copy of the session live on. They go when their session is purged.
  consumed_at  timestamptz,

  CONSTRAINT refresh_tokens_token_hash_key
    UNIQUE (token_hash),

  -- A SHA-256 digest is 32 bytes. This catches the digest stored as hex, or
  -- the token stored as the base64url text the cookie carries. It cannot tell
  -- a digest from 32 raw token bytes; the repository's tests do that.
  CONSTRAINT refresh_tokens_token_hash_length_check
    CHECK (octet_length(token_hash) = 32),

  CONSTRAINT refresh_tokens_expiry_check
    CHECK (expires_at > created_at)
);

-- For the cascade when a session is purged. The refresh lookup itself uses
-- refresh_tokens_token_hash_key.
CREATE INDEX refresh_tokens_session_id_idx
  ON refresh_tokens (session_id);
