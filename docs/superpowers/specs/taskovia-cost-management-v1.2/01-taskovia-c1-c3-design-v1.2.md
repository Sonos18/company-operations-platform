# Taskovia C1–C3 design v1.2

## What C1 is

C1 is Taskovia’s company-scoped cost-information foundation: it preserves source provenance and uncertainty, later normalizes confirmed financial meaning by engagement, and never invents scope, tax, payment, or financial facts from ambiguous source material.

## Controlled onboarding

```text
explicitly provided workbook → CodeX structural analysis → reviewed mapping/import manifest
→ deterministic controlled importer → source records/provenance/review state → P3 normalization when eligible
```

The importer is not generic ETL. Each approved workbook family uses a focused adapter/mapping definition. The manifest names file identity, sheet/range or logical section, observed labels/amounts, candidate project/engagement, confidence, duplicate candidates, unresolved semantics, and the company target. Import refuses a changed manifest, unsupported structure, cross-company target, or ambiguous automatic normalization.

## P2 boundaries

P2 persists accounting sources, versions, provenance units, source-reported figures, review issues, import-run identity, idempotency receipts, and source-only audit. It may persist an optional raw-file reference when needed for provenance. It does not require runtime upload UI, browser preview, generic parser, runtime signed links, generic file renderer, or a file-download UI.

P2 records can remain unscoped, pending, reference-only, excluded, or unmapped to engagement. Filename and sheet name are evidence, not authoritative scope. Import must not create fake Project, Party, Engagement, cutoff, reporting date, tax basis, or payment meaning. Every P2 write has zero financial activation.

## Phase ownership

- P2: controlled source onboarding and provenance only.
- P3: source normalization, financial documents/lines, publication, confirmation, immutable financial activation.
- P4: allocation, correction, dispute, coverage.
- P5: reporting, source review/display, company-switch safety; upload/preview UX deferred.
- P6: final acceptance.

## Real-data gate

Synthetic fixtures are safe automated tests. CodeX may analyze an explicitly supplied workbook for mapping/planning. Persistent import of real VQH source data requires a separate authorization naming the target, input files, manifest, importer version, validation expectations, and rollback/stop behavior.
