# FlowBoard — Engineering Rules

Rules derived from this codebase as it actually is. They are meant to be
followed, not admired — each one exists because the audit found either a pattern
worth keeping or a trap worth avoiding.

---

## 1. Incremental implementation

1. **One chunk at a time.** A chunk is one bounded behaviour change plus its
   tests, small enough to review in a sitting. Finish it, update
   `current-task.md`, stop.
2. **Do not start the next chunk in the same pass**, however obvious it looks.
3. **No drive-by changes.** Do not rename, reformat, re-order imports, bump
   dependencies or "tidy" code you only read. If you spot a real problem outside
   your chunk, add it to `AUDIT_FINDINGS.md` and leave the code alone.
4. **Leave the working tree explainable.** Every changed file should trace to
   the chunk you are on.

## 2. Backwards compatibility

5. **The operation contract is duplicated and must be changed in both copies**
   — `Backend/src/operations/operationTypes.js` and
   `Frontend/src/features/realtime/operations/operationTypes.js`, plus both
   validators. `operationContract.test.js` fails on drift, but it runs in the
   **frontend** suite only, so run that suite after touching either side.
6. **Add operation types; never repurpose one.** Older clients stay connected
   during a deploy and will receive types they do not know.
7. **New payload fields are optional.** A peer on the previous version must
   still apply the operation sensibly.
8. **Never change a persisted shape without a migration path.** `localStorage`
   records carry a `version` and `PersistenceManager` drops what it cannot
   validate — losing a user's board. Bump the version and migrate.

## 3. Validation

9. **Validate at the boundary, in one place.** `validateOperation` for sockets,
   `parseDiagramRequest` for the AI endpoint. Callers should not re-check.
10. **Validate shape *and* size.** The existing operation validator checks
    structure but not quantity or magnitude (finding F-9). New validators check
    both: array lengths, string lengths, numeric ranges.
11. **Allow-list, do not sanitise-and-accept.** `parseDiagramRequest` keeps only
    known fields — copy that. Rewriting bad input is how F-8 happened: reject a
    malformed identifier instead of mangling it into a valid one.
12. **Never trust a client-supplied identity.** `userId`, `boardId` ownership,
    roles and permissions are decided by the server. Overwrite what the client
    sent.

## 4. Authorisation

13. **Every socket event is an authorisation decision**, exactly like an HTTP
    route. There is no "internal" socket event.
14. **Authorise in one module**, not inline per handler. Scattered checks are
    how gaps like F-1 and F-7 survive.
15. **Check membership before emitting anything about a room** — including
    presence, participant lists and history replay. Leaking who is in a room is
    a leak.
16. **Deny by default.** A new event with no explicit policy must fail closed.

## 5. Database access

Rules to apply once the datastore exists (`AUTH_DECISIONS.md` D-1 is still open).

17. **Parameterised queries only.** No string-built SQL, ever.
18. **Migrations are forward-only, reviewed, and safe under a rolling deploy** —
    additive first, backfill second, drop in a later release.
19. **One connection pool per process**, created at startup, closed on shutdown.
20. **Index what you filter and join on**, at the time you add the query.
21. **Wrap multi-statement invariants in a transaction** — signup writing a user
    and its workspace is one unit.
22. **No N+1s in list endpoints.** Board lists and member lists are the places
    this will bite.

## 6. Error handling

23. **Follow the AI layer's error pattern** (`Backend/src/ai/aiErrors.js`): a
    typed error with a code, an HTTP status, and a message written for a person.
24. **One response envelope per surface.** HTTP: `{ ok: true, ... }` /
    `{ ok: false, code, error }`. Sockets: `{ ok: true, ... }` /
    `{ ok: false, error }`. Do not invent a third.
25. **Diagnostics are logged, never returned.** Provider messages, validation
    detail, stack traces and anything resembling a credential stay server-side.
26. **Fail loudly in development, safely in production** — no silent `catch {}`
    except where the failure genuinely does not matter, and then say so in a
    comment (`LocalStorageAdapter` does this correctly).

## 7. Secrets

27. **Nothing secret goes in `Frontend/`.** Anything `VITE_`-prefixed is bundled
    into the browser.
28. **Secrets come from the environment only**, via `serverConfig.js`. Never a
    literal, never a default, never a log line.
29. **`.env.example` gains every new variable**, with an empty value and a
    comment saying what it is for.
30. **Config is read once, at startup**, through `getServerConfig`. Do not read
    `process.env` deep in a module.

## 8. Logging and observability

31. **Log through the injected `logger`**, not bare `console`. Every server
    module already accepts one and defaults to `console` — keep that seam.
32. **Log events, not prose.** A code, a status and structured detail, as
    `aiRouter.logFailure` does.
33. **Never log a secret, a token, a password, an email body or board content.**
34. **Match level to meaning:** `error` for the unexpected, `warn` for a
    rejected request, `info` for lifecycle. A client's bad input is not an
    `error`.

## 9. Scalability

35. **Assume more than one server process.** Any new in-process `Map` holding
    shared state is a bug at deploy time — `OperationStore`, the AI rate
    limiter's window map and `voiceSocketsByUser` are the existing examples.
36. **Bound every collection that grows with usage.** Size cap, TTL, or eviction
    — decided when you write it, not after F-5 repeats.
37. **Never send unbounded history.** Snapshot plus tail, or paginate.
38. **Debounce and batch network emissions.** Presence is already throttled to
    50 ms and heartbeats to 4 s; hold that line.

## 10. Performance

39. **Keep `domain/` pure.** No React, no I/O, no globals. It is the tested core
    and the reason the frontend is refactorable.
40. **Do geometry in `domain/`, not in components.** Renderers draw.
41. **Do not add a per-frame allocation to the render path.** The canvas already
    renders every shape every frame with no culling — do not make it worse.
42. **Measure before optimising, and record the number** in the relevant doc.
    The checklist expects benchmarks, not claims.

## 11. Testing

43. **Every chunk ships with tests.** No exceptions for "obvious" code.
44. **Both suites must pass before a chunk is done:**
    `cd Backend && npm test` and `cd Frontend && npm run test:realtime`.
    Run `npm run lint` in `Frontend/` too.
45. **Test the boundary you changed.** New socket event → gateway test. New
    endpoint → router test. New pure function → unit test.
46. **Anything touching sync needs a two-client convergence test.** Assert both
    clients end in the same state.
47. **Security behaviour gets a negative test** — assert the unauthorised case
    is *rejected*, not merely that the happy path works.
48. **Use the built-in runner**, `node:test` with `node:assert/strict`. Do not
    add a test framework.

## 12. Dependencies

49. **Adding a dependency needs a reason recorded** in `docs/decisions/`. The
    backend has four; that restraint is an asset.
50. **Prefer the platform.** This codebase already uses `node:test`,
    `process.loadEnvFile`, `crypto.randomUUID` and `AbortController` instead of
    packages.
51. **Never add a frontend dependency to solve a backend problem**, or the
    reverse.
52. **No build step between the two sides.** The backend stays CommonJS and the
    frontend ESM, both runnable by plain Node; the contract test bridges them
    with `createRequire`.

## 13. Documentation

53. **Update the status docs in the same chunk as the code** —
    `current-task.md` always, `AUTH/AUTH_STATUS.md` during Step 1.
54. **A comment that disagrees with the code is worse than no comment.** Finding
    F-4 is exactly this. If you change behaviour, fix the comments that describe
    it.
55. **Cite file paths in docs**, so a future session can verify rather than
    trust.
56. **Mark what you did not verify as `UNKNOWN`.** An honest gap is useful; a
    confident guess is not.
