# C1 Ordinary Cost Detail Lifecycle — Implementation Plan

**Suggested path**

`docs/superpowers/plans/2026-09-24-c1-ordinary-cost-detail-lifecycle-implementation.md`

## Scope

Backend, database, shared schemas, API contracts, tests and documentation only.

**NO UI IMPLEMENTATION.**

Do not modify visual components/pages for the new screen.

---

# P0 — Baseline and migration assessment

Read:

* `AGENTS.md`
* current C1 finance migrations
* PR #17 accounting-write design/handoff
* current finance read model
* evidence model
* source provenance model

Capture read-only baseline:

```text
project_cost_items
project_cost_item_details
cost_categories
project_cost_item_sources
cost_evidence_links
project_subcontract_payments
project_cost_reconciliation_resolutions
```

Assert:

* category-parent uniqueness;
* current parent amounts equal current detail sums;
* parent-draft count;
* ordinary vs subcontract detail counts;
* current Project Finance totals.

PASS:

No unresolved model drift.

No mutation during P0.

---

# P1 — Explicit category posting strategy

Forward migration:

add:

`cost_categories.posting_strategy`

Allowed:

```text
ordinary_detail
subcontract_payment
```

Backfill:

```text
subcontract_labor → subcontract_payment
everything else in current C1 catalog → ordinary_detail
```

Update shared schemas and metadata readers.

Add contract tests proving all configured categories have a strategy.

PASS:

No runtime description-based classification.

---

# P2 — Detail publication lifecycle schema

Forward migration on:

`project_cost_item_details`

Add:

```text
publication_state
publication_origin
published_by
published_at
publication_request_id
```

Alter `amount_text` to allow NULL for drafts.

Add lifecycle shape constraints.

Backfill all existing details published.

Add indexes beginning with:

```text
tenant_id
company_id
publication_state
project_cost_item_id
```

Add migration gate rejecting unsafe pre-existing parent drafts.

PASS:

Existing data unchanged financially.

---

# P3 — Published-only parent aggregation

Replace detail→parent synchronization semantics.

For published aggregate parent:

```text
SUM(published details)
```

For legacy parent draft compatibility:

retain existing snapshot aggregation behavior until parent flow is retired.

Ensure:

* draft detail insert does not change published parent amount;
* draft update does not change published parent amount;
* detail publish updates parent amount exactly once;
* published correction updates parent amount exactly once.

PASS:

All existing parent totals remain identical after migration.

---

# P4 — Detail RLS / visibility

Fix child visibility so parent publication state alone does not expose draft children.

Implement:

```text
published detail + cost.read
→ official read

draft detail + cost.prepare
→ financial draft read

cost.manage
→ operational-only guarded projection
```

Add tenant/company/project/parent scope assertions.

PASS:

A draft detail under a published parent cannot leak through `cost.read`.

---

# P5 — Canonical parent resolver

Implement one private helper/command for:

```text
resolve or create aggregate parent
```

Input:

```text
company
project
category
actor/request context
```

Reject:

`posting_strategy = subcontract_payment`

Concurrency-safe parent creation.

Preserve:

`c1fc_cost_item_one_category`

PASS:

Concurrent detail creates cannot create two parents.

---

# P6 — Create draft detail command

Implement RPC/API/repository/shared schema for:

```text
create ordinary detail draft
```

Permission:

`cost.manage`

Idempotent.

Allocate unique `line_no` under a parent lock.

No Project Actual effect.

Add operational-only draft read projection.

PASS:

Creating draft changes no parent/project official totals.

---

# P7 — Prepare one draft detail

Implement financial preparation for ONE detail.

Permission:

`cost.prepare`

Support:

```text
quantity
unitCode
unitPrice
amount
retention
sourceFigureIds
```

Do NOT replace sibling details.

Do NOT delete sibling rows.

PASS:

Editing detail #297 cannot modify details #1–296.

---

# P8 — Publish existing detail

Implement:

```text
draft detail → published detail
```

Permission:

`cost.publish_import`

Idempotent.

Transactional:

```text
lock
validate
publish
audit
receipt
aggregate update
```

PASS:

Parent amount increases by exactly the published entry amount.

---

# P9 — Direct create + publish

Implement atomic direct posting.

