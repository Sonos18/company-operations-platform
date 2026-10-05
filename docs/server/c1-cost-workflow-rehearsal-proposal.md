# Cost workflow Cloud DEV rollback rehearsal — source proposal

Prepared source only. No SQL has been executed by this runner. This proposal is limited to DEV gtgljlnhwvhqdnwrfdfj, on dev-worker-recovery, from the owned /tmp/taskovia-document-cost-workflow checkout. Production mztakwksmqspjabpaigk, HR worktrees, deployment, provider configuration and actual document bytes are excluded.

The package command db:dev:c1:cost-workflow:rehearse defaults to a credential-free local preview. Execute requires both --confirm-manifest-sha256 and TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL to equal the regenerated manifest. Permission to prepare source or enter an Azure key does not authorize execution.

## Exact one-batch scope

Freeze the eight ordered migration sources 20261004210000–20261004210700 and four fixture files at the final reviewed hashes. The authorized historical Storage account-ban correction changes migration20261004210400; all earlier packet approvals are invalidated. The four143-assertion fixtures remain byte-identical. Plans are security80, evidence13, requests28 and cash22: 143 assertions. The Azure migration 20261005045710 and its43 assertions are separate and are not included.

Run the four suites serially. Each begins a new repeatable-read transaction, replays the exact eight migrations, evaluates collision-checked c1f5 synthetic fixtures, verifies historical rows, then explicitly rolls back. The149 direct fixture rows across the three data suites exclude command/trigger appends. Existing real tenant/company memberships, financial rows, Excel/source provenance, original evidence, audit history and applied HR/migration records must remain unchanged. HR migration20261004140132 must be present before writes.

The only authorized nontransactional exception, if separately approved, is unused internal surrogate IDs in exactly two existing identity sequences:

| Suite | audit_events_id_seq ceiling | company_role_assignments_id_seq ceiling |
| --- | ---: | ---: |
| Security | 0 | 0 |
| Evidence | 20 | 4 |
| Requests | 44 | 4 |
| Cash | 56 | 4 |
| Batch | 120 | 12 |

Both must be bigint GENERATED ALWAYS identities, correctly owned by their id columns, increment1/cache1/no cycle, with sufficient remaining range. Account for last_value and is_called using PostgreSQL numeric/JavaScript BigInt. No reset, setval, overridden audit function or disabled trigger is allowed. All other observed sequence counters must remain unchanged. Identity gaps can remain after rollback; they are not business contract/invoice/payment numbers.

Acquire /data/remote-jobs/validation.lock across the complete operation. Acquire the existing workflow advisory transaction lock and SHARE ROW EXCLUSIVE locks on both identity owner tables. A quiet window is required: table locks do not block direct external nextval calls or every schema change. Drift rejects the batch rather than absorbing another process's changes.

## Immutable execution and dependency boundary

The approval manifest hashes all repository .mjs scripts, package.json, pnpm-lock.yaml, supabase/config.toml and its two referenced email templates, every prior migration source, exactly eight new migrations and four suites, the installed Supabase2.114.0 wrapper/native binary/package and the running Node executable/version/platform. It also hashes the derived dependency inventory and records limits/budgets. Source changes invalidate approval. CLI execution uses the frozen native binary directly, avoiding a Node-wrapper orphan.

Each query has a fresh owned temporary directory with a canonical DEV project-ref, explicit --project-ref gtgljlnhwvhqdnwrfdfj Management API query target, and copied hashed config and email templates. This copies files only; no email operation occurs. Foreign target/password environment overrides are removed; the guarded isolated DEV CLI environment supplies credentials only after both approval gates. Child output is bounded and failures never print SQL, existing records or tokens.

Source inventory replays function CREATE/ALTER/config/rename/DROP ordering, full input type/return/default-count/body/language/volatility/security/configuration attributes, and trigger timing/events/columns/arguments/enabled/constraint flags. Supported trigger WHEN clauses are simple literal comparisons joined by AND. Unknown syntax blocks source preparation.

