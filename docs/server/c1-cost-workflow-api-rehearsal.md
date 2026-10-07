# Connected API cost-workflow rehearsal proposal

Status: source-only preparation, execution blocked. Parent authorized preparation and review, not a new baseline capture or retry. This patch does not activate a replacement executor.

The intended result is a credential-free bridge to the already connected Supabase app, pinned to DEV gtgljlnhwvhqdnwrfdfj, while retaining one transaction for each of the four suites (80/13/28/22 assertions; 143 total), every plan/assertion/finish diagnostic, exact catalogue equality including role expiry, all history/table/sequence guards, shared validation.lock, bounded admission and owned-backend cleanup.

## Prepared source

- scripts/c1-cost-workflow-rehearsal-api.mjs: exact DEV gate, injected existing connected executor, exact approved diagnostics (the fixed snapshot and two constant SELECT probes), bounded calls, actual MCP response normalization, sanitized errors, permanent stop after uncertainty, and expanded object-level snapshot SQL.
- scripts/run-c1-cost-workflow-api-rehearsal.mjs: pure source-proposal generator. It never calls the app, reads a CLI token, captures a baseline, or runs the native executor. Exact proposal confirmation still cannot bypass the hard capability gate.
- tests/unit/config/c1-cost-workflow-rehearsal-api.spec.ts: target, parsing, output size, uncertainty/late responses, catalogue metadata and approval boundaries.
- package.json: db:dev:c1:cost-workflow:api-rehearse prints the source proposal only; command-line execution arguments fail.
- Catalogue dependency identities include deptype. Snapshot responses carry an independently aggregated object count and row-hash-list digest; the adapter checks both, unique identities and metadata identity consistency. These checks detect malformed/shortened responses; they do not prove that a live complete baseline has been captured or reconstruct the original aggregate hash from omitted function text. Full target-server capture validation is pending.

No current native guard, sequence budget, route, fixture, migration or permission was changed by this API proposal.

The API snapshot retains the original catalogue union and canonical aggregate hash exactly. It additionally archives every object with kind/identity, exact row hash and metadata. Function body text is represented by its exact SHA-256; the inaccessible pg_roles password placeholder is omitted from exported metadata only. The canonical digest remains unchanged, and rolvaliduntil is retained and compared. A single repeatable-read READ ONLY transaction captures table/history fingerprints, all sequence states and catalogue objects together. No partitioned cross-request snapshot, output-ceiling increase or expiry exception is proposed. The new SQL has not been executed live; response size and target-server parsing remain capture-stage checks.

## Evidence to carry into fresh approval

The stopped run failed at 2026-10-05 11:25:40.784 UTC with SQLSTATE 42601, syntax error at end of input, in the unparenthesized CASE sequence guard. The failure precedes pgTAP setup, all eight migrations and fixtures: 0/143 assertions ran. The syntax-only correction was independently reviewed and verified separately.

Later full captures compared 8,148 objects. Only role OID17487 cli_login_postgres changed, and only rolvaliduntil changed. Two subsequent READ ONLY connected-API calls retained identical expiry and role hash, with no_write_xid=true. These later samples do not attribute the entire original hash difference: the original full historical preimage is missing. The packet explicitly proposes a NEW full baseline, never historical restoration.

## Actual transport differences and blockers

The current connected tool schema has exactly project_id and query. It exposes no caller-controlled deadline, AbortSignal/cancellation handle, request status or settlement guarantee. The Management API run-query endpoint is documented as experimental/beta and does not document a timeout/cancellation parameter or guaranteed batch session/replay semantics:
https://supabase.com/docs/reference/api/v1-run-a-query

Supabase's general timeout guide describes Dashboard/client API limits; it does not prove a corresponding limit for this connected Management API path:
https://supabase.com/docs/guides/database/postgres/timeouts

The changelog was reviewed. The current docs do not establish the guarantees required here; absence of documentation is an evidence gap, not a claim that the provider automatically retries or splits requests.

1. Arbitrary SQL and transaction-escape strings are rejected before app dispatch; a READ ONLY prefix is not used as a SQL admission mechanism. A local Promise.race bounds when the adapter stops waiting; it does NOT cancel SQL or prove the provider has settled. Late results permanently taint the diagnostic channel and cannot advance the run.
2. Single-session execution of a complete suite, preservation of SET LOCAL/roles/admission/query prefix, trailing ROLLBACK command success and no automatic replay are unverified. Existing nonce/time admission cannot independently prove no duplicate dispatch inside its ten-second window.
3. Cleanup needs an independently available control call able to census and terminate only nonce/PID/backend-start/database/user/query-prefix/transaction-matched backends. Availability during an uncertain provider call is unverified. No foreign backend termination is proposed.
4. The four MiB ceiling is checked after a complete tool result is delivered. Streaming enforcement and provider buffering bounds are not exposed, so native streaming-limit equivalence is not claimed.
5. execute_sql's current instructions direct DDL to apply_migration. apply_migration persists migration/history changes and cannot substitute for a rollback-only rehearsal. No such call is made.
6. runWorkflowRehearsal currently calls isolatedSupabaseEnvironment before using an injected query; that reads the dedicated CLI token. Reusing this execution path unchanged would violate the no-credential-read requirement. The new source-proposal entry point does not invoke it.
7. A controller-to-worker connected-executor bridge and credential-free execution driver are not installed or verified. The injected function is a source interface, not a newly generated credential/access path.

These differences are activation blockers, not accepted risk changes. Baseline consent cannot waive them. No fallback to native passwordless login, new token/PAT/key, changed role/grant/configuration, Local DB, apply_migration or weaker catalogue equality is allowed.

## Exact proposed baseline and retry packet

The proposal generator seals the existing migration/suite/dependency/runtime/source manifest, API review, snapshot SQL SHA-256, unchanged budgets/timeouts, historical evidence and pending fresh-baseline/retry decisions into manifestSha256. The saved packet is api-fresh-baseline-retry-proposal.json in the retained task artifact directory.

Future approval has two separate bindings:
- Baseline acceptance: SHA256(JSON.stringify({proposalSha256,snapshotSha256})), binding the actual newly archived full baseline after the user accepts capturing it.
- Retry consent: SHA256(JSON.stringify({proposalSha256,acceptedBaselineSnapshotSha256})), binding exactly that accepted baseline and reviewed source/transport.

Neither binding is approved or executable now. The first execution snapshot must equal the accepted new full baseline. Before/after each suite and final aggregate catalogue equality remain exact, including rolvaliduntil; table/history fingerprints remain exact; only existing per-suite surrogate allocations within [120,12] cumulative are allowed, without resets. Every uncertain command/cleanup/TAP/postflight result stops without replay. Full objects are retained so any later drift can be reported by object and field.

Next work must first resolve the route and deadline/settlement/no-replay/cleanup/output guarantees. Then review a credential-free controller bridge and driver, validate a pure READ ONLY full snapshot under separately accepted capture scope, freeze its size/hash/metadata, and obtain distinct new baseline acceptance and exact retry authorization. A fresh baseline alone is insufficient to unlock the current tool route.
