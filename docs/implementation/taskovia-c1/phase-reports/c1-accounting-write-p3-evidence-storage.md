# C1 Accounting Write Backend — P3 Evidence Storage

## Phase

P3 — Immutable Evidence Registry + Private Storage

## Files changed

- `supabase/migrations/20260922073144_c1_accounting_write_evidence_storage.sql`.
- `supabase/tests/database/c1/c1_accounting_write_evidence.test.sql` and target-contract tests.
- Shared evidence schemas.
- Evidence integrity, repository, service, route, and five thin API handlers.
- Focused schema, service, route, Storage, and service-role-boundary tests.

## Migration

The P3 migration creates `cost_evidence_files`, `cost_evidence_links`, the private `c1-accounting-evidence` bucket, registry-backed Storage policies, immutable-history guards, and intent/finalize/link RPCs. It is committed but intentionally unapplied until the P7 all-at-once Cloud DEV gate.

## Focused RED evidence

- The P3 target contract failed against the empty CLI migration.
- The evidence test command failed three suites because the schema, integrity helper, service, and routes did not exist.

## Implementation summary

- Immutable object identity is server-generated as tenant/company/project/file UUID segments; the original filename is metadata only.
- Signed uploads explicitly set `upsert: false`; Storage has INSERT/SELECT policies only.
- Finalize downloads through the authenticated client, streams SHA-256 and byte count, compares declared MIME/size/hash, then atomically finalizes the registry row.
- Evidence metadata uses `cost.source.read`; raw signed reads use `cost.file.read`, require an accessible immutable link, and expire after 60 seconds.
- Links may optionally reference a source version but do not create source figures or change cost amount/version/state.

## Focused GREEN tests

- P1–P3 target contract: PASS, 3/3.
- Safety runners: PASS, 2 files / 25 tests.
- Evidence schemas, exact digest, permissions, routes, authenticated Storage behavior, service-role boundary, and source contract: PASS, 5 files / 38 tests.
- `pnpm typecheck`: PASS.

## RBAC, RLS, and security negatives

- All four sibling mutation permissions are denied as substitutes for `cost.prepare`.
- `cost.read` and `cost.source.read` cannot substitute for `cost.file.read`.
- Pending metadata/object access is creator-bound and expiry-bound; finalized raw access requires a same-company linked accessible resource.
- Authenticated roles have no evidence-table INSERT/UPDATE/DELETE and no Storage UPDATE/DELETE policy.
- Immutable file/link triggers reject replacement and deletion; cross-scope composite FKs and RPC checks fail closed.
- No service-role or admin Storage client was added.

## Jev checkpoint

Command form: `node --env-file=.env.local scripts/run-typesafe-jev.mjs .superpowers/typesafe/p3.json`.

Model `jev-1.13.0` returned: capability bypass `0.21`, scope leakage `0.17`, destructive evidence history `0.03`, duplicate financial/cash facts `0.04`, and scope crossing `0.17`.

Disposition: no supported defect. The capability result was reviewed against the explicit prepare/source/file permission matrix and linked-resource Storage predicate; these remain covered by deterministic tests and RLS contracts.

## Diff and commits

- `git diff --check`: PASS.
- Evidence registry/Storage: `8e8c2c8`.
- Linked-resource hardening: `f290cee`.
- Evidence backend/API: `98c887f`.

## Gate

PASS. Evidence is private, immutable, independently auditable, and financially neutral. Cloud DEV and Production were not mutated in P3.
