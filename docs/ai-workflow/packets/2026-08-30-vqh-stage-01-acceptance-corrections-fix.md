# Codex Fix Packet — VQH Stage 01 Phase A Acceptance Corrections

> **Packet status:** DRAFT — pending explicit approval by Sơn
> **Implementation authorization:** NONE
> **Reviewed implementation:** `feat/vqh-stage-01-foundation@78bf5151f3c46527f53350edd18a79f7f1778677`
> **Fix scope:** Four verified runtime defects and one acceptance-evidence gap only
> **Created:** 2026-08-30

```yaml
task:
  original_task_id: VQH-STAGE01-FOUNDATION-A
  fix_round: 1
  implementation_branch: feat/vqh-stage-01-foundation

review:
  verdict: CHANGES_REQUIRED
  reviewed_head_sha: 78bf5151f3c46527f53350edd18a79f7f1778677
  reviewed_by: GPT
  review_reference: >-
    Stage 01 implementation review supplied by Sơn in chat on 2026-08-30; all five findings were
    independently checked against the reviewed implementation before corrective design work.

authorization:
  status: PENDING_APPROVAL
  approved_by: null
  approval_reference: null

scope:
  findings_only: true
  prohibited_scope_expansion: true
  approved_design_ref:
    path: docs/superpowers/specs/2026-08-30-vqh-stage-01-acceptance-corrections-design.md
    content_commit: e228b739ffffb2e1a5b12fba1e5460fa4da86abd
    approval_record_commit: f1764c9551a8a19a8fad96a01a7c130e6b3d2ad2
  approved_execution_plan_ref:
    path: docs/superpowers/plans/2026-08-30-vqh-stage-01-acceptance-corrections.md
    content_commit: f1764c9551a8a19a8fad96a01a7c130e6b3d2ad2
    approval_reference: Sơn approved the execution plan in chat on 2026-08-30.
  expected_local_documentation_commits_after_reviewed_head:
    - e228b739ffffb2e1a5b12fba1e5460fa4da86abd
    - f1764c9551a8a19a8fad96a01a7c130e6b3d2ad2
  in:
    - Require every supplied Stage 01 taxonomy code to exist in the immutable definition bound to the Opportunity workflow.
    - Replace new 01.1 completion snapshots with the approved explicit deterministic schemaVersion 1 baseline.
    - Require non-empty revalidation evidence across strict shared/HTTP/database contracts.
    - Persist current invalidation metadata and require correction or separation evidence before restoring duplicate_merged semantics.
    - Replace the advisory-lock harness with nine fixed real public-RPC optimistic-concurrency races.
    - Add focused tests, regenerate Cloud DEV database types, run the approved validation matrix, commit, and push the same branch.
  out:
    - Any change outside the five findings or their direct validation/supporting fixtures.
    - Resolution or inference of BDG-TAX-01, BDG-EVAL-01, BDG-AUTH-01, or BDG-HIER-01.
    - Concrete production VQH taxonomy values, evaluation criteria, authority rules, owner defaults, or operational role mappings.
    - Project creation, Project Manager assignment, canonical parent Stage 01 runtime, Stage 02, or Stage 01 UI redesign/migration.
    - A new stable public error code, generic RPC proxy, normal-path service_role usage, or weakened RLS/grants/function security.
    - Local Supabase, Docker, production mutation, deployment, PR creation, merge, or force-push.

findings:
  - id: FIX-S01-01
    severity: P1
    title: Concurrency harness does not exercise Stage 01 optimistic concurrency
    path_or_symbol:
      - scripts/run-stage01-cloud-dev-concurrency.mjs
      - supabase/tests/database/stage01_concurrency_actor_a.sql
      - supabase/tests/database/stage01_concurrency_actor_b.sql
      - tests/unit/config/stage01-cloud-dev-concurrency.spec.ts
    evidence: >-
      Both Cloud DEV actors only contend on pg_advisory_xact_lock and sleep; neither calls a public
      Stage 01 RPC. The unit test fabricates VERSION_CONFLICT in a mock, and the final assertion checks
      only that the advisory lock is not leaked.
    impact: >-
      AC-S01-09 has no evidence that aggregate row locks and expected versions produce exactly one
      winner or prevent losing events/history across the required Stage 01 races.
    required_change: >-
      Replace the advisory fixture with nine deterministic scenarios whose actors use separate
      PostgreSQL sessions to call the same public Stage 01 RPC with the same aggregate versions.
      Require exactly one success and one sanitized exact VERSION_CONFLICT, assert the final version,
      current state, event/history cardinality, and always clean namespaced fixtures.
    verification_required:
      - Focused harness unit tests reject unexpected loser errors, malformed responses, two winners, and cleanup failure.
      - Both actor files in every scenario contain the expected public RPC and no pg_advisory or pg_sleep call.
      - pnpm db:dev:stage01:concurrency passes all nine required scenarios with no residue.

  - id: FIX-S01-02
    severity: P1
    title: Immutable 01.1 baseline omits completion-gate evidence
    path_or_symbol:
      - private.execute_stage01_workflow_command
      - public.stage01_intake_completion_baselines
      - supabase/tests/database/stage01_history.test.sql
    evidence: >-
      Completion currently snapshots broad mutable Opportunity-related rows but does not explicitly
      capture the usable Contact Method references, Intake Owner assignment, duplicate/blocker gate
      outcomes, or the complete completion actor/time/version proof required by the Technical Spec.
    impact: >-
      Later mutation of contact_methods.is_usable or other current state can make the historical row
      unable to prove why 01.1 completion was valid when it occurred, reopening AC-S01-05.
    required_change: >-
      For new completions only, store deterministic schemaVersion 1 payloads with the exact approved
      evidence groups, stable ordering, one completion timestamp, minimal Contact Method PII, event-first
      atomicity, and SHA-256 over the complete snapshot. Never rewrite an existing baseline.
    verification_required:
      - A successful completion baseline contains every approved evidence group and no Contact Method value.
      - A later public-RPC Contact Method mutation leaves the prior snapshot and hash byte-for-byte unchanged.
      - Forced baseline failure still rolls back phase, event, baseline, and audit atomically.

  - id: FIX-S01-03
    severity: P1
    title: Unknown taxonomy codes bypass immutable-definition semantics
    path_or_symbol:
      - private.execute_stage01_opportunity_command
      - private.execute_stage01_workflow_command
      - private.assert_valid_stage01_definition
    evidence: >-
      Strict TypeScript inputs accept any non-empty configurable code and PostgreSQL writes those strings
      without resolving them in the workflow's bound definition. An unknown primaryLeadSourceCode remains
      present but does not match a requiresReferrer entry, so the conditional Referrer gate can fail open.
    impact: >-
      Invalid codes can enter the aggregate and alter gate behavior without changing BDG-owned catalogs,
      reopening AC-S01-08 and AC-S01-10.
    required_change: >-
      Add a private fail-closed taxonomy-entry helper and validate all twelve approved field-to-key mappings
      against the immutable definition bound to the Opportunity workflow. Revalidate persisted gate-related
      values on 01.1 completion and keep TypeScript codes dynamic non-empty strings.
    verification_required:
      - Every unknown supplied mapped code returns INVALID_COMMAND_INPUT with no version/event/audit change.
      - Bootstrap validates against the definition selected in its transaction; later commands use the existing bound snapshot.
      - An unknown persisted Lead Source cannot mean requiresReferrer=false or allow 01.1 completion.

  - id: FIX-S01-04
    severity: P1
    title: Revalidation evidence is lost at the strict HTTP contract
    path_or_symbol:
      - shared/schemas/workflow.ts#revalidateWorkflowNodeInputSchema
      - app/repositories/http/http-workflow-repository.ts
      - server/features/workflow/workflow.routes.ts
      - private.execute_stage01_workflow_command
    evidence: >-
      The strict shared schema accepts reason and expectedExecutionVersion only, so an HTTP body with
      evidence is rejected. PostgreSQL allows evidence to be absent and records an empty array, while the
      passing database flow calls the RPC directly and bypasses the HTTP contract.
    impact: >-
      Required revalidation reason/evidence cannot traverse the supported request path, so the relevant
      portion of AC-S01-14 is not verified.
    required_change: >-
      Require a non-empty JSON evidence array in the shared schema, preserve it unchanged through HTTP and
      server repositories, require it in PostgreSQL, remove the empty fallback, and store it in event/audit.
    verification_required:
      - Shared schema and HTTP tests accept and forward nested non-empty evidence and reject missing/empty evidence.
      - Public RPC rejects missing, non-array, and empty evidence and records supplied evidence on success.

  - id: FIX-S01-05
    severity: P2
    title: duplicate_merged restoration lacks explicit correction evidence
    path_or_symbol:
      - public.opportunities
      - public.invalidate_opportunity
      - public.restore_opportunity
      - public.resolve_opportunity_duplicate
    evidence: >-
      Restore accepts reason and expectedOpportunityVersion only. PostgreSQL derives eligibility from the
      mutable canonical_opportunity_id rather than stored invalidation semantics, so a duplicate_merged
      invalidation without a canonical link can become valid with free text alone.
    impact: >-
      The approved rule requiring explicit separation or correction evidence is bypassable and current state
      cannot reliably distinguish ordinary invalidation from duplicate merge.
    required_change: >-
      Add guarded current invalidation metadata, capture bound taxonomy semantics for explicit invalidation,
      capture the technical duplicate_merged semantic for same-need resolution, and require non-empty evidence
      before duplicate_merged restore atomically clears canonical/invalidation state and increments version.
    verification_required:
      - Migration aborts rather than inventing metadata for any unreconstructable existing invalid Opportunity.
      - Ordinary restore remains valid without evidence; duplicate_merged restore rejects missing/empty evidence.
      - Successful evidenced restore clears all current invalidation fields and canonical link in one audited version increment.

validation:
  required:
    - pnpm vitest run tests/unit/shared/stage01-schemas.spec.ts
    - pnpm vitest run tests/unit/server/workflow-routes.spec.ts tests/unit/server/workflow.repository.spec.ts tests/unit/repositories/http-workflow-repository.spec.ts
    - pnpm vitest run tests/unit/server/opportunity-routes.spec.ts tests/unit/server/opportunity.repository.spec.ts tests/unit/repositories/http-opportunity-repository.spec.ts
    - pnpm vitest run tests/unit/config/stage01-cloud-dev-concurrency.spec.ts tests/unit/config/supabase-cloud-dev-runner.spec.ts
    - pnpm db:dev:target
    - pnpm db:dev:auth-check
    - pnpm db:dev:status
    - pnpm db:dev:dry-run
    - pnpm db:dev:push
    - pnpm db:dev:stage01:test
    - pnpm db:dev:stage01:concurrency
    - pnpm db:dev:types
    - pnpm db:dev:rls-smoke
    - pnpm db:dev:canonical-check
    - pnpm db:dev:advisors:security
    - pnpm db:dev:advisors:performance
    - pnpm test:unit
    - pnpm typecheck
    - pnpm lint
    - pnpm build
    - pnpm test:e2e
    - git diff --check
    - git status --short
    - git ls-remote origin refs/heads/feat/vqh-stage-01-foundation
  side_effect_authorization:
    workspace_mutating: true
    local_db_destructive: false
    cloud_dev_mutating: true
    production_mutating: false
  cloud_dev_scope:
    - Apply only the CLI-generated forward migration named stage01_acceptance_corrections through the fixed guarded runner.
    - Run only the fixed allowlisted rollback-safe Stage 01 SQL suite and fixed nine-scenario concurrency harness.
    - Generate database types from the canonical linked Cloud DEV project.
    - Run read-only status, dry-run, RLS/canonical checks, and security/performance advisors.
  cloud_dev_forbidden:
    - Remote reset, seed, migration repair, arbitrary SQL path, operator-supplied fixture, dashboard mutation, or direct production operation.

delivery:
  same_branch: true
  branch: feat/vqh-stage-01-foundation
  push: true
  create_pr: false
  merge: false
  force_push: false
  create_worktree: false
  dispatch_subagents: false

stop_conditions:
  - Preflight returns PACKET_STALE or BLOCKED instead of READY or READY_WITH_NON_MATERIAL_DRIFT.
  - The remote reviewed implementation is no longer 78bf5151f3c46527f53350edd18a79f7f1778677 before the expected documentation-only correction commits.
  - The local delta after the reviewed head contains anything other than the declared approved documents before implementation starts.
  - Cloud DEV target, dedicated PAT access, migration status, or dry-run guard fails or identifies an undeclared migration.
  - Existing invalid Opportunities cannot be reconstructed unambiguously from bound snapshots and append-only audit evidence.
  - A required fix would change an approved business/API/data/security contract or resolve an open BDG.
  - A pushed Cloud DEV migration fails later verification; do not edit the applied migration or add another migration without scoped diagnosis.
  - A concurrency cleanup fails or leaves namespaced residue; stop and report exact non-secret evidence.
  - Any production mutation, deployment, PR creation, merge, force-push, worktree creation, or subagent dispatch would be required.

acceptance_impact:
  reopened:
    - AC-S01-05
    - AC-S01-08
    - AC-S01-09
    - AC-S01-10
    - AC-S01-14
    - AC-S01-19
    - AC-S01-20
    - AC-S01-21
  completion_condition: >-
    All five findings and reopened acceptance criteria have fresh evidence on one corrected committed head,
    the branch is pushed without force, and git ls-remote proves remote_head_sha equals head_sha.
```

## Approval gate

```text
[x] Exact reviewed remote head is recorded.
[x] All five verified findings are bounded and mapped to required changes and evidence.
[x] Approved corrective design is referenced.
[x] Approved corrective execution plan is referenced.
[x] Same-branch, no-worktree, no-subagent delivery is explicit.
[x] Cloud DEV mutation is narrowly scoped; local Supabase and production mutation remain forbidden.
[ ] This Fix Packet is explicitly approved by Sơn.
```

This draft does not authorize implementation. After written approval, `authorization.status` becomes
`APPROVED_FOR_FIX`, `approved_by` becomes `Son`, and the packet authorizes only the five findings above,
subject to the mandatory repository technical preflight.
