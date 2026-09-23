# Architecture Decision Records

One file per significant decision. Named `NNNN-short-title.md`, numbered in the
order they are accepted.

**Empty so far.** The audit of 2026-09-23 deliberately made no architectural
decisions — it recorded what the repository already establishes and left genuine
choices open. Open decisions live in `../AUTH/AUTH_DECISIONS.md` under
**UNRESOLVED**; the first one to land here will almost certainly be the
datastore choice (D-1).

## When to write one

Write an ADR when a decision has consequences beyond the chunk that made it:
a new dependency, a storage or protocol choice, a security model, a change to
the operation contract, or anything a future session might otherwise reverse
without knowing why.

Do **not** write one for ordinary implementation choices. Rule 49 in
`../ENGINEERING_RULES.md` names the cases that need a record.

## Template

```markdown
# NNNN — <title>

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD

## Context

What forced the decision. Cite real file paths and audit findings.

## Decision

What was decided, stated plainly.

## Alternatives considered

What else was on the table, and why it lost.

## Consequences

What this makes easy, what it makes hard, and what it commits the project to.
```

## Relationship to the other docs

| File | Holds |
| --- | --- |
| `docs/decisions/` | Decisions with lasting consequences, and their reasoning |
| `../AUTH/AUTH_DECISIONS.md` | Step 1 decisions, including the unresolved ones |
| `../ARCHITECTURE.md` | The resulting architecture, current and planned |
