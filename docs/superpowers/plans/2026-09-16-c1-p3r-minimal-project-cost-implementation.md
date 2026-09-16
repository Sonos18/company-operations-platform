# C1 P3R Minimal Project Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the smallest Project Cost Management domain for Director-facing Project work-value summaries without introducing accounting semantics.

**Architecture:** `project_cost_items` is one mutable, Project-scoped work-value item per logical item; `audit_events` is its immutable history. `project_cost_item_sources` links source figures only as provenance. Command/RPC writes validate scope, optional hierarchy, non-overlap confirmation, permissions, and optimistic versioning; reads aggregate Project Cost Items, never source figures.

**Tech Stack:** Nuxt 4, Nitro/H3, TypeScript, Zod 4, Supabase/PostgreSQL, RLS, Vitest, pgTAP, Playwright, `numeric(20,4)` and decimal strings.

**Spec:**
- `docs/implementation/taskovia-c1/p3r-minimal-project-cost-scope.md`
- `docs/implementation/taskovia-c1/p3r-minimal-project-cost-domain-design.md`

## Global Constraints

- Work directly on `main`; use no worktree or parallel branch.
- Cloud DEV is the only development database. Schema application, type generation, pgTAP, advisors, and candidate loading each need separate explicit authorization.
- Create exactly two Project Cost tables: `project_cost_items` and `project_cost_item_sources`.
- A Project Cost is management-tracked work value, not accounting Actual, payment, cash, payable, receivable, invoice, revenue, budget, forecast, or profit.
- Statuses are exactly `unknown`, `in_progress`, and `accepted`; unknown amount is visible but excluded from tracked totals.
- `business_reference` is optional. Its uniqueness applies only where non-null and within tenant/company/Project.
- Source IDs, workbook identity, sheet, and locator are provenance only and never business identity.
- Reuse `cost.read`, introduce only `cost.manage`, and reuse `cost.correct` for corrections/reversals.
- No direct authenticated table writes. Use a guarded RPC/command path, expected versions, row locks, audit events, and create idempotency receipts.
- No Party, Engagement, Component, category, or business reference may be manufactured to load an item.

## File Structure

| Path | Responsibility |
| --- | --- |
| The single migration file emitted by `pnpm exec supabase migration new c1_project_cost_items` | Forward migration: both tables, permission, RLS, RPC command boundary, checks, indexes, and grants. |
| `supabase/tests/database/c1/c1_project_cost_items.test.sql` | Synthetic transaction-wrapped pgTAP/RLS/RPC contract test. |
| `scripts/run-c1-cloud-dev-tests.mjs` | Extend the fixed C1 allowlist with the new SQL test. |
| `shared/schemas/costs/project-costs.ts` | Zod request/response contracts, decimal-string validation, status enum, and aggregate model. |
| `shared/types/database.types.ts` | Generated only after separately authorized Cloud DEV migration application. |
| `server/features/costs/project-cost.repository.ts` | Scoped Supabase reads and RPC invocation only. |
| `server/features/costs/project-cost.service.ts` | Capability checks and business-command orchestration. |
| `server/features/costs/project-cost.routes.ts` | H3 request parsing through `c1RequestContext`. |
| `server/api/companies/[companyId]/project-costs/index.get.ts` | Company Project Cost summaries. |
| `server/api/companies/[companyId]/projects/[projectId]/project-costs/index.get.ts` | One Project summary and breakdown. |
| `server/api/companies/[companyId]/projects/[projectId]/project-costs/index.post.ts` | Create command endpoint. |
| `server/api/companies/[companyId]/project-costs/[projectCostItemId].patch.ts` | Update, status-transition, correction/reversal endpoint. |
| `app/repositories/http/http-project-cost-repository.ts` | Authenticated HTTP Project Cost client. |
| `app/repositories/contracts.ts` and `app/plugins/repositories.client.ts` | Repository registry contract and runtime wiring. |
| `app/pages/costs/index.vue`, `app/pages/costs/[projectId].vue`, `app/pages/costs/sources.vue` | Director overview, Project breakdown, and preserved source-read entry point. |
| `tests/unit/costs/project-costs.spec.ts` | Shared contract/aggregate arithmetic tests. |
| `tests/unit/server/project-cost.service.spec.ts` | Permission and mutation service tests. |
| `tests/unit/server/project-cost.routes.spec.ts` | Route context/body validation tests. |
| `tests/unit/repositories/http-project-cost-repository.spec.ts` | HTTP URL/schema tests. |
| `tests/unit/config/c1-project-cost-items-contract.spec.ts` | Static migration/RLS/RPC/permission contract tests. |
| `tests/unit/config/c1-cloud-dev-runner.spec.ts` | Existing allowlist test, extended for the new pgTAP file. |
| `tests/e2e/project-costs.spec.ts` | Director browser flow and unknown-status visibility. |
| `docs/implementation/taskovia-c1/p3r-vqh-project-cost-confirmation-packet.md` | Future confirmation packet; no candidate data. |

