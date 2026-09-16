# C1 Cloud Test Fixture Namespace Design

## Problem

Persistent C1 acceptance prerequisites were added after the original rollback-only C1 fixtures. Both claimed the `c100` synthetic namespace. `c1_foundation.test.sql` therefore unconditionally inserts tenant `c1000000-0000-4000-8000-000000000010`, which already exists as an intentionally persisted acceptance prerequisite. The Cloud failure is a `tenants_pkey` collision during foundation setup, before Project Cost verification. It is neither a Project Cost business-logic failure nor leaked rollback residue.

## Namespace contract

| Namespace | Ownership | Persistence |
| --- | --- | --- |
| `c100` | C1 acceptance prerequisite baseline plus controlled-import supplemental actors/data | persistent baseline; supplements transaction-only |
| `c101` | Project Cost synthetic fixture | transaction-only |
| `c102/c103` | Audited source ownership fixtures | transaction-only |
| `c110/c111` | Foundation primary/foreign synthetic fixtures | transaction-only |
| `c120` | Controlled-import commands foreign tenant/company fixture | transaction-only |
| `c121` | Controlled-import security foreign tenant/company fixture | transaction-only |

Controlled-import tests may reference the persistent `c100` baseline, but may not recreate its persistent tenant, company, or role identities. Their primary acceptance context remains c100; transaction-local supplemental actors, memberships, assignments, projects, sources, runs, and temporary records are allowed. Project Cost owns c101, so controlled-import tests must not use c101 after correction.

## Persistent acceptance contract

`supabase/migrations/20260914092237_taskovia_c1_acceptance_prerequisites.sql` owns these persistent identities:

| Identity | UUID suffix | Contract |
| --- | --- | --- |
| Tenant | `c100...0010` | `c1-acceptance`, `Taskovia C1 Acceptance`, deployment mode `shared` |
| Company A1 | `c100...0020` | `C1-ACCEPTANCE-A1`, primary acceptance company |
| Company A2 | `c100...0021` | `C1-ACCEPTANCE-A2`, denial target |
| Importer role | `c100...0911` | `c1_acceptance_importer`; exactly `cost.source.read`, `cost.prepare` |
| Source-only role | `c100...0912` | `c1_acceptance_source_only`; exactly `cost.source.read` |

The persistent migration validates collisions before inserting and inserts the tenant, companies, and roles only when absent. It must remain forward-only and unchanged. Role `0912` must never receive `cost.prepare`; a test needing another permission shape creates a new transaction-local role in its own reserved namespace.

## Test ownership rules

### Foundation

`c1_foundation.test.sql` is self-contained and owns all of its fixture data in `c110` (primary) and `c111` (foreign). It starts with `BEGIN`, ends with `ROLLBACK`, and creates no persistent prerequisite identity.

### Controlled import commands

`c1_controlled_import_commands.test.sql` consumes and asserts the persistent `c100` tenant, companies `0020`/`0021`, and roles `0911`/`0912`. It does not insert those rows. Its primary supplemental data is transaction-local; its foreign tenant/company fixture and every dependent foreign-only row use c120, not c101.

### Controlled import security

`c1_controlled_import_security.test.sql` follows the same prerequisite-consumption rule. Its foreign tenant/company fixture and every dependent foreign-only row use c121, not c101. It preserves importer, source-only, project-only, and disabled-company denial semantics without granting `cost.prepare` to persistent role `0912`.

### Project Cost

`c1_project_cost_items.test.sql` owns `c101` only. Its fixture is independent and remains unchanged unless direct evidence proves a collision with persistent prerequisites.

### Audited source ownership

`c1_audited_source_ownership_correction.test.sql` owns `c102/c103`. It remains unchanged unless a directly proven contract issue requires a change.

## Safety invariants

1. Every Cloud C1 verification SQL file starts with `BEGIN`.
2. Every Cloud C1 verification SQL file ends with `ROLLBACK`.
3. No C1 verification SQL contains `COMMIT`.
4. No test recreates a persistent prerequisite identity.
5. Tests remain order-independent.
6. The runner still stops on the first failed SQL file.
7. Repeated full-suite execution is deterministic against Cloud DEV containing the acceptance prerequisites.
8. No real VQH IDs or data are used.

## Rejected alternatives

| Alternative | Rejection reason |
| --- | --- |
| `ON CONFLICT DO NOTHING` in fixtures | Hides an ownership collision and could validate against the wrong prerequisite contract. |
| Delete persistent acceptance fixture | Removes an approved Cloud prerequisite instead of correcting test ownership. |
| Move the persistent fixture with another migration | Breaks the accepted namespace contract and does not repair the rollback fixture design. |
| Change runner order | Makes correctness dependent on execution order and leaves foundation invalid. |
| Random UUIDs | Makes deterministic Cloud verification and explicit isolation assertions weaker. |

No Cloud cleanup, applied-migration edit, conflict suppression, or runner special case is part of this design.
