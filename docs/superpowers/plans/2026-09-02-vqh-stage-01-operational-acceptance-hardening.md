# VQH Stage 01 Operational Acceptance & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the merged VQH Stage 01 product is ready for a controlled pilot by running real Cloud DEV acceptance, fixing only evidence-backed reliability/performance defects, and producing a deterministic `READY_FOR_VQH_PILOT` report.

**Architecture:** B4 adds a test-only Cloud DEV acceptance tenant/company and a separate Playwright project that uses real `/login`, Nitro APIs, user JWTs, RLS and RPCs without Stage 01 business-route interception. It reuses existing DB/concurrency/security runners, hardens the merged B3 command/reload contract, measures `Stage01OperationalDetail`, and batches current N+1 reads only after the baseline request-count test proves the approved performance envelope is exceeded.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Nuxt UI 4.4.0, Zod 4, Vitest 4.1.9, Playwright 1.61.1, Supabase JS 2.112+, Node 24, Supabase Cloud DEV, existing pgTAP/Management-API runners.

**Spec:** `docs/superpowers/specs/2026-09-01-vqh-stage-01-operational-acceptance-hardening-design.md`

## Global Constraints

- Source-code anchor is exactly `main@8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`.
- Approved design commit is `7640a9fcbbd983477637c7392f1093916c5cc2de`.
- B4 is acceptance-first: reproduce/measure before correction; no speculative refactor.
- Do not create Stage 02, Project conversion, generic workflow rendering/building, runtime-table generalization, or completion-baseline redesign.
- Canonical VQH business company must receive zero B4 operational fixture Opportunities, Contacts, decision cycles, assignments, or blockers.
- Real browser acceptance uses a dedicated Cloud DEV test-only acceptance tenant/company.
- Service-role access is test-fixture bootstrap/maintenance only. Accepted business requests must use normal JWTs and existing user-scoped application repositories.
- No Stage 01 business API route interception is allowed in the B4 full-stack Playwright project.
- Existing deterministic/intercepted E2E remains the fast regression layer and must stay passing.
- No database migration, RLS change, new permission, schema change, or generated DB type change is authorized by this plan.
- Cloud DEV fixture/data mutation is authorized only inside the canonical guarded Cloud DEV project and the dedicated acceptance boundary.
- Production mutation/deployment is forbidden.
- Retained immutable acceptance-company history is allowed and must be marked/documented; broad cleanup/truncate/reset is forbidden.
- `Stage01OperationalDetail` P3 envelope: <=25 server-to-Supabase requests, <=2 MiB uncompressed JSON, warm local-Nitro→Cloud DEV p95 <=2.0 s across >=20 reads, individual measured request <=3.0 s unless Cloud DEV degradation is independently demonstrated.
- If a measured fix requires a migration/index/RLS/business-semantic change, STOP for an amendment.
- Final static security scan must have zero unresolved critical/high findings and must finalize successfully.
- Final readiness report is `docs/acceptance/vqh-stage-01-operational-readiness.md` and must end `READY_FOR_VQH_PILOT` to be mergeable.

---

## File Structure

### Acceptance infrastructure

- `playwright.b4.config.ts` — slow real-Cloud-DEV Playwright project.
- `scripts/stage01-b4-acceptance-fixture.mjs` — guarded acceptance boundary, actor credentials and read-profile bootstrap.
- `tests/acceptance/stage01-cloud-dev/global-setup.ts` / `global-teardown.ts` — per-run credential lifecycle.
- `tests/acceptance/stage01-cloud-dev/acceptance-state.ts` — strict runtime-state reader/types.
- `tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts` — S01, S08, selected S04/S06/S09 through real browser/API/backend.
- `tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts` — P1/P2/P3 real API latency/payload measurement during the same guarded Playwright run.
- `tests/unit/config/stage01-b4-acceptance-contract.spec.ts` — target/secret/no-interception contract.

### DB/runtime acceptance

- `supabase/tests/database/stage01_b4_acceptance.test.sql` — explicit S02/S03/S04/S05/S06/S09/S10 evidence.
- `scripts/run-supabase-dev.mjs` + `tests/unit/config/supabase-cloud-dev-runner.spec.ts` — fixed guarded test inventory.

### Reliability hardening

- `app/errors/client-error.ts`
- `app/composables/useStage01Operational.ts`
- `app/pages/opportunities/[opportunityId]/stage-01.vue`
- `tests/unit/stage01-operational/use-stage01-operational.spec.ts`
- `tests/e2e/stage01-operational.spec.ts`

