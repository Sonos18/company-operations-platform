# VQH Stage 01 Phase A Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in the current session. Inline execution is the user-selected mode; do not dispatch subagents. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status:** APPROVED
> **Implementation authorization:** NONE
> **Plan date:** 2026-08-29
> **Cloud DEV execution amendment:** APPROVED 2026-08-30
> **Analysis base:** `Sonos18/company-operations-platform@f314ed7a4ff1d86e45cc29075ab0213ec6421ca1`
> **Approved corrected spec commit:** `cf198b3bbf57df794bbe22464ccabd3704174153`

**Goal:** Build and verify the VQH Stage 01 Phase A runtime foundation while failing closed until the four open Business Decision Gates are resolved and an approved company definition is published.

**Architecture:** Extend the Taskovia modular monolith with a minimal reusable Workflow Core plus Opportunity, Intake, Evaluation, and Decision domains. Supabase PostgreSQL is the final transaction and authorization authority; Nitro routes and user-scoped repositories expose explicit resource/command contracts without a generic mutation proxy. Phase A creates no production VQH configuration, Project, Project Manager assignment, parent Stage 01 runtime, Stage 02 runtime, or Stage 01 UI migration.

**Tech Stack:** pnpm 10.29.3, Node.js 24.x, Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9.3, Supabase JS 2.112.x, Supabase CLI 2.114.0, canonical Supabase Cloud DEV, PostgreSQL/RLS, transaction-wrapped SQL assertions, Zod 4.x, Vitest 4.1.9, Playwright 1.61.1.

**Spec:** [`docs/superpowers/specs/2026-08-29-vqh-stage-01-technical-design.md`](../specs/2026-08-29-vqh-stage-01-technical-design.md)

## Global Constraints

- Implement Phase A only.
- Use the current clean checkout; do not create a worktree.
- Follow TDD inside every task: red test, observed failure, minimal implementation, green test, focused commit. Database red/green evidence runs only against the guarded canonical Cloud DEV target.
- `Opportunity != Project`; never overload `ProjectRepository` with Opportunity behavior.
- Create Opportunity atomically with its Workflow Instance, node instances/executions `01.1` and `01.2`, Decision Cycle #1, workflow events, and audit.
- No complete published company definition returns `STAGE01_DEFINITION_CONFIG_UNAVAILABLE` and commits no aggregate rows.
- An invalid newest definition returns `STAGE01_DEFINITION_CONFIG_INVALID`; never fall back to an older definition.
- Synthetic complete definitions are automated-test fixtures only and must be rolled back or removed by the fixed Cloud DEV harness.
- Do not resolve or infer `BDG-TAX-01`, `BDG-EVAL-01`, `BDG-AUTH-01`, or `BDG-HIER-01`.
- Do not seed concrete VQH taxonomies, evaluation criteria, authority rules, or operational role mappings.
- Do not create a Project, assign a Project Manager, create canonical parent Stage 01 runtime, or start Stage 02.
- Persist `not_started`, `active`, `completed`, or `not_applicable`; derive `locked`, `ready`, and `blocked`.
- Never provide a manual “mark blocked” mutation.
- Treat `reliability_state` as data-quality metadata; it never creates a gate or Blocker by itself.
- Preserve historical Intake Records, completion baselines, events, criterion revisions, Recommendations, clarification returns, Final Decisions, and Decision Cycles.
- Insert the `01.1` completion event before inserting the baseline that references it; roll back both on any error.
- Every Stage 01 business mutation uses an explicit controlled RPC.
- Use the repository’s public `SECURITY INVOKER` wrapper → private `SECURITY DEFINER SET search_path = ''` implementation pattern.
- Schema-qualify every relation and function inside `SECURITY DEFINER` functions.
- Derive identity from `auth.uid()` and current database membership/permissions; never authorize from `user_metadata` or client role claims.
- Revoke function execution from `PUBLIC` and `anon`; grant exact signatures only.
- Grant authenticated reads explicitly and enforce company-scoped RLS separately.
- Do not grant unrestricted authenticated `INSERT`, `UPDATE`, or `DELETE` on protected Stage 01 tables.
- `service_role` is forbidden on normal request paths. The fixed Cloud DEV verification harness uses linked database access only and never turns `service_role` into an application dependency.
- Use `expectedOpportunityVersion`, `expectedContactVersion`, `expectedExecutionVersion`, or `expectedCycleVersion` according to the owning aggregate.
- Migrations are forward-only; never edit an existing migration.
- Create every new migration with `pnpm exec supabase migration new <approved_name>` before assigning the exact ordered filename in the File Map; never fabricate a migration-history row.
- `shared/types/database.types.ts` is generated and must not be hand-edited.
- No new production dependency.
- No Stage 01 Vue page, workspace, or existing Journey UI migration.
- Docker and local Supabase are outside the Stage 01 workflow. Do not run `db:local:*`, `verify:backend:local`, `supabase start`, `supabase db reset`, or the Docker-backed Supabase CLI pgTAP runner.
- Cloud DEV migration pushes and controlled test-fixture mutations require the exact authorization and guardrails in the Implementation Packet. Production mutation, deployment, merge, and force-push remain unauthorized.
- Every Cloud DEV operation must pass `db:dev:target`; migration delivery must run `db:dev:status`, `db:dev:dry-run`, then `db:dev:push` through the fixed runner.
- Never run remote reset, seed, migration repair, dashboard/Table Editor schema changes, arbitrary linked SQL, or operator-supplied test-file paths.
- Once a migration has reached Cloud DEV, never edit it. Diagnose failures and add a new forward corrective migration generated with `supabase migration new`.

---

## File Map

### Shared contracts

- Create `shared/schemas/workflow.ts` — workflow state, actions, assignments, blockers, and gate reports.
- Create `shared/schemas/opportunities.ts` — Opportunity, Contact, Scope, Referrer, Intake, duplicate, and validity contracts.
- Create `shared/schemas/stage01.ts` — definition, evaluation, Recommendation, clarification, Final Decision, and aggregate contracts.
- Modify `shared/constants/permissions.ts` — add the approved explicit permission codes.
- Modify `shared/schemas/api-error.ts` — add the stable Stage 01 error codes.
- Regenerate `shared/types/database.types.ts` from the linked canonical Cloud DEV project after all eight migrations pass remote verification.

### Database migrations

- Create `supabase/migrations/20260829120100_stage01_workflow_core.sql` — Workflow Core tables and indexes.
- Create `supabase/migrations/20260829120200_stage01_definition_contract.sql` — published definition validation contract.
- Create `supabase/migrations/20260829120300_stage01_opportunity_domain.sql` — Opportunity and Intake tables.
- Create `supabase/migrations/20260829120400_stage01_evaluation_decision.sql` — Evaluation and Decision Cycle tables.
- Create `supabase/migrations/20260829120500_stage01_security.sql` — permissions, grants, RLS, and history guards.
- Create `supabase/migrations/20260829120600_stage01_opportunity_commands.sql` — bootstrap and Opportunity-owned commands.
- Create `supabase/migrations/20260829120700_stage01_workflow_commands.sql` — assignments, blockers, `01.1`, validity, reopen, and revalidation commands.
- Create `supabase/migrations/20260829120800_stage01_decision_commands.sql` — evaluation, Recommendation, Final Decision, `01.2`, and Reactivation commands.

### Database verification

- Modify `package.json` — add fixed no-Docker Stage 01 Cloud DEV verification commands.
- Modify `scripts/run-supabase-dev.mjs` — add an allowlisted `stage01-test` mode using `db query --linked --file`; do not accept arbitrary SQL paths or extra arguments.
- Create `scripts/run-stage01-cloud-dev-concurrency.mjs` — fixed multi-process race harness with deterministic cleanup.
- Modify `tests/unit/config/supabase-cloud-dev-runner.spec.ts` and create `tests/unit/config/stage01-cloud-dev-concurrency.spec.ts` — fail-closed runner contracts.
- Create `supabase/tests/database/stage01_schema.test.sql` — relations, columns, checks, FKs, and indexes using exception-based SQL assertions.
- Create `supabase/tests/database/stage01_definition.test.sql` — definition validation and publication semantics.
- Create `supabase/tests/database/stage01_bootstrap.test.sql` — `DB-S01-BOOT-001..003`.
- Create `supabase/tests/database/stage01_security.test.sql` — `DB-S01-SEC-001..007`.
- Create `supabase/tests/database/stage01_history.test.sql` — `DB-S01-HIST-001..005` and `DB-S01-COMP-001`.
- Create `supabase/tests/database/stage01_commands.test.sql` — state, gate, and permission behavior.
- Create `supabase/tests/database/stage01_concurrency_setup.sql`, `stage01_concurrency_actor_a.sql`, `stage01_concurrency_actor_b.sql`, `stage01_concurrency_assert.sql`, and `stage01_concurrency_cleanup.sql` — fixed Cloud DEV multi-session race fixtures and assertions.
- Create `supabase/tests/database/stage01_flows.test.sql` — end-to-end public-RPC acceptance flows 1–33.

### Server modules

- Create `server/features/workflow/workflow-state.ts`.
- Create `server/features/workflow/workflow-gates.ts`.
- Create `server/features/workflow/workflow.repository.ts`.
- Create `server/features/workflow/workflow.service.ts`.
- Create `server/features/workflow/workflow.routes.ts`.
- Create `server/features/opportunities/opportunity.repository.ts`.
- Create `server/features/opportunities/opportunity.service.ts`.
- Create `server/features/opportunities/opportunity.routes.ts`.
- Create `server/features/stage01/stage01-gates.ts`.
- Create `server/features/stage01/decision-authority.ts`.
- Create `server/features/stage01/stage01.repository.ts`.
- Create `server/features/stage01/stage01.service.ts`.
- Create `server/features/stage01/stage01.routes.ts`.

### Nitro adapters

Create the explicit route files listed in Task 12 under `server/api/companies/[companyId]/`. No route accepts an aggregate-wide nested mutation body.

### Frontend repositories

- Create `app/features/opportunities/opportunity.types.ts`.
- Create `app/features/workflow/workflow.types.ts`.
- Create `app/features/stage01/stage01.types.ts`.
- Modify `app/errors/client-error.ts` — preserve stable Stage 01 API error codes.
- Modify `app/repositories/contracts.ts`.
- Modify `app/repositories/http/authenticated-http-client.ts` — propagate parsed non-auth API errors instead of collapsing them to `INTERNAL_ERROR`.
- Create `app/repositories/http/http-opportunity-repository.ts`.
- Create `app/repositories/http/http-workflow-repository.ts`.
- Create `app/repositories/http/http-stage01-repository.ts`.
- Modify `app/repositories/mock/mock-repositories.ts` — return the legacy/prototype portion of the registry without inventing Stage 01 mock behavior.
- Modify `app/plugins/repositories.client.ts`.

### Unit tests

- Create `tests/unit/shared/stage01-schemas.spec.ts`.
- Create `tests/unit/server/workflow-state.spec.ts`.
- Create `tests/unit/server/stage01-gates.spec.ts`.
- Create `tests/unit/server/opportunity.repository.spec.ts`.
- Create `tests/unit/server/workflow.repository.spec.ts`.
- Create `tests/unit/server/stage01.repository.spec.ts`.
- Create `tests/unit/server/opportunity.service.spec.ts`.
- Create `tests/unit/server/workflow.service.spec.ts`.
- Create `tests/unit/server/stage01.service.spec.ts`.
- Create `tests/unit/server/opportunity-routes.spec.ts`.
- Create `tests/unit/server/workflow-routes.spec.ts`.
- Create `tests/unit/server/stage01-routes.spec.ts`.
- Create `tests/unit/server/stage01-api-files.spec.ts`.
- Create `tests/unit/repositories/http-opportunity-repository.spec.ts`.
- Create `tests/unit/repositories/http-workflow-repository.spec.ts`.
- Create `tests/unit/repositories/http-stage01-repository.spec.ts`.
- Modify `tests/unit/auth/authenticated-http-client.spec.ts`.
- Modify `tests/unit/auth/client-error.spec.ts`.
- Modify `tests/unit/server/service-role-boundary.spec.ts`.

