-- Sign-in through Google, GitHub and Microsoft (AUTH_DECISIONS.md E-23, ADR 0009).
--
-- An identity is the provider's own stable id for a person: Google's `sub`,
-- GitHub's numeric user id, Microsoft's tenant id plus `oid`. Never an email
-- address. Addresses change hands and some providers do not verify them, so
-- matching on one would let whoever controls an address sign in as the
-- account that used to have it. An identity only ever joins an account when
-- that account's owner, signed in, asks for it.

CREATE TABLE auth_identities (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  provider            text        NOT NULL,
  -- Microsoft's `tid`. Empty for providers without tenants, rather than null,
  -- so the unique key below covers every row.
  provider_tenant_id  text        NOT NULL DEFAULT '',
  provider_user_id    text        NOT NULL,

  -- The address the provider reported when the identity was linked. For
  -- display only ("Google · ada@gmail.com"); never used to find anyone.
  email_at_link       text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz NOT NULL DEFAULT now(),

  -- One FlowBoard account per provider identity: linking one already used
  -- elsewhere is refused, never merged.
  CONSTRAINT auth_identities_subject_key UNIQUE (provider, provider_tenant_id, provider_user_id),
  -- And one identity per provider per account, which keeps "connected
  -- accounts" and disconnecting simple. Also serves lookups by user.
  CONSTRAINT auth_identities_user_provider_key UNIQUE (user_id, provider),

  CONSTRAINT auth_identities_provider_check CHECK (provider IN ('google', 'github', 'microsoft')),
  CONSTRAINT auth_identities_subject_length_check
    CHECK (char_length(provider_user_id) BETWEEN 1 AND 255 AND char_length(provider_tenant_id) <= 64),
  CONSTRAINT auth_identities_email_length_check
    CHECK (email_at_link IS NULL OR char_length(email_at_link) <= 320)
);

-- A sign-in in progress with a provider, from "Continue with…" to the
-- provider sending the browser back. Single-use: the callback deletes it.
--
-- `state` travels through the provider and back; only its digest is kept.
-- The browser that started the sign-in also holds a random value in a cookie
-- (its digest here), so a callback carrying someone else's state, a login
-- CSRF, finds no match. The PKCE verifier and OIDC nonce never leave the
-- server until the code is exchanged.
CREATE TABLE oauth_states (
  state_hash     bytea       PRIMARY KEY,
  browser_hash   bytea       NOT NULL,
  provider       text        NOT NULL,
  intent         text        NOT NULL,
  code_verifier  text        NOT NULL,
  nonce          text        NOT NULL,

  -- For connecting a provider or proving identity again: who asked, and
  -- from which session. Null for signing in.
  user_id        uuid        REFERENCES users (id) ON DELETE CASCADE,
  session_id     uuid        REFERENCES auth_sessions (id) ON DELETE CASCADE,

  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,

  CONSTRAINT oauth_states_hash_length_check
    CHECK (octet_length(state_hash) = 32 AND octet_length(browser_hash) = 32),
  CONSTRAINT oauth_states_provider_check CHECK (provider IN ('google', 'github', 'microsoft')),
  CONSTRAINT oauth_states_intent_check CHECK (intent IN ('sign-in', 'link', 'reauthenticate')),
  -- Signing in has no account yet; the other two always do.
  CONSTRAINT oauth_states_account_check
    CHECK ((intent = 'sign-in') = (user_id IS NULL AND session_id IS NULL)),
  CONSTRAINT oauth_states_expiry_check CHECK (expires_at > created_at)
);

-- For clearing out sign-ins that were started and never finished.
CREATE INDEX oauth_states_expires_at_idx ON oauth_states (expires_at);
