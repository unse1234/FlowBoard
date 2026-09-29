# Step 2 — Durable boards · PLAN

Target: from `flowboard-production-checklist.md`, §9 "Server-side
authoritative persistence — periodic snapshot + op log" and "Conflict-free
undo/redo in a multi-user context (undo only your own operations)", §24
"Scheduled jobs: snapshot compaction", and the groundwork for §13 "Periodic
automatic snapshots". Gaps G-4 and G-6 in `../PRODUCTION_PLAN.md`.

Baseline: `BOARDS_STATUS.md`. Decisions: `BOARDS_DECISIONS.md`.
Findings closed here: F-3, F-5, F-4, F-11, F-27, and F-9 for what is stored.

Written 2026-09-29 from a reading of the code on `feat/accounts-collaboration`,
plus two runtime checks (§A, facts 2 and 5).

---

## A. Why this order

Eight facts decide the sequence. Each was checked against the code, not the
docs.

1. **The server never applies an operation.** It checks the envelope, keeps
   the operation in a `Map`, relays it, and replays the whole list to every
   joiner (`operationStore.js`, `secureBoardGateway.js`). The server has no
   board state it could snapshot. Only the web app's applier knows what an
   operation does (`operationApplier.js`).
2. **That applier can run on the server unchanged.** It is 7 pure ES modules,
   about 1,000 lines, with no browser API. A CommonJS script on Node 24
   `require()`d it and folded create, update, delete and reorder correctly
   (checked 2026-09-29). So the server can compute a board with the very code
   clients use, rather than with a second implementation that drifts.
3. **Where the server runs is partly unknown.** Render's root directory and
   Node version are not recorded (`../DEPLOYMENT.md`); Vercel's root is
   `Frontend`. How the backend gets the applier must not depend on either
   (D-14).
4. **Edits are infrequent enough to store one row each.** A pen stroke is one
   `CREATE_SHAPE` on release, and a drag is one operation at the end.
   Line-anchor drags send one per move. The server allows 50 edits a second per
   socket. Measured write latency goes in 1.3 (rule 42).
5. **Content has no size bound.** An image is the whole file, base64, inside
   the shape. An operation over the 1 MB message cap drops the connection, and
   the client resends it on every reconnect forever (F-27, reproduced
   2026-09-29). Storing content without bounds would make one photo permanent
   megabytes in PostgreSQL. Bounds come first (rules 10, 36).
6. **Undo is still a local snapshot** that publishes nothing (`useHistory.js`),
   so it diverges peers (F-4). Both contract copies claim the opposite. The
   parts an inverse-operation undo needs are already in the contract and
   unused: `unset` on `UPDATE_SHAPES`, `REORDER_SHAPES`, and
   `applyOperationPayload`.
7. **Boards are already rows, with access decided by the database** (Step 1,
   migration 0008). Content can hang off `boards.id` with cascading deletes,
   so deleting a board or an account deletes its content without a new code
   path. Those tables exist only on `feat/accounts-collaboration`, so Step 2
   builds on that branch.
8. **The authenticated realtime path is not live.** Production has no
   database, so no client depends on today's join replay there. The join
   protocol can change without a compatibility window. Rules 6 and 7 still
   bind the operation contract.

So: **bounds, then the durable log, then snapshots, then the client, then
undo.** Undo does not depend on storage, and can move earlier once D-11 is
decided.

---

## B. Chunks

A chunk is one bounded change plus its tests. `../current-task.md` names the
active one. Both suites must pass, and lint, before a chunk is done. Anything
touching sync gets a two-client convergence test (rule 46).

### Phase 0 — Bounds, before anything is stored

Closes F-27. Closes F-9 for everything Step 2 stores.

