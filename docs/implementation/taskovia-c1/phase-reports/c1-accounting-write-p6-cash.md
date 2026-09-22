# C1 Accounting Write Backend — P6 Cash

## Phase

P6 — Canonical Cash Recording

## Files changed

- `supabase/migrations/20260922080759_c1_accounting_write_cash_commands.sql`.
- Cash pgTAP and target contracts.
- Shared finance-write contracts, dedicated repository/service/routes, two thin API handlers, and focused tests.
- One finance regression asserting void/replacement totals.

## Migration

The P6 migration extends `project_subcontract_payments` with a same-scope one-time replacement relation and adds guarded record/void RPCs. It reuses existing finance preparation, immutability, audit, RLS, and read semantics. It is committed and unapplied until P7.

## Focused RED evidence

The P6 source contract failed against the empty migration. Three server suites failed because the cash schemas and backend did not exist.

## Implementation summary

`cost.record_cash` records actual outgoing subcontract payments in the existing canonical ledger. Recorded money and replacement identity are immutable. Corrections use a reasoned void followed by an optional replacement row; a voided row can be replaced once. Finalized payment evidence links atomically as `payment_proof` without creating a cost fact.

## Focused GREEN tests

- P6 source contract and safety runners: PASS.
- Cash schemas, permission/error mapping, routes, existing finance reductions, and void/replacement regression: PASS, 6 files / 52 tests.
- `pnpm typecheck`: PASS.

## RBAC, RLS, and security negatives

- `cost.manage`, `cost.prepare`, `cost.publish_import`, and `cost.correct` cannot substitute for `cost.record_cash`.
- Direct authenticated payment DML remains denied.
- Wrong company/project/subcontract/currency, inactive or stale subcontract, nonpositive money, invalid retention/evidence/replacement, changed replay, missing void reason, and double void fail closed.
- Monetary updates and replacement-identity updates raise `HISTORY_IMMUTABLE`.
- Existing finance totals exclude voided rows and include the replacement once.

## Jev checkpoint

Command form: `node --env-file=.env.local scripts/run-typesafe-jev.mjs .superpowers/typesafe/p6.json`.

Model `jev-1.13.0` returned: capability bypass `0.08`, scope leakage `0.10`, destructive history `0.08`, duplicate facts `0.07`, and scope crossing `0.16`.

Disposition: no supported defect. The implementation remains within the existing subcontract payment ledger and does not add banking, payroll, settlement, C2, or C3 behavior.

## Diff and commits

- `git diff --check`: PASS.
- Cash database commands: `f566d58`.
- Cash API: `dfd8437`.

## Gate

PASS. Cash is separate from recognized/project cost, immutable after record, and correctable only by void plus replacement. Cloud DEV and Production were not mutated in P6.
