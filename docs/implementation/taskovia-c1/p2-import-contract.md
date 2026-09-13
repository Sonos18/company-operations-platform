# Taskovia C1 P2 controlled-import contract

## Exports

- `shared/schemas/costs/imports.ts`: manifest, reviewed request, result, decimal amount, mapping-state, and locator schemas.
- `server/features/costs/imports/import-manifest.ts`: `canonicalizeManifest`, `validateReviewedImport`, and `decideReplay` pure helpers.
- `tests/fixtures/costs/controlled-import/manifest.synthetic.json`: non-business synthetic manifest example.

## Identity rules

The manifest digest is SHA-256 of recursively key-sorted JSON after locator canonicalization. Array order, raw source text, mapping state, company, adapter/version, input digest, and provenance are material. The digest field is not included in itself; timestamps, credentials, request IDs, and actor authority are outside the reviewed payload.

Reviewed execution compares trusted company, permitted adapter/version, actual input digests, computed manifest digest, and separately supplied approved digest. A request ID is correlation only. A scoped idempotency key plus identical payload replays; the same key with different payload conflicts. Changed input requires a new explicit source version and review.

## Handoff

A future workbook-family adapter produces a candidate manifest only. P2.2 obtains human review and an approved digest; P2.3 persists/imports under database isolation and verifies replay, provenance, and zero financial effect. No source adapter, database writer, migration, Cloud run, or real-data import exists in this checkpoint.
