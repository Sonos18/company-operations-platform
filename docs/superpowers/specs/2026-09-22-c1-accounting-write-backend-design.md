# C1 Accounting Write Backend Design

**Status:** Proposed canonical backend design; implementation is not authorized by this document.
**Repository:** `Sonos18/company-operations-platform`
**Baseline:** `origin/main` at `eb4074306b9b27b4b573a874949ef60b8b991b50`
**Design owner split:** CodeX owns database, Storage, backend APIs, shared non-visual contracts, and backend/database tests. Antigravity owns all UI.

## 1. Purpose

Add the first C1 accounting write backend without changing the existing Director finance meaning. An Accountant must be able to create and prepare an ordinary project-cost draft, attach immutable accounting evidence, publish it exactly once into official C1 reads, correct a published cost through an explicit audited command, and record or void actual subcontractor cash through the existing canonical payment ledger.

The five mutation capabilities are separate from the start:

- `cost.manage`: draft record and operational metadata only.
- `cost.prepare`: draft financial lines, source provenance, and evidence lifecycle.
- `cost.publish_import`: explicit activation into official C1 reads.
- `cost.correct`: explicit published-fact correction with immutable history.
- `cost.record_cash`: actual subcontractor payment recording and void/replacement.

Read authorization remains separate through `cost.read`, `cost.source.read`, and `cost.file.read`.

## 2. Non-goals

This slice does not implement:

- UI, pages, components, forms, dialogs, drawers, styling, or browser tests;
- generic banking, bank-feed import, payroll, settlement, approvals, or C2/C3;
- runtime spreadsheet parsing, OCR, Office preview, or generic ETL;
- a second subcontract payment ledger;
- hard deletion of financial, evidence, cash, source, or audit history;
- automatic publication on save;
- publication state encoded in `work_status`;
- a generic evidence requirement/routing engine;
- new budget, owner-advance, revenue, margin, or retention-release write flows;
- an implementation plan. That begins only after human approval of this spec.

## 3. Verified baseline

### 3.1 Repository

The current branch was created cleanly from `origin/main` at `eb4074306b9b27b4b573a874949ef60b8b991b50`.

The permission catalog already contains all five mutation permissions and all three relevant read permissions. The existing server resolves actor, tenant, company, permissions, request identity, and the user-scoped Supabase client through `c1RequestContext`; request bodies do not choose tenant identity.

Current project-cost behavior:

- `POST /api/companies/:companyId/projects/:projectId/project-costs` calls `c1_create_project_cost_item` under `cost.manage`.
- Creation currently requires amount, currency, `workStatus`, and a non-overlap reference, and immediately inserts a row visible to `cost.read`.
- `PATCH /api/companies/:companyId/project-costs/:projectCostItemId` multiplexes ordinary `cost.manage` updates and `cost.correct` corrections by body shape.
- `project_cost_items` has no publication column. `work_status` is `unknown | in_progress | accepted` and remains a business/work state.
- Every existing cost has at least one `project_cost_item_details` row after the detail-reconciliation migration. Parent amount is derived from details and protected by a trigger.
- The current correction RPC changes the parent amount directly. Because existing rows have details and the derived-amount trigger rejects independent parent-amount changes, the exposed amount-correction contract is not a complete working correction path for the reconciled schema.
- Current project-cost and finance repositories do not filter publication state because none exists.

Current source behavior:

- `accounting_sources`, `accounting_source_versions`, `source_selections`, `source_reported_figures`, review issues, controlled-import runs, and descriptor maps implement immutable controlled-import provenance.
- `cost.prepare` currently authorizes controlled source import together with `cost.source.read`.
- Source figures are non-posting. `project_cost_item_sources` links a cost to existing source figures.
- `accounting_source_versions.raw_file_reference` is only an optional text reference. It is not a verified Storage object registry.
- Evidence-only files cannot be represented honestly without a source figure under the current schema; creating a fake figure would corrupt the provenance model.

Current finance behavior:

- All finance endpoints are GET-only and require `cost.read`.
- `project_subcontract_payments` is the canonical company-to-subcontractor cash ledger. Recorded rows contribute to subcontract Actual; voided rows do not.
- The table already has scope/currency composite FKs, `recorded | voided`, mandatory void reasons, immutable posted money guards, version increments, audit triggers, and no authenticated write grants.
- `project_cost_reconciliation_resolutions` records when canonical subcontract payments supersede legacy cost rows for read aggregation without deleting history.
- No guarded write RPC exists yet for subcontracts or payments.

### 3.2 Cloud DEV read-only verification

Read-only checks used the repository target guard, auth check, migration status, and `supabase db query --linked` with metadata/count SELECT statements only.

- Target guard and auth check passed.
- Migration parity is exact: 50 local migrations and 50 Cloud DEV migrations through `20260922024724_c1_project_cost_reconciliation_resolutions`.
- Cloud `project_cost_items` has the repository columns through nullable `cost_category_id`; no publication lifecycle column exists.
- Relevant source, cost, finance, and reconciliation tables exist.
- Observed row counts: 10 project-cost parents, 432 details, 11 subcontracts, 13 subcontract payments, 2 accounting sources, and 2 source versions.
- The VQH `accountant` role currently has `accounting_document.read`, `accounting_document.update`, `cost.read`, `cost.source.read`, `inventory_value.read`, and `supplier.read`.
- It does not currently have any of the five approved mutation capabilities or `cost.file.read`.
- Cloud DEV has zero Storage buckets, zero Storage objects, and zero `storage.objects` policies.
- Relevant C1 business tables grant authenticated users `SELECT` only; there are no authenticated INSERT, UPDATE, or DELETE grants.

No Cloud data or schema mutation was performed.

### 3.3 Differences from earlier assumptions and documents

