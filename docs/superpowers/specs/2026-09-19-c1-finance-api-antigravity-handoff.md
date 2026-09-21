# C1 finance API — Antigravity handoff

## Scope delivered

The new status-free read namespace is ready beside the legacy Project Cost API. It uses the active authenticated company, `cost.read`, the existing project read-context RPC, narrow finance metadata RPCs, scoped keyset reads, Decimal string totals, and strict Zod response schemas.

No UI, chart, finance write API, `work_status` removal, category backfill, or legacy writer cutover is included.

## Endpoints

| Method | Endpoint | Client method |
|---|---|---|
| GET | `/api/companies/:companyId/project-finances` | `projectFinance.listProjects` |
| GET | `/api/companies/:companyId/projects/:projectId/finance` | `overview` |
| GET | `/api/companies/:companyId/projects/:projectId/finance/budget` | `budget` |
| GET | `/api/companies/:companyId/projects/:projectId/finance/owner-advances` | `ownerAdvances` |
| GET | `/api/companies/:companyId/projects/:projectId/finance/subcontractors` | `subcontractors` |
| GET | `/api/companies/:companyId/projects/:projectId/finance/subcontractors/:partyId` | `subcontractor` |
| GET | `/api/companies/:companyId/projects/:projectId/finance/subcontracts/:subcontractId` | `subcontract` |
| GET | `/api/companies/:companyId/projects/:projectId/finance/items/:projectCostItemId/details` | `itemDetails` |

Directory queries use `afterId` and `pageSize=25|50|100`. Detail queries use `page`, `pageSize`, `q`, inclusive `dateFrom`/`dateTo`, `sort`, and the endpoint-specific retention filter. Unknown, duplicate, array-valued, malformed, or inverted values are `INPUT_INVALID`.

## Source of truth

- Overview categories and project cost: `project_cost_items` grouped by `cost_category_id`; descriptions never classify a row.
- Ordinary detail and retention: `project_cost_item_details`; parent/detail sums are checked.
- Subcontract cost: recorded, non-voided `project_subcontract_payments`; contract value is reference only.
- Owner receipts: recorded `project_owner_advances` scoped to tenant/company/project. The imported accounting-source rows are present in Cloud DEV and carry `source_reference`; they are not bank-verified. Raw source cells, source figures, contract values, and outgoing subcontract advances are not added to this total.
- Budget: the single approved `project_budget_versions` row and its categorized lines when `detail_mode=categorized`.
- Contractor identity: linked party IDs from `c1_read_project_finance_parties`; grouping is by party ID, not display name.
- Dates: explicit business date wins; otherwise the created timestamp is converted using the company's configured IANA timezone.
- Row date provenance remains source-specific: ordinary details use `relevant_date|created_at`, receipts use `received_date|created_at`, payments use `payment_date|created_at`; aggregate category metadata normalizes this to `business_date|created_at`.

## Response states

Money observations are explicit:

```json
{"state":"not_recorded","amount":null,"recordedCount":0}
```

An empty valid project is still HTTP 200. A legacy subcontract parent with a non-zero amount or any detail remains `needs_reconciliation`, even when new payments exist. New verified payments remain separate as `recordedPaymentsTotal`/`recordedPaymentCount`; they are never added to the legacy parent.

`margin.amount` is currently always `null`. The API returns fixed reasons such as `NO_APPROVED_BUDGET`, `COST_INCOMPLETE`, `RETENTION_INCOMPLETE`, and `BUDGET_BASIS_UNCONFIRMED`. Unknown retention is not zero. `referenceHeadroom` is `null` when contract value or a recorded retention value is missing and may be negative when computable.

## Management card fields (receipt import checkpoint)

The older empty-owner-advance baseline has been superseded by recorded rows in `project_owner_advances`. Directory summaries and overviews share `summary.management`:

`project.operationalState` is the persisted `projects.operational_state` value (`active|completed|paused|unknown`); finance rows never infer or change it. The purpose-specific, bounded `cost.read` metadata RPC was applied to Cloud DEV as `20260920082415_c1_project_finance_operational_state_read.sql`. The earlier local identity `20260920143647` was never applied and has been removed from the active migration directory. The applied SQL rejects non-one-dimensional UUID arrays before `array_position()`; the local file matches the exact applied history payload. Cloud history has 49 entries, and the c105 rollback fixture was independently verified by the Cloud operator.

- `receipts` contains `state`, decimal `amount`, `recordedCount`, `origin=canonical_ledger|none`, `quality=accounting_source_unverified|not_recorded`, `coverage=recorded_rows_only|none`, and distinct `sourceReferences`. `recorded_rows_only` does not certify lifetime completeness or bank settlement. Notes are not parsed for amounts.
- `reference` prefers an approved budget, then recorded owner receipts. Its `basis` is `unconfirmed_cost_budget|recorded_owner_receipts|none`; a cost budget is not treated as revenue.
- `result` is `provisional` only for an owner-receipt basis with complete compatible cost and known retention. Components are `receipts`, gross `cost`, and `independentlyHeldRetention`. Ordinary-cost retention is already inside gross cost and is not subtracted again. Approved-budget basis remains unavailable until its business meaning is confirmed. `margin` retains its separate accounting meaning and stays unavailable.
- `headline` selects a provisional result if available, otherwise numeric owner receipts if recorded, otherwise unavailable. With incomplete legacy subcontract cost, the result remains unavailable while the owner-receipts headline remains numeric. `cost.knownSubtotal` is partial recorded cost, never completed project cost.

