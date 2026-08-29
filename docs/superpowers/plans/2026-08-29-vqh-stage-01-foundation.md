# VQH Stage 01 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Every task follows TDD and has an independent review boundary.
>
> **Status:** APPROVED EXECUTION PLAN  
> **Approved:** 2026-08-29  
> **Analysis base:** `Sonos18/company-operations-platform@f314ed7a4ff1d86e45cc29075ab0213ec6421ca1`

**Goal:** Build the reusable Workflow Core and Stage 01 Opportunity/Intake/Evaluation technical foundation without resolving or hard-coding the four open VQH Business Decision Gates.

**Architecture:** Extend the existing Taskovia modular monolith using Supabase PostgreSQL/RLS as the transactional authority, thin Nitro routes, framework-neutral server services, shared Zod contracts, and frontend repository adapters. Stage 01 remains an Opportunity workflow and does not create or reuse a Project record.

**Tech Stack:** Node.js 24.x, Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Supabase JS 2.112.x, Supabase CLI 2.114.x, PostgreSQL/RLS, Zod 4, Vitest 4.1.9, pgTAP, Playwright 1.61.1.

**Spec:** [`docs/superpowers/specs/2026-08-29-vqh-stage-01-technical-design.md`](../specs/2026-08-29-vqh-stage-01-technical-design.md)

## Global Constraints

- Preserve the approved VQH Project Journey and Stage 01 business behavior.
- `Opportunity != Project`.
- Do not automatically create a Project after `proceed`.
- Do not start Stage 02.
- Do not create canonical parent Stage 01 runtime.
- Only `01.1` and `01.2` are authoritative runtime nodes in this phase.
- Persist internal node phase; derive `locked`, `ready`, and `blocked`.
- Never provide a manual “mark blocked” mutation.
- Keep current validity separate from historical completion.
- Preserve immutable Intake Records, completion baselines, Recommendations, clarification returns, decisions, and decision cycles.
- Do not seed concrete VQH taxonomies until `BDG-TAX-01` is approved.
- Do not seed evaluation criteria until `BDG-EVAL-01` is approved.
- Do not implement concrete Decision Authority resolution or operational role mappings until `BDG-AUTH-01` is approved.
- Do not implement parent Stage runtime until `BDG-HIER-01` is approved.
- `company_admin` may receive the new explicit permission codes consistently with the existing complete-permission-catalog policy; no other role mapping is added.
- No new production dependency.
- `service_role` is forbidden on normal Stage 01 request paths.
- Database mutation rules requiring multiple writes execute atomically.
- Every mutable aggregate uses optimistic version checking where specified.
- Migrations are forward-only; do not edit existing migration files.
- `shared/types/database.types.ts` is generated, never hand-edited.
- No Cloud DEV mutation in this plan.
- No production mutation or deployment.
- No Stage 01 UI implementation in this plan.
- Local destructive DB verification requires explicit authorization in the eventual Implementation Packet.

---

## File Map

### Shared contracts

- Create `shared/schemas/workflow.ts`
- Create `shared/schemas/opportunities.ts`
- Create `shared/schemas/stage01.ts`
- Modify `shared/constants/permissions.ts`
- Modify `shared/schemas/api-error.ts`
- Regenerate `shared/types/database.types.ts`

### Database

- Create `supabase/migrations/20260829120100_stage01_workflow_core.sql`
- Create `supabase/migrations/20260829120200_stage01_opportunity_domain.sql`
- Create `supabase/migrations/20260829120300_stage01_evaluation_decision.sql`
- Create `supabase/migrations/20260829120400_stage01_security_and_commands.sql`

### Database tests

- Create `supabase/tests/database/stage01_schema.test.sql`
- Create `supabase/tests/database/stage01_rls.test.sql`
- Create `supabase/tests/database/stage01_commands.test.sql`

### Server

