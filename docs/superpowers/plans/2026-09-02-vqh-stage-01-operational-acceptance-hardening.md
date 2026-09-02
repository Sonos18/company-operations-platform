# VQH Stage 01 Operational Acceptance & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the merged VQH Stage 01 product is ready for a controlled pilot by running real Cloud DEV acceptance, fixing only evidence-backed reliability/performance defects, and producing a deterministic `READY_FOR_VQH_PILOT` report.

**Architecture:** B4 adds a test-only Cloud DEV acceptance boundary and a separate Playwright project that uses real `/login`, Nitro APIs, user JWTs, RLS and RPCs without Stage 01 route interception. It reuses existing DB/concurrency/security runners, hardens the merged B3 command/reload contract, measures `Stage01OperationalDetail`, and batches current N+1 reads only if the baseline proves the approved performance envelope is exceeded.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Nuxt UI 4.4.0, Zod 4, Vitest 4.1.9, Playwright 1.61.1, Supabase JS 2.112+, Node 24, Supabase Cloud DEV, existing pgTAP/Management-API runners.

**Spec:** `docs/superpowers/specs/2026-09-01-vqh-stage-01-operational-acceptance-hardening-design.md`

## Global Constraints

- Source-code anchor is exactly `main@8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`.
- Design branch anchor before this plan is `7640a9fcbbd983477637c7392f1093916c5cc2de`.
- B4 is acceptance-first: reproduce/measure before correction; no speculative refactor.
- Do not create Stage 02, Project conversion, generic workflow rendering/building, runtime-table generalization, or completion-baseline redesign.
- Canonical VQH business company must receive **zero** B4 operational fixture Opportunities/Contacts/decision cycles/assignments/blockers.
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

### New acceptance infrastructure

- `playwright.b4.config.ts` — slow Cloud DEV acceptance project; real `.env.local`; sequential; no fake Supabase target.
- `scripts/stage01-b4-acceptance-fixture.mjs` — guarded Cloud DEV acceptance tenant/company/auth actor/bootstrap/credential lifecycle.
- `scripts/run-stage01-b4-performance.mjs` — real JWT Stage01 GET warm-up, 20+ reads, p95/payload evidence.
- `tests/acceptance/stage01-cloud-dev/global-setup.ts` — bootstrap acceptance boundary/run marker and write untracked runtime state.
- `tests/acceptance/stage01-cloud-dev/global-teardown.ts` — rotate/disable temporary actor credentials and remove local runtime secret file.
- `tests/acceptance/stage01-cloud-dev/acceptance-state.ts` — strict runtime-state reader/types.
- `tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts` — S01, S04/S06 selected browser checks, S08 and selected S09 checks using real API/backend.
- `tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts` — P1/P2/P3 real API measurements or invokes the dedicated performance helper.
- `tests/unit/config/stage01-b4-acceptance-contract.spec.ts` — acceptance target/secret/no-route-interception contract.

### DB/runtime acceptance

- `supabase/tests/database/stage01_b4_acceptance.test.sql` — explicit B4-S02/S03/S04/S05/S06/S09/S10 acceptance evidence.
- `scripts/run-supabase-dev.mjs` — add the B4 DB acceptance file to the guarded Stage 01 test inventory.
- `tests/unit/config/supabase-cloud-dev-runner.spec.ts` — assert the new DB test remains in the fixed guarded inventory.

### Reliability hardening

- `app/errors/client-error.ts` — add client-only `CANONICAL_RELOAD_REQUIRED`.
- `app/composables/useStage01Operational.ts` — distinguish command failure from command-succeeded/reload-failed; expose canonical-sync-required state.
- `app/pages/opportunities/[opportunityId]/stage-01.vue` — prominent stale-after-command alert and mutation lock until explicit canonical reload.
- `tests/unit/stage01-operational/use-stage01-operational.spec.ts` — orchestration state machine regression.
- `tests/e2e/stage01-operational.spec.ts` — command/reload failure, double-submit, stale-version, navigation/company-switch regression.

### Performance hardening, only after measured failure

