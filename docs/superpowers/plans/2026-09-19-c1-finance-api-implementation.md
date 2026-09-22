# Taskovia C1 finance read API — implementation plan

> **For agentic workers:** use superpowers:executing-plans sequentially. The user chose CodeX execution on the existing main workspace. No parallel agents, worktrees, broad replanning, or repeated model reviews. Follow the execution prompt's authorization; this plan itself is not evidence of execution.

**Goal:** Checkpoint the completed schema sync, then implement truthful finance read APIs with legacy compatibility and a usable Antigravity handoff.
**Architecture:** New strict finance DTOs and GET routes beside legacy cost routes; a shared scoped reader and pure Decimal aggregation; two narrow metadata readers in one forward migration. Existing monetary/source records and status-dependent writers are preserved.
**Tech stack:** Repository baseline Node 24.x, pnpm 10.29.3, Nuxt 4.3.1, Vue 3.5.28, Supabase JS 2.x, Decimal.js 10.6.0, Zod 4, Vitest 4.1.9. Refresh installed versions; no upgrade/install is needed.
**Spec:** `docs/superpowers/specs/2026-09-19-c1-finance-api-design.md`.
**Reference:** `reference/METADATA_SQL.md` in the external input package.

## Global constraints

Cloud DEV only: `gtgljlnhwvhqdnwrfdfj`. Never execute on Production or fall back to a local DB. Preserve Antigravity's workspace. No seed, cleanup, business-record reclassification, import, migration repair/fetch, or script 03. Keep applied migrations immutable, work_status present, category nullable and legacy API contracts operational. No chart/UI/package/framework work.

P0 authorizes a separate commit and normal push of the existing three-file schema checkpoint. P1–P5 API edits remain uncommitted for review at the end. The execution prompt authorizes one narrowly defined metadata-read migration through guarded commands and isolated rollback-only tests; no other Cloud mutation. A push is not an instruction to deploy or promote an application. If a known integration would mutate Production, stop that push rather than bypass it.

## Review focus

1. Empty new payment tables with nonempty legacy subcontract data must not become a zero-cost or positive-profit claim.
2. Cost readers without party/project/settings management permissions must receive only permitted metadata, including empty-project identity.
3. A backend cap smaller than the requested page size, and exact page-size multiples, must not truncate aggregates.
4. A strict legacy client must still parse its old routes; no silent substitution of a new response schema.
5. Unknown retention, missing budget, negative reference headroom, large decimal sums and timezone boundaries must remain distinct and exact.

## Work map

Create:
- `shared/schemas/costs/project-finance.ts` — strict new success/query schemas and inferred types.
- `shared/utils/project-finance-money.ts` — local Decimal constructor, sums, signed differences.
- `shared/utils/project-finance-dates.ts` — timezone-derived dates, provenance and stable comparators.
- `server/features/costs/finance/read-pages.ts` — complete bounded UUID scans and batching.
- `server/features/costs/finance/project-finance.queries.ts` — projections, row validators, Supabase reads and metadata RPC adapters.
- `server/features/costs/finance/project-finance.summary.ts` — pure financial grouping, completeness and reference selection.
- `server/features/costs/finance/project-finance.repository.ts` — read orchestration, grouping and consistency rechecks.
- `server/features/costs/finance/project-finance.service.ts` — cost.read, validated inputs and business result assembly.
- `server/features/costs/finance/project-finance.routes.ts` — H3 params/query/context integration.
- Eight thin route files in P3.
- `app/repositories/http/http-project-finance-repository.ts` — typed GET client.
- `tests/unit/costs/project-finance.spec.ts`.
- `tests/unit/server/project-finance.repository.spec.ts`.
- `tests/unit/server/project-finance.service.spec.ts`.
- `tests/unit/server/project-finance.routes.spec.ts`.
- `tests/unit/repositories/http-project-finance-repository.spec.ts`.
- `tests/unit/config/c1-finance-api-metadata-contract.spec.ts`.
- `supabase/tests/database/c1/c1_project_finance_metadata_read.test.sql`.
- One CLI-named forward migration, suffix `_c1_project_finance_metadata_reads.sql`.
- `docs/superpowers/plans/2026-09-19-c1-finance-api-progress.md`.
- `docs/superpowers/specs/2026-09-19-c1-finance-api-antigravity-handoff.md` (produce at P5).

