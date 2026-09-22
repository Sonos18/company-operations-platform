# Taskovia C1 finance read API — implementation contract

**Status:** Proposed implementation contract for the user-approved business direction; not implemented by ChatGPT. Sending the accompanying execution prompt authorizes the bounded run described there.
**Owner:** CodeX: API, repositories, read contracts, tests. Antigravity: subsequent UI work.
**Repository:** Sonos18/company-operations-platform.
**Source anchor read from GitHub:** `9c15f4f0687661f0a0b47126d1cf6cc7c28607e9` on `main`.
**Execution method:** Sequential on the existing `main` workspace; no worktree, parallel agent, new branch, or compulsory role handoff.

## 1. Outcome and boundaries

Deliver a new status-free finance API beside the working legacy cost API. It serves project financial cards, explicit cost categories, investor advances, subcontractor/contract summaries, and paid-voucher detail. It must work honestly with today's incomplete financial records. Missing source data is a response state, not a reason to invent figures or stop implementation.

Keep these legacy routes and their existing DTOs/writers compatible until Antigravity has migrated all consumers:

- `GET /api/companies/:companyId/project-costs`
- `GET /api/companies/:companyId/projects/:projectId/project-costs`
- `GET /api/companies/:companyId/project-costs/:projectCostItemId/details`
- Existing POST/PATCH cost commands and create/update/correct RPCs.

Do not add new fields to the legacy strict responses just because they are additive in JSON. Their Zod clients are strict. New read models have a separate namespace and no `workStatus`, `acceptedValue`, `inProgressValue`, or `unknownStatusValue`.

This run is not final status retirement. `work_status` remains in DB and legacy writes. `cost_category_id` remains nullable. Script 03 is excluded. API readiness does not imply data reconciliation or readiness to drop the old column.

## 2. Confirmed baseline versus observations

The user accepted `PASS_C1_FINANCE_MIGRATION_SYNC`: two recovered/new migration files and generated DB types are local, not yet committed. GitHub still showed the source anchor above when this package was prepared. Do not call those local artifacts remotely reviewed.

Cloud DEV read during planning confirmed 47 migration records, including `20260919143500_c1_project_cost_read_context` and `20260919174116_c1_project_finance_expansion`. Five categories and nine classified cost parents exist; 432 legacy details exist. The five other finance tables are empty. These are observations to refresh, not assertions to overwrite newer legitimate work.

The category cleanup request `71b4e580-cdf6-4574-b283-b0103d6de9a3` explains five category inserts and nine category assignments. Preserve it. Do not rerun migration repair, migration fetch, the expansion SQL, or the cleanup.

## 3. Business meaning

### 3.1 Categories and ordinary cost

VQH category codes: `materials`, `machinery`, `direct_labor`, `subcontract_labor`, `other`. Read the company's real `cost_categories` rows. Match existing cost parents by `cost_category_id`, never by description or a hardcoded project UUID. Include inactive categories that still contain records; do not hide historical amounts. Do not seed missing categories in GET.

The four non-subcontract categories keep the existing recorded parent/detail amount meaning. Do not relabel them all as bank payments. Check the sum of complete detail rows against a parent when details exist. A parent with zero details is valid and retains its recorded amount. A missing parent is `not_recorded`, not a confirmed zero.

`subcontract_labor` uses recorded `project_subcontract_payments.paid_amount_text`, excluding `voided` rows. Contract value is a reference and never cost. Do not combine those payments with the legacy subcontract parent amount.

### 3.2 Advances, contract value and retention

`project_owner_advances`: investor/owner -> company cash received; never company -> subcontractor payments. Only `recorded` rows contribute to totals. A record may have an unknown business date. No source-note parsing to manufacture a receipt or voucher.

`project_subcontracts.contract_value_text`: editable reference value, nullable, not progress and not a cash amount. The new API is GET-only. Report the reference and paid amounts separately; do not implement a hard posting limit or edit endpoint in this run.