| Assumption | Verified current state | Design consequence |
| --- | --- | --- |
| Finance expansion tables may be empty. | Cloud DEV has 11 subcontracts and 13 payments. | Treat `project_subcontract_payments` as live canonical data; never introduce a competing payment table. |
| Accountant may already have write capabilities. | Accountant has only C1 read and source-read permissions. | A company-scoped RBAC migration must add exactly the approved writes plus `cost.file.read`, preserving unrelated permissions. |
| Project-cost correction already supports amount correction. | The RPC updates the parent, while reconciled details derive and guard the parent amount. | Correction must operate on the full detail snapshot and let the existing derivation update the projection atomically. |
| Existing source versions can represent uploaded evidence bytes. | They contain digest/name/reference metadata, but Cloud has no bucket, object policy, or verified object registry. | Add a focused immutable evidence-file registry and optionally link it to a source version. |
| New finance tables were draft-only design artifacts. | The finance expansion and follow-up migrations are applied and populated. | Extend their guards and audit conventions; do not redesign them. |
| A `prepared` database status is required. | No current workflow needs a durable approval state before publish. | Persist only `draft | published`; compute publish readiness from current draft state. |

## 4. Options considered

### 4.1 Selected: one canonical projection with a publication boundary

Add publication metadata to `project_cost_items`. Draft and published values use the same parent/detail/source relationships, but all official reads and `cost.read` RLS paths require `publication_state = 'published'`. Draft commands are closed after publication. Corrections atomically update the same current projection and append an immutable `audit_events` before/after snapshot.

This is the smallest compatible model: no publish-time copy, no identity switch, no duplicated parent/detail schema, and existing IDs remain stable.

### 4.2 Rejected: separate draft tables copied into canonical tables

Separate draft parents/details would isolate reads physically, but duplicate the mature project-cost constraints, detail derivation, provenance links, and scope FKs. Publication would become a cross-model copy with ID mapping and more replay failure modes. The extra model is not justified while a filtered single projection satisfies the same boundary.

### 4.3 Rejected: event-sourced financial ledger

An event-first ledger would make reconstruction natural but would replace the current read projection and finance aggregation model. That is a larger C1 redesign and unnecessary for the required correction history. The existing immutable `audit_events` table already provides append-only before/after evidence.

## 5. Capability matrix

| Operation | Permission | Allowed | Explicitly forbidden |
| --- | --- | --- | --- |
| Create cost draft | `cost.manage` | Create ordinary draft identity and operational metadata | Supplying official amount, publishing, source/evidence mutation, cash |
| Update draft operations | `cost.manage` | Description, business reference, category, party, engagement, component, relevant date, work status while draft | Any mutation after publish; financial lines; evidence; cash |
| Prepare draft financials | `cost.prepare` | Currency, complete detail snapshot, source-figure links | Official activation; published rewrite |
| Create/finalize/link evidence | `cost.prepare` | Immutable file intent, verification, cost/payment link, optional source-version link | Upsert/overwrite; fake source figure; financial activation |
| Publish | `cost.publish_import` | One transactional `draft -> published` transition | Automatic save/publish; repeated activation |
| Correct published cost | `cost.correct` | Full financial/detail replacement and material metadata correction with reason and immutable before/after audit | Silent PATCH through manage/prepare; delete history |
| Record/void subcontract payment | `cost.record_cash` | Insert recorded cash, void it, and optionally replace a voided row | Updating paid amount; using cost amount as payment; second ledger |
| Read official costs/finance | `cost.read` | Published canonical projection and recorded cash | Draft financials; raw file bytes |
| Read source/evidence metadata | `cost.source.read` | Provenance and finalized evidence metadata | Raw bytes without `cost.file.read` |
| Read raw evidence | `cost.file.read` | Short-lived authenticated/signed access to finalized private objects | Public URL, bucket listing outside scope |

No capability implies another. Server services and database commands check the exact permission named above.

## 6. Role matrix

| VQH role | Final C1 permissions in this slice | Notes |
| --- | --- | --- |
| `accountant` | Existing unrelated permissions plus `cost.read`, `cost.source.read`, `cost.file.read`, `cost.manage`, `cost.prepare`, `cost.publish_import`, `cost.correct`, `cost.record_cash` | Company-specific assignment; no global grant or role cross-join. |
| Director/read-only roles | Existing `cost.read` and any already-approved source read only | No mutation capability. Raw bytes still require `cost.file.read`. |
| `c1_vqh_cost_operator` | Preserve its current `cost.manage` and `cost.correct` assignments | This design does not broaden or remove the transitional operator role. |
| Other company roles | Unchanged | Future companies assign the generic catalog explicitly per company. |

The RBAC migration must locate the exact active VQH Accountant role by tenant, company, role ID/code, verify its pre-state, insert only the six missing C1 capabilities (`cost.file.read` plus five writes; current read/source-read remain), and assert the exact post-state while preserving unrelated permissions.

## 7. Lifecycle and state machine

`work_status` remains unchanged and independent.

```text
create via cost.manage
        |
        v
      draft  -- cost.manage: operational fields
        |    -- cost.prepare: financial lines, sources, evidence
        |    -- publish readiness computed on read/command
        |
        +---- explicit cost.publish_import command ----> published
                                                       |
                                                       +-- cost.correct only
                                                       +-- cost.prepare may append evidence only
                                                       +-- cost.record_cash remains separate
```

Only `draft` and `published` are persisted. “Prepared” means the current draft passes the same deterministic validations used by publish; it is exposed as `publishReadiness`, not stored as a third status that could become stale.

No cancelled/abandoned state is introduced. Unpublished drafts have zero official effect and can remain as drafts. Deletion is not added.

### 7.1 Draft invariants

- Project identity is fixed at creation.
- Category, party, engagement, component, relevant date, business reference, description, and work status are mutable only while draft.
- Currency and detail lines are owned by `cost.prepare`.
- Parent amount is nullable until at least one valid detail exists, then remains the derived sum of details.
- A simple total is represented by one `opening_balance` detail; there is no second independent parent amount input.
- Source-figure and evidence links have no financial effect.

