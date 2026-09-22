# C1 Accounting Write Backend — P5 Correction

## Phase

P5 — Published Cost Correction

## Files changed

- `supabase/migrations/20260922075933_c1_accounting_write_correction_command.sql`.
- Lifecycle pgTAP and target contracts.
- Shared correction contract, Project Cost backend/API wiring, and focused tests.

## Migration

The P5 migration adds the explicit, idempotent `c1_correct_published_project_cost` command. The legacy parent-rewrite RPC remains revoked. The migration is committed and unapplied until P7.

## Focused RED evidence

The empty migration failed the P5 source contract, and six service/route cases failed because the explicit correction surface did not exist.

## Implementation summary

Only `cost.correct` can correct a published ordinary cost. The command locks the row, requires `expectedVersion` and a reason, replaces a supplied complete detail/source snapshot under the guarded derived-amount mechanism, updates the current projection once, and retains complete before/after parent/detail/source evidence in immutable audit history. Operational-only correction uses the same command and scope validation.

## Focused GREEN tests

- P5 source contract: PASS.
- Correction service/routes and derived-parent schema regression: PASS, 3 files / 97 tests.
- `pnpm typecheck`: PASS.

## RBAC, RLS, and security negatives

- `cost.manage`, `cost.prepare`, `cost.publish_import`, and `cost.record_cash` cannot substitute for `cost.correct`.
- Missing reason, stale version, changed replay payload, draft state, cross-scope hierarchy/source data, and legacy subcontract material correction fail closed.
- Same-key replay is stable; the external cost version increments once.
- Ordinary PATCH and the legacy correction RPC cannot rewrite a published parent amount.

## Jev checkpoint

Command form: `node --env-file=.env.local scripts/run-typesafe-jev.mjs .superpowers/typesafe/p5.json`.

Model `jev-1.13.0` returned: capability bypass `0.14`, tenant/company leakage `0.08`, destructive history `0.05`, duplicate facts `0.11`, and scope crossing `0.25`.

Disposition: no supported defect. Scope was reviewed; changes are limited to the correction migration, shared contract, explicit backend route, and required tests.

## Diff and commit

- `git diff --check`: PASS.
- P5 implementation: `eb527fc`.

## Gate

PASS. Published financial changes now have one version-safe, reasoned, reconstructable correction path. Cloud DEV and Production were not mutated in P5.