Modify narrowly:
- `app/repositories/contracts.ts`.
- `app/plugins/repositories.client.ts`.
- `shared/types/database.types.ts` (generated).
- `scripts/run-c1-cloud-dev-tests.mjs` (add exactly the new fixture to its allowlist and synthetic-ID validation).

Existing legacy schema/service/repository/route files are read-only unless a demonstrated, necessary compatibility fix is documented. Do not refactor their business behavior. Preserve unrelated tests; changes to expectations require evidence of an intentional interface addition, not weakening a test.

## P0 — Record the accepted migration checkpoint

**Inputs:** current local migration sync PASS; recovered prerequisite, exact expansion SQL, generated types. **Output:** one separate checkpoint commit and remote SHA, with API work not yet mixed in.

- [ ] Inspect current HEAD, origin/main, index and working-tree paths once. Do not repeat the migration-fetch incident investigation. If unrelated content differs from the reported baseline, preserve it. Status-only historical `.M` files are not task edits when Git content diff is empty.
- [ ] Confirm these paths exist, are not already committed, and match accepted artifacts:

```text
supabase/migrations/20260919143500_c1_project_cost_read_context.sql
supabase/migrations/20260919174116_c1_project_finance_expansion.sql
shared/types/database.types.ts
```

Expansion SHA-256: `0d4c03d93b8add58042c73fcd33719b73362a9b1e1a35fa503feae591db7c45b`.
Prerequisite SHA-256: `e6009140ad8abe493bff8feba630565e7e125df8c0eaff692ddd9fc34213538f`.
Do not manufacture either hash by rewriting content. If these artifacts already have a correct checkpoint commit, reuse it and skip duplication.

- [ ] Refresh guarded migration status and dry-run once. Expected: 47 identities, expansion applied, no replay. If a legitimate newer migration exists, inspect only that delta and preserve it.
- [ ] Ensure the index contains no unrelated work; do not unstage someone else's changes. Stage only these three paths, inspect staged file names and full diff, commit, then normal push to origin/main only when it is a safe fast-forward. Never use `git add .`, force push, blanket reset or an automatic merge of changed origin history.

```bash
git add -- supabase/migrations/20260919143500_c1_project_cost_read_context.sql supabase/migrations/20260919174116_c1_project_finance_expansion.sql shared/types/database.types.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "chore(db): checkpoint C1 finance schema synchronization"
git push origin HEAD:main
```

- [ ] Verify the resulting remote SHA. Copy the design/plan/progress documents into their specified repo paths only after the P0 checkpoint so they do not enter the three-file commit. Keep operator checkpoints/raw finance evidence outside Git.

**PASS P0:** the checkpoint is identifiable and pushed, only intended files committed, no DDL replay or data write. If origin moved, resolve safe integration separately rather than overwrite it; local API work may proceed only on a verified compatible base.

## P1 — Strict contracts, money, dates and semantic reducer

**Files:** new schema, money/date utils, summary module and `tests/unit/costs/project-finance.spec.ts`.
**Output:** `FinanceOverview`, list/detail types and pure helpers, with no database calls.

### P1.1 Test the dangerous distinctions first

- [ ] Write focused tests for required metadata, recorded-zero vs not-recorded, no-work-status fields in new responses, preservation of negative computed differences, and valid date provenance. Create synthetic fixtures; never copy real UUIDs/notes/amounts from external audit packages.
- [ ] Run:

```bash
pnpm exec vitest run tests/unit/costs/project-finance.spec.ts
```

If a filter fails, inspect `vitest.config.ts` and `pnpm exec vitest --help` once. The inspected config includes `tests/unit/**/*.spec.ts`; do not blindly retry the previously failing filter syntax or conclude filters are forbidden. `pnpm test:unit` is the known fallback.

### P1.2 Money utilities and validators

Produce these exports:

```ts
export function sumFinanceMoney(values: readonly string[]): string
export function subtractFinanceMoney(base: string, deductions: readonly string[]): string
export function computeConfirmedMargin(input: {
  basis: 'revenue_estimate' | 'cost_budget' | 'unconfirmed'
  approvedReference: string | null
  cost: string | null
  retention: string | null
}): string | null
```