- Create `server/features/workflow/workflow-state.ts`
- Create `server/features/workflow/workflow-gates.ts`
- Create `server/features/workflow/workflow.repository.ts`
- Create `server/features/workflow/workflow.service.ts`
- Create `server/features/workflow/workflow.routes.ts`
- Create `server/features/opportunities/opportunity.repository.ts`
- Create `server/features/opportunities/opportunity.service.ts`
- Create `server/features/opportunities/opportunity.routes.ts`
- Create `server/features/stage01/stage01-gates.ts`
- Create `server/features/stage01/stage01.repository.ts`
- Create `server/features/stage01/stage01.service.ts`
- Create `server/features/stage01/stage01.routes.ts`

### Nitro API

Create company-scoped routes under:

```text
server/api/companies/[companyId]/
├── opportunities/
└── workflow-nodes/
```

including Opportunity CRUD/intake/duplicate/validity routes and the approved workflow/Stage 01 command routes.

### Frontend domain/repositories

- Create `app/features/opportunities/opportunity.types.ts`
- Create `app/features/workflow/workflow.types.ts`
- Create `app/features/stage01/stage01.types.ts`
- Modify `app/repositories/contracts.ts`
- Create `app/repositories/http/http-opportunity-repository.ts`
- Create `app/repositories/http/http-workflow-repository.ts`
- Create `app/repositories/http/http-stage01-repository.ts`
- Modify `app/plugins/repositories.client.ts`

No Vue page/component is added in Phase A.

### Unit tests

- Create `tests/unit/shared/stage01-schemas.spec.ts`
- Create `tests/unit/server/workflow-state.spec.ts`
- Create `tests/unit/server/stage01-gates.spec.ts`
- Create `tests/unit/server/opportunity.service.spec.ts`
- Create `tests/unit/server/workflow.service.spec.ts`
- Create `tests/unit/server/stage01.service.spec.ts`
- Create `tests/unit/server/opportunity-routes.spec.ts`
- Create `tests/unit/server/workflow-routes.spec.ts`
- Create `tests/unit/server/stage01-routes.spec.ts`
- Create HTTP repository tests under `tests/unit/repositories/`

---

### Task 1: Establish shared Stage 01 contracts

**Files:**
- Create `shared/schemas/workflow.ts`
- Create `shared/schemas/opportunities.ts`
- Create `shared/schemas/stage01.ts`
- Modify `shared/constants/permissions.ts`
- Modify `shared/schemas/api-error.ts`
- Create `tests/unit/shared/stage01-schemas.spec.ts`

**Interfaces:**
- Produces: `WorkflowNodeState`, `WorkflowInternalPhase`, `WorkflowNodeRuntime`, `GateReport`, `OpportunitySummary`, `OpportunityDetail`, `CreateOpportunityInput`, `UpdateOpportunityInput`, `Stage01Detail`, `CriterionEvaluation`, `Stage01Recommendation`, `Stage01DecisionCycle`.

- [ ] **Step 1: Write failing schema tests for canonical workflow states**

```ts
expect(workflowNodeStateSchema.options).toEqual([
  'locked',
  'ready',
  'active',
  'blocked',
  'completed',
  'not_applicable',
])

expect(workflowInternalPhaseSchema.options).toEqual([
  'not_started',
  'active',
  'completed',
  'not_applicable',
])
```

- [ ] **Step 2: Assert Stage 01 outcome contracts**

```ts
expect(stage01FinalOutcomeSchema.options).toEqual([
  'proceed',
  'not_proceeding',
])

expect(stage01RecommendationSchema.options).toEqual([
  'recommend_proceed',
  'recommend_not_proceeding',
])
```

- [ ] **Step 3: Assert criterion applicability is separate from result**

```ts
criterionEvaluationSchema.parse({
  applicability: 'not_applicable',
  result: null,
  rationale: 'Không áp dụng trong trường hợp này',
})

expect(() =>
  criterionEvaluationSchema.parse({
    applicability: 'applicable',
    result: null,
    rationale: '',
  }),
).toThrow()
```

