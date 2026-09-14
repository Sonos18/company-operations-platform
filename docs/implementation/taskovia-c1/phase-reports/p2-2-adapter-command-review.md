# Taskovia C1 v1.2 P2.2 adapter and command review

## Status

`P2_RESOURCE_GUARD_REPAIR_READY_FOR_REVIEW`

This is a repair-ready checkpoint, not reviewer approval. P2.1 remains frozen and P2.3 Cloud acceptance remains accepted. The tested resource-guard implementation is `6fae1e255d59dc104308cd9d5cd899cc914cb064`; no Cloud/database command, real import, deployment, migration, type generation, permission grant, company enablement, adapter registration, Local DB, Production, cleanup, or P3 work occurred.

## F01 — Evidence actually verified

**Before:** recognized records could omit `value`, `raw`, and `format` comparisons; multiline labels and malformed evidence could be skipped; numeric caches were checked through ExcelJS `number`; provenance counted evidence records as cells.

**After:** the bounded VQH-family parser accepts only `cell=value`, `cell|value|raw|format`, or `cell|formula|cached|raw|format`. It preserves Unicode, newlines, whitespace, JSON/Excel quoting, and delimiters inside quoted fields. Every supported field is checked. Resolved values/caches use typed ExcelJS values; exact raw numeric/string/error/cache tokens, shared-string indices, formula presence, worksheet relationships, cell ranges, and custom/built-in number-format tokens come from bounded XLSX ZIP/XML reads. Malformed/unknown fields reject instead of disappearing. Files are capped at 50 MiB, archives at 512 entries, XML entries at 32 MiB with CRC checking. `jszip@3.10.2`, already present under ExcelJS, is now a pinned direct dependency; the lockfile importer changed by three lines only.

Synthetic regression evidence covers false `value=999/raw="999"`, multiline mismatch, malformed evidence, exact large decimal literal/formula cache tokens, quoted delimiters, shared-string indices, formula errors, missing caches, time-only values, wrong layout/hash/name/family, and occurrence-versus-cell counts. RED reproduced 4 failures in 6 tests after the archive dependency was linked; GREEN is 7/7.

The unchanged B01-revised candidate then passed offline at digest `7dbc1545a78b7a8671384caedb86817840e47c069fa7ed258d5159493b37d315`: 2 inputs, 2 sources, 2 versions, 29 sections, 43 figures, 22 review issues, 27 duplicate candidates, 18 pending sections, 41 pending figures, 11,690 evidence occurrences, and 8,113 distinct source cells. The generated canonical manifest has no field delta. The two workbook hashes remained unchanged.

## F01 — Resource boundary closure

**Before:** the adapter used `readFileSync`, invoked ExcelJS, then invoked `JSZip.loadAsync(...checkCRC32=true)`, and only after that rejected the 50 MiB file, 512-entry, or 32 MiB XML limits. CRC therefore expanded every archive entry before its metadata budget was known.

**After:** the exact order is:

1. Open the input and read a bounded, same-byte snapshot only after a finite file-size check; verify the exact bytes read and EOF before hashing or parsing.
2. Inspect the ZIP end/central directory directly before JSZip content processing. Reject multi-disk, ZIP64/ambiguous size fields, encrypted/data-descriptor entries, unsupported compression, over-512 entries, over-32 MiB declared entry size, or over-64 MiB aggregate declared expansion.
3. Load JSZip metadata with CRC disabled, stream every non-directory entry under the same per-entry/aggregate budgets, and require actual decoded size to equal declared size.
4. Run JSZip CRC validation across the accepted archive only.
5. Invoke ExcelJS, then perform the unchanged evidence verifier and selected raw XML reads.

The aggregate expansion budget is **64 MiB**. It covers every entry that CRC or ExcelJS can consume, rather than only referenced worksheet XML, while remaining bounded and more than sufficient for the reviewed family: Eo Gio is 203,475 bytes / 48 entries / 331,693-byte largest entry / 1,105,657-byte aggregate; Yong Mei is 177,980 bytes / 49 entries / 352,825-byte largest entry / 982,438-byte aggregate. The reader fails closed for unsupported ZIP metadata rather than accepting an ambiguous archive.

RED/GREEN evidence uses small real ZIPs and patched central metadata, not decompression stress: valid order is metadata → CRC → ExcelJS; oversized sparse file rejects before ZIP/ExcelJS; 513 entries reject before CRC; declared XML and aggregate caps reject before materialization; an oversized unreferenced entry in an otherwise valid XLSX rejects; inconsistent declared/actual sizes fail safely; CRC corruption remains rejected. The adapter suite is 13/13 green, retaining every prior F01 regression.

Fresh private offline preparation at `adapter-resource-guard-preparation-9b58839e-7412-4223-97d7-35643ee3e30a` passed with the frozen digest/counts/provenance above, no candidate-field delta, unchanged candidate/workbook hashes, and zero network/database calls.

## F02 — Destination binding before credentials

**Before:** `startsWith('https://')` accepted arbitrary HTTPS destinations, while the packet's `cloud-dev` label did not bind the bearer-token recipient or Supabase project.

**After:** the execution packet, outside the frozen manifest schema, must include:

- `destination.applicationOrigin`: the exact approved application origin;
- `destination.supabaseProjectRef`: the intended Cloud DEV project identity;
- `destination.associationReference`: the reviewed deployment/environment association source.