---

## Gate A — Database/schema foundation

### Task 1: Define Project Cost shared contracts first

**Files:**
- Create: `shared/schemas/costs/project-costs.ts`
- Create: `tests/unit/costs/project-costs.spec.ts`

**Interfaces:**
- Produces `projectCostWorkStatusSchema`, `createProjectCostItemInputSchema`, `updateProjectCostItemInputSchema`, `projectCostItemSchema`, `projectCostSummarySchema`, and `projectCostBreakdownSchema`.
- Uses decimal-string rules compatible with `shared/schemas/costs/master-data.ts`.

- [ ] **Step 1: Write failing contract tests** for a required nonnegative amount/currency/description/status, nullable `businessReference`, optional hierarchy/date, `unknown_status_value`, and a total that excludes unknown value.

```ts
expect(projectCostSummarySchema.parse({ acceptedValue: '100.0000', acceptedCount: 1, inProgressValue: '50.0000', inProgressCount: 1, unknownStatusValue: '20.0000', unknownCount: 1, totalTrackedWorkValue: '150.0000' })).toBeTruthy()
```

- [ ] **Step 2: Run:** `pnpm exec vitest run tests/unit/costs/project-costs.spec.ts`.

Expected: FAIL because `project-costs.ts` does not exist.

- [ ] **Step 3: Implement the smallest strict Zod contracts.** Amount is a nonnegative decimal string with at most four decimal places; `workStatus` is only `unknown|in_progress|accepted`; `totalTrackedWorkValue` is validated as accepted plus in-progress, not unknown.

- [ ] **Step 4: Re-run:** `pnpm exec vitest run tests/unit/costs/project-costs.spec.ts`.

Expected: PASS; invalid negative, unknown status, and incorrect total cases reject.

- [ ] **Step 5: Commit:** `feat(c1): add project cost contracts`.

**Review gate:** Review semantic boundary and F06 arithmetic before any migration is authored.

### Task 2: Add the forward Project Cost migration and static contract tests

**Files:**
- Create the one forward migration by running `pnpm exec supabase migration new c1_project_cost_items`; use the timestamped file emitted by that command and do not hand-name it.
- Create: `tests/unit/config/c1-project-cost-items-contract.spec.ts`
- Modify: `shared/constants/permissions.ts`

**Interfaces:**
- Produces `project_cost_items`, `project_cost_item_sources`, permission `cost.manage`, private command functions, and narrowly granted public RPC wrappers: `c1_create_project_cost_item`, `c1_update_project_cost_item`, and `c1_correct_project_cost_item`.
- Consumes `private.c1_master_context`, `audit_events`, `cost_command_receipts`, Projects, optional Party/Engagement/Component, and source figures.

