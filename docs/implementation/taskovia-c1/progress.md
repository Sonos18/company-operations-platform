# Taskovia C1 Progress

## Current Execution Scope — P3R

The historical phase ledger and plans below are retained unchanged. The active Phase 3 direction is now [Minimal Project Cost Management for VQH](p3r-minimal-project-cost-scope.md), with its approved [minimal domain design](p3r-minimal-project-cost-domain-design.md) and [sequential implementation plan](../../superpowers/plans/2026-09-16-c1-p3r-minimal-project-cost-implementation.md): Project-scoped management costs for contractor/business-item visibility, execution or acceptance status, value, provenance, and Director-readable aggregation. Eo Gió and Yong Mei remain independent Projects. P3A/P3B financial-domain work is historical analysis; accounting, cash, receivable/payable, invoice, budget, forecast, and profit scope is deferred.

## P3R Gate D — Cloud DEV verification

**Status:** `P3R_GATE_D_COMPLETE_WITH_ACCEPTED_ADVISOR_WARNING`. The reviewed `20260916021405_c1_project_cost_items.sql` migration is applied to Cloud DEV; generated types were committed at `b51d7f3cd77696b7401f7fd7bac9ea7363562939`. The final C1 suite at tested SHA `8319af50b7481aba5d2282afd2f8185cb459d7cc` exited 0 and printed foundation, controlled-import commands, controlled-import security, audited source ownership, and `C1_PROJECT_COST_ITEMS_COMPLETE` markers.

Both advisors exited 0 with no error-level finding. Security reported 19 warnings, including three Project Cost public SECURITY DEFINER RPC warnings accepted as known architecture behavior for this gate; performance reported one unrelated `workflow_definition_snapshots` warning. Focused local verification passed 131 tests with zero failures, typecheck, lint, and `git diff --check`. The [Gate D phase report](phase-reports/p3r-gate-d-cloud-verification.md) records the warning rationale and resolved fixture blockers.

Gate E business confirmation is **VQH_BUSINESS_APPROVED**; the original deterministic [execution packet v1](phase-reports/p3r-gate-e-vqh-project-cost-execution-packet.md) remains **SUPERSEDED_FOR_EXECUTION_ACTOR** and the accountant-pinned [execution packet v2](phase-reports/p3r-gate-e-vqh-project-cost-execution-packet-v2.md) executed successfully. The [real VQH load report](phase-reports/p3r-gate-e-vqh-project-cost-real-load.md) records nine Project Cost items, 15 provenance links, nine create receipts, nine audit events, and exact Eo Gió/Yong Mei aggregate reconciliation. Gate E real VQH Project Cost load is **COMPLETE**. Gate F is **NOT STARTED** and **NOT AUTHORIZED**; Gate G and Gate H remain later P3R work. The original C1 phase ledger below is a historical record and does not set the current P3R gate status.

Post-Gate-E [RBAC hardening is COMPLETE](phase-reports/p3r-post-gate-e-rbac-hardening-cloud.md): canonical `accountant` has `cost.read` and `c1_vqh_cost_operator` has only `cost.manage` plus `cost.correct`. Gate E remains **COMPLETE** and Gate F remains **NOT STARTED / NOT AUTHORIZED**.

## Control Record

| Field | Value |
| --- | --- |
| Approved Taskovia C1 integration base | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Previous documentation main | `51e8c76d08b23bcf5c0aea2ddd95cecb9dd1f5a7` |
| Preserved Stage 01 checkpoint | `3d021b35b1228ffdd46a8dbb9884a59c00ab6c89` |
| Preserved integration merge | `8a005a4b86202253db3a9258d9dd2733ef20ff97` |
| EOL portability repair | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Historical P1 Cloud DEV migration inspection | 33 source migrations / 33 applied migrations; P1 foundation applied in the authorized P1.4B run |
| Runtime used for P0.5/P0.6 verification | Node `v24.19.0`, pnpm `10.29.3` |
| Current C1 branch | `main` (active P3R execution track) |
| Active P3R execution status | Gate D complete with accepted known advisor warning; Gate E business confirmation approved for nine items; real VQH Project Cost load not executed or authorized; Gate F aggregation/API hardening not started |
| Historical original C1 status snapshot | P1 complete; P2.0 accepted; P2.1 frozen; P2.3 Cloud fixtures accepted; focused workbook-family adapter plus offline/guarded execution/reconciliation commands implemented and real workbooks verified offline; final command-path Cloud evidence, concurrency, and P2.4 authorization remained, so P2 was partial; P3–P6 were not started in that snapshot |