Implementation core:

```ts
import Decimal from 'decimal.js'
const Money = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP })
export function sumFinanceMoney(values: readonly string[]): string {
  return values.reduce((total, value) => total.plus(value), new Money(0)).toFixed(4)
}
export function subtractFinanceMoney(base: string, deductions: readonly string[]): string {
  return deductions.reduce((value, deduction) => value.minus(deduction), new Money(base)).toFixed(4)
}
export function computeConfirmedMargin(input: {
  basis: 'revenue_estimate' | 'cost_budget' | 'unconfirmed'
  approvedReference: string | null; cost: string | null; retention: string | null
}): string | null {
  if (input.basis !== 'revenue_estimate' || input.approvedReference === null
      || input.cost === null || input.retention === null) return null
  return subtractFinanceMoney(input.approvedReference, [input.cost, input.retention])
}
```

Inputs are validated at the schema/row boundary. Row money accepts up to 16 integer and 4 fractional digits, no negatives/exponents/NaN/Infinity. Aggregated money permits a larger integer range (30 digits, exactly 4 fractional digits); signed difference schemas allow a leading minus. Do not reuse a 16-digit row validator for a multi-row total. Reject invalid numeric inputs, not coerce them.

```ts
expect(sumFinanceMoney(['9999999999999999.9999','9999999999999999.9999']))
  .toBe('19999999999999999.9998')
expect(subtractFinanceMoney('10.0000',['12.0000'])).toBe('-2.0000')
expect(computeConfirmedMargin({basis:'unconfirmed',approvedReference:'400',cost:'250',retention:'10'})).toBeNull()
expect(computeConfirmedMargin({basis:'revenue_estimate',approvedReference:'400',cost:'250',retention:'10'})).toBe('140.0000')
```

The runtime mapper passes `unconfirmed` until an authoritative persisted basis exists; never pass `revenue_estimate` merely because the UI calls the card Budget or Profit. Current runtime margin is unavailable, with fixed reason codes: `NO_APPROVED_BUDGET`, `COST_INCOMPLETE`, `RETENTION_INCOMPLETE`, `BUDGET_BASIS_UNCONFIRMED`. Return only applicable reasons.

### P1.3 Date utilities

Produce `deriveFinanceDate(businessDate, createdAt, timeZone) -> { effectiveDate, usedFallback }` and a stable comparator. Validate businessDate using `z.string().date()` before deriving; reject a malformed non-null DB date as inconsistent data. Do not repair a raw note.

Use `Intl.DateTimeFormat(...).formatToParts()` and explicitly assemble year-month-day, not a locale's assumed display order. Validate the configured IANA timezone; do not silently substitute browser time or HCM on invalid settings. Compare timestamps by instant, not lexicographic ISO strings with different offsets. The number used for timestamp comparison is not a financial calculation.

Sort detail: effectiveDate DESC, createdAt instant DESC, lineNo ASC where present, id ASC; oldest reverses only date and time. For payments/receipts without lineNo use id as final tie-break. Latest aggregate provenance comes from exactly the winning row under the same comparator.

Test a UTC instant around a Vietnam date boundary, another company timezone, two equivalent timestamps with different offsets, null business date, same-day ties, oldest ordering, invalid raw note date preserved, and inclusive date-range endpoints.

### P1.4 Response models and reducer

Implement the spec's strict schemas plus:
- `FinanceProjectList`: schemaVersion, projects (context + summary), nextCursor.
- `FinanceBudget`: project context, state `approved|not_recorded`, header nullable, lines array. Header fields: id, revisionNo, name, detailMode, amount, currencyCode, effectiveDate, approvedAt, reference, note. Nullable values remain explicit. Categorized lines include id/categoryId/lineNo/description/amount/reference/note; summary-only lines are empty.
- `FinanceOwnerAdvances`: project, full `recordedTotal`/`recordedCount`, ownerAdvance observation, rows, and pagination/filtered subtotal.
- `FinanceSubcontractorList`: project, coverage `recorded|not_recorded|needs_reconciliation`, grouped parties and their contract summaries. Party fields: partyId/code/displayName/partyKind. Do not group by a name string.
- `FinanceSubcontractorDetail`: project, party, contracts and paged payments tagged with contractId/code/no.
- `FinanceSubcontractDetail`: project, party, contract and paged payments. Contract fields: id/code/contractNo/contractName/contractDate/contractValue/currencyCode/defaultRetentionRateBps/isActive/version/reference/note.
- `FinanceItemDetails`: discriminated `kind=ordinary|legacy_subcontract`. Ordinary: project, category, status-free item metadata, parentAmount and detail page. Legacy subcontract: project/category/item identity, reason LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED, no transformed payment rows.