`project_subcontract_payments.warranty_retention_amount_text`: recorded retention snapshot, not another paid amount. NULL means unrecorded; `"0"` means recorded zero. Read `retention_rate_bps`; do not hardcode 500. No release/refund lifecycle exists. Call the result recorded warranty retention, not remaining/overdue/currently held retention.

`referenceHeadroom` may be computed only when contract value is present and all relevant recorded payment rows have known retention amounts. It is reference minus paid minus recorded retention, can be negative, and is not an account payable. Otherwise return null and the reason. Never assume unknown retention is zero.

### 3.3 Budget, reference card and margin

Use at most one approved budget per project/currency. Preserve `detail_mode=summary|categorized`; do not fabricate category lines for a summary-only budget. For categorized budgets read all lines and validate the header total. Draft, cancelled and superseded versions are not the approved card value.

The card selects: approved budget -> recorded owner advances when at least one exists -> none. Its `kind` drives the label; do not put an advance under a Budget heading. Advances NEVER substitute for the budget in margin arithmetic.

The desired formula is approved reference minus cost minus recorded retention. Its interpretation as profit requires a revenue-side reference rather than an internal cost budget. The current schema has no persisted semantic discriminator, and today's projects have no approved budget. Therefore production `margin.amount` is null with explicit reasons; do not introduce a new schema flag, per-project hardcode, environment override, or assumed basis in this run. Implement the pure calculation only for explicitly classified inputs in unit tests. Record this semantic prerequisite for the next data/business checkpoint rather than reopening the whole design.

## 4. Transitional completeness — required behavior

Use `state: recorded | not_recorded | needs_reconciliation` for money observations. Required fields are `amount: string|null` and `recordedCount: integer>=0`. Amount is non-null only for `recorded`. Zero rows with a known successful read produce `not_recorded`, never a transport-error fallback.

The new tables being empty does NOT prove there were no historical subcontract payments. Whenever a legacy subcontract parent has a nonzero amount or any details, the new subcontract category stays `needs_reconciliation`, even if some new payments later appear. This schema has no authoritative cutover marker. Do not use equal totals, category assignment, old work_status, financial_scope_inventory_status, or “at least one payment exists” as a migration-completeness signal.

Expose verified new-ledger totals separately as `recordedPaymentsTotal` and `recordedPaymentCount`. Incomplete legacy coverage does not stop browsing verified records, but it keeps the combined category and project cost amount null. Do not infer an outstanding retention amount from legacy sources.

For ordinary categories with missing parents use `not_recorded`. For the subcontract category with no legacy rows and no recorded new payments, use `not_recorded`; its mathematical new-ledger subtotal is still zero, but it is not a confirmed category cost. Project `cost.amount` is non-null only if every included cost category is recorded and no unmapped parent exists. `cost.knownSubtotal` sums only categories whose cost state is recorded; it must never be displayed as complete project cost. This is deliberately conservative until a separate reconciliation checkpoint establishes missing-versus-zero and canonical cutover.

Unmapped parents yield an explicit issue and block the full total; do not silently exclude them. Missing category configuration yields `CATEGORY_CONFIGURATION_INCOMPLETE`. A valid project with no cost rows still returns 200, settings and categories, with not-recorded metrics. An inaccessible or nonexistent project remains 404/appropriate access error.

Assertions for the current imported projects, verified from the external operator checkpoint rather than copied into automated fixtures:
- Both have legacy subcontract data requiring reconciliation; complete cost and margin remain null.
- The project with no machinery parent must show that category as not_recorded, not confirmed zero.
- Neither has an approved budget or a canonical owner advance, so reference.kind is none.
- Derive exact private amounts from the external checkpoint during read-only verification; do not commit real financial amounts or business IDs to shared fixtures.

## 5. HTTP surface

Prefix P = `/api/companies/:companyId/projects/:projectId/finance`.