- `server/features/stage01/stage01.repository.ts` — batch Contacts/Methods and cycle resources with `.in(...)` rather than per-contact/per-cycle requests.
- `tests/unit/server/stage01.repository-performance.spec.ts` — P1/P2/P3 deterministic request-count instrumentation.
- `tests/unit/server/stage01.repository.spec.ts` — preserve mapping/bound-snapshot/history correctness after batching.

### Dense UI acceptance and readiness evidence

- `tests/e2e/stage01-operational-hardening.spec.ts` — dense history, mobile 390×844, desktop 1440×900, axe/overflow/critical form behavior.
- `docs/acceptance/vqh-stage-01-operational-readiness.md` — final evidence matrix and verdict.
- `package.json` — explicit B4-only commands; do not add B4 Cloud DEV acceptance to normal `pnpm test:e2e`.

---

### Task 1: Build the guarded B4 Cloud DEV acceptance boundary

**Files:**
- Create: `scripts/stage01-b4-acceptance-fixture.mjs`
- Create: `playwright.b4.config.ts`
- Create: `tests/acceptance/stage01-cloud-dev/global-setup.ts`
- Create: `tests/acceptance/stage01-cloud-dev/global-teardown.ts`
- Create: `tests/acceptance/stage01-cloud-dev/acceptance-state.ts`
- Create: `tests/unit/config/stage01-b4-acceptance-contract.spec.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export interface B4AcceptanceState {
  runMarker: string
  tenantId: string
  companyId: string
  companyCode: 'VQH_STAGE01_ACCEPTANCE'
  actors: {
    reader: B4ActorCredential
    operator: B4ActorCredential
    decision: B4ActorCredential
  }
}

export interface B4ActorCredential {
  userId: string
  employeeId: string
  email: string
  password: string
}
```

The runtime state is written only to `test-results/b4-stage01/acceptance-state.json`, never committed or logged with plaintext passwords.

- [ ] **Step 1: Write failing acceptance-contract tests**

Test that the B4 config/fixture modules do not exist yet, then lock these rules:

```ts
expect(B4_ACCEPTANCE_COMPANY_CODE).toBe('VQH_STAGE01_ACCEPTANCE')
expect(B4_ACCEPTANCE_TENANT_CODE).toBe('taskovia-b4-acceptance')
expect(FORBIDDEN_INTERCEPTION_PATTERNS).toEqual(expect.arrayContaining([
  '/opportunities', '/workflow', '/stage-01',
]))
```

Static-scan every `tests/acceptance/stage01-cloud-dev/*.spec.ts` and fail if it contains `page.route(`, `context.route(`, or `route.fulfill(` for business-route replacement.

Run:

```bash
pnpm test:unit -- tests/unit/config/stage01-b4-acceptance-contract.spec.ts
```

Expected: FAIL because B4 acceptance infrastructure does not exist.

- [ ] **Step 2: Implement the fixture guard and environment reader**

In `stage01-b4-acceptance-fixture.mjs`:

```js
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

export const B4_ACCEPTANCE_TENANT_CODE = 'taskovia-b4-acceptance'
export const B4_ACCEPTANCE_COMPANY_CODE = 'VQH_STAGE01_ACCEPTANCE'
export const B4_ACCEPTANCE_TENANT_ID = 'b4000000-0000-4000-8000-000000000010'
export const B4_ACCEPTANCE_COMPANY_ID = 'b4000000-0000-4000-8000-000000000020'

function password() {
  return `B4-${randomBytes(24).toString('base64url')}`
}
```

Before any external mutation:

```js
assertCloudDevTarget({ cwd })
process.loadEnvFile(resolve(cwd, '.env.local'))
```

Require non-empty `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`, and `NUXT_SUPABASE_SERVICE_ROLE_KEY`. Never echo the service-role key or generated passwords.

- [ ] **Step 3: Implement idempotent acceptance tenant/company + current snapshot bootstrap**

Using a service-role Supabase client **only in this test helper**:

