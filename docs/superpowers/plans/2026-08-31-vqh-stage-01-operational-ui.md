# VQH Stage 01 Operational UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the B3 Opportunity-centric Stage 01 operational UI so VQH staff can create/manage Opportunities, operate `01.1` Intake and `01.2` Evaluation, execute existing workflow/Stage01 commands, and review immutable history from server-authoritative state.

**Architecture:** Add a narrow `Stage01OperationalDetail` read model over the existing Stage01 aggregate. All commands remain in the existing Opportunity/Workflow/Stage01 repositories; every successful command reloads canonical operational detail. Existing Opportunities always render taxonomies/criteria from their bound workflow snapshot; only new Opportunity creation may read the latest published B2 config.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Nuxt UI 4.4.0, Zod 4, Vitest 4.1.9, Playwright 1.61.1, Nitro, Supabase user-scoped server repositories.

**Spec:** `docs/superpowers/specs/2026-08-31-vqh-stage-01-operational-ui-design.md`

## Global Constraints

- Source baseline: `main@431760676e446ae6dff3372acc7f20e31f093082` plus approved B3 docs branch commits.
- Routes: `/opportunities` and `/opportunities/:opportunityId/stage-01`.
- Do not place Stage 01 under `/projects`.
- Reuse existing `OpportunityRepository`, `WorkflowRepository`, `Stage01Repository`, `EmployeeRepository`, and `Stage01ConfigRepository`.
- No parallel client-side workflow state machine.
- Existing Opportunity controls use bound snapshot configuration only.
- Latest `Stage01ConfigRepository.get()` is allowed only for new Opportunity creation.
- No direct client access to `workflow_taxonomy_values`.
- No DB migration, RLS change, generated DB type change, Decision Runtime rename/generalization, completion-baseline change, Stage 02 behavior, package/dependency addition, or generic workflow builder.
- Existing command endpoints remain unchanged. Only the Stage 01 GET read model may expand.
- The operational GET must expose bound `configuration`; it may also expose `relatedContacts` and `decisionCycles` because the approved Contact-management and reactivation-history UI cannot be rendered correctly from the current response otherwise.
- No new Contact/history mutation endpoints.
- Permission checks are action-specific; no generic `canEditStage01`, no `company_admin` frontend special case.
- Server authorization is authoritative.
- Opportunity mutations use `opportunity.version`; workflow mutations use node `runtime.version`; evaluation/decision mutations use `currentDecisionCycle.version`; reactivation uses all three required versions.
- `VERSION_CONFLICT` never auto-retries or overwrites.
- Every successful Opportunity/Workflow/Stage01 command reloads `Stage01OperationalDetail` before rendering the next canonical state.
- Historical Intake corrections, criterion revisions, recommendation versions, clarification returns, final decisions, and prior cycles are never edited in place.
- Evidence UI uses trimmed text entries (`string[]`); no file-upload subsystem.
- User-facing copy is Vietnamese.
- TDD and fresh final verification are mandatory.

---

## Planned Files

### Shared/server/app contract
- Create `shared/schemas/stage01-operational.ts`
- Modify `server/features/stage01/stage01.repository.ts`
- Modify `app/features/stage01/stage01.types.ts`
- Modify `app/repositories/contracts.ts`
- Modify `app/repositories/http/http-stage01-repository.ts`

### Opportunity entry
- Modify `app/components/app/navigation-permissions.ts`
- Modify `app/components/app/AppSidebar.vue`
- Create `app/pages/opportunities/index.vue`
- Create `app/components/opportunities/OpportunityListTable.vue`
- Create `app/components/opportunities/OpportunityCreateDialog.vue`