- [ ] **Step 4: Run the focused test and confirm red**

```bash
pnpm exec vitest run tests/unit/shared/stage01-schemas.spec.ts
```

Expected: FAIL because the schemas are missing.

- [ ] **Step 5: Implement shared schemas and permission/error contracts**

Add exactly:

```text
opportunity.read
opportunity.create
opportunity.update
opportunity.intake_record.create
opportunity.duplicate.resolve
opportunity.invalidate
opportunity.restore
journey.read
journey.assignment.manage
journey.node.start
journey.node.complete
journey.node.reopen
journey.node.revalidate
journey.blocker.raise
journey.blocker.resolve
stage01.evaluation.update
stage01.recommendation.submit
stage01.clarification.return
stage01.decision.record
stage01.reactivate
```

Add the stable Stage 01 error codes approved by the Technical Spec.

- [ ] **Step 6: Run the focused test and confirm green**

```bash
pnpm exec vitest run tests/unit/shared/stage01-schemas.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared tests/unit/shared/stage01-schemas.spec.ts
git commit -m "feat: define stage 01 shared contracts"
```

---

### Task 2: Define failing database contracts

**Files:**
- Create `supabase/tests/database/stage01_schema.test.sql`
- Create `supabase/tests/database/stage01_rls.test.sql`
- Create `supabase/tests/database/stage01_commands.test.sql`

**Interfaces:**
- Consumes existing tenancy, normalized RBAC, `audit_events`, and `private.has_company_permission`.
- Produces executable database requirements for Workflow Core and Stage 01.

- [ ] **Step 1: Assert required relations before migrations exist**

```sql
begin;
select no_plan();

select has_table('public', 'workflow_instances');
select has_table('public', 'workflow_node_executions');
select has_table('public', 'opportunities');
select has_table('public', 'opportunity_intake_records');
select has_table('public', 'stage01_intake_completion_baselines');
select has_table('public', 'stage01_decision_cycles');
select has_table('public', 'stage01_recommendations');

select * from finish();
rollback;
```

Expand assertions to:

```text
workflow_definition_snapshots
workflow_instances
workflow_node_instances
workflow_node_executions
workflow_node_events
workflow_node_assignments
workflow_blockers
opportunities
stage01_taxonomy_values
contacts
contact_methods
opportunity_contacts
opportunity_scopes
opportunity_referrers
opportunity_intake_records
opportunity_duplicate_concerns
stage01_intake_completion_baselines
stage01_decision_cycles
stage01_criterion_evaluations
stage01_recommendations
stage01_clarification_returns
```

and their required columns, FKs, unique indexes, and RLS enablement.

- [ ] **Step 2: Write RLS scenarios**

Cover two companies and assert:

```text
company A member → can read allowed A records
company A member → cannot read B records
company A member → cannot mutate B records
anonymous → cannot read Stage 01 business tables
```

- [ ] **Step 3: Define expected command functions before they exist**

```text
start_workflow_node
complete_stage01_intake
resolve_opportunity_duplicate
invalidate_opportunity
restore_opportunity
resolve_workflow_blocker
reopen_workflow_node
revalidate_workflow_node
record_stage01_final_decision
reactivate_stage01
```

- [ ] **Step 4: Prove the tests are red**

```bash
pnpm db:local:reset
pnpm db:local:test
```

Expected: Stage 01 pgTAP tests FAIL because schema/functions do not exist.

- [ ] **Step 5: Commit red contracts**

```bash
git add supabase/tests/database/stage01_*.test.sql
git commit -m "test: define stage 01 database contract"
```

---

### Task 3: Create Workflow Core schema

**Files:**
- Create `supabase/migrations/20260829120100_stage01_workflow_core.sql`
- Modify `supabase/tests/database/stage01_schema.test.sql`

**Interfaces:**
- Produces generic Workflow Core persistence used by Opportunity and Stage 01 commands.

Implement exactly:

