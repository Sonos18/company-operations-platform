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
