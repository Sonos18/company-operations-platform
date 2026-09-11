# B4 Policy Acceptance Isolation Implementation Plan

**Goal:** Remove B4 acceptance policy behavior from active Taskovia runtime while preserving generic Decision Authority and keeping B4 preparation in acceptance infrastructure.

**Architecture:** Remove the B4-only application/API transition path and replace the active database definitions through one forward migration. Retain historical data and immutable A25/A31/A40 source, while the acceptance fixture creates the B4 policy state before acceptance cycles are created.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Zod, Vitest, Playwright, Supabase PostgreSQL migrations, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-07-b4-policy-acceptance-isolation-design.md`

## Global Constraints

- Preserve SHA-256 identity of A25, A31, and A40.
- Create one forward migration at `supabase/migrations/20260907100000_isolate_b4_policy_acceptance_runtime.sql`; stop if that filename is already occupied.
- Do not run Cloud DEV commands, apply migrations, push, merge, rebase, stash, reset, clean, or create a worktree.
- Do not add a generic Decision Policy transition or cross-company policy-copy feature.
- Keep B4 identifiers inside acceptance fixtures, acceptance harnesses, and tests only.
- Preserve Decision Authority, company capability, RBAC, Final Decision, historical-data, and canonical-VQH invariants from the spec.

---

## File Structure

| Path | Responsibility during implementation |
| --- | --- |
| `tests/unit/config/stage01-production-b4-isolation-contract.spec.ts` | Source-level isolation and forward-migration contract guard. |
| `tests/unit/shared/opportunity-decision-authority.spec.ts` | Shared Decision Authority schema contract after transition removal. |
| `tests/unit/server/opportunity-decision-authority.spec.ts` | Route/service/repository authority contract without policy transition. |
| `tests/unit/config/opportunity-decision-company-capability.spec.ts` | Capability and projection contract without B4 runtime behavior. |
| `app/components/stage01-operational/Stage01EvaluationDecisionControls.vue` | Removes B4 transition presentation and command dispatch. |
| `app/repositories/contracts.ts` | Removes only the transition repository contract. |
| `app/repositories/http/http-stage01-repository.ts` | Removes only the policy-binding endpoint mapping. |
| `shared/schemas/opportunity-decision-authority.ts` | Removes only B4 transition input and B4-only projection field. |
| `server/features/stage01/stage01.routes.ts` | Removes only the policy-binding route handler. |
| `server/features/stage01/stage01.service.ts` | Removes only transition service delegation. |
| `server/features/stage01/stage01.repository.ts` | Removes only transition RPC delegation and preserves generic projection/capability logic. |
| `server/features/stage01/stage01-errors.ts` | Removes the B4-only scope-denied mapping. |
| `server/api/companies/[companyId]/opportunities/[opportunityId]/decision-cycles/[decisionCycleId]/policy-binding.post.ts` | Removes the B4-only public endpoint. |
| `supabase/migrations/20260907100000_isolate_b4_policy_acceptance_runtime.sql` | Forward-only removal/replacement of active B4-specific database behavior. |
| `scripts/stage01-b4-acceptance-fixture.mjs` | Prepares B4 policy state within fixture scope before B4 cycles are created. |
| `tests/unit/config/stage01-b4-acceptance-contract.spec.ts` | Confirms repeatable B4-only fixture policy preparation. |

### Task 1: Regression Contract for Production / Acceptance Isolation

**Files:**
- Create: `tests/unit/config/stage01-production-b4-isolation-contract.spec.ts`
- Modify: `tests/unit/shared/opportunity-decision-authority.spec.ts`
- Modify: `tests/unit/server/opportunity-decision-authority.spec.ts`
- Modify: `tests/unit/config/opportunity-decision-company-capability.spec.ts`

**Interfaces:**
- Consumes: source anchors in the design spec and the current Decision Authority schemas/routes.
- Produces: failing regression contracts that define the removal boundary before runtime code changes.

**Reason:** Make the production/acceptance boundary executable before any runtime or migration change.

**Minimum objective:** The new contracts fail on every traced B4 production surface and retain assertions for generic authority, capability, RBAC, and Final Decision behavior.

**RED command:** `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/shared/opportunity-decision-authority.spec.ts tests/unit/server/opportunity-decision-authority.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