```text
workflow_definition_snapshots
workflow_instances
workflow_node_instances
workflow_node_executions
workflow_node_events
workflow_node_assignments
workflow_blockers
```

- [ ] **Step 1: Create the seven company-scoped Workflow Core tables**

`workflow_node_executions.phase` permits exactly:

```text
not_started
active
completed
not_applicable
```

- [ ] **Step 2: Add one-current-execution constraint**

```sql
create unique index workflow_node_executions_one_current
on public.workflow_node_executions (node_instance_id)
where superseded_at is null;
```

- [ ] **Step 3: Add one-active-accountable-owner constraint**

```sql
create unique index workflow_node_assignments_one_active_owner
on public.workflow_node_assignments (node_execution_id)
where assignment_kind = 'accountable_owner'
  and ended_at is null;
```

- [ ] **Step 4: Constrain blocker effect**

```text
blocking
non_blocking
```

Definition snapshots are immutable from application access. Do not create a parent Stage 01 runtime row.

- [ ] **Step 5: Run schema tests**

Expected: Workflow Core assertions PASS; downstream Opportunity assertions remain red.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260829120100_stage01_workflow_core.sql \
        supabase/tests/database/stage01_schema.test.sql
git commit -m "feat: add workflow core persistence"
```

---

### Task 4: Create Opportunity and intake domain schema

**Files:**
- Create `supabase/migrations/20260829120200_stage01_opportunity_domain.sql`
- Modify `supabase/tests/database/stage01_schema.test.sql`

Implement:

```text
opportunities
stage01_taxonomy_values
contacts
contact_methods
opportunity_contacts
opportunity_scopes
opportunity_referrers
opportunity_intake_records
opportunity_duplicate_concerns
stage01_intake_completion_baselines
```

- [ ] **Step 1: Add Opportunity with only approved persisted invariants**

`validity_state`:

```text
valid
invalid
```

`location_status`:

```text
unknown
area_known
relative
exact
```

Do not create `received_at`; `opportunities.created_at` remains official system intake timestamp.

- [ ] **Step 2: Add historical contacts/scopes/referrer/intake structures**

One active Primary Contact:

```sql
create unique index opportunity_contacts_one_active_primary
on public.opportunity_contacts (opportunity_id)
where is_primary
  and ended_at is null;
```

Intake corrections use `correction_of_record_id` plus `correction_reason`; do not expose a normal mutable history path.

- [ ] **Step 3: Add duplicate concern and immutable completion baseline structures**

Duplicate resolution permits only:

```text
same_need
different_need
```

Completion baselines are append-only.

- [ ] **Step 4: Run database tests**

```bash
pnpm db:local:reset
pnpm db:local:test
```

Expected: Opportunity schema assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829120200_stage01_opportunity_domain.sql \
        supabase/tests/database/stage01_schema.test.sql
git commit -m "feat: add stage 01 opportunity domain"
```

---

### Task 5: Create evaluation and immutable decision-cycle schema

**Files:**
- Create `supabase/migrations/20260829120300_stage01_evaluation_decision.sql`
- Modify `supabase/tests/database/stage01_schema.test.sql`

Implement:

```text
stage01_decision_cycles
stage01_criterion_evaluations
stage01_recommendations
stage01_clarification_returns
```

- [ ] **Step 1: Add immutable Decision Cycle identity**

Unique:

```text
(opportunity_id, cycle_no)
(node_execution_id)
```

`final_outcome` allows only:

```text
proceed
not_proceeding
```

- [ ] **Step 2: Add criterion-evaluation version history**

`applicability`:

```text
applicable
not_applicable
```

Applicable result:

```text
fit
concern
not_fit
insufficient_information
```

Enforce:

```text
not_applicable → result IS NULL
applicable     → result IS NOT NULL
```

- [ ] **Step 3: Add append-only Recommendations and clarification returns**

Recommendation permits only:

```text
recommend_proceed
recommend_not_proceeding
```

Final Decision fields are not exposed to unrestricted UPDATE.

