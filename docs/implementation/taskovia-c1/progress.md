# Taskovia C1 Progress

## Control Record

| Field | Value |
| --- | --- |
| Approved Taskovia C1 integration base | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Previous documentation main | `51e8c76d08b23bcf5c0aea2ddd95cecb9dd1f5a7` |
| Preserved Stage 01 checkpoint | `3d021b35b1228ffdd46a8dbb9884a59c00ab6c89` |
| Preserved integration merge | `8a005a4b86202253db3a9258d9dd2733ef20ff97` |
| EOL portability repair | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Cloud DEV migration inspection | 32 source migrations / 32 applied migrations; read-only verification |
| Runtime used for P0.5/P0.6 verification | Node `v24.19.0`, pnpm `10.29.3` |
| Current C1 branch | `feat/taskovia-c1` |
| C1 implementation status | Not started |

## P0 Result

**Status:** Complete planning baseline; only the three P0 documentation artifacts are authorized on `feat/taskovia-c1`.

**Phase start SHA:** `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd`
**Tested code SHA:** `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd`
**Application result:** P0 created no C1 application code, migration, generated type, Cloud DEV mutation, or synthetic database fixture. The integration baseline was verified with unit/typecheck/lint/build/Playwright before this planning branch.

**P0 artifacts:**

- `docs/superpowers/plans/2026-09-11-taskovia-c1-implementation.md`
- `docs/implementation/taskovia-c1/acceptance-map.md`
- `docs/implementation/taskovia-c1/progress.md`

**Open implementation work:** P1 through P6 exactly as allocated in the plan and acceptance map.

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
| P1 | Not started | Secure schema/contracts, permissions, disabled settings, master-data APIs, C1 runner | Review P1 migration/RLS/HTTP evidence before P2 |
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
cloud_dev_writes: false
real_vqh_data_touched: false
p1_started: false
```
