# Codex Implementation Packet — VQH Stage 01 Phase A Foundation

> **Packet status:** APPROVED
> **Implementation authorization:** AUTHORIZED AFTER `READY` OR `READY_WITH_NON_MATERIAL_DRIFT` PREFLIGHT
> **Scope:** Phase A foundation only
> **Created:** 2026-08-30
> **Execution source:** `Sonos18/company-operations-platform@303a8b01ea935c1042387e7d1b01e2d8826a0828`

```yaml
task:
  id: VQH-STAGE01-FOUNDATION-A
  name: VQH Stage 01 Workflow and Opportunity Foundation
  class: architectural

repository:
  remote: Sonos18/company-operations-platform
  base_ref: codex/vqh-stage-01-spec-plan-corrections
  analysis_base_sha: f314ed7a4ff1d86e45cc29075ab0213ec6421ca1
  remote_base_sha: 303a8b01ea935c1042387e7d1b01e2d8826a0828
  execution_base_sha: 303a8b01ea935c1042387e7d1b01e2d8826a0828

approval:
  status: APPROVED
  approved_by: Son
  approval_reference: >-
    Technical Spec approved by Son on 2026-08-29, corrected Execution Plan approved by Son on
    2026-08-30, and this corrected Implementation Packet explicitly approved by Son in chat on
    2026-08-30.
  approved_scope_version: 2026-08-30-stage01-foundation-a-corrected

goal: >-
  Implement and locally verify the reusable Workflow Core and VQH Stage 01
  Opportunity/Intake/Evaluation runtime foundation while failing closed until a complete company
  definition exists and leaving BDG-TAX-01, BDG-EVAL-01, BDG-AUTH-01, and BDG-HIER-01 unresolved.

current_state_summary: >-
  Project Journey business data remains prototype-backed and ProjectRepository remains separate
  from the new Opportunity aggregate. The repository already provides Supabase tenancy,
  normalized company RBAC, private.has_company_permission, audit events, authenticated Nitro
  routes, Zod boundaries, user-scoped Supabase clients, pgTAP, Vitest, Playwright, and HTTP
  repository patterns. The corrected Technical Spec and 15-task Execution Plan are approved and
  present at execution_base_sha. The documentation-only range after analysis_base_sha does not
  modify application code, migrations, dependencies, lockfiles, validation scripts, or generated
  database types.

approved_decisions:
  - Use a minimal reusable Workflow Core plus Stage 01-specific Opportunity, Intake, Evaluation, and Decision domains.
  - Opportunity is the Stage 01 aggregate root and must never be represented by or automatically converted into Project.
  - Bootstrap is one fail-closed transaction that creates exactly one Opportunity, one Workflow Instance, node instances/executions 01.1 and 01.2, Decision Cycle 1 bound to 01.2 execution 1, events, and audit records.
  - Bootstrap returns STAGE01_DEFINITION_CONFIG_UNAVAILABLE when no published definition exists and commits no aggregate rows.
  - Bootstrap selects the newest company vqh.stage01 definition; an invalid newest row returns STAGE01_DEFINITION_CONFIG_INVALID without falling back to an older version.
  - Synthetic complete definitions are allowed only as rolled-back local automated-test fixtures.
  - Phase A has authoritative runtime nodes 01.1 and 01.2 only; it creates no canonical parent Stage 01 runtime.
  - Persist only not_started, active, completed, and not_applicable phases; derive locked, ready, and blocked from dependencies, gates, and open blocking Blockers.
  - blocked is never a manually persisted or toggled state, and reliability_state is metadata rather than a gate or Blocker.
  - Preserve historical node executions, assignments, blockers, Intake Records, baselines, criterion revisions, Recommendations, clarification returns, Final Decisions, and Decision Cycles.
  - Complete 01.1 inserts its completion event before inserting the immutable baseline that references that event; any failure rolls back the complete transaction.
  - Reactivation creates a new 01.2 execution generation and Decision Cycle without changing Cycle 1 or prior execution history.
  - Criterion applicability is separate from criterion result; insufficient_information does not satisfy a required evaluation and no result auto-decides the outcome.
  - Final Decision is stored on the Decision Cycle, is database-immutable, is unique per cycle, and remains separate from explicit 01.2 completion.
  - Every Stage 01 business mutation uses an explicit controlled PostgreSQL RPC and an explicit HTTP resource or command contract; no generic RPC proxy or aggregate mega-PATCH is allowed.
  - Nitro performs early authentication, authorization, validation, and mapping; PostgreSQL remains the final transaction and authorization authority.
  - Public SECURITY INVOKER wrappers call private SECURITY DEFINER implementations with SET search_path = '' and schema-qualified references.
  - Public wrappers and directly callable private implementations both re-check actor, active membership, company scope, permission, state, expected aggregate version, and invariants.
  - Use row locks plus VERSION_CONFLICT against the owning Opportunity, Contact, Node Execution, or Decision Cycle version.
  - RLS, relation privileges, schema usage, and exact function-signature grants are explicit and deny by default.
  - company_admin may receive the complete explicit permission catalog; operational role mappings and concrete authority resolution remain unimplemented.
  - Existing prototype Journey UI and mock Project data may coexist unchanged; they are not production Stage 01 domain authority.
  - Phase A is a verified runtime foundation and remains non-operational until the required BDGs are approved and a complete production company definition is published separately.

forbidden_changes:
  - Do not resolve, infer, or encode BDG-TAX-01, BDG-EVAL-01, BDG-AUTH-01, or BDG-HIER-01.
  - Do not seed concrete VQH taxonomy values, evaluation criteria, risk taxonomy, authority rules, owner defaults, Completer rules, or operational role mappings.
  - Do not add a concrete DecisionAuthorityResolver implementation; keep the approved interface-only boundary.
  - Do not create a Project, assign a Project Manager, start Stage 02, or create canonical parent Stage 01 runtime.
  - Do not redesign or migrate the Stage 01 or Project Journey UI.
  - Do not persist locked, ready, or blocked and do not add a manual mark-blocked mutation.
  - Do not use reliability_state as an eligibility gate or automatic blocker.
  - Do not add OPPORTUNITY_VERSION_CONFLICT; use the approved VERSION_CONFLICT contract.
  - Do not add a generic RPC-name proxy, nested aggregate mega-PATCH, or service_role-backed normal request path.
  - Do not grant authenticated unrestricted INSERT, UPDATE, or DELETE on protected Stage 01 relations.
  - Do not trust user_metadata, client role claims, or wrapper-only authorization.
  - Do not edit existing migrations or hand-edit shared/types/database.types.ts.
  - Do not add a production dependency.
  - Do not create a worktree or dispatch implementation to subagents; execute inline as selected by Son.
  - Do not mutate Supabase Cloud DEV, mutate production, deploy, create a PR, merge, or force-push.

scope:
  in:
    - Shared strict Zod contracts for Workflow, Opportunity, Stage 01 inputs/outputs, 24 permission codes, and stable API errors.
    - Eight forward-only migrations 20260829120100 through 20260829120800 exactly as decomposed by the approved Execution Plan.
    - Minimal Workflow Core, immutable definition snapshots, Opportunity/Intake, Evaluation, Decision Cycle, RLS/security, and explicit command persistence.
    - Atomic fail-closed Opportunity bootstrap and all 34 explicit controlled mutation functions in Execution Plan Tasks 8 through 10.
    - Pure effective-state, dependency, 01.1 gate, 01.2 gate, clarification, Recommendation, reactivation, and revalidation logic.
    - Exact permission checks, RLS policies, grants/revokes, history guards, optimistic concurrency, audit, and cross-company isolation.
    - User-scoped server data repositories/services and the exact 36 Nitro routes in Technical Spec Section 38 and Execution Plan Task 12.
    - Frontend Opportunity, Workflow, and Stage01 contracts plus authenticated HTTP repositories and additive repository-registry wiring.
    - Client error preservation for stable Stage 01 4xx codes without weakening existing auth, rate-limit, network, malformed-response, or 5xx behavior.
    - pgTAP, Vitest, API-contract, security, concurrency, history, and all 33 public-RPC acceptance flows.
    - Local database type generation, full local verification, boundary audit, commit, push of feat/vqh-stage-01-foundation, and Completion Report.
  out:
    - Any production VQH definition/configuration publication or configuration authoring UI/API.
    - Concrete taxonomy values, evaluation definitions, risk catalogs, authority resolution, owner defaults, or operational role mappings.
    - Parent Stage 01 runtime semantics, Stage 02 behavior, automatic Project creation, or Project Manager assignment.
    - Stage 01 Vue pages, workspace redesign, or migration of existing Journey UI/mock domain.
    - Supabase Cloud DEV rollout, production rollout, deployment, PR creation, merge, or force-push.
  allowed_refactors:
    - Small focused extraction needed to reuse existing auth, tenancy, authorization, API-error, or repository patterns.
    - Type-only/additive registry changes needed to expose Stage 01 repositories while preserving existing PrototypeRepositoryRegistry behavior.
    - Test helper extraction local to Stage 01 tests when it removes duplication without changing unrelated behavior.
    - Narrow client-error mapping changes required to preserve approved stable Stage 01 response codes.

source_anchors:
  paths_or_symbols:
    - AGENTS.md
    - docs/ai-workflow/README.md
    - docs/ai-workflow/templates/completion-report.md
    - docs/vqh/project-journey/README.md
    - docs/vqh/project-journey/stages/01-opportunity-intake.md
    - docs/superpowers/specs/2026-08-29-vqh-stage-01-technical-design.md
    - docs/superpowers/plans/2026-08-29-vqh-stage-01-foundation.md
    - docs/superpowers/specs/2026-08-14-backend-architecture-design.md
    - docs/superpowers/specs/2026-08-18-employee-management-rbac-design.md
    - shared/constants/permissions.ts
    - shared/schemas/api-error.ts
    - shared/types/database.types.ts
    - server/features/authorization/authorization.service.ts
    - server/features/tenancy/tenancy.service.ts
    - server/features/employees/employee.routes.ts
    - server/utils/api-error.ts
    - server/utils/auth-context.ts
    - server/utils/supabase-client.ts
    - app/errors/client-error.ts
    - app/repositories/contracts.ts
    - app/repositories/create-mock-repositories.ts
    - app/repositories/http/authenticated-http-client.ts
    - app/features/journey/journey.types.ts
    - app/features/projects/project.types.ts
    - supabase/migrations/20260814000100_create_tenancy_foundation.sql
    - supabase/migrations/20260818033418_employee_management_rbac.sql
    - supabase/tests/database/employee_rbac_schema.test.sql
    - supabase/tests/database/employee_rbac_rls.test.sql
    - package.json
    - pnpm-lock.yaml
  assumptions:
    - origin/codex/vqh-stage-01-spec-plan-corrections contains execution_base_sha and both approved documents.
    - analysis_base_sha is the application-source commit analyzed for the design; f314ed7a..303a8b01 is documentation-only.
    - Existing normalized RBAC and private.has_company_permission remain the canonical company authorization mechanism.
    - Existing authenticated company-context and user-scoped Supabase patterns remain valid for Stage 01 routes.
    - Existing prototype Project Journey behavior remains unchanged while the additive Stage 01 backend foundation is introduced.
    - package.json continues to provide every required validation command listed below at technical preflight.

contracts:
  api: >-
    Implement the exact company-scoped resource/command matrix in Technical Spec Section 38 and
    Execution Plan Task 12. Route handlers must authenticate, validate route IDs/body/response with
    strict schemas, scope cross-company resources as 404, call fixed service methods, and use a
    user-scoped Supabase client. Generic complete dispatches only by bound node identity: 01.1 to
    complete_stage01_intake and 01.2 to complete_stage01_evaluation. Preserve all stable Stage 01
    4xx error codes and VERSION_CONFLICT; no generic mutation endpoint or client-selected RPC name.
  data: >-
    Implement the exact relations, columns, checks, foreign keys, partial unique constraints,
    immutable history, versions, definition validation/publication semantics, bootstrap aggregate,
    Decision Cycle binding, and migration filenames in the approved Spec and Plan. All new tables
    enable RLS in their creation migration. Complete 01.1 writes its completion event before its
    baseline. Do not add received_at, Project linkage, parent Stage runtime, or Stage 02 data.
  auth_permission_security: >-
    Add exactly the 24 permissions in Technical Spec Section 33 to shared constants and
    public.permissions. Every command applies its exact permission mapping and repeats actor,
    active-membership, company, state, version, and invariant checks inside the private database
    implementation. Use public SECURITY INVOKER wrappers and private SECURITY DEFINER SET
    search_path = '' functions with schema-qualified objects. Revoke exact signatures from PUBLIC
    and anon; grant only authenticated signatures required by the contract. Grant explicit SELECT
    and enforce company RLS separately; deny direct protected mutations and service_role request paths.
  migration_rollout: >-
    Add only the eight new forward-only migration files specified by Execution Plan Tasks 2 through
    10. Local reset/pgTAP/type generation is authorized. No production definition publication,
    Supabase Cloud DEV push, production database mutation, deployment, or production rollout is authorized.

acceptance_criteria:
  - id: AC-S01-01
    requirement: Shared schemas expose exactly the approved state, phase, outcome, criterion, Recommendation, input/output, permission, and stable error contracts without inventing BDG-owned enums.
    evidence_expected: Focused schema Vitest tests pass; 24 permissions and the approved Stage 01 errors are present; OPPORTUNITY_VERSION_CONFLICT is absent.
  - id: AC-S01-02
    requirement: Workflow Core and definition migrations implement immutable snapshots, instances, exactly the required node runtime primitives, definition validation, RLS enablement, checks, foreign keys, and partial uniqueness.
    evidence_expected: stage01_schema.test.sql and stage01_definition.test.sql pass against a clean local reset.
  - id: AC-S01-03
    requirement: Bootstrap fails closed with no definition or an invalid newest definition and never falls back or commits partial aggregate rows.
    evidence_expected: DB-S01-BOOT-001 and DB-S01-BOOT-002 pass with STAGE01_DEFINITION_CONFIG_UNAVAILABLE and STAGE01_DEFINITION_CONFIG_INVALID respectively.
  - id: AC-S01-04
    requirement: A synthetic valid test definition atomically creates exactly one Opportunity, one Workflow Instance, node instances/executions 01.1 and 01.2, and Decision Cycle 1 bound to 01.2 execution 1, with events/audit and no forbidden downstream entities.
    evidence_expected: DB-S01-BOOT-003 and E2E flow 3 pass; no Project, Project Manager assignment, parent Stage runtime, or Stage 02 row exists.
  - id: AC-S01-05
    requirement: Opportunity, Contact, Contact Method, relationship, Scope, Referrer, Intake Record, duplicate-concern, and 01.1 baseline persistence preserves append-only/history semantics and correct aggregate ownership.
    evidence_expected: Schema, command, DB-S01-HIST-001/004, and E2E flows 6 through 15 pass.
  - id: AC-S01-06
    requirement: Decision Cycle, criterion revision, Recommendation version, clarification return, authority fields, and Final Decision persistence enforce same-cycle references, applicability/result constraints, currency, uniqueness, and immutable Final Decision history.
    evidence_expected: DB-S01-HIST-002 through DB-S01-HIST-005 and E2E flows 18 through 29 pass.
  - id: AC-S01-07
    requirement: All Stage 01 relations/functions are deny-by-default with exact grants, company-scoped RLS, protected-table mutation denial, secure direct private invocation, and immediate permission revocation behavior.
    evidence_expected: DB-S01-SEC-001 through DB-S01-SEC-007 pass for at least two companies and anon/authenticated actors.
  - id: AC-S01-08
    requirement: Effective state and gate logic derives locked, ready, and blocked correctly; only open blocking Blockers produce blocked and reliability_state never changes readiness by itself.
    evidence_expected: workflow-state and stage01-gates truth-table unit tests pass; E2E flows 32 and 33 pass; no mark-blocked command exists.
  - id: AC-S01-09
    requirement: Every mutation uses its explicit RPC, locks the owning aggregate, checks the approved expected version, returns VERSION_CONFLICT on staleness, writes audit evidence, and permits exactly one winner in races.
    evidence_expected: Command/concurrency tests cover stale Opportunity, Contact, Node Execution, and Decision Cycle versions plus all races listed in Technical Spec Section 47.
  - id: AC-S01-10
    requirement: 01.1 Start requires readiness, active Intake Owner, permission, and valid Opportunity but does not require completion data; Complete rechecks all gates atomically.
    evidence_expected: E2E flows 4 through 15 and focused command tests pass.
  - id: AC-S01-11
    requirement: Complete 01.1 inserts the completion event first, then the immutable baseline referencing that event, and rolls back phase/event/baseline/audit changes when baseline insertion fails.
    evidence_expected: DB-S01-COMP-001 passes including forced-failure rollback evidence.
  - id: AC-S01-12
    requirement: 01.2 evaluation, Recommendation, clarification, Final Decision, and explicit completion preserve approved sequencing, authority interface boundary, override rationale, and no automatic decision or completion.
    evidence_expected: E2E flows 16 through 27 and focused unit/database command tests pass.
  - id: AC-S01-13
    requirement: Reactivation is allowed only from approved not_proceeding conditions and atomically creates execution/cycle N+1 without modifying Cycle 1 or earlier history.
    evidence_expected: E2E flow 29, history tests, and double-reactivation concurrency test pass byte-for-byte history comparison.
  - id: AC-S01-14
    requirement: Reopen and revalidation preserve earlier completion history and create no hidden parent-state propagation.
    evidence_expected: E2E flow 31 and history/command tests pass.
  - id: AC-S01-15
    requirement: Server repositories/services use user-scoped clients, explicit reads/RPCs, stable error mapping, company scope, and final database authority for every command group.
    evidence_expected: Focused server repository/service tests pass and review finds no arbitrary RPC dispatcher or service_role construction.
  - id: AC-S01-16
    requirement: All 36 Nitro route files implement the exact explicit HTTP matrix with thin authenticated adapters, strict validation, fixed command mapping, expected aggregate versions, and cross-company scoped 404 behavior.
    evidence_expected: API-S01-001 and API-S01-002 pass, including route-file inventory and service-role boundary tests.
  - id: AC-S01-17
    requirement: Frontend Opportunity, Workflow, and Stage01 contracts/repositories are additive, preserve stable Stage 01 errors, and do not replace ProjectRepository or migrate existing Journey UI behavior.
    evidence_expected: Frontend repository/client-error tests pass and final diff contains no new Stage 01 Vue page/workspace or Project Journey reinterpretation.
  - id: AC-S01-18
    requirement: All 33 required public-RPC acceptance flows pass from a clean local database with synthetic definitions confined to rolled-back test fixtures.
    evidence_expected: stage01_flows.test.sql reports E2E 1 through 33 passing after pnpm db:local:reset and pnpm db:local:test.
  - id: AC-S01-19
    requirement: Generated database types match the eight migrations and the full application/backend verification suite succeeds on the final implementation tree.
    evidence_expected: Fresh pnpm db:local:types diff is reviewed; pnpm verify:backend:local, pnpm test:e2e, and git diff --check pass.
  - id: AC-S01-20
    requirement: Final scope audit proves Phase A contains no BDG resolution, production definition, Project/PM/Stage 02/parent-runtime behavior, UI migration, Cloud DEV mutation, or production mutation/deployment.
    evidence_expected: Task 15 boundary scan and Completion Report enumerate zero forbidden side effects and document all residual risks.
  - id: AC-S01-21
    requirement: The implementation is committed and pushed only to feat/vqh-stage-01-foundation, with the remotely queried head equal to local head and no PR, merge, or force-push.
    evidence_expected: Completion Report records execution_base_sha, head_sha, remote_head_sha, and git ls-remote proves remote_head_sha equals head_sha.

validation:
  required:
    - pnpm exec vitest run tests/unit/shared/stage01-schemas.spec.ts
    - pnpm exec vitest run tests/unit/server/workflow-state.spec.ts tests/unit/server/stage01-gates.spec.ts
    - pnpm exec vitest run tests/unit/server
    - pnpm exec vitest run tests/unit/repositories tests/unit/auth/authenticated-http-client.spec.ts
    - pnpm db:local:reset
    - pnpm db:local:test
    - pnpm db:local:types
    - pnpm test:unit
    - pnpm typecheck
    - pnpm lint
    - pnpm build
    - pnpm test:e2e
    - pnpm verify:backend:local
    - git diff --check
    - git status --short
    - git fetch origin codex/vqh-stage-01-spec-plan-corrections
    - git ls-remote --heads origin feat/vqh-stage-01-foundation
  optional: []
  side_effect_authorization:
    workspace_mutating: true
    local_db_destructive: true
    cloud_dev_mutating: false
    production_mutating: false

required_capabilities:
  - PostgreSQL schema, RLS, functions, grants, transactions, row locking, concurrency, and pgTAP implementation.
  - Strict TypeScript and Zod contract implementation across shared, Nitro server, and frontend repository boundaries.
  - Security review of tenant isolation, permissions, RPC wrappers/private implementations, history immutability, and service-role absence.
  - TDD, exact plan-task execution, fresh verification, Git delivery verification, and repository-standard Completion Report.

preferred_tools: []

runtime_mandated_workflows:
  - Start with the mandatory AGENTS.md technical preflight and publish one of READY, READY_WITH_NON_MATERIAL_DRIFT, PACKET_STALE, or BLOCKED.
  - Do not modify implementation files unless preflight is READY or READY_WITH_NON_MATERIAL_DRIFT.
  - Use superpowers:executing-plans inline and execute the approved 15-task plan task-by-task without subagent dispatch.
  - Use superpowers:test-driven-development for every behavior change and record the observed red/green evidence.
  - Use the required Supabase workflow for database, Auth, RLS, function, and generated-type work.
  - Use superpowers:systematic-debugging before changing code in response to any unexpected failure.
  - Use superpowers:verification-before-completion before completion claims, commit/push delivery, and Completion Report.
  - Preserve task-focused commits and perform a final full-diff self-review against execution_base_sha.

delivery:
  branch_name: feat/vqh-stage-01-foundation
  push: true
  create_pr: false
  merge: false
  force_push: false
  create_worktree: false

task_specific_stop_conditions:
  - Return PACKET_STALE if fetched execution_base_sha is unavailable or the remote base no longer contains both approved corrected documents.
  - Return PACKET_STALE if source anchors, API/data contracts, schema/migration order, auth/RBAC/RLS, dependency or lockfile assumptions, validation commands, applicable AGENTS.md instructions, generated types, or acceptance criteria have materially drifted.
  - Return BLOCKED if the current checkout is dirty, branch/worktree ownership is unclear, feat/vqh-stage-01-foundation collides locally/remotely, push capability is unavailable, or safe execution would disturb another task.
  - Return BLOCKED if implementation requires choosing any value or behavior governed by BDG-TAX-01, BDG-EVAL-01, BDG-AUTH-01, or BDG-HIER-01.
  - Return BLOCKED rather than adding a concrete authority resolver, operational role mapping, production definition, Stage 02 progression, Project creation, Project Manager assignment, parent Stage runtime, or Stage 01 UI migration.
  - Return BLOCKED before using service_role on a normal request path or weakening the approved RLS/grant/function-security contract.
  - Return BLOCKED before adding an unapproved production dependency or changing an approved API/data/security contract.
  - Return BLOCKED before any Cloud DEV mutation because cloud_dev_mutating is false.
  - Return BLOCKED before any production mutation or deployment.
  - Stop after Phase A Task 15; do not continue into Phase B.

review_focus:
  - Exact fail-closed newest-definition selection and atomic bootstrap aggregate shape, including Decision Cycle 1.
  - No business assumptions hidden in enums, seeds, resolver defaults, owner rules, Completer rules, or operational role mappings.
  - Correct effective-state derivation, gate rechecks, reliability metadata semantics, and absence of manual blocked state.
  - Completion-event-before-baseline ordering and rollback safety.
  - Append-only/history immutability, Final Decision immutability, same-cycle references, and reactivation preservation.
  - Aggregate-correct optimistic concurrency and exactly-one-winner behavior in races.
  - RLS plus explicit grants/revokes, direct private-invocation safety, permission revocation, and cross-company isolation.
  - Exact 34 mutation functions and 36 routes with no generic RPC proxy, mega-PATCH, or service_role request path.
  - Additive repository integration with no Project Journey or Stage 01 UI migration.
  - Phase A boundary, all 33 flows, generated types, fresh verification, side effects, and immutable delivery SHAs.

known_risks:
  - The reusable Workflow Core can be over-generalized before later Stage designs; implement only primitives required by approved Stage 01 contracts.
  - Definition snapshots use JSONB and must remain immutable/reconstructable without becoming a mutable configuration cache or accepting incomplete production definitions.
  - SECURITY DEFINER implementations combine authorization, locking, history, and audit and therefore require exact schema qualification and direct-invocation tests.
  - Contact, relationship, Node Execution, and Decision Cycle commands use different owning versions; applying Opportunity version universally would violate concurrency contracts.
  - Generic reopen and Stage 01 Reactivation are distinct and can be conflated, corrupting execution/cycle history.
  - Existing client error mapping can collapse new stable Stage 01 4xx codes unless the narrow approved mapping change is tested.

approved_design_ref: >-
  docs/superpowers/specs/2026-08-29-vqh-stage-01-technical-design.md
  @ cf198b3bbf57df794bbe22464ccabd3704174153
approved_execution_plan_ref: >-
  docs/superpowers/plans/2026-08-29-vqh-stage-01-foundation.md
  @ 303a8b01ea935c1042387e7d1b01e2d8826a0828
```