**GREEN command:** Repeat the same command after Tasks 2–4; it exits zero only when the active correction and fixture boundary satisfy the contracts.

**Regression:** The contracts reject new B4 literals in production code, shared/API contracts, and active projection definitions while retaining generic Decision Authority behavior.

**Stop conditions:** Stop with `DESIGN_CONFLICT` if any failing assertion identifies an approved non-B4 generic transition requirement.

- [ ] **Step 1: Write failing isolation contracts.**

```ts
expect(read('app/components/stage01-operational/Stage01EvaluationDecisionControls.vue'))
  .not.toContain('b4_acceptance_policy_transition')
expect(read('shared/schemas/opportunity-decision-authority.ts'))
  .not.toContain('transitionOpportunityDecisionPolicyInputSchema')
expect(read('server/features/stage01/stage01.repository.ts'))
  .not.toContain("transition_opportunity_decision_policy")
expect(activeProjectionBody).not.toContain('b4000000-0000-4000-8000-000000000010')
expect(read('scripts/stage01-b4-acceptance-fixture.mjs'))
  .toContain('ensureB4DecisionAuthorityConfiguration')
```

Also replace shared/server tests that currently prove the transition input, route delegation, or B4 scope mapping with assertions that generic assignment, generic Final Decision, capability-disabled `not_required`, and permission checks remain present.

- [ ] **Step 2: Run RED verification.**

Run: `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/shared/opportunity-decision-authority.spec.ts tests/unit/server/opportunity-decision-authority.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

Expected: FAIL because the current UI/shared/server sources contain `b4_acceptance_policy_transition`, the active A31 projection contains B4 UUID comparison, and existing tests still prove the transition contract.

- [ ] **Step 3: Record the failure cause without editing production code.**

Capture the failing test names and the source anchors they identify. Stop if a test finds an approved non-B4 generic Decision Policy transition requirement; return `DESIGN_CONFLICT` rather than creating generic semantics.

### Task 2: Remove the Acceptance-Only Application and API Surface

**Files:**
- Modify only if used by the actual call graph: `app/components/stage01-operational/Stage01EvaluationDecisionControls.vue`, `app/repositories/contracts.ts`, `app/repositories/http/http-stage01-repository.ts`, `shared/schemas/opportunity-decision-authority.ts`, `server/features/stage01/stage01.routes.ts`, `server/features/stage01/stage01.service.ts`, `server/features/stage01/stage01.repository.ts`, `server/features/stage01/stage01-errors.ts`
- Delete: `server/api/companies/[companyId]/opportunities/[opportunityId]/decision-cycles/[decisionCycleId]/policy-binding.post.ts`
- Test: files from Task 1

**Interfaces:**
- Consumes: the RED tests and existing `assignDecisionAuthority` / `recordFinalDecision` contracts.
- Produces: a production surface with no transition command while retaining generic authority assignment, Final Decision, capability, and RBAC contracts.

**Reason:** The B4 command is acceptance infrastructure behavior and must not remain reachable through a user-scoped production path.

**Minimum objective:** Remove only the traced transition symbols and endpoint; preserve all generic authority, Final Decision, capability, and RBAC commands.

**RED command:** `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/shared/opportunity-decision-authority.spec.ts tests/unit/server/opportunity-decision-authority.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

**GREEN command:** Run that command again after the transition-only removals; it must exit zero before the migration task begins.

**Regression:** `pnpm exec vitest run tests/unit/repositories/http-stage01-repository.spec.ts tests/unit/server/stage01.repository.spec.ts` protects the remaining repository contracts.

**Stop conditions:** Stop if call-graph tracing finds a caller outside the listed path or evidence of an approved generic transition use case.

- [ ] **Step 1: Trace the live call graph before edits.**

Run: `rg -n -C 2 'transitionDecisionPolicy|transitionOpportunityDecisionPolicyInputSchema|transition_opportunity_decision_policy|policy-binding' app server shared`

Expected: the trace connects the component, HTTP repository, API file, routes, service, server repository, shared schema, and database RPC. Stop if another generic caller exists outside this path.

- [ ] **Step 2: Remove only transition-specific symbols.**

