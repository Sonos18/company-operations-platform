# Taskovia C1 v1.2 P2.3 Cloud execution review

## Status

`TRACK_A_P2_3_CLOUD_FIXTURES_PASS`

Current state: the original P2 migration and canonical-order correction are applied with 35/35 parity. A fresh durable runner returned all three required fixture markers and exit 0, zero fixture residue was independently observed, generated types were refreshed, and local application verification passed. Historical failures remain documented below.

## Authorization and repository preflight

| Field | Evidence |
| --- | --- |
| Target | Cloud DEV `gtgljlnhwvhqdnwrfdfj` only |
| Starting/source SHA | `08ad6c2ca7fbe9a50755859e44d97489932c09c6` |
| Reviewed/tested implementation SHA | `f6f2d0ce06b0726b970f65a480c380cdd7e8aa8f` |
| `origin/main` | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Checkout | `feat/taskovia-c1`, clean; local and remote feature heads matched the starting SHA |
| Runtime | Node `v24.19.0`, pnpm `10.29.3`, repository Supabase CLI `2.114.0` |
| P2 migration | `20260913082034_taskovia_c1_controlled_import.sql`, SHA-256 `CCE1D0084FF07713C0E5AA129D180656EA2AD9DC9C8A2E31377BD1B5423D0154` |
| P1 migration | SHA-256 `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556` |
| Fixture/runner source | Each matched `f6f2d0c`; fixture hashes: foundation `770036553F9CB72706B33984452A0562471EAB944EA92A2777F19EF2CDBED366`, commands `6E9D5CC2D3DB3674551E5A1A31E2F318B2E8FBF22EC555B51258DE3C0463C9D9`, security `E3CE0E7634183DAC816B9BB926611BA994384CCB0BF5518F40DD3986161E78E7`; runner `CEC5D41A9FC370868676B9F569465B9949FB967E0BDA98708B62CD6725713E32` |
| Frozen P2.1 exports | Unchanged from `8eb675fced49eedf2d0967ae6622ca2a161248eb` |

The required focused Vitest command passed: 5 files / 32 tests. `git diff --check` passed.

## Cloud ledger

| Step | Count | Result |
| --- | ---: | --- |
| `db:dev:target` | 1 | Passed; repository environment origin and linked ref guarded to `gtgljlnhwvhqdnwrfdfj`. |
| `db:dev:status` (preflight) | 1 | Passed; 33 matching local/remote applied migrations and only `20260913082034` local-only. |
| Pinned read-only baseline query | 1 | Failed before query execution with `SQLSTATE 22P02`: an inspection-only UUID literal was malformed (`c1000000-0000-4000-800000000083`). |
| `db:dev:dry-run` | 0 | Not started. |
| `db:dev:push` | 0 | Not started. |
| `db:dev:c1:test` | 0 | Not started; all three fixture subprocess counts are 0 and no server-side marker was observed. |
| `db:dev:types` | 0 | Not started. |

The packet permits no retry after a failed Cloud command. The failed inspection had no DDL/DML, did not access unrelated business records, and did not establish a valid collision/residue baseline. Therefore acceptance cannot progress and no further Cloud command was issued.

## Scope and remaining work

- P1 remains complete; no new regression was observed.
- P2.1 remains frozen. P2.3 migration and SQL fixtures remain **not applied/not executed** in this packet.
- `concurrency_execution = NOT_RUN`.
- P2 remains partial. P2.2/P2.4 real-data work is not authorized; P3 is not started.
- No real VQH import, real-user permission grant, real-company C1 enablement, Track B adapter registration, Local DB, Production, migration repair/reset/seed, additional migration, PR, merge, or force push occurred.

## Authorized continuation after inspection-only UUID error

The original failed baseline inspection remains part of the ledger: it failed once with SQLSTATE `22P02` because `c1000000-0000-4000-800000000083` was malformed. The continuation locally rejected that literal, resolved the reviewed fixture value `c1000000-0000-4000-8000-000000000083`, and generated the corrected read-only baseline from all 61 fixture UUID inputs. The submitted baseline digest was `2DE1D38D9D91FE19D6BBEC1B79B52C57AF806F88B3A40B46B869DB46474876E5`; every submitted UUID was valid and fixture-backed, and the query contained no DDL, DML, or callable function.