1. upsert the fixed acceptance tenant/company;
2. ensure stable non-system test roles for reader/operator/decision;
3. make role-permission sets exact for the acceptance company;
4. create/reuse three stable acceptance Auth users and rotate each to a per-run random password;
5. ensure active memberships and employee rows for those users;
6. copy the latest canonical VQH `vqh.stage01` published definition into the acceptance company only when the acceptance company lacks that definition hash;
7. never write Opportunity/history records into canonical VQH.

Reader permissions are exactly operational read permissions. Operator receives Opportunity/Workflow/evaluation/recommendation/clarification + employee directory permissions but no final-decision permission. Decision receives the operator operational set plus `stage01.decision.record` and `stage01.reactivate`.

Do not change canonical VQH roles or role permissions.

- [ ] **Step 4: Implement run state and credential teardown**

`bootstrapB4Acceptance()` returns `B4AcceptanceState` and writes it to `test-results/b4-stage01/acceptance-state.json` with mode `0600` where supported.

`teardownB4Acceptance()` must:

- rotate acceptance-user passwords to fresh unknown values or disable temporary access;
- remove the local runtime-state file in `finally`;
- leave intentional test-only acceptance-company immutable business/audit history intact;
- assert the canonical VQH business company has no records whose customer/fixture marker starts with the current B4 run marker.

- [ ] **Step 5: Add a separate Playwright B4 config**

`playwright.b4.config.ts`:

```ts
export default defineConfig({
  testDir: './tests/acceptance/stage01-cloud-dev',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  globalSetup: './tests/acceptance/stage01-cloud-dev/global-setup.ts',
  globalTeardown: './tests/acceptance/stage01-cloud-dev/global-teardown.ts',
  use: { baseURL: 'http://127.0.0.1:4327', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4327',
    url: 'http://127.0.0.1:4327',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
```

The config or global setup must call `assertCloudDevTarget()` before the browser/server acceptance run starts.

- [ ] **Step 6: Add explicit scripts and verify unit contracts**

Add:

```json
{
  "test:b4:cloud-dev": "playwright test --config=playwright.b4.config.ts",
  "db:dev:stage01:b4:performance": "node scripts/run-stage01-b4-performance.mjs"
}
```

Do **not** add `test:b4:cloud-dev` to normal `test:e2e`.

Run the focused unit test. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json playwright.b4.config.ts scripts/stage01-b4-acceptance-fixture.mjs tests/acceptance/stage01-cloud-dev tests/unit/config/stage01-b4-acceptance-contract.spec.ts
git commit -m "test(stage01): add guarded B4 Cloud DEV acceptance harness"
```

---

### Task 2: Add explicit Cloud DEV DB/runtime acceptance for S02–S06, S09 and S10

**Files:**
- Create: `supabase/tests/database/stage01_b4_acceptance.test.sql`
- Modify: `scripts/run-supabase-dev.mjs`
- Modify: `tests/unit/config/supabase-cloud-dev-runner.spec.ts`

**Interfaces:** Existing public Opportunity/Workflow/Stage01 RPCs only. No new production RPC/schema.

- [ ] **Step 1: Register a failing fixed DB acceptance file**

Add `supabase/tests/database/stage01_b4_acceptance.test.sql` to the fixed `STAGE01_TEST_FILES` list and update the unit assertion. Run the runner unit test; expected FAIL until the file exists.

- [ ] **Step 2: Implement transactional scenario sections with explicit B4 IDs**

The SQL file must `BEGIN` and `ROLLBACK` and create isolated IDs, actors, company/definition/runtime fixtures. Include explicit assertions named:

```text
B4-S02 not proceeding remains readable/immutable
B4-S03 clarification preserves recommendation v1 and creates v2 path
B4-S04 blocking blocker prevents completion until resolution
B4-S05 unresolved duplicate prevents Intake completion until resolution
B4-S06 dependency change/revalidation is enforced
B4-S09 permission/isolation and immutable-history rejection
B4-S10 snapshot N remains bound while new Opportunity binds N+1
```

For S09, exercise at least one direct public RPC call for each negative permission/isolation class. Assert the narrow create-options RPC does not return draft/raw definition and `employee.read_all` does not authorize private-detail access.

For S10, use two acceptance-definition snapshots inside the transactional test company. Create A while N is latest, insert N+1, create B, then prove A's workflow instance still references N and B references N+1.

- [ ] **Step 3: Run guarded Cloud DEV database acceptance**

```bash
pnpm db:dev:target
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
pnpm db:dev:stage01:integrity-races
pnpm db:dev:rls-smoke
```

Expected: PASS. If a failure demonstrates a business-semantic contradiction or requires migration/RLS correction, STOP for amendment. Ordinary implementation defect within existing semantics may be fixed in B4 with a focused regression.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/database/stage01_b4_acceptance.test.sql scripts/run-supabase-dev.mjs tests/unit/config/supabase-cloud-dev-runner.spec.ts
git commit -m "test(stage01): add B4 runtime acceptance scenarios"
```

