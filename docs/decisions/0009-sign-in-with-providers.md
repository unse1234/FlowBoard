# 0009 — Sign in with Google, GitHub and Microsoft

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The owner asked for Google, GitHub and Microsoft sign-in (D-9, now E-23) with
one rule above the rest: never link or merge accounts because two emails
match. Auto-linking on an unverified provider email is a well-known takeover
route, and Microsoft's `email` claim is set by the tenant (the "nOAuth"
class of bugs).

## Decision

- **One identity table for all providers**, `auth_identities` (migration
  0009), keyed on the provider's stable id: Google `sub`, GitHub's numeric
  user id, Microsoft `tid` + `oid`. Unique per identity, and one identity per
  provider per account. The email seen at linking is stored for display only.
- **Authorization code flow with PKCE (S256)** for all three, plus OIDC nonce
  for Google and Microsoft. GitHub has accepted PKCE since July 2025.
- **ID tokens verified with `node:crypto`**, no library (as ADR 0005):
  RS256 only, keys from each provider's published set (cached for an hour,
  an unknown `kid` refetches at most once a minute), exact issuer (Microsoft's
  per tenant), audience and `azp`, expiry with a minute of skew, nonce.
- **State**: a single-use, 10-minute `oauth_states` row (state stored as a
  digest) that also holds the PKCE verifier and nonce, bound to the browser by
  a random HttpOnly `SameSite=Lax` cookie. Lax because the provider returns the
  browser with a top-level GET from its own site.
- **Sign-in**: a known identity signs in to its account. An unknown one
  creates an account only from an email the provider vouches for (Google
  `email_verified`; GitHub's primary verified address; Microsoft only for
  personal accounts or with `xms_edov`), and only if no account has that
  email. Otherwise the answer is "an account already exists with this email:
  sign in, then connect this provider from Account settings".
- **Linking** only from a signed-in session (`/connect`), which must still be
  live when the provider sends the browser back. **Proving identity again**
  (for setting a first password or deleting the account) marks the session
  `reauthenticated_at` for 10 minutes.
- **Disconnecting** never removes the last way in, checked with the account
  row locked.
- **Provider tokens are not stored.** GitHub's is used to read the profile
  and dropped.
- The callback answers with a redirect to `/?oauth=…` or `/?oauth_error=…`;
  the web app words the outcome itself and shows nothing from the address.

## Alternatives considered

- **A library** (openid-client, Passport). A dependency for what is three
  well-specified requests and one signature check; the verification rules
  are clearer, and testable, written out.
- **Storing flow state in a signed cookie.** Avoids a table, but single use
  then needs a server-side record anyway.
- **Linking automatically when emails match and are verified.** Refused by
  the owner; even verified emails change hands.
- **Accepting Microsoft emails as verified.** The nOAuth guidance says not to.

## Consequences

- Each provider needs an app registration with the redirect address
  `APP_URL/api/auth/oauth/<provider>/callback`, set up by the owner
  (`docs/DEPLOYMENT.md`). Nothing is on until its id and secret are set.
- Work and school Microsoft accounts without `xms_edov` configured cannot
  create a FlowBoard account; they can still be connected to one.
- Accounts created by a provider have no password until their owner sets one
  (after proving identity, or through a reset link to the verified address).
- **Verified here against the real provider code with providers faked at the
  HTTP level; not yet against the real providers**, which needs the owner's
  credentials (UNVERIFIED until then).