| Operation | Original | Continuation | Cumulative | Result |
| --- | ---: | ---: | ---: | --- |
| Baseline inspection | 1 failed | 1 passed | 2 | Corrected pinned read-only baseline returned zero for every fixture scope; all P2 catalog objects/RPCs were absent. |
| `db:dev:status` | 1 passed | 1 passed | 2 | Each showed 33 matched applied migrations and only `20260913082034` local-only. |
| `db:dev:dry-run` | 0 | 1 passed | 1 | Proposed exactly `20260913082034_taskovia_c1_controlled_import.sql`; no seed or roles. |
| `db:dev:push` | 0 | 1 failed | 1 | Native exit `1`; SQLSTATE `42703` at migration statement 16. |
| C1 runner / fixture subprocesses | 0 | 0 | 0 | Not started. |
| Type generation | 0 | 0 | 0 | Not started. |

The single authorized push began `2026-09-13T12:01:38.1780452Z` and ended `2026-09-13T12:01:55.1456081Z`. It failed creating `source_review_issues_selection_idx`: the migration indexes `source_review_issues(..., status, created_at, id)`, but `created_at` does not exist (SQLSTATE `42703`). This is a migration SQL-behavior failure, not a fixture, credentials, target, business-data, or RPC-validity failure.

One bounded post-failure read-only catalog/history inspection confirmed `20260913082034` is not in migration history and all expected P2 relations/RPCs remain absent. The migration was therefore **not applied** and left no observed schema residue. No retry, fixture execution, generated-type command, `verify:app`, SQL/code repair, corrective migration, cleanup, or further Cloud command was performed.

P1 remains complete; P2.1 remains frozen; P2.3 Cloud acceptance is blocked; `concurrency_execution = NOT_RUN`; P2 remains partial. P2.4 real-data import and P3 remain unauthorized/not started.

## Push attempt #2 outcome reconciliation

Attempt #2 was launched as `pnpm db:dev:push` from this repository after its dry-run. The terminal response stopped after `Applying migration 20260913082034_taskovia_c1_controlled_import.sql...`; it returned no reusable session/job handle and no native exit code. A later local process-tree inspection found no matching Node/Supabase child, so the process result remains **UNKNOWN**, not fabricated as success or failure.

Guarded Cloud DEV catalog inspection at `gtgljlnhwvhqdnwrfdfj` establishes `APPLIED_VERIFIED`: migration history contains `20260913082034`; all eight reviewed P2 tables, ten reviewed functions/RPCs, seven indexes, six P2 triggers, P2 RLS policies, and both existing-table constraints are present. No correlated active migration process was observed; the activity row was the reconciliation inspection itself. Thus cumulative pushes are 2, successful P2 applications are 1, and fixtures/types remain not run. This establishes schema application only, not P2.3 acceptance.

## Fixture-launch evidence recovery

The one submitted runner launcher used `tools.exec_command` with `pnpm db:dev:c1:test`, repository cwd, `tty: true`, and a 1000ms yield. It failed at the agent orchestration serializer with `failed to serialize JavaScript value: expected value at line 1 column 1`; no session id, child handle, output, or host-source implementation was recoverable. Local process inspection later found no correlated child. Every fixture start, marker, SQL execution, terminal rollback, and runner exit remains `UNKNOWN`, not zero or pass.

Private diagnostic artifacts are at `C:\Users\NGUYEN~1\AppData\Local\Temp\taskovia-c1-runner-diagnostic-20260913`. A corrected foreground durable-capture probe stored separate stdout/stderr and observed exit 7; the first probe's PowerShell quoting error (exit 1) is preserved separately. Bounded Cloud observation found zero synthetic fixture companies, adapter registrations, and import runs. Its one activity match was the observation query itself; this is zero residue observed, not proof of historical fixture execution or rollback. A future bounded rerun requires a new explicit authorization and the durable foreground capture method.

## Durable fixture run and digest diagnosis

A later explicitly authorized durable run (`2026-09-13T13:33:41.5991722Z`–`13:33:52.4066592Z`) returned native exit `1`. `C1_FOUNDATION_FIXTURE_COMPLETE` was observed. The commands fixture then failed with SQLSTATE `P0001`, `C1 frozen P2.1 manifest digest is incompatible with the database canonicalizer`; its completion marker was absent and the security fixture did not start. The reported residue scopes were zero, but that limited observation is not complete rollback proof.