### 7.2 Publish invariants

Publish requires:

- state is `draft` and `expectedVersion` matches under a row lock;
- project, category, party, engagement, and component all resolve inside the server-derived tenant/company scope;
- category is active and is not `subcontract_labor` in this slice;
- currency matches company settings and every linked scoped record;
- at least one detail exists, all detail/retention constraints pass, and derived amount is non-null;
- linked source figures belong to the same scope, are `shared`, and have no unresolved blocking review issue;
- every evidence link points to a finalized object; pending uploads never block unless linked, and a linked pending object is invalid;
- the idempotency receipt is absent or an exact replay;
- audit and publication metadata can be written in the same transaction.

`subcontract_labor` publication through `project_cost_items` fails `SUBCONTRACT_COST_MODEL_UNSUPPORTED`. The current official subcontract Actual is recorded cash from `project_subcontract_payments`; accepting a second published obligation fact here would change Director semantics and create double-counting risk. Contracts remain `project_subcontracts` reference data, and contract files may be linked as evidence without a new cost effect.

### 7.3 Published invariants

- `cost.manage` and financial `cost.prepare` updates fail.
- Evidence may be appended under `cost.prepare`; links never change amount/version or reactivate the cost.
- Any published financial or materially significant scope change uses `cost.correct`.
- Publication cannot be reversed to draft.
- No hard delete exists.

## 8. Data model

All changes are forward-only in a new migration. Previously applied migrations remain untouched.

### 8.1 `project_cost_items` extension

Add:

- `publication_state text not null` constrained to `draft | published`, default `draft` after backfill;
- `publication_origin text null` constrained to `command | legacy_backfill`;
- `published_by uuid null references auth.users(id) on delete restrict`;
- `published_at timestamptz null`;
- `publication_request_id uuid null`;
- a lifecycle shape check:
  - draft has no publication origin/actor/time/request;
  - command-published has actor/time/request and origin `command`;
  - legacy-published has origin `legacy_backfill`, a timestamp, and nullable actor/request.

Alter `amount` and `amount_text` to allow null for an unprepared draft. Add a check requiring both null or both non-null and equal; published rows require both non-null. Existing detail-derivation triggers remain authoritative.

Add indexes that start with `(tenant_id, company_id, publication_state, project_id, ...)` for official and draft list paths. Keep current unique business-reference and category constraints.

### 8.2 Existing details and source links

Reuse `project_cost_item_details` as the complete draft/published financial line projection. A prepare or correction command replaces the scoped line snapshot transactionally; line-level public mutation endpoints are not added.

Reuse `project_cost_item_sources` for real source-figure provenance. Prepare commands validate source ownership/status and replace the link set transactionally. Evidence-only attachments do not create source figures.

RLS and server queries distinguish parent state:

- `cost.read` can select only published parents and their child details/source links;
- draft reads require the relevant draft capability (`cost.manage` for operational fields; `cost.prepare` for financial/source fields);
- official repositories also include an explicit `publication_state = 'published'` predicate as defense in depth.

### 8.3 `cost_evidence_files`

Create an immutable object registry:

| Column | Contract |
| --- | --- |
| `id` | UUID primary key and immutable object identity. |
| `tenant_id`, `company_id` | Composite company scope with FK to `companies`. |
| `project_id` | Required same-scope project anchor; permits evidence intent before a cost/payment link exists. |
| `bucket_id` | Fixed to private bucket `c1-accounting-evidence`. |
| `object_path` | Server-generated, unique, immutable path. |
| `original_filename` | Display metadata only; never used in the object path. |
| `declared_mime_type`, `verified_mime_type` | Allowed MIME declaration and finalized Storage metadata. |
| `declared_size_bytes`, `verified_size_bytes` | Non-negative, maximum 25 MiB. |
| `declared_sha256`, `verified_sha256` | Lowercase 64-hex; equality required to finalize. |
| `status` | `pending_upload | finalized`. |
| `intent_expires_at` | Signed upload-intent expiry. |
| `created_by`, `created_at`, `finalized_by`, `finalized_at` | Actor/time attribution. |
| `version` | Optimistic version; pending→finalized increments once. |

Object path format is server-generated and contains no filename:

```text
tenants/{tenantId}/companies/{companyId}/projects/{projectId}/evidence/{evidenceFileId}/object
```

Allowed MIME types are exactly:

- `application/pdf`
- `application/vnd.ms-excel`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `image/png`
- `image/jpeg`

Extensions are advisory only; MIME, size, and SHA-256 are verified at finalize. Finalization streams the bounded private object server-side to compute SHA-256. A mismatch leaves the registry pending and returns `EVIDENCE_UPLOAD_MISMATCH`; the object is not linkable. Cleanup of expired unmatched objects is operational maintenance outside this slice and cannot delete finalized evidence.

### 8.4 `cost_evidence_links`

Create an append-only link registry:

- scope: `tenant_id`, `company_id`;
- `evidence_file_id` composite FK to a finalized evidence file;
- exactly one target:
  - `project_cost_item_id`, or
  - `project_subcontract_payment_id`;
- `evidence_kind`: `contract | acceptance_record | invoice | accounting_support | payment_proof | source_workbook | other`;
- optional `accounting_source_version_id` composite FK;
- actor, request ID, and creation time;
- unique target/file/kind relation;
- no UPDATE or DELETE path.

This focused registry is necessary because controlled-import source versions model a file as part of an immutable import/version/selection/figure family. Interactive evidence may be probative without reporting any figure. Optional source-version linkage preserves provenance when the concepts coincide, without forcing a fake `source_reported_figure` or creating another financial fact model.

### 8.5 Existing cash model extension

Keep `project_subcontract_payments` as the only subcontract cash ledger. Add only:

- `replaces_payment_id uuid null` with same-scope self-FK;
- unique partial index so one recorded replacement cannot replace the same voided payment twice;
- a check/command invariant that a replacement references a voided payment with the same tenant, company, project, subcontract, and currency.

Existing amount, retention, reference, and date fields remain immutable after insert. A correction is “void old row, then record a new row optionally referencing the voided row”; no negative pseudo-payment and no in-place amount rewrite.

## 9. Storage and evidence architecture

Create the private bucket `c1-accounting-evidence` with `public = false`, 25 MiB limit, and the exact MIME allow-list above.

The upload flow is:

1. `cost.prepare` calls the project-scoped upload-intent API with name, MIME, size, and SHA-256.
2. The server resolves company/tenant, inserts a pending registry row, generates the immutable path, and returns a short-lived signed upload token with upsert disabled.
3. The client uploads to that exact path. Existing-path upload fails; no update policy exists.
4. `cost.prepare` calls finalize. The server checks registry ownership/scope/expiry, Storage object existence, MIME, size, and streamed SHA-256.
5. One RPC changes pending→finalized, records verified metadata/actor/time, and emits an audit event.
6. A separate idempotent link command attaches the finalized file to a cost or a payment. Linkage does not change financial state.
7. Metadata reads require `cost.source.read`. Raw byte access requires `cost.file.read` and returns an authenticated download or a server-generated signed URL valid for at most 60 seconds.

Storage RLS does not trust folder segments alone. Private helper predicates parse the fixed path and join `cost_evidence_files` to verify exact bucket/path, actor, company, status, expiry, and permission.

- INSERT: only the actor's live pending intent under `cost.prepare`.
- SELECT for upload/finalize verification: pending object for its creating actor with `cost.prepare`.
- SELECT for final read: finalized object and company-scoped `cost.file.read`.
- UPDATE: no policy.
- DELETE: no policy.

Signed URLs are treated as bearer credentials and are never stored in audit rows or returned by metadata list APIs. Supabase recommends a new path rather than overwrite; this design makes overwrite structurally impossible.

## 10. Command/RPC model

Every write is a guarded public RPC wrapper over a private `SECURITY DEFINER` function, following current Taskovia conventions:

- public wrapper execute is revoked from `PUBLIC`/`anon` and granted only to `authenticated`;
- private functions are not executable by application roles;
- `search_path = ''` and all identifiers are schema-qualified;
- each function starts with `auth.uid()` and `private.c1_master_context(companyId, exactPermission)`;
- tenant comes from that context, never from JSON;
- scoped rows are locked before version/state checks;
- composite FKs and explicit lookups reject cross-company/project/party/engagement/subcontract references;
- direct authenticated DML remains revoked;
- command receipt and business mutation commit atomically;
- audit events include actor, request ID, command, resource, reason where required, and bounded before/after summaries without signed URLs or file bytes.

Required command names:

- `c1_create_project_cost_draft`
- `c1_update_project_cost_draft`
- `c1_prepare_project_cost_financials`
- `c1_create_cost_evidence_intent`
- `c1_finalize_cost_evidence`
- `c1_link_cost_evidence`
- `c1_publish_project_cost`
- `c1_correct_published_project_cost`
- `c1_record_subcontract_payment`
- `c1_void_subcontract_payment`

The old `c1_create_project_cost_item`, `c1_update_project_cost_item`, and `c1_correct_project_cost_item` public contracts must not remain as lifecycle bypasses. A forward migration replaces their definitions with compatibility wrappers that enforce the new lifecycle/permissions or revokes them after server routes move. There is never a window where an authenticated caller can invoke an old official-write path.

## 11. HTTP API contracts

All request/response schemas are strict Zod schemas in `shared/**`. UUID path/body consistency is checked. `Idempotency-Key` is a required UUID header where stated. Success objects use decimal strings and explicit nulls.

Common acknowledgement:

```ts
interface CostCommandAck {
  id: string
  version: number
  publicationState: 'draft' | 'published'
  replayed: boolean
}
```

### 11.1 Create cost draft

- **Method/path:** `POST /api/companies/:companyId/projects/:projectId/project-costs`
- **Permission:** `cost.manage`
- **Idempotency:** required `Idempotency-Key`; same actor/company/key/payload returns canonical result, changed payload returns `IDEMPOTENCY_CONFLICT`.
- **Input:** `{ description, costCategoryId, businessReference?, partyId?, engagementId?, componentId?, relevantDate?, workStatus? }`; no tenant, company, amount, currency, source, evidence, or publication fields.
- **Response:** `CostCommandAck` with `publicationState: 'draft'`, `version: 0`.
- **Preconditions:** project/category/reference hierarchy is same scope; category cannot be `subcontract_labor`; work status defaults to `unknown`; currency is initialized server-side from company settings but is not official.

### 11.2 Update draft operational metadata

- **Method/path:** `PATCH /api/companies/:companyId/project-costs/:projectCostItemId`
- **Permission:** `cost.manage`
- **Input:** `{ expectedVersion, description?, costCategoryId?, businessReference?, partyId?, engagementId?, componentId?, relevantDate?, workStatus? }`, at least one changed field.
- **Response:** non-replay acknowledgement `{ id, version, publicationState: 'draft' }`.
- **Idempotency:** optimistic version is the replay boundary; no command receipt. A retry after unknown outcome must refetch draft state.
- **Preconditions:** draft only; project remains immutable; hierarchy and category are revalidated.

### 11.3 Prepare/update draft financial information

- **Method/path:** `PUT /api/companies/:companyId/project-costs/:projectCostItemId/financials`
- **Permission:** `cost.prepare`
- **Input:** `{ expectedVersion, currencyCode, details, sourceFigureIds }` where `details` is the complete ordered snapshot and each line carries `lineNo`, `detailKind`, description, amount and optional quantity/unit/retention/date/reference/note fields.
- **Response:** `{ id, version, publicationState: 'draft', amount, detailCount, publishReadiness }`.
- **Idempotency:** expected version; refetch on unknown outcome.
- **Preconditions:** draft only; currency equals company currency; source figures are same-scope and unique; amount derives from details.