### Performance hardening after measured failure

- `server/features/stage01/stage01.repository.ts`
- `tests/unit/server/stage01.repository-performance.spec.ts`
- `tests/unit/server/stage01.repository.spec.ts`

### Dense UI / readiness evidence

- `tests/e2e/stage01-operational-hardening.spec.ts`
- `docs/acceptance/vqh-stage-01-operational-readiness.md`
- `package.json` — B4-only command; B4 Cloud DEV tests remain outside normal `pnpm test:e2e`.

---

### Task 1: Build the guarded B4 Cloud DEV acceptance boundary

**Files:** Create the B4 Playwright config, fixture script, setup/teardown/state files and acceptance-contract unit test; modify `package.json`.

**Interfaces:**

```ts
export interface B4AcceptanceState {
  runMarker: string
  tenantId: string
  companyId: string
  companyCode: 'VQH_STAGE01_ACCEPTANCE'
  acceptanceSnapshotId: string
  actors: {
    reader: B4ActorCredential
    operator: B4ActorCredential
    decision: B4ActorCredential
  }
  profiles: {
    p1OpportunityId: string
    p2OpportunityId: string
    p3OpportunityId: string
  }
}

export interface B4ActorCredential {
  userId: string
  employeeId: string
  email: string
  password: string
}
```

Runtime state exists only at `test-results/b4-stage01/acceptance-state.json`; never commit or print passwords.

- [ ] **Step 1: Write the failing acceptance-contract unit test.** Lock the fixed constants `taskovia-b4-acceptance`, `VQH_STAGE01_ACCEPTANCE`, tenant ID `b4000000-0000-4000-8000-000000000010`, and company ID `b4000000-0000-4000-8000-000000000020`. Static-scan full-stack spec files and reject `page.route(`, `context.route(` and `route.fulfill(` business-route replacement. Run the test and confirm failure before the modules exist.

- [ ] **Step 2: Implement guarded environment/credential handling.** In `scripts/stage01-b4-acceptance-fixture.mjs`, call `assertCloudDevTarget({ cwd })` before mutation, load `.env.local`, require the Cloud DEV URL/anon/service-role values, create per-run random passwords, and never log secrets. If bootstrap fails after rotating/creating any credential, execute credential deactivation/rotation in the helper's own `catch/finally` path; do not rely only on Playwright global teardown.

- [ ] **Step 3: Bootstrap the stable acceptance tenant/company and exact test roles.** Service-role operations are allowed only inside this test helper. Ensure:

  - a fixed acceptance tenant/company;
  - a reader role with `project.read`, `opportunity.read`, `journey.read`;
  - an operator role with `project.read`, Stage 01 Opportunity/Workflow/evaluation/recommendation/clarification operational permissions and employee directory access, but no final-decision/reactivation permission;
  - an acceptance-company `company_admin` role mirroring the canonical explicit permission catalog for the decision actor, so existing decision-authority resolution is exercised rather than bypassed;
  - three stable Auth users, memberships, employee rows and active role assignments;
  - no canonical VQH role/permission/member mutation.

- [ ] **Step 4: Copy current published `vqh.stage01` definition into the acceptance company without rewriting history.** Read canonical VQH's latest published snapshot using fixture-level service role. If that exact definition hash is absent in the acceptance company, append a new acceptance snapshot version. Never update/delete an old snapshot. Return the current acceptance snapshot ID in `B4AcceptanceState`.

- [ ] **Step 5: Ensure three retained read-only performance profiles.** Profiles are test-only records in the acceptance company and keyed to source anchor `8e1abc74` so repeated B4 runs reuse them. P1 = 1 cycle/5 criteria/2 contacts; P2 = 5 cycles/10 contacts/revisions; P3 = 20 cycles/20 contacts/repeated evaluations/recommendations/clarifications. Fixture-level service role may synthesize these read profiles, but only inside the acceptance company and with valid foreign-key/schema relationships. If a profile for this source anchor already exists, validate and reuse it rather than mutate immutable history.

- [ ] **Step 6: Implement setup/teardown state lifecycle.** `global-setup.ts` calls `bootstrapB4Acceptance()`, writes the strict state file with restrictive permissions, and records a non-secret run marker. `global-teardown.ts` rotates/disables actor credentials and removes the local state file in `finally`; intentional acceptance-company business/audit history remains. Teardown also asserts canonical VQH contains no current-run marker in Stage 01 business records.