### Stage 01 workspace
- Create `app/features/stage01-operational/stage01-operational.ts`
- Create `app/composables/useStage01Operational.ts`
- Create `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Create focused components under `app/components/stage01-operational/` for header/progression/gates, Opportunity, Contacts, Scopes, Referrers, Intake Records, Duplicate Concerns, workflow node/assignments/blockers, Evaluation, Recommendation, Decision, and History.

### Tests
- Create `tests/unit/shared/stage01-operational-schema.spec.ts`
- Modify `tests/unit/server/stage01.repository.spec.ts`
- Modify `tests/unit/repositories/http-stage01-repository.spec.ts`
- Modify `tests/unit/auth/navigation-permissions.spec.ts`
- Create `tests/unit/stage01-operational/stage01-operational.spec.ts`
- Create `tests/unit/stage01-operational/stage01-operational-admin.spec.ts`
- Create `tests/e2e/fixtures/stage01-operational.ts`
- Create `tests/e2e/opportunities.spec.ts`
- Create `tests/e2e/stage01-operational.spec.ts`
- Modify `tests/e2e/app-shell-navigation.spec.ts`
- Modify `tests/e2e/mobile.spec.ts` only for the four-item primary navigation assertion if needed.

---

### Task 1: Bound operational read model

**Files:** shared/server/client contract files listed above plus focused schema/server/repository tests.

**Produces:**

```ts
export const stage01OperationalDetailSchema = stage01DetailSchema.extend({
  configuration: z.object({
    taxonomies: stage01BusinessTaxonomiesSchema,
    criteria: stage01CriteriaSchema,
  }).strict(),
  relatedContacts: z.array(contactSchema),
  decisionCycles: z.array(stage01DecisionCycleSchema).min(1),
}).strict().superRefine((value, context) => {
  const latest = value.decisionCycles[value.decisionCycles.length - 1]
  if (!latest || latest.id !== value.currentDecisionCycle.id) {
    context.addIssue({ code: 'custom', path: ['decisionCycles'], message: 'Current decision cycle must be the latest cycle' })
  }
})

