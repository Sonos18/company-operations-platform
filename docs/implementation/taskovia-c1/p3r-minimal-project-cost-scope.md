# C1 P3R Minimal Project Cost Scope

**Status:** Active now (2026-09-15)

This record resets the active Phase 3 direction without altering the historical C1 plans, phase reports, or P3A/P3B analysis.

## Active now

Deliver minimal Project Cost Management for VQH. The Director experience is:

`Project -> Cost Overview -> Contractor or business item -> work status -> value -> detail`

- Eo Gió and Yong Mei remain independent Projects.
- A management cost record is Project-scoped and may include a known Party, business item, lightweight category, value/currency, execution or acceptance status, relevant date/period, provenance, and correction history.
- The immediate status boundary is execution/acceptance: at minimum `in_progress`, `accepted`, and `unknown`.
- A management cost record is not an accounting Actual, paid amount, payable, receivable, invoice, or cash movement.

## Deferred

General ledger, revenue recognition, cash, receivable/payable lifecycle, invoices, payments, banks, budget, forecast, profit, profit margin, and completion estimates require a separate future business request.

## Historical analysis retained

P3A/P3B financial-semantic assessment and evidence-contract work remain historical analysis for a potential future financial domain. They do not set the active C1 implementation scope.

## Source and evidence guard

Project ownership remains persisted-only. Workbook identity, labels, sheets, and locators do not establish Project ownership, contractor identity, payment state, or accounting semantics. Source evidence may support a management cost only after its Project, item, value, currency/default, and execution/acceptance status are sufficiently known.

## F04 — aggregation identity and double-count prevention

A Project Cost record is a management-tracked **work value** for a Project. It is not automatically a total contract value, advance, payment, payable or receivable balance, cash movement, revenue, or accounting-recognized cost. Those values remain provenance/context unless VQH explicitly confirms that the specific value is the work value to track.

Only mutually non-overlapping management work-value records contribute to Director totals:

- `accepted_value`
- `in_progress_value`
- `total_tracked_work_value = accepted_value + in_progress_value`

The equation applies only after the participating records are verified as distinct business items. `unknown` status never enters either subtotal. When one underlying item moves from `in_progress` to `accepted`, it must remain one logical item through a status transition/correction or immutable revisions with only the current effective revision aggregated. Physical implementation remains a later design decision.

The future domain must use a stable logical business identity that can prevent duplicate aggregation. Workbook filename, sheet, cell/range, and source selection ID are prohibited as business identity inputs; source rows remain provenance only.

## Current candidate policy

The current 29 source candidates are not yet Project Cost records. A candidate may become one only when VQH establishes the Project, business work item, tracked value, currency/default-currency approval, `in_progress` or `accepted` status, non-overlap with other tracked records, and provenance. Party and date/period remain optional where the management use allows.

Contract totals, advances, balances, revenue, and cash values must not be promoted merely because they appear in a contractor-related block.

## Next decision

P3R-A assesses the smallest generalized Project Cost extension, the minimum VQH confirmations, and the Director cost overview. No migration, Cloud mutation, or UI implementation is authorized by this record.