- [ ] **Step 7: Add `playwright.b4.config.ts`.** Use port 4327, workers=1, `testDir='./tests/acceptance/stage01-cloud-dev'`, 120s test timeout, global setup/teardown, and `pnpm dev --host 127.0.0.1 --port 4327`. Do not replace Cloud DEV URL/key with the fake normal-E2E target. Global setup must fail closed if `.env.local` or linked project is not canonical Cloud DEV.

- [ ] **Step 8: Add only `test:b4:cloud-dev` to `package.json`.** Value: `playwright test --config=playwright.b4.config.ts`. Do not include it in normal `test:e2e`.

- [ ] **Step 9: Run focused unit tests, inspect tracked diff for secrets, then commit.** Commit message: `test(stage01): add guarded B4 Cloud DEV acceptance harness`.

---

### Task 2: Add Cloud DEV DB/runtime acceptance for S02–S06, S09 and S10

**Files:** Create `supabase/tests/database/stage01_b4_acceptance.test.sql`; modify the guarded Stage 01 test inventory and its unit test.

- [ ] **Step 1: Add the new test filename to `STAGE01_TEST_FILES` and first make the runner unit test fail because the SQL file is absent.**

- [ ] **Step 2: Implement a transactional SQL acceptance file (`BEGIN`/`ROLLBACK`) with explicit sections named B4-S02, B4-S03, B4-S04, B4-S05, B4-S06, B4-S09 and B4-S10.** Reuse existing public Opportunity/Workflow/Stage01 RPC contracts. Do not add a production RPC/schema.

  - S02: `not_proceeding` can complete and stays readable/immutable.
  - S03: Recommendation v1 → clarification → new evidence → Recommendation v2; old records remain immutable.
  - S04: blocking blocker prevents completion until resolved; resolved history remains.
  - S05: unresolved duplicate blocks Intake completion until approved resolution.
  - S06: dependency-changing Intake mutation marks downstream stale and explicit revalidation is required.
  - S09: missing permission, forged company/resource IDs, history mutation, create-options projection and employee-private separation all fail safely.
  - S10: create A while snapshot N is latest; append N+1; create B; prove A workflow instance remains bound to N and B binds N+1.

- [ ] **Step 3: Run `pnpm db:dev:target`, `pnpm db:dev:stage01:test`, `pnpm db:dev:stage01:concurrency`, `pnpm db:dev:stage01:integrity-races`, and `pnpm db:dev:rls-smoke`.** All must pass. A failure requiring migration/RLS/business-semantic change is a stop condition; an ordinary implementation defect inside approved semantics may be fixed with a focused regression.

- [ ] **Step 4: Commit.** Message: `test(stage01): add B4 runtime acceptance scenarios`.

---

### Task 3: Prove S01/S08 and selected S04/S06/S09 through real browser → Nitro → Cloud DEV

**Files:** Create `tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts`; use the state/fixture helpers from Task 1.

- [ ] **Step 1: Add a real `/login` smoke test using the decision actor credential from runtime state.** After login, assert the active company is `VQH_STAGE01_ACCEPTANCE`, not canonical VQH.

- [ ] **Step 2: Implement B4-S01 entirely through the merged UI and real API.** Create a run-marked Opportunity; satisfy server-returned Intake gates; create/link a usable primary Contact; add required Scope/Referrer/Intake Record; assign an accountable owner through the real employee picker; start/complete 01.1; start 01.2; evaluate every non-optional applicable criterion; submit recommendation; record `proceed` as the acceptance company-admin/decision actor; complete 01.2; reload browser and prove both nodes/final decision/history remain canonical. Do not directly write `decision_authority_user_id` in fixture code to make this scenario pass.

- [ ] **Step 3: Add selected real browser checks for S04 and S06.** An open blocking blocker must block completion until resolution; a post-Intake dependency mutation must expose revalidation and require explicit reason/evidence.

- [ ] **Step 4: Implement B4-S08 using a completed run-marked Opportunity.** Reactivate through UI, verify exact canonical cycle increment, old cycle immutability and ordered history after browser reload.

- [ ] **Step 5: Add selected S09 checks.** Reader sees no mutations; operator cannot final-decision/reactivate; decision actor sees decision action only with bound capability; an acceptance actor calling a canonical-VQH company API path is rejected; invalid/expired bearer fails safely.