- [ ] **Step 1: Write the static migration test** asserting both table names; no revision/ledger/payment/invoice tables; `numeric(20,4)` nonnegative amount; three statuses; nullable business-reference partial unique index; relation-pair uniqueness; `force row level security`; no authenticated insert/update/delete grant; `cost.manage`; `cost.read`; and `cost.correct`.

- [ ] **Step 2: Run:** `pnpm exec vitest run tests/unit/config/c1-project-cost-items-contract.spec.ts`.

Expected: FAIL because the generated migration and permission do not exist.

- [ ] **Step 3: Implement one forward migration.** Use composite tenant/company scope FKs, Project/status aggregation index, source reverse lookup index, and source link uniqueness only on `(project_cost_item_id, source_reported_figure_id)`. Add the nullable Project-scoped business-reference uniqueness with a `where business_reference is not null` predicate. Add forced RLS and select policy for `cost.read`; revoke direct mutations from authenticated roles. Add `cost.manage` and grant it only to the existing `c1_vqh_cost_operator` role; leave all other role grants unchanged.

- [ ] **Step 4: Add private/public command functions in the same migration.** Private functions resolve `auth.uid()` and `private.c1_master_context`; public wrappers have explicit signatures and default EXECUTE revoked before deliberate authenticated grants. `c1_create_project_cost_item` requires `cost.manage`, a non-empty non-overlap confirmation reference, and idempotency key. `c1_update_project_cost_item` handles description, optional hierarchy/date, and status transition under `cost.manage`. `c1_correct_project_cost_item` requires `cost.correct` plus a non-empty correction reason for amount/status reversal. Every update/correction locks the same row, checks expected version, increments it, and writes immutable before/after `audit_events`.

- [ ] **Step 5: Re-run:** `pnpm exec vitest run tests/unit/config/c1-project-cost-items-contract.spec.ts`.

Expected: PASS; static assertions prove F04/F05/F07 and no direct-write escape hatch.

- [ ] **Step 6: Commit:** `feat(c1): add project cost database foundation`.

**Review gate:** Review generated migration diff only. Do not run Cloud DEV migration commands in this gate.

---

## Gate B — Mutation commands and audit

### Task 3: Add synthetic database command/security proofs and runner allowlist

**Files:**
- Create: `supabase/tests/database/c1/c1_project_cost_items.test.sql`
- Modify: `scripts/run-c1-cloud-dev-tests.mjs`
- Modify: `tests/unit/config/c1-cloud-dev-runner.spec.ts`
- Modify: `tests/unit/config/c1-project-cost-items-contract.spec.ts`

**Interfaces:**
- Produces synthetic pgTAP evidence for public Project Cost RPCs.
- Uses only reserved `c100...`/`c101...` fixture identities and a terminal `rollback;`.

- [ ] **Step 1: Write failing runner/static tests** that require the SQL filename in the runner allowlist and reject real VQH IDs, commits, reset, seed, migration history, and direct authenticated writes.

- [ ] **Step 2: Run:** `pnpm exec vitest run tests/unit/config/c1-cloud-dev-runner.spec.ts tests/unit/config/c1-project-cost-items-contract.spec.ts`.

Expected: FAIL because the new test is not allowlisted and its contract is absent.

- [ ] **Step 3: Implement the transaction-wrapped pgTAP script.** Prove tenant/company/Project isolation; `cost.read`, `cost.manage`, and `cost.correct` boundaries; optional hierarchy acceptance; cross-Project hierarchy rejection; nullable reference uniqueness; provenance-pair uniqueness; source reuse across different items remains schema-valid; money/status checks; idempotent create; expected-version conflict; same-row `in_progress -> accepted`; audit immutability; and no additive successor.

- [ ] **Step 4: Re-run:** `pnpm exec vitest run tests/unit/config/c1-cloud-dev-runner.spec.ts tests/unit/config/c1-project-cost-items-contract.spec.ts`.