## P0 Result

**Status:** Complete planning baseline; only the three P0 documentation artifacts are authorized on `feat/taskovia-c1`.

**Phase start SHA:** `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd`
**Tested code SHA:** `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd`
**Application result:** P0 created no C1 application code, migration, generated type, Cloud DEV mutation, or synthetic database fixture. The integration baseline was verified with unit/typecheck/lint/build/Playwright before this planning branch.

**P0 artifacts:**

- `docs/superpowers/plans/2026-09-11-taskovia-c1-implementation.md`
- `docs/implementation/taskovia-c1/acceptance-map.md`
- `docs/implementation/taskovia-c1/progress.md`

**Open implementation work:** P1 acceptance gap plus P2 through P6 exactly as allocated in the plan and acceptance map.

## P1 Result

**Status:** Complete. The P1 database foundation, runner, and transactional synthetic Cloud fixture now cover both manual and `legacy_import` Project Register creation; P2–P6 remain separately authorized work.

**Implementation checkpoints:**

- P1.3B server/HTTP slice: `f458c14012a99c734ca75afeb088b515bae91866`
- P1.4A transactional fixture: `d7a5c88a2a2718ebba7d48da5dda02809685739c`
- P1 ACL repair: `e1ef357573afb4a45d5746b01d5cb9fdddec28ca`
- P1 generated-types reconciliation: `db47ccd5856f788d05db73ab3de8c42eab00f600`
- Runner/A01 fixture checkpoint: `606c83406aaa6f7117a66003a01cbadaeee97eca`
- Fixture ambiguity correction / Cloud Run #2 candidate: `a953022bf6e12089dd7382332b722d4b4c474780`

**Database evidence:** The single P1 migration `20260911145035_taskovia_c1_foundation.sql` was applied to Cloud DEV in P1.4B. Its SHA-256 remains `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556`; guarded Cloud DEV parity is 33/33. The original P1.4B Windows CLI exit-0 result is retained as historical but is not SQL-execution evidence because it did not enter the C1 runner. Post-repair Run #1 at `606c834...` entered the runner and Supabase child but failed at the pre-existing fixture SQLSTATE `42702` engagement-column ambiguity before either marker or A01. Post-repair Run #2 at `a953022...` passed: it emitted `C1_FOUNDATION_FIXTURE_COMPLETE` after all assertions, including the preceding A01 marker and manual/`legacy_import` Project Register cases, then reached the fixture's terminal rollback. All data was synthetic and transaction-scoped, so zero run-owned master-data residue remained; no real company was enabled and no real account received a C1 permission.

**Application evidence:** Shared schema, deterministic server/route/HTTP-repository tests, registry wiring, generated types, and `verify:app` passed at `db47ccd5856f788d05db73ab3de8c42eab00f600`; the runner/A01 checkpoint passed `verify:app` at `606c834...` (102 files / 751 tests) and the corrected fixture passed the focused C1 set (3 files / 15 tests). These are not presented as live browser-to-Cloud evidence. The complete generated snapshot and its pre-existing Stage 01 provenance are recorded in `p1-generated-types-reconciliation.md`.

**Remaining work:** P2–P6 remain not started. Acceptance rows retain their listed partial status until source/files, financial documents, allocations/reporting, UI/E2E, and P6 evidence are authorized and executed.

## P2 v1.1 implementation disposition

**Status:** Superseded before Cloud application. The v1.1 runtime upload/preview direction was never applied to Cloud and its fixtures were never executed. P2 v1.2 replaces initial ingestion with controlled import of explicitly provided accounting files; see [v1.2](../../superpowers/specs/taskovia-cost-management-v1.2/README.md) and [its implementation plan](../../superpowers/plans/2026-09-13-taskovia-c1-v1.2-implementation.md).

**Checkpoints:** `86a4ffc` (file lifecycle/preview), `b4523c1` (source intake), `ba0ac0b` (migration candidate/fixtures), `61ac648` (lint repair).