- [ ] **Step 6: Run `pnpm test:b4:cloud-dev -- --workers=1 --reporter=line`.** The full-stack file must contain no business-route interception. Commit only after PASS. Message: `test(stage01): prove real Cloud DEV operational journeys`.

---

### Task 4: Harden command-success / canonical-reload failure and mutation locking

**Files:** Modify `app/errors/client-error.ts`, `app/composables/useStage01Operational.ts`, the Stage 01 page, and focused unit/E2E tests.

**Client-only error contract:** append `'CANONICAL_RELOAD_REQUIRED'` to the existing union after `'MALFORMED_RESPONSE'`; do not add a server API error code.

**Composable contract:** expose `canonicalSyncRequired: Readonly<Ref<boolean>>` alongside existing `detail`, `operation`, `error`, `pending`, `load`, and `runAndReload`.

- [ ] **Step 1: Write failing unit tests** proving five distinct cases: command failure leaves sync fresh; command success + GET failure marks sync required and retains old detail; a second mutation is rejected before invoking its action while stale; successful explicit `load()` clears stale; rapid double invocation sends exactly one action.

- [ ] **Step 2: Implement two-phase `runAndReload`.** After a successful mutation, canonical GET failure throws a client-only `CANONICAL_RELOAD_REQUIRED` with Vietnamese copy stating the operation may already have succeeded and the user must reload before continuing. Never replay the mutation. `load()` clears the flag only after a successful canonical GET.

- [ ] **Step 3: On `/opportunities/:id/stage-01`, show a prominent stale-after-command alert with an explicit `Tải lại dữ liệu chính thức` button.** Keep content visible but disable operational form controls while `pending || canonicalSyncRequired` using a page-level disabled fieldset or an equally semantic single lock. Do not create a second global navigation guard.

- [ ] **Step 4: Extend deterministic B3 E2E** to prove command-success/GET-500 copy, no second mutation while stale, reload restores controls, double-submit makes one request, and company switch/navigation during an in-flight mutation never renders another company's aggregate or a false global success.

- [ ] **Step 5: Run focused unit/E2E and `pnpm verify:app`; commit.** Message: `fix(stage01): harden canonical reload recovery`.

---

### Task 5: Measure P1/P2/P3 and remove the proven Stage01 read N+1 without schema changes

**Files:** Create `tests/unit/server/stage01.repository-performance.spec.ts`; modify Stage01 repository only after baseline failure; create `tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts`.

- [ ] **Step 1: Build a deterministic fake Supabase client for P1/P2/P3 and count terminal query/RPC calls.** First run must capture the merged baseline before production optimization. Assert P3 <=25; if the current per-cycle/per-contact structure exceeds it, retain the failing number as evidence.

- [ ] **Step 2: When the baseline exceeds 25, batch only the measured loops.** Add `.in(column, values)` to the repository-local query interface. Fetch all related Contacts in one query and all Contact Methods in one query; fetch evaluations/recommendations/clarification returns in one query per table for all cycle IDs; group rows in memory by `contact_id`/`decision_cycle_id`. Preserve strict schemas, ordering, bound snapshot, gates, actor capabilities and response shape. No migration/RLS/API change.

- [ ] **Step 3: Re-run mapping + performance unit tests.** P1/P2/P3 must remain schema-equivalent and P3 request count must be <=25.

- [ ] **Step 4: In `stage01-performance.spec.ts`, measure real API performance during the same B4 Playwright run while runtime credentials/local Nitro are available.** Sign in a normal acceptance actor with Cloud DEV anon client, use Bearer requests to the local Nitro Stage01 GET for the state-provided P1/P2/P3 IDs, warm each profile, then measure at least 20 P3 reads. Write non-secret evidence to `test-results/b4-stage01/performance.json`: request-count result from the deterministic test, response UTF-8 byte size, p95 milliseconds and max milliseconds. Do not print passwords/tokens.

- [ ] **Step 5: Run B4 Playwright and `pnpm db:dev:advisors:performance`.** P3 must meet <=25 requests, <=2 MiB, p95 <=2.0s and max <=3.0s. If only latency fails, independently check Cloud DEV health and use the single allowed rerun. A persistent failure that needs index/migration/schema change is a stop condition.

- [ ] **Step 6: Commit.** If repository batching was required: `perf(stage01): batch operational aggregate reads`. If baseline already met the envelope: commit only measurement tests/evidence tooling with `test(stage01): measure operational aggregate performance`.

