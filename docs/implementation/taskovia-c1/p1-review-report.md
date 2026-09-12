# Taskovia C1 P1 review record

## Scope and checkpoints

P1 delivered the C1 foundation only: strict master-data schemas and permissions, server/context/repository/route wiring, one Cloud DEV foundation migration, a guarded C1 SQL runner, transactional fixture evidence, ACL hardening, and generated types.

| Checkpoint | SHA |
| --- | --- |
| P1.3B server/HTTP slice | `f458c14012a99c734ca75afeb088b515bae91866` |
| P1.4A fixture | `d7a5c88a2a2718ebba7d48da5dda02809685739c` |
| P1 ACL repair | `e1ef357573afb4a45d5746b01d5cb9fdddec28ca` |
| Generated types reconciliation / tested implementation | `db47ccd5856f788d05db73ab3de8c42eab00f600` |

## Delivered inventory

- Shared C1 contracts and twelve permission definitions in `shared/schemas/costs/master-data.ts` and `shared/constants/permissions.ts`.
- Project Register, Business Party, Engagement, Component, and Cost Settings server features; company-scoped API routes; HTTP repositories; and repository registry wiring.
- `20260911145035_taskovia_c1_foundation.sql`: seven C1 tables, composite scope foreign keys, RLS read mapping, RPC-only mutations, disabled-by-default company settings, and C1 permission catalogue entries.
- `scripts/run-c1-cloud-dev-tests.mjs`, `supabase/tests/database/c1/c1_foundation.test.sql`, and focused unit contracts.
- Generated type snapshot reconciliation in [p1-generated-types-reconciliation.md](p1-generated-types-reconciliation.md).

## Database and Cloud evidence

The applied migration SHA-256 is `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556`. The P1.4B task transcript (2026-09-12, repair checkpoint `e1ef357...`) records guarded target/auth/status/dry-run, one migration application, 33/33 parity, and `pnpm db:dev:c1:test` exit 0.

The actual Cloud fixture establishes synthetic-only evidence for:

- active membership, exact permission, C1 module gate, stale-version atomicity, and scope/reference denials;
- public-RPC ACLs, anon public-RPC denial, and authenticated private-command denial;
- project, party, engagement, component, multiple-engagement, and direct-write boundaries;
- project/party/engagement/component/cost-setting direct-read RLS mapping; and
- rollback with zero run-owned C1 master-data residue.

The public command wrappers remain SECURITY DEFINER with fixed search paths; client roles execute only public RPCs. Internal C1 helpers revoke EXECUTE from `PUBLIC`, `anon`, and `authenticated`. `cost.read` is not a management-catalog read permission.

## Deterministic application evidence

At `db47ccd...`, `pnpm verify:app` passed 102 test files / 749 tests, `nuxt typecheck`, ESLint, and the production build under Node `v24.19.0` and pnpm `10.29.3`.

Focused P1 tests cover shared contracts, server/service/route behavior, HTTP repositories, command/RLS/runner contracts, and generated-type compatibility. These tests use controlled doubles where they exercise server or HTTP boundaries. They are not represented as browser-to-Cloud proof.

## Evidence limits and next phases

P1 did not run a live browser flow. P5 owns C1 UI/navigation and browser evidence; P6 owns final acceptance. P2–P4 own source/files, financial documents, allocations, coverage, and reporting. Acceptance-map rows therefore remain partial until their listed phase/P6 evidence exists. In particular, A01 requires a `legacy_import` Project Register Cloud fixture execution. The shared project contract accepts that origin, but P1.4B exercised only the independent `manual` path. This is the remaining P1 acceptance blocker; closing it requires a separately authorized fixture-only Cloud run.

No Production operation, real VQH business-data mutation, real C1 permission assignment, or real-company C1 enablement occurred. P1.4C adds no Cloud write; remote delivery remains pending until its documentation commit is pushed and verified.
