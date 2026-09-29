# Step 1 — Identity & Accounts · REMAINING

**What stands between Step 1 as built and Step 1 as closed.** Recorded
2026-09-29, when the owner paused Step 1's rollout and moved the project to
Step 2. Step 1 is complete in code (`AUTH_STATUS.md`); nothing below is a
missing feature.

Step 1 ends (`../PRODUCTION_PLAN.md`) when a user can sign up, verify, sign in,
manage sessions and delete their account, and the socket layer authenticates
and authorises against that identity. All of that works in code and in tests.
None of it runs in production, which has no database (E-25).

Work through these in order. Each names who does it.

---

## 1. Get the branch onto `main` — Claude, on the owner's word

- [ ] Push `feat/accounts-collaboration` (15 commits, `0d4c42a..2a06509`).
- [ ] CI green (backend 611, frontend 328, lint, build).
- [ ] Merge to `main`. **Merging deploys** Render and Vercel.

Safe on its own: without a database the server mounts no account routes and
keeps the anonymous rooms, and the web app treats that as "accounts
unavailable" (chunk 7.3).

Step 2 work may branch from this one, so merging it first keeps Step 2 off a
long-lived stack of unmerged branches.

## 2. Database — the owner, `../DEPLOYMENT.md` § Neon, § Render

- [ ] Neon project near the Render region. **Direct** connection string (not
      `-pooler`), with `sslmode=verify-full`.
- [ ] On Render: `DATABASE_URL`, `AUTH_ACCESS_TOKEN_KEYS`, `CLIENT_ORIGIN`,
      `AUTH_PROXY_SECRET`. With a database and no signing key the server
      refuses to start.
- [ ] On Vercel: the same `AUTH_PROXY_SECRET`.
- [ ] `npm run migrate` in the Render build (free) or pre-deploy (paid) command.
- [ ] `GET /ready` answers `{"ok":true,"checks":{"database":"ok"}}`.

**This changes collaboration at once**: old `?roomId=` links stop working, and
sharing becomes invitations for signed-in accounts with a confirmed email.

## 3. Email — the owner, `../DEPLOYMENT.md` § Email

- [ ] **A domain the owner controls.** Resend cannot verify `vercel.app`, and
      its shared test sender delivers only to the account holder. This is the
      likely blocker.
- [ ] Domain verified in Resend (SPF, DKIM); API key with sending access only.
- [ ] On Render: `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`. Startup logs
      `Email enabled through Resend`.

Without email nobody can confirm an address, so **nobody can collaborate**.
Do this with, or immediately after, step 2.

## 4. Sign-in providers — the owner, optional, `../DEPLOYMENT.md` § Sign-in

- [ ] Google, GitHub and Microsoft app registrations, with the callback
      addresses listed there.
- [ ] Microsoft: optional claim `xms_edov` on the ID token, or work accounts
      cannot sign up.
- [ ] One real sign-in with each. So far they are tested only against
      providers faked at the HTTP level.

## 5. Browser pass — owner and Claude together

The Step 1 screens were built and tested without a browser, so they have never
been seen. On the live site:

- [ ] Sign up, confirm by email, sign in, forgot and reset password.
- [ ] Start collaborating, invite, accept an invitation, open as a viewer.
- [ ] Remove a member and downgrade one to viewer while they are connected.
- [ ] Session list, end one session, sign out everywhere else.
- [ ] Delete an account that owns a shared board.
- [ ] Each configured provider: sign in, connect, disconnect.
- [ ] Fix what this finds, one chunk per problem.
- [ ] **Enforce the CSP** (report-only today) once nothing legitimate is
      reported. Closes F-6.

## 6. Close Step 1 on paper — Claude

- [ ] `AUTH_STATUS.md`, `../current-task.md`, `../PRODUCTION_PLAN.md`: Step 1
      complete, with the date it went live.
- [ ] Scorecard §1 and §12 in `../PRODUCTION_PLAN.md` moved to their verified
      state.

---

## Not required to close Step 1

| Item | Why it can wait |
| --- | --- |
| F-24 — revocation reaches sockets in one process only | Matters only with more than one instance; production runs one |
| F-25 — an email promised after a commit can be lost | LOW; the user can ask again (resend, forgot password) |
| F-21 — address length counted in UTF-16 units | LOW; affects only addresses near 254 characters |
| F-17 — residual signup timing difference | LOW; measured and accepted |
| Phase 9 (TOTP, recovery codes), Phase 10 (SSO/SAML) | Deferred by the owner |
| F-3 — board content is not stored | That is Step 2 |
