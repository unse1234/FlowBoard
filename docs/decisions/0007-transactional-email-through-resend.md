# 0007 — Transactional email through Resend's HTTP API

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Step 1 needed email for three things it could not finish without: confirming
an address (E-20: collaboration needs one), resetting a forgotten password, and
the half of E-12 that tells someone signing up with a taken address that they
already have an account. Security notices (password changed, account deleted,
provider connected) follow from the owner's specification.

There was no mailer, no templates and no provider (D-4). The project owner
chose Resend and ruled out SMTP.

## Decision

- **One service**, `Backend/src/email/emailService.js`, with a method per email
  (`sendVerificationEmail`, `sendPasswordResetEmail`,
  `sendPasswordChangedNotification`, `sendAccountDeletedNotification`, …).
  Auth code never names a provider. The transport is chosen once in
  `server.js`: Resend when `RESEND_API_KEY` is set, an in-memory mailbox in
  tests (`memoryTransport.js`).
- **Resend over plain `fetch`** (`resendTransport.js`), not its SDK. The
  integration is one POST, and the platform covers it (rule 50), as it did for
  Turnstile.
- **Idempotency keys on every email.** A token email is keyed on a digest of
  its token; a notice on its event (a password change on the new
  `token_version`, a deletion on the account id). Retries (network, 5xx,
  Resend's per-second limit, a concurrent request under the same key) reuse
  the key, so one event is one email however often it is retried.
- **Sent in the background.** Routes hand the send to `inBackground` and
  answer at once. Forgot-password needs this: it emails a real account and
  sends nothing for an unknown address, so awaiting the send would make the
  two answers take different times. Shutdown drains pending sends before the
  database pool closes.
- **Templates escape everything interpolated** (`templates/layout.js`). A
  display name is chosen by whoever signs up, and an email is HTML.
- **Nothing sent is logged**: not the recipient, the subject, the body or a
  token. A failure logs the kind of email and Resend's error type.
- **Configuration is all or nothing.** `RESEND_API_KEY` without `MAIL_FROM`
  and `APP_URL` stops startup. No key at all turns email off, and routes that
  would send say `EMAIL_UNAVAILABLE` rather than pretend.

## Alternatives considered

- **Resend's Node SDK.** A dependency for one request, and no control over
  retries or timeouts beyond what it exposes.
- **SMTP** (Nodemailer or another provider's relay). Ruled out by the owner.
  It would also add a connection-level protocol to secure and a dependency.
- **A dev transport that prints links to the console.** Rejected: tokens are
  credentials, and rule 33 forbids logging them, development included.
  Developers use a Resend test key, or run with email off.
- **A durable outbox table with a worker.** Survives a crash between the
  commit and the send. Not built: a lost verification or reset email is
  recovered by asking again, and the cost (a table, a worker, a poll loop) is
  not yet justified. Revisit if lost mail is ever reported.

## Consequences

- Production needs a domain verified in Resend, and `MAIL_FROM` on it.
  `docs/DEPLOYMENT.md` lists the steps.
- A crash after a request commits but before its email leaves loses that
  email. Every such email can be requested again.
- Resend's idempotency keys last 24 hours, longer than any retry here.
- The first emails were verified against the in-memory transport and the
  transport against scripted Resend responses. **Delivery through a real
  Resend account is UNVERIFIED** until the owner configures a key.
