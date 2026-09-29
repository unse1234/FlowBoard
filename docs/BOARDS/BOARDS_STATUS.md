# Step 2 — Durable boards · STATUS

**The operational file. Read this first for Step 2. Update it every chunk.**

Last updated: 2026-09-30 (F-28 hotfix built and merged in; not yet deployed)

---

## Current position

| | |
| --- | --- |
| **Step** | 2 — Durable boards |
| **Phase** | 0 — Bounds. 0.1 done |
| **Next chunk** | 0.2 — no retry loops: the web app checks, splits and stops retrying. Needs no decision |
| **Urgent, outside the branch** | F-28 hotfix (H.1) is built, tested and committed on `fix/f28-message-nesting`, branched from `main`, and merged into both feature branches. **Not deployed:** pushing to `main` deploys, and that is the owner's to do. Until then the live server can be crashed |
| **Waiting on the owner** | D-11 (undo), D-12 (images), D-13 (history kept), in `BOARDS_DECISIONS.md`. They block 4.x, 0.3 and 2.5 respectively |
| **Branch** | `feat/durable-boards`, from `feat/accounts-collaboration` (its `boards` tables), neither merged |

---

## What exists today (verified 2026-09-29)

### Where a board's content lives

| Board | Content lives in | Survives a restart |
| --- | --- | --- |
| Solo, never shared | That browser's `localStorage` (`PersistenceManager`, key `flowboard:board:<id>`) | Yes, in that browser only |
| Shared, server **with** a database | The server's in-memory `OperationStore`, plus each member's `localStorage` copy | **No** (F-3) |
| Shared, server **without** a database (production today) | The same, in the anonymous rooms (E-25) | **No** (F-3) |

The `boards` table holds a shared board's title, owner and members, never its
content (migration 0008 says so).

### How content moves

```
Start collaborating
  → POST /api/boards                       board row: owner, title
  → one CREATE_SHAPES with every shape     the seed, sent over the socket

Edit
  → apply locally, then board:event        validated (envelope + structure only)
  → server: operationStore.add, relay      no fold, no order number, no size check
  ← peers apply it with operationApplier

Join
  → board:join                             access checked in the database
  ← every operation ever made, one message each   (F-5)
  ← applied on top of this browser's cached copy  (F-11)
```

### Facts the plan depends on

| Fact | Evidence |
| --- | --- |
| The server never applies operations | `operationStore.js` (a `Map`), `secureBoardGateway.js` |
| The applier runs in Node from CommonJS | Checked with `require()` on Node 24, 2026-09-29 |
| An operation over 1 MB loops the sender's connection | F-27, reproduced 2026-09-29 |
| Images have no size limit | `domain/images/imageAssets.js` reads the whole file as a data URL |
| Undo restores a whole-board copy locally and sends nothing | `hooks/useHistory.js`; F-4 |
| `unset`, `REORDER_SHAPES` and `applyOperationPayload` exist for an inverse-operation undo, unused | `grep` outside tests, 2026-09-29 |
| A stroke is one operation on release; a drag one at the end | `hooks/useWhiteboardEvents.js` |
| Render's root directory and Node version | **Unknown**; not in `../DEPLOYMENT.md` |

---

## Completed

| Chunk | Delivers |
| --- | --- |
| Plan | `BOARDS_PLAN.md`, `BOARDS_DECISIONS.md`, this file; F-27 recorded |
| 0.1 | `OPERATION_LIMITS` in both contract copies, set from measurements (below): 900,000 bytes, 16 levels, 1,000 entries per batch, 128-character ids, 64 unset keys. Depth measured without recursion before anything serialises (F-28 closed for operations). The authenticated gateway checks the operation with the server's `userId` on it, as stored. The message cap can no longer undercut the largest operation. 24 mutants, all killed; the raw-frame F-28 test fails on its own with the depth check off |

## Tests

| Suite | Result |
| --- | --- |
| Backend | **627 pass, 0 skipped** (611 at Step 1; 0.1 added 11, H.1 added 6 and superseded 1) |
| Frontend | **331 pass** (328 at Step 1); lint and build clean |

## Measurements (2026-09-29, the app's own shape code, this machine)

| What | Result |
| --- | --- |
| One shape, serialised | Box or arrow 0.4 KB; text or note (200 chars) 0.6 KB; pen stroke 7 KB (2 s), 33 KB (10 s) |
| Largest AI diagram | 120 shapes, 56 KB as one `CREATE_SHAPES` |
| A mixed 1,000-shape board as one seed | 3.0 MB, 3.1 KB a shape: over the 1 MB message cap past about 300 shapes (F-27) |
| Deepest operation the app sends | 5 levels, 6 for a whole-shape patch |
| Longest id | 42 characters |
| Applying k deletes to n shapes | n = 10,000: k = 500 took 8 ms, 1,000 took 32 ms, 5,000 took 686 ms |
| Applying k reorders (`REORDER_SHAPES`) | n = 10,000: k = 500 took 120 ms, 1,000 took 243 ms, 5,000 took 1,190 ms |
| Updates, groups, creates | Under 3 ms at any k up to 5,000 |
| Validation of one operation | 0.1 ms for a refused deep one; 2-4 ms for a 950 KB one |

## Known issues shaping Step 2

| ID | Issue | Where Step 2 deals with it |
| --- | --- | --- |
| F-3 | Restart loses every shared board | Phase 1 |
| F-5 | Log never shrinks; joiners get all of it | Phase 2 |
| F-11 | Local cache and replay both seed a room | Phase 3 |
| F-4 | Undo diverges peers; comments claim otherwise | Phase 4, after D-11 |
| F-9 | Operation size and shape unbounded | Phase 0, for what is stored |
| F-27 | An oversized operation loops the connection | Phase 0: server half in 0.1, client half 0.2 |
| F-28 | One nested message crashes the server | Resolved in code by hotfix H.1 (every event and the handshake) and 0.1 (operations); production waits for `fix/f28-message-nesting` on `main` |
| F-29 | Validators disagree on space-only ids | Recorded; not scheduled |
| F-24 | Revocation reaches one process only | Not Step 2 (Step 3) |

## Do not touch

| Area | Why |
| --- | --- |
| `Backend/src/auth/**`, `Backend/src/boards/**` access rules | Step 1, finished and tested. Change only where content storage genuinely needs it |
| `boardGateway.js` (no database) | E-28: left as it is until it is deleted |
| `Backend/src/ai/**` | Not Step 2 |
| Canvas, drawing, rendering, theme | Not Step 2, except where 0.3 touches image insertion |
| Both `operationTypes.js` / `operationValidator.js` copies | Only in 0.1 and 4.3, both copies at once, with the contract test run |

## Recent changes

| Date | Change |
| --- | --- |
| 2026-09-29 | Step 2 started. Code read and two runtime checks run; plan, decisions and status written; F-27 recorded. |
| 2026-09-29 | Chunk 0.1: operation limits in both contract copies, measured first. F-28 (crash by nesting) found, reproduced and closed for operations; F-29 recorded. Backend 611 → 622, frontend 328 → 331. |
| 2026-09-30 | Hotfix H.1: `nestingGuard.js` on `fix/f28-message-nesting` (from `main`), refusing any event or handshake nested past 32 levels. Four ways in reproduced on `main` and each test proven to fail without the guard; 6 mutants killed. Merged into `feat/accounts-collaboration` and here. 0.1's raw-frame test removed: the guard now stops that frame first. The push to `main` was refused by the permission check (production deploy), so it waits for the owner. Backend 622 → 627. |
