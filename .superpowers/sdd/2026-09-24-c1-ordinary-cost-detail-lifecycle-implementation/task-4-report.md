# Task 4 Report — P16/P18 Runner Integration and Handoff

## Status

Complete. The guarded C1 runner now includes the three ordinary-cost-detail rollback fixtures and validates their dedicated synthetic UUID namespaces. The rollback migration rehearsal includes the three lifecycle migrations by stable suffix and retains its exactly-one-match, timestamp-order, transaction-rollback behavior.

The future-UI handoff is [2026-09-24-c1-ordinary-cost-detail-lifecycle-antigravity-handoff.md](../../../docs/superpowers/specs/2026-09-24-c1-ordinary-cost-detail-lifecycle-antigravity-handoff.md). Existing accounting-write handoff/design documents now point to it and mark the legacy parent-draft lifecycle as temporary compatibility only.

## Verification

- RED: focused runner tests failed as expected before implementation: three new fixtures were absent from the guarded allowlist and the three rehearsal migrations were absent from the suffix list.
- GREEN: `pnpm test:unit tests/unit/config/c1-cloud-dev-runner.spec.ts tests/unit/config/c1-cloud-dev-migration-rehearsal.spec.ts` — 2 files, 38 tests passed.
- `pnpm typecheck` — passed.
- `git diff --check` — passed.
- No repository Markdown-link command is defined; the new handoff target was checked locally and exists.
- Cloud commands, Production, reset, repair, seed, push, generated DB types, and UI/browser work were not run.

## Remaining concerns

- Runtime Cloud DEV fixture execution and migration rehearsal remain intentionally not run; they require separate explicit authorization.
- Local Node is v22.23.2 while `package.json` requests Node 24.x; checks passed with pnpm's engine warning.

## Fix round 1

- Clarified the strict detail-evidence link body/result and the detail-evidence metadata response fields.
- Added `COST_DETAIL_NOT_PUBLISHED` recovery: refetch, then prepare or publish the draft before correction.
- Verified the handoff target/required contract text and `git diff --check`; no Cloud, UI, or code changes were made.

## Fix round 2

- Clarified `COST_DETAIL_NOT_PUBLISHED`: refetch, prepare if needed, publish, then use correction only after publication.
