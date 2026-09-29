# Step 2 — Durable boards · DECISIONS

Same two kinds of entry as `../AUTH/AUTH_DECISIONS.md`, with numbers
continuing from it so an id is unique across the project:

- **ESTABLISHED**: already true of the repository, or forced by an earlier
  decision.
- **UNRESOLVED**: a real decision not yet made. **A recommendation is not a
  decision.** Owner decisions wait for the owner. Technical ones are marked;
  the plan proceeds on the recommendation unless the owner objects, and the
  outcome is recorded in an ADR.

---

# ESTABLISHED

## E-26 · Board content lives in PostgreSQL, hanging off `boards`

**Decision:** operations and snapshots are rows keyed by `boards.id`, deleted
with the board.
**Reason:** PostgreSQL is the datastore (ADR 0001, E-8), and state shared
between requests may not live in process memory (ADR 0003, rule 35).
Cascading from `boards` means deleting a board, or an account with its
boards, deletes their content with no new code path (E-22, E-24).
**Evidence:** migration 0008; `boardRepository.deleteBoard`; `accountDeletion.js`.
**Status:** Established by ADRs 0001 and 0003.

## E-27 · Only boards with a server row are stored

**Decision:** Step 2 stores boards that exist on the server: shared boards,
and private boards created there. A board that has only ever been in one
browser stays in that browser.
**Reason:** a server row is what carries an owner and access rules. Saving
every signed-in user's solo work to their account is the board dashboard of
§3, which the roadmap places in Step 6.
**Evidence:** `useWhiteboard.js`: a board gets a server row only through
"Start collaborating" (`account.createBoard`).
**Status:** Established by the roadmap. The owner can pull §3 forward.

## E-28 · A server without a database is not improved

**Decision:** the anonymous rooms (E-25) keep the in-memory `OperationStore`,
with F-3 and F-5 open there.
**Reason:** they exist only until production has a database, and E-25 already
says to delete them then.
**Status:** Follows from E-25.

---

# UNRESOLVED

## D-11 · Undo in a shared board · *owner*

**Question:** what does undo do when other people are editing the same board?

**Today:** undo puts back a copy of the whole board taken before your last
action, on your screen only. It sends nothing, so your board and everyone
else's silently differ (F-4), and it throws away, on your screen, anything
others did since.

| Option | What it means |
| --- | --- |
| **A. Undo only your own changes, and skip what others changed since** | Undo sends the reverse of your last change to everyone, like any edit. If someone else has since changed the same property of the same shape, that part of your undo is skipped, so undo never overwrites their work. This is the checklist's own item (§9) |
| A2. Undo only your own changes, and overwrite | As A, but your undo wins even over someone's later change to the same property |
| B. No undo while collaborating | Undo works on solo boards and is switched off on shared ones. Simplest; worst experience |
| C. Put the whole board back, for everyone | Reverts other people's work too. Not recommended |

**Recommendation: A.** It matches the checklist and never destroys a
collaborator's work. The contract already has what it needs. The occasional
cost is an undo that does less than you expected, when someone touched the
same thing.

**Blocks:** Phase 4.

## D-12 · Images, until they move to object storage · *owner*

**Question:** today an image is the whole file inside the board. What
happens to images once boards are stored?

**Why now:** a phone photo is several megabytes. Over about 750 KB it cannot
be sent at all: the connection drops and retries forever (F-27). Stored, each
one would take its full size in the database, once in the operation and again
in every snapshot.

| Option | What it means |
| --- | --- |
| **A. Shrink on insert** | The web app resizes and re-encodes an image when it is added (for example, longest side 1,600 px, JPEG or WebP), so it fits under the per-operation limit. Photos lose some resolution. Nothing new to run or pay for |
| B. Object storage now | Pull Step 4 forward: images go to a storage service and the board holds a link. Needs a provider decision and an account, and is the largest change here |
| C. No images on shared boards until Step 4 | Images work on solo boards only |

**Recommendation: A.** It fixes F-27 for images, keeps boards small, and
leaves Step 4 free to move images out properly later. The exact size is set
in 0.3 from real photos.

**Blocks:** 0.3. The rest of Phase 0 does not wait for it.

## D-13 · How much history to keep · *owner*

**Question:** once edits are stored, how long are they kept?

| Option | What it means | Later version history (§13) |
| --- | --- | --- |
| A. Only the latest | Keep the latest snapshot and the edits after it | Nothing to build it from |
| **B. 30 days** | Keep every edit and the periodic snapshots for 30 days, then compact to one snapshot per board | "What did this look like last Tuesday", and who drew what, for the last 30 days |
| C. Everything, forever | Never delete | Complete, and storage grows without bound (rule 36) |

**Recommendation: B.** It keeps the option of version history open at a
bounded cost. The number of days is one setting. Storage on the database
plan limits this (Neon's free allowance is small; **check the current
figure** before choosing C).

**Blocks:** 2.5.

## D-14 · How the server gets the applier · *technical*

**Question:** snapshots need the server to apply operations, and the applier
is frontend code (`BOARDS_PLAN.md` §A, facts 1 to 3).

| Option | Cost |
| --- | --- |
| **A. An exact copy in the backend, checked byte for byte** | Each side deploys on its own. A test fails if the copy differs from the original, and a script refreshes it. The copy is ES modules; the backend loads them with `require()`, which needs Node 22.12 or later, checked on Render in 2.1 |
| B. The backend loads the file from `Frontend/` | No copy, but it only works if Render has `Frontend/` on disk, which nobody has checked, and a frontend change can break the server |
| C. A shared top-level package | Clean, but Vercel's build and Vite's dev server both need settings changed to read outside `Frontend/`, neither checked |
| D. A second implementation in the backend | Two appliers that must agree forever: the drift the operation contract already suffers |

**Recommendation: A.** It is the only option that does not depend on unknown
host settings. A later, separate change could also replace the hand-kept
backend copy of the operation contract with the same exact-copy check, ending
that duplication hazard. That is not part of Step 2 (rule 3).

**Blocks:** 2.1.

## D-15 · Stored before acknowledged · *technical*

**Question:** does the server store an edit before telling its sender it
arrived, and before relaying it to others?

| Option | Cost |
| --- | --- |
| **A. Store, then acknowledge, then relay** | An acknowledged edit is never lost. Each edit waits for one database transaction, which matters only if the database is far from the server (`../DEPLOYMENT.md` says to create Neon near the Render service) |
| B. Relay first, store afterwards | Faster by one round trip; a crash between the two loses edits that peers already saw |

**Recommendation: A.** "The server said yes" should mean the edit is safe.
The latency is measured in 1.3; if it is too slow, batching comes before
weakening the guarantee.

**Blocks:** 1.3.

---

## How to resolve one

1. Decide with the project owner (owner items), or record the recommendation
   as taken (technical items).
2. Move the entry to **ESTABLISHED** as the next E-number, with Decision,
   Reason, Evidence and Status.
3. Write or update the ADR (0010 covers durable board content).
4. Update `BOARDS_STATUS.md` if it unblocks a chunk.
