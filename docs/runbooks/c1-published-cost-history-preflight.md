# C1 published-cost history rollout gate

## Scope and migration state

The pending `20260930111326_c1_draft_list_parent_eligibility.sql` now checks
published parent/detail consistency before replacing the draft-list function.
It does not repair data or change the strict finance and legacy detail readers.

This migration was confirmed **unapplied on Cloud DEV** on 2026-09-30. That is
not evidence of its status on any other target. Before rollout, verify migration
history on the explicitly authorized target. Never replace an already-applied
migration: if this version has been applied elsewhere, stop and prepare a new
forward migration for that target. Production is a separate approval boundary.

## Why history needs a gate

The Sep 18 schema reconciliation backfilled the opening balances present then.
The parent-and-sources-only writer remained available until the Sep 22 accounting
write lifecycle migration. A nonzero parent written in that interval can therefore
lack published details even after publication metadata is backfilled. An origin
of `legacy_backfill` does not prove consistency and can also be retained when a
parent is reused by managed commands.

For every published parent, both its numeric amount and its amount text must
equal the exact numeric sum of published details in the same tenant, company,
and parent scope. Empty sums are zero. Draft details do not explain a published
balance. Published unprepared amounts also block rollout. No category or origin
is exempt. Zero shells, explicit published zero details, and correctly balanced
legacy opening balances pass.

## Authorized Cloud DEV rehearsal

After obtaining explicit Cloud DEV mutation authorization, run the existing
guarded command:

```sh
pnpm db:dev:c1:rehearse
```

The runner selects only the pending migration, wraps it in one `BEGIN` / `ROLLBACK`
transaction, runs its preflight on the existing data before any function replacement,
and then replays the exact preflight on isolated temporary historical fixtures.
The replay changes only the two relation names to temporary fixture tables; it
is not a replay of every historical migration or of the old command. It checks
parent-only/draft-only balances, mismatched details, cross-scope links, stale numeric
amounts, zero and opening-balance controls, high-precision sums, unchanged fixture
state, and bounded diagnostics. There are no fabricated production rows.

Success requires both CLI exit zero and the final
`C1_PUBLISHED_COST_HISTORY_REHEARSAL_COMPLETE` result. Local unit tests validate
runner behavior and reader regressions, but do not execute PostgreSQL. A rollback
rehearsal still executes database DDL and needs explicit authorization. This patch
alone is not evidence that rehearsal or migration application passed.

## Failure and recovery

The preflight raises `P0001 / C1_PUBLISHED_COST_HISTORY_REQUIRES_REVIEW` with JSON
DETAIL containing the total `mismatchCount` and a deterministic sample of at most
20 parents. Each sample includes `tenantId`, `companyId`, `projectId`, `parentId`,
`parentAmount`, `storedParentAmount`, `publishedDetailAmount`,
`publishedDetailCount`, and `unpreparedPublishedDetailCount`. Money is emitted as
text to preserve precision. Stop rollout when the gate fails.

1. Identify each affected parent using all scoped IDs. Review its original sources,
   existing details, publication metadata, receipts, and audit history
2. Determine the correct historical opening balance or detail repair and its audit
   treatment. Obtain explicit approval for the affected target, rows, and repair
3. Do not zero a parent, create unexplained balancing details, or exempt legacy
   origins simply to make the gate pass
4. After the separately reviewed repair, rerun the guarded rehearsal. A sample of
   20 is not a full repair list; the total count includes every mismatch
5. Apply the pending migration only with separate target-specific authorization;
   then verify the strict finance and detail reads

A preflight is a point-in-time rollout gate, not an ongoing monitoring guarantee.
The existing command resolver and read-side aggregate checks remain enforced.