## Preflight gate

Codex MUST fetch `origin/codex/vqh-stage-01-spec-plan-corrections`, verify that it contains
`303a8b01ea935c1042387e7d1b01e2d8826a0828`, and use that exact commit as
`execution_base_sha`. Implementation may start only after the repository-mandated technical
preflight returns `READY` or `READY_WITH_NON_MATERIAL_DRIFT`.

`PACKET_STALE` or `BLOCKED` is a stop-and-report result. It is not permission to branch from a
different source, create a worktree, infer missing decisions, weaken security, or mutate Cloud DEV.

## Approval and handoff boundary

This draft packet does not authorize implementation. Approval requires all of the following:

```text
[x] Corrected Technical Spec approved
[x] Corrected Execution Plan approved
[x] Remote execution base contains both approved documents
[x] Local destructive database testing is explicitly scoped
[x] Cloud DEV and production mutation remain forbidden
[x] Delivery branch and no-worktree/no-subagent constraints are explicit
[x] Written Implementation Packet reviewed and approved by Son
```

This approval state records Sơn's explicit written handoff approval. The packet may now be used as
the Phase A implementation instruction, subject to its mandatory technical preflight.

Approval of this packet authorizes implementation only within its scope after successful preflight.
It does not authorize Cloud DEV mutation, production mutation, deployment, PR creation, merge, or
force-push.
