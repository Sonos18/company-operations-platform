# VQH Stage 01 Operational UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the B3 Opportunity-centric Stage 01 operational UI so VQH staff can create and manage Opportunities, operate `01.1` Intake and `01.2` Evaluation, execute existing workflow/Stage01 commands, and review immutable history from server-authoritative state.

**Architecture:** Add a narrow `Stage01OperationalDetail` read model over the existing Stage01 aggregate. All mutations continue through the existing `OpportunityRepository`, `WorkflowRepository`, and `Stage01Repository`; every successful command reloads the canonical Stage01 operational detail. Existing Opportunities render business configuration from their bound workflow-definition snapshot, while only the new-Opportunity create form may use the current published Stage 01 configuration.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Nuxt UI 4.4.0, Zod 4, Vitest 4.1.9, Playwright 1.61.1, Nitro server routes, Supabase user-scoped server repository.

**Spec:** `docs/superpowers/specs/2026-08-31-vqh-stage-01-operational-ui-design.md`

## Global Constraints

- Source-code baseline is `main@431760676e446ae6dff3372acc7f20e31f093082` plus the approved B3 design/plan documentation branch commits.
- Approved routes are exactly `/opportunities` and `/opportunities/:opportunityId/stage-01`.
- Do not place Stage 01 operational work under `/projects`.
- Reuse existing Opportunity, Workflow, Stage01, Employee, and Stage01Config repositories.
- Do not add a parallel client-side workflow state machine.
- Existing Opportunity operational controls must use configuration from the Opportunity's bound `workflow_definition_snapshots` row.
- `Stage01ConfigRepository.get()` may be used only to assist creation of a new Opportunity.
- Do not read `workflow_taxonomy_values` directly from application code.
- No database migration, RLS change, generated DB type change, Decision Runtime rename/generalization, completion-baseline change, Stage 02 behavior, or generic workflow builder is part of B3.
- Preserve existing HTTP command endpoints. The only approved backend contract expansion is the GET Stage 01 operational read model required to render already-approved operational behavior.
- `Stage01OperationalDetail` must include bound `configuration`; implementation may also include `relatedContacts` and `decisionCycles` as response-only operational read data required by the approved Contact-management and reactivation-history behavior.
- Do not create new Contact/History mutation endpoints for those read-model additions.
- Permission visibility is action-specific; do not invent a generic `canEditStage01` flag and do not special-case `company_admin`.
- Server authorization remains authoritative.
- Opportunity optimistic concurrency uses `opportunity.version`.
- Workflow node mutations use the current `runtime.version`.
- Evaluation/recommendation/clarification/final-decision mutations use `currentDecisionCycle.version`.
- Reactivation uses the exact current Opportunity + execution + cycle versions.
- `VERSION_CONFLICT` never auto-overwrites or auto-retries.
- After every successful Opportunity/Workflow/Stage01 command, reload canonical Stage01 operational detail before rendering the next state.
- Historical records are append-only/read-only in the UI; Intake Record correction, recommendation versions, clarification returns, criterion revisions, and decision cycles must not be rewritten in place.
- No file-upload subsystem is introduced. Where existing evidence arrays require user input, B3 uses trimmed text evidence entries (`string[]`) only.
- User-facing copy is Vietnamese; technical codes may remain English identifiers.
- Follow repository TDD requirements and run fresh verification before completion.

---

## File Structure

### New shared/server contract files

- `shared/schemas/stage01-operational.ts` — leaf composition schema importing `stage01.ts`, `stage01-config.ts`, and Contact schema without creating a circular dependency.

### Existing server/application files to modify

- `server/features/stage01/stage01.repository.ts` — return bound configuration, related Contact details/methods, and decision-cycle history in operational GET response.
- `app/features/stage01/stage01.types.ts` — export `Stage01OperationalDetail`.
- `app/repositories/contracts.ts` — change `Stage01Repository.get()` return type to `Stage01OperationalDetail`.
- `app/repositories/http/http-stage01-repository.ts` — parse GET response with `stage01OperationalDetailSchema`.
- `app/components/app/navigation-permissions.ts` — add `Cơ hội` primary workspace link.
- `app/components/app/AppSidebar.vue` — adapt mobile primary navigation from three to four workspace items without redesigning the shell.