Delete the UI computed state, request ID, button, alert copy, command function, repository method, Zod input schema, route/service/repository methods, API handler, and B4 scope-denied mapping only when they serve the traced transition path. Preserve `policyBinding.status` only if generic authority projection consumers still require it; remove `transitionEligible` if it has no generic meaning.

- [ ] **Step 3: Run GREEN verification.**

Run: `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/shared/opportunity-decision-authority.spec.ts tests/unit/server/opportunity-decision-authority.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

Expected: PASS; assignment and Final Decision contracts remain generic, while production application/shared/API sources expose no B4 transition command.

- [ ] **Step 4: Run repository boundary regression tests.**

Run: `pnpm exec vitest run tests/unit/repositories/http-stage01-repository.spec.ts tests/unit/server/stage01.repository.spec.ts`

Expected: PASS; Stage 01 HTTP and server repository behavior remains valid after removing the transition method.

### Task 3: Forward Database Correction

**Files:**
- Create: `supabase/migrations/20260907100000_isolate_b4_policy_acceptance_runtime.sql`
- Modify: `tests/unit/config/stage01-production-b4-isolation-contract.spec.ts`
- Modify: `tests/unit/config/opportunity-decision-company-capability.spec.ts`
- Preserve without modification: A25, A31, A40

**Interfaces:**
- Consumes: current definitions created by A25/A31 and their historical data shape.
- Produces: active database behavior without a public B4 transition RPC, B4-only helper execution, or B4-derived projection eligibility.

**Reason:** Applied migrations are immutable, so only a forward migration can remove their active B4 runtime effect.

**Minimum objective:** Create exactly one forward-only migration that neutralizes the public B4 transition and B4-derived projection behavior without changing historical business rows.

**RED command:** `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

**GREEN command:** `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts tests/unit/config/stage01-final-decision-history-guard-contract.spec.ts`

**Regression:** SHA-256 guards for A25/A31/A40 and the Final Decision history contract prevent migration drift and history weakening.

**Stop conditions:** Stop if the migration would alter historical rows, cannot preserve applied migration identity, or requires a permission broadening.

- [ ] **Step 1: Extend the RED migration contract.**

```ts
expect(forwardMigration).toContain('create or replace function public.get_opportunity_decision_authority_projection')
expect(forwardMigration).toContain("'transitionEligible', false")
expect(forwardMigration).not.toContain('b4000000-0000-4000-8000-000000000010')
expect(forwardMigration).not.toContain('b4_acceptance_policy_transition')
expect(forwardMigration).toContain('revoke all on function public.transition_opportunity_decision_policy')
```

The test must also assert that A25/A31/A40 file SHA-256 values equal their approved immutable values.

- [ ] **Step 2: Run RED verification.**

Run: `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

Expected: FAIL because the forward migration does not yet exist and A31 remains the active projection definition with B4 UUID behavior.

- [ ] **Step 3: Write the one forward migration.**

First inspect function dependencies in A25/A31 and the repository calls. Then write one transaction-safe migration that removes the authenticated generic transition entry point, removes B4-only helpers that have no remaining dependencies, and replaces the public projection with generic capability behavior whose `transitionEligible` value is always false if the compatibility field remains. Replace the historical transition metadata constraint with a future-neutral historical-row validation only when needed to retain existing `legacy_transition` rows. Do not insert, update, or delete business, cycle, policy, authority, audit, or canonical VQH records.

- [ ] **Step 4: Run GREEN migration-contract verification.**

Run: `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts tests/unit/config/stage01-final-decision-history-guard-contract.spec.ts`

Expected: PASS; new migration is the sole active correction, immutable migrations are unchanged, projection/capability behavior is generic, and Final Decision history guards remain covered.

- [ ] **Step 5: Review migration scope.**

Run: `git diff -- supabase/migrations/20260904050924_opportunity_decision_authority_slice1.sql supabase/migrations/20260904094243_opportunity_decision_authority_company_capability.sql supabase/migrations/20260905124508_restore_opportunity_decision_final_history_invariants.sql`

Expected: no output. Stop if any immutable migration differs or if the new migration mutates historical data.

### Task 4: Isolate B4 Policy Setup in Fixture Bootstrap

**Files:**
- Modify: `scripts/stage01-b4-acceptance-fixture.mjs`
- Modify: `tests/unit/config/stage01-b4-acceptance-contract.spec.ts`
- Test: `tests/unit/config/opportunity-decision-company-capability.spec.ts`

**Interfaces:**
- Consumes: B4 fixture constants, `ensureB4DecisionAuthorityConfiguration`, and acceptance bootstrap sequencing.
- Produces: a repeatable B4-only policy snapshot/capability preparation before B4 Decision Cycles are created.

**Reason:** B4 needs valid policy state for acceptance, but that state must be prepared outside normal runtime.

**Minimum objective:** The fixture alone provisions or reuses B4 capability and policy state before B4 cycle creation, using only B4-scoped service-role setup.

**RED command:** `pnpm exec vitest run tests/unit/config/stage01-b4-acceptance-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