Preflight checks both live-to-source and expected-to-live presence. It combines source-qualified function/relation/trigger closure with recursive catalogue dependencies from defaults/generated columns, checks, indexes, policies and reachable routine argument defaults. Implicit calls outside the reviewed source closure and a small pure-core/crypto allowlist reject. Implicit nextval is forbidden: the two approved identities are checked through ownership dependencies, never dynamic regclass expressions. Rewrite rules, unexpected views/foreign/partitioned relations and inheritance children reject. Enabled event triggers reject. Language/namespace/extension implementation ownership edges are excluded from executable dependency traversal; expression, function, operator and type dependencies remain checked. Existing managed auth.uid/role helpers must match fixed pure claim-reading forms.

The explicit external trust boundary is existing managed pgTAP, pgcrypto and uuid-ossp extension members. Their catalogue definitions/version/ACL state are frozen within the batch; source preparation does not inspect the provider's extension installation files. pgTAP must already be installed in extensions. No extension install fallback, unknown external function, local database or provider activation is allowed.

## Server deadline and owned cancellation

Require PostgreSQL17+ transaction_timeout support. Batch limits: transaction150s, statement90s, idle transaction5s, lock5s; native CLI180s and4MiB output. Read-only controls use shorter server/client limits.

A random nonce appears at the beginning of query text and in transaction-local application_name. Server clock_timestamp admission expires10s after the fresh baseline timestamp, preventing delayed API starts from beginning fixture writes after cleanup. Cleanup waits past this admission expiry. Census includes the early query prefix before application_name assignment; a tagged backend without the complete termination identity blocks cleanup proof instead of being ignored or killed.

Termination requires the exact nonce/query prefix, PID, backend_start, database, username and active transaction. The SQL termination predicate rechecks all identifiers, then a fresh census confirms absence. No generic backend/service cancellation is allowed. An idle pooled backend can remain alive: the required outcome is absence of the owned transaction, verified alongside a post-ROLLBACK no-write-transaction marker. A pre-rollback marker or CLI exit alone is insufficient.

On timeout, malformed output, failed TAP or missing rollback proof, stop; attempt owned cleanup and a fresh postflight, then report failure. Report sanitized primary, cleanup and postflight failure categories together. Never replay a failed suite automatically. Release the owned lock and remove only the invocation's own temporary directory.

## Historical and catalogue closure

Within each transaction, retain before-DDL original-column row-multiset baselines and after-DDL baselines. Seven additive permission definitions are the only pre-DDL data exception; no real role grants are assigned. Privileged historical checks use row_security=off; authenticated pgTAP checks use row_security=on.

Fresh read-only snapshots before and after rollback cover all public/private/auth/storage/migration-history tables, roles/memberships, grants/default ACLs, schema/column/index/constraint/policy/trigger/function/type/enum/rewrite/dependency catalogues, extension state and all persistent sequence counters. They output receipts/hashes, never original row values. Reject fixture-namespace collisions.

Compare every next-suite baseline with the previous successful postflight, with zero allowed intervening sequence allocation. Compare final history/catalogue with the original batch baseline. Any history/HR/ACL/migration/metadata/other-sequence drift stops the batch.

## Verification limits and next approval

Unit tests mock CLI/database results and owned subprocess lifecycle. They cover authorization ordering, manifest changes, exact plans, failed cleanup, foreign ownership, delayed admission, first sequence allocation, budget/metadata/inter-suite drift, ordered function/trigger inventory and sealed-target/timeout/output handling. They do not establish PostgreSQL syntax, actual grants/RLS, managed extension definitions, live races, Storage byte validity or provider behavior.

Regenerate preview on the final reviewed source checkpoint. Any later Azure/schema/runner/dependency change requires another manifest. A precise future user approval must identify this DEV-only rollback batch, the two sequence ceilings, the quiet window and narrowly owned cancellation. Do not execute until that explicit approval. Unsupported or unexpected live metadata blocks before fixture writes rather than widening the boundary.

References: [PostgreSQL sequence rollback behavior](https://www.postgresql.org/docs/current/functions-sequence.html), [PostgreSQL17 session timeouts](https://www.postgresql.org/docs/17/runtime-config-client.html), [backend termination](https://www.postgresql.org/docs/current/functions-admin.html), [Supabase db query](https://supabase.com/docs/reference/cli/supabase-db-query).
