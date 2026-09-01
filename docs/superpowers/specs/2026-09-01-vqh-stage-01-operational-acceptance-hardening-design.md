# VQH Stage 01 Operational Acceptance & Hardening — Design Specification

## Status

- Product/design status: **APPROVED by Sơn in chat on 2026-09-01**
- Approved approach: **A — Acceptance-first Hardening**
- Phase: **B4 — Stage 01 Operational Acceptance & Hardening**
- Source anchor: `main@8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`
- B3 merge: PR #11 / `8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`

## Goal

B4 closes VQH Stage 01 as a real operational product.

The objective is not to add business features. The objective is to prove, against the real Cloud DEV backend and the merged B3 UI, that Stage 01 is safe and reliable enough for a controlled VQH pilot.

B4 answers one question:

> **Can VQH operate Stage 01 with real business data without an unresolved correctness, authorization, concurrency, history-integrity, usability, or practical performance defect?**

The final B4 output is a deterministic readiness verdict:

```text
READY_FOR_VQH_PILOT
or
NOT_READY_FOR_VQH_PILOT
```

A mergeable B4 implementation must end with `READY_FOR_VQH_PILOT`.

---

## Core principle

B4 is **acceptance-first**.

The order is:

```text
Measure / reproduce
        ↓
Classify defect or limitation
        ↓
Apply the smallest approved correction
        ↓
Re-run the affected scenario
        ↓
Re-run the Stage 01 acceptance gate
```

Do not perform speculative refactoring before a failing acceptance scenario or measured performance problem exists.

B4 may harden existing B3 behavior. It must not redesign Stage 01 business semantics.

---

## Current baseline

At the B4 source anchor:

- Stage 01 backend/workflow engine is implemented.
- B1 configuration control plane is implemented.
- B1.5 reusable taxonomy storage boundary is implemented.
- B2 Business Configuration Admin UI is implemented.
- B3 Opportunity-centric Operational UI is merged.
- B3 deterministic browser suite passed.
- B3 Cloud DEV security migration for narrow Opportunity create options is merged.
- Existing Cloud DEV Stage 01 database, concurrency, integrity-race, RLS, and advisor runners already exist.

B4 reuses these assets instead of creating a parallel test platform.

Existing relevant commands include:

```text
pnpm db:dev:stage01:test
pnpm db:dev:stage01:concurrency
pnpm db:dev:stage01:integrity-races
pnpm db:dev:rls-smoke
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
pnpm verify:app
pnpm test:e2e
```

---

## Product boundary

B4 covers only the already-approved Stage 01 product:

```text
Opportunity
  → 01.1 Intake
  → 01.2 Evaluation
  → Recommendation / Clarification / Final Decision
  → Stage 01 completion
  → optional Reactivation
```

B4 does not implement conversion to Project or Stage 02.

A `proceed` decision ends the B4 journey at a correctly completed Stage 01 state. What happens after that belongs to a later phase.

---

# 1. Acceptance architecture

B4 uses four complementary acceptance layers.

## Layer A — Existing deterministic application regression

Keep the existing intercepted/local Playwright and unit suite as the fast regression layer.

Purpose:

- deterministic UI state coverage;
- exact request-body assertions;
- responsive/accessibility checks;
- failure-state reproduction without Cloud DEV variability.

This layer remains required but is not sufficient to declare Stage 01 ready.

## Layer B — Cloud DEV database/runtime acceptance

Use the existing guarded Cloud DEV runner and database fixtures for:

- RLS and company isolation;
- public RPC authorization;
- immutable history;
- exact version conflicts;
- concurrency races;
- integrity races;
- bound workflow-definition behavior;
- database-level business constraints.

All Cloud DEV setup must use fixed/isolated fixtures and explicit cleanup.

## Layer C — Real full-stack operational acceptance

Add a small full-stack acceptance suite that does **not** intercept Stage 01 business API routes.

Required path:

```text
Playwright browser
  → real Taskovia login
  → local Nuxt/Nitro server
  → bearer authentication
  → API route
  → service
  → repository
  → Supabase user-scoped client
  → Cloud DEV RLS/RPC/tables
```