| Method and path | Result / purpose |
|---|---|
| GET `/api/companies/:companyId/project-finances` | Cursor-paged project cards, including valid empty projects; aggregate each page in batches, not an overview request per project. |
| GET P | One overview response: identity/settings, summary and category rows. Categories are included here; do not build an unnecessary separate category endpoint. |
| GET P`/budget` | Approved header or null and its complete categorized lines; no budget editing/history UI. |
| GET P`/owner-advances` | Paged receipt records, full recorded totals and explicitly separate filtered subtotal. |
| GET P`/subcontractors` | Contractor-grouped summary plus contract summaries. One contractor can own several contracts; group by party ID, never by display name. |
| GET P`/subcontractors/:partyId` | Bookmarkable party-within-project detail: related contracts and paged payments carrying contract ID/reference. |
| GET P`/subcontracts/:subcontractId` | Bookmarkable contract detail and paged paid vouchers, full totals and reference headroom. |
| GET P`/items/:projectCostItemId/details` | Status-free ordinary item detail, dates/provenance and pagination. Legacy subcontract items return an explicit `kind=legacy_subcontract` response with no fabricated voucher list; UI uses the subcontractor route. |

Project-directory query: optional UUID `afterId`, `pageSize` 25/50/100 (default 25).
Detail-list query: `page` positive integer (default 1), `pageSize` 25/50/100, `q` <=200 characters, optional inclusive `dateFrom` and `dateTo`, `sort=newest|oldest` default newest. Reject duplicate/array parameters, malformed UUIDs/dates, dateFrom>dateTo, and unknown query fields. Retention filter for cost-item details: `all|warranty|other|no_recorded_retention`. For subcontract payments use `all|warranty|no_recorded_retention` because that table has no other-retention kind. Receipt lists have no retention filter. List/detail defaults show recorded rows only; void history is out of this initial read UI.

Query filtering/sorting happens after complete scoped loading and before paging. Return actual effective page and page count; clamp a now-out-of-range page to the last available page, minimum 1. Full totals never depend on filters or the rendered slice.

## 6. Required DTO envelope and components

All new success objects are strict Zod schemas. No missing enrichment hidden with defaults. Use `.nullable()` for true absence. All totals use decimal strings. Retain the current API error envelope.

```ts
interface FinanceProjectContext {
  projectId: string; projectCode: string; projectName: string;
  currencyCode: string; moneyScale: number; timeZone: string;
}
interface MoneyObservation {
  state: 'recorded' | 'not_recorded' | 'needs_reconciliation';
  amount: string | null; recordedCount: number;
}
interface FinanceIssue {
  code: 'UNMAPPED_COST_ITEM' | 'CATEGORY_CONFIGURATION_INCOMPLETE'
    | 'MISSING_CATEGORY_RECORD' | 'LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED'
    | 'RETENTION_NOT_RECORDED' | 'BUDGET_BASIS_UNCONFIRMED';
  categoryId: string | null;
}
interface FinanceSummary {
  budget: MoneyObservation;
  ownerAdvances: MoneyObservation;
  cost: MoneyObservation & { knownSubtotal: string };
  warrantyRetention: MoneyObservation;
  reference: { kind: 'approved_budget' | 'owner_advance' | 'none'; amount: string | null };
  margin: { state: 'unavailable'; amount: null; reasons: string[] };
  issues: FinanceIssue[];
}
interface FinanceCategoryRow {
  categoryId: string; code: string; name: string; displayOrder: number; isActive: boolean;
  itemId: string | null; description: string | null; businessReference: string | null;
  cost: MoneyObservation; detailCount: number;
  latestRecordedDate: string | null;
  latestRecordedDateSource: 'business_date' | 'created_at' | null;
  warrantyRetention: MoneyObservation;
  recordedPaymentsTotal: string | null;
  recordedPaymentCount: number;
  legacyReconciliationRequired: boolean;
}
interface FinanceOverview {
  schemaVersion: 1; project: FinanceProjectContext;
  summary: FinanceSummary; categories: FinanceCategoryRow[];
}
```

