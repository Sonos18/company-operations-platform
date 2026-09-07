# B4 Policy Acceptance Isolation Design

```yaml
status: ACTIVE_DESIGN
documented_on: 2026-09-07
approach: Acceptance Isolation
scope_version: B4-AMENDMENT-60R-A-DESIGN-V1
```

## 1. Status

This design defines how B4 acceptance policy preparation is isolated from Taskovia production runtime. It does not itself request source, database, Cloud DEV, Production, or deployment changes; those operations require explicit current task instructions.

## 2. Context

Task 3 introduced explicit Decision Authority, Decision Policy binding, company capability, RBAC, Final Decision history protection, and B4 acceptance coverage. The B4 acceptance company needs a valid Decision Policy state to exercise its real browser scenarios. That acceptance setup was partly exposed through generic application, API, shared-contract, and database-runtime surfaces.

## 3. Problem Statement

Production runtime currently contains B4-specific transition behavior, including `b4_acceptance_policy_transition`, B4 tenant/company checks, B4-only projection eligibility, and a generic public RPC that delegates to B4-specific policy transition logic. A normal Taskovia runtime must not know that the B4 acceptance company exists.

## 4. Approved Architecture

```text
Taskovia Production Runtime
├─ Generic Decision Authority
├─ Generic Decision Policy binding on valid cycle creation
├─ Company Decision Authority capability
├─ Explicit RBAC
└─ Final Decision

B4 Acceptance Infrastructure
├─ B4 tenant/company/actors
├─ B4 Decision Policy preparation
├─ B4 fixture/bootstrap
└─ B4 acceptance assertions
```

The boundary is Acceptance Isolation. Production code remains generic; B4 policy preparation is performed only by acceptance bootstrap infrastructure.

## 5. Production / Acceptance Boundary

Production behavior must not branch on the B4 tenant, B4 company, B4 actor identities, `B4-OPERATOR`, `B4-DB-OPERATOR`, `B4-DECISION`, `B4-READER`, or `b4_acceptance_policy_transition`. Those values are allowed in acceptance tests, acceptance fixtures, acceptance bootstrap/harness code, test-only contracts, and immutable historical migration source.

Historical text in A25, A31, and A40 is not a resulting-runtime violation. The forward correction must remove its active effect without modifying those applied migration files.

## 6. Decision Policy Transition Decision

There is no approved requirement for a generic user-facing Decision Policy transition operation. The B4 transition surface is acceptance leakage and must not be generalized into a company feature. A later executor must stop with `DESIGN_CONFLICT` if source evidence reveals an approved non-B4 requirement for that operation.

Decision Authority assignment and Final Decision remain generic production commands. A capability-enabled company with a valid policy binds that policy when a Decision Cycle is created; a company without the capability remains not required and retains its ordinary Final Decision permission behavior.

## 7. Database Correction Strategy

The correction uses exactly one forward migration after A40. The migration removes or revokes the active generic public transition RPC and B4-only helper path, replaces the active Decision Authority projection so it does not derive behavior from B4 tenant/company UUIDs, and removes future-runtime dependence on `b4_acceptance_policy_transition`.

The migration must validate the actual current definitions and dependencies before dropping or replacing functions. If the old transition metadata constraint must continue to validate historical events, it must be generalized for historical metadata without creating a new production transition command.

## 8. Historical Data Preservation

The correction must preserve historical Decision Policy events, Decision Cycles, Final Decision history, audits, authority assignments, and policy snapshot source pointers. It must not backfill authority, rewrite Decision Cycles, rebind canonical VQH workflow snapshots, or mutate canonical VQH business history.

## 9. Decision Authority Invariants

Decision Authority remains explicit per Decision Cycle. New cycles begin unresolved. Authority is never inferred from company_admin, title, Evaluation owner, created_by, or Workflow Runtime assignment. Unresolved authority blocks Final Decision only for a company with `opportunity.decision_authority` enabled. S08 reactivation creates a new unresolved cycle without authority carry-forward.

Permissions remain `opportunity.decision_authority.assign` and `opportunity.decision.record`. Eligibility remains same-company, active-membership, account-backed active employee with effective `opportunity.decision.record`. Capability remains `public.company_opportunity_decision_capabilities` with key `opportunity.decision_authority` and must not synthesize RBAC.

## 10. B4 Fixture Responsibilities

