# Taskovia C1 detailed contract v1.2

## P2 controlled-import contract

P2.1 defines strict source/version/provenance/figure/review/import-manifest schemas. Money remains decimal strings. A source figure preserves raw token, value state, source basis/scope/period, and uncertainty; it never enters financial totals.

P2.2 accepts only explicitly reviewed workbook families. The adapter produces a deterministic manifest containing a source file digest/identity, workbook-family version, ordered provenance sections, mapping decisions, and a manifest digest. Execution accepts only the reviewed digest and writes only company-scoped P2 source records. Same actor/company/import identity/payload replays one result; the same identity with different manifest/payload fails. A changed source file or manifest fails before mutation.

P2.3 enforces composite tenant/company scope, duplicate prevention, import identity, append-only source audit, source revision history, and non-posting behavior. Synthetic fixtures are transaction-wrapped. A source import does not create Project, Party, Engagement, financial document, financial line, KPI, payment, or confirmation.

## Required persisted provenance

Each imported source record identifies import run, reviewed manifest, input identity, logical source version, sheet/range or logical section, observed values, mapping decision, review state, and uncertainty. Raw byte storage is optional provenance, not a runtime-product dependency.

## Deferred runtime file capabilities

User upload UI, SourceWizard upload flow, signed URL workflow, browser XLSX preview, generic file renderer/parser, and download UI are deferred. XLSX/XLS MIME validation and browser-preview acceptance are therefore not P2 exit criteria. The controlled importer instead rejects unexpected workbook structure before database mutation.

## P2 exit criteria

P2 completes only when a reviewed source manifest imports deterministically, retains provenance, preserves unresolved records as unresolved, safely replays without duplicate effect, rejects cross-company writes, and has zero financial effect. Runtime upload is not required.