This is the B4 proof that the layers tested separately in B3 actually operate together.

### Real-auth fixture rule

The B4 harness may use the existing server-only Cloud DEV service-role credential **only in fixture setup and cleanup** to provision isolated test Auth users.

It must never use service-role credentials for the business requests being accepted.

The accepted path must log in as a normal test actor and use the resulting real JWT through the normal application flow.

Preferred lifecycle:

```text
fixture setup process
  → create isolated Cloud DEV auth actor
  → set known test-only password
  → create company membership / role assignment / employee fixture
  → browser signs in through /login
  → business flow uses normal user JWT
  → assertions
  → fixture cleanup in finally
```

The fixture helper must be clearly test-only and unreachable from production routes.

### No route interception

The full-stack Cloud DEV acceptance project must not intercept or fulfill these route families:

- `/api/companies/*/opportunities*`
- `/api/companies/*/workflow*`
- `/api/companies/*/stage-01*`
- `/api/companies/*/employees*` when used by Stage 01 employee pickers.

Network observation is allowed; request replacement is not.

## Layer D — Performance, security, and readiness evidence

B4 records explicit evidence for:

- Stage01OperationalDetail performance;
- Supabase advisor state;
- security review;
- browser accessibility/responsive behavior;
- known limitations.

This produces the final readiness report.

---

# 2. Cloud DEV fixture isolation

B4 may mutate **Supabase Cloud DEV only** for acceptance fixture setup and cleanup.

Production mutation is forbidden.

## Fixture identity

Every B4 run uses a unique marker such as:

```text
b4-stage01-<timestamp-or-random-id>
```

All created users, Opportunities, Contacts, and fixture descriptions must be attributable to that marker where the schema allows it.

## Existing business data

The acceptance suite must not edit, invalidate, restore, reassign, or delete existing VQH operational records.

Tests create their own data.

## Cleanup

Cleanup is mandatory and must run in `finally` semantics.

A failed assertion must not skip cleanup.

The harness must support pre-cleaning stale B4 fixtures left by a previously interrupted run.

Cleanup must target only records owned by the current/stale B4 fixture marker; broad table truncation/reset is forbidden.

## Cloud DEV guards

Reuse the canonical Cloud DEV project assertion. Do not accept arbitrary Supabase refs through a CLI argument for a mutating acceptance command.

Any target mismatch is a hard stop.

---

# 3. Required business acceptance scenarios

B4 groups checks by complete business scenarios rather than multiplying low-level UI tests.

The canonical scenario set contains ten scenarios.

## B4-S01 — Happy path: Proceed

Prove the normal positive journey:

```text
Create Opportunity
→ complete required Intake data
→ assign Intake Owner
→ Start 01.1 if required by runtime state
→ Complete 01.1
→ Start 01.2
→ evaluate required criteria
→ submit Recommendation
→ record Final Decision = proceed
→ Complete 01.2
```

Assertions:

- each command uses current canonical versions;
- gates transition from incomplete to satisfied at the correct points;
- final decision is immutable;
- Stage 01 ends completed and valid;
- browser reload preserves the same canonical result.

This scenario must run through the real full-stack Cloud DEV browser path.

## B4-S02 — Happy path: Not proceeding

Complete an Opportunity with:

```text
Recommendation
→ Final Decision = not_proceeding
→ Complete 01.2
```

Verify the Opportunity remains inspectable and historical decision data is read-only.

## B4-S03 — Clarification loop

Prove:

```text
Evaluation
→ Recommendation v1
→ Return for clarification
→ additional/corrected evidence
→ Recommendation v2
→ Final Decision
```

Verify Recommendation v1 and clarification history remain visible and immutable.

## B4-S04 — Blocking blocker lifecycle

Raise a blocking blocker on the relevant execution.

Verify:

- completion is prevented while it is open;
- resolving it appends resolution history;
- canonical reload changes gate/runtime eligibility correctly;
- resolved blocker remains visible.