`scripts/stage01-b4-acceptance-fixture.mjs` owns B4 tenant/company/actor provisioning and B4 Decision Policy preparation. It may use the service role only for fixture bootstrap, fixture maintenance, and acceptance-state preparation. It must remain deterministic, idempotent, B4-scoped, and read-only toward canonical VQH history.

The business command path remains `/login` to local Nuxt/Nitro, bearer JWT, API route, service, repository, and user-scoped Supabase Cloud DEV. Fixture setup must not substitute for browser-issued business commands.

## 11. API / Runtime Surface Consequences

The generic Stage 01 UI, HTTP repository, shared schema, API route, service, server repository, error mapping, and public database RPC must not expose the B4-only transition. The active projection must not expose B4-derived transition eligibility. Generic authority assignment, Final Decision, capability evaluation, and policy binding remain available through their existing generic paths.

## 12. Security / RBAC Constraints

The correction does not broaden permissions, add a B4 exception, or make capability imply authorization. Public RPC privileges must expose only generic supported commands. B4 fixture service-role access stays outside normal runtime and browser acceptance uses normal user-scoped authorization.

## 13. Testing Strategy

The implementation begins with focused RED contract tests for production/acceptance isolation, shared/API removal, active projection behavior, and fixture-only preparation. GREEN verification covers Decision Authority, company capability, RBAC, Final Decision history, Stage 01 server/repository, HTTP repository, B4 fixture and acceptance contracts, migration contract, and a production B4 hard-code guard. Cloud execution is excluded until a separate authorization.

## 14. Migration Rollout

The future migration is forward-only and runs after A40. Before Cloud application, the executor verifies A25/A31/A40 SHA-256 values, reviews the generated migration diff, and confirms it neither changes canonical VQH history nor writes backfilled authority/policy state. Cloud DEV application and Stage B/C/D acceptance require separate authorization.

## 15. Explicit Non-Goals

Amendment 60R does not repair the pgTAP `plan(103)` environment failure; rerun Stage B, Stage C, or Stage D; complete Task 3; deploy production; mutate a production database; redesign Decision Policy globally; or rename the transitional Stage 01 physical schema.

## 16. Stop Conditions

Stop and return `DESIGN_CONFLICT` if an approved non-B4 business contract requires a generic Decision Policy transition. Stop and return `BLOCKED` if the forward migration cannot remove active B4 behavior while preserving historical data, if A25/A31/A40 hashes drift, if a required permission/security contract would change, or if the B4 fixture cannot prepare its state inside the acceptance boundary.

## 17. Acceptance Criteria

- **DES-60R-01:** No active generic production behavior branches on B4 tenant, company, or actor identity.
- **DES-60R-02:** `b4_acceptance_policy_transition` is absent from active generic application, shared, and API contracts.
- **DES-60R-03:** B4 policy preparation exists only in acceptance/bootstrap infrastructure.
- **DES-60R-04:** A25, A31, and A40 remain immutable.
- **DES-60R-05:** One forward migration removes or replaces active B4-specific database runtime behavior.
- **DES-60R-06:** Historical decision, policy, and audit data remains intact.
- **DES-60R-07:** Generic Decision Authority, capability, RBAC, and Final Decision contracts remain unchanged.
- **DES-60R-08:** No generic cross-company policy-cloning or transition feature is added.
- **DES-60R-09:** Canonical VQH history remains unchanged.
- **DES-60R-10:** B4 real-browser acceptance business commands remain user-scoped.

## 18. Source Anchors

- `app/components/stage01-operational/Stage01EvaluationDecisionControls.vue`: `canTransitionDecisionPolicy` and `transitionDecisionPolicy` expose the B4 transition in the UI.
- `app/repositories/http/http-stage01-repository.ts`: `transitionDecisionPolicy` maps the UI contract to the policy-binding endpoint.
- `shared/schemas/opportunity-decision-authority.ts`: `transitionOpportunityDecisionPolicyInputSchema` fixes the B4 transition literal.
- `server/features/stage01/stage01.routes.ts`, `stage01.service.ts`, and `stage01.repository.ts`: route, service, and RPC delegation path.
- `server/features/stage01/stage01-errors.ts`: B4-specific scope-denied error mapping.
- `supabase/migrations/20260904050924_opportunity_decision_authority_slice1.sql`: historical creation of B4 transition helpers, public wrapper, metadata constraint, and projection behavior.
- `supabase/migrations/20260904094243_opportunity_decision_authority_company_capability.sql`: active projection replacement containing B4 transition eligibility.
- `scripts/stage01-b4-acceptance-fixture.mjs`: isolated B4 bootstrap and policy preparation boundary.