---

### Task 3: Prove S01/S08 and selected S04/S06/S09 through the real browser → Nitro → Cloud DEV path

**Files:**
- Create: `tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts`
- Modify: `tests/acceptance/stage01-cloud-dev/acceptance-state.ts`
- Modify: `scripts/stage01-b4-acceptance-fixture.mjs` only for test-fixture helpers required by this suite.

**Interfaces:** Business interactions occur through the merged UI/API. No Stage 01 business-route interception.

- [ ] **Step 1: Write a real login smoke test**

Use runtime state credentials:

```ts
await page.goto('/login')
await page.getByLabel('Email').fill(state.actors.decision.email)
await page.getByLabel('Mật khẩu').fill(state.actors.decision.password)
await page.getByRole('button', { name: 'Đăng nhập' }).click()
await expect(page).toHaveURL(/\/projects|\/opportunities/)
```

Assert active company is `VQH_STAGE01_ACCEPTANCE`, not canonical VQH.

- [ ] **Step 2: Implement B4-S01 full UI journey**

Create a unique Opportunity whose primary customer name contains `state.runMarker`. Through the UI:

1. create Opportunity;
2. complete all server-required Intake fields using labels/options from the acceptance snapshot;
3. create/link a usable primary Contact;
4. add required Scope/Referrer/Intake Record as dictated by gates;
5. assign an Intake accountable owner from the real employee picker;
6. start/complete 01.1;
7. start 01.2;
8. evaluate all non-optional applicable criteria with rationale/evidence;
9. submit recommendation;
10. record final decision `proceed` as decision actor;
11. complete 01.2;
12. reload the browser and assert both nodes remain completed and final decision/history remain visible.

Do not hard-code taxonomy codes when the UI can read the bound labels.

- [ ] **Step 3: Add selected real browser checks for blocker and revalidation**

Use a second run-marked Opportunity or the dedicated acceptance scenario data. Prove an open blocking blocker prevents complete and resolution restores eligibility; prove a post-Intake dependent change produces visible revalidation and explicit reason/evidence flow.

- [ ] **Step 4: Implement B4-S08 real reactivation**

From a completed run-marked Opportunity:

1. open Reactivation;
2. submit reason;
3. assert a new cycle is canonical;
4. assert prior cycle remains visible/read-only;
5. reload page and assert cycle ordering/stability.

- [ ] **Step 5: Add selected S09 browser/API isolation checks**

At minimum:

- reader can view but has no mutation controls;
- operator cannot record final decision;
- decision actor sees decision action only when capability is bound;
- an acceptance-company actor making a direct HTTP request with canonical VQH company ID receives authorization failure;
- invalid/expired bearer call fails safely.

- [ ] **Step 6: Run the B4 full-stack project from a clean state**

```bash
pnpm test:b4:cloud-dev -- --workers=1 --reporter=line
```

Expected: PASS. Verify no `page.route`/`route.fulfill` business replacement exists in this suite.

- [ ] **Step 7: Commit**

```bash
git add tests/acceptance/stage01-cloud-dev scripts/stage01-b4-acceptance-fixture.mjs
git commit -m "test(stage01): prove real Cloud DEV operational journeys"
```

---

### Task 4: Harden command-success / canonical-reload failure and mutation locking

