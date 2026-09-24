# C1 final pre-Cloud fix report

## Scope

One local-only fix wave addressed every whole-branch review finding. No Cloud DEV, Local database, UI, browser, reset, seed, migration push, or Production operation ran.

## Fixes

- Direct create-and-publish now removes only absent JSON values before preparing financials, preserving absent `sourceFigureIds` versus explicit `[]`.
- The rollback rehearsal now selects exactly the pending `20260923134446` metadata migration and the three C1 lifecycle migrations, in timestamp order; historical accounting-write migrations are excluded.
- Detail update, prepare, publish, and correction validate a present, bounded integer `expectedVersion` before casts and compare with `IS DISTINCT FROM`. Publish accepts its version in JSON so direct RPC callers cannot trigger PostgreSQL parameter coercion errors first.
- The canonical resolver rejects a same-scope draft parent. Detail mutation scope validation also requires a published ordinary-detail parent, so new commands cannot attach to legacy draft parents.
- Raw detail RLS is published plus `cost.read` only. Detail-source RLS has its own permission-aware decision: published plus `cost.read`, draft plus `cost.prepare`; `cost.manage` and foreign-company reads remain denied. The arbitrary publication-state helper is no longer executable by `authenticated`.
- Detail create bodies now derive `projectId` only from the route path; the server adds it to the internal RPC request and idempotency hash. Client request bodies and the Antigravity handoff no longer include it.
- Legacy Project Cost and Finance coherence always compare a parent to the published-detail sum, including an empty set treated as zero.

## TDD and verification

- RED: focused tests produced the expected 9 failures for migration-stack selection, strict body shape, path-to-RPC injection, empty-detail coherence, and finance coherence.
- GREEN: focused Vitest run passed 6 files / 142 tests.
- `pnpm test:unit` passed 164 files / 1,448 tests.
- `pnpm typecheck` passed.
- `git diff --check` passed.

## Database test status and remaining risk

- pgTAP contracts now cover absent/empty direct source arrays, bounded direct-RPC versions, a real draft-parent collision, published-only raw detail RLS, source-policy behavior, and non-executable state probing. Their plans are 77, 27, and 46 assertions respectively.
- pgTAP and migration rehearsal were deliberately not executed: the current scope forbids Cloud DEV and Local database operations. The guarded Cloud DEV stage must run the pending four-migration rollback rehearsal and behavioral pgTAP before any deployment decision.
- Generated Supabase database types were not refreshed because that requires the guarded Cloud DEV type workflow after the migrations are applied.
