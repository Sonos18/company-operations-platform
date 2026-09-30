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

## Fix round 3

- Expanded the same rollback-only pgTAP fixture with foreign project/detail/source isolation, three independently denied direct-publish roles, persisted-source status and review-issue readiness checks, direct-command row/draft/replay assertions, sibling preservation, and exact correction source-array audit assertions.
- Corrected the source scope contract: missing or foreign source IDs now produce `RESOURCE_NOT_FOUND`; existing in-scope sources that are non-shared or blocked remain `COST_DETAIL_PUBLISH_NOT_READY`.
- Corrected the prior report wording: pgTAP coverage is authored but still unexecuted because no Cloud or Local database run is authorized.

### Verification

`pnpm exec vitest run tests/unit/costs/ordinary-cost-detail-lifecycle.spec.ts tests/unit/server/ordinary-cost-detail-lifecycle.spec.ts tests/unit/server/api-error.spec.ts tests/unit/costs/project-costs.spec.ts tests/unit/server/project-cost.service.spec.ts tests/unit/server/project-cost.routes.spec.ts tests/unit/repositories/http-project-cost-repository.spec.ts`

Run after the test-only expansion; no database command was run.

## Fix round 2

- Correction validation now bounds `expectedVersion` before bigint conversion, bounds retention rate without an unsafe integer cast, and validates final retention kind/rate/amount shape against the locked current detail before mutation.
- Correction now applies and validates an explicitly proposed replacement source set before final stale-source validation; unchanged source links are still revalidated. Audit before/after source arrays remain explicit.
- Replaced the command pgTAP surface-only checks with reserved-ID, rollback-safe behavioral command fixtures covering create/replay, zero effect, operational/financial isolation, version conflicts, publish/direct replay and exact aggregates, correction/audit, subcontract rejection, and invalid foreign source linkage. No database execution was authorized.

### RED

`pnpm exec vitest run tests/unit/costs/ordinary-cost-detail-lifecycle.spec.ts`

Failed as expected: a correction with retention exceeding amount was accepted.

### GREEN

`pnpm exec vitest run tests/unit/costs/ordinary-cost-detail-lifecycle.spec.ts tests/unit/server/project-cost.service.spec.ts tests/unit/server/api-error.spec.ts`

Passed: 3 files, 94 tests.

`pnpm typecheck`

Passed, with the existing Node 22 versus required Node 24 engine warning.

## Fix round 4

- Replaced the prior nonexistent foreign-detail probe with reserved, rollback-safe existing-detail fixtures for a foreign tenant/company and a same-tenant different company; each fixture uses composite-scope parent/project/category foreign keys.
- Added authorized-primary-actor update, prepare, publish, and financial/operational read probes that return `RESOURCE_NOT_FOUND`, plus row-snapshot and audit/receipt assertions proving no mutation or leakage.
- Updated the pgTAP plan from 60 to 66 assertions. No production code changed and no Cloud DEV, Production, or Local database command was run.

### Local verification

`pnpm exec vitest run tests/unit/costs/ordinary-cost-detail-lifecycle.spec.ts tests/unit/server/ordinary-cost-detail-lifecycle.spec.ts tests/unit/server/api-error.spec.ts tests/unit/costs/project-costs.spec.ts tests/unit/server/project-cost.service.spec.ts tests/unit/server/project-cost.routes.spec.ts tests/unit/repositories/http-project-cost-repository.spec.ts`

Passed: 7 files, 196 tests.

`git diff --check`

Passed. `pnpm typecheck` was not rerun because this round changes only pgTAP fixtures and task reporting.