**Pre-Cloud evidence:** `pnpm verify:app` passed 107 test files / 768 tests, typecheck, lint, and production build. The focused P2 suites cover server-only static XLSX behavior, file permission/lifecycle, source intake without project/engagement, locator normalization, non-posting source share/figures, source review, HTTP repository scope, and guarded P2 fixture allowlisting. The P1 migration SHA remains `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556`.

**Cloud boundary:** The superseded `20260912062227_taskovia_c1_sources_files.sql` remains removed and was never applied. The replacement `20260913082034_taskovia_c1_controlled_import.sql` is a candidate only. P2 Cloud migration/SQL fixture executions and database type generation remain zero.

**Current direction:** P2.0 is accepted: it removed the deferred runtime upload/preview path and the never-applied v1.1 P2 migration/fixtures. P2.1 is frozen. P2.3 now adds a reviewed-request service/repository boundary, one forward controlled-import persistence migration candidate, and rollback-safe synthetic command/security fixtures. The migration and fixtures have not been applied or executed; database, RLS, and concurrency claims await a separately authorized Cloud DEV run. No real adapter, workbook import, P3 financial activation, or runtime upload/preview path exists.

## P2.3 pre-Cloud result

**Status:** `TRACK_A_P2_3_PRE_CLOUD_READY` candidate at the pre-Cloud review gate; not P2 complete.

- Phase start: `8eb675fced49eedf2d0967ae6622ca2a161248eb`.
- Tested code: `2279d920ab9b465e256182ab07b27674462002d2`.
- Candidate migration: `20260913082034_taskovia_c1_controlled_import.sql`, SHA-256 `9E35E5C8B315CDF7646C29E83993265E1C87C40DE5E961074F0296C2E411B906`.
- P1 foundation remains SHA-256 `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556`.
- Local application verification: `pnpm verify:app` passed 107 test files / 775 tests, typecheck, lint, and production build at the tested code SHA.
- SQL evidence: both new fixtures pass the local runner/static contract checks and are allowlisted after the preserved P1 fixture. They are prepared only and **NOT EXECUTED**.
- Cloud DEV operations, migration applications, SQL executions, generated database types, Local DB, Production, real workbook analysis/import, and real-company enablement in this phase: `0`.
- Commits: `a6a9439` service/repository boundary; `6bdabb3` migration/fixtures/runner; `6f2ef4c` occurrence/RLS hardening; `2279d92` reconciliation-test preservation.

## P2.3 Cloud execution attempt

**Status:** `BLOCKED` before mutation. The authorized packet began at `08ad6c2ca7fbe9a50755859e44d97489932c09c6`; branch, remote, `origin/main`, P1/P2 hashes, frozen P2.1 exports, focused five-file Vitest (5 files / 32 tests), and `git diff --check` passed. Guarded Cloud DEV target and preflight status passed at 33 matched migrations plus only the approved P2 candidate.

The first permitted pinned read-only collision/residue baseline inspection failed before execution with SQLSTATE `22P02`, caused by a malformed synthetic UUID literal in that inspection query. A later explicit continuation authorized exactly one corrected baseline execution; it passed with no synthetic collision or P2-object residue. The one authorized dry-run then proposed only the reviewed migration, but the one authorized push failed with SQLSTATE `42703`: `source_review_issues_selection_idx` referenced absent `created_at`. Bounded outcome inspection confirmed no migration-history entry or P2 schema/RPC residue. The local candidate is now repaired to use declared `opened_at`, protected by an all-seven-index structural regression, and awaits review/new Cloud authorization. Fixtures and type generation remain not started. See [P2.3 Cloud execution review](phase-reports/p2-3-cloud-review.md). P2.3 remains unproven, concurrency is `NOT_RUN`, P2 remains partial, and P2.4/P3 are not authorized/started.

## Execution Contract