export type Stage01OperationalDetail = z.infer<typeof stage01OperationalDetailSchema>
```

- [ ] Write failing tests proving: bound snapshot wins over a newer published snapshot; related Contact version/methods are returned; all decision cycles are ordered; latest cycle equals `currentDecisionCycle`; HTTP client rejects the old response shape.
- [ ] Run:

```bash
pnpm test:unit -- tests/unit/shared/stage01-operational-schema.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts
```

Expected: FAIL.

- [ ] Create `shared/schemas/stage01-operational.ts` as a leaf composition module. Do **not** import `stage01-config.ts` into `stage01.ts`.
- [ ] In `stage01.repository.ts`, keep definition lookup constrained to `workflowRuntime.definitionSnapshotId`; map definition taxonomies to business shape by stripping `semanticKey`, then parse with `stage01BusinessTaxonomiesSchema`; parse criteria with `stage01CriteriaSchema`.
- [ ] Read all decision cycles and their evaluations/recommendations/clarification returns, ordered by cycle number.
- [ ] Read Contact records/methods for Contact IDs referenced by Opportunity relationships and return `relatedContacts`.
- [ ] Change `Stage01Repository.get()` and HTTP GET parser to `Stage01OperationalDetail`; leave all mutation routes unchanged.
- [ ] Re-run the focused test command; expected PASS.
- [ ] Commit:

```bash
git add shared/schemas/stage01-operational.ts server/features/stage01/stage01.repository.ts app/features/stage01/stage01.types.ts app/repositories/contracts.ts app/repositories/http/http-stage01-repository.ts tests/unit/shared/stage01-operational-schema.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts
git commit -m "feat(stage01): expose operational bound snapshot detail"
```

---

### Task 2: Opportunity navigation, list, and creation

**Produces:** permission-gated `Cơ hội` workspace and a real backend list/create flow.

- [ ] Add failing unit/E2E tests for `opportunity.read`, four-item mobile navigation, list loading/error/empty states, create permission, latest-config-backed create form, and navigation to the returned Stage 01 route.
- [ ] Run:

```bash
pnpm test:unit -- tests/unit/auth/navigation-permissions.spec.ts
pnpm exec playwright test tests/e2e/opportunities.spec.ts tests/e2e/app-shell-navigation.spec.ts
```

Expected: FAIL.

- [ ] Add primary link:

```ts
{ to: '/opportunities', label: 'Cơ hội', icon: 'i-lucide-target', requiredPermission: 'opportunity.read' }
```

Keep B2 admin navigation unchanged; adapt mobile primary grid only enough for four workspace items.

- [ ] Implement `/opportunities` with:

```ts
definePageMeta({ requiredPermission: 'opportunity.read' })
const repositories = useRepositories()
const { data: opportunities, pending, error, refresh } = await useAsyncData(
  'opportunity-list',
  () => repositories.opportunities.list(),
  { default: () => [] },
)
```

- [ ] Create form loads current `stage01Config.get()` only when preparing a **new** Opportunity. Required field: `primaryCustomerName`; expose existing optional customer/need/location/lead source/engagement/budget/timeline/priority fields; submit taxonomy codes.
- [ ] On successful `opportunities.create(input)`, navigate to `/opportunities/${result.opportunityId}/stage-01`.
- [ ] Re-run focused tests; expected PASS.
- [ ] Commit:

```bash
git add app/components/app/navigation-permissions.ts app/components/app/AppSidebar.vue app/pages/opportunities/index.vue app/components/opportunities tests/unit/auth/navigation-permissions.spec.ts tests/e2e/opportunities.spec.ts tests/e2e/app-shell-navigation.spec.ts
git commit -m "feat(opportunities): add Stage 01 operational entry"
```

---

### Task 3: Canonical Stage 01 workspace shell

**Produces:** one server-authoritative page and command/reload orchestration.

- [ ] Write failing unit tests for taxonomy labels, active assignments, open blockers, latest criterion revision, cycle ordering, and a `runAndReload()` helper that reloads after successful mutation but not after failure.
- [ ] Run:

```bash
pnpm test:unit -- tests/unit/stage01-operational/stage01-operational.spec.ts tests/unit/stage01-operational/stage01-operational-admin.spec.ts
```

Expected: FAIL.

- [ ] Implement pure helper example:

```ts
export function taxonomyLabel(entries: readonly { code: string, label: string }[], code: string | null): string {
  if (!code) return 'Chưa xác định'
  return entries.find(entry => entry.code === code)?.label ?? code
}
```

- [ ] Implement `useStage01Operational()` with one canonical `detail` ref, operation/error state, `load()`, and `runAndReload(action)`. Do not patch gates/runtime/cycle locally after commands.
- [ ] Implement `/opportunities/:opportunityId/stage-01` with both permissions:

```ts
definePageMeta({
  requiredPermission: 'opportunity.read',
  requiredAnyPermissions: ['journey.read'],
})
```

- [ ] Parse route UUID; load only `repositories.stage01.get(opportunityId)` for the aggregate; render loading/not-found/error/retry, workspace header, `01.1`/`01.2` progression, and server gate checks.
- [ ] Re-run focused tests; expected PASS.
- [ ] Commit:

```bash
git add app/features/stage01-operational app/composables/useStage01Operational.ts app/pages/opportunities/[opportunityId]/stage-01.vue app/components/stage01-operational tests/unit/stage01-operational
git commit -m "feat(stage01): add operational workspace shell"
```

---

### Task 4: Intake business controls

**Produces:** Opportunity edit/validity, Contacts, Scopes, Referrers, Intake Records, and Duplicate Concerns.

- [ ] Add failing E2E cases for read-only behavior and exact permissions: `opportunity.update`, `.invalidate`, `.restore`, `.contact.manage`, `.scope.manage`, `.referrer.manage`, `.intake_record.create`, `.duplicate.raise`, `.duplicate.resolve`.
- [ ] Cover `VERSION_CONFLICT` preserving local input until explicit canonical reload.
- [ ] Run:

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "opportunity|contact|scope|referrer|intake record|duplicate"
```