### 11.4 Create evidence upload intent

- **Method/path:** `POST /api/companies/:companyId/projects/:projectId/evidence/upload-intents`
- **Permission:** `cost.prepare`
- **Input:** `{ originalFilename, mimeType, sizeBytes, sha256 }`.
- **Response:** `{ evidenceFileId, version, bucketId, objectPath, signedUploadToken, expiresAt, replayed }`.
- **Idempotency:** required header. Replay returns the same live intent/result; changed payload conflicts.
- **Preconditions:** project exists in scope, allowed type, size ≤25 MiB, hash format valid.

### 11.5 Finalize evidence

- **Method/path:** `POST /api/companies/:companyId/evidence-files/:evidenceFileId/finalize`
- **Permission:** `cost.prepare`
- **Input:** `{ expectedVersion }`.
- **Response:** finalized metadata without URL: `{ id, status: 'finalized', originalFilename, mimeType, sizeBytes, sha256, version, finalizedAt, replayed }`.
- **Idempotency:** required header. Exact replay returns the finalized record.
- **Preconditions:** pending intent, same creator/company, unexpired intent, exact Storage object, verified type/size/hash.

### 11.6 Link evidence to cost

- **Method/path:** `POST /api/companies/:companyId/project-costs/:projectCostItemId/evidence`
- **Permission:** `cost.prepare`
- **Input:** `{ evidenceFileId, evidenceKind, accountingSourceVersionId? }`.
- **Response:** `{ linkId, costId, evidenceFileId, evidenceKind, replayed }`.
- **Idempotency:** required header; unique relation plus receipt.
- **`expectedVersion`:** not applicable; linking does not change the cost projection. The command locks the cost for scope/state validation but does not increment its version.
- **Preconditions:** finalized same-scope file; optional source version same scope. Published costs accept additive links without financial mutation.

### 11.7 Publish cost

- **Method/path:** `POST /api/companies/:companyId/project-costs/:projectCostItemId/publish`
- **Permission:** `cost.publish_import`
- **Input:** `{ expectedVersion }`.
- **Response:** `CostCommandAck` with `publicationState: 'published'`.
- **Idempotency:** required header. Same receipt returns replay; a different key against published state returns `COST_ALREADY_PUBLISHED`.
- **Preconditions:** all publish invariants in section 7.2.

### 11.8 Correct published cost

- **Method/path:** `POST /api/companies/:companyId/project-costs/:projectCostItemId/corrections`
- **Permission:** `cost.correct`
- **Input:** `{ expectedVersion, reason, operationalChanges?, financialChanges? }`; `financialChanges` is a complete currency/detail/source snapshot, and `operationalChanges` may contain description, category, business reference, party, engagement, component, relevant date, or work status. At least one changed field is required.
- **Response:** `CostCommandAck` with `publicationState: 'published'`.
- **Idempotency:** required header; exact replay returns the same corrected version.
- **Preconditions:** published only; nonblank reason; same-scope hierarchy; category cannot transition into `subcontract_labor`; an existing `subcontract_labor` legacy item cannot receive financial/scope correction in this slice; resulting ordinary-cost financial snapshot passes publish invariants.

The RPC locks the item, records immutable before/after parent and detail/source snapshots in `audit_events`, applies the new complete child snapshot, lets the derived-amount trigger update the parent, increments the canonical version exactly once, and commits atomically.

### 11.9 Record subcontract payment

- **Method/path:** `POST /api/companies/:companyId/projects/:projectId/subcontracts/:subcontractId/payments`
- **Permission:** `cost.record_cash`
- **Input:** `{ expectedSubcontractVersion, description, paidAmount, currencyCode, paymentDate?, warrantyRetentionAmount?, retentionRateBps?, paymentReference?, sourceReference?, note?, replacesPaymentId?, evidenceFileIds? }`.
- **Response:** `{ paymentId, version: 0, status: 'recorded', replayed }`.
- **Idempotency:** required header.
- **Preconditions:** same-scope project/subcontract/party; active subcontract; exact currency; positive paid amount; valid retention shape; replacement target, if any, is a same-scope voided payment not already replaced; evidence files are finalized and `payment_proof` links are created in the transaction.

### 11.10 Void/correct recorded payment

- **Method/path:** `POST /api/companies/:companyId/projects/:projectId/subcontracts/:subcontractId/payments/:paymentId/void`
- **Permission:** `cost.record_cash`
- **Input:** `{ expectedVersion, reason }`.
- **Response:** `{ paymentId, version, status: 'voided', replayed }`.
- **Idempotency:** required header. Exact replay succeeds; another key against a voided row returns `PAYMENT_ALREADY_VOIDED`.
- **Preconditions:** recorded same-scope payment and nonblank reason. Monetary fields are never updated. A corrected value is a later record-payment command referencing this voided row.

### 11.11 Read draft state

- **Methods/paths:**
  - `GET /api/companies/:companyId/projects/:projectId/project-cost-drafts`
  - `GET /api/companies/:companyId/project-costs/:projectCostItemId/draft`
- **Permission:** `cost.prepare`; the response includes operational fields because the target Accountant also has `cost.manage`.
- **Response:** strict draft DTO with nullable derived amount, full details, source links, evidence metadata, version, and `{ ready, blockingCodes }` publish readiness.
- **Idempotency/expectedVersion:** read-only; not applicable.
- **Preconditions:** draft only; a published ID on the draft-detail route returns `RESOURCE_NOT_FOUND`.

### 11.12 Evidence metadata and raw read access