**GREEN command:** Repeat the same command after fixture sequencing and idempotency are implemented; it must exit zero.

**Regression:** The fixture contract rejects runtime RPC use and verifies B4 tenant/company scoping and preparation order.

**Stop conditions:** Stop if the fixture needs a normal production transition command, writes canonical VQH history, or cannot rerun idempotently.

- [ ] **Step 1: Add a failing fixture-order and isolation assertion.**

```ts
expect(fixture.indexOf('await ensureB4DecisionAuthorityConfiguration(client, actors.decision.userId)'))
  .toBeLessThan(fixture.indexOf('await ensureRetainedProfiles('))
expect(fixture).toContain('tenant_id: B4_ACCEPTANCE_TENANT_ID')
expect(fixture).toContain('company_id: B4_ACCEPTANCE_COMPANY_ID')
expect(fixture).not.toContain('transition_opportunity_decision_policy')
```

- [ ] **Step 2: Run RED verification.**

Run: `pnpm exec vitest run tests/unit/config/stage01-b4-acceptance-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

Expected: FAIL if fixture preparation depends on the removed runtime transition or does not establish valid B4 policy state before retained profiles/cycles.

- [ ] **Step 3: Make the fixture own policy preparation.**

Ensure `ensureB4DecisionAuthorityConfiguration` creates or reuses the B4 capability and published B4 policy snapshot through fixture-scoped service-role operations before profiles create Decision Cycles. Preserve canonical VQH reads as read-only, B4-scoped writes, one active matching snapshot, and idempotent reruns. Do not call a normal application/API transition command from fixture code.

- [ ] **Step 4: Run GREEN fixture-contract verification.**

Run: `pnpm exec vitest run tests/unit/config/stage01-b4-acceptance-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts`

Expected: PASS; B4 policy preparation is acceptance-only, repeatable, and sequenced before B4 cycle creation.

### Task 5: Focused Regression Verification

**Files:**
- Test: `tests/unit/config/stage01-production-b4-isolation-contract.spec.ts`
- Test: `tests/unit/config/stage01-b4-acceptance-contract.spec.ts`
- Test: `tests/unit/config/opportunity-decision-company-capability.spec.ts`
- Test: `tests/unit/config/stage01-final-decision-history-guard-contract.spec.ts`
- Test: `tests/unit/config/stage01-security-permission-contract.spec.ts`
- Test: `tests/unit/server/opportunity-decision-authority.spec.ts`
- Test: `tests/unit/server/stage01.repository.spec.ts`
- Test: `tests/unit/repositories/http-stage01-repository.spec.ts`

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: local evidence that the isolation correction preserves generic contracts.

**Reason:** The correction crosses UI, API, migration, fixture, permissions, and historical protections, so each preserved boundary needs focused evidence.

**Minimum objective:** All focused local contracts, type checking, linting, and whitespace review pass without Cloud execution.

**RED command:** `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/config/stage01-b4-acceptance-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts tests/unit/config/stage01-final-decision-history-guard-contract.spec.ts tests/unit/config/stage01-security-permission-contract.spec.ts tests/unit/server/opportunity-decision-authority.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts`

**GREEN command:** Run the same focused suite, then `pnpm typecheck && pnpm lint`; each command exits zero.

**Regression:** This suite catches B4 production leakage, permission broadening, authority/history regression, fixture leakage, and stale UI/API references.

**Stop conditions:** Stop if any focused failure changes the approved security, historical, or generic Decision Authority contract; do not mask it by weakening assertions.

- [ ] **Step 1: Run focused GREEN suite.**

Run: `pnpm exec vitest run tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/config/stage01-b4-acceptance-contract.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts tests/unit/config/stage01-final-decision-history-guard-contract.spec.ts tests/unit/config/stage01-security-permission-contract.spec.ts tests/unit/server/opportunity-decision-authority.spec.ts tests/unit/server/stage01.repository.spec.ts tests/unit/repositories/http-stage01-repository.spec.ts`

Expected: PASS; isolation, capability, RBAC, history, server, HTTP, and fixture contracts are preserved.

- [ ] **Step 2: Run static application validation.**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS; removed UI/shared/server contract has no stale type or lint references.

- [ ] **Step 3: Run diff integrity review.**

Run: `git diff --check`

Expected: no output. Do not run Cloud DEV, Stage B, Stage C, Stage D, or repair the pgTAP `plan(103)` environment failure.

### Task 6: Local Corrective Checkpoint

**Files:**
- Review: all Amendment 60R-A files from Tasks 1–5
- Preserve: `AGENTS.md`, A25, A31, A40, Cloud state, and canonical VQH history

**Interfaces:**
- Consumes: passing focused local evidence and reviewed diff.
- Produces: one local corrective checkpoint for task-specific review and separately authorized Cloud validation.

**Reason:** The correction needs a narrowly reviewable local checkpoint before any separately authorized Cloud validation.

**Minimum objective:** Stage only the reviewed Amendment 60R-A files and create one local commit after fresh scope, immutable, and validation evidence.

**RED command:** `git diff --name-only 21aea027617492934e28ff9d31470a0e4c04f414..HEAD && git status --short`

**GREEN command:** `git diff --cached --check && git status --short && git rev-parse HEAD && git show --stat --oneline HEAD`

**Regression:** The staged-path review rejects immutable migration drift, AGENTS.md changes, local state, secrets, unrelated files, and canonical VQH mutation.

**Stop conditions:** Stop if the staged diff contains any excluded path, secret/local state, migration drift, permission broadening, or unreviewed source change.

- [ ] **Step 1: Perform immutable and scope guards.**

Run: `git diff --name-only 21aea027617492934e28ff9d31470a0e4c04f414..HEAD && git status --short`

Expected: review identifies only Amendment 60R-A files; no AGENTS.md, secrets, local state, unrelated files, permission broadening, authority backfill, workflow snapshot rebind, or canonical VQH mutation.


- [ ] **Step 2: Stage and verify the correction.**

Run: `git add -- tests/unit/config/stage01-production-b4-isolation-contract.spec.ts tests/unit/shared/opportunity-decision-authority.spec.ts tests/unit/server/opportunity-decision-authority.spec.ts tests/unit/config/opportunity-decision-company-capability.spec.ts app/components/stage01-operational/Stage01EvaluationDecisionControls.vue app/repositories/contracts.ts app/repositories/http/http-stage01-repository.ts shared/schemas/opportunity-decision-authority.ts server/features/stage01/stage01.routes.ts server/features/stage01/stage01.service.ts server/features/stage01/stage01.repository.ts server/features/stage01/stage01-errors.ts server/api/companies/[companyId]/opportunities/[opportunityId]/decision-cycles/[decisionCycleId]/policy-binding.post.ts supabase/migrations/20260907100000_isolate_b4_policy_acceptance_runtime.sql scripts/stage01-b4-acceptance-fixture.mjs tests/unit/config/stage01-b4-acceptance-contract.spec.ts && git diff --cached --check && git diff --cached --stat`

Expected: staged diff is whitespace-clean and contains exactly one new forward migration after A40.

- [ ] **Step 3: Create one local corrective commit.**

Run: `git commit -m "fix(stage01): isolate B4 policy acceptance from runtime"`

Expected: one local commit and no Cloud operation.

- [ ] **Step 4: Verify final local state.**

Run: `git status --short && git rev-parse HEAD && git show --stat --oneline HEAD`

Expected: clean working tree and a local correction ready for separately authorized Cloud migration and acceptance validation.
