-- Single-use tokens sent by email: address verification and password reset.
--
-- One row per account and purpose, at most. Issuing a new token replaces the
-- row, so the previous link stops working the moment a new one is sent, and
-- using a token deletes the row, so it cannot work twice. Both are single
-- statements, so two requests racing cannot both succeed.
--
-- Only a SHA-256 digest of the token is stored. The token is 256 random bits,
-- so a fast hash is right (nothing to guess) and a copy of this table verifies
-- no address and resets no password.

CREATE TABLE account_tokens (
  user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose           text        NOT NULL,
  token_hash        bytea       NOT NULL,

  -- The address the link was sent to. Verification proves someone reads that
  -- address, so if the account's address has changed since, the token proves
  -- nothing about the new one and is refused.
  email_normalized  text        NOT NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,

  PRIMARY KEY (user_id, purpose),

  CONSTRAINT account_tokens_token_hash_key UNIQUE (token_hash),

  CONSTRAINT account_tokens_purpose_check
    CHECK (purpose IN ('verify_email', 'reset_password')),

  -- 32 bytes is a SHA-256 digest; this catches the token stored as text.
  CONSTRAINT account_tokens_token_hash_length_check
    CHECK (octet_length(token_hash) = 32),

  CONSTRAINT account_tokens_expiry_check
    CHECK (expires_at > created_at)
);