1. Every subsequent prompt authorizes **one phase only**. Stop at its review gate; do not begin the next phase.
2. Before any phase, re-read the v1.1 specs, implementation plan, acceptance map, and this progress file. Fetch and verify the last reviewed remote checkpoint. Unexpected commits, a changed base, or material drift requires review, never silent rebasing.
3. Implement C1 only. Do not add attendance, settlement/rate engines, general Excel ETL, intercompany accounting, real-data migration, C2/C3 behavior, or a substitute business/security contract merely to make a test pass.
4. Use TDD for behavior changes and real authenticated HTTP repositories at runtime. Mocks are test doubles only and are never C1 production fallback.
5. A later phase authorizes only its reviewed forward migrations, guarded tests, and run-owned synthetic fixtures on verified Supabase Cloud DEV. Dry-run first; stop if the target changes, extra/unrelated migrations would apply, or the guard cannot enforce scope. No Local DB fallback.
6. Keep the module disabled for real companies. Deploy compatible application code before assigning any new C1 permission, even to synthetic test actors; no real-account grants are implied.
7. Never commit or log real workbook/payroll/contract data. Never perform Production work, real VQH mutation, destructive reset/repair, force push, migration rewrite, or merge outside explicit current authorization.
8. A phase report must state: status; phase result; `phase_start_sha`; `tested_code_sha`; `head_sha`; `remote_head_sha`; create/edit file list; migration list; commands/results/environment; requirement evidence; remaining work; and blockers. A report-only commit is not an application test run.
9. At a phase gate update this file and `acceptance-map.md`, commit scoped work, push non-force, fetch, and prove the matching remote HEAD. Unrun or failed required checks cannot produce PASS. Preserve partial work and report it honestly, then stop.

## C1 Database-Test Boundary

P1 must add `pnpm db:dev:c1:test` backed by `scripts/run-c1-cloud-dev-tests.mjs`. It will run only fixed allowlisted `supabase/tests/database/c1/*.sql` files that are transaction-wrapped and reject `commit`, reset, seed, repair, migration-history, and non-synthetic fixture operations before Cloud access. Stage 01's runner is not a C1 runner.

Synthetic C1 scope is reserved as follows:

- tenant A: `c1000000-0000-4000-8000-000000000010`
- company A1: `c1000000-0000-4000-8000-000000000020`
- company A2: `c1000000-0000-4000-000000000021`
- tenant B: `c1010000-0000-4000-8000-000000000010`
- company B1: `c1010000-0000-4000-000000000020`
- importer/viewer/project-only actors: IDs ending `...901`, `...902`, `...903`; generated `@taskovia.invalid` identities only
- private objects: `taskovia-c1-financial` bucket and `c1-acceptance/<run-id>/<file-id>` keys only

Every C1 file test proves both same-tenant/different-company and cross-tenant denial, plus denial when a reader has only `cost.read` or `project.read` but lacks both `cost.source.read` and `cost.file.read`.

## Phase Ledger

| Phase | Status | Scope | Gate |
| --- | --- | --- | --- |
| P0 | Complete after scoped commit/push verification | Execution preflight, v1.1 plan, acceptance map, progress contract | Remote `feat/taskovia-c1` equals local planning head |
| P1 | Complete after fixture correction and Cloud Run #2 | Secure schema/contracts, permissions, disabled settings, master-data APIs, C1 runner | P2 requires separate authorization |
| P2 | Partial — P2.3 pre-Cloud candidate ready | Controlled-import runs, accounting sources/versions, provenance selections, figures, review issues, receipts/events | Separate Cloud migration/RLS/RPC/fixture authorization and proof required; no P3 start |
| P3 | Not started | Financial documents, publication, confirmation, provenance/evidence | Review exactly-once activation and history before P4 |
| P4 | Not started | Allocations, corrections, disputes, coverage, comparison | Review arithmetic/concurrency/coverage evidence before P5 |
| P5 | Not started | Reporting, `/costs`, complete operational UI | Review real HTTP UI/company-switch evidence before P6 |
| P6 | Not started | Full C1 acceptance and handoff | Stop after final report/remote checkpoint; no P1+ continuation without a new prompt |

## Dependency Record

- SheetJS CE: exact `0.20.3` CDN tarball, Apache-2.0, server-only static XLSX preview. Parse limits and no formula/macro/link execution are mandatory.
- decimal.js: exact `10.6.0`, MIT, used only for validated decimal-string financial arithmetic.
- No framework, Node engine, Supabase client, or unrelated package upgrade is authorized by this plan.

## Scope Confirmation

```yaml
stage01_marked_complete: false
production_touched: false
cloud_dev_writes: true # one P1 foundation migration and two post-repair synthetic fixture executions
real_vqh_data_touched: false
p1_started: true
```
# P2.4 source UI (repository slice)

- Added the read-only C1 cost-source API and management UI routes.
- No Cloud database mutation, import, migration, or P3 publication work was performed by this repository slice.
- Real VQH runtime verification remains dependent on the separate Track A database handoff.