---

### Task 6: Dense responsive/accessibility acceptance

**Files:** Create `tests/e2e/stage01-operational-hardening.spec.ts`; change UI files only for concrete failures.

- [ ] **Step 1: Create a dense deterministic `Stage01OperationalDetail` fixture** containing 20 cycles, 20 related Contacts and repeated criterion/recommendation/clarification history.

- [ ] **Step 2: At 390×844 and 1440×900, assert `document.documentElement.scrollWidth <= clientWidth`, critical forms/dialogs are keyboard-operable, critical controls have programmatic labels, alerts expose status, and dense history stays readable.

- [ ] **Step 3: Run `@axe-core/playwright` and fail critical violations.** Do not suppress rules to obtain green tests.

- [ ] **Step 4: Apply only the smallest UI correction for reproduced defects, add regression assertions, rerun and commit.** Message: `test(stage01): harden dense operational accessibility` when test-only; use `fix(stage01): ...` if production UI correction is necessary.

---

### Task 7: Run the complete B4 gate, finalize security scan, and write readiness evidence

**Files:** Create `docs/acceptance/vqh-stage-01-operational-readiness.md`; only fix additional defects that remain within B4 scope.

- [ ] **Step 1: Run fresh gates:** `pnpm db:dev:target`, `pnpm db:dev:status`, `pnpm db:dev:stage01:test`, `pnpm db:dev:stage01:concurrency`, `pnpm db:dev:stage01:integrity-races`, `pnpm db:dev:rls-smoke`, `pnpm db:dev:advisors:security`, `pnpm db:dev:advisors:performance`, `pnpm verify:app`, full sequential `pnpm test:e2e`, and sequential `pnpm test:b4:cloud-dev`. All must PASS under the one documented latency-rerun rule.

- [ ] **Step 2: Prove canonical VQH cleanliness** with the guarded fixture assertion: no current B4 run marker or active B4 operational fixture exists in canonical VQH. Retained acceptance-company history is allowed and listed as test evidence.

- [ ] **Step 3: Run the repository-approved security diff scan on the immutable B4 implementation range.** Finalization itself must succeed; unresolved critical=0 and high=0. Record actual medium/low findings and dispositions.

- [ ] **Step 4: Capture `VERIFIED_CODE_SHA=$(git rev-parse HEAD)` after all code/test corrections are complete.** This is the code SHA represented by the readiness evidence; source anchor remains `8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`.

- [ ] **Step 5: Write `docs/acceptance/vqh-stage-01-operational-readiness.md` using observed values only.** Include exact source anchor, verified code SHA, Cloud DEV ref `gtgljlnhwvhqdnwrfdfj`, acceptance company/code, non-secret run marker, S01–S10 PASS/evidence matrix, concurrency/integrity results, bound-snapshot evidence, actual P1/P2/P3 metrics, actual security counts/dispositions, mobile/desktop/a11y evidence, retained-history note, known limitations and final `READY_FOR_VQH_PILOT`. Do not include credentials/tokens and do not use placeholder evidence.

- [ ] **Step 6: Commit the report, run `git diff --check`, then run the final security scan again on final HEAD including the report.** If the final scan changes findings, update the report with actual disposition and repeat until the final report and scan agree.

- [ ] **Step 7: Push only after all gates and scan pass; verify `git ls-remote` equals local HEAD.**

---

## Final Reviewer Checklist

- Acceptance boundary is test-only and canonical VQH has no B4 operational fixture data.
- Full-stack acceptance uses real `/login`, normal JWT and user-scoped DB; no Stage 01 business-route interception.
- S01 and S08 have real Cloud DEV evidence; required S02–S10 layers are complete.
- Final-decision authority is resolved by existing business machinery, not direct fixture mutation of the cycle.
- Command-success/reload-failure cannot trigger duplicate mutation.
- Optimistic concurrency remains explicit and no auto-overwrite occurs.
- Snapshot N/N+1 stability is proven.
- Create-options remains narrow; `employee.read_all` does not imply private details.
- P3 request count/payload/latency are inside the approved envelope.
- No migration/RLS/permission/schema change slipped into B4.
- Dense mobile/desktop Stage 01 has no critical accessibility/overflow defect.
- Security scan finalized with zero unresolved high/critical findings.
- Readiness report contains only observed evidence and ends `READY_FOR_VQH_PILOT` without contradiction.