- **Metadata:** `GET /api/companies/:companyId/project-costs/:projectCostItemId/evidence`, permission `cost.source.read`, returns finalized metadata and immutable links without object path token or signed URL.
- **Read URL:** `POST /api/companies/:companyId/evidence-files/:evidenceFileId/read-url`, permission `cost.file.read`, input `{ disposition?: 'inline' | 'attachment' }`, returns `{ url, expiresAt }` with maximum 60-second TTL.
- **Idempotency/expectedVersion:** read-only generation; not applicable. Every call reauthorizes current access.
- **Preconditions:** finalized same-scope file linked to an accessible resource.

## 12. RBAC, RLS, and security boundaries

- Tenant and actor are always derived from authenticated server context and `auth.uid()`.
- Company comes from the route and is resolved through membership before any command.
- Body schemas reject tenant/company/actor/publication/audit fields.
- All business tables enable and force RLS.
- Authenticated table grants remain SELECT-only where required; no authenticated business-table DML is added.
- Draft/published RLS predicates join through parent state for children.
- Storage is private and has no UPDATE/DELETE policy.
- Composite scope FKs exist for every cost, detail, evidence, source, subcontract, payment, and link relation.
- Security-definer helpers are private, have empty search paths, perform explicit actor/permission checks, and have execute revoked from application roles unless they are intentionally used by RLS.
- Evidence metadata is `cost.source.read`; raw bytes are `cost.file.read`.
- Signed URLs/tokens, file bytes, raw descriptions, and credentials are excluded from broad audit payloads.
- Director/read-only actors fail mutation at both service and RPC layers with `PERMISSION_DENIED`.

## 13. Idempotency, concurrency, and versioning

`cost_command_receipts` remains the common receipt store. Request hashes use canonical JSON plus route identity and target resource IDs. Receipt scope remains actor/company/command/key.

Required receipt-backed commands:

- create draft;
- evidence intent, finalize, and link;
- publish;
- correction;
- record payment;
- void payment.

For every receipt-backed command:

1. authorize before replay;
2. acquire the deterministic transaction advisory lock;
3. find receipt under row lock;
4. equal hash returns the recorded canonical result with `replayed: true`;
5. unequal hash returns `IDEMPOTENCY_CONFLICT`;
6. otherwise lock target rows, validate expected versions, mutate, audit, and insert the receipt in one transaction.

Draft operational and financial replacement updates use `expectedVersion` without receipts. They are non-activating and callers must refetch after an unknown outcome.

All version checks happen after scope resolution and row lock. A stale value returns `VERSION_CONFLICT`; no partial detail/source/link mutation commits.

Publish increments the item once. Child replacement and parent amount derivation must be coordinated so internal detail triggers do not produce multiple externally visible versions. The command returns the one final canonical version.

## 14. Correction architecture

The current projection remains optimized for reads. Correction does not append a second active cost row.

The correction transaction:

1. authorizes `cost.correct` and locks the published item;
2. checks expected version and nonblank reason;
3. loads the full before parent/detail/source snapshot;
4. validates the complete proposed after snapshot and scope;
5. replaces details/source links as required and updates allowed parent fields;
6. derives the new parent amount;
7. writes one immutable `audit_events` row with action `c1.project_cost_item.corrected`, actor, request, reason, before snapshot, after snapshot, and idempotency identity;
8. writes the command receipt and commits.

`audit_events` already rejects UPDATE/DELETE. This satisfies immutable, reconstructable correction history without another event table. Evidence links remain separately append-only and are referenced by ID in the audit summary when relevant; file bytes and signed URLs are never copied into audit JSON.

## 15. Cash architecture

`project_subcontract_payments` remains the single economic fact for actual outgoing subcontractor cash. `cost.record_cash` is the only new application write authorization boundary.

- A record command inserts a `recorded` row; it never edits a cost amount.
- The command checks company, tenant, project, subcontract, party, currency, active state, retention shape, and optional replacement/evidence scope.
- Current finance GETs already total only `recorded` rows and keep legacy reconciliation explicit.
- Existing trigger guards keep posted money immutable and make void final.
- A void command changes only status, reason, version, update actor/time, and audit metadata.
- A corrected payment is a new recorded row referencing the voided row.
- The canonical reconciliation resolution remains the only switch that tells finance reads to stop treating legacy subcontract rows as competing Actual.
- Record/void commands do not create or alter a reconciliation resolution automatically.

This slice does not add owner-advance writes, retention release/refund, accounts payable, bank settlement, or a generic cash journal.

## 16. Migration and backfill strategy

One or more new forward-only migrations may implement this approved design later; no prior migration is edited.

The lifecycle migration must be one transaction with lock/statement timeouts and a scoped advisory lock:

1. verify exact expected schema, functions, policies, and migration prerequisites;
2. add nullable publication metadata;
3. backfill every existing `project_cost_items` row to `published`, `publication_origin = 'legacy_backfill'`, and `published_at = updated_at`; leave actor/request null rather than fabricate history;
4. assert all existing 10 Cloud DEV parents remain published and every existing read count/aggregate is unchanged;
5. make lifecycle columns constrained/not-null as applicable and set new-row default to `draft`;
6. relax amount nullability only under the conditional draft/published checks;
7. add indexes, RLS policies, evidence tables/bucket policies, guarded RPCs, and exact grants;
8. replace or revoke old write RPC definitions so they cannot bypass publication;
9. assign VQH Accountant permissions with pre/post-state assertions;
10. reload PostgREST schema.

Storage bucket creation and policies are migration-controlled. No existing file backfill is attempted because Cloud DEV has no buckets or objects. Existing source-version `raw_file_reference` values remain provenance text and are not silently converted into evidence objects.

## 17. Read-model compatibility

All official read paths add explicit published predicates:

- legacy project-cost summary/detail repositories;
- finance cost-item and detail queries, including batched project cards;
- source-to-cost joins that surface official cost records;
- direct RLS policies for parents and children.

