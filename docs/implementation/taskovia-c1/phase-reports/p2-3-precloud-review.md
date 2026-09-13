# Taskovia C1 v1.2 P2.3 pre-Cloud review

## Status

`TRACK_A_P2_3_PRE_CLOUD_READY`

This is a pre-Cloud candidate, not P2 completion. Track A was the only repository writer. No database command, migration application, SQL fixture execution, generated database-type command, Local DB, Production operation, real workbook analysis/import, P3 work, PR, or merge occurred.

## Checkpoints

| Field | Value |
| --- | --- |
| Phase start SHA | `8eb675fced49eedf2d0967ae6622ca2a161248eb` |
| Expected/verified `origin/main` | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Tested code SHA | `2279d920ab9b465e256182ab07b27674462002d2` |
| Pre-report local/remote feature HEAD | `2279d920ab9b465e256182ab07b27674462002d2` / `2279d920ab9b465e256182ab07b27674462002d2` |
| F1–F3 repair start SHA | `c628d2e3744b6fd4026e80ed858045149b8b72b4` |
| F1–F3 tested code SHA | `f6f2d0ce06b0726b970f65a480c380cdd7e8aa8f` |
| Branch | `feat/taskovia-c1` |
| Runtime | Node `v24.19.0`; pnpm `10.29.3`; Supabase CLI `2.114.0` |

## Implemented files

- `server/features/costs/imports/controlled-import.service.ts`: trusted company/capability checks, frozen reviewed-request validation, canonical manifest handoff, deterministic payload digest, persist/read service methods.
- `server/features/costs/imports/controlled-import.repository.ts`: narrow user-scoped RPC interface, exact argument names, canonical snake-case result mapping, safe error mapping.
- `shared/schemas/api-error.ts`: generic `INPUT_INVALID` API boundary.
- `supabase/migrations/20260913082034_taskovia_c1_controlled_import.sql`: the only P2 replacement migration candidate.
- `supabase/tests/database/c1/c1_controlled_import_commands.test.sql`: synthetic persistence/replay/history/non-posting fixture.
- `supabase/tests/database/c1/c1_controlled_import_security.test.sql`: synthetic authorization/RLS/ACL/replay fixture.
- `scripts/run-c1-cloud-dev-tests.mjs`: preserves the P1 fixture and allowlists exactly the two P2.3 fixtures.
- Unit contracts: `controlled-import-persistence.spec.ts`, `c1-controlled-import-persistence-contract.spec.ts`, and the P2.0 reconciliation assertion update.

## Persistence choice and frozen compatibility

The migration stores one immutable `controlled_import_runs.manifest_snapshot`; it does not create a manifest-table hierarchy. `controlled_import_descriptor_map` maps every manifest-local source/version/section/figure/review ID to its persisted UUID. Candidate evidence and duplicate candidates remain in the immutable snapshot; approved reviewed mappings are persisted on selections/figures. Duplicate-candidate evidence never drives economic-event merging.

Input identity remains separate from logical source identity. Source reuse is explicit company/code identity; version reuse is explicit source + input identity + digest; occurrences use normalized locators. Changed bytes append a version. Pending, reference-only, excluded, uncertainty, raw labels/values, exact amount text, provenance, and raw file references are retained. Imported versions/figures remain draft, and the migration creates no financial/master-data/file/upload/P3 tables or effects.

The DB boundary independently rechecks active company context, enabled C1 settings, `cost.source.read`, `cost.prepare`, an explicitly allowlisted workbook-family/adapter/version, strict frozen JSON shape/counts/references, manifest and input digests, scoped mappings, canonical occurrences, and company-scoped idempotency. One company advisory transaction lock plus uniqueness protects durable replay/deduplication. P1 actor-scoped receipts are preserved; the new run uniqueness is `(company_id, command_name, idempotency_key)`. Replay rechecks current authorization.

## Migration hashes

| Migration | SHA-256 | State |
| --- | --- | --- |
| `20260911145035_taskovia_c1_foundation.sql` | `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556` | Previously applied; unchanged |
| `20260913082034_taskovia_c1_controlled_import.sql` | `9E35E5C8B315CDF7646C29E83993265E1C87C40DE5E961074F0296C2E411B906` | Original candidate at `c628d2e`; not applied; retained as history |
| `20260913082034_taskovia_c1_controlled_import.sql` | `CCE1D0084FF07713C0E5AA129D180656EA2AD9DC9C8A2E31377BD1B5423D0154` | Current repaired candidate at `f6f2d0c`; not applied |
| `20260913082034_taskovia_c1_controlled_import.sql` | `C82FFC2426239A815EFD50BC01C874A7038A61FE2E5EAE662A828E024E26FB7F` | Local post-failure repair: source-review index uses declared `opened_at`; not applied and pending review/new Cloud authorization |

## Deterministic local evidence