| # | Chunk | Delivers |
| --- | --- | --- |
| 0.1 | Size limits in the contract | ✅ 2026-09-29. `OPERATION_LIMITS` in both copies, from measured boards: 900,000 bytes as UTF-8 JSON, 16 levels of nesting, 1,000 entries per batch, 128-character ids, 64 unset keys. The depth is measured without recursion, before anything serialises the operation, which closes F-28 for operations. The authenticated gateway checks the operation as it will store it, with the server's `userId`. `REALTIME_MAX_MESSAGE_BYTES` can no longer be set below the largest operation plus framing. Limits per *board* (shape count, bytes) need the server to know the board, so they move to 2.2 |
| 0.2 | No retry loops | The web app checks an operation's size before sending it. It splits a batch that is too big (`CREATE_SHAPES`, `UPDATE_SHAPES`, `DELETE_SHAPES`) into several that fit, which also covers seeding a new shared board. It drops, rather than retries forever, an operation the server refused as invalid, and tells the user. Transient failures still retry. Verified with the real `RealtimeManager` against a real server, repeating the F-27 reproduction |
| 0.3 | Images within bounds | As D-12 decides. Recommended: shrink and re-encode on insert, to fit under the per-operation limit |

### Hotfix track — for `main`

F-28 is live in production, and this branch cannot reach production until
the Step 1 branch it sits on is merged. So its fix ships separately, on a
branch from `main`.

| # | Chunk | Delivers |
| --- | --- | --- |
| H.1 | Bound every incoming message | ✅ Built 2026-09-30 on `fix/f28-message-nesting`; **deploys when the owner pushes it to `main`**. `nestingGuard.js`: a connection middleware refuses a handshake whose `auth` nests past 32 levels, and a per-socket `socket.use` check refuses any event that does, before any handler sees it, and drops the sender. Covers board, presence and voice events and the handshake, on every gateway. Each raw-frame attack is tested, and each test fails without the guard |

### Phase 1 — The durable operation log

Closes F-3 for every board with a server row.

| # | Chunk | Delivers |
| --- | --- | --- |
| 1.1 | Schema | Migration 0010: `board_operations` (board, sequence number, operation id, author, type, payload `jsonb`, time), primary key `(board_id, seq)`, unique `(board_id, operation_id)`, cascading from `boards`; a per-board head sequence on `boards`. Integration tests, and an EXPLAIN check on the tail read |
| 1.2 | Append | `boardContentRepository.appendOperation`: one transaction that locks the board row, takes the next sequence number, and inserts. A duplicate operation id consumes no number and reports the duplicate. Works across instances, because numbers come from the database. Tests: two racing appends get consecutive numbers, and a duplicate does not advance the head |
| 1.3 | Gateway writes through | The authenticated gateway stores an operation before it acknowledges or relays it (D-15), and the relay carries `seq`. A database failure refuses with `UNAVAILABLE`, so the client keeps the operation and resends it, and the operation id makes the resend safe. Joins read from the database. The in-memory store is left only to the database-less rooms (E-25). Tests: restart the app against the same database, rejoin, and the content is back. Negative tests: a viewer's operation, one for another board, and a refused one are not stored. Write latency measured and recorded |

### Phase 2 — Snapshots on the server, and compaction

Closes F-5.

| # | Chunk | Delivers |
| --- | --- | --- |
| 2.1 | The applier on the server | As D-14 decides. Recommended: an exact copy of the applier's 7 files in the backend, and a test that fails unless they are byte for byte the frontend's |
| 2.2 | Snapshots | Migration 0011: `board_snapshots` (board, `seq`, shapes `jsonb`, byte size, time). `snapshotBoard`: latest snapshot plus tail, folded, written at the head. Property test: folding snapshot *k* plus its tail equals folding every operation from the start. Limits per board (shape count, bytes), now that the server knows the board. Before the server folds, the applier's deletes and reorders stop costing batch × board: measured 0.1, 1,000 deletes on 10,000 shapes took 30 ms and 1,000 reorders 240 ms, on the event loop |
| 2.3 | When to snapshot | After *N* operations or *B* bytes since the last snapshot, whichever comes first, with thresholds set from measurement. It runs after the acknowledgement, off the socket's ordered queue, and only once per board at a time across instances (a transaction-scoped advisory lock) |
| 2.4 | Join sends snapshot plus tail | A joiner receives the latest snapshot as one message the client can tell apart from an edit (a new server event), then the tail with `seq`. It never receives the whole history (rule 37). Join bytes before and after recorded |
| 2.5 | Compaction and retention | As D-13 decides. Old operations and snapshots are pruned opportunistically once every so many writes, like the dead-session purge (`authRouter.js`), because there is no job runner (§24). Tests: after compaction, a join yields the same board |
| 2.6 | Resume from a sequence number | A reconnecting client says the last `seq` it has, and gets only the tail after it when that is still stored, or a snapshot when it is not. This makes a rejoin cheap. It is also what replaces in-memory connection-state recovery once there is more than one instance |