---

### Task 1: Establish shared Stage 01 contracts

**Files:**

- Create `shared/schemas/workflow.ts`.
- Create `shared/schemas/opportunities.ts`.
- Create `shared/schemas/stage01.ts`.
- Modify `shared/constants/permissions.ts`.
- Modify `shared/schemas/api-error.ts`.
- Create `tests/unit/shared/stage01-schemas.spec.ts`.

**Interfaces:**

- Produces `WorkflowNodeState`, `WorkflowInternalPhase`, `WorkflowNodeRuntime`, `WorkflowRuntime`, `GateReport`, `OpportunitySummary`, `OpportunityDetail`, `CreateStage01OpportunityResult`, Contact/Scope/Referrer/Intake types, `Stage01Detail`, and strict command input types.
- Produces the four aggregate-version input contracts used by Tasks 8–13.

```ts
export type ExpectedOpportunityVersion = { expectedOpportunityVersion: number }
export type ExpectedContactVersion = { expectedContactVersion: number }
export type ExpectedExecutionVersion = { expectedExecutionVersion: number }
export type ExpectedCycleVersion = { expectedCycleVersion: number }

export interface CreateStage01OpportunityResult {
  opportunityId: string
  workflowInstanceId: string
  intakeNodeInstanceId: string
  intakeExecutionId: string
  evaluationNodeInstanceId: string
  evaluationExecutionId: string
  decisionCycleId: string
  opportunityVersion: number
  intakeExecutionVersion: number
  evaluationExecutionVersion: number
  decisionCycleVersion: number
}
```

- [ ] **Step 1: Add failing tests for canonical enums and strict version inputs**

```ts
expect(workflowNodeStateSchema.options).toEqual([
  'locked', 'ready', 'active', 'blocked', 'completed', 'not_applicable',
])
expect(workflowInternalPhaseSchema.options).toEqual([
  'not_started', 'active', 'completed', 'not_applicable',
])
expect(stage01FinalOutcomeSchema.options).toEqual(['proceed', 'not_proceeding'])
expect(stage01RecommendationValueSchema.options).toEqual([
  'recommend_proceed', 'recommend_not_proceeding',
])
expect(() => startWorkflowNodeInputSchema.parse({
  expectedExecutionVersion: 1,
  actorId: crypto.randomUUID(),
})).toThrow()
```

- [ ] **Step 2: Add failing tests for reliability and evaluation semantics**

```ts
expect(reliabilityStateSchema.options).toEqual(['unverified', 'confirmed', 'disputed'])
expect(criterionEvaluationRevisionInputSchema.parse({
  expectedCycleVersion: 3,
  applicability: 'not_applicable',
  result: null,
  rationale: 'Tiêu chí không áp dụng trong phạm vi này',
  evidence: [],
})).toMatchObject({ applicability: 'not_applicable', result: null })
expect(() => criterionEvaluationRevisionInputSchema.parse({
  expectedCycleVersion: 3,
  applicability: 'applicable',
  result: null,
  rationale: '',
  evidence: [],
})).toThrow()
```

- [ ] **Step 3: Run the focused test and observe the missing-module failure**

```bash
pnpm exec vitest run tests/unit/shared/stage01-schemas.spec.ts
```

Expected: FAIL because the three Stage 01 schema modules do not exist.

- [ ] **Step 4: Implement strict Zod request and response schemas**

Export these command schemas with `.strict()` object boundaries:

```text
createOpportunityInputSchema
updateOpportunityInputSchema
createContactInputSchema
updateContactInputSchema
addContactMethodInputSchema
updateContactMethodInputSchema
linkOpportunityContactInputSchema
setPrimaryContactInputSchema
endOpportunityContactInputSchema
addOpportunityScopeInputSchema
retireOpportunityScopeInputSchema
addOpportunityReferrerInputSchema
setPrimaryReferrerInputSchema
endOpportunityReferrerInputSchema
appendIntakeRecordInputSchema
correctIntakeRecordInputSchema
raiseDuplicateConcernInputSchema
resolveDuplicateConcernInputSchema
invalidateOpportunityInputSchema
restoreOpportunityInputSchema
assignWorkflowNodeInputSchema
endWorkflowAssignmentInputSchema
raiseWorkflowBlockerInputSchema
resolveWorkflowBlockerInputSchema
startWorkflowNodeInputSchema
completeWorkflowNodeInputSchema
reopenWorkflowNodeInputSchema
revalidateWorkflowNodeInputSchema
criterionEvaluationRevisionInputSchema
submitRecommendationInputSchema
returnForClarificationInputSchema
recordFinalDecisionInputSchema
reactivateStage01InputSchema
```

No request schema accepts `actorId`, `tenantId`, `companyId`, permission codes, authority identity, or persisted version output.

- [ ] **Step 5: Add the exact permission and error catalogs**

Add these permissions:

```text
opportunity.read
opportunity.create
opportunity.update
opportunity.contact.manage
opportunity.scope.manage
opportunity.referrer.manage
opportunity.intake_record.create
opportunity.duplicate.raise
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

Add exactly these Stage 01 error codes; do not add `OPPORTUNITY_VERSION_CONFLICT`:

```text
OPPORTUNITY_NOT_FOUND
OPPORTUNITY_INVALID
STAGE01_DEFINITION_CONFIG_UNAVAILABLE
STAGE01_DEFINITION_CONFIG_INVALID
WORKFLOW_NODE_NOT_READY
WORKFLOW_NODE_NOT_ACTIVE
WORKFLOW_OWNER_REQUIRED
WORKFLOW_NODE_BLOCKED
WORKFLOW_REVALIDATION_REQUIRED
STAGE01_INTAKE_INCOMPLETE
STAGE01_DUPLICATE_UNRESOLVED
STAGE01_EVALUATION_CONFIG_UNAVAILABLE
STAGE01_EVALUATION_INCOMPLETE
STAGE01_RECOMMENDATION_REQUIRED
STAGE01_CLARIFICATION_PENDING
STAGE01_DECISION_AUTHORITY_UNRESOLVED
STAGE01_DECISION_AUTHORITY_MISMATCH
STAGE01_FINAL_DECISION_EXISTS
STAGE01_OVERRIDE_RATIONALE_REQUIRED
STAGE01_REACTIVATION_NOT_ALLOWED
STAGE01_INTAKE_REVALIDATION_REQUIRED
STAGE01_HISTORY_IMMUTABLE
STAGE01_RESOURCE_ALREADY_ENDED
STAGE01_RESOURCE_ALREADY_RETIRED
VERSION_CONFLICT
```

- [ ] **Step 6: Run shared-contract tests and typecheck**

```bash
pnpm exec vitest run tests/unit/shared/stage01-schemas.spec.ts
pnpm typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the shared contracts**

```bash
git add shared/constants/permissions.ts shared/schemas/api-error.ts shared/schemas/workflow.ts shared/schemas/opportunities.ts shared/schemas/stage01.ts tests/unit/shared/stage01-schemas.spec.ts
git commit -m "feat: define stage 01 shared contracts"
```

---

### Task 2: Create the minimal Workflow Core schema

**Files:**

- Modify `package.json`.
- Modify `scripts/run-supabase-dev.mjs`.
- Create `scripts/run-stage01-cloud-dev-concurrency.mjs`.
- Modify `tests/unit/config/supabase-cloud-dev-runner.spec.ts`.
- Create `tests/unit/config/stage01-cloud-dev-concurrency.spec.ts`.
- Create `supabase/migrations/20260829120100_stage01_workflow_core.sql`.
- Create `supabase/tests/database/stage01_schema.test.sql`.

**Interfaces:**

- Produces immutable definition identity, workflow instances, stable node instances, execution generations, events, assignments, and blockers.
- Task 3 consumes `workflow_definition_snapshots.definition`.
- Tasks 8–10 consume all Workflow Core primary keys and `version` columns.

- [ ] **Step 1: Add failing tests for the fixed no-Docker Cloud DEV harness**

Prove the runner accepts only the committed Stage 01 SQL allowlist, verifies the canonical target before spawning, passes each file through `db query --linked --file`, rejects extra arguments and files without `begin`/`rollback`, and always invokes concurrency cleanup after success or failure. Add `db:dev:stage01:test` and `db:dev:stage01:concurrency` only after observing the focused unit tests fail.

- [ ] **Step 2: Implement the fixed harness and keep all operator input closed**

The normal suite runs every existing file in the fixed Stage 01 inventory sequentially. SQL assertion failures must surface as non-zero command failures. The concurrency harness owns its fixed setup, actor, assertion, and cleanup files; no command-line path or SQL argument is accepted.

```bash
pnpm exec vitest run tests/unit/config/supabase-cloud-dev-runner.spec.ts tests/unit/config/stage01-cloud-dev-concurrency.spec.ts
```

Expected: fixed-mode safety tests PASS without contacting Cloud DEV.

- [ ] **Step 3: Add failing PostgreSQL assertions for the seven Workflow Core tables**

```sql
begin;
do $$
begin
  if to_regclass('public.workflow_definition_snapshots') is null then raise exception 'DB-S01-SCHEMA workflow_definition_snapshots missing'; end if;
  if to_regclass('public.workflow_instances') is null then raise exception 'DB-S01-SCHEMA workflow_instances missing'; end if;
  if to_regclass('public.workflow_node_instances') is null then raise exception 'DB-S01-SCHEMA workflow_node_instances missing'; end if;
  if to_regclass('public.workflow_node_executions') is null then raise exception 'DB-S01-SCHEMA workflow_node_executions missing'; end if;
  if to_regclass('public.workflow_node_events') is null then raise exception 'DB-S01-SCHEMA workflow_node_events missing'; end if;
  if to_regclass('public.workflow_node_assignments') is null then raise exception 'DB-S01-SCHEMA workflow_node_assignments missing'; end if;
  if to_regclass('public.workflow_blockers') is null then raise exception 'DB-S01-SCHEMA workflow_blockers missing'; end if;
end $$;
rollback;
```

- [ ] **Step 4: Verify the canonical target and observe the red Cloud DEV schema test**

```bash
pnpm db:dev:target
pnpm db:dev:auth-check
pnpm db:dev:status
pnpm db:dev:stage01:test
```

Expected: the target/auth/status guards PASS and the new missing-table assertion FAILS without leaving fixture rows.

- [ ] **Step 5: Create the Workflow Core migration and approved checks**

Create the migration with `pnpm exec supabase migration new stage01_workflow_core`, then give the generated file the approved timestamped filename above before adding SQL. Do not hand-create an untracked migration-history entry.

Implement the fields from Technical Spec Sections 10.1–10.7. Constrain execution phase exactly:

```sql
check (phase in ('not_started', 'active', 'completed', 'not_applicable'))
```

Add these critical indexes:

```sql
create unique index workflow_definition_snapshots_company_key_version_key
  on public.workflow_definition_snapshots (company_id, workflow_key, template_version);

create unique index workflow_node_executions_one_current
  on public.workflow_node_executions (node_instance_id)
  where superseded_at is null;

create unique index workflow_node_assignments_one_active_owner
  on public.workflow_node_assignments (node_execution_id)
  where assignment_kind = 'accountable_owner' and ended_at is null;
```

