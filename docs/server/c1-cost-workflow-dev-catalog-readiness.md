# DEV catalog discovery and rehearsal readiness

Read-only discovery on 2026-10-05 succeeded using the existing linked checkout /data/remote-worktrees/task1-task2-integration and the installed frozen Supabase CLI 2.114.0 binary. The target guard confirmed DEV gtgljlnhwvhqdnwrfdfj. The query used BEGIN READ ONLY, bounded statement/idle timeouts, catalog metadata only and ROLLBACK. Link cache file sizes and modification times were unchanged before/after each query. No fixtures, migrations, grants, credential configuration or application rows were mutated.

Evidence is retained in the owning checkout's ignored .superpowers/sdd/2026-10-04-document-backed-installment-approval directory:

- read-only-existing-link.mjs/sql and read-only-existing-link-catalog.json.
- read-only-managed-ddl.mjs/sql and read-only-managed-ddl.json.

The catalog reports PostgreSQL 17.6 (170006), transaction_timeout available, the accepted HR migration 20261004140132 present, and none of the eight cost migrations or the separate Azure migration applied. pgTAP is absent. Installed extensions are plpgsql, pg_stat_statements, uuid-ossp, pgcrypto and supabase_vault.

## Concrete blockers

The prepared runner still must not execute fixtures against this state.

1. It requires already installed pgTAP. Installing pgTAP, including an installation within a rolled-back transaction, changes the current operation's scope and requires an explicit target/operation decision. No automatic installation or Local DB fallback is authorized.
2. It currently refuses enabled event triggers. Six enabled managed handlers were found and their source/attributes retrieved read-only; names alone do not establish a safe exception.
3. Its sealed temporary query directory fails CLI connection/configuration, while the retained linked route works. Raw-array CLI output compatibility has been corrected and tested separately; that parser fix does not repair connection setup. An execution route must bind the existing DEV link, its approved nonsecret metadata and the frozen native binary without relinking, copying credentials or changing shared configuration before readiness can be claimed.

## Managed DDL handler review

| Handler | Event / tags | Observed body impact |
| --- | --- | --- |
| issue_graphql_placeholder | sql_drop / DROP EXTENSION | Can create a GraphQL placeholder when the extension is dropped. |
| pgrst_ddl_watch | ddl_command_end / all tags | Emits NOTIFY pgrst, reload schema for specified non-temporary DDL. |
| pgrst_drop_watch | sql_drop / all tags | Emits the same NOTIFY for selected non-temporary dropped objects. |
| issue_pg_cron_access | ddl_command_end / CREATE EXTENSION | Can change cron grants/default privileges. |
| issue_pg_net_access | ddl_command_end / CREATE EXTENSION | Can create a role, change function security and grants. |
| issue_pg_graphql_access | ddl_command_end / CREATE EXTENSION | Can replace/attach a GraphQL wrapper and change grants. |

Exact handler source SHA-256, language, security mode, search_path, event, enabled state and tags are retained in read-only-managed-ddl.json. A future exception must pin these attributes and the applicable DDL tag set; it must reject added, modified or broadened handlers. The extension hooks are inactive only when their tags cannot occur. No extension create/drop operation is part of the currently prepared eight migrations.

PostgreSQL documents that NOTIFY inside a transaction is delivered only if that transaction commits. Thus the two observed PostgREST handlers have no delivered notification on a confirmed outer rollback; this is source reasoning, not a live rehearsal result. See [PostgreSQL 17 NOTIFY](https://www.postgresql.org/docs/17/sql-notify.html). Keep unexpected statements, missing rollback, uncertain cleanup and catalog drift as blockers.

## Sequence scope

Three reachable identity columns exist: audit_events.id, company_role_assignments.id and workflow_node_events.id. The source closure reaches workflow_node_events through private.stage01_audit_acceptance_guard reading existing event payloads with SELECT. The current reachable function inventory contains no insertion into that relation; its identity therefore needs no added allocation exception based on this discovery. Keep its counter in the zero-drift snapshot.

Only the existing two approved surrogate sequence exceptions remain, with their original per-suite/cumulative limits. A changed closure, additional writer or observed third-counter drift must stop execution. No sequence allocation or database enforcement was tested in these read-only queries.

The original four fixture files, 143 assertions, were not executed here. The separate Azure fixture and migration retain their own scope and remain unapplied.
