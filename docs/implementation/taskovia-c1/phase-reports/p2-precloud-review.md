# Taskovia C1 P2 pre-Cloud review

Status: **PARTIAL — PRE-CLOUD CANDIDATE READY**.

- Phase start: `799516ca2bb78e676863ff3d0ed9c21cf13a6693`
- Implementation commits: `86a4ffc`, `b4523c1`, `ba0ac0b`, `61ac648`
- Tested code: `61ac648`
- Migration candidate: `20260912062227_taskovia_c1_sources_files.sql`
- Migration SHA-256: `CC6515D283371BE1482D06CE537D222C74E7661887A3CD0F2246ED2DE5D0A4EC`

P2 adds the approved SheetJS CE CDN tarball `0.20.3` (Apache-2.0) and `decimal.js@10.6.0` (MIT); the lockfile changes only for those dependencies. The candidate covers private `taskovia-c1-financial` storage, `file_objects`, sources, source versions, selections, figures, review issues, scoped indexes/FKs, RLS, and public command wrappers. It also adds the two transaction-wrapped synthetic fixtures to the fixed C1 runner allowlist.

Verification: focused P2 tests, C1 runner tests, `pnpm typecheck`, `pnpm lint`, and `pnpm verify:app` passed (107 files / 768 tests). No generated database type changed. No P2 migration was applied, no P2 SQL fixture executed, and no Cloud, Local DB, Production, real VQH data, real permission grant, or real-company enablement occurred.

P2 acceptance evidence is deterministic only. Cloud RLS/storage/RPC and transactional fixture verification remain required before P2 closure. P3 is Not started.
