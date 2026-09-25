-- When this session last proved who it is again, beyond holding its tokens.
--
-- Destructive or credential-changing actions (setting a first password,
-- deleting the account) need a recent proof. For an account with a password,
-- the request carries the password itself. An account that signs in only
-- through Google, GitHub or Microsoft has no password to give, so it signs in
-- with its provider again, and that sets this column on the session asking
-- (spec Phase E). The action then checks it is recent.
--
-- Null means never, since the session began.

ALTER TABLE auth_sessions
  ADD COLUMN reauthenticated_at timestamptz;