All page-number list envelopes include `page`, `pageSize`, `totalPages`, `filteredCount`, `fullCount`, `filteredAmount`, `fullAmount` (nullable if completeness is unknown). The cursor-paged company directory instead returns nextCursor and has no monetary filtered/page subtotal. Set filteredAmount to null when the selected cost population itself is unknown, rather than treating it as a full financial observation. Rows remain strongly typed. For payment rows include id, contractId, description, paidAmount, warrantyRetentionAmount nullable, retentionRateBps nullable, paymentDate nullable, effectiveDate, dateSource, recordStatus, reference, note, createdAt and version. Receipt rows use receivedDate/amount/payerName/receiptNo instead. Legacy detail rows preserve existing quantity/unit/unitPrice/amount/retention/reference/note fields without workStatus.

Create `summarizeProjectFinance(input)` over already-validated rows; document its input type with the projections from P2. No repository access inside this reducer. Apply the conservative completeness algorithm from the spec. Approved budgets and recorded receipts are two independent facts; the selected reference does not overwrite either fact.

Synthetic financial test: four ordinary category amounts 100,20,30,10; no legacy subcontract data; two recorded payments 40+50, each retention5; contract200; approved reference400. Assert cost250, retention10, paid90, headroom100; adding a voided payment changes none. Add a nonzero legacy subcontract parent and assert combined cost null rather than 250 or gross+250. Remove machinery parent and assert not_recorded rather than 0. A zero-valued recorded parent is distinguishable from removal.

**PASS P1:** schemas and pure tests pass; no invented default financial values; legacy schemas untouched; no global Decimal configuration or runtime note parsing.

## P2 — Scoped reads and narrow metadata permissions

**Files:** metadata migration, new queries/read-pages/repository files, server/config tests, one SQL fixture and runner allowlist entry.
**Outputs:** complete, validated `FinanceReadSet` per project/page; two metadata RPCs with bounded output; no additional runtime permissions.

### P2.1 Bounded metadata helper

- [ ] Inspect the recovered read-context migration and current generated types; reuse its exact signature `c1_read_project_cost_read_context(target_company_id,target_project_id)`.
- [ ] Add a migration from `reference/METADATA_SQL.md`, generating the timestamp via CLI. Review the four private/public functions, auth/cost.read/module/company/project validation, limited field projection, stable/empty search_path and grants. No existing function or table policy is replaced.
- [ ] Add static contract tests for function/grant allowlists, no DML, no service-role client, and tests for the guarded SQL fixture validator.
- [ ] Add `c1_project_finance_metadata_read.test.sql` to the runner's explicit allowlist. For this file enforce only `c104`-prefixed synthetic UUIDs, no real project names/IDs; keep every existing guard.

Runtime fixture owns synthetic tenant/company/project/linked/unlinked party data and a cost.read-only actor. Use the existing C1 fixture setup conventions from `supabase/tests/database/c1/c1_project_cost_items.test.sql`. Set transaction-local finance actor/request settings only for synthetic setup. Start BEGIN and end ROLLBACK; no COMMIT. Test public wrappers as authenticated actors and direct private EXECUTE denial. Test cost.read without party.manage succeeds only for linked names; other-project/unlinked requests return no names; wrong company/missing permission/module fail; no-project directory returns []; valid empty projects are included; paging returns correct nextCursor. Check no phone/tax identifier or private record fields escape.

