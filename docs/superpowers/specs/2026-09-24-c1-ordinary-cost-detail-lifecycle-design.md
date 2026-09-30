# C1 Ordinary Cost Detail Lifecycle — Design Spec

**Suggested path**

`docs/superpowers/specs/2026-09-24-c1-ordinary-cost-detail-lifecycle-design.md`

## Status

DESIGN PROPOSED — BACKEND / DATA MODEL ONLY

UI IMPLEMENTATION IS OUT OF SCOPE.

This design corrects the current C1 accounting-write lifecycle introduced around PR #17/#18.

---

# 1. Problem statement

The current C1 model contains two conflicting semantics.

The established Project Cost data model behaves as:

```text
Project
└── Cost Category
    └── project_cost_items
        ├── project_cost_item_details
        ├── project_cost_item_details
        └── ...
```

For classified categories, the database intentionally enforces:

```text
one project
+ one cost category
= one project_cost_item parent
```

through:

`c1fc_cost_item_one_category`

The parent amount is already derived from its child details:

```text
project_cost_items.amount
=
SUM(project_cost_item_details.amount)
```

However the current accounting-write lifecycle creates:

```text
project_cost_item [draft]
→ prepare complete detail snapshot
→ publish parent
```

This attempts to create a second parent for a category that already has a canonical parent and therefore conflicts with the existing category-parent model.

The lifecycle boundary is currently at the wrong level.

---

# 2. Corrected domain model

For ordinary project costs:

```text
project_cost_items
= canonical category aggregate parent

project_cost_item_details
= individual accounting cost entries / posting units
```

Target structure:

```text
Project
└── Cost Category
    └── Project Cost Item
        ├── Detail A [published]
        ├── Detail B [published]
        ├── Detail C [draft]
        └── Detail D [published]
```

The parent is not a user-created accounting transaction.

The child detail is the accounting transaction.

---

# 3. Category strategies

Introduce an explicit category posting strategy instead of continuing to infer behavior only from category code.

Add to `cost_categories`:

```text
posting_strategy:
  ordinary_detail
  subcontract_payment
```

Backfill:

```text
materials          → ordinary_detail
machinery          → ordinary_detail
direct_labor       → ordinary_detail
other              → ordinary_detail

subcontract_labor  → subcontract_payment
```

New categories must explicitly receive a supported strategy.

Runtime write commands must use `posting_strategy`.

Do not rely on description matching.

---

# 4. Strategy behavior

## ordinary_detail

Used by:

* materials
* machinery
* direct_labor
* other

Canonical monetary facts:

`project_cost_item_details`

Lifecycle:

```text
draft
→ published
```

Only published details affect Project Cost Actual.

## subcontract_payment

Used by:

`subcontract_labor`

Canonical monetary facts remain:

`project_subcontract_payments`

Lifecycle remains:

```text
recorded
→ voided
→ optional replacement
```

Do not create new ordinary cost details for this category.

Existing historical `project_cost_item_details` under `subcontract_labor` remain legacy history only.

They must never become a second source of Actual.

---

# 5. Parent semantics

For an ordinary category, `project_cost_items` becomes a stable aggregate parent.

Invariant:

```text
tenant
+ company
+ project
+ cost category
= at most one parent
```

Keep:

`c1fc_cost_item_one_category`

Do NOT remove this constraint.

The parent contains category-level aggregate identity.

The parent amount is derived.

No future ordinary-cost UI should create one parent per expense.

---

# 6. Parent creation

A project/category may not yet have a parent.

Detail creation commands must resolve the parent transactionally.

Pseudo-flow:

```text
lock project/category scope
→ find canonical project_cost_item parent
→ if missing:
     create aggregate parent
→ create detail
```

The aggregate parent created this way is immediately an official aggregate shell.

Initial amount:

```text
0.0000
```

Recommended parent defaults:

```text
description       = deterministic category aggregate description
currency_code     = company default currency
work_status       = unknown
business_reference = null
party_id          = null
engagement_id     = null
component_id      = null
relevant_date     = null
publication_state = published
```

The parent must not become a second transaction.

---

# 7. Detail lifecycle columns

Extend `project_cost_item_details`.

Add:

```text
publication_state
  draft | published

publication_origin
  command | legacy_backfill | null

published_by
published_at
publication_request_id
```

Shape:

## Draft

```text
publication_state = draft
publication_origin = null
published_by = null
published_at = null
publication_request_id = null
```

## Command-published

```text
publication_state = published
publication_origin = command
published_by != null
published_at != null
publication_request_id != null
```

## Existing historical row

```text
publication_state = published
publication_origin = legacy_backfill
published_at != null
published_by may be null
publication_request_id may be null
```

---

# 8. Draft completeness

A draft may be incomplete.

Therefore `amount_text` must become nullable for draft rows.

Published rows require a valid amount.

Invariant:

```text
draft:
  amount may be null

published:
  amount must be non-null
```

New user-created entries always use:

`detail_kind = line_item`

Reserve:

`opening_balance`

for migration/backfill/legacy summary representation.

---

# 9. V1 detail fields

The first detail-lifecycle refactor should reuse the existing detail shape rather than invent another transaction schema.

Fields:

```text
description
quantity
unitCode
unitPrice
amount
retentionKind
retentionRateBps
retentionAmount
relevantDate
reference
note
```

The category comes from the parent.

The project comes from the parent.

Currency is inherited from the parent/company.

Do not duplicate project/category/currency into another mutable source unless needed for scope FKs.

---

# 10. Parent amount derivation

Change:

```text
SUM(all details)
```

to:

```text
SUM(details WHERE publication_state = published)
```

For ordinary aggregate parents:

```text
parent.amount =
SUM(published child details)
```

Draft details contribute:

```text
0
```

If no published details exist:

```text
parent.amount = 0.0000
```

---

# 11. Compatibility with current parent-draft flow

This backend refactor must not require an immediate UI change.

During the compatibility window:

## Existing parent draft

If:

```text
parent.publication_state = draft
```

the legacy parent-draft flow may continue using its complete detail snapshot.

Its amount derivation may continue to sum all of its own draft child rows.

## Published aggregate parent

If:

```text
parent.publication_state = published
```

only published child details contribute to the aggregate.

This allows the new detail lifecycle to coexist temporarily with the existing UI.

Before legacy parent publication completes, the publish command must mark its child details `published` transactionally so its amount does not disappear during the state transition.

Legacy parent correction that replaces published detail snapshots must explicitly create replacement rows as published.

The compatibility path is temporary and must be documented as deprecated.

---

# 12. Create modes required by future Accountant screen

A future dedicated cost-entry screen must support two actions:

```text
Save Draft
Publish Now
```

These are separate backend commands.

---

# 13. Save Draft command

Purpose:

create one ordinary cost entry without financial effect.

Example endpoint:

```text
POST
/api/companies/:companyId/projects/:projectId/cost-entry-drafts
```

Permission:

`cost.manage`

Required:

```text
categoryId
description
```

Optional draft fields:

```text
relevantDate
reference
note
```

Financial fields may be supplied only through the prepare capability path.

Result:

```json
{
  "id": "detail-uuid",
  "projectCostItemId": "parent-uuid",
  "publicationState": "draft",
  "version": 0,
  "replayed": false
}
```

Header:

`Idempotency-Key`

---

# 14. Prepare draft detail

Example:

```text
PUT
/api/companies/:companyId/project-cost-details/:detailId/financials
```

Permission:

`cost.prepare`

Body:

```text
expectedVersion
quantity?
unitCode?
unitPrice?
amount
retentionKind?
retentionRateBps?
retentionAmount?
sourceFigureIds?
```

This updates ONE draft entry.

It must NOT replace all details belonging to the category parent.

---

# 15. Update draft operational fields

Example:

```text
PATCH
/api/companies/:companyId/project-cost-details/:detailId
```

Permission:

`cost.manage`

Mutable while draft:

```text
description
relevantDate
reference
note
```

No mutation after publish.

---

# 16. Publish existing draft

Example:

```text
POST
/api/companies/:companyId/project-cost-details/:detailId/publish
```

Permission:

`cost.publish_import`

Required:

```text
expectedVersion
```

Header:

`Idempotency-Key`

Publish validates:

* entry is draft;
* category strategy is `ordinary_detail`;
* expectedVersion matches;
* amount exists;
* parent/project/company scope is valid;
* retention shape is valid;
* linked source figures are usable;
* linked evidence is finalized;
* idempotency receipt is absent or an exact replay.

Transaction:

```text
lock detail
→ validate
→ draft → published
→ set publication metadata
→ aggregate parent amount changes
→ audit
→ receipt
```

---

# 17. Publish Now / direct posting

Future Accountant screen must also support creating a complete entry directly.

Example endpoint:

```text
POST
/api/companies/:companyId/projects/:projectId/cost-entries
```

This is an atomic:

```text
create + validate + publish
```

command.

It MUST NOT:

```text
create draft
commit
then call publish
```

as two client-visible transactions.

Required permissions:

```text
cost.manage
AND cost.prepare
AND cost.publish_import
```

This is intentional because the command combines all three responsibilities.

Required body:

```text
categoryId
description
amount
```

Optional:

```text
quantity
unitCode
unitPrice
retentionKind
retentionRateBps
retentionAmount
relevantDate
reference
note
sourceFigureIds
```

Header:

`Idempotency-Key`

Result:

```json
{
  "id": "detail-uuid",
  "projectCostItemId": "parent-uuid",
  "publicationState": "published",
  "version": 0,
  "replayed": false
}
```

---

# 18. Direct publish accounting effect

Before command:

```text
Parent amount = X
```

Create directly:

```text
Detail amount = Y
publication_state = published
```

After commit:

```text
Parent amount = X + Y
```

The detail becomes visible to official Project Cost reads only after the successful transaction commits.

---

# 19. Draft accounting effect

Before:

```text
Parent amount = X
```

Create/update draft:

```text
Detail amount = Y
publication_state = draft
```

After:

```text
Parent amount = X
```

Only publish changes official cost.

---

# 20. Published correction

Published detail corrections use:

`cost.correct`

Example:

```text
POST
/api/companies/:companyId/project-cost-details/:detailId/corrections
```

Body:

```text
expectedVersion
reason
changes
```

Correction:

* keeps the same detail identity;
* records immutable audit before/after state;
* increments detail version;
* recomputes parent aggregate;
* cannot silently delete history.

Do not use parent snapshot replacement for normal new detail corrections after cutover.

---

# 21. No hard delete

No public hard delete for:

* draft detail;
* published detail;
* evidence history.

Abandoned drafts may remain drafts in V1.

A future abandoned/cancelled lifecycle can be designed separately if needed.

---

# 22. Detail-level source provenance

Current:

`project_cost_item_sources`

links provenance at parent/category level.

That is insufficient for a specific expense entry.

Add:

`project_cost_item_detail_sources`

Fields:

```text
tenant_id
company_id
project_cost_item_detail_id
source_reported_figure_id
created_at
```

Unique:

```text
(detail_id, source_figure_id)
```

New entry preparation/publish uses detail-level source links.

Existing parent-level source links remain legacy/category provenance.

Do NOT automatically copy parent source links onto individual details because attribution cannot be inferred safely.

---

# 23. Detail-level evidence

Extend `cost_evidence_links`.

Add:

```text
project_cost_item_detail_id
```

Target invariant becomes exactly one of:

```text
project_cost_item_id
project_cost_item_detail_id
project_subcontract_payment_id
```

New ordinary accounting entries must link evidence to:

`project_cost_item_detail_id`

Existing parent evidence remains valid legacy/category-level evidence.

Do NOT redistribute existing parent evidence automatically.

---

# 24. Evidence APIs

New ordinary entry endpoints:

```text
POST /project-cost-details/:detailId/evidence
GET  /project-cost-details/:detailId/evidence
```

Capability semantics remain:

```text
cost.prepare
→ create/finalize/link evidence

cost.source.read
→ list metadata

cost.read + cost.file.read
→ raw official evidence bytes according to resource visibility
```

Evidence remains financially neutral.

---

# 25. Official read model

For ordinary categories:

```text
official detail rows
=
details WHERE publication_state = published
```

Draft rows must not appear in:

* Director Project Cost;
* category totals;
* project totals;
* warranty aggregates;
* ordinary cost ledger;
* cost.read raw table projections.

Official `detailCount` counts only published details.

---

# 26. Draft read model