Read-only Query 3 used the exact fixture literal (SHA-256 `6E9D5CC2D3DB3674551E5A1A31E2F318B2E8FBF22EC555B51258DE3C0463C9D9`, bytes 7944–10932). The frozen helper/reference produced 2,896 UTF-8 bytes and SHA-256 `8651b0ef29773117d53b09403e9be2762df0709e2b623587938080610d1557f8`; PostgreSQL produced the same structure and byte length but SHA-256 `c483b3bdecbb0e814fd2489ca25bf55a71d10c449c5fff59e91fbf3305ff8d1a`. The first difference is byte 2025: JavaScript/C order emits `sourceVersions` before `sources`, while ICU `en-US` default ordering emits `sources` first. No nested ordering, escaping, representation, or structural difference remained.

At the local-repair checkpoint, `20260913151754_taskovia_c1_canonical_order_fix.sql` (SHA-256 `37FF2F59F732785724E0433DDECBBE0621BBF8D595913D5FAF5EAD2955C1AFB7`) was prepared but unapplied. It changes only the recursive object aggregation to `ORDER BY entry.key COLLATE "C"`, preserving signature and properties. Regression coverage ties the exact fixture literal to the frozen helper and independent digest, and adds a SQL vector for mixed-case/nested keys, order independence, arrays, null/empty values, Unicode/whitespace, escaping, zero, and decimal strings. Its later application and execution evidence is recorded below.

## Canonical-order correction and successful acceptance run

Correction dry-run and push each ran once through durable capture. The dry-run proposed only `20260913151754_taskovia_c1_canonical_order_fix.sql`; push ran `2026-09-13T15:42:15.9461633Z`–`15:42:30.4794935Z`, exited 0, and applied only that migration. A later local Docker catalog-cache warning did not fail the command. Post-push status was 35/35. The correction is now **APPLIED / IMMUTABLE**.

The deployed canonicalizer retains owner `postgres`, ACL `{postgres=X/postgres}`, immutable/strict/security-definer attributes, and empty search path. It contains `ORDER BY entry.key COLLATE "C"`. Read-only verification returned the exact frozen manifest digest `8651b0ef29773117d53b09403e9be2762df0709e2b623587938080610d1557f8` at 2,896 bytes and compatibility-vector digest `30aa13579b994c286fe1c15d276686e9e4e77821ff99234c92e37926a06d9f60` at 194 bytes.

The new durable runner invocation (`2026-09-13T15:43:47.5274752Z`–`15:44:05.1268383Z`) exited 0 and returned, in order: `C1_FOUNDATION_FIXTURE_COMPLETE`, `C1_CONTROLLED_IMPORT_COMMANDS_COMPLETE`, and `C1_CONTROLLED_IMPORT_SECURITY_COMPLETE`. The unchanged sequential runner and each reviewed `BEGIN`…`ROLLBACK` envelope, together with the final exit, establish successful terminal rollback. Independent postflight returned zero across exact fixture users, tenants/companies, memberships, roles/assignments, settings, master/source/import scopes, receipts/events/audit, import runs, adapter registrations, and active fixture transactions.

`pnpm db:dev:types` exited 0 and added the expected P2 table/relationship/RPC definitions with no removals. Fresh `pnpm verify:app` passed 107 files / 782 tests, typecheck, lint, and build. `concurrency_execution = NOT_RUN`; P2 overall remains partial and real-data/P3 work remains unauthorized.

## Local migration repair, pending review

The failed candidate `CCE1D0084FF07713C0E5AA129D180656EA2AD9DC9C8A2E31377BD1B5423D0154` was never applied. Its only SQL repair changes `source_review_issues_selection_idx` from nonexistent `created_at` to declared lifecycle timestamp `opened_at`; the repaired candidate SHA-256 is `C82FFC2426239A815EFD50BC01C874A7038A61FE2E5EAE662A828E024E26FB7F`.

The new deterministic contract checks all seven explicit indexes against their target-table declarations, rejects a missing indexed column in-memory, and requires the source-review index to use `opened_at`. RED failed specifically on the former `created_at`; GREEN passed. Direct same-class review covered 14 INSERT lists, one UPDATE target, 20 local foreign-key lists, and both added unique constraints; no additional concrete missing-column reference was found. Fresh local verification passed: focused Vitest 5 files / 34 tests; `pnpm verify:app` 107 files / 780 tests, typecheck, lint, and build. No Cloud operation occurred in this repair.

Any next authorized Cloud residue inspection must include the new P2 relations/RPCs and constraints added to existing tables: `project_engagements_scope_project_unique` and `engagement_components_scope_engagement_unique`.
