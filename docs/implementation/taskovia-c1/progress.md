# Taskovia C1 Progress

## Control Record

| Field | Value |
| --- | --- |
| Approved Taskovia C1 integration base | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Previous documentation main | `51e8c76d08b23bcf5c0aea2ddd95cecb9dd1f5a7` |
| Preserved Stage 01 checkpoint | `3d021b35b1228ffdd46a8dbb9884a59c00ab6c89` |
| Preserved integration merge | `8a005a4b86202253db3a9258d9dd2733ef20ff97` |
| EOL portability repair | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Cloud DEV migration inspection | 33 source migrations / 33 applied migrations; P1 foundation applied in the authorized P1.4B run |
| Runtime used for P0.5/P0.6 verification | Node `v24.19.0`, pnpm `10.29.3` |
| Current C1 branch | `feat/taskovia-c1` |
| C1 implementation status | P1 foundation implementation complete; P1 acceptance review partial on A01 `legacy_import` Cloud execution; P2–P6 not started |

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

**Status:** Foundation implementation complete; acceptance review partial. The missing P1 evidence is A01's separate `legacy_import` project creation through the Cloud fixture. The P1.4B fixture proves a manual project is Opportunity/Workflow-independent, and the shared contract accepts `legacy_import`, but those are not the same DB execution.

**Implementation checkpoints:**

- P1.3B server/HTTP slice: `f458c14012a99c734ca75afeb088b515bae91866`
- P1.4A transactional fixture: `d7a5c88a2a2718ebba7d48da5dda02809685739c`
- P1 ACL repair: `e1ef357573afb4a45d5746b01d5cb9fdddec28ca`
- P1 generated-types reconciliation: `db47ccd5856f788d05db73ab3de8c42eab00f600`

**Database evidence:** The single P1 migration `20260911145035_taskovia_c1_foundation.sql` was applied to Cloud DEV in P1.4B. Its SHA-256 is `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556`; observed parity is 33/33. The actual C1 Cloud fixture passed with synthetic-only identities, ACL/RPC/RLS checks, and zero run-owned master-data residue after rollback. No real company was enabled and no real account received a C1 permission.

**Application evidence:** Shared schema, deterministic server/route/HTTP-repository tests, registry wiring, generated types, and `verify:app` passed at `db47ccd5856f788d05db73ab3de8c42eab00f600`. These are not presented as live browser-to-Cloud evidence. The complete generated snapshot and its pre-existing Stage 01 provenance are recorded in `p1-generated-types-reconciliation.md`.

**Remaining work:** A narrow authorized Cloud fixture execution is required to close A01's `legacy_import` DB evidence. P2–P6 remain not started. Acceptance rows retain their listed partial status until source/files, financial documents, allocations/reporting, UI/E2E, and P6 evidence are authorized and executed.

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
| P1 | Foundation implementation complete; acceptance evidence partial | Secure schema/contracts, permissions, disabled settings, master-data APIs, C1 runner | A01 `legacy_import` Cloud fixture execution remains before P1 acceptance closure; P2 requires separate authorization |
| P2 | Not started | Accounting sources, immutable private files, selections, figures, review issues, preview | Review private-file/source boundary before P3 |
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
cloud_dev_writes: true # one authorized synthetic-only P1 foundation migration/fixture run
real_vqh_data_touched: false
p1_started: true
```