Draft entries are separate accounting preparation projections.

Provide:

```text
GET /projects/:projectId/cost-entry-drafts
GET /project-cost-details/:detailId/draft
```

`cost.prepare`:

may read complete draft financial state.

`cost.manage`:

may receive an operational-only projection that excludes financial amount/source state.

Preserve capability independence.

---

# 27. RLS

Critical invariant:

A draft detail under a published parent must NOT become readable through `cost.read` merely because its parent is published.

Existing parent-based child visibility is insufficient.

Detail RLS must include the detail's own publication state.

Conceptually:

```text
published detail
AND cost.read
→ official read allowed

draft detail
AND cost.prepare
→ full preparation read allowed

draft detail
AND cost.manage
→ only guarded operational RPC projection
```

Do not expose draft financial columns to a manage-only actor.

---

# 28. Subcontract labor

No behavior change.

For:

`posting_strategy = subcontract_payment`

reject ordinary detail creation with:

`SUBCONTRACT_COST_MODEL_UNSUPPORTED`

Canonical path remains:

```text
project_subcontracts
→ project_subcontract_payments
```

Recorded payments contribute Actual.

Voided payments do not.

Replacement semantics remain unchanged.

The 11 currently observed legacy subcontract details remain historical data and must continue to be excluded from canonical subcontract Actual according to reconciliation rules.

---

# 29. Existing data backfill

Current Cloud DEV baseline observed during design:

```text
10 project_cost_items
all currently published

432 project_cost_item_details

421 ordinary details
11 legacy subcontract details

0 parent drafts
```

Migration backfill:

all existing detail rows:

```text
publication_state = published
publication_origin = legacy_backfill
```

Use a deterministic historical timestamp such as existing `created_at` for `published_at`.

Do not invent a publisher actor if historical provenance does not establish one.

---

# 30. Migration safety gate

Before applying lifecycle migration:

assert there are no existing parent drafts requiring semantic conversion.

If any exist:

BLOCK with a stable migration error.

Do NOT automatically guess how:

* parent evidence;
* parent source links;
* multi-line draft snapshots

should map to individual detail drafts.

Cloud DEV currently satisfies this gate.

Production must receive its own read-only assessment before deployment.

---

# 31. Parent amount migration invariant

Capture before migration:

```text
parent id
amount
detail sum
finance totals
```

After backfill and trigger replacement:

all existing published totals must be byte-for-byte/numerically identical.

Required invariant:

```text
before parent amount
=
after SUM(published details)
```

for every existing parent.

No historical Project Actual may change during migration.

---

# 32. Parent draft API compatibility

Do not remove old HTTP routes in this backend-only phase.

Mark them deprecated.

Patch them only as required so they remain internally consistent with detail lifecycle columns.

Future UI must stop using them.

A later cleanup phase can retire:

```text
parent draft create
parent complete-snapshot prepare
parent publish
parent financial correction
```

after the new detail-entry screen is live.

---

# 33. Future UI contract — NOT IMPLEMENTED NOW

Planned dedicated screen:

```text
/costs/:projectId/entries/new
```

or equivalent final route.

Purpose:

create one ordinary cost entry.

Suggested fields:

```text
Category
Description
Quantity
Unit
Unit price
Amount
Relevant date
Reference
Note
Retention
Evidence
```

Actions:

```text
Lưu bản nháp
Ghi nhận ngay
```

`Lưu bản nháp`:

uses draft-detail command.

`Ghi nhận ngay`:

uses atomic direct-publish command.

If category strategy is:

`subcontract_payment`

the screen must not create an ordinary detail and should direct the user to the subcontract cash workflow.

This UI is a separate Antigravity task.

CodeX MUST NOT implement this screen in the backend refactor.

---

# 34. Required invariants

The refactor is accepted only if all remain true:

```text
1 project/category → max 1 parent

ordinary Actual
= SUM(published ordinary details)

draft ordinary detail
= zero official financial effect

subcontract Actual
= recorded subcontract payments only

voided payment
= zero Actual effect

legacy subcontract details
= historical only

parent amount
= derived, never independent user input

evidence
= financially neutral

source provenance
= no inferred/fake source figures

tenant/company isolation
= unchanged

existing official totals
= unchanged by migration
```