- [ ] Before applying, run the Cloud DEV guard, migration status and dry-run. Exactly this one new migration must be pending; never replay the expansion. Any unrelated pending migration is not authorized.
- [ ] Apply only this new migration through `pnpm db:dev:push` after the verified allowlist gate. Run `pnpm db:dev:c1:test` once through the updated guarded runner (six existing fixtures plus this new one). Describe these as rollback test writes, not read-only calls. Re-read functions/grants and confirm no real data rows changed. Regenerate types using `pnpm db:dev:types` and review the bounded diff.

If a function test fails, fix only the new helper with a new forward corrective migration after reporting why; never edit an applied migration. Additional corrective application requires approval rather than silently broadening the one-migration authorization. Continue independent local implementation/tests while that gate is pending; do not claim complete Cloud readiness.

### P2.2 Pagination primitive

Produce:

```ts
export async function scanUuidRows<T extends { id: string }>(
  fetchPage: (afterId: string | null, requestedSize: number) => Promise<readonly T[]>,
  options?: { pageSize?: number; maxRows?: number }
): Promise<T[]>
```

Use a pure helper with no hardcoded table names. Defaults 500 and 50,000. Each page must have strictly increasing IDs; all IDs must advance past cursor and not duplicate earlier pages. Cursor becomes the last actual returned ID. Stop ONLY on an empty page, not on `length < requestedSize`. If maxRows is exceeded throw a tagged read-limit error that the service maps to INTERNAL_ERROR/reason READ_LIMIT_EXCEEDED. Do not return the accumulated partial list. Query call counters belong to the repository/reader tests, not global mutable state.

Test the helper with 1,200 synthetic records, simulated backend cap 137, exact 500/1,000 multiples, empty dataset, duplicate/stuck cursor, and the 50,001st row. Each IN chunk has an independent cursor. Also test 51 and 101 parent IDs so chunk boundaries are exercised.

### P2.3 Executable projections and queries

Every table read uses tenant_id and company_id filters; project_id or reviewed item-ID batches further restrict it. Validate returned rows as well as query arguments. UUID filters contain validated IDs only.

| Source | Overview/list projection (no star) |
|---|---|
| cost_categories | id,tenant_id,company_id,code,name,display_order,is_active,version |
| project_cost_items | id,tenant_id,company_id,project_id,cost_category_id,description,business_reference,amount_text,currency_code,version,created_at,updated_at |
| project_cost_item_details | id,tenant_id,company_id,project_cost_item_id,line_no,amount_text,relevant_date,created_at,updated_at,version,retention_kind,retention_amount_text |
| project_budget_versions | id,tenant_id,company_id,project_id,revision_no,name,currency_code,detail_mode,total_amount_text,status,approved_at,version,updated_at |
| project_budget_lines | id,tenant_id,company_id,project_id,budget_version_id,cost_category_id,line_no,amount_text,version,updated_at |
| project_owner_advances | id,tenant_id,company_id,project_id,amount_text,currency_code,status,version,updated_at |
| project_subcontracts | id,tenant_id,company_id,project_id,subcontractor_party_id,code,contract_no,contract_name,contract_value_text,currency_code,warranty_retention_rate_bps,is_active,version,updated_at |
| project_subcontract_payments | id,tenant_id,company_id,project_id,project_subcontract_id,paid_amount_text,warranty_retention_amount_text,retention_rate_bps,currency_code,status,payment_date,created_at,version,updated_at |

Detail endpoints select their needed reference/note/date/quantity fields explicitly; never send those fields through project summaries. Approved-budget GET additionally selects reference/source_reference/note/effective_date as needed; dates and raw notes do not drive money interpretation.

Example real Supabase query shape (the reader supplies validated values):

```ts
let query = db.from('project_cost_item_details')
  .select(detailAggregateColumns)
  .eq('tenant_id', tenantId).eq('company_id', companyId)
  .in('project_cost_item_id', itemIds)
  .order('id', { ascending: true }).limit(requestedSize)
if (afterId !== null) query = query.gt('id', afterId)
const { data, error } = await query
if (error) throw mapFinanceReadError(error)
return validateDetailAggregateRows(data, { tenantId, companyId, itemIds })
```

Declare `detailAggregateColumns` from the table above, `mapFinanceReadError` in queries.ts using existing AppApiError conventions, and `validateDetailAggregateRows` as strict Zod parsing plus scope checks. Do not cast a malformed row into a generated type. Table-specific generated typing is preferred; one explicitly documented query interface is acceptable when generic builders otherwise produce unusable types.

