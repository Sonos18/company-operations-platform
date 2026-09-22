# C1 Accounting Write Backend — Antigravity Handoff

## Scope and authority

This document describes the implemented backend contract for a later Antigravity UI task. It contains no visual design. Company context comes from `:companyId` plus the authenticated server session; clients never send tenant, actor, permission, publication attribution, or audit identity.

All request bodies are strict. Money is a nonnegative decimal string with at most four fractional digits unless a positive value is explicitly required. IDs and `Idempotency-Key` values are UUIDs.

## Capability ownership

| Capability | Backend responsibility |
| --- | --- |
| `cost.manage` | Create a cost draft and update its operational metadata while draft. |
| `cost.prepare` | Replace draft financial details/source links; create, finalize, and link evidence; read draft state. |
| `cost.publish_import` | Explicitly activate one ready draft as published official C1 data. |
| `cost.correct` | Correct a published ordinary cost through a reasoned, versioned, audited command. |
| `cost.record_cash` | Record or void actual subcontract payments in `project_subcontract_payments`. |
| `cost.read` | Read published Project Cost and Director finance data only. |
| `cost.source.read` | List finalized evidence metadata and immutable links. |
| `cost.file.read` | Obtain a 60-second signed URL for linked finalized evidence bytes. |

No sibling mutation permission substitutes for another. The VQH Accountant has all five mutation permissions plus `cost.read`, `cost.source.read`, and `cost.file.read`.

## Lifecycle and editability

Persisted publication state is only `draft | published`; `workStatus` remains `unknown | in_progress | accepted` business state.

- A draft has no official financial effect and is absent from normal Project Cost and finance GET results.
- “Prepared” is computed as `publishReadiness`, not persisted.
- Draft operational edits use `cost.manage`; complete financial snapshots use `cost.prepare`.
- Publish is never implicit on save.
- Once published, draft mutation endpoints return a lifecycle conflict. Financial or materially significant changes use correction.
- Evidence can be added to a published cost without changing amount, version, or publication state.
- Cash is never represented by changing a Project Cost amount.

`publishReadiness` is `{ ready: boolean, blockingCodes: ProjectCostPublishBlockingCode[] }`, where codes are `FINANCIAL_DETAILS_REQUIRED`, `SOURCE_NOT_SHARED`, `SOURCE_REVIEW_BLOCKING`, `EVIDENCE_NOT_FINALIZED`, or `SUBCONTRACT_COST_MODEL_UNSUPPORTED`.

## Project Cost APIs

### Create draft

`POST /api/companies/:companyId/projects/:projectId/project-costs`

- Permission: `cost.manage`.
- Header: required `Idempotency-Key`.
- Body includes the path `projectId` for agreement validation:

```json
{
  "projectId": "uuid",
  "description": "Concrete delivery",
  "costCategoryId": "uuid",
  "businessReference": "REF-01",
  "partyId": "uuid",
  "engagementId": "uuid",
  "componentId": "uuid",
  "relevantDate": "2026-09-22",
  "workStatus": "unknown"
}
```

Optional fields may be omitted. Amount, currency, source IDs, evidence IDs, and publication fields are rejected. New `subcontract_labor` drafts return `SUBCONTRACT_COST_MODEL_UNSUPPORTED`.

Response: `{ "id": "uuid", "version": 0, "publicationState": "draft", "replayed": false }`.

### Update draft operations

`PATCH /api/companies/:companyId/project-costs/:projectCostItemId`

- Permission: `cost.manage`.
- No idempotency header.
- Body: `expectedVersion` plus at least one of `description`, `costCategoryId`, `businessReference`, `partyId`, `engagementId`, `componentId`, `relevantDate`, or `workStatus`. Nullable hierarchy/reference/date fields may be cleared with `null`.
- Correction fields such as `reason`, `amount`, or `financialChanges` are rejected.

Response is `{ id, version, publicationState: "draft", replayed: false }`.

### Prepare complete financial snapshot

`PUT /api/companies/:companyId/project-costs/:projectCostItemId/financials`

- Permission: `cost.prepare`.
- Body:

```json
{
  "expectedVersion": 1,
  "currencyCode": "VND",
  "details": [{
    "lineNo": 1,
    "detailKind": "line_item",
    "description": "Accepted work",
    "quantity": "1.0000",
    "unitCode": "lot",
    "unitPrice": "100.0000",
    "amount": "100.0000",
    "retentionKind": null,
    "retentionRateBps": null,
    "retentionAmount": null,
    "relevantDate": "2026-09-22",
    "reference": "ACT-01",
    "note": null
  }],
  "sourceFigureIds": []
}
```

`details` is a nonempty complete ordered replacement; amount is derived from its sum. Explicit zero is valid. Source figure IDs are unique, same-project/company, shared, and free of blocking review issues.

Response: `{ id, version, publicationState: "draft", amount, detailCount, publishReadiness, replayed: false }`.

### Read draft state

- `GET /api/companies/:companyId/projects/:projectId/project-cost-drafts`
- `GET /api/companies/:companyId/project-costs/:projectCostItemId/draft`
- Permission: `cost.prepare`.

Each strict draft object contains operational fields, nullable derived `amount`, company currency, `version`, complete detail rows, `sourceFigureIds`, timestamps, and `publishReadiness`. Evidence is read separately. A published ID on the draft route returns `RESOURCE_NOT_FOUND`.

### Publish

`POST /api/companies/:companyId/project-costs/:projectCostItemId/publish`

- Permission: `cost.publish_import`.
- Header: required `Idempotency-Key`.
- Body: `{ "expectedVersion": 2 }`.
- Response: `{ id, version, publicationState: "published", replayed }`.

The command locks the draft and validates readiness transactionally. Same-key replay returns the original result. A changed payload returns `IDEMPOTENCY_CONFLICT`; a different key after success returns `COST_ALREADY_PUBLISHED`.

### Correct published cost

`POST /api/companies/:companyId/project-costs/:projectCostItemId/corrections`

- Permission: `cost.correct`.
- Header: required `Idempotency-Key`.
- Body requires `expectedVersion`, nonblank `reason`, and at least one changes object:

```json
{
  "expectedVersion": 3,
  "reason": "Correct source transcription",
  "operationalChanges": { "workStatus": "accepted" },
  "financialChanges": {
    "currencyCode": "VND",
    "details": [{ "lineNo": 1, "detailKind": "line_item", "description": "Corrected", "amount": "110.0000" }],
    "sourceFigureIds": []
  }
}
```

`financialChanges`, when present, is a complete replacement snapshot. The current canonical projection updates once; immutable audit history stores complete before/after parent, detail, and source snapshots with reason and request identity. Legacy `subcontract_labor` material/financial correction is unsupported in this slice.

## Evidence APIs

Allowed MIME values are PDF, XLS, XLSX, PNG, and JPEG. Maximum size is 26,214,400 bytes. SHA-256 is lowercase hexadecimal.

### Upload intent

`POST /api/companies/:companyId/projects/:projectId/evidence/upload-intents`

- Permission: `cost.prepare`; required `Idempotency-Key`.
- Body: `{ originalFilename, mimeType, sizeBytes, sha256 }`.
- Response: `{ evidenceFileId, version, bucketId: "c1-accounting-evidence", objectPath, signedUploadToken, expiresAt, replayed }`.

Upload to the exact returned private object path with the signed token. Replacement/upsert is disabled. The path contains only tenant/company/project/file UUID segments, never the filename.

### Finalize

`POST /api/companies/:companyId/evidence-files/:evidenceFileId/finalize`

- Permission: `cost.prepare`; required `Idempotency-Key`.
- Body: `{ "expectedVersion": 0 }`.
- Response: `{ id, status: "finalized", originalFilename, mimeType, sizeBytes, sha256, version, finalizedAt, replayed }`.

The server downloads through the authenticated client, streams size/SHA verification, compares MIME/size/hash, then finalizes. A mismatch returns `EVIDENCE_UPLOAD_MISMATCH` and creates no link.

### Link and metadata

