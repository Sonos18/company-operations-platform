# P2.4 VQH source UI

This repository slice adds a read-only, company-scoped early view of persisted C1 source figures. It has no migration, import command, private manifest, workbook reference, or financial publication logic.

Routes:

- `/costs`
- `/costs/projects/[projectId]`

The server uses the authenticated caller and existing RLS. A non-existent-run read probe makes module-disabled, permission-denied, and empty-source states distinct without writing data. Figures retain persisted decimal strings; provenance redacts raw file references and manifest snapshots.

The UI is generic. It does not embed VQH, EO GIÓ, Yong Mei, or any workbook data. Synthetic browser fixtures are confined to `tests/e2e/cost-source-ui.spec.ts`.

Track A remains responsible for P2.4 database preparation, private workbook recovery, and any real import. This slice will show real mapped data after that work is available to the authenticated caller.