Directory: obtain a page of project identities/settings with `c1_read_project_finance_directory`, then use batched project-ID scans across the page. Do NOT call overview() once for each project. Share the resulting category catalog and partition rows in memory. Single project: call the existing read-context RPC once. Contractor display: unique party IDs from scoped contracts, batches of 50 to `c1_read_project_finance_parties`; compare expected IDs. No raw business_parties query or metadata request per contract.

### P2.4 Consistency and invariants

After the full read, compare detail sums to parent values only when detailCount>0, categorized budget line sum to approved header, payment currency/project to contract, and scope memberships. Recheck read-signatures (IDs/version/status/amount where applicable) for parents, budget headers and finance ledger rows. Retry the whole collection at most once when a change is detected; do not retry just the failing page against stale parents. Persistent failures return a controlled error. No SQL transaction snapshot claim.

Tests must assert tenant/company/project filters and concrete DB call counts, empty metadata behavior, many-page completion, errors on later pages, change/retry/final failure, cross-project item/contract rejection, category configuration/unmapped-parent issues, and no notes in overview projections. Do not weaken tests to “contains .in in source text”.

**PASS P2:** complete query tests; permission helper works under cost.read without management grants; real records unchanged. A pending helper migration must be separately reported, not hidden behind unit PASS.

## P3 — Services and eight thin GET routes

**Files:** service/routes + eight files below; route/service tests.
**Output interface:**

```ts
interface FinanceReadRepository {
  listProjects(scope: FinanceScope, query: ProjectDirectoryQuery): Promise<FinanceProjectList>
  overview(scope: FinanceScope, projectId: string): Promise<FinanceOverview>
  budget(scope: FinanceScope, projectId: string): Promise<FinanceBudget>
  ownerAdvances(scope: FinanceScope, projectId: string, query: ReceiptQuery): Promise<FinanceOwnerAdvances>
  subcontractors(scope: FinanceScope, projectId: string): Promise<FinanceSubcontractorList>
  subcontractor(scope: FinanceScope, projectId: string, partyId: string, query: PaymentQuery): Promise<FinanceSubcontractorDetail>
  subcontract(scope: FinanceScope, projectId: string, subcontractId: string, query: PaymentQuery): Promise<FinanceSubcontractDetail>
  itemDetails(scope: FinanceScope, projectId: string, itemId: string, query: ItemDetailQuery): Promise<FinanceItemDetails>
}
```

Define `FinanceScope` with actorId, tenantId, companyId, requestId, and permission codes from existing C1 request context. Schemas and query types from P1 own all corresponding names. The service validates inputs and cost.read before invoking repository methods.

Create route files:

```text
server/api/companies/[companyId]/project-finances.get.ts
server/api/companies/[companyId]/projects/[projectId]/finance/index.get.ts
server/api/companies/[companyId]/projects/[projectId]/finance/budget.get.ts
server/api/companies/[companyId]/projects/[projectId]/finance/owner-advances.get.ts
server/api/companies/[companyId]/projects/[projectId]/finance/subcontractors/index.get.ts
server/api/companies/[companyId]/projects/[projectId]/finance/subcontractors/[partyId].get.ts
server/api/companies/[companyId]/projects/[projectId]/finance/subcontracts/[subcontractId].get.ts
server/api/companies/[companyId]/projects/[projectId]/finance/items/[projectCostItemId]/details.get.ts
```

Use `runApiRoute(event, handler)` and `c1RequestContext(event, companyId)` as existing routes do. Export `createProjectFinanceRoutes({resolveContext,service})` for tests, and `createSupabaseProjectFinanceRoutes(event)` for runtime. Each file delegates to one route method. Avoid invented AppApiError.internal; constructor is `(statusCode,code,message,details)`.

