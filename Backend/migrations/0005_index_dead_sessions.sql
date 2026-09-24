-- Indexes for the purge of dead sessions (chunk 3.1).
--
-- A session is dead once revoked or expired. After a retention period it is
-- deleted, and its refresh tokens with it (ON DELETE CASCADE). Without the
-- purge, refresh_tokens grows by a row per rotation forever
-- (AUTH_DECISIONS.md E-13). These are the purge's two conditions; without
-- them it would scan every session ever created.

CREATE INDEX auth_sessions_revoked_at_idx
  ON auth_sessions (revoked_at)
  WHERE revoked_at IS NOT NULL;

CREATE INDEX auth_sessions_expires_at_idx
  ON auth_sessions (expires_at);
