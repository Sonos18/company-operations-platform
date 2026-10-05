# DEV catalog discovery and rehearsal readiness

Read-only discovery on 2026-10-05 succeeded using the existing linked checkout /data/remote-worktrees/task1-task2-integration and the installed frozen Supabase CLI 2.114.0 binary. The target guard confirmed DEV gtgljlnhwvhqdnwrfdfj. The query used BEGIN READ ONLY, bounded statement/idle timeouts, catalog metadata only and ROLLBACK. Link cache file sizes and modification times were unchanged before/after each query. No fixtures, migrations, grants, credential configuration or application rows were mutated.

Evidence is retained in the owning checkout's ignored .superpowers/sdd/2026-10-04-document-backed-installment-approval directory:

- read-only-existing-link.mjs/sql and read-only-existing-link-catalog.json.
- read-only-managed-ddl.mjs/sql and read-only-managed-ddl.json.
- read-only-pgtap-availability.mjs/sql and read-only-pgtap-availability.json.

The catalog reports PostgreSQL 17.6 (170006), transaction_timeout available, the accepted HR migration 20261004140132 present, and none of the eight cost migrations or the separate Azure migration applied. pgTAP is absent. Installed extensions are plpgsql, pg_stat_statements, uuid-ossp, pgcrypto and supabase_vault.

## Concrete blockers

The prepared runner still must not execute fixtures against this state.

1. It requires already installed pgTAP. Installing pgTAP, including an installation within a rolled-back transaction, changes the current operation's scope and requires an explicit target/operation decision. No automatic installation or Local DB fallback is authorized.
2. Live fixture execution remains unapproved. Source readiness and mock regressions do not authorize fixture SQL, extension installation, applying migrations, or a separate Azure execution.

## Prepared source guards

The source-only correction binds the working retained checkout `/data/remote-worktrees/task1-task2-integration` in the schema-version-4 manifest. The frozen native CLI 2.114.0 runs `db query --linked` from that root, with each SQL file in an owned helper directory. No relink, credential copying, shared config writes, Local DB route, or production route is prepared.

The manifest freezes the canonical project ref, verified nonsecret pooler URL hash and parsed endpoint identity, and linked-project JSON with exactly the string keys `name`, `organization_id`, `organization_slug`, and `ref`. The pooler endpoint must have decoded user `postgres.gtgljlnhwvhqdnwrfdfj`, official anchored `*.pooler.supabase.com`, port 5432 and database `postgres`; the only direct alternative is `db.gtgljlnhwvhqdnwrfdfj.supabase.co` with user `postgres`. Passwords, query parameters, fragments, unknown/nested/duplicate metadata keys, symlinks, and target overrides are rejected.

Retained config and both email templates are hashed. Recursive link cache checks freeze lstat/realpath, inode, device, ctime, mtime, size, mode and ownership metadata, including the `pgdelta` directory. Opaque cache contents are neither read nor copied. The shared validation lease and frozen link metadata are checked before and after every child/control query; drift stops the operation.

pgTAP remains an explicit preflight blocker (`WORKFLOW_REHEARSAL_PGTAP_NOT_INSTALLED`). The read-only availability result reports version 1.3.3 as relocatable, not superuser-only, untrusted, requiring plpgsql, and uninstalled; current/session user is postgres with database CREATE and extensions-schema CREATE rights. This is capability evidence, not approval. The manifest states `require-installed` and `automaticInstallation: false`; it contains no proposed or automatically executed installation.

## Managed DDL handler review

| Handler | Event / tags | Observed body impact |
| --- | --- | --- |
| issue_graphql_placeholder | sql_drop / DROP EXTENSION | Can create a GraphQL placeholder when the extension is dropped. |
| pgrst_ddl_watch | ddl_command_end / all tags | Emits NOTIFY pgrst, reload schema for specified non-temporary DDL. |
| pgrst_drop_watch | sql_drop / all tags | Emits the same NOTIFY for selected non-temporary dropped objects. |
| issue_pg_cron_access | ddl_command_end / CREATE EXTENSION | Can change cron grants/default privileges. |
| issue_pg_net_access | ddl_command_end / CREATE EXTENSION | Can create a role, change function security and grants. |
| issue_pg_graphql_access | ddl_command_end / CREATE EXTENSION | Can replace/attach a GraphQL wrapper and change grants. |

Exact handler source SHA-256, language, security mode, search_path, event, enabled state and tags are retained in read-only-managed-ddl.json. The reviewed source allowlist now pins all six registrations bidirectionally: name, event, exact tags/enabled state, qualified function identity, zero arguments/event_trigger return, raw definition hash, language, security-definer flag, exact config and volatility. Added, missing, modified, disabled, or broadened handlers fail closed (`WORKFLOW_REHEARSAL_MANAGED_DDL_CHANGED`); handlers are never disabled or granted extra privileges.

No extension create/drop operation is part of the eight migrations. The original fixtures retain their `CREATE EXTENSION IF NOT EXISTS pgtap` statements byte-for-byte. The three CREATE EXTENSION hooks' exact bodies test `pg_cron`, `pg_net`, and `pg_graphql`; those predicates are inert for the pgTAP name. The GraphQL placeholder is restricted to DROP EXTENSION, which the prepared operation excludes. The current runner still requires pgTAP to be installed before reaching those fixtures.

PostgreSQL documents that NOTIFY inside a transaction is delivered only if that transaction commits. Thus the two observed PostgREST handlers have no delivered notification on a confirmed outer rollback; this is source reasoning, not a live rehearsal result. See [PostgreSQL 17 NOTIFY](https://www.postgresql.org/docs/17/sql-notify.html). Keep unexpected statements, missing rollback, uncertain cleanup and catalog drift as blockers.

## Sequence scope

Three reachable identity columns exist: audit_events.id, company_role_assignments.id and workflow_node_events.id. The source closure reaches workflow_node_events through private.stage01_audit_acceptance_guard reading existing event payloads with SELECT. The source inventory now permits this one SELECT-only identity only after excluding writers in migrations, suites, reachable functions and attached trigger bodies. Its column, relation and sequence ownership are checked in catalog preflight. Direct/default/explicit sequence dependencies and other unknown identities still fail closed. Its counter remains in the all-sequence zero-drift snapshot; no new gap exception exists.

Only the existing two approved surrogate sequence exceptions remain, with their original per-suite/cumulative limits. A changed closure, additional writer or observed third-counter drift must stop execution. No sequence allocation or database enforcement was tested in these read-only queries. Targeted mock tests exercise endpoint/metadata admission, retained transport, managed handler guard construction, source writer rejection, rollback/cleanup handling and all-sequence drift; they do not establish a live SQL result.

The original four fixture files, 143 assertions, were not executed here. The separate Azure fixture and migration retain their own scope and remain unapplied.