Do not create a parent node instance for Stage 01 and do not persist `locked`, `ready`, or `blocked`.

Enable RLS on all seven tables in this migration. Do not add permissive policies or authenticated DML grants.

- [ ] **Step 6: Expand SQL assertions for columns, FKs, checks, uniqueness, and RLS enablement**

Use `information_schema` and `pg_catalog` queries that raise on missing columns, FKs, checks, unique indexes, or `relrowsecurity = false`. Task 6 later adds the approved policies and explicit read grants.

- [ ] **Step 7: Dry-run, push the one reviewed migration, and observe green assertions**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: dry-run lists only `20260829120100_stage01_workflow_core.sql`; push succeeds on canonical Cloud DEV; transaction-wrapped Workflow Core assertions PASS. If the applied migration is wrong, add a new forward corrective migration rather than editing it.

- [ ] **Step 8: Commit the Cloud DEV harness and Workflow Core migration**

```bash
git add package.json scripts/run-supabase-dev.mjs scripts/run-stage01-cloud-dev-concurrency.mjs tests/unit/config/supabase-cloud-dev-runner.spec.ts tests/unit/config/stage01-cloud-dev-concurrency.spec.ts supabase/migrations/20260829120100_stage01_workflow_core.sql supabase/tests/database/stage01_schema.test.sql
git commit -m "feat: add stage 01 workflow core"
```

---

### Task 3: Enforce the published definition contract

**Files:**

- Create `supabase/migrations/20260829120200_stage01_definition_contract.sql`.
- Create `supabase/tests/database/stage01_definition.test.sql`.

**Interfaces:**

- Produces `private.assert_valid_stage01_definition(target_definition jsonb) returns void`.
- Task 8 calls this function after selecting the highest company `template_version` for `workflow_key = 'vqh.stage01'`.

- [ ] **Step 1: Add a failing test fixture for a complete synthetic definition**

The fixture must contain exactly the two authoritative nodes, the dependency, all five dimensions, taxonomy definitions, criterion definitions, N/A allowance, gate semantics, and capability references:

```json
{
  "nodes": [
    {"key":"01.1","type":"sub_stage","parentNodeKey":null},
    {"key":"01.2","type":"sub_stage","parentNodeKey":null}
  ],
  "dependencies": [{"from":"01.1","to":"01.2","requires":"completed_current_valid"}],
  "dimensions": [
    "customer_need",
    "scope_capability",
    "resources_schedule",
    "commercial_viability",
    "risk_special_conditions"
  ],
  "taxonomies": {
    "customer_type":[{"code":"test_customer","label":"Test customer","semanticKey":"customer"}],
    "contact_relationship":[{"code":"test_primary","label":"Test primary","semanticKey":"primary"}],
    "scope":[{"code":"test_scope","label":"Test scope","semanticKey":"scope"}],
    "lead_source":[{"code":"test_direct","label":"Test direct","behavior":{"requiresReferrer":false}}],
    "referrer_type":[{"code":"test_person","label":"Test person","semanticKey":"person"}],
    "engagement_status":[{"code":"test_grounded","label":"Test grounded","semanticKey":"grounded"}],
    "invalid_reason":[{"code":"test_invalid","label":"Test invalid","semanticKey":"invalid"}]
  },
  "criteria": [
    {"key":"test_customer_need","dimensionKey":"customer_need","label":"Test customer need","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
    {"key":"test_scope_capability","dimensionKey":"scope_capability","label":"Test scope capability","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},
    {"key":"test_resources_schedule","dimensionKey":"resources_schedule","label":"Test resources schedule","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
    {"key":"test_commercial_viability","dimensionKey":"commercial_viability","label":"Test commercial viability","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
    {"key":"test_risk_special","dimensionKey":"risk_special_conditions","label":"Test risk special conditions","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
  ],
  "capabilities": {
    "intakeOwner":"journey.assignment.manage",
    "evaluationOwner":"journey.assignment.manage",
    "start":"journey.node.start",
    "complete":"journey.node.complete",
    "decision":"stage01.decision.record"
  },
  "gates": {
    "intake":["approved_minimum","duplicate_resolved","no_blocking_blocker"],
    "evaluation":["required_applicable_evaluated","recommendation_current","final_decision_recorded"]
  }
}
```

The test fixture is deliberately synthetic and must remain inside the rolled-back Cloud DEV assertion transaction.

- [ ] **Step 2: Add failing cases for malformed and incomplete definitions**

Assert rejection for duplicate/missing nodes, missing `01.1 → 01.2`, missing a dimension, unknown criterion criticality, invalid `allowsNotApplicable`, missing capability references, and missing gate sections.

- [ ] **Step 3: Run the definition test and observe the missing-function failure**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: `stage01_definition.test.sql` FAILS because the validator does not exist.

- [ ] **Step 4: Implement the private fail-closed validator**

```sql
create function private.assert_valid_stage01_definition(target_definition jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_definition is null or jsonb_typeof(target_definition) <> 'object' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_typeof(target_definition -> 'nodes') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'dependencies') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'dimensions') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'taxonomies') is distinct from 'object'
     or jsonb_typeof(target_definition -> 'criteria') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'capabilities') is distinct from 'object'
     or jsonb_typeof(target_definition -> 'gates') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_array_length(target_definition -> 'nodes') <> 2
     or not (target_definition -> 'nodes') @> '[{"key":"01.1"},{"key":"01.2"}]'::jsonb
     or not (target_definition -> 'dependencies') @> '[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}]'::jsonb
     or jsonb_array_length(target_definition -> 'dimensions') <> 5
     or not (target_definition -> 'dimensions') @> '["customer_need","scope_capability","resources_schedule","commercial_viability","risk_special_conditions"]'::jsonb
     or not ((target_definition -> 'taxonomies') ?& array['customer_type','contact_relationship','scope','lead_source','referrer_type','engagement_status','invalid_reason'])
     or jsonb_array_length(target_definition -> 'criteria') < 5
     or not ((target_definition -> 'capabilities') ?& array['intakeOwner','evaluationOwner','start','complete','decision'])
     or not ((target_definition -> 'gates') ?& array['intake','evaluation']) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_definition -> 'criteria') as criterion
    where criterion ->> 'key' is null
       or nullif(btrim(criterion ->> 'label'), '') is null
       or nullif(btrim(criterion ->> 'description'), '') is null
       or criterion ->> 'dimensionKey' is null
       or criterion ->> 'dimensionKey' not in ('customer_need','scope_capability','resources_schedule','commercial_viability','risk_special_conditions')
       or criterion ->> 'criticality' is null
       or criterion ->> 'criticality' not in ('required','optional','conditional')
       or criterion ->> 'applicabilityMode' is null
       or criterion ->> 'applicabilityMode' not in ('always','manual')
       or jsonb_typeof(criterion -> 'allowsNotApplicable') is distinct from 'boolean'
       or jsonb_typeof(criterion -> 'displayOrder') is distinct from 'number'
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from (values
      ('customer_need'),
      ('scope_capability'),
      ('resources_schedule'),
      ('commercial_viability'),
      ('risk_special_conditions')
    ) as required_dimension(dimension_key)
    where not exists (
      select 1
      from jsonb_array_elements(target_definition -> 'criteria') as criterion
      where criterion ->> 'dimensionKey' = required_dimension.dimension_key
    )
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from unnest(array['customer_type','contact_relationship','scope','lead_source','referrer_type','engagement_status','invalid_reason']) as taxonomy_key
    where case
      when jsonb_typeof(target_definition #> array['taxonomies', taxonomy_key]) = 'array'
        then jsonb_array_length(target_definition #> array['taxonomies', taxonomy_key]) = 0
      else true
    end
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    where jsonb_typeof(taxonomy.values_json) is distinct from 'array'
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_each_text(target_definition -> 'capabilities') as capability(capability_key, permission_code)
    where nullif(btrim(capability.permission_code), '') is null
  ) or jsonb_typeof(target_definition #> array['gates','intake']) is distinct from 'array'
     or jsonb_typeof(target_definition #> array['gates','evaluation']) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    cross join lateral jsonb_array_elements(taxonomy.values_json) as taxonomy_value
    where nullif(btrim(taxonomy_value ->> 'code'), '') is null
       or nullif(btrim(taxonomy_value ->> 'label'), '') is null
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;
end;
$$;
```

The implementation must raise only `STAGE01_DEFINITION_CONFIG_INVALID` for definition-shape failures and must not substitute default taxonomy, criterion, authority, or hierarchy values.

- [ ] **Step 5: Run definition and schema tests**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: complete synthetic definition PASS; every invalid shape fails closed.

- [ ] **Step 6: Commit the definition contract**

```bash
git add supabase/migrations/20260829120200_stage01_definition_contract.sql supabase/tests/database/stage01_definition.test.sql
git commit -m "feat: validate stage 01 definitions"
```

---

### Task 4: Create the Opportunity and Intake schema

**Files:**

- Create `supabase/migrations/20260829120300_stage01_opportunity_domain.sql`.
- Modify `supabase/tests/database/stage01_schema.test.sql`.

**Interfaces:**

- Produces `opportunities`, `stage01_taxonomy_values`, `contacts`, `contact_methods`, `opportunity_contacts`, `opportunity_scopes`, `opportunity_referrers`, `opportunity_intake_records`, `opportunity_duplicate_concerns`, and `stage01_intake_completion_baselines`.
- Task 8 owns current-data and relationship mutations; Task 9 owns duplicate resolution and baseline creation.

- [ ] **Step 1: Add failing table, column, FK, and uniqueness assertions**

Assert every relation and field in Technical Spec Sections 11–18, including the absence of `opportunities.received_at` and the presence of all owning aggregate `version` columns.

- [ ] **Step 2: Run the guarded Cloud DEV SQL suite and observe the missing Opportunity relations**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: Opportunity-domain assertions FAIL.

- [ ] **Step 3: Create Opportunity, taxonomy, Contact, Scope, Referrer, Intake, and duplicate tables**

Use only approved persisted enums/checks. `reliability_state` permits `unverified`, `confirmed`, or `disputed`; it does not update blocker or validity state. Contact Method usability is represented only by `is_usable` in Phase A.

Enable RLS on every table in this migration without adding permissive policies or authenticated DML grants.

Add the current-primary indexes:

```sql
create unique index opportunity_contacts_one_active_primary
  on public.opportunity_contacts (opportunity_id)
  where is_primary and ended_at is null;

create unique index opportunity_referrers_one_active_primary
  on public.opportunity_referrers (opportunity_id)
  where is_primary and ended_at is null;
```

- [ ] **Step 4: Create append-only Intake and baseline structures**

```sql
create unique index stage01_intake_baselines_execution_version_key
  on public.stage01_intake_completion_baselines (node_execution_id, baseline_version);

create unique index stage01_intake_baselines_completion_event_key
  on public.stage01_intake_completion_baselines (completion_event_id);
```

`completion_event_id` is required. Intake corrections insert a new record with `correction_of_record_id` and `correction_reason`; they never update the original.