- [ ] **Step 4: Run database tests and confirm schema suite green**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829120300_stage01_evaluation_decision.sql \
        supabase/tests/database/stage01_schema.test.sql
git commit -m "feat: add stage 01 decision history"
```

---

### Task 6: Add RLS and permission enforcement

**Files:**
- Create `supabase/migrations/20260829120400_stage01_security_and_commands.sql`
- Modify `supabase/tests/database/stage01_rls.test.sql`

**Interfaces:**
- Consumes existing `private.has_company_permission(...)`.
- Produces Stage 01 permission catalog, policies, grants, and secure command boundary.

- [ ] **Step 1: Insert approved stable permission codes**

Insert all codes from Task 1 into `public.permissions`.

- [ ] **Step 2: Extend only `company_admin` complete explicit permission mapping**

Do not map Stage 01 permissions to operational roles in this phase.

- [ ] **Step 3: Add RLS read policies**

Opportunity reads require active membership plus `opportunity.read`; Workflow reads require active membership plus `journey.read`.

- [ ] **Step 4: Prevent unrestricted authenticated mutation of protected runtime/history tables**

No normal authenticated user receives direct unrestricted INSERT/UPDATE/DELETE over controlled Stage 01 runtime/history tables.

- [ ] **Step 5: Test immediate permission loss and cross-company isolation**

- [ ] **Step 6: Run database suite**

```bash
pnpm db:local:reset
pnpm db:local:test
```

Expected: RLS suite PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260829120400_stage01_security_and_commands.sql \
        supabase/tests/database/stage01_rls.test.sql
git commit -m "feat: secure stage 01 persistence"
```

---

### Task 7: Implement pure workflow state and gate logic

**Files:**
- Create `server/features/workflow/workflow-state.ts`
- Create `server/features/workflow/workflow-gates.ts`
- Create `server/features/stage01/stage01-gates.ts`
- Create `tests/unit/server/workflow-state.spec.ts`
- Create `tests/unit/server/stage01-gates.spec.ts`

**Produces:**

```ts
export function deriveWorkflowNodeState(input: {
  phase: 'not_started' | 'active' | 'completed' | 'not_applicable'
  dependenciesSatisfied: boolean
  hasOpenBlockingBlocker: boolean
}): WorkflowNodeState
```

- [ ] **Step 1: Write failing truth-table tests**

```text
not_started + dependency false → locked
not_started + dependency true  → ready
active + blocking true          → blocked
active + blocking false         → active
completed                       → completed
not_applicable                  → not_applicable
```

- [ ] **Step 2: Write failing intake-gate tests**

Gate codes:

```text
OPPORTUNITY_VALID
INTAKE_OWNER_ASSIGNED
PRIMARY_CUSTOMER_PRESENT
CUSTOMER_TYPE_PRESENT
PRIMARY_CONTACT_PRESENT
CONTACT_METHOD_USABLE
CONTACT_RELATIONSHIP_PRESENT
SCOPE_PRESENT
NEED_DESCRIPTION_PRESENT
LOCATION_STATUS_PRESENT
LEAD_SOURCE_PRESENT
REFERRER_PRESENT_IF_REQUIRED
ENGAGEMENT_STATUS_PRESENT
INTAKE_RECORD_PRESENT
NO_OPEN_BLOCKING_BLOCKER
NO_UNRESOLVED_DUPLICATE
```

Do not add budget, timeline, priority, files, Project Manager, or fully verified Customer master as gates.

- [ ] **Step 3: Run focused tests and confirm red**

- [ ] **Step 4: Implement minimal pure state/gate functions**

- [ ] **Step 5: Run focused tests and confirm green**

- [ ] **Step 6: Commit**

```bash
git add server/features/workflow \
        server/features/stage01/stage01-gates.ts \
        tests/unit/server/workflow-state.spec.ts \
        tests/unit/server/stage01-gates.spec.ts
git commit -m "feat: add stage 01 workflow gates"
```

