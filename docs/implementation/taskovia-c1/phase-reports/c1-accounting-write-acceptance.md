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

Cloud acceptance found an unqualified deferred-trigger lookup under hardened `search_path=''`, one evidence RLS initplan advisor warning, and final review found an evidence-kind name drift from the approved spec. Previously applied migrations were not edited. Three forward-only corrective migrations were created, dry-run reviewed, and applied:

7. `20260922083315_c1_accounting_write_snapshot_constraint_scope_fix.sql`
8. `20260922090028_c1_accounting_write_evidence_rls_initplan_fix.sql`
9. `20260922092309_c1_accounting_write_evidence_kind_contract_fix.sql`

The initial PR parity was 59 local / 59 remote through `20260922092309`. PR review hardening added three more forward-only migrations without editing the nine applied migrations:

10. `20260922100747_c1_accounting_write_review_security_hardening.sql`
11. `20260922101400_c1_accounting_write_finalize_validation_fix.sql`
12. `20260922102810_c1_accounting_write_raw_target_metadata_fix.sql`

Migration 11 corrects a PostgreSQL compatibility error discovered by the hard-failing evidence suite after migration 10 was applied. Migration 12 removes original-filename metadata from the raw-file target after independent review found that disclosure crossed the `cost.source.read` boundary. Final parity is 62 local / 62 remote through `20260922102810`. Push commands completed; the CLI emitted a non-blocking Docker cache-export warning after successful application.

## Cloud verification

- `pnpm db:dev:target`: PASS.
- `pnpm db:dev:auth-check`: PASS.
- Initial `pnpm db:dev:status`: 50/50 applied baseline; six pending.
- Initial `pnpm db:dev:dry-run`: exactly the six reviewed migrations, no seed/role changes.
- `pnpm db:dev:c1:rehearse`: PASS, rollback-only.
- `pnpm db:dev:push`: six migrations applied.
- Corrective dry runs: each listed only its single pending forward migration.
- Corrective pushes: the initial three and all three PR-review migrations applied; no migration-history repair.
- `pnpm db:dev:c1:test`: PASS for all 11 C1 suites. Final hard-failing pgTAP totals: lifecycle 55, evidence 39, cash 22. Existing Project Cost fixture was updated to the approved lifecycle instead of enabling a legacy capability bypass.
- `pnpm db:dev:rls-smoke`: PASS.
- Security advisor: WARN-only. New public SECURITY DEFINER RPC warnings are intentional authenticated wrappers with exact internal permission checks; the advisor also retains the pre-existing leaked-password warning.
- Performance advisor: no C1 warning after the forward evidence-policy correction. One unrelated pre-existing `workflow_definition_snapshots` multiple-policy warning remains.
- Final `pnpm db:dev:status`: 62/62.

## Generated types

`pnpm db:dev:types` updated only `shared/types/database.types.ts`. The final corrective diff adds `c1_read_project_cost_draft_operational`, `c1_list_project_cost_drafts_operational`, and `c1_get_cost_evidence_read_target`; the earlier diff contains publication fields/nullability, evidence tables and relations, payment replacement identity, and the original write RPCs. It also adds the already-applied baseline `project_cost_reconciliation_resolutions` type from migration `20260922024724`; tracked generated types were stale for that existing table before this feature.

## Repository verification

- Pre-Cloud focused suite: PASS, 11 files / 194 tests.
- Evidence/security focused suite: PASS, 5 files / 38 tests.
- P6 cash/source/finance suite: PASS, 6 files / 52 tests.
- Corrective focused suite: PASS, 13 files / 236 tests.
- `pnpm test:unit`: PASS, 150 files / 1,286 tests.
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
- Draft raw-table RLS requires `cost.prepare`; manager-only operational reads use a guarded projection without financial/source fields.
- Evidence is private, immutable, format/size/hash verified, linked-resource authorized, and financially neutral. Authenticated direct upload is enforced by live-intent Storage INSERT RLS; no signed upload token is minted.
- Finalized evidence metadata requires `cost.source.read`; `cost.file.read` grants only guarded raw access when linked-resource visibility also passes.
- Published correction is reasoned, version-safe, and reconstructable from immutable before/after snapshots.
- `project_subcontract_payments` remains the sole canonical subcontract cash ledger; recorded money is immutable and correction is void plus one replacement.
- New `subcontract_labor` cost drafts/publication are blocked.

## Jev acceptance

Phase results were recorded in P1–P6 reports. Final model `jev-1.13.0` returned: permission bypass `0.13`, draft leakage `0.06`, history loss `0.11`, evidence duplicate effect `0.07`, cash duplication `0.15`, cross-company leakage `0.07`.

Disposition: no result identified a supported defect. Deterministic unit/database tests, RLS, migration constraints, and Cloud acceptance are authoritative.

The PR-review pre-fix call returned capability leakage `0.45`, upload-expiry bypass `0.10`, and overstated MIME guarantee `0.58`; this reinforced the deterministic review findings and explicit verification wording. After all deterministic checks and the independent-review correction were green, the final corrective call returned manage→prepare bypass `0.12`, file→source metadata bypass `0.09`, expired upload write `0.09`, misleading MIME verification `0.34`, and cross-company evidence access `0.07`. Two earlier attempts at the same final request failed at the network boundary; later identical calls returned typed results. No credential or request file was committed.

## Mutation accounting and boundary

Authorized Cloud DEV mutations consumed: twelve forward migrations (six planned plus six acceptance/review-driven corrective migrations). All database test fixtures and pgTAP extension creation were rollback-only. No reset, seed, migration repair, destructive operation, Production operation, UI change, or browser test was performed.

Antigravity contract: `docs/superpowers/specs/2026-09-22-c1-accounting-write-ui-handoff.md`.