Permission requirement:

```text
cost.manage
AND cost.prepare
AND cost.publish_import
```

Do not expose a transient committed draft.

Idempotent.

PASS:

Same-key replay never creates a second detail or increments parent twice.

---

# P10 — Published detail correction

Implement:

`cost.correct`

Versioned + reasoned + audited.

No hard delete.

Correction modifies one detail only.

Parent aggregate updates transactionally.

PASS:

Sibling details unchanged.

Audit before/after complete.

---

# P11 — Detail source provenance

Create:

`project_cost_item_detail_sources`

Add scope FKs and immutability.

Use source figures only when explicitly linked.

Do not infer parent provenance to child entries.

PASS:

A detail can identify its exact source figures independently.

---

# P12 — Detail evidence target

Extend:

`cost_evidence_links`

with:

`project_cost_item_detail_id`

Change exactly-one-target constraint.

Add indexes/FKs.

Add detail evidence link/list APIs.

Update raw-file target resolution.

Existing parent/payment evidence stays valid.

PASS:

Evidence for one expense is not ambiguously attached to the entire category.

---

# P13 — Official read-model cutover

Update Finance read paths:

ordinary category:

```text
published details only
```

Draft details excluded from:

* category amount;
* project amount;
* retention;
* detail count;
* latest official date;
* ordinary ledger.

Subcontract logic unchanged.

PASS:

Existing official Cloud DEV finance response remains numerically identical immediately after migration/backfill.

---

# P14 — Parent-draft compatibility

Patch existing parent-draft commands only enough to remain internally valid during the transition.

Examples:

* draft parent snapshot rows remain draft;
* old parent publish marks its child snapshot rows published;
* old published correction creates published replacement snapshot rows.

Mark APIs deprecated in documentation.

Do not add new features to the parent lifecycle.

PASS:

No regression for existing routes before UI cutover.

---

# P15 — Stable errors

Add explicit domain errors, including:

```text
SUBCONTRACT_COST_MODEL_UNSUPPORTED
COST_DETAIL_NOT_DRAFT
COST_DETAIL_ALREADY_PUBLISHED
COST_DETAIL_PUBLISH_NOT_READY
VERSION_CONFLICT
IDEMPOTENCY_CONFLICT
RESOURCE_NOT_FOUND
```

Do not leak raw constraint names.

PASS:

No normal business conflict becomes generic database error.

---

# P16 — Test matrix

Database tests:

* detail draft create;
* prepare;
* publish;
* direct publish;
* replay;
* version conflict;
* correction;
* RLS;
* company isolation;
* parent creation race;
* parent aggregation;
* source linkage;
* evidence linkage;
* subcontract rejection.

Server/unit tests:

* schemas;
* repository mapping;
* capability matrix;
* stable errors;
* read-model exclusion.

Regression:

* current Project Finance;
* Director totals;
* current subcontract cash;
* current retention behavior;
* evidence security;
* company isolation.

---

# P17 — Cloud DEV acceptance

Only after migration/code review.

Use guarded Cloud DEV process.

Before mutation:

* verify project target;
* migration parity;
* branch/HEAD;
* no Production target.

Apply migrations through repository-approved guarded path.

Verify:

```text
421 existing ordinary details → published legacy
11 subcontract legacy details preserved
10 parent totals unchanged
0 unexpected parent drafts
```

Create isolated test detail:

```text
draft
→ confirm Project Actual unchanged
→ publish
→ confirm exact delta
→ correction
→ confirm exact delta
```

Test `subcontract_labor` rejection.

No destructive reset.

---

# P18 — Documentation / future UI handoff

Produce a backend handoff for Antigravity describing:

```text
new entry screen
save draft
publish now
edit draft
publish draft
evidence
stable errors
category posting strategy
```

Explicitly state:

**UI NOT IMPLEMENTED IN THIS TASK.**

---

# Final acceptance gate

PASS only when:

```text
existing official totals unchanged
ordinary draft detail has zero official effect
published detail affects total exactly once
direct publish affects total exactly once
subcontract Actual remains payment-only
one parent/category constraint preserved
no source/evidence attribution fabricated
tenant/company isolation passes
full unit/typecheck/lint/build passes
Cloud DEV acceptance passes
Production untouched
```