- Link: `POST /api/companies/:companyId/project-costs/:projectCostItemId/evidence`, permission `cost.prepare`, required idempotency header, body `{ evidenceFileId, evidenceKind, accountingSourceVersionId? }`.
- Evidence kinds: `contract`, `acceptance_record`, `invoice`, `accounting_support`, `payment_proof`, `source_file`, `other`.
- Link response: `{ linkId, costId, evidenceFileId, evidenceKind, replayed }`.
- List metadata: `GET /api/companies/:companyId/project-costs/:projectCostItemId/evidence`, permission `cost.source.read`.

Linking does not increment the cost version and has no financial effect. It does not create a `source_reported_figure`.

### Raw read URL

`POST /api/companies/:companyId/evidence-files/:evidenceFileId/read-url`

- Permission: `cost.file.read` plus a linked accessible resource.
- Body: `{ "disposition": "inline" }` or `attachment`; omission defaults to `inline`.
- Response: `{ url, expiresAt }`; URL lifetime is exactly 60 seconds and must not be persisted.

## Subcontract cash APIs

### Record payment

`POST /api/companies/:companyId/projects/:projectId/subcontracts/:subcontractId/payments`

- Permission: `cost.record_cash`; required `Idempotency-Key`.
- Body:

```json
{
  "expectedSubcontractVersion": 0,
  "description": "Payment voucher",
  "paidAmount": "100.0000",
  "currencyCode": "VND",
  "paymentDate": "2026-09-22",
  "warrantyRetentionAmount": "5.0000",
  "retentionRateBps": 500,
  "paymentReference": "PV-01",
  "sourceReference": "BANK-01",
  "note": null,
  "replacesPaymentId": "uuid",
  "evidenceFileIds": ["uuid"]
}
```

`paidAmount` is strictly positive. Optional `replacesPaymentId` must identify one same-scope voided payment that has no replacement. Evidence files must be finalized same-project files and are linked atomically as `payment_proof`.

Response: `{ paymentId, version: 0, status: "recorded", replayed }`.

### Void payment

`POST /api/companies/:companyId/projects/:projectId/subcontracts/:subcontractId/payments/:paymentId/void`

- Permission: `cost.record_cash`; required `Idempotency-Key`.
- Body: `{ "expectedVersion": 0, "reason": "Wrong voucher" }`.
- Response: `{ paymentId, version, status: "voided", replayed }`.

Void preserves all monetary fields. A corrected amount is a new record request with `replacesPaymentId`. Another idempotency key against an already voided row returns `PAYMENT_ALREADY_VOIDED`.

## Stable errors and client recovery

| Error | HTTP meaning | Client action |
| --- | --- | --- |
| `INPUT_INVALID` | 400 | Correct strict body/path/header data. |
| `PERMISSION_DENIED` / `COMPANY_FORBIDDEN` | 403 | Hide mutation action and refresh company context. |
| `RESOURCE_NOT_FOUND` | 404 | Resource is absent, inaccessible, or wrong scope. |
| `VERSION_CONFLICT` | 409 | Refetch current draft/payment/subcontract state. |
| `IDEMPOTENCY_CONFLICT` | 409 | Do not reuse the key with another payload. |
| `COST_NOT_DRAFT` | 409 | Close draft editing and refetch official state. |
| `COST_ALREADY_PUBLISHED` | 409 | Treat as already official; refetch. |
| `COST_PUBLISH_NOT_READY` | 409 | Render `details.blockingCodes`; resolve blockers before retry. |
| `SUBCONTRACT_COST_MODEL_UNSUPPORTED` | 409 | Use canonical subcontract payment flow. |
| `EVIDENCE_UPLOAD_MISMATCH` | 409 | Discard the failed object/intention and create a new immutable intent. |
| `FILE_TOO_LARGE` | 413 | Select a file within 25 MiB. |
| `FILE_TYPE_UNSUPPORTED` | 415 | Select an allowed type. |
| `HISTORY_IMMUTABLE` | 409 | Use correction or void/replacement rather than rewrite. |
| `PAYMENT_ALREADY_VOIDED` | 409 | Refetch; do not void again. |

## Antigravity boundary

Antigravity owns all later pages, components, forms, dialogs, drawers, upload controls, states, layout, styling, accessibility, and browser tests. The backend implementation added no Accountant UI. UI code must consume these contracts without calling Supabase tables directly, exposing object paths as public URLs, auto-publishing on save, or treating `workStatus` as publication state.