Direct `execute` and `get-result` invocation parse the URL and compare the exact origin before workbook preparation or fetch. Only canonical HTTPS origins with no credentials, port, path, query, fragment, trailing-slash variation, or origin mismatch are accepted. The project ref must equal `CANONICAL_DEV_PROJECT_REF` exported by the existing `scripts/assert-cloud-dev-target.mjs`; the application origin is deliberately not the Supabase URL. Fetch uses `redirect='error'`, and any observed 3xx is an UNKNOWN `UNEXPECTED_REDIRECT`, never followed. Tests cover matching destination, wrong origin, malformed/path/credential variants, project mismatch, redirect, direct get-result, and zero dispatch on refusal.

## F03 — Structured errors and durable attempts

**Before:** definite HTTP refusals and unusable responses collapsed into a message-only `WRITE_OUTCOME_UNKNOWN`; one `outcome.json` could be overwritten; a schema-valid result for another run was accepted.

**After:** `ControlledImportCommandError` carries `phase`, stable `code`, optional HTTP `statusCode`, sanitized `requestId`, and an in-memory `cause`. Only strict, status-matching known 4xx API responses are definite `server_rejection`; timeouts, redirects, malformed/unusable responses, 5xx ambiguity, result identity mismatch, and post-dispatch evidence failure are `post_dispatch_unknown`. Local packet/preparation/destination/evidence refusal is `pre_dispatch`. Result `runId` must equal the requested run for both mutation and reconciliation.

Every invocation requires a new private attempt directory. Before fetch, `attempt.json` records an independent attemptId, stable runId/idempotencyKey, authorization and request digests, bound destination, and `serverExecutionProven=false`. `outcome.json` is exclusively created as `SUCCEEDED`, `REJECTED`, `REFUSED`, or `UNKNOWN`. Existing attempts are not overwritten. Pre-dispatch evidence failure makes zero requests; post-dispatch evidence failure is UNKNOWN and never resubmitted.

Representative sanitized records:

```json
{"status":"REJECTED","runId":"<run-id>","error":{"phase":"server_rejection","code":"PERMISSION_DENIED","statusCode":403,"requestId":"<request-id>"}}
```

```json
{"status":"UNKNOWN","runId":"<run-id>","error":{"phase":"post_dispatch_unknown","code":"UNEXPECTED_REDIRECT","statusCode":302}}
```

The new in-process H3 integration uses the actual CLI transport, command, route, service, and Supabase repository while replacing only authenticated context and RPC. It proves valid company context reaches exact `c1_persist_controlled_import` arguments with requestId, and cross-company rejection returns the canonical error without any RPC. No direct table write or service-role path is present. RED was 2/2; GREEN is 2/2.

## F04 — Executable synthetic packet

The final packet remains `NOT_EXECUTED — REQUIRES EXPLICIT CLOUD DEV AUTHORIZATION`. It now contains a deterministic ledger of 6 POSTs and 1 GET: initial success, same-key replay, different-payload conflict, authentication negative, capability negative, cross-company negative, and canonical read-back. Expected 4xx responses count as scenario success only when status/code/requestId match. An unknown POST forbids resubmission and permits only the single same-identity reconciliation GET in place of ordinary read-back.

Each HTTP POST is one independent RPC transaction; it does not share the SQL fixture runner's outer `ROLLBACK`. The feasible lifecycle is approved retained synthetic scope in a dedicated synthetic company. Setup/registration/grants/enablement are separately authorized committed prerequisites; immutability stays enabled; no teardown is claimed. Postflight requires exact retained source/import scope and zero financial documents, payments, allocations, KPI facts, or unrelated master-data effects.

The correct normative concurrency anchor is `docs/superpowers/specs/taskovia-cost-management-v1.1/02-taskovia-c1-detailed-spec-v1.1.md` **§6.1, lines 362–368**, not §6.10. Applicable P2 cases are simultaneous same-company imports with the same key/payload, same key/different payload, and different keys targeting the same source code. `concurrency_execution = NOT_RUN` and requires separate authorization.

## Verification

- F01–F03 RED evidence: adapter 4/6 failed for the claimed gaps; command 5/5 failed before structured errors/destination schema; CLI 6/11 failed before durable outcomes; route integration 2/2 failed before the composable route existed.
- Focused GREEN command: `pnpm exec vitest run tests/unit/server/vqh-workbook-family-adapter.spec.ts tests/unit/server/controlled-import-command.spec.ts tests/unit/config/c1-import-cli.spec.ts tests/unit/server/controlled-import-route-integration.spec.ts tests/unit/server/controlled-import-persistence.spec.ts tests/unit/server/cost-import-manifest.spec.ts tests/unit/costs/import-contracts.spec.ts tests/unit/config/c1-controlled-import-persistence-contract.spec.ts tests/unit/config/c1-cloud-dev-runner.spec.ts` — exit 0, 9 files / 70 tests.
- Fresh `pnpm verify:app` — exit 0, 111 files / 816 tests, typecheck, lint, and production build passed. Known Vite chunk-size and Node dependency deprecation warnings remained nonfatal.
- `git diff --check` — exit 0 on the final documentation tree.

Remaining gates are reviewer approval of this repair, deployed command-path Cloud evidence, current actor/module/capability/adapter-registration/destination prerequisites, separately authorized concurrent-session proof, and explicit P2.4 real-data authorization. P2 remains partial.
