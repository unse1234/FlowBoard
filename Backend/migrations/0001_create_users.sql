-- FlowBoard identity: the users table.
--
-- Requires PostgreSQL 13 or later for the built-in gen_random_uuid().
--
-- Identifiers are UUIDs rather than sequential integers: user ids appear in
-- URLs and API responses, and a sequential id would let anyone count the
-- user base and address rows they were never shown.

CREATE TABLE users (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kept as the person typed it, for display and for addressing mail.
  email              text        NOT NULL,
  -- Lowercased, and what every lookup matches on: addresses are compared
  -- case-insensitively, and doing that with lower() at query time would not
  -- use an index on email.
  email_normalized   text        NOT NULL,
  email_verified_at  timestamptz,

  -- Null for an account that has only ever signed in through OAuth, which is
  -- why this cannot be NOT NULL.
  password_hash      text,

  display_name       text        NOT NULL,
  avatar_url         text,

  -- Bumped by a password change, "sign out everywhere", and deletion. Access
  -- tokens carry the version they were issued with and are rejected once it no
  -- longer matches, which is what makes a stateless token revocable.
  token_version      integer     NOT NULL DEFAULT 0,

  status             text        NOT NULL DEFAULT 'active',

  -- Soft delete. The row survives the grace period so the account can be
  -- restored; a scheduled job removes it afterwards.
  deleted_at         timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_status_check
    CHECK (status IN ('active', 'suspended', 'pending_deletion')),

  -- The application normalises; this makes it true of every row regardless.
  CONSTRAINT users_email_normalized_lowercase_check
    CHECK (email_normalized = lower(email_normalized)),

  CONSTRAINT users_email_present_check
    CHECK (length(email) > 0 AND length(email_normalized) > 0),

  CONSTRAINT users_display_name_present_check
    CHECK (length(btrim(display_name)) > 0)
);

-- One live account per address. Partial, so an address becomes available again
-- once a deleted account is purged.
--
-- Every lookup must therefore say `deleted_at IS NULL` to match the predicate
-- and use this index — including the one behind login.
CREATE UNIQUE INDEX users_email_normalized_active_key
  ON users (email_normalized)
  WHERE deleted_at IS NULL;

-- Supports the scheduled purge of accounts past their grace period without
-- scanning a table that is expected to be large.
CREATE INDEX users_deleted_at_idx
  ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Keeps updated_at honest even for a statement that forgets to set it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
