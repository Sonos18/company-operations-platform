# C1 Accounting Write Backend — P2 Draft Preparation

## Phase

P2 — Draft Cost Manage + Financial Preparation

## Files changed

- Shared Project Cost and API-error schemas.
- `supabase/migrations/20260922070950_c1_accounting_write_draft_commands.sql`.
- C1 lifecycle pgTAP and accounting-write source-contract tests.
- Project Cost repository, service, routes, and three thin API handlers.
- The non-visual HTTP repository contract and focused unit tests.

No page, component, layout, style, form, dialog, drawer, or other UI file changed.

## Migration

`20260922070950_c1_accounting_write_draft_commands.sql` is forward-only and locally committed. It has not been applied to Cloud DEV; the approved P7 gate deploys all six dependent migrations together.

The migration adds guarded create/update/prepare/read/list RPCs, computed publish readiness, lifecycle-safe legacy create/update wrappers, and a transaction-scoped complete detail/source snapshot replacement. It reuses `project_cost_items`, `project_cost_item_details`, `project_cost_item_sources`, `cost_command_receipts`, and `audit_events`; it creates no second cost or cash ledger.

## Focused RED evidence

- Shared contracts: 10 failures for four missing schemas and six missing stable error codes.
- P2 migration source contract: failed against the CLI-created empty migration.
- Server/API boundary: 12 failures for missing service, route, and HTTP repository operations.

## Implementation summary

- `cost.manage` owns draft creation and operational metadata only.
- `cost.prepare` owns complete financial detail/source snapshots and draft reads.
- Parent amount is derived from the detail snapshot; explicit zero is valid and no-detail is not prepared.
- Create uses a canonical payload hash and command receipt; replay reauthorizes before returning.
- Update and prepare require `expectedVersion` and a locked draft row.
- New `subcontract_labor` drafts are rejected to avoid duplicating canonical payment-ledger Actual semantics.
- Ordinary PATCH accepts only draft operational changes; correction payloads are rejected.

## Focused GREEN tests

- Shared schemas/errors: PASS, 2 files / 48 tests.
- P1/P2 target source contracts: PASS, 1 file / 2 tests.
- Safety runners: PASS, 2 files / 25 tests.
- Project Cost service/routes/HTTP plus finance regressions: PASS, 4 files / 131 tests.
- `pnpm typecheck`: PASS.

## RBAC, RLS, and security negatives

- All four sibling write capabilities are denied as substitutes for `cost.manage` and `cost.prepare`.
- Tenant/company/project/category/party/engagement/component/source scope is resolved or validated server-side and again in the RPC.
- Published rows reject draft update and financial preparation.
- Stale versions, changed idempotency payloads, missing current authorization on replay, blocking source review, and unshared sources fail deterministically.
- Private helpers are revoked from application roles; only exact public wrappers are granted to `authenticated`.
- Direct authenticated table DML remains unavailable.

## Jev checkpoint

Command form: `node --env-file=.env.local scripts/run-typesafe-jev.mjs .superpowers/typesafe/p2.json`.

Model `jev-1.13.0` returned: capability bypass `0.19`, tenant/company leakage `0.09`, destructive or silent history behavior `0.07`, duplicate financial/cash facts `0.28`, and scope crossing `0.24`.

Disposition: no supported defect. The two higher scores were inspected: P2 reuses the canonical parent/detail/source projection and introduces no payment model, while its non-visual HTTP repository changes are the approved stable contract for the later Antigravity UI. Tests and database constraints remain authoritative.

## Diff and commits

- `git diff --check`: PASS.
- Contracts: `0bb9d8c` (`feat(c1): define accounting write contracts`).
- Database commands: `00c86b8` (`feat(c1): add draft cost commands`).
- Server/API: `a5e6eda` (`feat(c1): expose draft cost preparation api`).

## Gate

PASS. Drafts remain excluded from official reads, `cost.manage` and `cost.prepare` have distinct positive and bypass-negative coverage, and Cloud DEV/Production were not mutated in P2.