## B4-S05 — Duplicate concern lifecycle

Raise a duplicate concern during Intake.

Verify Intake cannot complete while the business gate is unsatisfied, then resolve the concern and successfully continue.

No destructive Opportunity merge is introduced.

## B4-S06 — Revalidation after Intake-dependent change

Complete Intake, then perform an approved change that invalidates a dependency and requires revalidation.

Verify:

- stale downstream state is not treated as valid;
- the UI shows the revalidation requirement;
- explicit revalidation with reason/evidence restores eligibility only when backend rules permit it.

## B4-S07 — Optimistic concurrency / stale writer

Use the existing Cloud DEV concurrency runner plus one application-level stale-version scenario.

Prove:

- one competing write succeeds;
- stale write receives `VERSION_CONFLICT`;
- client does not overwrite or auto-retry;
- relevant local form input is preserved until explicit reload/discard;
- a retry after canonical reload uses the new version.

## B4-S08 — Completed Stage 01 reactivation

Complete Stage 01, then reactivate it.

Verify:

- exact Opportunity + execution + cycle versions are required;
- a new execution/cycle is created;
- cycle 1 remains unchanged;
- cycle 2 becomes canonical current state;
- browser history shows both cycles in order.

This scenario must exercise the real Cloud DEV runtime, not only an intercepted fixture.

## B4-S09 — Permission and isolation matrix

Use at least these actor shapes:

- reader;
- operational editor without decision authority;
- decision-capable actor;
- actor from another company/non-member.

Verify:

- route visibility follows permissions;
- server commands reject missing permissions even when called directly;
- bound actor capabilities do not replace permission checks;
- forged Opportunity/company/node identifiers do not cross company boundaries;
- `employee.read_all` does not expose private employee details;
- narrow Opportunity create-options RPC does not expose raw workflow definition/draft data.

## B4-S10 — Bound-snapshot historical stability

Create Opportunity A under published snapshot N.

Publish or stage an acceptance fixture snapshot N+1 using the already-approved configuration mechanism only if the fixture can be safely isolated; otherwise reproduce this at the database acceptance layer with isolated definition rows.

Verify:

- Opportunity A continues rendering snapshot N labels/criteria;
- a newly created Opportunity B binds to N+1;
- A is not reinterpreted after publication;
- no operational UI reads `workflow_taxonomy_values` directly.

If exercising a real config publish would affect shared VQH Cloud DEV configuration, do **not** mutate the shared configuration. Use an isolated company/fixture boundary or the database acceptance layer instead.

---

# 4. Scenario execution allocation

Not every scenario needs a slow full browser run.

Minimum allocation:

| Scenario | Deterministic UI | Cloud DEV DB/runtime | Full-stack browser |
| --- | --- | --- | --- |
| S01 Proceed | yes | yes | **required** |
| S02 Not proceeding | yes | yes | optional |
| S03 Clarification | yes | yes | optional |
| S04 Blocker | yes | yes | one browser assertion |
| S05 Duplicate | yes | yes | optional |
| S06 Revalidation | yes | yes | one browser assertion |
| S07 Concurrency | yes | **required** | one stale UI flow |
| S08 Reactivation | yes | **required** | **required** |
| S09 Permission/isolation | yes | **required** | selected actors |
| S10 Bound snapshot | yes | **required** | optional |

The acceptance suite should be small enough to run intentionally before a Stage 01 release, not become the normal fast E2E suite.

---

# 5. Reliability hardening targets

B4 explicitly tests these reliability edges.

## Double submit

A second command while one is in flight must not produce a second business mutation.

UI feedback may be disabled/loading or a safe client validation rejection, but the backend must see only one intended command.

## Command succeeded, canonical reload failed

This is a distinct state from "command failed".

B4 must test it.

If current UX implies the command itself failed after the server accepted it, fix the UI so the user is told that the update may have succeeded and canonical data must be reloaded before another mutation.

Do not automatically repeat the command.

## Stale canonical state

After any successful command the next mutation must use the versions returned by the subsequent canonical GET, not versions retained from the previous render.

