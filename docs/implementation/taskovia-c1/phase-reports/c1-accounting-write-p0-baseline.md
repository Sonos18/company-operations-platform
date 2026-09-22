# C1 Accounting Write Backend — P0 Baseline

## Phase

P0 — Baseline Lock & Target Contract Tests

## Authority

- Branch: `feat/c1-accounting-write-backend`
- Starting HEAD: `945bf2af239d669031da2518fc1bc978eeb020a1`
- Approved design: `docs/superpowers/specs/2026-09-22-c1-accounting-write-backend-design.md`
- Approved plan: `docs/superpowers/plans/2026-09-22-c1-accounting-write-backend-implementation.md`
- `origin/main`: `eb4074306b9b27b4b573a874949ef60b8b991b50` (unchanged from the approved base)

## Read-only Cloud DEV preflight

- `pnpm db:dev:target`: PASS
- `pnpm db:dev:auth-check`: PASS
- `pnpm db:dev:status`: PASS
- Migration parity: 50 local / 50 remote through `20260922024724`
- Cloud mutation consumed: none

## Verified baseline contract

- Permission catalog already contains `cost.manage`, `cost.prepare`, `cost.publish_import`, `cost.correct`, and `cost.record_cash`.
- VQH Accountant currently has `accounting_document.read`, `accounting_document.update`, `cost.read`, `cost.source.read`, `inventory_value.read`, and `supplier.read`; the six approved additions are not assigned yet.
- Cloud DEV has no C1 evidence Storage bucket, objects, or object policies.
- `project_cost_items` has no publication lifecycle column; all existing rows participate in current cost reads.
- Existing Cloud DEV counts recorded by the approved design preflight: 10 cost parents, 432 cost details, 11 subcontracts, 13 canonical subcontract payments, 2 accounting sources, and 2 source versions.
- Parent cost amount is detail-derived when details exist; the derived-amount guard rejects independent parent rewrites.
- `project_subcontract_payments` is populated and remains the sole canonical subcontract cash ledger.
- Current Director project-cost and finance semantics are the regression baseline; no business amount or resource identifier is recorded in this report.

## Files changed

- This baseline report.
- `tests/unit/config/c1-accounting-write-target-contract.spec.ts`.
- C1 Cloud test/rehearsal runners and their focused tests.

## Migration

None in P0. The first implementation migration was subsequently created by the CLI at `supabase/migrations/20260922065444_c1_accounting_write_publication_rbac.sql`.

## RED evidence

`pnpm exec vitest run tests/unit/config/c1-accounting-write-target-contract.spec.ts -t "P1 adds publication state"` failed exactly because zero migrations end in `_c1_accounting_write_publication_rbac.sql` (expected one). This is the intentional RED carried into P1.

## Implementation summary

P0 changes test/safety infrastructure only. It does not change product, database, API, RBAC, RLS, Storage, or UI behavior.

## GREEN evidence

`pnpm exec vitest run tests/unit/config/c1-controlled-import-persistence-contract.spec.ts tests/unit/config/c1-cloud-dev-migration-rehearsal.spec.ts`: PASS, 2 files / 25 tests.

## RBAC/RLS/security negatives

Runner tests reject unknown SQL files, non-rollback-safe SQL, real VQH identifiers, foreign synthetic namespaces, and missing/duplicate migration suffixes before Cloud access. The CLI runner accepts no operator-supplied migration path.

## Jev checkpoint

Model `jev-1.13.0` returned: capability bypass `0.15`, tenant/company leakage `0.05`, destructive/silent history `0.04`, duplicate facts `0.04`, scope crossing `0.31`.

Disposition: no finding is supported by the diff. P0 contains only baseline documentation, target tests, and fail-closed runner validation; no business or database command surface changed.

## Diff and commit

- `git diff --check`: PASS
- Implementation commit: `85032270ecb0c14a002145275e96c02a2ea346ec`
