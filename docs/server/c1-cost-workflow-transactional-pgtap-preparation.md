# Bounded cost workflow rollback preparation

This is source preparation for one DEV-only execution approval. No extension creation, fixture execution, migration application, Storage operation, provider call, credential change or deployment has occurred. The prior schema4 manifest requiring installed pgTAP is superseded. The schema5 manifest binds transient pgTAP setup and the source reconstruction corrections below.

## Read-only readiness evidence

On 2026-10-05, official Insta CLI0.1.16 on dev-worker-recovery ran the pinned native SupabaseCLI2.114.0 through the retained linked root. DEV target is gtgljlnhwvhqdnwrfdfj, PostgreSQL170006. Metadata stayed unchanged before and after queries.

The server advertises pgTAP1.3.3 with superuser=false, trusted=false, relocatable=true, no required schema and requires={plpgsql}. pgTAP is absent. Existing session/current postgres is not superuser but has database CREATE/TEMP, extensions CREATE/USAGE, and SQL/plpgsql language USAGE. Schema extensions is owned by postgres with the exact existing ACL bound in the manifest; anon/authenticated/service_role lack CREATE. Installed plpgsql1.0 remains in pg_catalog. No grant or role change is proposed.

The exact initial runner preflight passed READ ONLY at 09:46:34.265UTC. Receipt SQL SHA256: 505e33c68dae8bb1e6bd9994248e7ab857c82ef9c12a33020fab6ecfa0e94ed8. This establishes available prerequisites and current catalogue compatibility. It does not establish installation-phase behavior, actual TAP assertions, SQL rollback success under load, concurrent locking or provider behavior.

## Exact temporary DDL

For each of four serial rollback transactions, first enforce absent pgTAP and the pinned availability/privilege/schema controls, then execute:

```sql
create extension pgtap with schema extensions version '1.3.3';
```

No CASCADE, installation fallback or privilege elevation is allowed. Verify version, namespace, owner and extension membership of extensions.plan(integer). Apply the exact eight cost migrations and one fixture in that same session, then ROLLBACK. Existing fixture CREATE EXTENSION IF NOT EXISTS statements remain unchanged and should be no-ops after the pinned setup. Fresh postflight must confirm the persistent extension/catalogue state matches its absent baseline. Never retain or separately drop the extension.

All six existing managed DDL registrations and their complete handler bodies/attributes remain pinned. Three CREATE EXTENSION handlers test exact pg_cron/pg_net/pg_graphql names and are inert for pgtap. The DROP EXTENSION placeholder handler has a different command tag. PostgREST handlers only queue NOTIFY, which rollback cancels. Missing, modified, disabled or extra handlers block.

## Source reconstruction and bounded guard corrections

Historical migrations were not edited. The inventory now replays three existing dynamic pg_get_functiondef corrections at their original file boundaries, verifying provenance file hashes, exact original/result body hashes and replacement counts:

- 20260922083315 qualifies the public deferred constraint in prepare/correct routines; later definitions still supersede older ones.
- 20260922092309 changes the accepted evidence kind from source_file to source_workbook, matching the existing product schema. This is an existing contract correction, not a new equivalent-spelling exception.
- 20260922101400 corrects the four-key object count after existing object/type and allowed-key checks.

Qualified SET CONSTRAINTS names resolve to the exact deferrable source trigger/table/function rather than a nonexistent relation. Unknown targets block.

Seven existing managed Storage registrations and five exact function bodies/attributes are inventory-only input, bound to the manifest. They retain deletion and lifecycle protection, validate names/roles, or set NEW.updated_at. No storage.allow_delete_query, disabled trigger, lifecycle bypass or byte operation is introduced. The source-owned completed-project guard stays validated against migrations.

Exactly nine existing RLS helper names become source-defined dependency roots for five reviewed cost/role relations. Missing expected roots reject. Their bodies, signatures, security attributes and callee/trigger closure use ordinary source/live validation. Only the five pinned Storage routines enter implicit admission after direct descriptor validation; no schema-wide exception exists.

Two SQL aliases were renamed to avoid collision with the PLpgSQL loop record. The current managed auth.role expression's final text cast is admitted as an exact fixed claim-reading form. The scanner recognizes existing LEAST/GREATEST syntax, four unqualified SQL keywords and the pure string_to_array expression. Unknown qualified functions, dynamic execution, unexpected sequence allocation and opaque expressions still reject. No application API, financial rule, permission or database function was changed.

## Single execution authorization boundary

The generated approval packet is the authority for the final source checkpoint and manifest digest. It lists exact hashes for migrations20261004210000 through20261004210700 and the four fixtures: security80, evidence13, requests28, cash22; total143 assertions. Azure migration20261005045710 and its fixture remain excluded.

One invocation runs four serial transactions under /data/remote-jobs/validation.lock and advisory transaction lock71842,31. It takes SHARE ROW EXCLUSIVE locks only on public.audit_events and public.company_role_assignments. These locks can delay real DEV writers; migration DDL can lock other affected live tables. A bounded quiet verification window is required. Lock5s, statement90s, transaction150s, idle5s and nonce admission10s limit each transaction; client batch180s/control20s and output4MiB remain pinned. The entire operation is not a single150s transaction.

Only unused surrogate sequence gaps may persist: audit ceilings0/20/44/56 by suite, total120; role-assignment ceilings0/4/4/4, total12. No reseeding/reset/setval is allowed. workflow_node_events is SELECT-only with zero counter drift; every other sequence also has zero allowance. No business number exception exists.

Use only the pinned native binary with db query --linked from /data/remote-worktrees/task1-task2-integration, existing isolated DEV credentials and frozen linked metadata. Execute requires both CLI --confirm-manifest-sha256 and TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL equal to the manifest digest. Preview makes no database call.

On timeout, failed TAP, malformed output, missing rollback marker or uncertain cleanup, stop before the next suite; attempt exact owned backend census/cancellation and fresh postflight. Cancellation requires the nonce/query prefix, PID, backend_start, database/user and owned active transaction; never cancel another backend. Verify admission expiry and owned transaction absence, confirmed ROLLBACK/no-write-XID marker, unchanged real rows/history/HR/applied migrations/grants/catalogues/extension state, and allowed sequence deltas. Preserve sanitized receipts and failures; never replay automatically.

The future approval must explicitly authorize temporary pgTAP DDL plus the four rollback fixtures, bounded live DEV locking, narrowly owned cancellation and maximum120/12 unused IDs. It does not authorize applying migrations, the Azure ninth migration, real providers/documents, secrets, installation of packages, production, push or deployment.

References: [CREATE EXTENSION privileges/version/schema](https://www.postgresql.org/docs/17/sql-createextension.html), [server extension availability controls](https://www.postgresql.org/docs/17/view-pg-available-extension-versions.html), [NOTIFY transaction behavior](https://www.postgresql.org/docs/17/sql-notify.html), [SQL conditional expressions](https://www.postgresql.org/docs/17/functions-conditional.html).