Existing rows are backfilled published, so current Director results remain byte-for-byte semantically equivalent before any new draft exists. New drafts contribute to no category, project, KPI, known subtotal, margin, retention, or reconciliation result.

Publish activates the existing row once; there is no copy and no second source of truth. Double publish cannot create a second amount.

Subcontract finance reads remain unchanged: recorded `project_subcontract_payments` provide Actual, voided rows are excluded, and legacy rows remain reconciliation-gated. Ordinary categories consume only published project-cost items.

## 18. Error contract

Existing envelope and codes remain authoritative where applicable. Add narrowly scoped codes only where current codes cannot distinguish a required deterministic state.

| Condition | HTTP/code | Deterministic behavior |
| --- | --- | --- |
| Unauthenticated | 401 `AUTH_REQUIRED` | No repository/RPC call. |
| Missing mutation permission, including Director mutation | 403 `PERMISSION_DENIED` | No mutation. |
| Active company inaccessible | 403 `COMPANY_FORBIDDEN` | No resource lookup outside authorized context. |
| Cross-company/tenant or project/party/engagement/subcontract mismatch | 404 `RESOURCE_NOT_FOUND` | Scoped lookup only; do not reveal foreign-scope existence. |
| Malformed input or missing correction/void reason | 400 `INPUT_INVALID` | Strict schema rejection before repository call. |
| Stale expected version | 409 `VERSION_CONFLICT` | Transaction rolls back. |
| Same idempotency key, different hash | 409 `IDEMPOTENCY_CONFLICT` | Original result remains canonical. |
| Exact idempotency replay | 200 with `replayed: true` | Reauthorize, return stored result, no second effect. |
| Manage/prepare financial mutation after publish | 409 `COST_NOT_DRAFT` | Use correction or evidence-link route. |
| Publish already-published cost with a new key | 409 `COST_ALREADY_PUBLISHED` | No second activation. |
| Publish with invalid/incomplete draft | 409 `COST_PUBLISH_NOT_READY` | Return stable blocking codes in details. |
| Subcontract category through cost-item publish | 409 `SUBCONTRACT_COST_MODEL_UNSUPPORTED` | Use current subcontract/payment model; no competing fact. |
| Unsupported file | 415 `FILE_TYPE_UNSUPPORTED` | No intent/object link. |
| Oversized file | 413 `FILE_TOO_LARGE` | No intent/object link. |
| Missing object or finalize type/size/hash mismatch | 409 `EVIDENCE_UPLOAD_MISMATCH` | Registry remains pending; never link. |
| Attempted overwrite/replacement of a finalized path | 409 `HISTORY_IMMUTABLE` | New evidence intent/path required. |
| Raw evidence without `cost.file.read` | 403 `PERMISSION_DENIED` | Metadata permission is insufficient. |
| Attempt to alter recorded cash fields | 409 `HISTORY_IMMUTABLE` | Void and replace instead. |
| Double void with a new key | 409 `PAYMENT_ALREADY_VOIDED` | Existing void remains final. |

`COST_NOT_DRAFT`, `COST_ALREADY_PUBLISHED`, `COST_PUBLISH_NOT_READY`, `SUBCONTRACT_COST_MODEL_UNSUPPORTED`, `EVIDENCE_UPLOAD_MISMATCH`, and `PAYMENT_ALREADY_VOIDED` must be added to the shared API error enum during implementation. Blocking-code details are closed enums, not free text.

## 19. Acceptance matrix

### 19.1 `cost.manage`

- Accountant can create and update a same-company ordinary draft.
- Director/viewer receives `PERMISSION_DENIED` at service and RPC layers.
- Cross-company IDs fail through scoped lookup.
- Published record rejects manage update.
- Create replay has one row/effect; conflicting replay fails.

### 19.2 `cost.prepare`

- Accountant can replace draft detail/source snapshot with expected version.
- Viewer cannot prepare.
- Parent amount equals detail sum.
- Draft remains absent from legacy and finance official GET totals.
- Source links require same-scope valid source figures.

### 19.3 `cost.publish_import`

- Valid prepared draft publishes once and becomes visible in official reads.
- Before/after read test proves no KPI effect before publish and exactly one effect after.
- Stale version fails.
- Exact replay returns the same published result.
- Different-key double publish fails without a second effect.
- Subcontract category publication is blocked.

### 19.4 `cost.correct`

- Published full-snapshot correction succeeds and current projection changes once.
- Missing/blank reason fails.
- Stale version fails.
- Manage/prepare cannot perform the same change.
- Immutable audit row retains complete bounded before/after state and reason.
- Audit UPDATE/DELETE fails.

### 19.5 `cost.record_cash`

- Accountant records a same-scope, same-currency payment.
- Invalid project/subcontract/company/currency fails.
- Direct authenticated INSERT/UPDATE/DELETE fails.
- Recorded money-field mutation fails.
- Void requires reason and expected version.
- Double void is deterministic; exact replay has one effect.
- Replacement references one voided same-scope row.
- Finance totals include the new recorded row once, exclude the voided row, and do not add legacy rows when canonical resolution applies.

### 19.6 Evidence

- Authorized intent/upload/finalize/link/metadata/read-url succeeds.
- Unsupported MIME, oversize, missing object, MIME/size/hash mismatch fail deterministically.
- Unauthorized and cross-company upload/finalize/link/read fail.
- Finalized object cannot be overwritten, updated, or deleted.
- Replacement uses a new ID/path and leaves prior evidence readable/auditable.
- Evidence-only link creates no source figure and changes no cost/payment amount.
- `cost.source.read` can read metadata but cannot read bytes without `cost.file.read`.

### 19.7 Regression and Cloud acceptance

