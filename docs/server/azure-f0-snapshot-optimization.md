# Azure124 source-only snapshot optimization

Status: source/mock verification pending; SQL and provider execution have not occurred. Base:28a0ca016de62aae2182a782c01860da96c7c56f. This source changes the manifest; conditional fallback approval for the existing13c85 packet does not authorize executing this packet.

## Behavior
For Azure124 only, before/postflight/final full snapshots and all-five-sequence censuses share one bounded repeatable-read read-only transaction and one native CLI request. Both original collection bodies are reused byte-for-byte. Original evidence rows are projected losslessly, separately archived and checked by the unchanged native/all-sequence validators and overlap checks. All later boundaries remain present; sequence reads are not MVCC, so overlap and exact postflight checks remain required.

A successful one-suite path makes3 snapshot requests instead of6, and7 total mocked requests instead of10 with the harness's single cleanup census. A batch failure before TAP needs2 paired snapshot requests instead of4. Actual census count and real network timing vary. No measured live SQL speedup is claimed.

If a paired query, row, decoder or overlap check fails, both original independent bounded reads are still attempted. Their archive labels end in-fallback to preserve primary evidence without overwrite. Invalid returned paired data is retained in a separate snapshot-pair-invalid receipt. The primary paired error remains a failure even if the independent reads validate; no fixture batch is replayed.

Each Azure command receives a private command-timing-N receipt containing only schemaVersion, commandNumber, input SQL hash, ISO start/end timestamps, monotonic elapsedMs and succeeded/failed status. The measured interval includes the CLI call, post-call target/lock checks and any primary diagnostic archive, and excludes writing its own timing receipt. It does not separate database processing from transport. A timing archive failure fails closed and keeps the primary CLI diagnostic through existing wrappers.

## Bounds and retained safety
- All124 fixture assertions and all9 pending migration bytes are unchanged.
- Existing native and all-sequence SELECTs remain unchanged for fallback and other profiles.
- Paired read-only transaction and statements15s, lock/idle5s, control client20s.
- Exact paired SQL hash alone receives8MiB combined stdout/stderr; changed SQL and all other queries retain4MiB, existing exact native snapshot allowance remains8MiB.
- Cleanup maximum30censuses, minimum1035ms delay,30s admission window,120s batch and owned-backend identity/termination are unchanged.
- Source/target approval, fresh actor/scope/revision, unknown POST no replay, month/quota/rate/lease, immutable evidence and ACL contracts remain unchanged.
- Before/transaction admission/postflight/final catalogue, data, dependency/history, grants and rollback closure checks remain.
- Zero audit/role-permission allocations and unchanged all5 sequence counters remain required.
- Azure gates stayfalse. No Cloud DEV SQL, provider call, key/configuration change, install, migration apply, deployment or cash165/20 execution is part of source verification.

## Verification and release
Read the exact release-results and source-receipt in /tmp/taskovia-azure124-snapshot-optimization-evidence-20261006 for executed checks, final source refs and immutable manifest. Source/mock proof does not establish PostgreSQL execution, live concurrency, provider behavior or realized elapsed-time savings. A newly frozen packet is reported for review before any database execution authorization.