- [ ] **Step 5: Run schema tests and review the migration diff**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
git diff --check
```

Expected: Opportunity-domain schema assertions PASS.

- [ ] **Step 6: Commit the Opportunity domain**

```bash
git add supabase/migrations/20260829120300_stage01_opportunity_domain.sql supabase/tests/database/stage01_schema.test.sql
git commit -m "feat: add stage 01 opportunity domain"
```

---

### Task 5: Create Evaluation and Decision Cycle persistence

**Files:**

- Create `supabase/migrations/20260829120400_stage01_evaluation_decision.sql`.
- Modify `supabase/tests/database/stage01_schema.test.sql`.

**Interfaces:**

- Produces `stage01_decision_cycles`, `stage01_criterion_evaluations`, `stage01_recommendations`, and `stage01_clarification_returns`.
- Task 8 creates Cycle #1; Task 10 records evaluations and decision lifecycle.

- [ ] **Step 1: Add failing assertions for cycle identity and append-only version keys**

Assert uniqueness of `(opportunity_id, cycle_no)`, `(node_execution_id)`, `(decision_cycle_id, criterion_key, revision)`, and `(decision_cycle_id, version)`.

- [ ] **Step 2: Add failing assertions for Final Decision all-or-none constraints**

The test matrix must reject:

```text
final_outcome NULL with any decision-bearing field populated
final_outcome populated with blank final_rationale
final_outcome populated without final_recommendation_id
final_decision_by different from decision_authority_user_id
blank override_rationale whenever it is populated
```

- [ ] **Step 3: Run schema tests and observe red Evaluation/Decision assertions**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: Evaluation/Decision relation assertions FAIL.

- [ ] **Step 4: Implement the four tables and structural checks**

Criterion rows enforce:

```sql
check (
  (applicability = 'applicable' and result in ('fit', 'concern', 'not_fit', 'insufficient_information'))
  or (applicability = 'not_applicable' and result is null)
)
```

Recommendation/outcome comparison, meaningful rationale/evidence, N/A permission, same-cycle references, and post-decision immutability are completed by the controlled commands and guards in Tasks 6 and 10.

Enable RLS on all four tables in this migration without adding permissive policies or authenticated DML grants.

- [ ] **Step 5: Run the database suite**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: schema assertions for all four tables PASS.

- [ ] **Step 6: Commit Evaluation and Decision persistence**

```bash
git add supabase/migrations/20260829120400_stage01_evaluation_decision.sql supabase/tests/database/stage01_schema.test.sql
git commit -m "feat: add stage 01 decision persistence"
```

---

### Task 6: Add RLS, exact privileges, and database history guards

**Files:**

- Create `supabase/migrations/20260829120500_stage01_security.sql`.
- Create `supabase/tests/database/stage01_security.test.sql`.
- Create `supabase/tests/database/stage01_history.test.sql`.

**Interfaces:**

- Consumes existing `private.has_company_permission(uuid, uuid, text)`, company membership, and `audit_events`.
- Produces the table/RLS/grant foundation for `DB-S01-SEC-001..004`, append-only/lifecycle guards, baseline-event validation, and Final Decision immutability. Tasks 8–10 extend the suite to complete `DB-S01-SEC-005..007` and command-dependent parts of `DB-S01-HIST-001..005`.

- [ ] **Step 1: Add failing grant and RLS tests for two companies**

Prove:

```text
authenticated Company A member with opportunity.read reads A Opportunity rows
the same actor cannot observe Company B rows
journey.read is required for Workflow Core reads
anon has no Stage 01 table privilege
authenticated has explicit SELECT only on readable tables
direct protected-table INSERT, UPDATE, and DELETE fail
revoked permission is effective on the next statement
```

- [ ] **Step 2: Add failing history-guard tests**

Cover direct and privileged-function attempts to update/delete append-only tables, mutate a decided cycle, use a cross-cycle Recommendation/Clarification reference, insert a malformed evaluation, attach a baseline to the wrong completion event, populate an override for a matching outcome, and omit a meaningful override for a differing outcome.

- [ ] **Step 3: Run the guarded Cloud DEV SQL suite and observe the security/history failures**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: security and history suites FAIL because policies, grants, and guards do not exist.

- [ ] **Step 4: Insert permission catalog entries and map only `company_admin`**

Insert all Task 1 permission codes idempotently using the existing permission-catalog pattern. Extend only the existing complete-catalog `company_admin` behavior; do not add operational role mappings.

- [ ] **Step 5: Reassert RLS and declare read privileges explicitly**

For each readable public table:

```sql
revoke all on table public.opportunities from anon, authenticated;
grant select on table public.opportunities to authenticated;
alter table public.opportunities enable row level security;
```

Create company-scoped read policies using active membership plus `private.has_company_permission(uuid, uuid, text)`. Opportunity aggregate tables use `opportunity.read`; Workflow tables use `journey.read`. No exposed view is required; if implementation introduces one, declare `with (security_invoker = true)`.

- [ ] **Step 6: Install immutable and lifecycle guards**

Guard these append-only tables against `UPDATE` and `DELETE`:

```text
workflow_definition_snapshots
workflow_node_events
opportunity_intake_records
stage01_intake_completion_baselines
stage01_criterion_evaluations
stage01_recommendations
stage01_clarification_returns
```

Guard lifecycle tables so controlled commands can populate only approved end, retire, resolution, or supersession fields. Reject deletion of every Decision Cycle. Guard decided cycles against changes to `final_*`, `override_rationale`, `decision_authority_user_id`, and `authority_resolution_reference`.

On baseline insert, verify the referenced event is `completed`, has the same execution/tenant/company, and carries the baseline ID in its payload. Verify Final Decision and Clarification Recommendation references belong to the same cycle.

- [ ] **Step 7: Run the foundational security and history cases**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: all security/history cases present at this task boundary PASS. Exact command-function privilege, direct-private-invocation, immediate permission-revocation, and Recommendation-currency cases are added with their functions in Tasks 8–10.

- [ ] **Step 8: Commit database security and history enforcement**

```bash
git add supabase/migrations/20260829120500_stage01_security.sql supabase/tests/database/stage01_security.test.sql supabase/tests/database/stage01_history.test.sql
git commit -m "feat: secure stage 01 history"
```

---

### Task 7: Implement pure workflow and gate logic

**Files:**

- Create `server/features/workflow/workflow-state.ts`.
- Create `server/features/workflow/workflow-gates.ts`.
- Create `server/features/stage01/stage01-gates.ts`.
- Create `tests/unit/server/workflow-state.spec.ts`.
- Create `tests/unit/server/stage01-gates.spec.ts`.

**Interfaces:**

```ts
export function deriveWorkflowNodeState(input: {
  phase: 'not_started' | 'active' | 'completed' | 'not_applicable'
  dependenciesSatisfied: boolean
  hasOpenBlockingBlocker: boolean
}): WorkflowNodeState

export function evaluateStage01IntakeGates(input: Stage01IntakeGateInput): GateReport
export function evaluateStage01EvaluationGates(input: Stage01EvaluationGateInput): GateReport
```

- [ ] **Step 1: Write the failing workflow-state truth table**

```ts
expect(deriveWorkflowNodeState({
  phase: 'not_started', dependenciesSatisfied: false, hasOpenBlockingBlocker: false,
})).toBe('locked')
expect(deriveWorkflowNodeState({
  phase: 'not_started', dependenciesSatisfied: true, hasOpenBlockingBlocker: false,
})).toBe('ready')
expect(deriveWorkflowNodeState({
  phase: 'active', dependenciesSatisfied: true, hasOpenBlockingBlocker: true,
})).toBe('blocked')
```

Add cases for active, completed, and not_applicable. `needsRevalidation` remains a separate runtime field.

- [ ] **Step 2: Write failing `01.1` gate tests**

Assert all Section 39 gate codes. Include these negative controls:

```text
budget absent → still eligible
timeline absent → still eligible
files absent → still eligible
Project Manager absent → still eligible
reliability_state disputed → does not create blocker or fail by itself
no Contact Method with is_usable true → CONTACT_METHOD_USABLE missing
requiresReferrer true without active Primary Referrer → REFERRER_PRESENT_IF_REQUIRED missing
```

- [ ] **Step 3: Write failing `01.2` gate tests**

Assert highest criterion revision wins, `insufficient_information` fails a required applicable criterion, `concern` and `not_fit` satisfy evaluation completeness without deciding outcome, a later criterion revision invalidates the earlier Recommendation, and a later Clarification Return requires a newer Recommendation.

- [ ] **Step 4: Run focused tests and observe red imports**

```bash
pnpm exec vitest run tests/unit/server/workflow-state.spec.ts tests/unit/server/stage01-gates.spec.ts
```

Expected: FAIL because the pure functions do not exist.

- [ ] **Step 5: Implement the minimal pure functions**

```ts
export function deriveWorkflowNodeState(input: WorkflowStateInput): WorkflowNodeState {
  if (input.phase === 'completed' || input.phase === 'not_applicable') return input.phase
  if (input.phase === 'active') return input.hasOpenBlockingBlocker ? 'blocked' : 'active'
  return input.dependenciesSatisfied ? 'ready' : 'locked'
}