- pgTAP/Cloud DEV tests cover permission catalog, VQH Accountant exact RBAC, RLS, direct-DML denial, composite scope FKs, commands, idempotency, stale versions, lifecycle, correction history, evidence policies, payment immutability, and multi-company negative cases.
- Unit tests cover strict shared schemas, routes, services, repository error mapping, permission non-overlap, and no repository call after service denial.
- Existing Director finance GET contract/regression suites pass unchanged except fixtures gain explicit published state.
- Existing project-cost reads remain semantically unchanged for backfilled rows.
- Migration rehearsal proves all historical rows remain visible and aggregates unchanged.
- Cloud acceptance is synthetic and rollback-safe. No UI/browser test belongs to this backend slice.

## 20. CodeX / Antigravity boundary

CodeX implementation scope after approval:

- forward-only database migrations;
- RBAC, RLS, triggers, guarded RPCs, audit, Storage bucket/policies;
- server routes/services/repositories;
- shared non-visual Zod/type contracts;
- database, unit, and backend regression tests;
- an explicit API/UI handoff document.

Antigravity scope after backend contracts are stable:

- all Accountant pages and navigation;
- draft editor, financial-line editor, evidence upload controls, publish/correction/payment dialogs;
- visual status, validation, retry, progress, layouts, styles, and accessibility;
- UI/browser tests.

CodeX must not modify `app/pages/**`, `app/components/**`, visual assets, themes, or UI tests for this feature.

## 21. Rejected alternatives

- **Reuse `work_status` as publication:** rejected because it is business execution state and already drives legacy semantics.
- **Save means publish:** rejected because preparation must have zero official effect and publish needs its own permission/audit/idempotency boundary.
- **Use `cost.manage` as module super-permission:** rejected; it would collapse five independently auditable capabilities.
- **Store drafts in source figures only:** rejected because source observations are non-posting provenance, not application-owned cost drafts.
- **Create fake source figures for contracts/evidence:** rejected because evidence may contain no reported financial figure.
- **Use `accounting_source_versions.raw_file_reference` as the file registry:** rejected because it lacks verified object identity, lifecycle, access control, and cost/payment links.
- **Public bucket or long-lived object URL:** rejected because evidence is private and raw access is stricter than finance read.
- **Storage upsert for replacement:** rejected because it destroys immutable byte identity and may serve stale CDN content.
- **New payment table:** rejected because `project_subcontract_payments` already represents the same economic fact.
- **Mutate a payment amount for correction:** rejected; void/replacement preserves history.
- **Automatically create reconciliation resolution when recording cash:** rejected because cash existence alone does not prove legacy coverage/cutover.
- **Publish new subcontract cost items now:** rejected because current Director Actual is canonical payment cash; changing that meaning requires a separate business/read-model decision.
- **Persist `prepared` status:** rejected because readiness is derivable and a stored flag can become stale after any draft/evidence/source change.
- **Event-sourced rewrite:** rejected as unnecessary architecture expansion.

## 22. Risks and controls

| Risk | Control |
| --- | --- |
| A read path omits the published predicate. | RLS parent-state predicate plus explicit repository filter plus published-vs-draft regression matrix. |
| Existing create/correct RPC bypasses lifecycle. | Replace/revoke definitions in the same forward migration before granting new commands. |
| Detail triggers increment version more than once in a command. | Command-local guarded synchronization and one externally visible final version assertion. |
| Evidence hash verification is expensive. | 25 MiB hard cap and streaming SHA-256; larger files are out of scope. |
| Signed URL remains usable after issue. | 60-second maximum TTL, reauthorization per issuance, never audit/store URL. Supabase signed URLs cannot be individually revoked before expiry. |
| Storage path policy trusts attacker-controlled text. | Registry-backed exact bucket/path predicate and server-generated paths. |
| Broad audit payload leaks evidence or signed access. | Store IDs and bounded business snapshots only; no bytes, URLs, or raw credentials. |
| Subcontract obligation and cash semantics diverge. | Block new subcontract cost-item publication and preserve current payment Actual until a separate approved model exists. |
| Accountant migration alters unrelated permissions. | Exact role/company pre-state/post-state assertions and insert-only selected grants. |
| Data API exposure defaults change. | Explicit grants/revokes/RLS in migrations; do not depend on automatic exposure. |
| Expired abandoned upload objects accumulate. | Operational cleanup may remove only unfinalized expired objects after a separate reviewed retention policy; finalized objects are never deleted. |

## 23. Capability-boundary self-review

- `cost.manage` cannot write amount/details, source/evidence, publication, correction, or cash.
- `cost.prepare` cannot activate official reads or mutate published financial facts; after publish it can only append evidence.
- `cost.publish_import` performs one transition and cannot prepare or correct data.
- `cost.correct` applies only to published facts and always records reason plus immutable before/after history.
- `cost.record_cash` touches only canonical payment rows and their evidence links; it never changes cost amount.
- `cost.read` sees published financial projections only.
- `cost.source.read` reads provenance/evidence metadata but not raw bytes.
- `cost.file.read` authorizes raw finalized bytes but grants no mutation.
- There is no endpoint, RPC, grant, RLS policy, or Storage policy that collapses these boundaries.

TypeSafe Playground advisory review used `jev-latest` with structured JSON state and batched Noul questions. The architecture review returned `0.89` for preserving the official read model and `0.85` for preserving tenant/company isolation. The post-spec review returned `0.13` for any semantic overlap, with definition probabilities of `0.91` (`cost.manage`), `0.93` (`cost.prepare`), `0.83` (`cost.publish_import`), `0.80` (`cost.correct`), and `0.94` (`cost.record_cash`). These results support the boundaries but do not replace repository, RLS, constraint, or test evidence. The publish and correction sections retain explicit preconditions because their narrower transition responsibilities produced the lowest definition probabilities.

Placeholder scan: no unresolved markers.
Scope scan: backend design only; no UI or implementation plan.
Security scan: actor/tenant/company are server-derived; cross-scope links use composite FKs; direct writes and Storage overwrite/delete remain denied.
Compatibility scan: existing rows backfill published; Director finance semantics and canonical subcontract payments remain unchanged.
