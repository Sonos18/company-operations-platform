# Cloud DEV cost workflow: rollback-only rehearsal proposal

Prepared operation only. No database command, pgTAP SQL, fixture insertion, grant, migration application, history repair, reconciliation, workflow activation, Storage upload or provider call has been executed.

Target: Supabase Cloud DEV gtgljlnhwvhqdnwrfdfj. Production mztakwksmqspjabpaigk is excluded. Worktree /tmp/taskovia-document-cost-workflow on dev-worker-recovery; preserve HR main 6990146697b3b15fa57f3fa837333990c7a833dd and its applied migration 20261004140132.

## Exact operation

The guarded package command db:dev:c1:cost-workflow:rehearse defaults to a local source-byte preview with no credential or database lookup. Its proposed execute mode requires BOTH the reviewed manifest SHA-256 in --confirm-manifest-sha256 and the independent TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL environment value. Authorization must identify this DEV target and rollback-only operation. No execution authorization is inferred from permission to prepare code or from a key being entered.

The manifest includes runner and guard source hashes, exactly eight ordered migration files 20261004210000 through 20261004210700, and exactly four ordered suites:

| Suite | Prepared assertions |
| --- | ---: |
| c1_cost_workflow_security.test.sql | 80 |
| c1_cost_workflow_evidence.test.sql | 13 |
| c1_cost_workflow_requests.test.sql | 28 |
| c1_cost_workflow_cash.test.sql | 22 |
| Total | 143 |

Each suite is a separate transaction: repeatable-read isolation; five-second lock timeout; 90-second statement timeout; existing workflow advisory lock; namespace/history preflight; exact DDL; fixture and pgTAP; history closure; explicit completion markers; ROLLBACK. Four subprocesses run sequentially, each with a 180-second timeout and four-MiB captured-output ceiling. Stop on any SQL/CLI/pgTAP/marker/count/history error. The installed Supabase CLI 2.114.0 --help confirms db query --linked --file and JSON output. Temporary files use a fresh per-invocation directory removed only by its creating invocation.

## Fixture closure

All explicit fixture UUIDs use c1f5*. Before DDL, the wrapper rejects any existing matching top-level UUID value in public/private/auth/storage/migration-history tables; it never reuses or deletes a colliding fixture.

The evidence, request and cash suites create synthetic tenant 010, company 020, users 901–904, roles 911–914, memberships and role assignments with an explicit synthetic grant reason, projects 101/102, supplier 201, categories and original-file metadata. Temporary workflow_test_ids records command-created UUIDs. Every generated business row remains bound to that synthetic tenant/company. Test JWT sub and role changes are transaction-local. Fixture grants apply only to those synthetic roles or temporary helper tables. Only the synthetic company enters document_backed_v1; real companies remain at their existing mode.

The source fixture writes are auth.users plus public.tenants, companies, tenant_memberships, company_memberships, roles, role_permissions, company_role_assignments, company_cost_settings, projects, business_parties, cost_categories, cost_evidence_files and synthetic workflow records. Updates are scoped to synthetic memberships/company workflow state/project completion or a negative immutable-original test. Reviewed commands also append scoped versions, decisions, installments, consumption, cash/proof claims, notifications, receipts and audit records. No fixture DELETE, TRUNCATE, COPY, seed, repair, disabled trigger, Storage byte upload or provider call is permitted.

Security: catalog/RLS/privilege/history-retention assertions. Evidence: required finalized original, cross-project denial, immutable target, current-manager access and old-manager loss of access. Requests: quote cap identity including relabeled same-byte copies, shared genuine support, competing pending installments with cap recheck, sole manager approval, immutable handover without resubmission, amendment limits and completed-project denial. Cash: approval versus payment, mandatory payment proof, duplicate transfer identity, actual refund versus outgoing proof, corrections that never restore authority, and settlement against captured prior authority after completion.

Finalized file rows in these SQL fixtures are synthetic metadata. They do not verify actual Storage bytes, signed URLs, MIME detection or Azure transport. Those remain separately verified server/mock or future authorized integration boundaries.

## Existing history closure

The wrapper fingerprints row counts and sorted SHA-256 row multisets inside the transaction; it emits no existing row values, hashes or credentials.

A pre-DDL baseline covers existing columns/rows in public/private/auth/storage/migration-history tables, including original ordinary/project costs, Excel provenance, prior evidence, grants/role assignments, canonical cash, audit history and applied HR/migration records. Existing columns are projected when comparing after additive DDL so new columns do not fabricate a history mismatch. The sole pre-DDL table exception is public.permissions: the reviewed security migration adds seven definitions with ON CONFLICT DO NOTHING and assigns no real role. A second baseline after exact DDL covers that catalog and all newly created workflow tables too.

After fixtures the wrapper restores the original SQL role, disables row filtering for the privileged history check, excludes only the collision-checked fixture UUID namespace and checks BOTH baselines before the completion marker. Missing privileged history access, missing history relations, any already-applied workflow migration, changed historical rows or a collision blocks rather than falling back to a local DB or incomplete view. Repeatable-read isolation prevents unrelated concurrent transactions from producing a false row-diff; it is not a concurrency proof.

The proposed execute operation is BLOCKED on the canonical schema. Source inspection found two concrete nontransactional effects: company_role_assignments.id is GENERATED ALWAYS AS IDENTITY, and all three data-fixture suites insert four synthetic assignments without explicit IDs (12 sequence allocations in total); audit_events.id is also GENERATED ALWAYS AS IDENTITY, and private.c1_workflow_record_command plus original-file intent/finalize commands insert audited events. Failed commands can also allocate sequence values before their subtransaction is rolled back. workflow_node_events has another persistent identity, but these workflow-cost suites do not invoke that node-event path.

The wrapper now raises WORKFLOW_REHEARSAL_NONTRANSACTIONAL_SEQUENCE before DDL or fixture writes if either known identity sequence is present. This is a deliberate blocker, not a test result. Rollback of rows/DDL cannot undo allocated sequence values, so the current two-value hash authorization does not authorize an audit-ID-gap exception. Do not remove that guard, reset/setval a shared sequence, override production audit functions or disable audit triggers to make the fixtures pass.

Next decision: approve a specifically bounded nontransactional sequence-allocation exception after full command/trigger accounting, or redesign fixture execution so those allocations cannot affect persistent sequences while retaining meaningful production-command verification. No exception is inferred here. Until that decision and a revised reviewed manifest, do not ask to execute this proposal.

The history guard itself is prepared SQL and has not been runtime-tested; wrapper unit tests use mocked processes and cannot prove Postgres syntax/RLS/history behavior. Authentication-role pgTAP runs with row_security=on; only privileged before/after history checks use row_security=off.

## Approval and remaining checks

Review the preview manifest and exact runner/guard/DDL/suite source on the final commit before requesting operation authorization. The latest preview is in the owned ignored artifact directory; regenerate it after any relevant source-byte change. A new Azure storage migration is outside this eight-migration proposal and requires its own updated manifest.

This rehearsal does not apply migrations, repair migration history, reconcile legacy data, map opening contract caps, assign real managers/roles, enable document_backed_v1, activate OCR, prove live races or authorize deployment. Concurrency scenario preparation and readiness/activation approval remain separate work.

References: [installed-command documentation](https://supabase.com/docs/reference/cli/supabase-db-query), [PostgreSQL binary SHA functions](https://www.postgresql.org/docs/current/functions-binarystring.html). Repository commands and exact installed --help output control execution.
