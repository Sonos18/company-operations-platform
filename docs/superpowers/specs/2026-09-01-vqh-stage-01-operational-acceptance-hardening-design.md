# VQH Stage 01 Operational Acceptance & Hardening — Design Specification

## Status

- Product/design status: **APPROVED by Sơn in chat on 2026-09-01**
- Approved approach: **A — Acceptance-first Hardening**
- Phase: **B4 — Stage 01 Operational Acceptance & Hardening**
- Source anchor: `main@8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`
- B3 merge: PR #11 / `8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`

## Goal

B4 closes VQH Stage 01 as a real operational product.

The objective is not to add business features. It is to prove that the merged Stage 01 backend, configuration layer, operational UI, permission model, concurrency model, immutable history, and practical performance are safe enough for a controlled VQH pilot.

Final readiness verdict:

```text
READY_FOR_VQH_PILOT
or
NOT_READY_FOR_VQH_PILOT
```

A mergeable B4 result must be `READY_FOR_VQH_PILOT`.

---

## Core principle

B4 is **acceptance-first**:

```text
Measure / reproduce
→ classify
→ smallest correction
→ regression test
→ rerun acceptance gate
```

Do not refactor speculatively. B4 may harden merged behavior, but it must not redesign Stage 01 business semantics.

---

## Baseline

At the B4 source anchor:

- Stage 01 backend/workflow engine is implemented.
- B1 configuration control plane is implemented.
- B1.5 taxonomy storage boundary is implemented.
- B2 Business Configuration Admin UI is implemented.
- B3 Opportunity-centric Operational UI is merged.
- B3 deterministic unit/E2E verification passed.
- B3 narrow Opportunity create-options security RPC is merged.
- Guarded Cloud DEV database, RLS, concurrency, integrity-race, and advisor runners already exist.

Relevant existing commands include:

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

B4 reuses these assets instead of creating a parallel platform.

---

# 1. Product boundary

B4 covers only:

```text
Opportunity
→ 01.1 Intake
→ 01.2 Evaluation
→ Recommendation / Clarification / Final Decision
→ Stage 01 completion
→ optional Reactivation
```

A `proceed` decision still ends at completed Stage 01.

B4 does **not** create a Project or implement Stage 02.

---

# 2. Acceptance architecture

B4 uses four complementary layers.

## Layer A — Deterministic application regression

Keep the existing local/intercepted unit and Playwright coverage for:

- exact frontend permission behavior;
- exact request bodies and version ownership;
- deterministic failure states;
- responsive/accessibility checks;
- regression reproduction.

This remains required but is not sufficient for readiness.

## Layer B — Cloud DEV database/runtime acceptance

Reuse and extend the guarded Cloud DEV runners for:

- RLS/company isolation;
- RPC authorization;
- immutable history;
- exact version conflict;
- concurrency and integrity races;
- bound workflow-definition behavior;
- DB-level business constraints.

## Layer C — Real full-stack Cloud DEV acceptance

Add a small Playwright acceptance project with **no Stage 01 business-route interception**.

Required path:

```text
Playwright browser
→ real /login
→ local Nuxt/Nitro
→ bearer authentication
→ API route
→ service
→ repository
→ user-scoped Supabase client
→ Cloud DEV RLS / RPC / tables
```

The following route families must not be replaced/fulfilled by Playwright in this project:

- `/api/companies/*/opportunities*`
- `/api/companies/*/workflow*`
- `/api/companies/*/stage-01*`
- `/api/companies/*/employees*` when Stage 01 uses the employee picker.

Network observation is allowed; request replacement is not.

## Layer D — Readiness evidence

Collect:

- performance profile;
- Supabase advisor results;
- dynamic security evidence;
- final static security diff scan;
- accessibility/responsive evidence;
- known limitations and risks.

---

# 3. Cloud DEV acceptance fixture boundary

## Canonical VQH business company must not receive test Opportunities

Real full-stack B4 acceptance must **not** create acceptance Opportunities, Contacts, decision cycles, assignments, or blockers inside the canonical VQH business company.

Reason: Stage 01 deliberately preserves immutable history, so destructive cleanup is neither possible nor desirable.

## Dedicated acceptance tenant/company

