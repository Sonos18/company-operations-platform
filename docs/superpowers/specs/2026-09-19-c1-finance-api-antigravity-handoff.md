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
- Owner receipts: recorded `project_owner_advances`; they never become budget, revenue, or subcontract cost.
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

Synthetic empty-project response:

```json
{
  "schemaVersion": 1,
  "project": {"projectId":"c1050000-0000-4000-8000-000000000030","projectCode":"SYN-P1","projectName":"Synthetic project","currencyCode":"VND","moneyScale":4,"timeZone":"Asia/Bangkok"},
  "summary": {
    "budget":{"state":"not_recorded","amount":null,"recordedCount":0},
    "ownerAdvances":{"state":"not_recorded","amount":null,"recordedCount":0},
    "cost":{"state":"not_recorded","amount":null,"recordedCount":0,"knownSubtotal":"0.0000"},
    "warrantyRetention":{"state":"not_recorded","amount":null,"recordedCount":0},
    "reference":{"kind":"none","amount":null},
    "margin":{"state":"unavailable","amount":null,"reasons":["NO_APPROVED_BUDGET","COST_INCOMPLETE","RETENTION_INCOMPLETE"]},
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
