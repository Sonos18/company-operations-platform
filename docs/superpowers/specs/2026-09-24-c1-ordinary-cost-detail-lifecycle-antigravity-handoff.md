# C1 Ordinary Cost Detail Lifecycle — Antigravity Handoff

## Boundary

**UI NOT IMPLEMENTED IN THIS TASK.** This is the implemented backend contract for a later screen. It has no route, page, component, navigation, visual design, browser test, Production operation, historical-evidence rewrite, or fabricated source attribution.

For an ordinary category, one `(company, project, category)` has one canonical `project_cost_item` aggregate parent. Each `project_cost_item_detail` is an individual posting unit. The parent amount is derived from published details only; drafts have zero official effect. `cost_categories.postingStrategy` is `ordinary_detail` or `subcontract_payment` and must drive the UI decision.

`subcontract_payment` is not an ordinary-entry category: ordinary detail commands reject it with `SUBCONTRACT_COST_MODEL_UNSUPPORTED`; direct the user to the existing subcontract payment workflow. Recorded `project_subcontract_payments`, not ordinary details, remain the canonical subcontract Actual source.

## Detail APIs

All routes are under `/api/companies/:companyId`. Bodies are strict; IDs, `Idempotency-Key`, and `expectedVersion` are UUID/UUID/nonnegative-integer values as applicable. A command result is `{ id, projectCostItemId, publicationState, version, replayed }`.

| Action | Endpoint | Permission | Request |
| --- | --- | --- | --- |
| Save Draft | `POST /projects/:projectId/cost-entry-drafts` | `cost.manage` | Header `Idempotency-Key`; `{ projectId, categoryId, description, relevantDate?, reference?, note? }` → draft result. |
| Operational edit | `PATCH /project-cost-details/:detailId` | `cost.manage` | `{ expectedVersion, description?, relevantDate?, reference?, note? }` while draft only. |
| Prepare financials | `PUT /project-cost-details/:detailId/financials` | `cost.prepare` | `{ expectedVersion, amount, quantity?, unitCode?, unitPrice?, retentionKind?, retentionRateBps?, retentionAmount?, sourceFigureIds? }` while draft only. |
| Read draft | `GET /projects/:projectId/cost-entry-drafts` and `GET /project-cost-details/:detailId/draft` | `cost.prepare` | Complete draft financial/source projection. |
| Read draft operations | `GET /projects/:projectId/cost-entry-drafts/operations` and `GET /project-cost-details/:detailId/draft/operations` | `cost.manage` | Operational projection only; financial/source fields are omitted. |
| Publish Draft | `POST /project-cost-details/:detailId/publish` | `cost.publish_import` | Header `Idempotency-Key`; `{ expectedVersion }` → published result. |
| Publish Now | `POST /projects/:projectId/cost-entries` | `cost.manage` + `cost.prepare` + `cost.publish_import` | Header `Idempotency-Key`; `{ projectId, categoryId, description, amount, quantity?, unitCode?, unitPrice?, retentionKind?, retentionRateBps?, retentionAmount?, relevantDate?, reference?, note?, sourceFigureIds? }` → published result. Atomic create-and-publish; never client-side draft then publish. |
| Correction | `POST /project-cost-details/:detailId/corrections` | `cost.correct` | Header `Idempotency-Key`; `{ expectedVersion, reason, changes }`. The same detail identity is versioned and audited; no hard delete. |

`sourceFigureIds` attach only explicitly chosen detail-level source figures. Do not copy parent/category provenance to a detail. Detail evidence is independent and financially neutral:

| Action | Endpoint | Permission | Request/result |
| --- | --- | --- | --- |
| Link evidence | `POST /project-cost-details/:detailId/evidence` | `cost.prepare` | Header `Idempotency-Key`; strict `{ evidenceFileId, evidenceKind }` for a finalized same-project file → `{ linkId, detailId, evidenceFileId, evidenceKind, replayed }`. |
| List metadata | `GET /project-cost-details/:detailId/evidence` | `cost.source.read` | Returns `linkId`, `evidenceFileId`, `evidenceKind`, `accountingSourceVersionId`, `originalFilename`, `mimeType`, `sizeBytes`, `sha256`, and `finalizedAt`. Raw official bytes still require `cost.read` + `cost.file.read` under existing resource visibility. |

## Client behavior

- `ordinary_detail`: Save Draft changes no official amount; Publish Draft and Publish Now make the amount visible only after the transaction commits. Official reads, category/project totals, ledger rows, and official detail counts include published details only.
- `subcontract_payment`: redirect to the subcontract payment workflow; do not offer ordinary-detail creation.
- Drafts are mutable only through their two draft operations. Published details use correction, not an edit or parent snapshot replacement.
- The deprecated parent lifecycle remains temporarily available only for compatibility. Future UI must not create, prepare, publish, or correct parent drafts; use the detail APIs above.

| Error | Recovery |
| --- | --- |
| `INPUT_INVALID` | Correct strict path, body, or idempotency input. |
| `PERMISSION_DENIED` / `COMPANY_FORBIDDEN` | Hide the action and refresh company context. |
| `RESOURCE_NOT_FOUND` | Treat as absent/inaccessible/wrong scope; return to a fresh list. |
| `VERSION_CONFLICT` | Refetch the detail before retrying. |
| `IDEMPOTENCY_CONFLICT` | Never reuse that key with another payload. |
| `COST_DETAIL_NOT_DRAFT` / `COST_DETAIL_ALREADY_PUBLISHED` | Stop draft editing and refetch official state. |
| `COST_DETAIL_NOT_PUBLISHED` | Refetch the detail; use draft preparation or publish it before attempting correction. |
| `COST_DETAIL_PUBLISH_NOT_READY` | Resolve financial, source, or finalized-evidence blockers, then retry. |
| `SUBCONTRACT_COST_MODEL_UNSUPPORTED` | Redirect to subcontract payment recording. |

Production is untouched. Historical source and evidence rows remain only where they are already attributable; this task does not infer or invent either.