Synthetic incomplete-cost summary excerpt (amounts are illustrative):

```json
{
  "ownerAdvances":{"state":"recorded","amount":"100.0000","recordedCount":2},
  "cost":{"state":"needs_reconciliation","amount":null,"recordedCount":1,"knownSubtotal":"10.0000"},
  "management":{
    "receipts":{"state":"recorded","amount":"100.0000","recordedCount":2,"origin":"canonical_ledger","quality":"accounting_source_unverified","coverage":"recorded_rows_only","sourceReferences":["synthetic/J3","synthetic/J4"]},
    "reference":{"kind":"owner_receipts","amount":"100.0000","basis":"recorded_owner_receipts"},
    "result":{"state":"unavailable","amount":null,"basis":"owner_receipts","components":{"receipts":"100.0000","cost":null,"independentlyHeldRetention":"10.0000"},"reasons":["COST_INCOMPLETE"]},
    "headline":{"kind":"owner_receipts","amount":"100.0000","basis":"recorded_owner_receipts"}
  }
}
```

Tooltip mapping: `accounting_source_unverified` → “Recorded from accounting sources; bank confirmation not established”; `recorded_rows_only` → “Total of recorded receipt rows; lifetime completeness not established”; `COST_INCOMPLETE` → “Full project cost is unavailable”; `RETENTION_INCOMPLETE` → “A separately held retention amount is not fully recorded”; `BUDGET_BASIS_UNCONFIRMED` → “The approved budget is a cost budget, not confirmed revenue.” These are UI copy suggestions, not new persisted statuses.

The valid directory/overview browser fixtures in `tests/e2e/project-costs.spec.ts` now include required `project.operationalState` and `summary.management` fields, including the company-switch and empty-project cases. They are parsed with the exported strict response schemas before browser tests run. Intentional error responses remain unchanged. The complete mocked Costs Playwright run passed 15/15 after this repair. Vue components and product UI behavior were not edited in this backend handoff.

## UI adoption and verification status (Antigravity checkpoint)

- **UI integration delivered**:
  - `/costs` (Directory) and `/costs/:projectId` (Detail) updated to bind `summary.management` and `project.operationalState`.
  - Main Headline (Position 1): Displays server-selected headline (`provisional_result` with basis caption "Theo số đã thu" / "Theo dự toán", or `owner_receipts` with receipt total and caption "Theo sổ thu kế toán · Chưa đối soát ngân hàng", or `unavailable` with documented margin reasons without fabricating zero).
  - Reference (Position 2): Displays approved budget or owner receipts reference ("Dự toán được duyệt" vs "Thu từ chủ đầu tư") accompanied by an accessible info disclosure button and popover explaining that receipts represent advances from accounting sources and are not an approved budget or final margin.
  - Cost (Position 3): Displays prominent recorded subtotal with explicit qualifier "Phần đã ghi nhận · Chưa đối soát" when incomplete or requiring reconciliation; never converts empty subtotal into confirmed zero cost.
  - Project Operational State: Displays persisted `project.operationalState` badges (`active` → "Đang thực hiện", `completed` → "Hoàn thành", `paused` → "Tạm dừng", `unknown` → "Chưa cập nhật trạng thái").
  - Accessibility & Interaction: Replaced outer card link with interactive card region and inner title link to avoid nested interactive button violations; popover supports pointer hover, keyboard focus, click/touch pinning, Escape dismissibility, and outside click dismissibility.
- **Verification status**:
  - `tests/unit/costs/finance-display.spec.ts`: 26/26 passed.
  - `tests/e2e/project-costs.spec.ts`: 18/18 passed in Playwright (including 1440px desktop, 390px mobile viewport, and Axe accessibility assertions).
  - `pnpm verify:app`: 138 test files, 1,119 unit tests passed; typecheck passed; lint passed; build succeeded.
  - `git diff --check`: passed (0 issues).
- **Combined Acceptance / Real HTTP Smoke Check Ownership**:
  - `LOCAL_UI_VERIFICATION` = PASS.
  - `LIVE_HTTP` = `NOT_RUN_REQUIRES_LOGIN`.
  - The local development server and UI integration are fully validated against strict Zod response schemas and browser tests. A live authenticated check against Supabase Cloud DEV requires an active, authorized user session. Remaining manual smoke check steps are documented in the walkthrough/delivery report.

Synthetic empty-project response:

```json
{
  "schemaVersion": 1,
  "project": {"projectId":"c1050000-0000-4000-8000-000000000030","projectCode":"SYN-P1","projectName":"Synthetic project","currencyCode":"VND","moneyScale":4,"timeZone":"Asia/Bangkok","operationalState":"unknown"},
  "summary": {
    "budget":{"state":"not_recorded","amount":null,"recordedCount":0},
    "ownerAdvances":{"state":"not_recorded","amount":null,"recordedCount":0},
    "cost":{"state":"not_recorded","amount":null,"recordedCount":0,"knownSubtotal":"0.0000"},
    "warrantyRetention":{"state":"not_recorded","amount":null,"recordedCount":0},
    "reference":{"kind":"none","amount":null},
    "margin":{"state":"unavailable","amount":null,"reasons":["NO_APPROVED_BUDGET","COST_INCOMPLETE","RETENTION_INCOMPLETE"]},
    "management":{
      "receipts":{"state":"not_recorded","amount":null,"recordedCount":0,"origin":"none","quality":"not_recorded","coverage":"none","sourceReferences":[]},
      "reference":{"kind":"none","amount":null,"basis":"none"},
      "result":{"state":"unavailable","amount":null,"basis":"none","components":{"receipts":null,"cost":null,"independentlyHeldRetention":null},"reasons":["NO_REFERENCE","COST_INCOMPLETE","RETENTION_INCOMPLETE"]},
      "headline":{"kind":"unavailable","amount":null,"basis":"none"}
    },
    "issues":[
      {"code":"MISSING_CATEGORY_RECORD","categoryId":"c1050000-0000-4000-8000-000000000040"},
      {"code":"MISSING_CATEGORY_RECORD","categoryId":"c1050000-0000-4000-8000-000000000041"},
      {"code":"MISSING_CATEGORY_RECORD","categoryId":"c1050000-0000-4000-8000-000000000042"},
      {"code":"MISSING_CATEGORY_RECORD","categoryId":"c1050000-0000-4000-8000-000000000043"},
      {"code":"MISSING_CATEGORY_RECORD","categoryId":"c1050000-0000-4000-8000-000000000044"}
    ]
  },
  "categories":[
    {"categoryId":"c1050000-0000-4000-8000-000000000040","code":"materials","name":"materials","displayOrder":1,"isActive":true,"itemId":null,"description":null,"businessReference":null,"cost":{"state":"not_recorded","amount":null,"recordedCount":0},"detailCount":0,"latestRecordedDate":null,"latestRecordedDateSource":null,"warrantyRetention":{"state":"not_recorded","amount":null,"recordedCount":0},"recordedPaymentsTotal":null,"recordedPaymentCount":0,"legacyReconciliationRequired":false},
    {"categoryId":"c1050000-0000-4000-8000-000000000041","code":"machinery","name":"machinery","displayOrder":2,"isActive":true,"itemId":null,"description":null,"businessReference":null,"cost":{"state":"not_recorded","amount":null,"recordedCount":0},"detailCount":0,"latestRecordedDate":null,"latestRecordedDateSource":null,"warrantyRetention":{"state":"not_recorded","amount":null,"recordedCount":0},"recordedPaymentsTotal":null,"recordedPaymentCount":0,"legacyReconciliationRequired":false},
    {"categoryId":"c1050000-0000-4000-8000-000000000042","code":"direct_labor","name":"direct_labor","displayOrder":3,"isActive":true,"itemId":null,"description":null,"businessReference":null,"cost":{"state":"not_recorded","amount":null,"recordedCount":0},"detailCount":0,"latestRecordedDate":null,"latestRecordedDateSource":null,"warrantyRetention":{"state":"not_recorded","amount":null,"recordedCount":0},"recordedPaymentsTotal":null,"recordedPaymentCount":0,"legacyReconciliationRequired":false},
    {"categoryId":"c1050000-0000-4000-8000-000000000043","code":"subcontract_labor","name":"subcontract_labor","displayOrder":4,"isActive":true,"itemId":null,"description":null,"businessReference":null,"cost":{"state":"not_recorded","amount":null,"recordedCount":0},"detailCount":0,"latestRecordedDate":null,"latestRecordedDateSource":null,"warrantyRetention":{"state":"not_recorded","amount":null,"recordedCount":0},"recordedPaymentsTotal":"0.0000","recordedPaymentCount":0,"legacyReconciliationRequired":false},
    {"categoryId":"c1050000-0000-4000-8000-000000000044","code":"other","name":"other","displayOrder":5,"isActive":true,"itemId":null,"description":null,"businessReference":null,"cost":{"state":"not_recorded","amount":null,"recordedCount":0},"detailCount":0,"latestRecordedDate":null,"latestRecordedDateSource":null,"warrantyRetention":{"state":"not_recorded","amount":null,"recordedCount":0},"recordedPaymentsTotal":null,"recordedPaymentCount":0,"legacyReconciliationRequired":false}
  ]
}
```

## UI integration notes

Use `schemaVersion` and the response `state`/`issues` as display inputs. Do not render `knownSubtotal` as complete project cost. A `subcontract_labor` legacy row navigates to the contractor endpoint; it is not a payment voucher list. Key client state by company, project, category/item, party, or contract and use request generations or aborts when switching those keys. The repository intentionally has no cache and does not claim stale-response suppression.

Keep the existing legacy Project Cost readers and POST/PATCH writers until all consumers migrate. `work_status` and nullable `cost_category_id` remain required by that compatibility surface.