Expected: PASS; local runner validation accepts only the synthetic, rollback-safe script.

- [ ] **Step 5: Commit:** `test(c1): cover project cost database boundary`.

**Review gate:** Review SQL fixture scope before any separately authorized Cloud execution.

### Task 4: Implement server command and read boundaries

**Files:**
- Create: `server/features/costs/project-cost.repository.ts`
- Create: `server/features/costs/project-cost.service.ts`
- Create: `server/features/costs/project-cost.routes.ts`
- Create: `tests/unit/server/project-cost.service.spec.ts`
- Create: `tests/unit/server/project-cost.routes.spec.ts`

**Interfaces:**
- Produces `ProjectCostRepository` methods `listSummaries`, `projectSummary`, `create`, and `update`.
- Uses `c1RequestContext`, shared Project Cost schemas, public RPC names from Task 2, and `AppApiError` mappings used by Project Register.

- [ ] **Step 1: Write failing service tests** for `cost.read` summaries, `cost.manage` create, `cost.correct` correction/reversal, required non-overlap confirmation, expected-version conflict, and no repository call when capability fails.

- [ ] **Step 2: Run:** `pnpm exec vitest run tests/unit/server/project-cost.service.spec.ts tests/unit/server/project-cost.routes.spec.ts`.

Expected: FAIL because the service/routes/repository do not exist.

- [ ] **Step 3: Implement repository RPC/read mapping and service guards.** Scope every read by tenant/company. Route bodies are parsed by strict shared schemas and obtain actor/company only through `c1RequestContext`. Map `MODULE_DISABLED`, `RESOURCE_NOT_FOUND`, and `VERSION_CONFLICT` to existing API errors.

- [ ] **Step 4: Re-run:** `pnpm exec vitest run tests/unit/server/project-cost.service.spec.ts tests/unit/server/project-cost.routes.spec.ts`.

Expected: PASS; callers cannot select actor/tenant/company or bypass command validation.

- [ ] **Step 5: Commit:** `feat(c1): add project cost command service`.

**Review gate:** Review write API authorization, same-row transition, and error mapping before HTTP wiring.

---

## Gate C — Authenticated API and repository verification

### Task 5: Wire company/project routes and authenticated HTTP repository

**Files:**
- Create: `server/api/companies/[companyId]/project-costs/index.get.ts`
- Create: `server/api/companies/[companyId]/projects/[projectId]/project-costs/index.get.ts`
- Create: `server/api/companies/[companyId]/projects/[projectId]/project-costs/index.post.ts`
- Create: `server/api/companies/[companyId]/project-costs/[projectCostItemId].patch.ts`
- Create: `app/repositories/http/http-project-cost-repository.ts`
- Modify: `app/repositories/contracts.ts`
- Modify: `app/plugins/repositories.client.ts`
- Create: `tests/unit/repositories/http-project-cost-repository.spec.ts`

**Interfaces:**
- Produces `projectCosts.summaries()`, `projectCosts.project(projectId)`, `projectCosts.create(projectId, input)`, and `projectCosts.update(id, input)`.
- Consumes the service/routes from Task 4 and authenticated HTTP client convention from `http-cost-source-read-repository.ts`.

- [ ] **Step 1: Write failing HTTP tests** for company-encoded URLs, project-scoped reads, strict response schemas, create body, patch body, and no workbook/source fields in normal responses.

- [ ] **Step 2: Run:** `pnpm exec vitest run tests/unit/repositories/http-project-cost-repository.spec.ts tests/unit/server/project-cost.routes.spec.ts`.

Expected: FAIL because the HTTP repository and API route files do not exist.

- [ ] **Step 3: Implement the four thin API handlers and HTTP repository.** Keep summaries business-only: values/counts/status/Party/description/date. Do not expose source locator, workbook, sheet, import, or reconciliation fields.