**Files:**
- Modify: `app/errors/client-error.ts`
- Modify: `app/composables/useStage01Operational.ts`
- Modify: `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Create: `tests/unit/stage01-operational/use-stage01-operational.spec.ts`
- Modify: `tests/e2e/stage01-operational.spec.ts`

**Interfaces:**

```ts
export type ClientOnlyErrorCode = ExistingCodes | 'CANONICAL_RELOAD_REQUIRED'

useStage01Operational(...): {
  detail: Ref<Stage01OperationalDetail | null>
  operation: Ref<'load' | 'command' | null>
  canonicalSyncRequired: Readonly<Ref<boolean>>
  load(): Promise<Stage01OperationalDetail>
  runAndReload<T>(action: () => Promise<T>): Promise<T>
}
```

- [ ] **Step 1: Write failing orchestration tests**

Cover separately:

1. command fails → `canonicalSyncRequired=false`, original error returned;
2. command succeeds then canonical GET fails → `canonicalSyncRequired=true`, old detail retained, error code `CANONICAL_RELOAD_REQUIRED`;
3. while sync is required, another `runAndReload` is rejected before calling its mutation action;
4. explicit successful `load()` clears `canonicalSyncRequired`;
5. rapid double invocation yields exactly one mutation call.

- [ ] **Step 2: Implement minimal composable state**

`runAndReload()` must distinguish the two phases:

```ts
const result = await action()
try {
  await fetchCanonicalDetail()
  canonicalSyncRequired.value = false
  return result
} catch (cause) {
  canonicalSyncRequired.value = true
  throw new ClientError({
    kind: 'api',
    code: 'CANONICAL_RELOAD_REQUIRED',
    message: 'Thao tác có thể đã thành công nhưng chưa tải lại được dữ liệu chính thức. Hãy tải lại trước khi tiếp tục.',
    retryable: true,
  })
}
```

Before any later mutation, reject while `canonicalSyncRequired` is true. Do not replay the original action.

- [ ] **Step 3: Add page-level stale-after-command lock**

Show a prominent alert with an explicit `Tải lại dữ liệu chính thức` action. Wrap Stage 01 mutation controls in a disabled fieldset while `pending || canonicalSyncRequired` so existing content remains visible but unsafe follow-up commands cannot be sent.

Do not create a second global navigation guard.

- [ ] **Step 4: Extend E2E reliability coverage**

Intercept only the deterministic B3 E2E suite, not B4 full-stack tests. Prove:

- mutation POST returns success, next canonical GET 500 → UI says operation may already have succeeded;
- no second mutation request is sent while sync-required;
- explicit reload restores controls;
- double-click/in-flight action sends one mutation;
- company switch/navigation during an in-flight mutation does not render another company's Stage 01 aggregate or show false global success.

- [ ] **Step 5: Run focused + full application verification**

```bash
pnpm test:unit -- tests/unit/stage01-operational/use-stage01-operational.spec.ts
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --workers=1
pnpm verify:app
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/errors/client-error.ts app/composables/useStage01Operational.ts 'app/pages/opportunities/[opportunityId]/stage-01.vue' tests/unit/stage01-operational/use-stage01-operational.spec.ts tests/e2e/stage01-operational.spec.ts
git commit -m "fix(stage01): harden canonical reload recovery"
```

---

### Task 5: Measure P1/P2/P3 and remove proven Stage01 read N+1 without schema changes

**Files:**
- Create: `tests/unit/server/stage01.repository-performance.spec.ts`
- Modify: `server/features/stage01/stage01.repository.ts` only if the baseline exceeds the envelope.
- Modify: `tests/unit/server/stage01.repository.spec.ts`
- Create: `scripts/run-stage01-b4-performance.mjs`
- Create: `tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts`

**Interfaces:** No response-contract change. `Stage01OperationalDetail` remains identical.

- [ ] **Step 1: Add deterministic request-count instrumentation before optimization**

Build a fake Stage01 data client capable of P1/P2/P3. Count each terminal Supabase query/RPC. Assert the approved P3 target is <=25.

Run:

```bash
pnpm test:unit -- tests/unit/server/stage01.repository-performance.spec.ts
```

Record the baseline. Current merged implementation is expected to reveal per-cycle/per-contact request growth; do not alter production code until the failing count is captured in test output/evidence.

- [ ] **Step 2: If P3 exceeds 25, batch exactly the proven loops**

Add `.in(column, values)` to the local query interface and replace:

- per-contact `contacts` + `contact_methods` calls with one Contacts query and one Contact Methods query for all related contact IDs;
- per-cycle evaluations/recommendations/clarification calls with one query per resource table for all decision-cycle IDs.

Group returned rows in memory by `contact_id` / `decision_cycle_id`, then map through the existing strict schemas. Preserve ordering and current-cycle identity.

Conceptual helper:

```ts
function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const value of values) groups.set(key(value), [...(groups.get(key(value)) ?? []), value])
  return groups
}
```

Do not change RLS, schema, migration, API shape, gates, or version semantics.

- [ ] **Step 3: Re-run mapping and request-count tests**

P1/P2/P3 must all return schema-valid equivalent aggregates and P3 request count must be <=25.

- [ ] **Step 4: Implement real P1/P2/P3 latency/payload measurement**

`run-stage01-b4-performance.mjs` must:

1. assert canonical Cloud DEV target;
2. read B4 acceptance runtime state without logging passwords;
3. sign in a normal acceptance actor with anon client;
4. identify/read P1/P2/P3 acceptance-profile Opportunity IDs prepared by the fixture helper;
5. warm each endpoint;
6. perform >=20 measured local-Nitro API reads for P3 with the user Bearer token;
7. compute p95 and max duration;
8. measure UTF-8 JSON payload byte size;
9. print/write machine-readable evidence to `test-results/b4-stage01/performance.json`.

If P3 fixture creation is needed, create/retain it only in the dedicated acceptance company and mark it clearly. It may use fixture-level service role to synthesize read-only history profiles, never the canonical VQH company.

- [ ] **Step 5: Run performance and advisors**

```bash
pnpm db:dev:stage01:b4:performance
pnpm db:dev:advisors:performance
```

Acceptance: request count <=25, payload <=2 MiB, p95 <=2.0 s, max <=3.0 s unless independently documented Cloud DEV degradation justifies the single allowed rerun.

If an envelope failure remains and requires index/migration/schema changes, STOP for amendment.

- [ ] **Step 6: Commit**

```bash
git add server/features/stage01/stage01.repository.ts tests/unit/server/stage01.repository.spec.ts tests/unit/server/stage01.repository-performance.spec.ts scripts/run-stage01-b4-performance.mjs tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts
git commit -m "perf(stage01): batch operational aggregate reads"
```

If the baseline already satisfies the envelope without production changes, omit the repository modification and commit only measurement/evidence tests.

---

### Task 6: Dense responsive/accessibility acceptance

**Files:**
- Create: `tests/e2e/stage01-operational-hardening.spec.ts`
- Modify existing Stage 01 UI only when this test exposes a concrete defect.

- [ ] **Step 1: Build a dense deterministic Stage01OperationalDetail fixture**

Use 20 decision cycles, 20 related Contacts and repeated criterion/recommendation/clarification history. Keep this test intercepted/deterministic; it is the dense visual regression layer, not full-stack Cloud DEV.

- [ ] **Step 2: Add mobile and desktop assertions**

At `390×844` and `1440×900` assert:

```ts
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
expect(overflow).toBe(false)
```

Verify critical forms/dialogs are operable with keyboard, labels exist, history remains readable, and error/success alerts expose programmatic status.

- [ ] **Step 3: Run axe on Stage 01 acceptance pages**

Use `@axe-core/playwright`; fail on critical violations. Do not suppress rules just to pass.

- [ ] **Step 4: Apply only concrete UI fixes and rerun**

No visual redesign. Add regression assertions for each correction.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/stage01-operational-hardening.spec.ts app/components/stage01-operational app/pages/opportunities
git commit -m "test(stage01): harden dense operational accessibility"
```