Tests with actual route handlers and dependency-injected service must assert:
- Every endpoint enforces the context/permission boundary.
- Invalid UUID, array/duplicate query, unknown field, unsupported pageSize, inverted/invalid date range => INPUT_INVALID.
- Existing project, no rows => success with missing-data states.
- Wrong project for item, contract or party => RESOURCE_NOT_FOUND; no cross-project name disclosure.
- A detail direct load needs no overview request/cache and no project.register.manage or party.manage.
- Overview returns one coherent DTO; table/list filtering never mutates full summary.
- Receipt/payment totals exclude voided rows; filtered/page subtotals differ deliberately from full totals.
- Contractor grouping uses party ID and preserves multiple contracts, including inactive historical contracts with payments.
- A malformed DB/RPC success or later-page failure returns an error, not empty success.

Run focused route/service files via `pnpm exec vitest run` with their exact paths. Reuse the project's tested H3 test setup; do not create an HTTP server dependent on live credentials for unit tests.

**PASS P3:** all eight GETs are integrated and schema-validated; no legacy route was replaced; no new POST/PATCH route or write RPC.

## P4 — Frontend repository contract and legacy-writer boundary

**Files:** new HTTP repository, contracts.ts, repositories.client.ts, HTTP repository tests; compatibility inventory in the progress/handoff docs.

Produce `createHttpProjectFinanceRepository({companyId,client})` with the eight typed methods above, minus server scope. Each request captures a validated current company ID and uses the existing authenticated HTTP client. Use URLSearchParams for query serialization. No cache or fallback to fake data. Require an active company; do not silently fall back to PROTOTYPE_CONFIG.initialCompanyId for this new financial repository when no active company exists.

Add `projectFinance: ProjectFinanceRepository` to `RepositoryRegistry` and add `'projectFinance'` to `PrototypeRepositoryRegistry`'s Omit list. The inspected registry uses this exclusion specifically for HTTP-only modules; do not modify mock financial fixtures to satisfy a new required property. Instantiate the new HTTP repository in `app/plugins/repositories.client.ts` with a dynamic active-company getter and existing client.

Test exact URLs and query strings, strict schema rejection, module-disabled errors, current company captured per request, no-active-company rejection before network access, and no side effects when merely constructing the repository. A repository without a cache does not itself suppress a late UI promise; state that Antigravity must key state by tenant/company/project/item and use request generations or aborts when switching routes/companies. Do not claim a future Vue page's stale-response behavior has already been implemented.

Run regressions for existing `tests/unit/server/project-cost.service.spec.ts`, `tests/unit/repositories/http-project-cost-repository.spec.ts`, and `tests/unit/costs/project-costs.spec.ts` without changing old expectations.

Record this cutover inventory, do not execute it:

| Legacy dependency | This run | Future status retirement requirement |
|---|---|---|
| shared costs create/update/correct input schemas | Preserve | Replace/remove workStatus only after old clients retire |
| private/public c1_create_project_cost_item | Preserve | New input contract/default transition, audit/idempotency and category validation |
| private/public c1_update_project_cost_item | Preserve | Remove status mutation safely and preserve expectedVersion |
| private/public c1_correct_project_cost_item | Preserve | Preserve material-correction authority without a status field |
| old GET summaries and strict clients | Preserve | Migrate/remove all consumers, then retire |
| DB work_status + category nullable | Preserve | Apply reviewed script03 only after API writers and UI have switched |

Do not create a half-working new write API that silently injects unknown statuses or copies contract value into cost. Remaining legacy writer dependencies are explicitly deferred, not reported as already fixed.

**PASS P4:** typed new HTTP access ready for Antigravity; old reads/writes remain regression-green; no UI/prototype churn; future writer work clearly bounded.

## P5 — Verification, progress and handoff

- [ ] Run `pnpm verify:app` once at the final tree (unit, typecheck, lint, build). Do not rerun each constituent unnecessarily if this command already covers it; report each result from its output.
- [ ] Run `pnpm exec playwright test tests/e2e/project-costs.spec.ts` as a legacy route/UI regression against the existing test configuration. Do not rewrite UI screenshots to mask regression. This does not prove the new UI exists.
- [ ] Confirm metadata migration status/parity and `pnpm db:dev:dry-run` no pending replay. If exactly one read helper migration was added to the 47 baseline, expect 48, but list actual identities rather than forcing a count.
- [ ] Review generated DB types; run git diff --check and staged checks. Preserve any pre-existing status-only entries. Verify no work_status removal, no table/schema changes outside the new helper, no category seed or data mutation in migration content.
- [ ] Read business-data preservation fingerprints/counts from the external accepted checkpoint using the same projection; reconcile authorized concurrent operations if any, never repair a baseline by deleting records. Prefer no concurrent cleanup/agent writes during this run.
- [ ] Create Antigravity handoff with actual endpoint names, exported types, example empty/incomplete/recorded responses, route suggestions, source-of-truth per card, reason-code labels, timezone rules and request-key instructions. API samples use synthetic IDs and amounts only. Specify that a legacy subcontract category navigates to subcontractors, not legacy rows disguised as payments.
- [ ] Update progress document per phase. Final API changes remain uncommitted; no API push/PR/merge/deploy. Return file list, P0 checkpoint SHA, applied metadata identity and tests, current phase states and explicit limitations.