function report(checks: GateReport['checks']): GateReport {
  return {
    satisfied: checks.every(check => check.status === 'satisfied'),
    checks,
  }
}
```

Build `evaluateStage01IntakeGates` with the ordered Section 39 checks and `evaluateStage01EvaluationGates` from the highest revision per criterion plus Recommendation/clarification timestamps. Return stable `GateReport` objects only; do not mutate persistence, infer BDG values, or calculate an automatic business outcome.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
pnpm exec vitest run tests/unit/server/workflow-state.spec.ts tests/unit/server/stage01-gates.spec.ts
pnpm typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit pure workflow logic**

```bash
git add server/features/workflow/workflow-state.ts server/features/workflow/workflow-gates.ts server/features/stage01/stage01-gates.ts tests/unit/server/workflow-state.spec.ts tests/unit/server/stage01-gates.spec.ts
git commit -m "feat: add stage 01 workflow gates"
```

---

### Task 8: Implement atomic bootstrap and Opportunity-owned commands

**Files:**

- Create `supabase/migrations/20260829120600_stage01_opportunity_commands.sql`.
- Create `supabase/tests/database/stage01_bootstrap.test.sql`.
- Create `supabase/tests/database/stage01_commands.test.sql`.
- Modify `supabase/tests/database/stage01_security.test.sql`.

**Interfaces:**

Every public function is a `SECURITY INVOKER` wrapper with a matching private `SECURITY DEFINER SET search_path = ''` implementation. Each explicit command accepts a strict command JSON object plus server request ID and returns validated JSON.

```sql
private.assert_stage01_command_keys(target_input jsonb, allowed_keys text[]) returns void
```

This helper rejects a non-object input, a missing required key checked by the command, or any key outside that command’s explicit allowlist. It is input validation only; it cannot choose a table, function, or mutation.

```sql
public.create_stage01_opportunity(target_company_id uuid, target_input jsonb, target_request_id uuid)
public.update_opportunity_current_data(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.create_contact(target_company_id uuid, target_input jsonb, target_request_id uuid)
public.update_contact(target_company_id uuid, target_contact_id uuid, target_input jsonb, target_request_id uuid)
public.add_contact_method(target_company_id uuid, target_contact_id uuid, target_input jsonb, target_request_id uuid)
public.update_contact_method(target_company_id uuid, target_contact_id uuid, target_method_id uuid, target_input jsonb, target_request_id uuid)
public.link_opportunity_contact(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.set_opportunity_primary_contact(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.end_opportunity_contact(target_company_id uuid, target_opportunity_id uuid, target_relationship_id uuid, target_input jsonb, target_request_id uuid)
public.add_opportunity_scope(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.retire_opportunity_scope(target_company_id uuid, target_opportunity_id uuid, target_scope_id uuid, target_input jsonb, target_request_id uuid)
public.add_opportunity_referrer(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.set_opportunity_primary_referrer(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.end_opportunity_referrer(target_company_id uuid, target_opportunity_id uuid, target_referrer_id uuid, target_input jsonb, target_request_id uuid)
public.append_opportunity_intake_record(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.correct_opportunity_intake_record(target_company_id uuid, target_opportunity_id uuid, target_record_id uuid, target_input jsonb, target_request_id uuid)
public.raise_opportunity_duplicate_concern(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
```

- [ ] **Step 1: Add red bootstrap tests `DB-S01-BOOT-001..003`**

Assert:

```text
no definition → STAGE01_DEFINITION_CONFIG_UNAVAILABLE + zero aggregate rows
newest definition invalid → STAGE01_DEFINITION_CONFIG_INVALID + no fallback + zero rows
synthetic valid definition → one Opportunity + one Workflow Instance + nodes/executions 01.1/01.2 + Cycle #1
```

The success assertion must also prove no Project, parent Stage runtime, Stage 02 runtime, or Project Manager assignment is created.

- [ ] **Step 2: Run bootstrap tests and observe missing RPC failures**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: bootstrap and Opportunity-command assertions FAIL.

- [ ] **Step 3: Implement the atomic bootstrap transaction**

The private implementation performs this exact sequence in one transaction:

```text
auth.uid + active membership + opportunity.create
select highest company template_version for vqh.stage01
private.assert_valid_stage01_definition
insert Opportunity
insert Workflow Instance bound to selected snapshot
insert exactly node instances/executions 01.1 and 01.2
insert Decision Cycle #1 bound to 01.2 execution #1
insert bootstrap workflow events and audit event
return all IDs and initial versions
```

Any exception rolls back every row.

Call `private.assert_stage01_command_keys` before reading any client value. Derive actor from `auth.uid()` and derive tenant/company membership in the database; never read actor, tenant, company, permission, or authority identity from `target_input`.

- [ ] **Step 4: Implement Contact, Scope, Referrer, Intake, and duplicate-raise commands**

Contact/Method commands lock and increment Contact version. Opportunity relationship/history commands lock and increment Opportunity version. Primary Contact and Primary Referrer replacement ends the prior active primary and inserts the replacement in the same transaction.

Use this lock/version/write order in each owning aggregate:

```sql
select opportunity.version
into current_version
from public.opportunities as opportunity
where opportunity.id = target_opportunity_id
  and opportunity.company_id = target_company_id
for update;

if current_version is distinct from expected_version then
  raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
end if;

update public.opportunities
set version = version + 1, updated_at = statement_timestamp()
where id = target_opportunity_id and company_id = target_company_id;
```

Primary replacement then updates only the old row’s approved end fields, inserts the new primary row, and writes one audit event before returning the new Opportunity version.

- [ ] **Step 5: Apply exact function privileges**

For every public/private signature:

```sql
revoke execute on function public.create_stage01_opportunity(uuid, jsonb, uuid) from public, anon;
grant execute on function public.create_stage01_opportunity(uuid, jsonb, uuid) to authenticated;
revoke execute on function private.create_stage01_opportunity(uuid, jsonb, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.create_stage01_opportunity(uuid, jsonb, uuid) to authenticated;
```

Repeat with each exact signature. The private implementation re-checks actor, membership, company, permission, state, version, and invariants; wrapper-only trust is forbidden.

- [ ] **Step 6: Add concurrency and history tests**

Prove exactly one success for simultaneous Primary Contact replacement, Primary Referrer replacement, stale Opportunity mutation, and stale Contact mutation. Prove correction inserts a new Intake Record and ended/retired resources reject a second terminal command. Invoke a private Task 8 implementation directly as `authenticated` and prove its internal membership/permission/version checks still deny bypass. Revoke `opportunity.create` and prove the next bootstrap attempt fails without stale authorization.

- [ ] **Step 7: Run bootstrap, command, security, and history suites**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
```

Expected: `DB-S01-BOOT-001..003` PASS and every Task 8 command has exact grants and audit evidence.

- [ ] **Step 8: Commit bootstrap and Opportunity commands**

```bash
git add supabase/migrations/20260829120600_stage01_opportunity_commands.sql supabase/tests/database/stage01_bootstrap.test.sql supabase/tests/database/stage01_commands.test.sql supabase/tests/database/stage01_security.test.sql
git commit -m "feat: add atomic stage 01 bootstrap"
```

---

### Task 9: Implement Workflow and `01.1` lifecycle commands

**Files:**

- Create `supabase/migrations/20260829120700_stage01_workflow_commands.sql`.
- Modify `supabase/tests/database/stage01_commands.test.sql`.
- Modify `supabase/tests/database/stage01_history.test.sql`.
- Modify `supabase/tests/database/stage01_security.test.sql`.

**Interfaces:**

```text
resolve_opportunity_duplicate
assign_workflow_node
end_workflow_assignment
raise_workflow_blocker
resolve_workflow_blocker
start_workflow_node
complete_stage01_intake
invalidate_opportunity
restore_opportunity
reopen_workflow_node
revalidate_workflow_node
```

Each function follows the explicit public/private signature and privilege pattern from Task 8.

Parent-scoped signatures carry both the route parent and resource ID so the database can reject mismatched paths:

```sql
public.resolve_opportunity_duplicate(target_company_id uuid, target_opportunity_id uuid, target_concern_id uuid, target_input jsonb, target_request_id uuid)
public.assign_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
public.end_workflow_assignment(target_company_id uuid, target_assignment_id uuid, target_input jsonb, target_request_id uuid)
public.raise_workflow_blocker(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
public.resolve_workflow_blocker(target_company_id uuid, target_blocker_id uuid, target_input jsonb, target_request_id uuid)
public.start_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
public.complete_stage01_intake(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
public.invalidate_opportunity(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.restore_opportunity(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.reopen_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
public.revalidate_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
```

- [ ] **Step 1: Add failing assignment, blocker, Start, validity, reopen, and revalidation tests**

Prove the command-to-permission map, one active accountable owner, blocker-derived state, non-blocking issue behavior, duplicate resolution semantics, invalidation distinct from `not_proceeding`, and dependency propagation.

- [ ] **Step 2: Add failing `DB-S01-COMP-001` completion-order test**

The test must force a baseline insertion failure after the completion-event insert and prove the transaction leaves the execution phase, event table, baseline table, and audit table unchanged.

- [ ] **Step 3: Run command tests and observe missing Workflow RPC failures**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: Task 9 command assertions FAIL.

- [ ] **Step 4: Implement assignments, blockers, duplicates, validity, reopen, and revalidation**

Assignment and blocker commands lock/increment the current Node Execution version. Duplicate/validity commands lock/increment Opportunity version. Reopen preserves prior completion events; revalidation clears only a justified `needs_revalidation` flag.

```text
assign → lock execution → end prior accountable owner → insert assignment → increment execution → event/audit
end assignment → lock execution → populate ended fields once → increment execution → event/audit
raise blocker → lock execution → insert blocker → increment execution → event/audit
resolve blocker → lock execution → populate resolution fields once → increment execution → event/audit
resolve duplicate → lock Opportunity → populate concern resolution → optionally invalidate noncanonical record → audit
invalidate/restore → lock Opportunity → change validity only through approved transition → increment Opportunity → audit
reopen → lock completed execution → phase active → append reopen event → mark descendants for revalidation → audit
revalidate → lock marked execution → verify prerequisites/evidence → clear needs_revalidation → event/audit
```

- [ ] **Step 5: Implement `start_workflow_node` and `complete_stage01_intake`**

`complete_stage01_intake` receives both `expectedOpportunityVersion` and `expectedExecutionVersion` and executes this exact order:

```text
lock Opportunity and current 01.1 execution
verify both versions and every 01.1 gate
phase active → completed; increment execution version
preallocate baseline UUID
insert completion event containing baseline UUID; capture completion_event_id
insert baseline referencing completion_event_id
insert audit referencing both records
commit
```

Do not persist an “01.2 unlocked” flag; readiness is derived from current-valid `01.1` completion.

- [ ] **Step 6: Add concurrency tests**

Prove exactly one valid mutation succeeds for double `01.1` Complete, duplicate-resolution race, simultaneous reassignment, stale execution mutation, and blocker resolution race.

- [ ] **Step 7: Apply exact grants and run all guarded Cloud DEV SQL suites**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
```

Expected: Workflow/`01.1`, security, history, and `DB-S01-COMP-001` PASS.

- [ ] **Step 8: Commit Workflow and Intake lifecycle commands**

```bash
git add supabase/migrations/20260829120700_stage01_workflow_commands.sql supabase/tests/database/stage01_commands.test.sql supabase/tests/database/stage01_history.test.sql supabase/tests/database/stage01_security.test.sql
git commit -m "feat: add stage 01 intake lifecycle"
```

---

### Task 10: Implement Evaluation, Final Decision, and Reactivation commands

**Files:**

- Create `supabase/migrations/20260829120800_stage01_decision_commands.sql`.
- Modify `supabase/tests/database/stage01_commands.test.sql`.
- Modify `supabase/tests/database/stage01_history.test.sql`.
- Modify `supabase/tests/database/stage01_security.test.sql`.

**Interfaces:**

```text
record_stage01_criterion_evaluation
submit_stage01_recommendation
return_stage01_for_clarification
record_stage01_final_decision
complete_stage01_evaluation
reactivate_stage01
```

```sql
public.record_stage01_criterion_evaluation(target_company_id uuid, target_opportunity_id uuid, target_criterion_key text, target_input jsonb, target_request_id uuid)
public.submit_stage01_recommendation(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.return_stage01_for_clarification(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.record_stage01_final_decision(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
public.complete_stage01_evaluation(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
public.reactivate_stage01(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
```

- [ ] **Step 1: Add failing evaluation and Recommendation currency tests**

Prove the highest criterion revision is current, applicable rows require a supported result plus meaningful rationale/evidence, N/A requires definition permission plus meaningful rationale/evidence, a later criterion revision invalidates an older Recommendation, and a later Clarification Return requires a newer Recommendation.

- [ ] **Step 2: Add failing Final Decision and immutability tests**

Prove:

```text
unresolved authority → STAGE01_DECISION_AUTHORITY_UNRESOLVED
actor different from stored authority → STAGE01_DECISION_AUTHORITY_MISMATCH
cross-cycle Recommendation → rejected
override without rationale → STAGE01_OVERRIDE_RATIONALE_REQUIRED
second decision → STAGE01_FINAL_DECISION_EXISTS
later final/authority field mutation → STAGE01_HISTORY_IMMUTABLE
Final Decision leaves 01.2 active
```

Phase A tests may pre-resolve `decision_authority_user_id` and `authority_resolution_reference` only through rolled-back privileged test setup. No runtime authority-population command is introduced.

- [ ] **Step 3: Add failing `01.2` completion and Reactivation tests**

Prove explicit completion gates, retained `not_proceeding` Opportunity, current-valid `01.1` requirement, no newer active cycle, atomic execution `N+1` plus Cycle `N+1`, and Cycle #1 byte-for-byte preservation.

- [ ] **Step 4: Run the command suite and observe missing Decision RPC failures**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: Evaluation/Decision/Reactivation assertions FAIL.

- [ ] **Step 5: Implement criterion, Recommendation, clarification, and Final Decision commands**

Each command locks/increments Decision Cycle version. Final Decision uses only the stored, pre-resolved authority; it never trusts client-supplied authority identity and never auto-completes `01.2`.

```text
criterion revision → lock cycle → validate bound definition/N/A → insert revision N+1 → increment cycle → audit
Recommendation → lock cycle → evaluate current revision set → insert version N+1 → increment cycle → audit
clarification → lock cycle → verify same-cycle current Recommendation → insert return → increment cycle → audit
Final Decision → lock cycle → verify current Recommendation + stored authority + gates → set decision fields once → increment cycle → audit
```

- [ ] **Step 6: Implement explicit `01.2` completion and Reactivation**

Reactivation atomically supersedes the completed `01.2` execution, creates execution `N+1` in `not_started`, creates Cycle `N+1`, stores the reason, and appends audit. It rejects when `01.1` needs revalidation.

```text
complete 01.2 → lock execution/cycle → verify Final Decision and current gates → phase completed → event/audit
reactivate → lock Opportunity/current 01.1/current 01.2/latest cycle
           → verify valid intake + latest outcome not_proceeding + no active newer cycle
           → supersede execution N → create execution N+1 → create Cycle N+1 → event/audit
```

- [ ] **Step 7: Apply exact grants and run all database tests**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
```

Expected: all schema, definition, bootstrap, security, history, and command tests PASS.

- [ ] **Step 8: Commit Evaluation and Decision commands**

```bash
git add supabase/migrations/20260829120800_stage01_decision_commands.sql supabase/tests/database/stage01_commands.test.sql supabase/tests/database/stage01_history.test.sql supabase/tests/database/stage01_security.test.sql
git commit -m "feat: add stage 01 decision lifecycle"
```

---

### Task 11: Build user-scoped server repositories and services

**Files:**

- Create all server module files listed in the File Map.
- Create repository and service unit tests listed in the File Map.
- Modify `tests/unit/server/service-role-boundary.spec.ts`.

**Interfaces:**

```ts
export interface Stage01ServiceContext {
  actorId: string
  tenantId: string
  companyId: string
  permissions: readonly PermissionCode[]
  requestId: string
}

export interface DecisionAuthorityResolver {
  resolve(input: {
    companyId: string
    opportunityId: string
    workflowInstanceId: string
    decisionCycleId: string
  }): Promise<{ userId: string, ruleReference: string } | null>
}
```

Create only the resolver interface. No default person, title, department, creator, owner, or operational rule is implemented in Phase A.

Define server data repositories with company/request scope supplied only by the server context:

```ts
export interface OpportunityDataRepository {
  list(companyId: string): Promise<OpportunitySummary[]>
  getById(companyId: string, opportunityId: string): Promise<OpportunityDetail | null>
  create(companyId: string, input: CreateOpportunityInput, requestId: string): Promise<CreateStage01OpportunityResult>
  update(companyId: string, opportunityId: string, input: UpdateOpportunityInput, requestId: string): Promise<OpportunityDetail>
  createContact(companyId: string, input: CreateContactInput, requestId: string): Promise<Contact>
  updateContact(companyId: string, contactId: string, input: UpdateContactInput, requestId: string): Promise<Contact>
  addContactMethod(companyId: string, contactId: string, input: AddContactMethodInput, requestId: string): Promise<ContactMethod>
  updateContactMethod(companyId: string, contactId: string, methodId: string, input: UpdateContactMethodInput, requestId: string): Promise<ContactMethod>
  linkContact(companyId: string, opportunityId: string, input: LinkOpportunityContactInput, requestId: string): Promise<OpportunityContact>
  setPrimaryContact(companyId: string, opportunityId: string, input: SetPrimaryContactInput, requestId: string): Promise<OpportunityContact>
  endContact(companyId: string, opportunityId: string, relationshipId: string, input: EndOpportunityContactInput, requestId: string): Promise<void>
  addScope(companyId: string, opportunityId: string, input: AddOpportunityScopeInput, requestId: string): Promise<OpportunityScope>
  retireScope(companyId: string, opportunityId: string, scopeId: string, input: RetireOpportunityScopeInput, requestId: string): Promise<void>
  addReferrer(companyId: string, opportunityId: string, input: AddOpportunityReferrerInput, requestId: string): Promise<OpportunityReferrer>
  setPrimaryReferrer(companyId: string, opportunityId: string, input: SetPrimaryReferrerInput, requestId: string): Promise<OpportunityReferrer>
  endReferrer(companyId: string, opportunityId: string, referrerId: string, input: EndOpportunityReferrerInput, requestId: string): Promise<void>
  addIntakeRecord(companyId: string, opportunityId: string, input: AppendIntakeRecordInput, requestId: string): Promise<IntakeRecord>
  correctIntakeRecord(companyId: string, opportunityId: string, recordId: string, input: CorrectIntakeRecordInput, requestId: string): Promise<IntakeRecord>
  raiseDuplicateConcern(companyId: string, opportunityId: string, input: RaiseDuplicateConcernInput, requestId: string): Promise<DuplicateConcern>
  resolveDuplicateConcern(companyId: string, opportunityId: string, concernId: string, input: ResolveDuplicateConcernInput, requestId: string): Promise<void>
  invalidate(companyId: string, opportunityId: string, input: InvalidateOpportunityInput, requestId: string): Promise<void>
  restore(companyId: string, opportunityId: string, input: RestoreOpportunityInput, requestId: string): Promise<void>
}

export interface WorkflowDataRepository {
  getForOpportunity(companyId: string, opportunityId: string): Promise<WorkflowRuntime | null>
  getNodeIdentity(companyId: string, executionId: string): Promise<'01.1' | '01.2' | null>
  startNode(companyId: string, executionId: string, input: StartWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  completeIntake(companyId: string, executionId: string, input: CompleteWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  completeEvaluation(companyId: string, executionId: string, input: CompleteWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  reopenNode(companyId: string, executionId: string, input: ReopenWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  revalidateNode(companyId: string, executionId: string, input: RevalidateWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  assign(companyId: string, executionId: string, input: AssignWorkflowNodeInput, requestId: string): Promise<void>
  endAssignment(companyId: string, assignmentId: string, input: EndWorkflowAssignmentInput, requestId: string): Promise<void>
  raiseBlocker(companyId: string, executionId: string, input: RaiseWorkflowBlockerInput, requestId: string): Promise<void>
  resolveBlocker(companyId: string, blockerId: string, input: ResolveWorkflowBlockerInput, requestId: string): Promise<void>
}

export interface Stage01DataRepository {
  get(companyId: string, opportunityId: string): Promise<Stage01Detail | null>
  evaluateCriterion(companyId: string, opportunityId: string, criterionKey: string, input: CriterionEvaluationRevisionInput, requestId: string): Promise<void>
  submitRecommendation(companyId: string, opportunityId: string, input: SubmitRecommendationInput, requestId: string): Promise<void>
  returnForClarification(companyId: string, opportunityId: string, input: ReturnForClarificationInput, requestId: string): Promise<void>
  recordFinalDecision(companyId: string, opportunityId: string, input: RecordFinalDecisionInput, requestId: string): Promise<void>
  reactivate(companyId: string, opportunityId: string, input: ReactivateStage01Input, requestId: string): Promise<void>
}
```

The service factories expose these exact boundaries:

```ts
export function createOpportunityService(repository: OpportunityDataRepository): {
  list(context: Stage01ServiceContext): Promise<OpportunitySummary[]>
  get(context: Stage01ServiceContext, opportunityId: string): Promise<OpportunityDetail>
  create(context: Stage01ServiceContext, input: CreateOpportunityInput): Promise<CreateStage01OpportunityResult>
  update(context: Stage01ServiceContext, opportunityId: string, input: UpdateOpportunityInput): Promise<OpportunityDetail>
}

export function createWorkflowService(repository: WorkflowDataRepository): {
  getForOpportunity(context: Stage01ServiceContext, opportunityId: string): Promise<WorkflowRuntime>
  startNode(context: Stage01ServiceContext, executionId: string, input: StartWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  completeNode(context: Stage01ServiceContext, executionId: string, input: CompleteWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  reopenNode(context: Stage01ServiceContext, executionId: string, input: ReopenWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  revalidateNode(context: Stage01ServiceContext, executionId: string, input: RevalidateWorkflowNodeInput): Promise<WorkflowNodeRuntime>
}

export function createStage01Service(repository: Stage01DataRepository): {
  get(context: Stage01ServiceContext, opportunityId: string): Promise<Stage01Detail>
  evaluateCriterion(context: Stage01ServiceContext, opportunityId: string, criterionKey: string, input: CriterionEvaluationRevisionInput): Promise<void>
  submitRecommendation(context: Stage01ServiceContext, opportunityId: string, input: SubmitRecommendationInput): Promise<void>
  returnForClarification(context: Stage01ServiceContext, opportunityId: string, input: ReturnForClarificationInput): Promise<void>
  recordFinalDecision(context: Stage01ServiceContext, opportunityId: string, input: RecordFinalDecisionInput): Promise<void>
  reactivate(context: Stage01ServiceContext, opportunityId: string, input: ReactivateStage01Input): Promise<void>
}
```

- [ ] **Step 1: Write failing repository tests for read and RPC boundaries**

Assert company filters on reads, exact RPC names/arguments, strict response parsing, stable database-error mapping, cross-company scoped `404`, and user-scoped `UserSupabaseClient` construction.

- [ ] **Step 2: Write failing service tests for permissions and command dispatch**

Cover every command group in Technical Spec Section 33. Assert the generic `completeNode` service dispatches `01.1` to `complete_stage01_intake` and `01.2` to `complete_stage01_evaluation` after reading bound node identity.

- [ ] **Step 3: Run focused server tests and observe red imports**

```bash
pnpm exec vitest run tests/unit/server/opportunity.repository.spec.ts tests/unit/server/workflow.repository.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/server/opportunity.service.spec.ts tests/unit/server/workflow.service.spec.ts tests/unit/server/stage01.service.spec.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement repository interfaces and user-scoped Supabase adapters**

Expose the Technical Spec Section 42 methods, including `endAssignment`. Reads use explicit table selects/RLS; every mutation calls one explicit RPC. Parse every row/RPC response through Zod before returning it.

```ts
export function createSupabaseStage01Repository(db: UserSupabaseClient): Stage01DataRepository {
  const client = db as unknown as {
    rpc(name: 'record_stage01_final_decision', args: {
      target_company_id: string
      target_opportunity_id: string
      target_input: RecordFinalDecisionInput
      target_request_id: string
    }): Promise<{ data: unknown, error: unknown }>
  }
  return {
    async recordFinalDecision(companyId, opportunityId, input, requestId) {
      const { data, error } = await client.rpc('record_stage01_final_decision', {
        target_company_id: companyId,
        target_opportunity_id: opportunityId,
        target_input: input,
        target_request_id: requestId,
      })
      if (error) throw mapStage01RpcError(error)
      z.object({
        opportunityId: z.string().uuid(),
        decisionCycleId: z.string().uuid(),
        version: z.number().int().nonnegative(),
      }).strict().parse(data)
    },
  }
}
```

Implement every declared repository method as its own explicit table read or RPC call; the returned object contains no arbitrary RPC-name dispatcher.

- [ ] **Step 5: Implement service-level early authorization and state validation**

Services reject missing permission before mutation and map stable error codes/statuses. Database functions remain the final authority and repeat membership, permission, state, version, and invariant checks.

```ts
function requirePermission(context: Stage01ServiceContext, permission: PermissionCode): void {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}
```

Call `requirePermission` with the exact Section 33 permission before each repository mutation.

- [ ] **Step 6: Extend the service-role boundary test**

```ts
expect(stage01RequestPathSources).not.toMatch(/service[_-]?role|createSupabaseAdminClient/u)
```

Scan the new `server/features/{opportunities,workflow,stage01}` modules and all Stage 01 Nitro adapters. Do not classify the fixed Cloud DEV test harness as a normal request path.

- [ ] **Step 7: Run focused tests, typecheck, and lint**

```bash
pnpm exec vitest run tests/unit/server
pnpm typecheck
pnpm lint
```

Expected: all commands PASS.

- [ ] **Step 8: Commit server repositories and services**

```bash
git add server/features/opportunities server/features/workflow server/features/stage01 tests/unit/server/opportunity.repository.spec.ts tests/unit/server/workflow.repository.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/server/opportunity.service.spec.ts tests/unit/server/workflow.service.spec.ts tests/unit/server/stage01.service.spec.ts tests/unit/server/service-role-boundary.spec.ts
git commit -m "feat: add stage 01 server services"
```

---

### Task 12: Add explicit thin Nitro route adapters

**Files:**

Create these route files:

```text
server/api/companies/[companyId]/opportunities/index.get.ts
server/api/companies/[companyId]/opportunities/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId].get.ts
server/api/companies/[companyId]/opportunities/[opportunityId].patch.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01.get.ts
server/api/companies/[companyId]/contacts/index.post.ts
server/api/companies/[companyId]/contacts/[contactId].patch.ts
server/api/companies/[companyId]/contacts/[contactId]/methods/index.post.ts
server/api/companies/[companyId]/contacts/[contactId]/methods/[methodId].patch.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/contacts/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/primary-contact.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/contacts/[opportunityContactId]/end.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/scopes/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/scopes/[scopeId]/retire.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/referrers/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/primary-referrer.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/referrers/[referrerId]/end.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/intake-records/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/intake-records/[recordId]/corrections.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/duplicate-concerns/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/duplicate-concerns/[concernId]/resolve.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/invalidate.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/restore.post.ts
server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/start.post.ts
server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/complete.post.ts
server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/reopen.post.ts
server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/revalidate.post.ts
server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/assignments/index.post.ts
server/api/companies/[companyId]/workflow-assignments/[assignmentId]/end.post.ts
server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/blockers/index.post.ts
server/api/companies/[companyId]/workflow-blockers/[blockerId]/resolve.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/evaluations/[criterionKey]/revisions.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/recommendations/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/clarification-returns/index.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/final-decision.post.ts
server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/reactivate.post.ts
```

Also create the four route-test files listed in the File Map.

**Interfaces:**

Every adapter uses the existing chain:

```text
runApiRoute
→ requireAuthenticatedRequest
→ tenancy.resolveCompanyContext
→ strict route-param/body parsing
→ feature service
```

- [ ] **Step 1: Add failing API file-matrix and route-handler tests**

`stage01-api-files.spec.ts` asserts every listed file exists. Route tests assert malformed UUID/body `400`, missing authentication `401`, missing permission `403`, cross-company/missing resource `404`, state/config/version conflict `409`, and stable error body.

- [ ] **Step 2: Add failing body-boundary tests**

Prove Opportunity `PATCH` rejects nested Contact/Scope/Referrer/Intake/assignment/blocker/decision objects. Prove every mutation rejects client-supplied actor, company, tenant, permission, and authority fields.

- [ ] **Step 3: Run route tests and observe red files/imports**

```bash
pnpm exec vitest run tests/unit/server/opportunity-routes.spec.ts tests/unit/server/workflow-routes.spec.ts tests/unit/server/stage01-routes.spec.ts tests/unit/server/stage01-api-files.spec.ts
```

Expected: FAIL because adapters do not exist.

- [ ] **Step 4: Implement route feature handlers and one-line Nitro adapters**

Use the established adapter shape:

```ts
export default defineEventHandler(event => runApiRoute(event, () => (
  createSupabaseOpportunityRoutes(event).create(event)
)))
```

Business transitions stay in services/database commands. The complete-node adapter calls one service method; the service dispatches by bound node identity.

- [ ] **Step 5: Run `API-S01-001` and `API-S01-002` evidence tests**

```bash
pnpm exec vitest run tests/unit/server/opportunity-routes.spec.ts tests/unit/server/workflow-routes.spec.ts tests/unit/server/stage01-routes.spec.ts tests/unit/server/stage01-api-files.spec.ts tests/unit/server/service-role-boundary.spec.ts
```

Expected: complete route matrix, scope, version forwarding, user-client use, and service-role exclusion PASS.

- [ ] **Step 6: Commit Nitro adapters**

```bash
git add server/api/companies server/features/opportunities/opportunity.routes.ts server/features/workflow/workflow.routes.ts server/features/stage01/stage01.routes.ts tests/unit/server/opportunity-routes.spec.ts tests/unit/server/workflow-routes.spec.ts tests/unit/server/stage01-routes.spec.ts tests/unit/server/stage01-api-files.spec.ts
git commit -m "feat: expose stage 01 api contracts"
```

---

### Task 13: Add frontend domain contracts and HTTP repositories

**Files:**

- Create the six frontend type/repository files listed in the File Map.
- Modify `app/errors/client-error.ts`.
- Modify `app/repositories/contracts.ts`.
- Modify `app/repositories/http/authenticated-http-client.ts`.
- Modify `app/repositories/mock/mock-repositories.ts`.
- Modify `app/plugins/repositories.client.ts`.
- Create the three frontend repository tests listed in the File Map.
- Modify `tests/unit/repositories/mock-repositories.spec.ts`.
- Modify `tests/unit/auth/authenticated-http-client.spec.ts`.
- Modify `tests/unit/auth/client-error.spec.ts`.

**Interfaces:**

```ts
export interface OpportunityRepository {
  list(): Promise<OpportunitySummary[]>
  getById(id: string): Promise<OpportunityDetail | null>
  create(input: CreateOpportunityInput): Promise<CreateStage01OpportunityResult>
  update(id: string, input: UpdateOpportunityInput): Promise<OpportunityDetail>
  createContact(input: CreateContactInput): Promise<Contact>
  updateContact(id: string, input: UpdateContactInput): Promise<Contact>
  addContactMethod(contactId: string, input: AddContactMethodInput): Promise<ContactMethod>
  updateContactMethod(contactId: string, methodId: string, input: UpdateContactMethodInput): Promise<ContactMethod>
  linkContact(opportunityId: string, input: LinkOpportunityContactInput): Promise<OpportunityContact>
  setPrimaryContact(opportunityId: string, input: SetPrimaryContactInput): Promise<OpportunityContact>
  endContactRelationship(opportunityId: string, id: string, input: EndOpportunityContactInput): Promise<void>
  addScope(opportunityId: string, input: AddOpportunityScopeInput): Promise<OpportunityScope>
  retireScope(opportunityId: string, id: string, input: RetireOpportunityScopeInput): Promise<void>
  addReferrer(opportunityId: string, input: AddOpportunityReferrerInput): Promise<OpportunityReferrer>
  setPrimaryReferrer(opportunityId: string, input: SetPrimaryReferrerInput): Promise<OpportunityReferrer>
  endReferrer(opportunityId: string, id: string, input: EndOpportunityReferrerInput): Promise<void>
  addIntakeRecord(opportunityId: string, input: AppendIntakeRecordInput): Promise<IntakeRecord>
  correctIntakeRecord(opportunityId: string, id: string, input: CorrectIntakeRecordInput): Promise<IntakeRecord>
  raiseDuplicateConcern(opportunityId: string, input: RaiseDuplicateConcernInput): Promise<DuplicateConcern>
  resolveDuplicateConcern(opportunityId: string, id: string, input: ResolveDuplicateConcernInput): Promise<void>
  invalidate(opportunityId: string, input: InvalidateOpportunityInput): Promise<void>
  restore(opportunityId: string, input: RestoreOpportunityInput): Promise<void>
}
```

Add the Workflow and Stage01 interfaces from Technical Spec Section 42, including `endAssignment`.

```ts
export interface WorkflowRepository {
  getForOpportunity(opportunityId: string): Promise<WorkflowRuntime>
  startNode(nodeExecutionId: string, input: StartWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  completeNode(nodeExecutionId: string, input: CompleteWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  reopenNode(nodeExecutionId: string, input: ReopenWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  revalidateNode(nodeExecutionId: string, input: RevalidateWorkflowNodeInput): Promise<WorkflowNodeRuntime>
  assign(nodeExecutionId: string, input: AssignWorkflowNodeInput): Promise<void>
  endAssignment(assignmentId: string, input: EndWorkflowAssignmentInput): Promise<void>
  raiseBlocker(nodeExecutionId: string, input: RaiseWorkflowBlockerInput): Promise<void>
  resolveBlocker(blockerId: string, input: ResolveWorkflowBlockerInput): Promise<void>
}

export interface Stage01Repository {
  get(opportunityId: string): Promise<Stage01Detail>
  evaluateCriterion(opportunityId: string, criterionKey: string, input: CriterionEvaluationRevisionInput): Promise<void>
  submitRecommendation(opportunityId: string, input: SubmitRecommendationInput): Promise<void>
  returnForClarification(opportunityId: string, input: ReturnForClarificationInput): Promise<void>
  recordFinalDecision(opportunityId: string, input: RecordFinalDecisionInput): Promise<void>
  reactivate(opportunityId: string, input: ReactivateStage01Input): Promise<void>
}
```

- [ ] **Step 1: Write failing HTTP repository tests**

For every method group, assert HTTP method, company-scoped URL, strict request body, owning aggregate version key, bearer token, Zod response parsing, scoped `404 → null` only for `getById`, and stable error propagation.

Add authenticated-client assertions proving `STAGE01_DEFINITION_CONFIG_UNAVAILABLE`, `STAGE01_HISTORY_IMMUTABLE`, and `VERSION_CONFLICT` survive parsing as the `ClientError.code` value.

- [ ] **Step 2: Run repository tests and observe red modules**

```bash
pnpm exec vitest run tests/unit/repositories/http-*-repository.spec.ts
```

Expected: FAIL because the HTTP repositories do not exist.

- [ ] **Step 3: Implement domain types as shared-contract re-exports**

Re-export shared inferred types instead of redefining enums or command shapes. Do not modify `journey.types.ts`, `ProjectRepository`, or existing Journey components.

- [ ] **Step 4: Implement authenticated HTTP adapters**

Reuse `app/repositories/http/authenticated-http-client.ts`. Each method maps to one Section 38 route; no repository method posts a generic RPC name or nested aggregate payload.

```ts
async function postCommand<T>(url: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  return client.request({
    url,
    method: 'POST',
    schema,
    body: input,
  })
}
```

Each public repository method supplies a fixed URL and schema to this private HTTP helper; callers cannot supply route or RPC names.

Define `ClientErrorCode` as the shared `ApiErrorCode` union plus client-only transport/response codes, and return the parsed API code for non-auth `4xx` responses. Keep the existing authentication, authorization, rate-limit, network, malformed-response, and `5xx` behavior.

- [ ] **Step 5: Register the new repositories without migrating the UI**

Split the existing prototype return contract from the complete registry, then extend `RepositoryRegistry` with `opportunities`, `workflow`, and `stage01`. `createMockRepositories` continues to build only existing prototype repositories; the plugin composes the three HTTP repositories using company context and the authenticated token source. Preserve all existing mock Project/Journey repositories and pages.

```ts
export type PrototypeRepositoryRegistry = Omit<
  RepositoryRegistry,
  'opportunities' | 'workflow' | 'stage01'
>

const supabase = useSupabaseClient<Database>()
const client = createAuthenticatedHttpClient({
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
})
const repositories: RepositoryRegistry = {
  ...createMockRepositories(new BrowserStateStore(), context),
  opportunities: createHttpOpportunityRepository({ companyId: context.companyId, client }),
  workflow: createHttpWorkflowRepository({ companyId: context.companyId, client }),
  stage01: createHttpStage01Repository({ companyId: context.companyId, client }),
}
```

- [ ] **Step 6: Run repository, registry, typecheck, and lint tests**

```bash
pnpm exec vitest run tests/unit/repositories tests/unit/auth/authenticated-http-client.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all commands PASS.

- [ ] **Step 7: Commit frontend repository contracts**

```bash
git add app/features/opportunities app/features/workflow app/features/stage01 app/errors/client-error.ts app/repositories/contracts.ts app/repositories/http/authenticated-http-client.ts app/repositories/http/http-opportunity-repository.ts app/repositories/http/http-workflow-repository.ts app/repositories/http/http-stage01-repository.ts app/repositories/mock/mock-repositories.ts app/plugins/repositories.client.ts tests/unit/auth/authenticated-http-client.spec.ts tests/unit/auth/client-error.spec.ts tests/unit/repositories/mock-repositories.spec.ts tests/unit/repositories/http-opportunity-repository.spec.ts tests/unit/repositories/http-workflow-repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts
git commit -m "feat: add stage 01 http repositories"
```

---

### Task 14: Prove all acceptance flows and regenerate database types

**Files:**

- Create `supabase/tests/database/stage01_flows.test.sql`.
- Regenerate `shared/types/database.types.ts`.

**Interfaces:**

- Produces acceptance evidence `E2E 1–33` by executing the public RPC boundary as authenticated test actors on canonical Cloud DEV.
- Produces fresh generated database types matching all eight migrations.

- [ ] **Step 1: Add the 33 public-RPC business flows**

Group the exact Technical Spec Section 47 flows into transaction-wrapped PostgreSQL assertion blocks that raise on failure:

```text
1–3   definition/bootstrap fail-closed and exact aggregate shape
4–17  01.1 owner, start, intake, relationships, duplicate, baseline, dependency
18–27 evaluation, Recommendation, clarification, Final Decision, explicit completion
28–33 retained outcome, Reactivation, invalidity, revalidation, blocking semantics
```

Name and assert the flows individually:

```text
01 no definition rejects bootstrap and commits nothing
02 invalid newest definition rejects without fallback
03 valid synthetic definition creates the exact aggregate and no excluded runtime
04 01.1 cannot Start without Intake Owner
05 01.1 Start does not require complete intake data
06 Primary Contact replacement preserves prior relationship history
07 Scope retirement and Primary Referrer replacement preserve history
08 Intake correction appends without editing the original
09 missing approved minimum rejects 01.1 Complete
10 budget, timeline, files, and PM may be absent
11 referral-like Lead Source requires Primary Referrer
12 raised duplicate concern rejects 01.1 Complete
13 different-need duplicate resolution permits later completion
14 same-need duplicate resolution preserves both records and history
15 01.1 Complete creates immutable baseline linked to completion event
16 01.2 remains locked before current-valid 01.1 completion
17 01.2 cannot Start without Evaluation Owner
18 required insufficient_information cannot proceed
19 concern or not_fit never auto-decides the outcome
20 Recommendation submission records an immutable version
21 clarification return preserves the cycle and invalidates current Recommendation
22 newer Recommendation restores decision readiness
23 Final Decision may match Recommendation
24 override requires meaningful rationale
25 Final Decision cannot be edited or submitted twice
26 Final Decision does not auto-complete 01.2
27 explicit 01.2 Complete succeeds only after current gates
28 not_proceeding Opportunity remains queryable
29 Reactivation creates Cycle 2 and preserves Cycle 1
30 invalidity remains distinct from not_proceeding
31 reopen/revalidation preserves old completion history
32 open blocking Blocker derives blocked
33 non-blocking issue does not derive blocked
```

Use two companies and only rolled-back synthetic definition/authority fixture setup. Every business mutation in the flow must call a public RPC as `authenticated`; direct privileged writes are restricted to fixture setup.

- [ ] **Step 2: Run the complete guarded Cloud DEV database suite**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:stage01:test
```

Expected: all schema, definition, bootstrap, security, history, command, and flow tests PASS.

- [ ] **Step 3: Generate database types and review only expected changes**

```bash
pnpm db:dev:types
git diff -- shared/types/database.types.ts
```

Expected: generated types contain the new tables and public RPC signatures; they contain no unexpected deletion from existing tenancy/employee contracts.

- [ ] **Step 4: Run application and browser regression verification**

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
```

Expected: Vitest, Nuxt typecheck, ESLint, Nuxt build, and existing Playwright regression all PASS. Playwright proves existing UI remains unaffected; Stage 01 business-flow evidence comes from `stage01_flows.test.sql` because Phase A adds no Stage 01 UI.

- [ ] **Step 5: Run the aggregate no-Docker Cloud DEV backend verifier**

```bash
pnpm verify:dev
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
```

Expected: guarded Cloud DEV migration status/dry-run, rollback-safe Stage 01 SQL assertions, fixed concurrency cleanup, generated types, advisors, unit tests, typecheck, lint, and build PASS without Docker or local Supabase.

- [ ] **Step 6: Commit flow evidence and generated types**

```bash
git add supabase/tests/database/stage01_flows.test.sql shared/types/database.types.ts
git commit -m "test: verify stage 01 phase a flows"
```

---

### Task 15: Audit Phase A boundaries and prepare delivery evidence

**Files:**

- Modify only focused tests or documentation when an audit exposes a task-introduced gap.
- Do not add configuration seeds, UI files, deployment files, or Cloud DEV changes beyond the packet-authorized Stage 01 migrations and verification fixtures.

**Interfaces:**

- Produces the repository-standard Completion Report evidence: `execution_base_sha`, `head_sha`, `remote_head_sha`, acceptance criteria, validation, side effects, risks, and review focus.

- [ ] **Step 1: Prove forbidden Phase B behavior is absent**

```bash
git diff "$EXECUTION_BASE_SHA"..HEAD -- supabase/migrations server/features app/features | rg -n "^\+.*(insert into public\.projects|create.*project|project_manager|stage.?02|parent.*stage.?01)"
git diff "$EXECUTION_BASE_SHA"..HEAD -- server/features/opportunities server/features/workflow server/features/stage01 server/api/companies | rg -n "^\+.*(service[_-]?role|createSupabaseAdminClient)"
```

Expected: no automatic Project, Project Manager, Stage 02, parent Stage 01, or normal-path service-role implementation. Review any textual test description match manually before classifying it.

- [ ] **Step 2: Prove no BDG-controlled production configuration was added**

```bash
git diff --name-only "$EXECUTION_BASE_SHA"..HEAD -- supabase/seed.sql app/config
git diff "$EXECUTION_BASE_SHA"..HEAD -- supabase/seed.sql app/config | rg -n "^\+.*(customer_type|lead_source|decision_authority|risk_special_conditions)"
```

Expected: no task-introduced concrete VQH Stage 01 taxonomy, criterion, authority, or role mapping. The executor must set `EXECUTION_BASE_SHA` to the immutable SHA recorded by successful preflight, never to a guessed value.

- [ ] **Step 3: Re-run fresh full verification**

```bash
pnpm verify:dev
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
pnpm test:e2e
git diff --check
git status --short
```

Expected: all commands PASS; tracked changes are exactly the approved implementation files.

- [ ] **Step 4: Record immutable delivery SHAs**

```bash
git rev-parse HEAD
git log --oneline "$EXECUTION_BASE_SHA"..HEAD
```

Record `execution_base_sha` from preflight and `head_sha` from the fresh command output. Do not claim a CI result unless an actual run is observed.

- [ ] **Step 5: Push only when the approved Implementation Packet requires delivery**

```bash
git push -u origin feat/vqh-stage-01-foundation
git ls-remote --heads origin feat/vqh-stage-01-foundation
```

Require `remote_head_sha == head_sha`. Do not create a PR, merge, or force-push.

---

## Spec-to-task coverage

| Technical contract | Plan tasks | Primary evidence |
| --- | --- | --- |
| Shared types, permissions, errors | 1 | shared schema tests |
| Workflow Core and definition binding | 2–3 | schema + definition tests |
| Opportunity, Contact, Scope, Referrer, Intake, baseline | 4, 8–9 | bootstrap/command/history tests |
| Evaluation and immutable Decision Cycles | 5, 10 | history/command tests |
| RLS, grants, wrapper/private-function privileges | 6, 8–10 | `DB-S01-SEC-001..007` |
| Derived state and gate semantics | 7, 9–10 | unit + command tests |
| Atomic fail-closed bootstrap and Cycle #1 | 8 | `DB-S01-BOOT-001..003` |
| Completion-event-before-baseline ordering | 9 | `DB-S01-COMP-001` |
| Final Decision immutability and same-cycle references | 6, 10 | `DB-S01-HIST-002..005` |
| Explicit HTTP and repository contracts | 11–13 | `API-S01-001..002` |
| Acceptance flows 1–33 and generated types | 14 | `stage01_flows.test.sql` + verification |
| Phase A boundary and remote delivery evidence | 15 | boundary scan + Completion Report |

The business-decision traceability in Technical Spec Section 52 uses these same task numbers and evidence IDs.

---

## Plan acceptance boundary

```text
[x] 15 task boundaries match Technical Spec Section 52
[x] Every behavior task has explicit files, interfaces, red/green validation, and a focused commit; the final audit has fresh verification
[x] All controlled RPCs and HTTP routes have an owning task
[x] Security, history, concurrency, and acceptance evidence are named
[x] Phase A and all four BDG boundaries are preserved
[x] No worktree or subagent execution is planned
[x] Canonical Cloud DEV is the only Stage 01 database target; Docker/local Supabase are excluded
[x] Corrected written Execution Plan reviewed and approved
```

Written-plan approval authorizes preparation of a new Implementation Packet only. It does not authorize implementation or Cloud DEV mutation by itself; the packet must scope those operations explicitly. Production mutation, deployment, merge, and force-push remain unauthorized.

---

## Business Gate Checkpoint

Phase A MUST stop after Task 15. It is a verified runtime foundation, not an operational production Stage 01 release.

Before a separately approved Phase B:

- `BDG-TAX-01` must approve actual VQH taxonomy values.
- `BDG-EVAL-01` must approve individual criteria, criticality, applicability, N/A allowance, and risk taxonomy.
- `BDG-AUTH-01` must approve owner/authority resolution, clarification/completion policy, and operational role mappings.
- `BDG-HIER-01` is required before any canonical parent Stage 01 runtime is introduced.

Phase B requires a separate approved Technical Spec/Execution Plan or controlled amendment for configuration publication, concrete authority resolution, operational role mappings, UI interaction design, and production enablement. The Phase A Cloud DEV schema/test rollout does not authorize any of those operational behaviors.

---

## Execution authorization boundary

Approval of this corrected plan authorizes creation of a new Implementation Packet; it does not authorize implementation by itself.

The packet must:

- reference this approved Technical Spec and Execution Plan;
- identify a fetched remote base ref containing both corrected documents;
- record concrete `analysis_base_sha`, `remote_base_sha`, and `execution_base_sha` values at packet/preflight time;
- authorize branch `feat/vqh-stage-01-foundation` without creating a worktree;
- set `local_db_destructive: false`; Docker and local Supabase are not prerequisites;
- set `cloud_dev_mutating: true` only for the eight reviewed forward migrations, rollback-safe fixed SQL suites, deterministic concurrency fixtures with mandatory cleanup, linked type generation, and advisors on the canonical Taskovia Cloud DEV project;
- set `production_mutating: false`;
- set delivery to `push: true`, `create_pr: false`, `merge: false`, `force_push: false`;
- require technical preflight to return `READY` or `READY_WITH_NON_MATERIAL_DRIFT` before implementation;
- require stop-and-report on `PACKET_STALE` or `BLOCKED`.

The implementation Completion Report must include `execution_base_sha`, `head_sha`, `remote_head_sha`, acceptance-criteria evidence, validation results, side effects, risks, and review focus.