B4 uses a clearly named, test-only Cloud DEV acceptance boundary, conceptually:

```text
tenant:  taskovia-b4-acceptance
company: VQH_STAGE01_ACCEPTANCE
```

Exact stable IDs/codes are implementation details, but they must be deterministic and unmistakably test-only.

The boundary exists only in the approved Cloud DEV project and must never be bootstrapped in production.

## Idempotent fixture bootstrap

A guarded test helper may provision/update this Cloud DEV acceptance boundary using the existing server-only Cloud DEV service-role credential or the already-approved guarded Management API mechanism.

Service role is allowed only for **fixture bootstrap/maintenance**, never for accepted business requests.

The fixture boundary may contain:

- test-only Auth users;
- company memberships;
- test-only roles/assignments required for the permission matrix;
- employee directory fixtures;
- published `vqh.stage01` definition copied from the current canonical VQH published definition;
- immutable acceptance Opportunities/history.

The bootstrap must be idempotent and guarded by the canonical Cloud DEV project assertion.

## Real accepted requests use normal JWTs

Test actors sign in through the normal application login flow with real Cloud DEV Auth credentials.

Business requests must use the actor JWT and the existing user-scoped database client.

No acceptance assertion counts if the business request uses service-role authorization.

## Retained history is intentional

Because Stage 01 and RBAC/audit history are append-only, B4 does not promise destructive cleanup of immutable acceptance history.

Instead, completion requires:

- zero active fixture data inside the canonical VQH business company;
- no production mutation;
- no unmarked test data;
- current run records identifiable by a unique run marker;
- temporary credentials/sessions cleaned or disabled where appropriate;
- any retained acceptance-company history documented as intentional test evidence.

The readiness report records the acceptance company/code and run marker.

---

# 4. Real-auth actor model

The acceptance company should expose stable test actor shapes sufficient to exercise Stage 01:

- **reader** — read-only Stage 01 visibility;
- **operator** — Opportunity/Workflow/Evaluation operations but no final decision authority;
- **decision actor** — decision permission plus bound decision capability;
- **admin/setup actor** — only when a scenario requires broad setup capability;
- **non-member / foreign-company actor** — isolation checks.

These are test-only actors. Do not modify VQH production-role semantics merely to create the matrix.

Permission matrix details may also be validated transactionally in Cloud DEV DB tests where that provides cleaner isolation.

---

# 5. Required business acceptance scenarios

B4 has ten canonical scenarios.

## B4-S01 — Happy path: Proceed

```text
Create Opportunity
→ complete required Intake data
→ assign Intake Owner
→ Start/Complete 01.1
→ Start 01.2
→ evaluate required criteria
→ submit Recommendation
→ Final Decision = proceed
→ Complete 01.2
```

Prove canonical version use, gate transitions, immutable final decision, completed state, and browser reload stability.

**Full-stack Cloud DEV browser execution is required.**

## B4-S02 — Happy path: Not proceeding

Complete with `not_proceeding` and verify the completed Opportunity remains inspectable and historical decision data is read-only.

## B4-S03 — Clarification loop

```text
Recommendation v1
→ Return for clarification
→ corrected/additional evidence
→ Recommendation v2
→ Final Decision
```

Verify v1 and clarification history remain immutable.

## B4-S04 — Blocking blocker

Verify an open blocking blocker prevents completion, resolve it, reload canonical state, then continue while retaining blocker history.

## B4-S05 — Duplicate concern

Verify Intake completion is blocked by an unresolved duplicate concern and succeeds only after an approved resolution.

No destructive Opportunity merge is added.

## B4-S06 — Revalidation

After an Intake-dependent change, verify stale downstream state is not treated as valid and explicit reason/evidence revalidation is required when backend rules say so.

## B4-S07 — Stale writer / concurrency

Use the existing Cloud DEV concurrency runner plus one application-level stale-form scenario.

Prove:

- exactly one competing write wins where expected;
- stale write receives `VERSION_CONFLICT`;
- no auto-overwrite/retry occurs;
- local input is retained where safe;
- retry after explicit canonical reload uses the new version.

## B4-S08 — Reactivation

Complete Stage 01, reactivate it, and verify:

- Opportunity + execution + cycle versions are exact;
- a new execution/cycle is created;
- prior cycle remains unchanged;
- new cycle is canonical;
- browser history shows both cycles.

**Real Cloud DEV runtime execution is required.**

## B4-S09 — Permission / isolation matrix

Verify:

- route/action visibility follows explicit permissions;
- direct server/RPC calls still reject missing permissions;
- actor capabilities supplement, never replace, permissions;
- forged company/Opportunity/node IDs cannot cross company boundaries;
- `employee.read_all` does not expose private employee data;
- narrow create-options RPC does not expose draft/raw workflow definition;
- unauthenticated/invalid sessions fail safely.

## B4-S10 — Bound-snapshot stability

Prove an Opportunity remains bound to snapshot N after a newer snapshot N+1 exists, while a newly created Opportunity binds to N+1.

Do this inside the dedicated acceptance boundary or transactional DB acceptance fixture.

Do not publish test configuration into the canonical VQH business company merely for this scenario.

---

# 6. Scenario execution allocation

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

The slow acceptance project is a release/readiness gate, not the normal fast E2E suite.

---

# 7. Reliability hardening targets

B4 explicitly exercises these edges.

## Double submit

A second UI action while a command is in flight must not create a second business mutation.

## Command succeeded, reload failed

Treat this separately from command failure.

If the server mutation succeeds but canonical GET fails, the UI must not encourage the user to repeat the command as if nothing happened.

Required behavior:

- explain that the operation may already have succeeded;
- block unsafe follow-up mutation until canonical state is reloaded;
- provide explicit reload;
- never auto-repeat the original command.

## Stale canonical versions

After success, later commands must use versions from the subsequent canonical GET.

## Local form retention

Preserve relevant input for retriable 5xx/network and `VERSION_CONFLICT` paths until explicit reload/discard where safe.

## Navigation/company-switch race

An in-flight mutation must not produce a false success or render cross-company state after navigation/switch.

Reuse existing shell guards rather than creating another global navigation system.

---

# 8. Performance acceptance

The main target is `Stage01OperationalDetail` GET.

## Profiles

```text
P1 normal:
1 cycle, 5 criteria, 2 contacts, small history

P2 growing:
5 cycles, 10 contacts, repeated criterion revisions

P3 practical stress fixture:
20 cycles, 20 contacts, repeated evaluations,
recommendations and clarification history
```

These are synthetic acceptance profiles, not declared production limits.

## Metrics

Record:

- uncompressed response size;
- server-to-Supabase request count through test instrumentation;
- warm local-Nitro → Cloud DEV API latency;
- relevant Supabase performance advisor output.

## Practical P3 envelope

- server-to-Supabase requests: **<= 25** per Stage01OperationalDetail load;
- response payload: **<= 2 MiB**;
- warm Cloud DEV API p95: **<= 2.0 s** after warm-up across at least 20 measured reads;
- individual measured request: **<= 3.0 s**, unless Cloud DEV degradation is independently demonstrated.

If latency alone fails, confirm Cloud DEV health and rerun once. Persistent failure blocks readiness.

## Optimization rule

If baseline passes, do not refactor.

If it fails, fix the smallest measured bottleneck. Preferred correction is batching existing reads rather than per-cycle/per-contact network loops.

A database migration/index/schema change is **not automatically authorized**. If required, stop for a focused amendment.

Do not generalize Stage 01 tables as a performance fix.

---

# 9. Security acceptance

Dynamic checks include:

- company/tenant isolation;
- operation-specific permissions;
- direct public RPC authorization;
- narrow create-options projection;
- no draft/raw-definition leakage;
- employee-directory vs private-data separation;
- immutable-history enforcement;
- forged resource IDs;
- unauthenticated/invalid-token behavior.

Final B4 implementation diff also receives the repository-approved static security scan.

Exit condition:

```text
0 unresolved critical findings
0 unresolved high findings
```

Medium/low findings require explicit disposition in the readiness report.

Security scan finalization failure blocks completion even if tests are green.

---

# 10. Responsive / accessibility acceptance

No visual redesign is planned.

Test dense Stage 01 state at minimum around:

- mobile `390 × 844`;
- desktop `1440 × 900`.

Acceptance:

- no page-level horizontal overflow;
- critical dialogs/forms remain operable;
- keyboard access for critical actions;
- programmatic labels;
- accessible error/success status;
- dense history remains readable;
- no critical axe violations on Stage 01 acceptance pages.

Fix only concrete defects.

---

# 11. Readiness report

Create:

```text
docs/acceptance/vqh-stage-01-operational-readiness.md
```

Required evidence:

- source/acceptance SHA;
- Cloud DEV target confirmation;
- dedicated acceptance boundary identity;
- run marker;
- S01–S10 matrix;
- permission/isolation results;
- concurrency/integrity races;
- history immutability;
- bound-snapshot stability;
- security scan;
- P1–P3 performance metrics;
- responsive/accessibility results;
- retained acceptance-history note;
- known limitations/risks;
- final verdict.

Verdict values:

```text
READY_FOR_VQH_PILOT
NOT_READY_FOR_VQH_PILOT
```

---

# 12. Exit conditions

Stage 01 is considered DONE when all are true:

1. Mandatory S01–S10 checks pass at their required layers.
2. Real full-stack S01 passes.
3. Real Cloud DEV S08 reactivation passes.
4. Cloud DEV concurrency and integrity-race suites pass.
5. No unresolved correctness/concurrency defect remains.
6. No unresolved high/critical security finding remains.
7. Bound-snapshot stability is proven.
8. Performance is within the practical envelope or an approved correction brings it within.
9. Mobile/desktop acceptance passes.
10. `pnpm verify:app` passes.
11. Full deterministic `pnpm test:e2e` passes.
12. B4 acceptance project passes from a clean checkout.
13. Canonical VQH business company contains no active B4 operational fixture data.
14. Retained acceptance-company history is marked/documented and does not affect VQH canonical checks.
15. Readiness report says `READY_FOR_VQH_PILOT` without contradiction.
16. Independent GPT immutable-diff review returns `MERGE` or an explicitly accepted equivalent non-blocking verdict.

---

# 13. Corrections allowed inside B4

Only corrections justified by failing acceptance evidence or measured performance are allowed, for example:

- command-success/reload-failure handling;
- duplicate-submit prevention;
- form retention on verified error paths;
- permission/capability presentation mismatch;
- batching a measured N+1 read pattern;
- mobile overflow/accessibility defect;
- deterministic regression coverage;
- acceptance fixture safety.

Each correction needs a failing regression test or captured performance baseline before the fix.

---

# 14. Stop / separate-task boundary

Stop and request a focused amendment if a correct fix requires:

- changing Stage 01 business semantics;
- Stage 02 or Project conversion;
- generalizing/renaming `stage01_*` runtime tables;
- replacing Workflow Engine ownership;
- completion-baseline refactor;
- a new business permission or material permission-semantic change;
- DB migration/index/schema change;
- production mutation/deployment;
- a new external subsystem;
- service-role use in normal business requests;
- weakening RLS/security boundaries.

Preserve B4 evidence when stopping.

---

# 15. Explicit non-goals

B4 does not include:

- Stage 02;
- Project creation/conversion;
- generic workflow builder/renderer;
- Decision Runtime generalization;
- completion-baseline refactor;
- notifications;
- new audit subsystem;
- file uploads;
- analytics/dashboard work;
- broad UI redesign;
- production deployment.

---

# 16. Delivery model

Follow the established repository workflow:

- one B4 implementation task/branch;
- no worktree;
- evidence-first / TDD corrections;
- Cloud DEV mutation limited to guarded acceptance fixture maintenance;
- production mutation forbidden;
- focused commits;
- fresh final verification;
- push after completion;
- no automatic merge;
- independent GPT review on immutable SHA range;
- Sơn makes the final merge decision.

---

## Design decision summary

B4 uses **Acceptance-first Hardening** because Stage 01 already has broad backend and UI implementation. The highest-value next step is to prove the merged product through real Cloud DEV integration, security, concurrency, history, usability, and performance evidence, then correct only demonstrated defects.

Stage 01 becomes DONE only after B4 produces a reviewed `READY_FOR_VQH_PILOT` result.