### New operational application files

- `app/features/stage01-operational/stage01-operational.ts` — pure view-model helpers: taxonomy items/labels, active assignments, open blockers, latest criterion evaluation, cycle ordering, employee user-id lookup, action-access helpers.
- `app/composables/useStage01Operational.ts` — canonical load + command/reload orchestration and mutation/error state.
- `app/pages/opportunities/index.vue` — Opportunity list/create entry point.
- `app/pages/opportunities/[opportunityId]/stage-01.vue` — full Stage 01 operational workspace.
- `app/components/opportunities/OpportunityCreateDialog.vue`
- `app/components/opportunities/OpportunityListTable.vue`
- `app/components/stage01-operational/Stage01WorkspaceHeader.vue`
- `app/components/stage01-operational/Stage01Progression.vue`
- `app/components/stage01-operational/Stage01GateReport.vue`
- `app/components/stage01-operational/Stage01OpportunityEditor.vue`
- `app/components/stage01-operational/Stage01ContactsPanel.vue`
- `app/components/stage01-operational/Stage01ScopesPanel.vue`
- `app/components/stage01-operational/Stage01ReferrersPanel.vue`
- `app/components/stage01-operational/Stage01IntakeRecordsPanel.vue`
- `app/components/stage01-operational/Stage01DuplicateConcernsPanel.vue`
- `app/components/stage01-operational/Stage01WorkflowNodePanel.vue`
- `app/components/stage01-operational/Stage01AssignmentsPanel.vue`
- `app/components/stage01-operational/Stage01BlockersPanel.vue`
- `app/components/stage01-operational/Stage01EvaluationPanel.vue`
- `app/components/stage01-operational/Stage01CriterionCard.vue`
- `app/components/stage01-operational/Stage01RecommendationPanel.vue`
- `app/components/stage01-operational/Stage01DecisionPanel.vue`
- `app/components/stage01-operational/Stage01HistoryPanel.vue`

### Tests

- `tests/unit/shared/stage01-operational-schema.spec.ts`
- `tests/unit/server/stage01.repository.spec.ts`
- `tests/unit/repositories/http-stage01-repository.spec.ts`
- `tests/unit/auth/navigation-permissions.spec.ts`
- `tests/unit/stage01-operational/stage01-operational.spec.ts`
- `tests/unit/stage01-operational/stage01-operational-admin.spec.ts`
- `tests/e2e/fixtures/stage01-operational.ts`
- `tests/e2e/opportunities.spec.ts`
- `tests/e2e/stage01-operational.spec.ts`
- `tests/e2e/app-shell-navigation.spec.ts`

---

### Task 1: Extend Stage 01 GET into the bound operational read model

**Files:**
- Create: `shared/schemas/stage01-operational.ts`
- Modify: `server/features/stage01/stage01.repository.ts`
- Modify: `app/features/stage01/stage01.types.ts`
- Modify: `app/repositories/contracts.ts`
- Modify: `app/repositories/http/http-stage01-repository.ts`
- Create: `tests/unit/shared/stage01-operational-schema.spec.ts`
- Modify: `tests/unit/server/stage01.repository.spec.ts`
- Modify: `tests/unit/repositories/http-stage01-repository.spec.ts`

**Interfaces:**
- Produces:

```ts
export const stage01OperationalDetailSchema = stage01DetailSchema.extend({
  configuration: z.object({
    taxonomies: stage01BusinessTaxonomiesSchema,
    criteria: stage01CriteriaSchema,
  }).strict(),
  relatedContacts: z.array(contactSchema),
  decisionCycles: z.array(stage01DecisionCycleSchema).min(1),
}).strict().superRefine((value, context) => {
  const current = value.decisionCycles[value.decisionCycles.length - 1]
  if (!current || current.id !== value.currentDecisionCycle.id) {
    context.addIssue({ code: 'custom', path: ['decisionCycles'], message: 'Current decision cycle must be the latest cycle' })
  }
})

export type Stage01OperationalDetail = z.infer<typeof stage01OperationalDetailSchema>
```

