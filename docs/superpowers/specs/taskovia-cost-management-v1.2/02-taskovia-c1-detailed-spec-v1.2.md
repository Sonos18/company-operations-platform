# Taskovia C1 detailed contract v1.2

## Normative inheritance

v1.2 amends v1.1. Unchanged v1.1 requirements for financial semantics, permissions/RLS, API/error boundaries, reporting, P3–P6, migration safety, acceptance invariants, and security are normative. A later implementation must read v1.1 together with this document.

| v1.1 area | v1.2 status | Rule |
| --- | --- | --- |
| C1 purpose/scope; Project/Party/Engagement/Component | INHERITED UNCHANGED | Company-scoped master data and isolation remain. |
| Sources, versions, provenance, figures, review | MODIFIED BY v1.2 | Controlled importer replaces runtime ingestion. |
| Financial documents/lines, cash, coverage | INHERITED UNCHANGED | P3/P4 ownership and financial semantics remain. |
| Command receipts/events; permissions/RLS; API/errors | INHERITED UNCHANGED | Apply to importer commands and source records. |
| Reporting and P3/P4/P5/P6 | INHERITED UNCHANGED except dependencies below | P5 upload/preview UX is deferred. |
| A/I/F acceptance rules | INHERITED UNCHANGED except explicit controlled-import rows | See acceptance map transition. |
| Runtime upload, signed URLs, browser XLSX preview, generic parser/renderer | DEFERRED | Not P2 exit criteria. |
| Generic runtime ETL | SUPERSEDED | Never implement; adapters are workbook-family-specific. |

## Controlled-import domain

`import_manifest` is a reviewed immutable description of a supplied file family: input identity/digest, adapter version, target company, ordered logical sections, sheet/range/logical locators, observed labels/values, candidate mappings, uncertainty, duplicates, and mapping state. `import_run` binds actor/company/manifest digest/input digest/adapter version/idempotency identity to one deterministic execution result.

Mapping state is `confirmed`, `pending`, `reference_only`, or `excluded`. Uncertain or unscoped material remains pending; it must not create Project, Party, Engagement, cutoff, reporting date, tax basis, payment meaning, financial document, line, KPI, or confirmation. Filename and sheet name are provenance only.

Each persisted source record retains import run, manifest identity, source/version identity, file identity, sheet/range/logical section, observed value/raw token, mapping decision, review state, and unresolved semantics. Source figures remain decimal-string, source-only, and non-posting.

## Import execution and failure behavior

Only an explicitly reviewed workbook family/adapter may execute. Unsupported structure, changed input digest, manifest digest mismatch, cross-company target, duplicate identity conflict, or invalid adapter output fails before persistent mutation. Same actor/company/import identity/payload replays the canonical result; the same identity with different payload fails `IDEMPOTENCY_CONFLICT`. Authorization is rechecked before replay. Audit is append-only and excludes raw workbook cells, signed URLs, sensitive descriptions, amounts, and PII from broad audit surfaces.

## P2/P3 boundary and deferred capability

P2 imports source-layer records only. P3 consumes imported provenance and retains exclusive ownership of normalization, financial documents/lines, publication, confirmation, immutable financial activation, and refusal of unresolved source meaning. P4 remains allocation/correction/dispute/coverage. P5 retains reporting/source review/display/company-switch safety but defers mandatory upload/preview/download UX. P6 uses controlled-import acceptance.

Raw-file storage may remain a lightweight provenance reference, but runtime upload/finalize/sign/preview/download mechanics are optional future capabilities. No Office Online, OCR, external AI, generic runtime parser, macro/OLE/hyperlink execution, or generic ETL is implied.

## P2 exit and real-data gate

P2 completes when reviewed manifests import deterministically; provenance and uncertainty are retained; replay has one effect; cross-company writes fail; imported sources have zero financial effect; and synthetic isolation fixtures pass. Real VQH import is a separate authorization that names the target/environment, exact files and digests, adapter version, reviewed manifest digest, expected source/version/selection/figure/review counts, unresolved expectations, replay expectations, zero-financial-effect checks, stop conditions, and validation/reporting commands.
