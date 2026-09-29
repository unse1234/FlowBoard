# Step 2 — Durable boards · STATUS

**The operational file. Read this first for Step 2. Update it every chunk.**

Last updated: 2026-09-29 (plan written; no code yet)

---

## Current position

| | |
| --- | --- |
| **Step** | 2 — Durable boards |
| **Phase** | Planned (`BOARDS_PLAN.md`). No chunk built |
| **Next chunk** | 0.1 — size limits in the operation contract. Needs no decision |
| **Waiting on the owner** | D-11 (undo), D-12 (images), D-13 (history kept), in `BOARDS_DECISIONS.md`. They block 4.x, 0.3 and 2.5 respectively |
| **Branch** | Builds on `feat/accounts-collaboration` (its `boards` tables), which is not merged |

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

## Tests

| Suite | Result |
| --- | --- |
| Backend | 611 pass, 0 skipped (Step 1 baseline) |
| Frontend | 328 pass (Step 1 baseline) |

## Known issues shaping Step 2

| ID | Issue | Where Step 2 deals with it |
| --- | --- | --- |
| F-3 | Restart loses every shared board | Phase 1 |
| F-5 | Log never shrinks; joiners get all of it | Phase 2 |
| F-11 | Local cache and replay both seed a room | Phase 3 |
| F-4 | Undo diverges peers; comments claim otherwise | Phase 4, after D-11 |
| F-9 | Operation size and shape unbounded | Phase 0, for what is stored |
| F-27 | An oversized operation loops the connection | Phase 0 |
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
