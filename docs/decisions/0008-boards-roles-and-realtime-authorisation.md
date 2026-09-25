# 0008 — Boards, roles, invitations, and authorised realtime

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Until now a board's only security boundary was knowing its room id: anyone
with a link could join, read its whole history and edit it, under any name and
any `userId` they chose (findings F-1, F-2, F-7). Accounts existed (Step 1
Phases 1–3) but nothing used them.

The project owner decided the sharing model (E-21), what an unconfirmed
account may do (E-20), and what happens to a deleted account's boards (E-22),
and asked for socket authentication, authorisation, revocation and limits.

## Decision

**Boards are database records.** `boards` (one owner), `board_members`
(editors and viewers; never the owner), `board_invites` (migration 0008). The
database is the only authority on access. A Socket.IO room is transport.

**One authorisation module**, `Backend/src/boards/boardAccess.js`: view / edit
/ manage per role, deny by default, used by both the HTTP API
(`/api/boards`, `/api/invites`) and the realtime gateway. A board someone
cannot open answers exactly like one that does not exist.

**Invitations** are random tokens stored as SHA-256 digests: editor, 7 days,
one use by default; revocable; withdrawn when a board changes hands; accepted
only by a signed-in account with a confirmed address, under a row lock so two
people cannot both take the last use.

**Realtime, when a database is configured** (`secureBoardGateway.js`,
`secureVoiceGateway.js`):

- The handshake refuses origins not on `CLIENT_ORIGIN` (in `allowRequest`,
  which covers WebSocket) and then authenticates with the same access token
  and live-session check as the HTTP API. Identity lives in `socket.data`;
  payload identity is ignored, and stored operations carry the socket's
  `userId`.
- Joining a board is authorised against the database before the socket
  enters the room or receives history. Editing needs editor or owner; the role
  is re-read at least every 30 seconds.
- Voice authorises its own join (the web app uses a separate socket) and
  relays signalling to one participant, rebuilt from known fields.
- Revocation is immediate. Account and board changes are published in-process
  (`auth/accountEvents.js`); `realtimeRevocation.js` closes ended sessions'
  sockets and re-checks every socket on a board whose access changed.
- Per-socket token buckets for joins, edits, cursors and voice; connection
  attempts per account in PostgreSQL; an explicit message-size cap.
- Connection-state recovery for 2 minutes with `skipMiddlewares: false`, and
  a board re-check on every recovered connection. A connection that is not
  recovered joins again and receives the full history: the re-sync.

**Without a database** the anonymous rooms remain, now behind the origin gate
(E-25): a server with no accounts has no identity to check.

## Alternatives considered

- **Keep link sharing, add optional accounts.** Leaves F-1 open by design.
- **Authorise in each handler.** Rule 14 exists because scattered checks drift;
  one module means one table to read and test.
- **A signed "board capability" in the link.** Unrevocable once shared, and
  no different from today's room id if leaked.
- **Re-read the database on every edit.** Correct but costly at drawing rates;
  instant revocation events plus a 30-second re-check bound staleness instead.
- **Reuse the board socket for voice.** Would couple two client stacks that
  are separate today; voice authorising itself is simpler and just as strict.

## Consequences

- F-1, F-2, F-7 and F-8 are closed wherever the server has a database.
  **They stay open on a server without one**, which is production until the
  owner connects Neon (`docs/DEPLOYMENT.md`).
- Connecting the database **changes behaviour**: old `?roomId=room-…` links
  stop working, and collaborating needs a signed-in, confirmed account.
- Revocation reaches sockets in the same process only. The realtime layer was
  already single-instance (its operation log is in memory, F-3); running
  several instances needs a shared channel (Redis adapter or LISTEN/NOTIFY).
  Finding F-24.
- Board content is still not stored server-side (F-3); only access is.
