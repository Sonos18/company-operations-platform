# Taskovia Cost Management v1.2

v1.2 supersedes v1.1 for future C1 implementation while preserving v1.1 unchanged for audit. C1 remains company-scoped, source-first, non-posting until P3, and isolated by tenant/company. The v1.2 change is limited to P2 ingestion: explicitly provided accounting workbooks are analyzed and mapped by CodeX under review, then imported by a controlled, idempotent source-layer importer.

Canonical documents:

- [Changelog](00-taskovia-v1.2-changelog.md)
- [C1–C3 design](01-taskovia-c1-c3-design-v1.2.md)
- [Detailed contract](02-taskovia-c1-detailed-spec-v1.2.md)

Real VQH data import requires a separate explicit authorization. This documentation does not authorize a Cloud write, migration application, fixture execution, or inspection of a workbook not explicitly supplied for analysis.