Stage only actual changed production files; do not stage directories mechanically if unrelated changes exist.

---

### Task 7: Run the complete B4 gate, security scan, and write the readiness report

**Files:**
- Create: `docs/acceptance/vqh-stage-01-operational-readiness.md`
- Modify code/tests only for defects discovered by the gate and still inside B4 scope.

- [ ] **Step 1: Run fresh deterministic and Cloud DEV gates**

```bash
pnpm db:dev:target
pnpm db:dev:status
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
pnpm db:dev:stage01:integrity-races
pnpm db:dev:rls-smoke
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
pnpm verify:app
pnpm test:e2e -- --workers=1 --reporter=line
pnpm test:b4:cloud-dev -- --workers=1 --reporter=line
pnpm db:dev:stage01:b4:performance
```

All must PASS subject to the explicit latency rerun rule.

- [ ] **Step 2: Verify canonical VQH cleanliness**

Use a guarded read/assert helper to prove canonical VQH contains no active B4 run-marker Opportunity/Contact/assignment/blocker records. Acceptance-company retained history is allowed and listed separately.

- [ ] **Step 3: Run the repository-approved security diff scan**

Scan the immutable B4 implementation range. Completion requires successful finalization and:

```text
critical unresolved = 0
high unresolved = 0
```

Disposition every medium/low finding in the readiness report. Security scan failure/finalization failure is `BLOCKED`, not a warning.

