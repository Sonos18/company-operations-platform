# C1 finance API execution progress

Status: IN PROGRESS. P0 is the existing checkpoint; this continuation is implementing P2-P5.

> Execution-policy override (2026-09-19): earlier usage-based voluntary stopping guidance is superseded. This checkpoint is recovery information only; execution continues until an actual stop condition or P2–P5 completion.

| Phase | State | Evidence / next exact step |
|---|---|---|
| P0 Migration checkpoint | complete | `24af8d05a95a1282522cb9d4cbda143a32989a93` pushed to `origin/main`; exactly the two migrations and generated types. |
| P1 Contracts/domain | complete | Strict overview/list/detail DTOs, Decimal/date utilities and conservative reducer are implemented. Focused finance tests pass. |
| P2 Metadata/scoped reads | complete | `20260919183332_c1_project_finance_metadata_reads.sql` is applied; the guarded C1 suite exited 0; concrete projections, scoped keyset scans, 50-ID batching, invariants and two-attempt consistency retry are wired. |
| P3 GET routes | complete | All eight GET methods and exact route files are wired through the cost.read service boundary; focused route/repository tests pass. |
| P4 HTTP/legacy compatibility | complete | Typed active-company HTTP repository and registry wiring are present; legacy routes/writers remain untouched. HTTP and full unit tests pass. |
| P5 Verification/handoff | complete | `pnpm verify:app` exited 0; legacy `pnpm exec playwright test tests/e2e/project-costs.spec.ts` exited 0 with 17 passed; Cloud DEV target/auth/status/dry-run, rollback-only C1 suite, generated types, preservation counts and final diff checks are green. |

## Checkpoint

- Current branch/HEAD: not yet inspected by the executing CodeX run.
- P0 commit/remote SHA: `24af8d05a95a1282522cb9d4cbda143a32989a93`.
- Metadata migration identity/application: `20260919183332_c1_project_finance_metadata_reads.sql`, applied through guarded `pnpm db:dev:push`.
- Last completed test/command and exit code: `pnpm db:dev:types` — exit 0; Cloud DEV status lists 48 aligned migrations and dry-run reports up to date; aggregate preservation query reports 5 categories, 9 classified parents, 432 details; guarded `pnpm db:dev:c1:test` — exit 0.
- Uncommitted files owned by this run: approved plan docs; P1 contracts/utilities/reducer/tests; P2 static contract, metadata migration, and bounded scanner/test.
- Pre-existing files to preserve: inspect once in P0.
- Eight-method map at continuation start: `listProjects` — absent; `overview` — only an injected signature/reducer stub; `budget` — absent; `ownerAdvances` — absent; `subcontractors` — absent; `subcontractor` — absent; `subcontract` — absent; `itemDetails` — absent. `ProjectFinanceTableReader` has only partial generic scans and is not connected to a production repository.
- Final evidence: `pnpm verify:app` exit 0 (136 files / 1,072 tests, typecheck, lint, build); `pnpm exec playwright test tests/e2e/project-costs.spec.ts` exit 0 (17 passed); `git diff --check` and empty-index `git diff --cached --check` pass. API work remains uncommitted by authorization.
- Real financial-data reconciliation: incomplete, separate task.
- UI/writer/status cutover: not authorized in this run.

On interruption, replace this checkpoint with concrete facts and an exact resume command. Do not paste credentials, raw source notes or private financial evidence here.
