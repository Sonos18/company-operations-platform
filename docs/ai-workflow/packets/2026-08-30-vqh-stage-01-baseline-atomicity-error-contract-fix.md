# Codex Fix Packet — VQH Stage 01 Baseline Atomicity and Error Contract

> **Packet status:** PENDING SƠN APPROVAL
> **Implementation authorization:** NOT YET AUTHORIZED
> **Reviewed implementation:** `feat/vqh-stage-01-foundation@3956aab68bc652859a071de457bfdb160e7ff659`
> **Fix scope:** Two verified baseline defects and one HTTP error-contract defect only
> **Created:** 2026-08-30

```yaml
task:
  original_task_id: VQH-STAGE01-FOUNDATION-A
  fix_round: 2
  implementation_branch: feat/vqh-stage-01-foundation

review:
  verdict: CHANGES_REQUIRED
  reviewed_head_sha: 3956aab68bc652859a071de457bfdb160e7ff659
  reviewed_by: GPT
  review_reference: >-
    Sơn supplied two baseline findings and one error-contract issue in chat on 2026-08-30.
    GPT independently verified all three against the exact remote implementation head, the original
    Technical Spec, the approved correction design, PostgreSQL snapshot semantics, and current tests.

authorization:
  status: PENDING_FIX_PACKET_APPROVAL
  approved_by: null
  approval_reference: >-
    Sơn approved the corrective direction in chat on 2026-08-30. Separate approval of this complete
    Fix Packet is still required before implementation or any Cloud DEV mutation.

scope:
  findings_only: true
  prohibited_scope_expansion: true
  approved_design_ref:
    path: docs/superpowers/specs/2026-08-30-vqh-stage-01-acceptance-corrections-design.md
    round_2_amendment_commit: 4775d9745b88211c8a87ff7aa3dec0e74cd306aa
    approval_reference: Sơn approved the Round 2 corrective direction in chat on 2026-08-30.
  in:
    - Serialize 01.1 completion with Contact Method mutation through the owning Primary Contact lock.
    - Capture the explicit baseline evidence before transition and use the same captured values for gates and persistence.
    - Remove live mutable-state queries from schemaVersion 1 baseline construction.
    - Add nullable locationText to new schemaVersion 1 completion baselines.
    - Map private P0001 INVALID_COMMAND_INPUT to HTTP 400 with existing public code OPPORTUNITY_INVALID.
    - Add focused database, repository, route, historical-proof, and mixed-command concurrency tests.
    - Deliver one forward-only migration, commit, and push the same implementation branch.
  out:
    - Rewriting any existing completion baseline or hash.
    - Changing public RPC names, signatures, aggregate versions, or approved Stage 01 business behavior.
    - Adding a new stable public API error code or exposing raw PostgreSQL diagnostics.
    - Changing the nine accepted same-command optimistic-concurrency scenarios or their one-winner contract except for direct regression support.
    - Resolution or inference of BDG-TAX-01, BDG-EVAL-01, BDG-AUTH-01, or BDG-HIER-01.
    - Project creation, Project Manager assignment, canonical parent Stage 01 runtime, Stage 02, or Stage 01 UI redesign/migration.
    - Local Supabase, Docker, production mutation, deployment, PR creation, merge, or force-push.

findings:
  - id: FIX-S01-R2-01
    severity: P1
    title: 01.1 baseline evidence is not atomic with Contact Method mutation
    path_or_symbol:
      - private.execute_stage01_workflow_command
      - private.stage01_baseline_snapshot_v1
      - public.update_contact_method
      - supabase/tests/database/stage01_commands.test.sql
    evidence: >-
      complete_stage01_intake locks Opportunity and execution, evaluates contact_methods.is_usable,
      transitions the execution, and inserts the baseline. update_contact_method serializes only on
      the owning Contact. The baseline trigger then re-queries live contact_methods and hard-codes
      hasUsableContactMethod=true. In PostgreSQL Read Committed, the VOLATILE command/trigger may see a
      Contact Method commit that occurred after the gate query, producing contradictory evidence.
    impact: >-
      A completed baseline can contain usableContactMethods=[] while claiming the usable-method gate
      passed. Historical evidence no longer proves why 01.1 completion was valid, reopening AC-S01-05.
    required_change: >-
      Preserve the existing Opportunity-then-execution lock order, then resolve the active Primary
      Contact and lock its owning Contact row before reading Contact Methods. Capture every explicit
      schemaVersion 1 evidence group into local variables before transition, evaluate gates from those
      captured values, and persist exactly that snapshot after the completion event. Replace the current
      snapshot trigger behavior so it performs no live mutable business-state reads; it may retain only
      shape/link/hash guard responsibilities. Existing baselines remain untouched.
    verification_required:
      - A focused red database test proves the current gate/evidence construction can diverge or lacks the required owning Contact lock/captured-data invariant.
      - Completion-first versus update_contact_method serializes so both may succeed, the final method may be unusable, and the baseline still names the method with isUsableAtCompletion=true.
      - Contact-update-first versus completion causes the completion gate to fail with no completion event, baseline, audit, or partial execution transition.
      - The mixed-command fixtures call both real public RPCs and assert persisted state; advisory-lock or sleep-only contention is not accepted as evidence.
      - Forced baseline failure still rolls back execution transition, completion event, baseline, and audit together.

  - id: FIX-S01-R2-02
    severity: P2
    title: Immutable 01.1 baseline omits locationText
    path_or_symbol:
      - private.execute_stage01_workflow_command
      - private.stage01_baseline_snapshot_v1
      - supabase/tests/database/stage01_commands.test.sql
    evidence: >-
      The original Technical Spec requires Location status/value and public.opportunities already stores
      nullable location_text. The approved explicit correction payload and current trigger copy only
      locationStatus, so a later locationText mutation prevents reconstruction of the value at completion.
    impact: >-
      The baseline is incomplete historical evidence and AC-S01-05 cannot remain PASS.
    required_change: >-
      Add nullable locationText to the Opportunity subset of every new schemaVersion 1 baseline, captured
      with locationStatus before transition. Do not modify prior baseline rows or hashes.
    verification_required:
      - Completion with non-null locationText stores the exact value in the new immutable baseline.
      - Completion with null locationText stores an explicit JSON null.
      - A later public update_opportunity_current_data location change leaves the earlier snapshot and hash byte-for-byte unchanged.

  - id: FIX-S01-R2-03
    severity: P2
    title: Unknown taxonomy rejection falls through to HTTP 500
    path_or_symbol:
      - private.stage01_taxonomy_entry
      - server/features/stage01/stage01-errors.ts#mapStage01RpcError
      - server/features/opportunities/opportunity.repository.ts
      - server/features/opportunities/opportunity.routes.ts
    evidence: >-
      The taxonomy helper raises P0001 with message INVALID_COMMAND_INPUT. mapStage01RpcError only maps
      allowlisted P0001 messages, does not include INVALID_COMMAND_INPUT, and otherwise throws
      INTERNAL_ERROR status 500. Configurable taxonomy schemas intentionally accept dynamic non-empty
      strings, so an unknown code reaches this database boundary through the supported HTTP path.
    impact: >-
      A semantically invalid client request is misclassified as an unexpected server failure, contrary to
      Technical Spec section 40 and the approved correction contract.
    required_change: >-
      Keep INVALID_COMMAND_INPUT private to PostgreSQL and add an allowlisted mapping to status 400 with
      the existing stable public code OPPORTUNITY_INVALID and a generic sanitized message. Do not map
      arbitrary P0001 messages or include database details in the response.
    verification_required:
      - A repository test supplies P0001 INVALID_COMMAND_INPUT and receives AppApiError 400 OPPORTUNITY_INVALID.
      - An HTTP route/API test sends an unknown taxonomy code and receives the stable sanitized 400 body rather than INTERNAL_ERROR.
      - An unrecognized P0001 message still fails closed as INTERNAL_ERROR 500 without leaking the database message.
      - Existing public-RPC SQL tests continue to receive private INVALID_COMMAND_INPUT with no version, event, or audit mutation.

validation:
  required:
    - pnpm vitest run tests/unit/server/opportunity.repository.spec.ts tests/unit/server/opportunity-routes.spec.ts
    - pnpm vitest run tests/unit/config/stage01-cloud-dev-integrity-races.spec.ts
    - pnpm db:dev:target
    - pnpm db:dev:auth-check
    - pnpm db:dev:status
    - pnpm db:dev:dry-run
    - pnpm db:dev:push
    - pnpm db:dev:stage01:test
    - pnpm db:dev:stage01:concurrency
    - pnpm db:dev:stage01:integrity-races
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
    - Apply only one CLI-generated forward migration named stage01_baseline_atomicity_error_contract through the guarded runner.
    - Run only the fixed rollback-safe Stage 01 SQL suite, existing nine-scenario concurrency suite, and two fixed mixed-command integrity race orders.
    - Run read-only target, auth, status, dry-run, RLS, canonical, security-advisor, and performance-advisor checks.
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
  - This packet has not been explicitly approved by Sơn and changed to APPROVED_FOR_FIX.
  - Preflight returns PACKET_STALE or BLOCKED instead of READY or READY_WITH_NON_MATERIAL_DRIFT.
  - Remote reviewed head 3956aab68bc652859a071de457bfdb160e7ff659 is not the exact ancestor before the declared documentation-only amendment/packet commits.
  - The delta after reviewed_head_sha contains any undeclared production, migration, generated-type, test, or configuration change before implementation starts.
  - Safe Contact locking would require changing an approved aggregate/version contract or introduces an unresolved lock-order cycle.
  - The correction would require rewriting an existing immutable baseline or hash.
  - Cloud DEV target, dedicated PAT access, migration status, or dry-run guard fails or identifies an undeclared migration.
  - A pushed Cloud DEV migration fails later verification; do not edit the applied migration or add another migration without scoped diagnosis.
  - A mixed-command race cleanup fails or leaves namespaced residue; stop and report exact non-secret evidence.
  - Any production mutation, deployment, PR creation, merge, force-push, worktree creation, or subagent dispatch would be required.

acceptance_impact:
  reopened:
    - AC-S01-05
    - AC-S01-08 HTTP contract evidence
    - AC-S01-10 HTTP contract evidence
    - AC-S01-19
    - AC-S01-20
    - AC-S01-21
  preserved:
    - AC-S01-09 nine same-command optimistic-concurrency races
  completion_condition: >-
    All three findings have fresh focused and regression evidence on one corrected committed head, Cloud
    DEV migration/test side effects and cleanup are reported, the branch is pushed without force, and
    git ls-remote proves remote_head_sha equals head_sha.
```

## Approval gate

```text
[x] Exact reviewed remote head is recorded.
[x] All three findings were independently verified and bounded.
[x] The approved Round 2 design amendment is committed and referenced.
[x] Same-branch, no-worktree, no-subagent delivery is explicit.
[x] Proposed Cloud DEV mutation is limited to one forward migration and fixed rollback-safe fixtures.
[x] Local Supabase, Docker, production mutation, deployment, PR, merge, and force-push remain forbidden.
[ ] Sơn has explicitly approved this complete Fix Packet and its Cloud DEV side-effect scope.
```

This draft does not authorize implementation. After Sơn approves the complete packet, its authorization
metadata must be changed to `APPROVED_FOR_FIX` and committed before Codex technical preflight begins.
