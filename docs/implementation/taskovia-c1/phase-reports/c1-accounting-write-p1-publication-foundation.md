# C1 Accounting Write Backend — P1 Publication Foundation

## Phase

P1 — Publication State + RBAC Foundation

## Files changed

- `supabase/migrations/20260922065444_c1_accounting_write_publication_rbac.sql`
- `supabase/tests/database/c1/c1_accounting_write_lifecycle.test.sql`
- `tests/unit/config/c1-accounting-write-target-contract.spec.ts`
- `server/features/costs/project-cost.repository.ts`
- `server/features/costs/finance/project-finance.queries.ts`
- `server/features/costs/finance/project-finance.summary.ts`
- `tests/unit/server/project-cost.service.spec.ts`
- `tests/unit/server/project-finance.repository.spec.ts`
- `tests/unit/costs/project-finance.spec.ts`
- `tests/unit/server/project-finance.regressions.spec.ts`

## Migration

`20260922065444_c1_accounting_write_publication_rbac.sql` is forward-only and locally committed. In accordance with the approved all-at-once P7 deployment gate, it has not yet been applied to Cloud DEV.

The migration adds the separate `draft | published` lifecycle, publication attribution, historical `published` backfill, draft-aware RLS helpers, the official-read index, exact VQH Accountant grants, and revocation of the three legacy write RPCs until lifecycle-safe replacements exist.

## Focused RED evidence

- The P1 source-contract test failed against the CLI-created empty migration because no publication lifecycle existed.
- The read-isolation suite then failed four assertions: project-cost summary, item-detail parent, finance repository, and finance aggregation all admitted rows without an explicit published boundary.

## Implementation summary

Existing rows are backfilled as published; new rows default to draft. `work_status` remains independent business state. Official Project Cost and finance reads now query only published parents. The finance reducer independently removes any draft parent and its details if an upstream caller supplies them. Existing public read DTOs remain unchanged.

## Focused GREEN tests

- P1 migration/RBAC source contracts: PASS, 3 files / 3 tests.
- `pnpm vitest run tests/unit/server/project-cost.service.spec.ts tests/unit/server/project-finance.repository.spec.ts tests/unit/costs/project-finance.spec.ts tests/unit/server/project-finance.regressions.spec.ts`: PASS, 4 files / 78 tests.
- `pnpm typecheck`: PASS.

## RBAC, RLS, and security negatives

- The migration asserts the exact twelve-permission VQH Accountant post-state and preserves every unrelated role assignment plus the existing cost-operator set.
- `cost.read` is limited to published parent/child/source rows; draft visibility requires `cost.manage` or `cost.prepare` in the same tenant and company.
- Direct authenticated parent inserts remain denied.
- Legacy create/update/correct RPC execution is revoked from `authenticated` during the fail-closed transition.
- The lifecycle pgTAP covers historical visibility, draft hiding from a read-only actor, preparer visibility, and direct-write denial; Cloud execution is reserved for P7.

## Jev checkpoint

Command form: `node --env-file=.env.local scripts/run-typesafe-jev.mjs .superpowers/typesafe/p1.json`.

Model `jev-1.13.0` returned: capability bypass `0.17`, tenant/company leakage `0.12`, destructive or silent history behavior `0.20`, duplicate financial/cash facts `0.07`, and scope crossing `0.11`.

Disposition: no result indicates a supported defect. The higher history score reflects the phase's lifecycle/backfill subject, but the implementation preserves existing rows as published, adds no delete path, and fail-closes legacy writers. Database constraints, RLS, source-contract tests, and the P7 Cloud pgTAP remain authoritative.

## Diff and commits

- `git diff --check`: PASS.
- Lifecycle/RBAC commit: `0aa68a55021f3dde828edf9964daa51fbc5a5eec`.
- Official-read isolation commit: `0786a96` (`fix(c1): isolate draft costs from official reads`).

## Gate

PASS. Historical published fixtures retain their prior read meaning; drafts have zero effect on official Project Cost summaries, finance categories, known subtotals, management result, or retention calculations. Cloud DEV and Production were not mutated in P1.