### Phase 3 — The server's copy is the board, in the web app

Closes F-11.

| # | Chunk | Delivers |
| --- | --- | --- |
| 3.1 | Take the snapshot | On a snapshot, the web app replaces its board with it, re-applies its own unacknowledged operations on top, then applies the tail. The local cache becomes a first paint only. Convergence tests: a client away while a peer deleted a shape ends without it, and two clients end identical to the server's copy |
| 3.2 | Unsent edits survive a reload | The queue of unacknowledged operations is saved with the local board (a versioned record migration, rule 8) and sent after reconnecting. Without this, 3.1 would let the server's copy overwrite edits made just before a reload; today those survive locally, though peers never see them |

### Phase 4 — Undo your own changes

Closes F-4. Blocked by D-11.

| # | Chunk | Delivers |
| --- | --- | --- |
| 4.1 | History of changes, not boards | Each undo step records the shapes it touched, before and after, instead of a copy of the whole board. The inverse is computed as ordinary operations in a pure `domain/` module (rule 39). This also stops keeping 50 copies of every image in memory |
| 4.2 | Undo and redo are edits | Undo and redo publish their inverse through the same path as any edit, and apply locally through `applyOperationPayload`. An inverse obeys the same limits, so a large one is split like any batch (0.2). When someone else changed the same thing since, D-11's rule decides. Convergence tests: A undoes while B edits other shapes, B's edits survive, and both boards end identical |
| 4.3 | The contract says what is true | Both copies' comments describe the real undo. `UNDO` and `REDO` stay reserved and never sent (rule 6). The contract test runs |

### Phase 5 — Proof and records

| # | Chunk | Delivers |
| --- | --- | --- |
| 5.1 | End to end | Real server and database, two clients using the web app's own code. Edit, kill the server, restart it, and both clients rejoin to identical boards. The same check for a joiner after compaction. Numbers recorded: write latency p50/p95, snapshot time for a large board, join bytes |
| 5.2 | Records | ADR 0010 (durable board content), `../ARCHITECTURE.md`, `../PROJECT_CONTEXT.md`, findings closed, `../PRODUCTION_PLAN.md` §9 and G-4/G-6 moved |

---

## C. Production validation for Step 2

- [ ] A shared board survives a server restart and a redeploy.
- [ ] A joiner receives one snapshot and a bounded tail, never the whole
      history.
- [ ] Clients that were apart converge on the server's copy when they rejoin.
- [ ] Everything stored is bounded in size; an edit too big is refused with a
      reason and never drops the connection.
- [ ] Sequence numbers come from the database, so appends are correct with
      more than one instance.
- [ ] Deleting a board or an account deletes its content.
- [ ] Undo and redo reach collaborators and revert only your own changes.
- [ ] Negative tests: nothing a viewer, a non-member or an invalid operation
      sends is stored.
- [ ] Both suites pass in CI; migrations run cleanly from empty.
- [ ] Board content never appears in a log line (rule 33).

As with Step 1, production runs none of this until it has a database
(`../AUTH/AUTH_REMAINING.md`).

---

## D. Out of scope for Step 2

- **Converging concurrent edits** (CRDT, G-7) and offline editing beyond
  surviving a reload: Step 3. Step 2's sequence numbers give Step 3 a server
  order to build on.
- **Fan-out across instances** (Redis adapter, F-24): Step 3. Step 2 is safe
  to *store* from several instances, but relays and revocation still reach
  one process.
- **Images in object storage** (G-8): Step 4, unless D-12 pulls it forward.
- **Version history screens**, named checkpoints and restore (§13): Step 6.
  Step 2 keeps the snapshots and operations they will read.
- **A board dashboard** and saving solo boards to the account (§3): Step 6
  (E-27).
- **The database-less anonymous rooms** (E-25) keep the in-memory store. They
  are removed once production has a database, not improved.