- `Stage01Repository.get(opportunityId: string): Promise<Stage01OperationalDetail>`.

- [ ] **Step 1: Write failing schema/repository tests**

Add a schema fixture proving the operational response accepts bound taxonomies/criteria, related Contact versions/methods, and multiple decision cycles while rejecting a mismatch between `currentDecisionCycle` and the latest `decisionCycles` item.

Extend the server repository test so the workflow runtime is bound to snapshot `snapshot-old`, a newer snapshot exists, and the returned `configuration` still contains labels/criteria from `snapshot-old`.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
pnpm test:unit -- tests/unit/shared/stage01-operational-schema.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts
```

Expected: FAIL because `stage01-operational.ts` and operational fields do not exist and HTTP GET still parses `stage01DetailSchema`.

- [ ] **Step 3: Implement the leaf schema**

Create `shared/schemas/stage01-operational.ts` importing only from existing leaf dependencies:

```ts
import { z } from 'zod'
import { contactSchema } from './opportunities'
import { stage01BusinessTaxonomiesSchema, stage01CriteriaSchema } from './stage01-config'
import { stage01DecisionCycleSchema, stage01DetailSchema } from './stage01'

export const stage01OperationalConfigurationSchema = z.object({
  taxonomies: stage01BusinessTaxonomiesSchema,
  criteria: stage01CriteriaSchema,
}).strict()