## Local form retention

For retriable network/5xx and `VERSION_CONFLICT` paths, preserve relevant user-entered data until the user explicitly reloads/discards where safe.

## Reload / navigation races

A route change or company switch during an in-flight mutation must not cause a false success or cross-company state render.

Reuse existing shell/unsaved-change mechanisms where applicable; do not create a second global navigation guard.

---

# 6. Performance acceptance

B4 performance work is measurement-driven.

The primary target is the merged `Stage01OperationalDetail` GET because it aggregates Opportunity, workflow runtime, Contacts/Methods, decision cycles, evaluations, recommendations, clarifications, and bound configuration.

## Synthetic profiles

Profile at least:

```text
Profile P1 — normal
1 decision cycle
5 criteria
2 contacts
small history

Profile P2 — growing
5 decision cycles
10 contacts
multiple criterion revisions

Profile P3 — stress/practical upper fixture
20 decision cycles
20 contacts
5 criteria with repeated revisions
recommendation/clarification history
```

These are acceptance fixtures, not claimed production limits.

## Metrics

Record:

- full Stage 01 GET response size;
- server-to-Supabase request count where test instrumentation can measure it;
- warm end-to-end API latency from local Nitro to Cloud DEV;
- advisor warnings relevant to the touched read path.

## Practical envelope

For P3, B4 targets:

- **server-to-Supabase requests:** `<= 25` for one Stage01OperationalDetail load;
- **response payload:** `<= 2 MiB` uncompressed JSON;
- **warm Cloud DEV API p95:** `<= 2.0 seconds` across at least 20 measured reads after warm-up;
- **single measured request hard ceiling:** `<= 3.0 seconds` unless Cloud DEV is demonstrably degraded.

Latency is environment-sensitive. If latency alone fails while request count and payload are within limits, rerun once after confirming Cloud DEV health. A persistent failure blocks the readiness verdict but does not authorize speculative architecture changes.

## Optimization rule

If the baseline already meets the envelope, do not refactor it.

If it fails, optimize the smallest proven bottleneck.

Preferred fixes include batching existing reads, e.g. fetching resources for many cycle/contact IDs in one query rather than issuing per-item network calls.

A DB migration/index/schema change is **not automatically authorized** by B4. If the measured solution requires a migration, stop and request a focused amendment.

Do not generalize Stage 01 runtime tables as a performance fix.

---

# 7. Security acceptance

B4 requires both static and dynamic security evidence.

## Dynamic checks

Verify:

- company/tenant isolation;
- missing permission rejection;
- direct public RPC authorization;
- narrow create-options projection;
- no `workflow_definition_drafts` leakage;
- no raw published definition leakage to Opportunity creators;
- `employee.read_all` remains directory-only and does not imply private details;
- history-mutating attempts fail;
- cross-company forged resource IDs fail;
- unauthenticated/expired-token requests fail safely.

## Static security scan

Run the repository-approved security diff scan on the final B4 implementation range.

Exit condition:

```text
0 unresolved critical findings
0 unresolved high findings
```

Medium/low findings require explicit disposition in the readiness report.

Security scan failure/finalization failure blocks completion even if application tests pass.

---

# 8. Accessibility and responsive acceptance

B4 does not redesign the UI.

Test the existing Stage 01 workspace under realistic dense history.

Minimum viewport checks:

- mobile approximately `390 × 844`;
- desktop approximately `1440 × 900`.

Acceptance:

- no page-level horizontal overflow;
- dialogs/forms remain operable;
- keyboard can reach critical actions;
- form controls have programmatic labels;
- error/success status is exposed accessibly;
- dense decision/history content remains readable;
- no critical axe violations in Stage 01 acceptance pages.

Only fix concrete acceptance defects.

---

# 9. Readiness report

B4 creates a canonical report:

```text
docs/acceptance/vqh-stage-01-operational-readiness.md
```

The report is evidence, not marketing copy.

Required sections:

```text
Source SHA / acceptance SHA
Cloud DEV target confirmation
Business scenario matrix S01–S10
Permissions / company isolation
Concurrency / integrity races
History immutability
Bound-snapshot stability
Security scan summary
Performance profiles P1–P3
Responsive / accessibility
Known limitations
Unresolved risks
Final verdict
```

Final verdict values:

```text
READY_FOR_VQH_PILOT
NOT_READY_FOR_VQH_PILOT
```

B4 may only report `READY_FOR_VQH_PILOT` when all mandatory exit conditions pass.

---

# 10. B4 exit conditions

Stage 01 is considered complete when all of the following are true:

1. S01–S10 mandatory acceptance checks pass at their required layers.
2. Real Cloud DEV full-stack S01 passes.
3. Real Cloud DEV reactivation S08 passes.
4. Cloud DEV concurrency and integrity-race suites pass.
5. No unresolved correctness or optimistic-concurrency defect remains.
6. No unresolved high/critical security finding remains.
7. Bound-snapshot stability is proven.
8. Performance is inside the practical envelope or an approved correction brings it inside.
9. Mobile/desktop operational workspace passes the acceptance checks.
10. `pnpm verify:app` passes.
11. Full deterministic `pnpm test:e2e` passes.
12. B4 acceptance suite passes from a clean checkout.
13. Cleanup proves no B4 fixture residue remains in Cloud DEV.
14. Readiness report says `READY_FOR_VQH_PILOT` with no contradictory unresolved blocker.
15. Independent GPT immutable-diff review returns `MERGE` or an explicitly accepted equivalent non-blocking verdict.

---

# 11. Allowed corrections inside B4

B4 may make targeted corrections when directly justified by a failing acceptance check or measured profile.

Examples:

- distinguish command-success/reload-failure state;
- prevent duplicate submit;
- preserve local form values on a verified error path;
- correct permission/capability presentation that contradicts server contract;
- batch Stage01OperationalDetail reads to remove a measured N+1 pattern;
- fix mobile overflow or inaccessible control;
- add missing deterministic regression coverage;
- harden test fixture cleanup.

Every correction requires a regression test that fails before the fix or a captured performance baseline that proves the issue.

---

# 12. Stop conditions / separate-task boundary

B4 must stop and request a focused amendment/task if acceptance reveals that a correct fix requires any of the following:

- changing Stage 01 business semantics;
- adding Stage 02 behavior;
- converting `proceed` into a Project;
- generalizing/renaming `stage01_*` runtime tables;
- replacing the current Workflow Engine model;
- changing completion-baseline ownership;
- adding a new business permission or changing the meaning of an existing permission beyond a clear implementation mismatch;
- a database migration/index/schema change;
- production data mutation;
- production deployment;
- a new external service/subsystem;
- using service-role credentials in normal business requests;
- weakening RLS/security boundaries to make acceptance easier.

Partial B4 evidence should be preserved when a stop condition is reached.

---

# 13. Explicit non-goals

B4 does not include:

- Stage 02;
- Project creation/conversion;
- a generic workflow builder/renderer;
- Decision Runtime table generalization;
- completion-baseline refactor;
- new notification system;
- new audit/event subsystem;
- file uploads;
- analytics/dashboard work;
- broad visual redesign;
- production deployment.

---

# 14. Delivery model

B4 should follow the established repository workflow:

- one implementation task;
- one implementation branch;
- no worktree;
- TDD / evidence-first corrections;
- Cloud DEV mutation only where the acceptance fixture requires it;
- production mutation forbidden;
- focused commits;
- fresh final verification;
- push branch after completion;
- no automatic merge;
- independent GPT review on immutable SHA range;
- Sơn makes the final merge decision.

---

## Design decision summary

B4 chooses **Acceptance-first Hardening** because Stage 01 already has substantial backend and UI coverage. The highest-value next action is to prove the merged product under real integration conditions, then fix only defects that acceptance or measurement demonstrates.

Stage 01 is not marked DONE merely because B3 is merged.

Stage 01 becomes DONE when B4 produces a reviewed `READY_FOR_VQH_PILOT` result.