# Task 2 report

## Scope delivered

- Added the carry-in compatibility alias: `ProjectCostDraftCategoryOption.postingStrategy` is optional while the runtime metadata schema remains strict.
- Added detail-level draft, preparation, publication, direct-publication, correction, and separate financial/operational read contracts.
- Added detail command server/repository/HTTP mappings and the specified thin API handlers without modifying UI routes or deprecated parent lifecycle handlers.
- Added forward-only migration `20260924110107_c1_ordinary_cost_detail_commands.sql`, detail-source provenance, guarded public RPC wrappers over private commands, idempotency receipts, audit events, aggregate sync, and no authenticated table DML.
- Added pgTAP command-surface coverage. Per task authority it was not run against Local or Cloud DEV.

## TDD and verification

- RED observed: `ordinary-cost-detail-lifecycle.spec.ts` failed because the new schemas did not exist; `ordinary-cost-detail-lifecycle.spec.ts` server boundary failed because the new command methods did not exist; `api-error.spec.ts` failed for the three new stable detail errors.
- GREEN: focused unit run passed: 7 files, 194 tests.
- `pnpm typecheck` passed (with the existing Node 22 versus package Node 24 engine warning).
- `git diff --check` passed.

## Scope and risk review

- No Cloud DEV, Production, reset, repair, seed, migration push, UI/component/page, or browser test was run or changed.
- Database behavioral pgTAP execution and migration syntax/application validation remain deferred to the authorized Cloud DEV controller stage.
- The migration deserves that Cloud DEV review because its transaction/RLS/source-readiness invariants cannot be verified in this task without an authorized database run.

## Fix round 1

- Official raw-detail RLS is now published-only and the repository additionally filters the official detail GET by `publication_state = published`; draft financial reads remain through the guarded `cost.prepare` RPCs.
- Publish/direct/correction revalidate persisted detail source links for current project scope, shared status, and blocking review issues; correction now records complete before/after detail and source-link snapshots.
- Detail idempotency uses a deterministic advisory receipt lock plus `FOR UPDATE`; command hashes bind the affected project/detail identity. Correction now validates its full JSON boundary and uses `COST_DETAIL_NOT_PUBLISHED` for a draft correction.
- Expanded the rollback-safe pgTAP command contract with RLS, stale-link validation, receipt-lock, and correction-lifecycle assertions. It remains unrun as required.

### RED

`pnpm exec vitest run tests/unit/server/project-cost.service.spec.ts`

Failed as expected: the official detail repository query had no `publication_state = published` predicate.

`pnpm exec vitest run tests/unit/server/api-error.spec.ts`

Failed as expected: `COST_DETAIL_NOT_PUBLISHED` was absent from the stable API error schema.

### GREEN

`pnpm exec vitest run tests/unit/server/project-cost.service.spec.ts tests/unit/server/api-error.spec.ts`

Passed: 2 files, 90 tests.

`pnpm typecheck`

Passed, with the existing Node 22 versus required Node 24 engine warning.