export const stage01OperationalDetailSchema = stage01DetailSchema.extend({
  configuration: stage01OperationalConfigurationSchema,
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

Do not import `stage01-config.ts` into `stage01.ts`.

- [ ] **Step 4: Map bound configuration and history on the server**

Keep the existing definition lookup constrained by `workflowRuntime.definitionSnapshotId`. Require `label` in the local definition taxonomy-row schema, strip reserved `semanticKey` before parsing business taxonomies, and parse criteria with `stage01CriteriaSchema`.

Use this shape for the business mapping:

```ts
const businessTaxonomies = stage01BusinessTaxonomiesSchema.parse(Object.fromEntries(
  Object.entries(definition.taxonomies).map(([key, entries]) => [
    key,
    entries.map(({ semanticKey: _semanticKey, ...entry }) => entry),
  ]),
))
```

Read all Stage 01 decision cycles for the Opportunity ordered by `cycle_no`, load each cycle's evaluations/recommendations/clarification returns, and set `currentDecisionCycle` to the final mapped cycle.

Read Contact rows/methods for the unique Contact IDs referenced by `opportunity.contacts`; return them as `relatedContacts`. This is GET aggregation only; do not add mutation routes.

Return and parse with `stage01OperationalDetailSchema`.

- [ ] **Step 5: Update client contracts/parser**

Update `Stage01Repository.get()` and `http-stage01-repository.ts` to use `Stage01OperationalDetail` / `stage01OperationalDetailSchema` for GET only. All Stage01 mutation endpoints remain unchanged.

- [ ] **Step 6: Run focused tests**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/schemas/stage01-operational.ts server/features/stage01/stage01.repository.ts app/features/stage01/stage01.types.ts app/repositories/contracts.ts app/repositories/http/http-stage01-repository.ts tests/unit/shared/stage01-operational-schema.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts
git commit -m "feat(stage01): expose operational bound snapshot detail"
```

---

### Task 2: Add Opportunity workspace navigation, list, and creation

**Files:**
- Modify: `app/components/app/navigation-permissions.ts`
- Modify: `app/components/app/AppSidebar.vue`
- Create: `app/pages/opportunities/index.vue`
- Create: `app/components/opportunities/OpportunityListTable.vue`
- Create: `app/components/opportunities/OpportunityCreateDialog.vue`
- Modify: `tests/unit/auth/navigation-permissions.spec.ts`
- Create: `tests/e2e/opportunities.spec.ts`
- Modify: `tests/e2e/app-shell-navigation.spec.ts`

**Interfaces:**
- List uses `repositories.opportunities.list()`.
- Create uses `repositories.stage01Config.get()` only when preparing a new-Opportunity form and then `repositories.opportunities.create(input)`.
- Successful create navigates to `/opportunities/${result.opportunityId}/stage-01`.

- [ ] **Step 1: Add failing navigation/list/create tests**

Assert `Cơ hội` appears only with `opportunity.read`; mobile navigation supports four workspace links; direct `/opportunities` access requires `opportunity.read`; read-only user can list but not create; creator sees `Tạo cơ hội`; create request uses taxonomy codes from the current published config and navigates to the returned Stage 01 route.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm test:unit -- tests/unit/auth/navigation-permissions.spec.ts
pnpm exec playwright test tests/e2e/opportunities.spec.ts tests/e2e/app-shell-navigation.spec.ts
```

Expected: FAIL because `/opportunities` and `Cơ hội` navigation do not exist.

- [ ] **Step 3: Add primary navigation**

Add:

```ts
{ to: '/opportunities', label: 'Cơ hội', icon: 'i-lucide-target', requiredPermission: 'opportunity.read' }
```

Keep B2 `canonicalAdminLinks` unchanged. On mobile change only the primary grid count/layout needed for four visible workspace items.

- [ ] **Step 4: Implement Opportunity list page**

Use:

```ts
definePageMeta({ requiredPermission: 'opportunity.read' })
const repositories = useRepositories()
const canCreate = computed(() => useNuxtApp().$companyAccessStore.hasPermission('opportunity.create'))
const { data: opportunities, pending, error, refresh } = await useAsyncData(
  'opportunity-list',
  () => repositories.opportunities.list(),
  { default: () => [] },
)
```

Render loading/error/empty states and rows linking to `/opportunities/:id/stage-01`.

- [ ] **Step 5: Implement create dialog**

On opening the dialog, load current `stage01Config.get()` only for create-form taxonomy items. Keep the list usable if config loading fails; surface a create-specific error instead of failing the whole list page.

Build `CreateOpportunityInput` directly from current schema fields. Required: `primaryCustomerName`. Expose optional need/location/customer type/lead source/engagement/budget/timeline/priority fields. Use taxonomy codes as submitted values.

- [ ] **Step 6: Run focused tests**

Run the Step 2 commands. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/app/navigation-permissions.ts app/components/app/AppSidebar.vue app/pages/opportunities/index.vue app/components/opportunities tests/unit/auth/navigation-permissions.spec.ts tests/e2e/opportunities.spec.ts tests/e2e/app-shell-navigation.spec.ts
git commit -m "feat(opportunities): add Stage 01 operational entry"
```

---

### Task 3: Add canonical Stage 01 operational orchestration and workspace shell

**Files:**
- Create: `app/features/stage01-operational/stage01-operational.ts`
- Create: `app/composables/useStage01Operational.ts`
- Create: `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Create: `app/components/stage01-operational/Stage01WorkspaceHeader.vue`
- Create: `app/components/stage01-operational/Stage01Progression.vue`
- Create: `app/components/stage01-operational/Stage01GateReport.vue`
- Create: `tests/unit/stage01-operational/stage01-operational.spec.ts`
- Create: `tests/unit/stage01-operational/stage01-operational-admin.spec.ts`

**Interfaces:**

```ts
export function useStage01Operational(repositories: Pick<RepositoryRegistry, 'opportunities' | 'workflow' | 'stage01'>, opportunityId: string) {
  // detail, operation, error, load(), runAndReload()
}
```

`runAndReload(action)` executes one repository command then calls `stage01.get(opportunityId)`; it never patches runtime/gates/cycle locally.

- [ ] **Step 1: Write failing pure-helper/orchestration tests**

Cover taxonomy code→label lookup, active accountable owner/contributor selection, open blocker count, latest evaluation per criterion, cycle ordering, and `runAndReload()` calling canonical GET after success but not after a failed mutation.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm test:unit -- tests/unit/stage01-operational/stage01-operational.spec.ts tests/unit/stage01-operational/stage01-operational-admin.spec.ts
```

- [ ] **Step 3: Implement pure helpers**

Use small functions such as:

```ts
export function taxonomyLabel(entries: readonly { code: string, label: string }[], code: string | null): string {
  if (!code) return 'Chưa xác định'
  return entries.find(entry => entry.code === code)?.label ?? code
}

export function latestEvaluationByCriterion(detail: Stage01OperationalDetail) {
  const latest = new Map<string, Stage01CriterionEvaluation>()
  for (const evaluation of detail.currentDecisionCycle.evaluations) {
    const current = latest.get(evaluation.criterionKey)
    if (!current || evaluation.revision > current.revision) latest.set(evaluation.criterionKey, evaluation)
  }
  return latest
}
```

- [ ] **Step 4: Implement canonical orchestration composable**

Use one `detail` ref and operation/error refs. `load()` calls Stage01 GET. Mutation wrappers accept repository calls built from current detail versions. On `ClientError` keep current detail/local form state unchanged and expose the error.

- [ ] **Step 5: Implement workspace shell**

Page meta must require both permissions using current access-middleware semantics:

```ts
definePageMeta({
  requiredPermission: 'opportunity.read',
  requiredAnyPermissions: ['journey.read'],
})
```

Parse `opportunityId` as UUID before use. Render initial loading/not-found/error/retry states, `Stage01WorkspaceHeader`, two-node `Stage01Progression`, Intake/Evaluation anchors, and server `Stage01GateReport` checks.

- [ ] **Step 6: Run focused tests and commit**

```bash
pnpm test:unit -- tests/unit/stage01-operational/stage01-operational.spec.ts tests/unit/stage01-operational/stage01-operational-admin.spec.ts
git add app/features/stage01-operational app/composables/useStage01Operational.ts app/pages/opportunities/[opportunityId]/stage-01.vue app/components/stage01-operational/Stage01WorkspaceHeader.vue app/components/stage01-operational/Stage01Progression.vue app/components/stage01-operational/Stage01GateReport.vue tests/unit/stage01-operational
git commit -m "feat(stage01): add operational workspace shell"
```

---

### Task 4: Add Opportunity edit, invalidation, and restore controls

**Files:**
- Create: `app/components/stage01-operational/Stage01OpportunityEditor.vue`
- Modify: `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Extend: `tests/e2e/stage01-operational.spec.ts`

**Interfaces:**
- Update: `opportunities.update(id, { ...fields, expectedOpportunityVersion: detail.opportunity.version })`.
- Invalidate: bound `invalid_reason` taxonomy + `opportunity.invalidate` permission.
- Restore: `opportunity.restore` permission.
- Every success calls canonical reload.

- [ ] **Step 1: Add failing E2E cases**

Test read-only display, taxonomy labels from bound snapshot, update permission gating, exact expected Opportunity version, invalidation with bound invalid-reason code, restore, and `VERSION_CONFLICT` preserving entered form values until explicit reload.

- [ ] **Step 2: Run the focused E2E test and verify failure**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "opportunity"
```

- [ ] **Step 3: Implement the editor/actions**

Keep local form state separate from canonical detail. Build update input from the existing `updateOpportunityInputSchema` and current canonical version. Bound taxonomy lists come only from `detail.configuration.taxonomies`.

- [ ] **Step 4: Run test and commit**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "opportunity"
git add app/components/stage01-operational/Stage01OpportunityEditor.vue app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add opportunity intake controls"
```

---

### Task 5: Add Contact, Scope, and Referrer management

**Files:**
- Create: `app/components/stage01-operational/Stage01ContactsPanel.vue`
- Create: `app/components/stage01-operational/Stage01ScopesPanel.vue`
- Create: `app/components/stage01-operational/Stage01ReferrersPanel.vue`
- Modify: `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Extend: `tests/e2e/stage01-operational.spec.ts`

**Interfaces:**
- Contacts use `relatedContacts` for display name, Contact version, and methods.
- Create-and-link flow: `createContact()` → optional `addContactMethod()` → `linkContact()` using the latest canonical Opportunity version available when linking; then reload.
- Existing linked Contact update/method update uses Contact version from `relatedContacts` and reloads after success.
- Scope/referrer codes come from bound configuration.

- [ ] **Step 1: Add failing Contact/Scope/Referrer E2E cases**

Cover read-only rendering, create Contact + usable method + link, set Primary Contact, end relationship, add/retire Scope, add/set-primary/end Referrer, and exact permission hiding.

- [ ] **Step 2: Run focused E2E and verify failure**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "contact|scope|referrer"
```

- [ ] **Step 3: Implement Contact panel**

Map relationship `contactId` to `detail.relatedContacts`. Never display an opaque Contact ID when a returned Contact name exists. On a sequential create/link failure, report the failed step explicitly and do not falsely report the relationship as created.

- [ ] **Step 4: Implement Scope and Referrer panels**

Retired/ended resources remain visible as history. Mutation controls use the current canonical Opportunity version and reload after each success.

- [ ] **Step 5: Run focused E2E and commit**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "contact|scope|referrer"
git add app/components/stage01-operational/Stage01ContactsPanel.vue app/components/stage01-operational/Stage01ScopesPanel.vue app/components/stage01-operational/Stage01ReferrersPanel.vue app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add intake relationship management"
```

---

### Task 6: Add Intake Record and Duplicate Concern history flows

**Files:**
- Create: `app/components/stage01-operational/Stage01IntakeRecordsPanel.vue`
- Create: `app/components/stage01-operational/Stage01DuplicateConcernsPanel.vue`
- Modify: `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Extend: `tests/e2e/stage01-operational.spec.ts`

- [ ] **Step 1: Add failing tests**

Cover append Intake Record with bound `intake_channel`, correction creating a new record instead of editing old content, raise Duplicate Concern, resolve `different_need`, resolve `same_need` with canonical Opportunity, and unresolved concerns remaining visible/gate-relevant after reload.

- [ ] **Step 2: Run focused E2E and verify failure**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "intake record|duplicate"
```

- [ ] **Step 3: Implement append/correct history UI**

Use existing repository methods only. Display correction linkage using `correctionOfRecordId` / `correctionReason`; never replace original record text in local canonical state.

- [ ] **Step 4: Implement duplicate flows**

Load `opportunities.list()` on demand for canonical Opportunity selection during `same_need` resolution. Send the current Opportunity version and rely on existing shared-schema/backend validation.

- [ ] **Step 5: Run and commit**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "intake record|duplicate"
git add app/components/stage01-operational/Stage01IntakeRecordsPanel.vue app/components/stage01-operational/Stage01DuplicateConcernsPanel.vue app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add intake history and duplicate flows"
```

---

### Task 7: Add workflow node, assignment, blocker, and gate controls

**Files:**
- Create: `app/components/stage01-operational/Stage01WorkflowNodePanel.vue`
- Create: `app/components/stage01-operational/Stage01AssignmentsPanel.vue`
- Create: `app/components/stage01-operational/Stage01BlockersPanel.vue`
- Modify: `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Extend: `tests/e2e/stage01-operational.spec.ts`

**Interfaces:**
- `01.1` complete input: `{ expectedExecutionVersion, expectedOpportunityVersion }`.
- `01.2` complete input: `{ expectedExecutionVersion, expectedCycleVersion }`.
- Revalidate evidence: `[trimmedEvidenceText]`.
- Assignment picker may use `employees.list()` only when actor also has `employee.read_directory` or `employee.read_all`; otherwise show current assignments and explain why assignee selection is unavailable instead of accepting a raw user UUID.

- [ ] **Step 1: Add failing workflow E2E cases**

Cover start, exact completion payload ownership for `01.1` vs `01.2`, reopen reason, revalidate reason/evidence, assign/end assignment, raise/resolve blocker with bound blocker category, permission hiding, gate-disabled completion, and canonical reload after each success.

- [ ] **Step 2: Run focused E2E and verify failure**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "workflow|assignment|blocker|gate"
```

- [ ] **Step 3: Implement node/gate actions**

Render canonical runtime state and server-returned gate checks. Disable completion when current gate report is unsatisfied, but still treat server response as authority.

- [ ] **Step 4: Implement assignments/blockers**

Map employee `account.userId` to display names for assignment/responsible-user controls. Preserve ended/resolved history read-only.

- [ ] **Step 5: Run and commit**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "workflow|assignment|blocker|gate"
git add app/components/stage01-operational/Stage01WorkflowNodePanel.vue app/components/stage01-operational/Stage01AssignmentsPanel.vue app/components/stage01-operational/Stage01BlockersPanel.vue app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add workflow runtime controls"
```

---

### Task 8: Add Evaluation, Recommendation, Clarification, Final Decision, and Reactivation

**Files:**
- Create: `app/components/stage01-operational/Stage01EvaluationPanel.vue`
- Create: `app/components/stage01-operational/Stage01CriterionCard.vue`
- Create: `app/components/stage01-operational/Stage01RecommendationPanel.vue`
- Create: `app/components/stage01-operational/Stage01DecisionPanel.vue`
- Create: `app/components/stage01-operational/Stage01HistoryPanel.vue`
- Modify: `app/pages/opportunities/[opportunityId]/stage-01.vue`
- Extend: `tests/e2e/stage01-operational.spec.ts`

- [ ] **Step 1: Add failing Evaluation/Decision tests**

Cover bound criterion labels, latest revision display, applicability/result validation, `allowsNotApplicable`, rationale-or-evidence requirement, recommendation versions, clarification against current recommendation ID, final decision, override-rationale error recovery, read-only final state, multiple decision-cycle history after reactivation, and exact reactivation versions.

- [ ] **Step 2: Run focused E2E and verify failure**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "criterion|recommendation|clarification|decision|reactivation|history"
```

- [ ] **Step 3: Implement criterion Evaluation UI**

Build command input from current cycle version:

```ts
{
  expectedCycleVersion: detail.currentDecisionCycle.version,
  applicability,
  result: applicability === 'not_applicable' ? null : result,
  rationale: rationale.trim(),
  evidence: evidenceText.trim() ? [evidenceText.trim()] : [],
}
```

Do not permit `not_applicable` when the bound criterion does not allow it.

- [ ] **Step 4: Implement Recommendation/Clarification/Decision**

Use exact existing Stage01 commands and explicit action permissions. Keep history visible; never edit previous versions.

If final-decision command returns `STAGE01_OVERRIDE_RATIONALE_REQUIRED`, preserve outcome/rationale and reveal an explicit override-rationale field; do not synthesize text.

- [ ] **Step 5: Implement cycle history and Reactivation**

Render `decisionCycles` ordered by cycle number. Reactivation sends the current Opportunity version, current Evaluation execution version, current cycle version, and explicit reason. After success reload and show the new cycle while older cycles remain visible read-only.

- [ ] **Step 6: Run and commit**

```bash
pnpm exec playwright test tests/e2e/stage01-operational.spec.ts --grep "criterion|recommendation|clarification|decision|reactivation|history"
git add app/components/stage01-operational/Stage01EvaluationPanel.vue app/components/stage01-operational/Stage01CriterionCard.vue app/components/stage01-operational/Stage01RecommendationPanel.vue app/components/stage01-operational/Stage01DecisionPanel.vue app/components/stage01-operational/Stage01HistoryPanel.vue app/pages/opportunities/[opportunityId]/stage-01.vue tests/e2e/stage01-operational.spec.ts
git commit -m "feat(stage01): add evaluation and decision operations"
```

---

### Task 9: Build deterministic B3 E2E fixtures and prove full operational flow

**Files:**
- Create: `tests/e2e/fixtures/stage01-operational.ts`
- Modify: `tests/e2e/opportunities.spec.ts`
- Modify: `tests/e2e/stage01-operational.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts` only if required for the four-item mobile workspace navigation assertion.

**Interfaces:**

The fixture must model state transitions by mutating an in-memory canonical `Stage01OperationalDetail` and must validate intercepted request bodies with the existing shared schemas before applying fixture state changes.

- [ ] **Step 1: Create the fixture state model**

The fixture must expose deterministic helpers for:

```ts
interface Stage01OperationalRouteState {
  opportunities: OpportunitySummary[]
  detail: Stage01OperationalDetail
  currentPublishedConfig: Stage01BusinessConfigView
  requests: Array<{ method: string, path: string, body: unknown }>
  nextFailure: null | 403 | 409 | 422 | 500
}
```

Intercept the existing Opportunity, Workflow, Stage01, Employee, and Stage01Config paths; do not invent production endpoints.

- [ ] **Step 2: Add full happy-path acceptance**

Prove this browser flow using production pages/components:

```text
Create Opportunity
→ open Stage 01
→ complete required Intake data
→ assign/start/complete 01.1
→ start 01.2
→ evaluate all required criteria
→ submit recommendation
→ record final decision
→ complete 01.2
→ render completed read-only state
```

Also prove a clarification branch and a reactivation branch with previous decision-cycle history preserved.

- [ ] **Step 3: Add permission/concurrency/error acceptance**

Assert direct route access, hidden actions, 403 no-false-success behavior, 409 explicit reload, business-gate errors preserving input, and network/server retry behavior.

- [ ] **Step 4: Add responsive/accessibility-critical assertions**

At 390px width assert no horizontal overflow, four-item primary mobile navigation remains usable, dialogs/actions are keyboard accessible, form controls have labels, and errors use alert semantics.

- [ ] **Step 5: Run all B3 E2E**

```bash
pnpm exec playwright test tests/e2e/opportunities.spec.ts tests/e2e/stage01-operational.spec.ts tests/e2e/app-shell-navigation.spec.ts tests/e2e/mobile.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/fixtures/stage01-operational.ts tests/e2e/opportunities.spec.ts tests/e2e/stage01-operational.spec.ts tests/e2e/app-shell-navigation.spec.ts tests/e2e/mobile.spec.ts
git commit -m "test(stage01): prove operational journey end to end"
```

---

### Task 10: Final B3 verification and scope audit

**Files:**
- No planned production changes unless verification reveals a B3 regression; any corrective change must remain inside approved B3 scope and receive its own focused regression test before commit.

- [ ] **Step 1: Run focused unit suites**

```bash
pnpm test:unit -- tests/unit/shared/stage01-operational-schema.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts tests/unit/auth/navigation-permissions.spec.ts tests/unit/stage01-operational/stage01-operational.spec.ts tests/unit/stage01-operational/stage01-operational-admin.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused B3 E2E**

```bash
pnpm exec playwright test tests/e2e/opportunities.spec.ts tests/e2e/stage01-operational.spec.ts tests/e2e/app-shell-navigation.spec.ts tests/e2e/mobile.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run full application verification**

```bash
pnpm verify:app
pnpm test:e2e
git diff --check
```

Expected: all PASS. Existing non-failing build warnings must be reported but are not B3 failures unless B3 introduces a new warning/error.

- [ ] **Step 4: Audit changed paths**

The final diff may include B3 docs, shared operational response schema, Stage01 GET repository/parser/contracts, Opportunity navigation/pages/components/composables/helpers, and tests. It must contain no Supabase migration, RLS/policy, generated DB type, package/dependency, Decision Runtime table rename, completion-baseline, Stage 02, or unrelated project/task/employee feature refactor.

Run:

```bash
git diff --name-status <execution_base_sha>..HEAD
```

- [ ] **Step 5: Final self-review**

Verify these hard invariants in the immutable diff:

1. Existing Opportunity commands use bound snapshot taxonomies.
2. New Opportunity creation alone may use latest B2 published config.
3. No command success manually patches gates/runtime/cycle as canonical state; all reload Stage01 operational detail.
4. `01.1` and `01.2` completion use the correct owning version field.
5. Previous decision cycles remain immutable and visible after reactivation.
6. Contact methods use Contact versions from the operational read model.
7. Explicit permissions remain separated by action.
8. No direct `workflow_taxonomy_values` client access exists.

- [ ] **Step 6: Push and verify remote SHA**

Push the dedicated implementation branch, then verify:

```bash
git ls-remote origin refs/heads/feat/vqh-stage-01-operational-ui
```

Completion is not `COMPLETE` until `remote_head_sha == head_sha`.
