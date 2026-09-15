# C1 P3R Minimal Project Cost Domain Design

**Status:** Approved design (2026-09-15)

This is the active design companion to [the P3R scope](p3r-minimal-project-cost-scope.md). It is documentation only and authorizes no migration, Cloud operation, candidate intake, API, or UI work.

## Boundary

The domain supports Project-scoped management-tracked work value:

`Project -> management work/cost value -> execution or acceptance status -> Director overview`

It excludes accounting Actuals, payments, cash, payable/receivable, invoices, revenue, budgets, forecasts, profit, and categories in the initial domain.

## Reused infrastructure

- `projects` is required Project ownership.
- `business_parties`, `project_engagements`, and `engagement_components` are optional contextual links only.
- Source tables remain provenance, never Project Cost identity or ownership.
- Immutable `audit_events` provides correction history.
- `cost_command_receipts` provides create-command idempotency.
- Existing optimistic `version` conventions apply.

`cost_document_events` is document-specific and is not reused for Project Cost history.

## Aggregate root: Project Cost Item

`project_cost_items` holds one mutable current-state management work-value record for one logical item.

Required fields are `id`, `tenant_id`, `company_id`, `project_id`, `description`, `amount`, `currency_code`, `work_status`, `version`, and creation/update metadata. `id` is the durable logical identity.

Optional fields are `business_reference`, `party_id`, `engagement_id`, `component_id`, and `relevant_date`.

`business_reference` is retained only when VQH supplies a genuine reference. It is never invented to satisfy the schema. Where present, it is unique per tenant/company/Project; where absent, the immutable item ID remains the logical identity.

## Lifecycle and F04 double-count protection

The selected lifecycle is mutable current state with immutable audit history. A status transition or correction updates the same Project Cost Item ID using an expected version and a row lock; it never creates an additive successor record.

- `unknown` means the value is known but work status is not confirmed.
- `unknown -> in_progress` and `unknown -> accepted` require explicit business confirmation.
- `in_progress -> accepted` is a same-row transition.
- A correction or reversal uses `cost.correct`, a required reason, expected version, and before/after audit state.

Only explicitly confirmed, non-overlapping `accepted` and `in_progress` items aggregate. Confirmation is a command-boundary decision recorded in audit history; no separate eligibility field is needed. Source identity, workbook filename, sheet, cell/range, source selection ID, and source figure ID are forbidden as Project Cost identity.

## Aggregation contract

Each Project summary returns:

- `accepted_value` and `accepted_count`
- `in_progress_value` and `in_progress_count`
- `unknown_status_value` and `unknown_count`
- `total_tracked_work_value = accepted_value + in_progress_value`

`unknown_status_value` is visible separately and never enters `total_tracked_work_value`. If there are no eligible records, accepted/in-progress/total are zero with zero counts. If only unknown records exist, the zero eligible total is accompanied by nonzero unknown count and value.

## Money, status, and hierarchy

- Store an always-known nonnegative `numeric(20,4)` amount and a resolved three-letter currency. Zero is valid only when explicitly known; it never means unknown.
- The configured VQH `VND` default may populate a record only through an approved defaulting rule. No conversion, debit/credit, or accounting semantics exist.
- Statuses are exactly `unknown`, `in_progress`, and `accepted`. They describe work execution/acceptance, not payment.
- Project is required. Party is optional. Engagement is optional but, when supplied, must belong to the Project and have a consistent Party. Component is optional but requires that Engagement.
- No Party, Engagement, Component, or category may be manufactured to create an item.

## Provenance

`project_cost_item_sources` is the only new provenance relation. One Project Cost Item may link to one or more `source_reported_figures`; source rows remain evidence only. The unique constraint is exactly `(project_cost_item_id, source_reported_figure_id)`.

There is no global unique constraint on `source_reported_figure_id`. A future proven business case may legitimately use one source as evidence for multiple items. The initial VQH intake can enforce a stricter one-source-to-one-item rule when its approved evidence warrants it, without making that intake rule permanent schema identity.

## Permissions and mutation boundary

- `cost.read` reads Project Costs.
- New `cost.manage` creates and manages Project Cost Items.
- `cost.correct` corrects or reverses material state.

Create validates tenant/company/Project scope, optional hierarchy, optional genuine business reference, and explicit non-overlap confirmation; it creates an audit event and command receipt. Update and transition share one expected-version command. Direct authenticated table mutations are not permitted.

## Likely physical schema

Two tables only:

1. `project_cost_items`: scoped aggregate root, optional hierarchy FKs, `numeric(20,4)` amount, currency/status checks, nullable Project-scoped business-reference unique index, Project/status aggregation index, forced RLS, and no direct authenticated mutation grants.
2. `project_cost_item_sources`: scoped Project Cost Item/source figure FKs, relation-pair unique constraint, reverse source lookup index, and provenance-only RLS.

All writes use a guarded command/RPC boundary. `audit_events` remains the single correction-history system; no revision, ledger, document, cash, invoice, or specialized event table is introduced.

## Candidate compatibility

The current 29 source candidates can supply Project ownership, source provenance, numeric value, and a proposed description. They still require VQH confirmation of work item, status, non-overlap, and currency/default approval. Party and date are optional; confirmed items therefore do not require artificial Engagements or Components.
