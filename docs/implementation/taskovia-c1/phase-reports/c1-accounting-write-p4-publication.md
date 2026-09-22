# C1 Accounting Write Backend — P4 Publication

## Phase

P4 — Explicit Publish Command

## Files changed

- `supabase/migrations/20260922075204_c1_accounting_write_publish_command.sql`.
- Lifecycle pgTAP and accounting-write target contracts.
- Shared publish input, Project Cost repository/service/routes, one thin publish API handler, and focused tests.

## Migration

The committed, unapplied P4 migration adds only `c1_publish_project_cost` and its private implementation. It reuses P2 readiness and existing receipts/audit history; Cloud DEV application remains deferred to P7.

## Focused RED evidence

- The P4 source contract failed against the empty CLI migration.
- Publish service/route tests failed six cases because no publish method or route existed.

## Implementation summary

`cost.publish_import` is the sole activation capability. The command reauthorizes before replay, advisory-locks receipt identity, locks the draft, checks `expectedVersion`, validates computed readiness, transitions to published once, records attribution, increments version, writes immutable audit evidence, and commits the receipt atomically.

## Focused GREEN tests

- P4 source contract: PASS.
- Publish service/routes plus Director finance reducers/regressions: PASS, 4 files / 118 tests.
- `pnpm typecheck`: PASS.

## RBAC, RLS, and security negatives

- `cost.manage`, `cost.prepare`, `cost.correct`, and `cost.record_cash` cannot substitute for `cost.publish_import`.
- Stale version, unprepared financials, pending evidence, blocking/unshared sources, and `subcontract_labor` fail closed.
- Same-key replay is stable; changed payload conflicts; another key after publication returns `COST_ALREADY_PUBLISHED`.
- The locked state transition and existing published-only read predicates prevent duplicate activation.

## Jev checkpoint

Command form: `node --env-file=.env.local scripts/run-typesafe-jev.mjs .superpowers/typesafe/p4.json`.

Model `jev-1.13.0` returned: capability bypass `0.08`, tenant/company leakage `0.10`, destructive history `0.07`, duplicate facts `0.11`, and scope crossing `0.22`.

Disposition: no supported defect. The scope result was inspected; P4 changes only publication command/schema/server wiring and the necessary regression tests.

## Diff and commits

- `git diff --check`: PASS.
- Publish command: `a16cccd`.
- Publish API: `e711666`.

## Gate

PASS. Draft preparation remains non-official and only the explicit audited publish transaction activates C1 reporting. Cloud DEV and Production were not mutated in P4.
