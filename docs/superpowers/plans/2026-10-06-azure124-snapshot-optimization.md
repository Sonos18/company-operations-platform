# Azure124 snapshot optimization implementation plan

> For agentic workers: use superpowers:executing-plans to implement and verify in this isolated checkout.

**Goal:** Reduce repeated snapshot CLI requests without deleting any of the124 fixture assertions or weakening existing guards.
**Architecture:** For Azure124 only, compose untouched full native snapshot and all-sequence collection bodies in one bounded repeatable-read read-only transaction. Decode and archive both original evidence shapes with the existing validators; preserve independent bounded fallback captures and retain any primary combined-call failure. Add bounded per-command timing receipts, with archive failures failing closed.
**Tech Stack:** Node ESM, Vitest, installed Supabase CLI transport mocked for all tests.
**Spec:** Controller artifact azure124-optimization-review-20261006.md and current task's conditional fallback authorization.

## Global constraints
- Base28a0ca016de62aae2182a782c01860da96c7c56f remains immutable.
- No fixture/migration, ACL, quota, month, lease, actor/revision, admission/cleanup deadline or sequence budget changes.
- Preserve124, zero audit/role allocations, all5 exact sequences, all admission/postflight/final boundaries and no replay.
- No SQL/provider/dependency install/deploy. Changed manifest requires reporting before DB execution.
- All heavy verification uses /data/remote-jobs/validation.lock; shared deps are read-only.

## Review focus
- Missing/malformed sequence payload must fail; both independent captures remain attempted after paired failure.
- Catalogue, data and sequence drift must remain rejected by existing validators.
- Paired output allowance applies only to exact reviewed SQL and remains8MiB; all other output remains4MiB.
- Timing archive failures must fail closed without discarding original CLI diagnostics.
- Final later snapshot and30-second delayed-worker cleanup remain unchanged.

### Task1: regression tests and paired read-only capture
Files: new scripts/c1-cost-workflow-rehearsal-snapshot-pair.mjs; export existing all-sequence collection; modify runner/transport; add paired unit tests and Azure harness expectations.
- [x] Add failing behavioral tests for3 paired captures versus6 separate calls, complete archives, failed paired fallback and exact output limits.
- [x] Run red under shared lock.
- [x] Compose untouched collection bodies into one SQL envelope; use original decode/compare paths and paired-failure independent fallback without replay.
- [x] Add bounded command timing archive, preserving primary failures and source manifest binding.
- [x] Run focused source/mock regressions, full unit suite, scoped lint, Node syntax and diff checks.

### Task2: independent review and freeze
- [x] Review proof that all124, guards, snapshots and all5 sequences remain.
- [x] Fix any findings; reverify affected checks.
- [x] Freeze commit, source-only manifest preview, exact hashes and small source patch/report.
- [x] Report scope and packet without running DB if optimization is accepted.
Conditional one-shot fallback belongs only to unsuccessful/unsafe optimization and must use unchanged reviewed28a0ca0/13c85 manifest, fresh marker and action-time DEV guards; never a changed manifest.

## Executed outcome
Focused184/184pass; scoped lint,4Node syntax,diff and no-DB previewpass. Full suite2388pass/1inheritedfailure/39skip; unchangedbase canonical guard test also23pass/1fail. Fresh review foundoneP2(sessionprefix); regressionRED, minimaloriginal-prefixfix, GREEN plusfullverification. All124 fixture and9migrationbytes unchanged. Packet reported before DB execution; conditional oldpacketfallbackunused. Final source refs/hashes are in the retained source receipt, not execution approval.