---

### Task 8: Implement atomic Workflow and 01.1 commands

**Files:**
- Modify `supabase/migrations/20260829120400_stage01_security_and_commands.sql`
- Modify `supabase/tests/database/stage01_commands.test.sql`

Required public wrappers:

```text
start_workflow_node
complete_stage01_intake
resolve_workflow_blocker
reopen_workflow_node
revalidate_workflow_node
invalidate_opportunity
restore_opportunity
resolve_opportunity_duplicate
```

Use:

```text
public SECURITY INVOKER wrapper
            ↓
private SECURITY DEFINER implementation
            ↓
membership + permission + state + version checks
            ↓
SELECT ... FOR UPDATE
            ↓
domain writes
            ↓
workflow event
            ↓
audit event
```

- [ ] **Step 1: Implement atomic Start**

Require valid state, active owner, permission, and optimistic version.

- [ ] **Step 2: Implement `complete_stage01_intake`**

Inside one transaction:

1. lock Opportunity and current `01.1` execution;
2. verify expected version;
3. evaluate all approved 01.1 gates;
4. reject any unsatisfied required gate;
5. create immutable completion baseline;
6. change phase to `completed`;
7. increment execution version;
8. append workflow event;
9. append audit event.

Never store an explicit `01.2 unlocked` boolean.

- [ ] **Step 3: Implement blocker, duplicate, invalidation, restore, reopen and revalidation commands**

- [ ] **Step 4: Add concurrency tests**

Prove exactly one succeeds for:

```text
double Complete 01.1
double duplicate resolution
stale Opportunity mutation
stale node mutation
```

- [ ] **Step 5: Run pgTAP command suite**

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260829120400_stage01_security_and_commands.sql \
        supabase/tests/database/stage01_commands.test.sql
git commit -m "feat: add atomic stage 01 intake commands"
```

---

### Task 9: Implement generic Stage 01 evaluation and decision commands

**Files:**
- Modify `supabase/migrations/20260829120400_stage01_security_and_commands.sql`
- Modify `supabase/tests/database/stage01_commands.test.sql`

Implement:

```text
record_stage01_criterion_evaluation
submit_stage01_recommendation
return_stage01_for_clarification
record_stage01_final_decision
complete_stage01_evaluation
reactivate_stage01
```

The foundation does not implement a concrete Decision Authority resolver.

- [ ] **Step 1: Require pre-resolved Decision Authority for Final Decision**

`record_stage01_final_decision` requires `decision_authority_user_id` plus `authority_resolution_reference`; unresolved authority is rejected.

- [ ] **Step 2: Enforce Final Decision invariants**

```text
01.2 active
Opportunity valid
required applicable criteria satisfied
current Recommendation exists
no clarification newer than Recommendation
Decision Authority resolved
actor = Decision Authority
actor has stage01.decision.record
Final Decision absent
```

When outcome differs from Recommendation, `override_rationale` is mandatory.

- [ ] **Step 3: Implement explicit 01.2 completion separately from Final Decision**

Final Decision must not auto-complete 01.2.

- [ ] **Step 4: Implement Reactivation**

Require latest completed cycle `not_proceeding`, valid Opportunity, valid 01.1 basis, no newer active cycle. Atomically supersede old 01.2 execution, create execution N+1, create Decision Cycle N+1, and append history.

- [ ] **Step 5: Add decision tests**

Prove:

```text
fit / concern / not_fit can satisfy evaluated gate
insufficient_information does not satisfy required evaluation
concern and not_fit do not auto-decide outcome
clarification requires a newer Recommendation
Final Decision does not complete 01.2
Cycle #1 is unchanged after Reactivation
```

- [ ] **Step 6: Run database tests**

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260829120400_stage01_security_and_commands.sql \
        supabase/tests/database/stage01_commands.test.sql
git commit -m "feat: add stage 01 decision commands"
```

---

### Task 10: Build server repositories and services