- [ ] **Step 4: Re-run:** `pnpm exec vitest run tests/unit/repositories/http-project-cost-repository.spec.ts tests/unit/server/project-cost.routes.spec.ts`.

Expected: PASS; every endpoint is company-scoped and typed.

- [ ] **Step 5: Commit:** `feat(c1): expose project cost api`.

**Review gate:** Review public response boundary before Director UI work.

---

## Gate D — Separately authorized Cloud DEV migration verification

**No implementation or Cloud mutation is authorized by this plan.** A later explicit packet must authorize, in order:

1. `pnpm db:dev:target` and `pnpm db:dev:status` to prove target and migration parity.
2. `pnpm db:dev:dry-run` to prove only the reviewed Project Cost migration applies.
3. Reviewed `pnpm db:dev:push` for the exact migration.
4. `pnpm db:dev:types`, reviewing the resulting `shared/types/database.types.ts` diff before committing it.
5. `pnpm db:dev:c1:test` for synthetic rollback-safe C1 tests.
6. `pnpm db:dev:advisors:security`, `pnpm db:dev:advisors:performance`, and focused unit/typecheck/lint verification.

**Review gate:** Stop on target drift, unrelated migration, type diff outside the reviewed schema, test failure, or advisor regression. Production and Local DB remain forbidden.

---

## Gate E — Separately authorized VQH candidate confirmation and load

### Task 6: Prepare the management-cost confirmation packet

**Files:**
- Create: `docs/implementation/taskovia-c1/p3r-vqh-project-cost-confirmation-packet.md`

**Interfaces:**
- Produces one business confirmation row per proposed item: Project, business item, tracked value, currency/default approval, `in_progress|accepted`, non-overlap confirmation, provenance; Party/date are optional.

- [ ] **Step 1: Write the packet** with no financial-accounting, invoice, payment, bank, or receivable/payable fields.
- [ ] **Step 2: Verify:** `git diff --check`.

Expected: PASS; packet is business-oriented and identifies no candidate as automatically loadable.

- [ ] **Step 3: Commit:** `docs(c1): add project cost confirmation packet`.

**Review gate:** Real VQH data loading requires a separate explicit authorization after VQH confirms each row. The load uses Task 4’s create command, never raw inserts.

---

## Gate F — Read and aggregation API hardening

### Task 7: Add aggregation, isolation, and concurrency regression coverage

**Files:**
- Modify: `tests/unit/costs/project-costs.spec.ts`
- Modify: `tests/unit/server/project-cost.service.spec.ts`
- Modify: `supabase/tests/database/c1/c1_project_cost_items.test.sql`

- [ ] **Step 1: Write failing tests** for accepted/in-progress totals, separate unknown value/count, zero-with-count distinction, Eo Gió/Yong Mei isolation, and same-item status transition without a second row.
- [ ] **Step 2: Run:** `pnpm exec vitest run tests/unit/costs/project-costs.spec.ts tests/unit/server/project-cost.service.spec.ts`.

Expected: FAIL until the Task 4 read model and command result mappings satisfy every F04/F06 assertion.

- [ ] **Step 3: Implement only the missing aggregate query/projection behavior** in `project-cost.repository.ts` and shared output schema. Aggregate exclusively from `project_cost_items`.
- [ ] **Step 4: Re-run:** `pnpm exec vitest run tests/unit/costs/project-costs.spec.ts tests/unit/server/project-cost.service.spec.ts`.

Expected: PASS; unknown is visible but excluded from tracked totals.

- [ ] **Step 5: Commit:** `test(c1): harden project cost aggregation`.

**Review gate:** Re-review F04/F06 and source-independence before UI work.

---

## Gate G — Director Project Cost UI

### Task 8: Replace the Director `/costs` entry with business-only Project Cost views

**Files:**
- Modify: `app/pages/costs/index.vue`
- Create: `app/pages/costs/[projectId].vue`
- Create: `app/pages/costs/sources.vue`
- Create: `tests/e2e/project-costs.spec.ts`
- Modify: `tests/e2e/app-shell-navigation.spec.ts`