| Command | Result |
| --- | --- |
| Baseline `pnpm exec vitest run tests/unit/costs/import-contracts.spec.ts tests/unit/server/cost-import-manifest.spec.ts tests/unit/config/c1-cloud-dev-runner.spec.ts` | Exit 0; 3 files / 19 tests |
| Service RED | Missing boundary, then 5 expected `NOT_IMPLEMENTED` failures |
| Service GREEN `pnpm exec vitest run tests/unit/server/controlled-import-persistence.spec.ts` | Exit 0; initially 1 file / 5 tests; final suite included in focused evidence |
| SQL/static RED | 4 expected failures before the migration/fixtures existed |
| Final focused five-file command | Exit 0; 5 files / 29 tests |
| Reconciliation correction command | Exit 0; 3 files / 11 tests |
| `pnpm verify:app` at tested code SHA | Exit 0; 107 files / 775 tests; typecheck, lint, production build passed |
| `git diff --check` | Exit 0 before each implementation commit |

The production build retained the existing Vite chunk-size warning and Node dependency deprecation warning; neither failed the build.

## Prepared SQL scenario matrix

| Fixture | Prepared scenarios | Execution state |
| --- | --- | --- |
| Commands | Frozen digest compatibility; canonical descriptor mapping; pending/reference-only/excluded retention; exact decimal/raw provenance; changed input as versions 1→2; same-key replay; different-payload conflict; different-company receipt scope; second-actor replay; different-key source/version/occurrence deduplication; scoped FK failure atomicity; immutable history; receipt/event/audit counts; no master-data or financial effect | Static runner validation only; **NOT EXECUTED** |
| Security | Allowed importer; missing prepare/source and project-only denial; disabled module; same-tenant/cross-company and cross-tenant denial; direct-write denial; anon/public and private-helper ACLs; draft source/manifest/event visibility; broad-audit denial; revoked-actor replay/read denial | Static runner validation only; **NOT EXECUTED** |

## Commits pushed

- `a6a9439` `feat: add controlled import persistence boundary`
- `6bdabb3` `feat: add controlled import database candidate`
- `6f2ef4c` `fix: harden controlled import occurrence scope`
- `2279d92` `test: preserve P1 fixture through P2 persistence`
- `f6f2d0c` `fix: repair P2.3 pre-cloud findings`

## F1–F3 pre-Cloud repair

**Disposition:** all three reported findings were reproduced in the `c628d2e` candidate and repaired without changing the frozen P2.1 files or creating a second migration.

- **F1 — SQL operator grouping:** the locator-key CASE now parenthesizes every `#>>` operand before concatenation. The commands fixture prepares explicit keys for canonical cell range, logical section, whole file, and multi-letter `AA1:AAA2` with meaningful Unicode sheet whitespace. A local static regression rejects the former unparenthesized pattern. These SQL assertions are **NOT EXECUTED**.
- **F2 — direct-RPC JSON validation:** request/manifest/descriptors/mappings/figures now reject missing, JSON-null, or wrong-type required values before text extraction/casts. Expected counts require JSON numbers representing non-negative integers; source arrays require string elements; known figures require decimal strings; non-known figures require JSON null. Prepared direct-RPC negatives cover null approved digest, null/string expected count, numeric known amount, and a non-string raw array element with recomputed nested digests. Positive prepared cases retain known `"0"` and `formula_error` with null amount. All reject/no-effect assertions are **NOT EXECUTED**.
- **F3 — populated Cloud DEV fixture safety:** privileged master-data checks now compare fixture-company baselines; event/audit checks use fixture company/request scope; immutable-history mutation resolves and targets one fixture-owned version. An unrelated synthetic B1 source/version/run is inserted before the import and asserted unchanged. Deliberately broad authenticated reads in the security fixture remain only for RLS visibility tests.

Exact repair files: the existing controlled-import migration, both existing controlled-import SQL fixtures, and `tests/unit/config/c1-controlled-import-persistence-contract.spec.ts`. No shared schema/helper, generated database type, dependency, P3, upload, or adapter file changed.

Fresh deterministic evidence at `f6f2d0ce06b0726b970f65a480c380cdd7e8aa8f`:

| Command | Result |
| --- | --- |
| Required focused five-file Vitest command | Exit 0; 5 files / 32 tests |
| `pnpm verify:app` | Exit 0; 107 files / 778 tests; typecheck, lint, production build passed |
| `git diff --check` | Exit 0; line-ending warnings only |

No SQL parser was available locally without a database. The migration/fixture regressions received deterministic text/runner validation only; neither fixture nor any SQL statement was executed against Cloud DEV or a Local DB. Database, RLS, and concurrency behavior remains awaiting separately authorized Cloud proof.

## Remaining Cloud work

Pre-Cloud review must approve the exact migration and fixtures. A separate authorization must then name Cloud DEV operations for migration application, guarded fixture execution, generated types if desired, and database/RLS/concurrency evidence. Until those execute successfully, SQL behavior is prepared but unproven. Real workbook-family adapter/onboarding and all P3+ work remain separately gated.