**Files:**
- Create the `workflow`, `opportunities`, and `stage01` feature modules from the File Map.
- Create service unit tests.

Opportunity service context:

```ts
export interface OpportunityServiceContext {
  actorId: string
  tenantId: string
  companyId: string
  permissions: readonly PermissionCode[]
}
```

Workflow service exposes:

```ts
getForOpportunity()
startNode()
completeNode()
reopenNode()
revalidateNode()
assign()
raiseBlocker()
resolveBlocker()
```

Stage 01 service exposes:

```ts
get()
evaluateCriterion()
submitRecommendation()
returnForClarification()
recordFinalDecision()
reactivate()
```

- [ ] **Step 1: Write failing service tests using fake repositories**

Cover missing permissions, bad state, conflict mapping, and success paths.

- [ ] **Step 2: Implement repositories with user-scoped Supabase clients only**

Do not use service-role clients.

- [ ] **Step 3: Implement service-level early authorization and validation**

Database commands remain final mutation authority.

- [ ] **Step 4: Run focused service tests**

```bash
pnpm exec vitest run \
  tests/unit/server/opportunity.service.spec.ts \
  tests/unit/server/workflow.service.spec.ts \
  tests/unit/server/stage01.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/features \
        tests/unit/server/opportunity.service.spec.ts \
        tests/unit/server/workflow.service.spec.ts \
        tests/unit/server/stage01.service.spec.ts
git commit -m "feat: add stage 01 server services"
```

---

### Task 11: Add thin Nitro route adapters

**Files:**
- Create company-scoped Stage 01 routes under `server/api/companies/[companyId]/`.
- Create route unit tests.

Every route must use the existing pattern:

```text
requireAuthenticatedRequest
→ tenancy.resolveCompanyContext
→ service
→ runApiRoute
```

and Zod parsing at the boundary.

Required groups:

```text
opportunities
intake-records
duplicate-concerns
invalidate
restore
workflow node start
workflow node complete
workflow node reopen
workflow node revalidate
assignments
blockers
Stage 01 aggregate
criterion evaluation
Recommendations
clarification returns
Final Decision
reactivation
```

- [ ] **Step 1: Write failing route tests**

Prove invalid UUID → 400, malformed body → 400, unauthenticated → auth error, stable service error propagation, and company context resolution.

- [ ] **Step 2: Implement thin route adapters only**

No business-transition logic in Nitro route files.

- [ ] **Step 3: Run route tests**

```bash
pnpm exec vitest run \
  tests/unit/server/opportunity-routes.spec.ts \
  tests/unit/server/workflow-routes.spec.ts \
  tests/unit/server/stage01-routes.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/api server/features tests/unit/server/*routes.spec.ts
git commit -m "feat: expose stage 01 api contracts"
```

---

### Task 12: Add frontend repository contracts and HTTP adapters

**Files:**
- Create frontend domain types.
- Modify `app/repositories/contracts.ts`.
- Create three HTTP repositories.
- Modify `app/plugins/repositories.client.ts`.
- Create HTTP repository tests.

Registry additions:

```ts
export interface RepositoryRegistry {
  // existing repositories...
  opportunities: OpportunityRepository
  workflow: WorkflowRepository
  stage01: Stage01Repository
}
```

Do not replace `ProjectRepository`, current prototype `journey.types.ts`, or existing Project Journey components in this phase.

- [ ] **Step 1: Write failing HTTP repository tests**

Verify method, company-scoped URL, request body, `expectedVersion`, authenticated client use, Zod response parsing, and stable error propagation.

- [ ] **Step 2: Implement domain types and repository interfaces**

- [ ] **Step 3: Implement authenticated HTTP adapters**

- [ ] **Step 4: Make repositories available through the registry without migrating the existing Journey UI**

- [ ] **Step 5: Run repository tests**

```bash
pnpm exec vitest run tests/unit/repositories
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/features app/repositories app/plugins/repositories.client.ts tests/unit/repositories
git commit -m "feat: add stage 01 http repositories"
```