**Interfaces:**
- Consumes `repositories.projectCosts` from Task 5.
- Produces `/costs` Project summary cards, `/costs/:projectId` breakdown, and preserves source access at `/costs/sources` for `cost.source.read` users.

- [ ] **Step 1: Write failing Playwright tests** proving Director navigation, accepted/in-progress/unknown visibility, unknown excluded from total, business-only detail, company switch cancellation, and absence of workbook/sheet/cell/import/reconciliation labels.

- [ ] **Step 2: Run:** `pnpm exec playwright test tests/e2e/project-costs.spec.ts`.

Expected: FAIL because Director Project Cost routes and views do not exist.

- [ ] **Step 3: Implement the smallest responsive views.** `/costs` lists Project summaries; `/costs/:projectId` shows status → optional Party → description/value/date; `/costs/sources` preserves the current source screen. Reuse current shell, `ClientError`, repository registry, and money formatting conventions.

- [ ] **Step 4: Re-run:** `pnpm exec playwright test tests/e2e/project-costs.spec.ts tests/e2e/app-shell-navigation.spec.ts`.

Expected: PASS; normal Director views expose no source mechanics or unsupported accounting semantics.

- [ ] **Step 5: Commit:** `feat(c1): add director project cost views`.

**Review gate:** Review browser evidence and accessibility before acceptance.

---

## Gate H — Acceptance verification

### Task 9: Run the bounded Project Cost acceptance matrix

**Files:**
- Modify: `supabase/tests/database/c1/c1_project_cost_items.test.sql`
- Modify: `tests/e2e/project-costs.spec.ts`
- Create: `docs/implementation/taskovia-c1/phase-reports/p3r-project-cost-acceptance.md`
- Modify: `docs/implementation/taskovia-c1/progress.md`

- [ ] **Step 1: Add failing acceptance assertions** covering synthetic tenant/company/Project isolation, direct-write denial, permission separation, create replay, version conflict, same-row transition, audit immutability, unknown-total separation, hierarchy consistency, and source provenance independence.
- [ ] **Step 2: Run deterministic checks:** `pnpm exec vitest run tests/unit/costs/project-costs.spec.ts tests/unit/server/project-cost.service.spec.ts tests/unit/server/project-cost.routes.spec.ts tests/unit/repositories/http-project-cost-repository.spec.ts tests/unit/config/c1-project-cost-items-contract.spec.ts`.

Expected: PASS only after every prior gate is complete.

- [ ] **Step 3: Under a separate explicit Cloud authorization, run Gate D’s Cloud sequence and then:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, and the focused Project Cost Playwright suite.

Expected: PASS with only reviewed migration/type/document/runtime changes and zero real VQH data mutations.

- [ ] **Step 4: Record exact commands, SHAs, synthetic scope, results, and unrun work in the phase report.**

- [ ] **Step 5: Commit:** `test(c1): verify project cost acceptance`.

**Review gate:** Stop for final remote review. Do not begin real VQH load without the separate Gate E authorization.

## Plan Self-Review

- F04: Tasks 2, 3, 4, and 7 enforce same-row transitions, non-overlap confirmation, and no additive successor.
- F05: Tasks 1–3 use nullable business reference with partial uniqueness only.
- F06: Tasks 1, 5, 7, and 8 expose unknown value/count separately from tracked total.
- F07: Tasks 2–3 use only provenance-pair uniqueness; Task 3 proves source reuse remains schema-valid.
- Each Gate A–H has an independent review/authorization boundary; Cloud and real VQH loading are explicitly separate.
- Placeholder scan: no unresolved markers or unspecified validation steps.
- Scope scan: no ledger, accounting Actual, cash, payment, invoice, revenue, receivable/payable, budget, forecast, or profit implementation.