Final labels:
- `PASS_C1_FINANCE_API_IMPLEMENTATION`: scoped migration/runtime tests + local checks pass and data-state behavior matches spec. Does not mean real financial records have been reconciled or UI/status cutover completed.
- `PARTIAL_C1_FINANCE_API_IMPLEMENTATION`: a real usage interruption or pending Cloud helper gate; include exact resume step and tests completed. Do not repeat the whole plan on resume.
- `NEEDS_REVIEW_C1_FINANCE_API_IMPLEMENTATION`: security/target/schema/business contradiction outside this plan; preserve working state and identify only the unresolved decision.

## Acceptance matrix

| ID | Required result | Owner/tests |
|---|---|---|
| A01 | Separate three-file migration checkpoint, no old migration content edits | P0 git/hash evidence |
| A02 | New strict DTOs omit workStatus; old strict DTOs unchanged | P1 + P4 schema/legacy tests |
| A03 | Category ID grouping; missing parent != zero; inactive referenced categories visible | P1 reducer/P2 repository |
| A04 | Legacy subcontract + empty/new partial ledger => needs_reconciliation, not zero cost | P1 reducer/P3 service |
| A05 | Contract reference never cost; paid and retention counted once; voided rows excluded | P1 + P3 |
| A06 | Owner advances are receipts, not budget/profit; missing budget keeps margin unavailable | P1 + P3 |
| A07 | Unknown retention != recorded zero; referenceHeadroom null when unknown; signed negative allowed | P1 + P3 |
| A08 | Precision beyond JS safe integer and beyond single-row aggregate range | P1 money tests |
| A09 | Company timezone, instant-based ties, date-source winning row and inclusive filters | P1 dates/P3 |
| A10 | Complete keyset scans at smaller server cap, exact boundary, many IN chunks and read-limit failure | P2 repository |
| A11 | No per-project directory N+1, no per-contract party N+1, minimal overview projections | P2 query/call-counter tests |
| A12 | Auth/cost.read/module; narrow metadata, no management grant or service-role bypass | P2 SQL + P3 service/routes |
| A13 | Wrong company/project/contract/party rejected; direct GET works for empty valid project | P2/P3 |
| A14 | Full vs filtered vs page totals; no fake payments from legacy notes | P3 service |
| A15 | Multi-contract contractor grouping by ID and correct per-contract voucher attribution | P3 service/repository |
| A16 | Bounded whole-read retry and controlled persistent consistency error | P2 repository |
| A17 | Typed HTTP registration; active-company handling; no mock fallback | P4 HTTP tests |
| A18 | Legacy POST/PATCH, GET and existing UI regression remain working; no status drop | P4/P5 |
| A19 | Applied helper migration/type parity and rollback security evidence; real data unchanged | P2/P5 |
| A20 | Final verify:app, legacy Playwright, honest phase report and Antigravity handoff | P5 |

## Usage discipline

> Execution-policy override (2026-09-19): any usage-based voluntary stopping guidance in this plan is superseded. Continue through P2–P5 unless an actual runtime, access, security, schema, business, or user-interruption stop condition occurs.

Read this plan and its spec once. Use targeted reads for the named source paths, not a repository-wide audit. One sequential executor; no additional subagents or alternate redesigns. Fix ordinary typing/import/query details locally. Run focused tests while developing and a single full final gate. If usage is near exhaustion, record phase, changed files, exact failing command and next action in progress, stop safely and return PARTIAL. Never skip permissions, preservation or tests just to print PASS.