`recordedPaymentsTotal` is a calculated string for the subcontract category (including `0.0000` for an empty new ledger), null for other categories. It is a diagnostic ledger total, not the category's complete cost. `margin.reasons` uses the fixed codes in the plan; do not return arbitrary human text from the DB.

Read rows must include explicit `recordStatus` where relevant, required raw business date (nullable), createdAt, effectiveDate and dateSource. For legacy item details dateSource is `relevant_date|created_at`; receipts use `received_date|created_at`; payments use `payment_date|created_at`. Normalize those to `business_date|created_at` only in generic aggregate metadata.

Full financial summaries count retained rows, NOT distinct contractors. Name this count `recordedRetentionRowCount` in subcontract summaries; expose a separate contractor count only if actually computed. Do not label a row count as number of contractors.

## 7. Security, currency, reading and consistency

Resolve company via existing authenticated tenancy context; require cost.read before data access. Use user-scoped Supabase client only. Reuse `c1_read_project_cost_read_context(target_company_id,target_project_id)` for the project identity, configured timezone, currency fallback and empty-project validation. Do not call management-only project/settings endpoints.

Two bounded metadata read RPCs are needed in ONE new forward migration: company project-directory/settings and names of parties linked to the scoped project's subcontracts. Exact design is in `reference/METADATA_SQL.md`. They return minimal metadata only, validate auth/cost.read/module/company, and mirror the repository's existing audited private/public read-helper pattern. No broad party SELECT grant, role assignment, service-role client, or management permission is added.

Read persisted money text fields, not generated numeric JSON values. Rows can contain 16 integer + 4 fractional digits; sums may exceed a single-row range. Use an isolated Decimal constructor with precision 60 and separate sum/signed-sum schemas; do not change global Decimal configuration.

Determine the project currency from the unique currency among involved ordinary cost parents, approved budget, recorded receipts, contracts and recorded payments; default from company settings only when none exists. A conflict is a controlled 500 INTERNAL_ERROR with reason MIXED_CURRENCY; never sum currencies or invent FX.

All tables read in batches beyond PostgREST caps. Query by ascending UUID id, with gt(id,lastId) and limit(500); continue until an empty response, even if an earlier response is short. Validate monotonic IDs, scope, duplicate IDs and pagination progress. Batch IN lists at 50 IDs. No arbitrary SQL expressions in select/order. Record actual query counts, including metadata and terminal empty reads.

Use complete projections for summaries, without raw note, quantity or unit-price payloads. Apply a 50,000-row resource guard per table-scan; if exceeded, return a controlled error, NEVER partial success or silent Top-N. This is a protective bound, not proof all larger datasets are supported. Detailed server-side scalable filtering beyond that bound is a future optimization, not a hidden truncation.

After collection, verify parent/detail sums and re-read relevant parent/header/version signatures for changes. Retry the entire aggregate once (two total attempts, 50 ms delay) on detected inconsistency. New ledger rows have versioned writes; include their ID/version/status signatures in the recheck. Changes to legacy non-amount metadata without version updates cannot be treated as a guaranteed snapshot. Multi-request reads remain best-effort consistency guards, not a PostgreSQL transaction snapshot. A persistent mismatch returns `new AppApiError(500,'INTERNAL_ERROR',safeMessage,{reason:'DATA_CONSISTENCY_ERROR'})`.

Preserve MODULE_DISABLED as code PERMISSION_DENIED with details.reason MODULE_DISABLED. Map failed/partial reads to errors, never empty successful data. Project/item/contract/party mismatches return RESOURCE_NOT_FOUND without leaking foreign ownership.

## 8. Delivery definition

PASS requires new read behavior, legacy regression, scoped authorization tests, migration/type synchronization for the new read helpers, and the verification commands in the plan. Empty real subcontract/budget/receipt tables must not prevent that PASS when all incomplete-data behavior is tested.

Separate statuses: implementation readiness; metadata migration application; real-data reconciliation; old-UI cutover. This run must not claim the last two are complete. No synthetic data is committed to Cloud; no further cleanup runs concurrently. No UI/chart changes or dependency installation are needed.