---

### Task 13: Generate database types and run full local verification

**Files:**
- Regenerate `shared/types/database.types.ts`.

Do not manually modify generated output.

- [ ] **Step 1: Rebuild and test local database**

```bash
pnpm db:local:reset
pnpm db:local:test
```

- [ ] **Step 2: Generate TypeScript database types**

```bash
pnpm db:local:types
```

Review the generated type diff.

- [ ] **Step 3: Run application verification**

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 4: Run aggregate backend verification**

```bash
pnpm verify:backend:local
```

Expected:

```text
database reset succeeds
all pgTAP tests pass
generated DB types match migration schema
Vitest passes
Nuxt typecheck passes
ESLint passes
Nuxt build exits 0
```

- [ ] **Step 5: Commit generated types**

```bash
git add shared/types/database.types.ts
git commit -m "chore: regenerate stage 01 database types"
```

---

### Task 14: Foundation boundary audit

Before declaring Phase A complete, prove all of the following remain absent:

```text
VQH concrete taxonomy seed
VQH concrete evaluation-criteria seed
operational role → Stage 01 permission mappings
hard-coded Decision Authority
parent Stage 01 runtime
Stage 02 start behavior
automatic Project creation
Project Manager assignment
new Stage 01 Vue page/workspace
Cloud DEV mutation
production mutation
```

Also prove persisted history can reconstruct:

```text
01.1 completion basis
assignment at completion
workflow events
blocker history
decision cycle
criterion revision history
Recommendation versions
clarification returns
Final Decision
reactivation history
```

- [ ] **Step 1: Run final verification**

```bash
pnpm verify:backend:local
git diff --check
git status --short
```

- [ ] **Step 2: Fetch the remote base again and classify source drift using `AGENTS.md`**

- [ ] **Step 3: Commit only focused final test/correction changes if needed**

Do not squash unrelated history.

---

# Business Gate Checkpoint

Phase A MUST stop here.

It is **not production-ready Stage 01**.

Before Phase B, the following approved inputs must exist.

## `BDG-TAX-01`

Actual VQH configuration for:

```text
Customer Type
Contact Relationship
Scope
Lead Source
Referrer Type
Engagement Status
Invalid Reason
```

## `BDG-EVAL-01`

Actual VQH Stage 01 evaluation configuration:

```text
criteria
criticality
conditional applicability
N/A allowance
risk taxonomy
```

## `BDG-AUTH-01`

Approved:

```text
Intake Owner resolution/default
Evaluation Owner resolution/default
Decision Authority rule
clarification authority
Completer policy
operational role → permission mapping
```

## `BDG-HIER-01`

Required only before introducing parent Stage 01 runtime.

Phase B must be a separate approved Execution Plan covering:

```text
VQH configuration seed
DecisionAuthorityResolver implementation
approved role mappings
production enablement
Stage 01 interaction/UI design and implementation
API/browser acceptance flow
Cloud DEV rollout
```

No Phase B behavior may be inferred from Phase A.

---

# Execution authorization boundary

Approval of this plan authorizes only creation of a future Implementation Packet.

It does not by itself authorize Codex execution.

The eventual packet must explicitly contain:

```yaml
analysis_base_sha: f314ed7a4ff1d86e45cc29075ab0213ec6421ca1

approved_design_ref:
  docs/superpowers/specs/2026-08-29-vqh-stage-01-technical-design.md

approved_execution_plan_ref:
  docs/superpowers/plans/2026-08-29-vqh-stage-01-foundation.md

side_effects:
  local_db_destructive: true
  cloud_dev_mutating: false
  production_mutating: false

delivery:
  push: true
  create_pr: false
  merge: false
  force_push: false
```

Codex must fetch the remote base and return one of:

```text
READY
READY_WITH_NON_MATERIAL_DRIFT
PACKET_STALE
BLOCKED
```

before changing implementation files.
