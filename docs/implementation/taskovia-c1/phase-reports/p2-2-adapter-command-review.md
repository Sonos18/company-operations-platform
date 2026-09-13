# Taskovia C1 v1.2 P2.2 adapter and command review

## Status

`P2_IMPLEMENTATION_READY_FOR_FINAL_REVIEW`

P2.1 remains frozen and P2.3 Cloud acceptance remains accepted. This checkpoint adds the bounded workbook-family verifier and runnable command path only. No Cloud/database command, real import, permission grant, company enablement, adapter registration, Local DB, Production, or P3 work occurred.

## File-level checklist

- Reused: frozen import schemas/canonicalizer; controlled-import service/repository; authenticated company context; API error boundary.
- Added: `vqh-workbook-family-adapter.ts` verifies explicit XLSX bindings, hashes, names, sheets/ranges, formulas, cached values and reviewed evidence while returning the unchanged canonical manifest.
- Added: `controlled-import.command.ts` validates an independent execution packet, preserves run/idempotency identity, dispatches once, and reconciles separately.
- Added: authenticated company-scoped POST/GET routes and `scripts/c1-import.ts` with `prepare`, `execute`, `get-result`, and `--help`.
- Added: synthetic adapter, command, and CLI tests; ExcelJS `4.4.0` and tsx `4.23.13`, both MIT and pinned.
- Deferred evidence: deployed command-path Cloud execution, current actor/module/capability/adapter-registration prerequisites, concurrent-session proof, and real-data onboarding.

## Trust boundary and commands

Offline preparation is the default and opens no network/database client. It reads the operator-bound files into memory, hashes the same bytes it parses, validates the reviewed manifest/company/family/adapter/digest, checks every reviewed cell-range evidence coordinate, and writes only to the supplied private output directory. Manifest `rawFileReference` remains provenance and is never opened automatically.

`pnpm c1:import:prepare -- --manifest <json> --digest <sha256> --company <uuid> --bind <fileIdentity=path>... --output <private-dir>` was implemented and executed offline. `pnpm db:dev:c1:import -- --packet <json> --preparation <json> --bind <fileIdentity=path>... --endpoint <https-url> --access-token-env <name> --execute --output <private-dir>` and `pnpm db:dev:c1:import:get-result -- --packet <json> --endpoint <https-url> --access-token-env <name> --output <private-dir>` are implemented but **NOT EXECUTED**.

The guarded execution CLI rereads/revalidates bound bytes immediately before its single HTTPS dispatch. The server authenticates the bearer token, resolves membership/company permissions, and delegates to `createControlledImportService(createSupabaseControlledImportRepository(...))`. Manifest/company fields are validation targets, not authority. Unknown write outcomes produce a durable UNKNOWN record and are never automatically resent.

## Evidence

Private B01-revised validation and the real offline command reproduced digest `7dbc1545a78b7a8671384caedb86817840e47c069fa7ed258d5159493b37d315`, counts 2/2/2/29/43/22 plus 27 duplicate candidates, 18 pending sections, 41 pending figures, and 11,690 referenced evidence cells. Both source hashes remained unchanged. Two narrowly diagnosed ExcelJS representations are covered: time-only/date-formatted cached values, formula errors under date formats, and missing cached formula results. No candidate field changed.

Focused implementation verification passed 8 files / 44 tests, followed by the byte-snapshot boundary suite at 4 files / 14 tests; typecheck and lint passed. Full verification is recorded at the final documentation checkpoint.

Final verification on implementation SHA `69c27d01f045a9db377acea0c923aac7413871d5` passed: focused 8 files / 44 tests; `pnpm verify:app` 110 files / 790 tests, typecheck, lint, and production build; `git diff --check` passed. The known Vite chunk-size and Node dependency deprecation warnings remained nonfatal.

The inherited concurrency requirement remains `docs/superpowers/specs/taskovia-cost-management-v1.1/02-taskovia-c1-detailed-spec-v1.1.md` §6.10: source-affecting mutations must preserve the company-scoped serialization/lock order until equivalent concurrent testing exists. Sequential replay and mocks do not satisfy it.
