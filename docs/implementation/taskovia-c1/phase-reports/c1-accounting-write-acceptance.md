# C1 Accounting Write Backend — P7 Acceptance

## Authority and status

- Branch: `feat/c1-accounting-write-backend`.
- Starting HEAD: `945bf2af239d669031da2518fc1bc978eeb020a1`.
- Approved base / `origin/main`: `eb4074306b9b27b4b573a874949ef60b8b991b50` at preflight.
- Pre-acceptance implementation HEAD: `8052ca43a7cc2a0edc75dea41f1e53ad09af6279`.
- Cloud target: guarded Supabase Cloud DEV only.
- Production: untouched.

## Migrations applied

The six approved feature migrations were rehearsed together in one rollback transaction and applied in order:

1. `20260922065444_c1_accounting_write_publication_rbac.sql`
2. `20260922070950_c1_accounting_write_draft_commands.sql`
3. `20260922073144_c1_accounting_write_evidence_storage.sql`
4. `20260922075204_c1_accounting_write_publish_command.sql`
5. `20260922075933_c1_accounting_write_correction_command.sql`
6. `20260922080759_c1_accounting_write_cash_commands.sql`

Cloud acceptance found an unqualified deferred-trigger lookup under hardened `search_path=''` and one evidence RLS initplan advisor warning. Previously applied migrations were not edited. Two forward-only corrective migrations were created, dry-run reviewed, and applied:

7. `20260922083315_c1_accounting_write_snapshot_constraint_scope_fix.sql`
8. `20260922090028_c1_accounting_write_evidence_rls_initplan_fix.sql`

Final parity is 58 local / 58 remote through `20260922090028`. Both push commands completed; the CLI emitted a non-blocking Docker cache-export warning after successful application.

## Cloud verification

- `pnpm db:dev:target`: PASS.
- `pnpm db:dev:auth-check`: PASS.
- Initial `pnpm db:dev:status`: 50/50 applied baseline; six pending.
- Initial `pnpm db:dev:dry-run`: exactly the six reviewed migrations, no seed/role changes.
- `pnpm db:dev:c1:rehearse`: PASS, rollback-only.
- `pnpm db:dev:push`: six migrations applied.
- Corrective dry runs: each listed only its single pending forward migration.
- Corrective pushes: both applied; no migration-history repair.
- `pnpm db:dev:c1:test`: PASS for all 11 C1 suites. New hard-failing pgTAP totals: lifecycle 47, evidence 21, cash 22. Existing Project Cost fixture was updated to the approved lifecycle instead of enabling a legacy capability bypass.
- `pnpm db:dev:rls-smoke`: PASS.
- Security advisor: WARN-only. New public SECURITY DEFINER RPC warnings are intentional authenticated wrappers with exact internal permission checks; the advisor also retains the pre-existing leaked-password warning.
- Performance advisor: no C1 warning after the forward evidence-policy correction. One unrelated pre-existing `workflow_definition_snapshots` multiple-policy warning remains.
- Final `pnpm db:dev:status`: 58/58.

## Generated types

`pnpm db:dev:types` updated only `shared/types/database.types.ts`. The diff contains publication fields/nullability, evidence tables and relations, payment replacement identity, and all new RPCs. It also adds the already-applied baseline `project_cost_reconciliation_resolutions` type from migration `20260922024724`; tracked generated types were stale for that existing table before this feature.

## Repository verification

- Pre-Cloud focused suite: PASS, 11 files / 194 tests.
- Evidence/security focused suite: PASS, 5 files / 38 tests.
- P6 cash/source/finance suite: PASS, 6 files / 52 tests.
- `pnpm test:unit`: PASS, 150 files / 1,262 tests.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS after minimal caught-error/unused-argument lint corrections.
- `pnpm build`: PASS; only existing chunk-size and Node dependency deprecation warnings were emitted.
- `git diff --check`: PASS.
- Browser/UI suites: not run; explicitly outside this backend slice.

## Accepted business contract

- Existing costs remain published and visible; new drafts are excluded from official reads by RLS, repositories, and reducer defense.
- Prepared is computed readiness, not persisted state.
- `cost.manage`, `cost.prepare`, `cost.publish_import`, `cost.correct`, and `cost.record_cash` are separate, positively and negatively tested capabilities.
- The active Accountant permission set is exactly: `accounting_document.read`, `accounting_document.update`, `cost.correct`, `cost.file.read`, `cost.manage`, `cost.prepare`, `cost.publish_import`, `cost.read`, `cost.record_cash`, `cost.source.read`, `inventory_value.read`, `supplier.read`.
- Evidence is private, immutable, verified, linked-resource authorized, and financially neutral.
- Published correction is reasoned, version-safe, and reconstructable from immutable before/after snapshots.
- `project_subcontract_payments` remains the sole canonical subcontract cash ledger; recorded money is immutable and correction is void plus one replacement.
- New `subcontract_labor` cost drafts/publication are blocked.

## Jev acceptance

Phase results were recorded in P1–P6 reports. Final model `jev-1.13.0` returned: permission bypass `0.13`, draft leakage `0.06`, history loss `0.11`, evidence duplicate effect `0.07`, cash duplication `0.15`, cross-company leakage `0.07`.

Disposition: no result identified a supported defect. Deterministic unit/database tests, RLS, migration constraints, and Cloud acceptance are authoritative.

## Mutation accounting and boundary

Authorized Cloud DEV mutations consumed: eight forward migrations (six planned plus two acceptance-driven corrective migrations). All database test fixtures and pgTAP extension creation were rollback-only. No reset, seed, migration repair, destructive operation, Production operation, UI change, or browser test was performed.

Antigravity contract: `docs/superpowers/specs/2026-09-22-c1-accounting-write-ui-handoff.md`.
