# Taskovia C1 P2 controlled-import contract

## Frozen exports

- `shared/schemas/costs/imports.ts`: strict source identity/input version, provenance section, candidate/reviewed mapping, source figure, structured review issue, duplicate candidate, manifest, reviewed request, result, decimal amount, mapping-state, and locator schemas.
- `server/features/costs/imports/import-manifest.ts`: `canonicalizeManifest`, `occurrenceIdentity`, `validateReviewedImport`, and scoped `decideReplay` pure helpers.
- `tests/fixtures/costs/controlled-import/manifest.synthetic.json`: non-business synthetic manifest example.

## Identity rules

The manifest digest is SHA-256 of recursively key-sorted valid JSON after locator canonicalization. Object-key ordering is non-material; array order is material; absent optional properties and `undefined` are omitted; `null` is material. Raw source text, mapping state, company, adapter/version, input digest, figures, review issues, duplicate candidates, and provenance are material. The digest field is not included in itself; timestamps, credentials, request IDs, and actor authority are outside the reviewed payload.

Reviewed execution compares trusted company, permitted adapter/version, actual input digests, computed manifest digest, and separately supplied approved digest. A request ID is correlation only. Receipt identity is company + importer command/family + idempotency key; identical canonical payload replays, different payload conflicts, and a different company is a different receipt scope. Changed input requires a new explicit source version and review.

Occurrence identity is separate from the reviewed digest. Equivalent rectangles share an occurrence identity, including multi-letter columns; Unicode and meaningful sheet whitespace are preserved. Whole-file notes do not create another occurrence identity, but changing reviewed descriptive content changes the manifest digest.

## Manifest hierarchy

```text
input → manifest-local logical source → manifest-local source version → provenance section
      → source figure / review issue / duplicate candidate
```

Input identity is not source identity. Every `inputs[].fileIdentity` is unique. A source version must resolve exactly one input and match its `sha256` and `originalFilename`; filename is provenance/display evidence and is never used to infer input identity. Source/version/section/figure/review/duplicate IDs are stable manifest-local references, not persisted database IDs. A section must resolve to its source version and matching input digest; figures/issues/duplicates must resolve to existing sections. All descriptor IDs are unique. Declared source/version/section/figure/review counts must equal their actual manifest arrays.

Changed workbook bytes require a new explicit input identity/digest and a new explicit source version under the same logical source; a later version never silently overwrites the earlier source version.

Existing Project/Party/Engagement/Component UUIDs may appear only as intentional reviewed mapping targets. `confirmed` is reviewed source mapping only; it is never financial confirmation, publication, payment, or coverage.

## Handoff

A future workbook-family adapter produces candidate source/version identity, provenance sections, structured mapping/figures/issues/duplicates, and a candidate manifest only. `confirmed` mapping is source mapping—not financial confirmation, publication, payment, or coverage. P2.2 obtains human review and an approved digest; P2.3 persists/imports under database isolation and verifies replay, provenance, and zero financial effect. No source adapter, database writer, migration, Cloud run, or real-data import exists in this checkpoint.