Expected: FAIL.

- [ ] Opportunity editor uses only `detail.configuration.taxonomies` and current `detail.opportunity.version`; success reloads canonical detail.
- [ ] Contact panel maps relationship `contactId` to `detail.relatedContacts`; use Contact version for Contact/Method updates. New Contact flow is `createContact` → optional `addContactMethod` → `linkContact`; if linking fails, report that exact failed step and do not show false relationship success.
- [ ] Scope/referrer options come from bound taxonomy; retired/ended resources remain visible read-only.
- [ ] Intake Records append/correct through existing commands; original records never mutate in place.
- [ ] Duplicate `same_need` resolution loads `opportunities.list()` on demand to select canonical Opportunity; submit current Opportunity version.
- [ ] Re-run focused E2E; expected PASS.
- [ ] Commit:

```bash
git add app/components/stage01-operational app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add intake operational controls"
```

---

### Task 5: Workflow runtime controls

**Produces:** node actions, assignments, blockers, gate-aware completion.

- [ ] Add failing E2E cases for start, complete, reopen, revalidate, assign/end assignment, raise/resolve blocker, permission hiding, and canonical reload.
- [ ] Assert exact completion ownership:

```ts
// 01.1
{ expectedExecutionVersion, expectedOpportunityVersion }

// 01.2
{ expectedExecutionVersion, expectedCycleVersion }
```

- [ ] Run:

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "workflow|assignment|blocker|gate"
```

Expected: FAIL.

- [ ] Render canonical node state and server-returned gate checks. UI may disable completion when gates are unsatisfied; server response remains authoritative.
- [ ] Revalidate requires reason plus `evidence: [trimmedEvidenceText]`.
- [ ] Assignment picker may use `employees.list()` only when actor also has `employee.read_directory` or `employee.read_all`; otherwise show existing assignment history and an explanatory read-only state instead of accepting a raw user UUID.
- [ ] Map employee `account.userId` to display names for assignment/responsible-user controls.
- [ ] Blocker category comes from bound `blocker_category` taxonomy; resolved blockers remain history.
- [ ] Re-run focused E2E; expected PASS.
- [ ] Commit:

```bash
git add app/components/stage01-operational app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add workflow runtime controls"
```

---

### Task 6: Evaluation, recommendation, clarification, final decision, and reactivation

**Produces:** complete `01.2` decision UI and immutable cycle history.

- [ ] Add failing E2E tests for bound criterion definitions, latest revision display, applicability/result rules, `allowsNotApplicable`, rationale/evidence, recommendation versions, clarification, final decision, override-rationale recovery, completed read-only state, reactivation, and previous cycle visibility.
- [ ] Run:

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "criterion|recommendation|clarification|decision|reactivation|history"
```

Expected: FAIL.

- [ ] Criterion input uses:

```ts
{
  expectedCycleVersion: detail.currentDecisionCycle.version,
  applicability,
  result: applicability === 'not_applicable' ? null : result,
  rationale: rationale.trim(),
  evidence: evidenceText.trim() ? [evidenceText.trim()] : [],
}
```

- [ ] Do not offer `not_applicable` when the bound definition has `allowsNotApplicable === false`.
- [ ] Recommendation uses exact current cycle version; previous versions stay visible.
- [ ] Clarification uses current recommendation ID + reason + cycle version and appends history.
- [ ] Final decision collects explicit outcome/rationale. If backend returns `STAGE01_OVERRIDE_RATIONALE_REQUIRED`, preserve entered values and reveal an explicit override-rationale field; never synthesize text.
- [ ] Reactivation uses current Opportunity version, Evaluation execution version, cycle version, and reason; reload canonical detail; render `decisionCycles` ordered with prior cycles immutable.
- [ ] Re-run focused E2E; expected PASS.
- [ ] Commit:

```bash
git add app/components/stage01-operational app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add evaluation and decision operations"
```

---

### Task 7: Deterministic browser acceptance fixture

**Produces:** no-Cloud deterministic B3 browser verification using real pages and existing endpoint shapes.

- [ ] Create `tests/e2e/fixtures/stage01-operational.ts` with:

```ts
interface Stage01OperationalRouteState {
  opportunities: OpportunitySummary[]
  detail: Stage01OperationalDetail
  currentPublishedConfig: Stage01BusinessConfigView
  requests: Array<{ method: string, path: string, body: unknown }>
  nextFailure: null | 403 | 409 | 500
}
```

- [ ] Intercept only existing Opportunity/Workflow/Stage01/Employee/Stage01Config routes. Parse request bodies with existing shared input schemas before mutating fixture state.
- [ ] Add happy path:

```text
Create Opportunity
→ complete required Intake data
→ assign/start/complete 01.1
→ start 01.2
→ evaluate required criteria
→ submit recommendation
→ record final decision
→ complete 01.2
→ completed read-only state
```

- [ ] Add clarification and reactivation branches, including previous cycle history.
- [ ] Add 403/409/500 and permission cases; no false success state.
- [ ] At 390px verify no horizontal overflow, four-item mobile primary navigation, labelled controls, keyboard-accessible dialogs/actions, and alert semantics.
- [ ] Run:

```bash
pnpm exec playwright test tests/e2e/opportunities.spec.ts tests/e2e/stage01-operational.spec.ts tests/e2e/app-shell-navigation.spec.ts tests/e2e/mobile.spec.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add tests/e2e/fixtures/stage01-operational.ts tests/e2e/opportunities.spec.ts tests/e2e/stage01-operational.spec.ts tests/e2e/app-shell-navigation.spec.ts tests/e2e/mobile.spec.ts
git commit -m "test(stage01): prove operational journey end to end"
```

---

### Task 8: Final verification and immutable scope audit

- [ ] Run focused unit suites:

```bash
pnpm test:unit -- tests/unit/shared/stage01-operational-schema.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts tests/unit/auth/navigation-permissions.spec.ts tests/unit/stage01-operational/stage01-operational.spec.ts tests/unit/stage01-operational/stage01-operational-admin.spec.ts
```

- [ ] Run focused B3 E2E:

```bash
pnpm exec playwright test tests/e2e/opportunities.spec.ts tests/e2e/stage01-operational.spec.ts tests/e2e/app-shell-navigation.spec.ts tests/e2e/mobile.spec.ts
```

- [ ] Run full verification:

```bash
pnpm verify:app
pnpm test:e2e
git diff --check
```

- [ ] Audit changed paths without a placeholder SHA:

```bash
BASE=$(git merge-base origin/docs/vqh-stage-01-operational-ui-design HEAD)
git diff --name-status "$BASE"..HEAD
```

The diff must contain no Supabase migration/RLS/generated-type/package/dependency/Decision-Runtime/generalization/completion-baseline/Stage-02/unrelated feature change.

- [ ] Self-review hard invariants:
  1. Existing Opportunities use bound taxonomies/criteria.
  2. Latest B2 config is used only for creating a new Opportunity.
  3. All successful commands reload canonical operational detail.
  4. `01.1` and `01.2` completion use different correct owning versions.
  5. Prior cycles remain immutable/visible after reactivation.
  6. Contact Method mutations use Contact versions from `relatedContacts`.
  7. Permissions remain explicit per action.
  8. No direct client access to `workflow_taxonomy_values`.

- [ ] Push and verify:

```bash
git push origin feat/vqh-stage-01-operational-ui
git ls-remote origin refs/heads/feat/vqh-stage-01-operational-ui
```

Completion requires `remote_head_sha == head_sha`.