- [ ] **Step 4: Capture the verified implementation SHA before report-only commit**

```bash
VERIFIED_CODE_SHA=$(git rev-parse HEAD)
```

The readiness report records this as `verified_code_sha`; it also records source anchor `8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`.

- [ ] **Step 5: Write the readiness report**

Required structure:

```markdown
# VQH Stage 01 Operational Readiness

source_anchor_sha: 8e1abc746a81f5b9f3f2fc6431648b5a10e09d58
verified_code_sha: <captured SHA>
cloud_dev_target: gtgljlnhwvhqdnwrfdfj
acceptance_company: VQH_STAGE01_ACCEPTANCE
run_marker: <non-secret marker>

| Scenario | Required layer | Result | Evidence |
| --- | --- | --- | --- |
| B4-S01 | full-stack | PASS | ... |
...
| B4-S10 | Cloud DEV DB/runtime | PASS | ... |

## Performance
P1: ...
P2: ...
P3: request_count=..., payload_bytes=..., p95_ms=..., max_ms=...

## Security
critical=0, high=0, medium=..., low=...

## Retained acceptance history
...

## Known limitations
...

## Verdict
READY_FOR_VQH_PILOT
```

Do not claim PASS without fresh command evidence.

- [ ] **Step 6: Commit report, then final scan/diff verification**

```bash
git add docs/acceptance/vqh-stage-01-operational-readiness.md
git commit -m "docs(stage01): record B4 operational readiness"
git diff --check $(git merge-base origin/docs/vqh-stage-01-operational-acceptance-hardening-design HEAD)..HEAD
```

Run the final security scan over the final HEAD including the report. If security findings differ, update the report and rescan until consistent.

- [ ] **Step 7: Push and remote-verify**

Push only after all B4 gates and scan pass. Verify `git ls-remote` equals local HEAD exactly.

---

## Final Reviewer Checklist

- B4 acceptance company is test-only and canonical VQH has no B4 operational fixture data.
- Full-stack acceptance uses real `/login`, normal JWT and user-scoped DB path; no Stage 01 business-route interception.
- S01 and S08 have real Cloud DEV evidence.
- S02–S10 required layer matrix is complete.
- Command-success/reload-failure cannot trigger duplicate mutation.
- Optimistic concurrency remains explicit and no auto-overwrite occurs.
- Bound snapshot N/N+1 behavior is proven.
- Create-options RPC remains narrow; no draft/raw-definition leak.
- `employee.read_all` still does not expose private details.
- P3 request count/payload/latency are within envelope.
- No migration/RLS/permission/schema change slipped into B4.
- Dense mobile/desktop Stage 01 has no critical a11y/overflow defect.
- Security scan finalized with zero unresolved high/critical findings.
- Readiness report says `READY_FOR_VQH_PILOT` and its evidence is internally consistent.
