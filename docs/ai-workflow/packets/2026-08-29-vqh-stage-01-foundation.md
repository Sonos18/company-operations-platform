# Codex Implementation Packet — VQH Stage 01 Foundation

> **Packet status:** APPROVED HANDOFF ARTIFACT — NOT YET SENT TO CODEX  
> **Scope:** Phase A foundation only  
> **Created:** 2026-08-29

```yaml
task:
  id: VQH-STAGE01-FOUNDATION-A
  name: VQH Stage 01 Workflow and Opportunity Foundation
  class: architectural

repository:
  remote: Sonos18/company-operations-platform
  base_ref: docs/vqh-stage-01-technical-spec
  analysis_base_sha: f314ed7a4ff1d86e45cc29075ab0213ec6421ca1

approval:
  status: APPROVED
  approved_by: Son
  approval_reference: Chat approval on 2026-08-29 for Stage 01 Technical Spec and Phase A Execution Plan
  approved_scope_version: 2026-08-29-stage01-foundation-a

goal: >-
  Implement the reusable Workflow Core and the VQH Stage 01 Opportunity/Intake/Evaluation
  technical foundation while preserving all approved VQH business semantics and leaving the four
  unresolved Business Decision Gates unimplemented.

current_state_summary: >-
  Project Journey business data is still prototype-backed. The current journey types expose
  advisory/display-only states and ProjectRepository is read-only. Taskovia already has Supabase
  tenancy, normalized company RBAC, private.has_company_permission, audit_events, authenticated
  Nitro routes, Zod boundaries, user-scoped Supabase clients, pgTAP, Vitest, and HTTP repository
  patterns. The approved Technical Spec and Execution Plan are present on the packet base branch.

approved_decisions:
  - Use a minimal reusable Workflow Core plus Stage 01-specific Opportunity and Evaluation/Decision domains.
  - Opportunity is the Stage 01 aggregate root and must not reuse Project as an Opportunity record.
  - Only 01.1 and 01.2 are authoritative runtime nodes in Phase A; do not create canonical parent Stage 01 runtime.
  - Persist internal node phase and derive locked, ready, active, blocked, completed, and not_applicable according to the approved spec.
  - blocked is derived from open blocking blocker records and is never a manually toggled persisted state.
  - Preserve historical node executions; Stage 01 Reactivation creates a new 01.2 execution generation and Decision Cycle.
  - Keep current validity separate from historical completion through needsRevalidation semantics.
  - Use immutable definition/config snapshots and immutable 01.1 completion baselines.
  - Execute critical multi-write transitions atomically in PostgreSQL transaction functions/RPC.
  - Use Nitro for early authorization/validation and PostgreSQL as final mutation authority.
  - Use optimistic version checks plus row locks for concurrent mutations.
  - Keep Stage 01 business taxonomies company-configurable rather than global hard-coded catalogs.
  - Criterion applicability is distinct from criterion result.
  - Final Decision is immutable and unique per Decision Cycle.
  - proceed does not create a Project, assign a Project Manager, start Stage 02, or complete a parent Stage.
  - Current mock Journey types and fixtures are not production domain authority.

forbidden_changes:
  - Do not invent or seed concrete VQH Customer Type, Contact Relationship, Scope, Lead Source, Referrer Type, Engagement Status, Invalid Reason, or related business catalogs.
  - Do not invent or seed detailed Stage 01 evaluation criteria, criticality, conditional applicability, N/A rules, or risk taxonomy.
  - Do not hard-code or infer Decision Authority, Intake Owner default, Evaluation Owner default, clarification authority, Completer policy, or operational role-to-permission mapping.
  - Do not create canonical parent Stage 01 runtime or infer parent/child propagation semantics.
  - Do not create a Project from proceed and do not implement Stage 02 progression.
  - Do not add Project Manager assignment behavior.
  - Do not redesign or migrate the existing Journey UI in Phase A.
  - Do not use service_role on normal Stage 01 request paths.
  - Do not add new production dependencies.
  - Do not edit existing migration files.
  - Do not hand-edit shared/types/database.types.ts.
  - Do not mutate Supabase Cloud DEV.
  - Do not mutate or deploy production.

scope:
  in:
    - Shared Zod contracts for Workflow, Opportunity, and Stage 01.
    - Stable Stage 01 permission and API error codes.
    - Workflow Core persistence, events, assignments, blockers, definition snapshots, and execution generations.
    - Opportunity, contacts, contact methods, opportunity contacts/scopes/referrers, Intake Records, duplicate concerns, and immutable 01.1 baselines.
    - Stage 01 Decision Cycles, criterion revisions, Recommendation history, clarification returns, and Final Decision persistence.
    - RLS, grants, explicit company_admin permission extension, and secure transactional command functions.
    - Pure workflow-state and Stage 01 gate evaluation functions.
    - Atomic Start, Complete 01.1, blocker, duplicate, invalidate/restore, reopen/revalidation, evaluation, Recommendation, clarification, Final Decision, Complete 01.2, and Reactivation command foundations.
    - Server repositories/services and thin authenticated Nitro routes.
    - Frontend domain/repository contracts and authenticated HTTP adapters without UI migration.
    - pgTAP, Vitest, contract, RLS, concurrency, and repository tests.
    - Generated database types and local verification.
  out:
    - Concrete VQH taxonomy seed values.
    - Concrete VQH evaluation criteria/risk taxonomy.
    - Concrete authority resolver and operational role mappings.
    - Parent Stage 01 runtime semantics.
    - Stage 01 production UI/workspace redesign or migration.
    - Stage 02 or later Stage behavior.
    - Automatic Project creation or Project Manager assignment.
    - Cloud DEV rollout, production rollout, deployment, or migration execution outside local test database.
  allowed_refactors:
    - Small focused extraction required to reuse existing auth, tenancy, authorization, API-error, or repository patterns.
    - Type-only adjustments necessary to add the new repositories to RepositoryRegistry without changing existing Project Journey behavior.
    - Test helper extraction local to Stage 01 tests when it reduces duplication without changing unrelated behavior.

source_anchors:
  paths_or_symbols:
    - docs/vqh/project-journey/README.md
    - docs/vqh/project-journey/stages/01-opportunity-intake.md
    - docs/superpowers/specs/2026-08-29-vqh-stage-01-technical-design.md
    - docs/superpowers/plans/2026-08-29-vqh-stage-01-foundation.md
    - docs/superpowers/specs/2026-08-14-backend-architecture-design.md
    - docs/superpowers/specs/2026-08-18-employee-management-rbac-design.md
    - AGENTS.md
    - docs/ai-workflow/README.md
    - shared/constants/permissions.ts
    - shared/schemas/api-error.ts
    - shared/types/database.types.ts
    - server/features/authorization/authorization.service.ts
    - server/features/tenancy/tenancy.service.ts
    - server/features/employees/employee.routes.ts
    - server/utils/api-error.ts
    - server/utils/auth-context.ts
    - server/utils/supabase-client.ts
    - app/repositories/contracts.ts
    - app/repositories/http/authenticated-http-client.ts
    - app/features/journey/journey.types.ts
    - app/features/projects/project.types.ts
    - supabase/migrations/20260814000100_create_tenancy_foundation.sql
    - supabase/migrations/20260818033418_employee_management_rbac.sql
    - supabase/tests/database/employee_rbac_schema.test.sql
    - supabase/tests/database/employee_rbac_rls.test.sql
    - package.json
  assumptions:
    - The source-code behavior at f314ed7a4ff1d86e45cc29075ab0213ec6421ca1 remains unchanged except for approved documentation commits on the packet base branch.
    - Existing normalized RBAC and private.has_company_permission remain the canonical company authorization mechanism.
    - The existing authenticated company-context pattern remains valid for Stage 01 routes.
    - Existing prototype Project Journey behavior may coexist unchanged while the new backend domain is introduced.

contracts:
  api: >-
    Implement the company-scoped Opportunity, Workflow node, blocker, Stage 01 aggregate,
    criterion evaluation, Recommendation, clarification, Final Decision, and Reactivation routes
    defined by the approved Technical Spec. Zod validates request/response boundaries and stable
    error codes extend shared/schemas/api-error.ts. Final Decision must remain separate from 01.2 Complete.
  data: >-
    Implement the tables, constraints, immutable history records, version fields, derived state model,
    definition snapshots, completion baselines, Decision Cycles, and concurrency rules in the approved
    Technical Spec. Do not add received_at. Do not create a Project or parent Stage runtime.
  auth_permission_security: >-
    Every new company-scoped table uses RLS. Read/mutation boundaries use active company membership
    and the approved explicit permissions through the existing normalized RBAC/private.has_company_permission
    pattern. Critical mutations re-check permission and invariants inside database transactions.
    Only company_admin may inherit the new codes through the existing complete explicit permission policy
    in Phase A; no operational-role mappings are approved. service_role is forbidden on normal request paths.
  migration_rollout: >-
    Add forward-only new migrations in the order defined by the approved Execution Plan, regenerate
    database.types.ts from the local database, and validate locally. No Cloud DEV push, shared Cloud DEV
    mutation, production database mutation, production deployment, or production rollout is authorized.

acceptance_criteria:
  - id: AC-01
    requirement: Shared schemas expose exactly the approved workflow states, internal phases, Stage 01 outcomes, Recommendation values, criterion applicability/result model, permission codes, and stable error codes.
    evidence_expected: Focused Vitest schema tests pass and diff shows no extra business enum invented for unresolved VQH catalogs.
  - id: AC-02
    requirement: Workflow Core schema contains immutable definition snapshots, instances, node instances/executions/events, assignments, and blockers with one current execution and one active accountable owner constraints.
    evidence_expected: pgTAP schema tests pass and migration diff shows no parent Stage 01 runtime creation.
  - id: AC-03
    requirement: Opportunity/intake schema preserves Opportunity separate from Project, historical contacts/scopes/referrers/Intake Records, duplicate concerns, and immutable 01.1 completion baselines without received_at.
    evidence_expected: pgTAP schema tests pass and no Project FK or automatic Project creation exists.
  - id: AC-04
    requirement: Evaluation persistence preserves immutable Decision Cycles, criterion revisions, Recommendation versions, clarification returns, and one immutable Final Decision per cycle.
    evidence_expected: pgTAP schema and command tests pass including reactivation history preservation.
  - id: AC-05
    requirement: Effective workflow state is derived so blocked is caused only by an open blocking blocker and not by a direct state mutation.
    evidence_expected: Workflow-state unit truth-table tests pass and no mark-blocked command exists.
  - id: AC-06
    requirement: 01.1 Start requires valid Opportunity, active Intake Owner, ready state, and start permission but not completion data.
    evidence_expected: Unit/pgTAP tests prove Start succeeds with incomplete intake and fails without owner/permission/readiness.
  - id: AC-07
    requirement: 01.1 Complete atomically rechecks the exact approved required and conditional gates, creates an immutable completion baseline, and never stores an explicit 01.2-unlocked flag.
    evidence_expected: Command tests cover required/optional distinctions, referral-style semantic gate, blockers, duplicates, and double-complete concurrency.
  - id: AC-08
    requirement: Required criterion insufficient_information does not satisfy evaluation, while fit/concern/not_fit are evaluated results and none auto-decides the outcome.
    evidence_expected: Unit and database tests pass for all four result semantics and no auto-outcome code path exists.
  - id: AC-09
    requirement: Recommendation history and clarification sequencing require a current post-clarification Recommendation before Final Decision.
    evidence_expected: Database/service tests show clarification invalidates decision-readiness until a newer Recommendation exists.
  - id: AC-10
    requirement: Final Decision requires resolved authority, matching actor plus permission, evaluation gates, current Recommendation, and override rationale when outcome differs; it does not complete 01.2.
    evidence_expected: Command/service tests cover unresolved authority, mismatched actor, override, duplicate submission, and separate completion.
  - id: AC-11
    requirement: Reactivation is allowed only after not_proceeding with valid Opportunity/intake basis and creates a new 01.2 execution plus Decision Cycle without modifying prior history.
    evidence_expected: Database concurrency/history tests prove Cycle 1 and execution history remain reconstructable after Cycle 2 creation.
  - id: AC-12
    requirement: New Stage 01 tables and commands preserve tenant/company isolation and immediate permission revocation behavior.
    evidence_expected: pgTAP RLS tests with at least two companies pass and direct unauthorized mutation is denied.
  - id: AC-13
    requirement: Nitro adapters remain thin, authenticated, company-scoped, Zod-validated, and backed by user-scoped Supabase clients.
    evidence_expected: Route/service tests pass and review finds no service_role use or business-transition logic in route handlers.
  - id: AC-14
    requirement: Frontend adds Opportunity/Workflow/Stage01 repository contracts and HTTP adapters without replacing ProjectRepository or changing existing Project Journey UI behavior.
    evidence_expected: Repository tests pass and existing Journey component/type behavior is untouched except additive registry wiring.
  - id: AC-15
    requirement: Phase A contains none of the four unresolved business decisions or downstream Stage 02/Project/UI production behavior.
    evidence_expected: Final diff audit shows no concrete VQH taxonomy/evaluation seed, no hard-coded authority/operational role mapping, no parent runtime, no Stage 02 progression, no Project creation, and no new Stage 01 Vue workspace.
  - id: AC-16
    requirement: Full local backend verification succeeds on the final tree.
    evidence_expected: Fresh outputs for pnpm verify:backend:local and git diff --check are clean; generated database.types.ts is reviewed and committed.

validation:
  required:
    - pnpm exec vitest run tests/unit/shared/stage01-schemas.spec.ts
    - pnpm db:local:reset
    - pnpm db:local:test
    - pnpm db:local:types
    - pnpm test:unit
    - pnpm typecheck
    - pnpm lint
    - pnpm build
    - pnpm verify:backend:local
    - git diff --check
    - git status --short
    - final fetch of base_ref for source-drift classification
  optional:
    - pnpm test:e2e only if implementation unexpectedly changes behavior observable by existing browser tests; Phase A does not add Stage 01 UI
  side_effect_authorization:
    workspace_mutating: true
    local_db_destructive: true
    cloud_dev_mutating: false
    production_mutating: false

required_capabilities:
  - PostgreSQL schema, RLS, transaction, locking, and pgTAP implementation
  - TypeScript strict and Zod contract implementation
  - Nuxt Nitro authenticated route and service/repository implementation
  - Security review of tenant isolation, permissions, RPC boundaries, and service-role usage
  - TDD and fresh verification before completion

preferred_tools: []

runtime_mandated_workflows:
  - Follow repository AGENTS.md and canonical Taskovia AI workflow.
  - Use TDD for behavior changes.
  - Execute the approved plan task-by-task using the runtime-required Superpowers execution workflow.
  - Perform fresh verification before every completion claim.

delivery:
  branch_name: feat/vqh-stage-01-foundation
  push: true
  create_pr: false
  merge: false
  force_push: false
  create_worktree: false

task_specific_stop_conditions:
  - Return BLOCKED if implementation requires choosing concrete VQH taxonomy values under BDG-TAX-01.
  - Return BLOCKED if implementation requires choosing detailed evaluation criteria, risk taxonomy, conditional applicability, or N/A policy under BDG-EVAL-01.
  - Return BLOCKED if implementation requires selecting Decision Authority, owner defaults, completion authority, clarification authority, or operational role mappings under BDG-AUTH-01.
  - Return BLOCKED if implementation requires parent Stage 01 runtime semantics under BDG-HIER-01.
  - Return BLOCKED rather than implementing Stage 02 progression, automatic Project creation, or Project Manager assignment.
  - Return BLOCKED before any Cloud DEV mutation because cloud_dev_mutating is false.
  - Return BLOCKED before any production mutation or deployment.
  - Return PACKET_STALE if fetched source materially changes schema/migration order, auth/RBAC/RLS, API/data contracts, validation commands, repository instructions, or approved source anchors.

review_focus:
  - No business assumptions hidden in schema enums, seed data, resolver defaults, or role mappings.
  - Derived workflow state is correct and cannot drift from blockers/dependencies.
  - History is reconstructable after correction, reopen, revalidation, Final Decision, and Reactivation.
  - All multi-row critical transitions are atomic and concurrency-safe.
  - RLS and permission checks prevent cross-company data access and direct protected mutations.
  - service_role is absent from normal Stage 01 request paths.
  - Existing Project Journey prototype remains additive/coexisting rather than silently reinterpreted as production truth.
  - No Project/Stage 02/UI production scope leaks into Phase A.

known_risks:
  - The approved design intentionally introduces a reusable workflow persistence core before later Stage designs; keep it minimal and avoid adding unused generic mechanisms.
  - Definition snapshots use JSONB and must remain reconstructable without turning the snapshot into a mutable configuration cache.
  - Reactivation execution generations and generic reopen semantics are distinct and can be accidentally conflated.
  - The database command layer is security-sensitive because it combines SECURITY DEFINER internals, permission checks, RLS, audit, and optimistic concurrency.
  - The packet base contains approved documentation commits after analysis_base_sha; Codex must classify that known docs-only drift explicitly during preflight.

approved_design_ref: docs/superpowers/specs/2026-08-29-vqh-stage-01-technical-design.md
approved_execution_plan_ref: docs/superpowers/plans/2026-08-29-vqh-stage-01-foundation.md
```

## Handoff boundary

Creating this packet does not execute it. Codex implementation begins only when Sơn explicitly sends/uses this packet as the implementation instruction. Until then:

- no implementation branch is created by this artifact;
- no local database is reset;
- no Cloud DEV operation is performed;
- no production operation is performed;
- nothing is merged.
