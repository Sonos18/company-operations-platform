# Taskovia Cost Management v1.2 changelog

## Supersession

v1.1 remains an immutable historical design record. v1.2 supersedes it for future C1 work after P1.

## P2 ingestion change

- Replaced mandatory runtime workbook upload, signed-upload URL, browser XLSX preview, generic spreadsheet parsing, and file-download UI with CodeX-assisted controlled import of explicitly provided workbook families.
- Retained accounting source/version identity, provenance locators, source figures, review issues, import-run identity, idempotency, company isolation, immutable source history, and the non-posting invariant.
- Deferred runtime file product capabilities. A lightweight file reference may remain only when it is useful provenance; it is not a mandatory v1.2 P2 capability.
- Added explicit import-manifest review, manifest/execution identity matching, repeat-import idempotency, unsupported-structure rejection before mutation, and real-data authorization gates.

## Downstream effect

P3 consumes imported source records/provenance, still owns normalization and financial activation. P4 remains allocation/correction/coverage. P5 keeps source review/display and reporting but defers runtime upload/preview UX. P6 verifies controlled-import provenance, isolation, non-posting behavior, financial correctness, and reporting truthfulness.
