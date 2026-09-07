# VQH Stage 01 operational acceptance

WP4 runtime, local and native security gates have passing evidence. The evidence-only report commit receives a final native verification before the orchestrator declares `STAGE01_ACCEPTANCE_COMPLETE` and `READY_FOR_VQH_PILOT`; its sealed result is recorded separately in `test-results/wp4/final-security-attestation.json` to avoid a self-referential commit identifier.

## Verified scope

- Source anchor: `8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`.
- Verified code SHA: `019641ee9e1ea38098328e8e32e08e35bcdab181`.
- Cloud DEV: `gtgljlnhwvhqdnwrfdfj`; migration parity **32/32**.
- Acceptance tenant/company: `b4000000-0000-4000-8000-000000000010` / `b4000000-0000-4000-8000-000000000020`, code `VQH_STAGE01_ACCEPTANCE`.
- Final combined browser run: `b4-stage01-beb431ed-508f-4d6c-afa6-e34e45252d63`.
- Bound acceptance snapshot: `2224ce13-0c0a-4d4a-a037-025610641bb3`.

All evidence paths below are local files under `test-results/`. Credentials are excluded. Production and real VQH pilot mutations were not performed; push and merge remain unauthorized.

## Scenario evidence

| Scenario | Result | Current evidence |
| --- | --- | --- |
| S01 proceed lifecycle | PASS | `wp4/browser-s08-contract-corrected.log`: real browser creation, intake, evaluation, authority assignment, final decision, completion and canonical reload |
| S02 not proceeding | PASS | `wp4/database-constraint-name-corrected.log`; separate real not-proceeding browser journey before S08 |
| S03 clarification history | PASS | `wp4/database-constraint-name-corrected.log`: B4 runtime S02–S06/S09/S10 |
| S04 blocker lifecycle | PASS | SQL gate and `wp4/browser-s08-contract-corrected.log` |
| S05 duplicate concern | PASS | SQL B4 runtime acceptance |
| S06 explicit revalidation | PASS | SQL and combined browser command/canonical reload evidence |
| S07 stale writer | PASS | `wp4/browser-s07-s09.log`; `wp4/concurrency-retry-2.log` |
| S08 controlled reactivation | PASS | `wp4/browser-s08-contract-corrected.log`: separate browser-created not-proceeding opportunity, new cycle, prior history retained |
| S09 permission/isolation | PASS | `wp4/browser-s07-s09.log`, SQL B4 matrix and `wp4/rls-retry-1.log` |
| S10 bound snapshot history | PASS | SQL B4 acceptance: existing instance remains bound while a newer snapshot is used by a new instance |

The combined browser test passed in 3.4 minutes. S07/S09 passed separately. Browser teardown checked the current run marker against canonical VQH, deactivated dedicated B4 credentials, and removed temporary secret state. Retained acceptance-company opportunities, cycles, snapshots and audit history are intentionally preserved.

## Database and local gates

- Stage01 SQL suite: PASS, `wp4/database-constraint-name-corrected.log`.
- Ten concurrency scenarios: PASS, `wp4/concurrency-retry-2.log`; same-request authority replay asserts one event/audit/version.
- Two integrity races: PASS, `wp4/integrity.log`.
- RLS smoke: PASS, `wp4/rls-retry-1.log`.
- `verify:app`: PASS, 724 tests across 95 files, typecheck, lint and build; `wp4/verify-app-current.log`.
- Full sequential deterministic browser suite: PASS, 143 tests; `wp4/e2e-current.log`.
- Dense history at 390×844 and 1440×900, overflow, labels, keyboard interaction and critical accessibility checks: PASS in the full suite.
- Working tree clean and `git diff --check` passing before this evidence-only report.

Passing database/race/RLS suites were not unnecessarily repeated after function-local identifier-only fixes. Subsequent repository read scheduling and UI/test corrections were verified through affected tests, current full local checks and real Cloud browser/performance runs.

## Performance

| Profile | Cycles / contacts | Repository calls | Cloud JSON bytes | Warm measured latency |
| --- | --- | --- | --- | --- |
| P1 | 1 / 2 | 20 | 19,916 | 2,017.38 ms, one sample |
| P2 | 5 / 10 | 20 | 47,629 | 1,683.67 ms, one sample |
| P3 | 20 / 20 | 20 | 143,627 | p95 1,953.66 ms; maximum 1,973.75 ms; 20 samples |

The P3 limits are p95 ≤2,000 ms, maximum ≤3,000 ms and payload ≤2 MiB: PASS. P1/P2 are profile observations, not separate 20-sample latency claims. Request counts come from actual delegated repositories under instrumentation, including opportunity/workflow reads; they exclude route authentication/context calls and are not presented as live total HTTP-call measurements. Evidence: `b4-stage01/request-count.json`, `wp4/performance-after-waterfall-fix.json`.

Initial P3 p95 was 2,527.9 ms. The one permitted unchanged-code recheck followed an `ACTIVE_HEALTHY` assessment and still failed at 2,341.13 ms. That recheck is consumed. A focused product correction overlapped independent reads while preserving error groups, filters, history and 20 repository calls. Post-correction verification passed at the values above, recorded against `e72c1d7a68d8df67a64fe4f1b80990595e601188`; the measured repository code is unchanged in the verified code SHA. Original and failed-recheck metrics remain preserved.

## Failure dispositions

| Classification | Defect | Disposition |
| --- | --- | --- |
| PRODUCT_DEFECT | Projection and candidate RPC SQLSTATE 42702 | Exactly two separately authorized forward migrations; local identifier renames only; retained reproductions pass and properties/grants unchanged |
| PRODUCT_DEFECT | Candidate route returned an array instead of the strict items envelope | Corrected route and real HTTP-schema regression; real browser assignment passes |
| PRODUCT_DEFECT | Reactivation shown for proceed | UI now follows existing not-proceeding rule; no business-rule migration |
| PRODUCT_DEFECT | P3 latency | Independent-read scheduling correction; passing post-fix measurement |
| TEST_OR_FIXTURE_DEFECT | Authority fixture scope, managed SQL syntax, final history fields, audit-role inspection and truncated constraint name | Focused corrections retained SQLSTATE, rejection, history and privilege assertions; SQL gate passes |
| TEST_OR_FIXTURE_DEFECT | Combined test budget, duplicate rationale locator, reactivation reload timing and incorrect S08 proceed fixture | Corrected observed test causes; S01 preserved; S08 uses a separate real eligible journey |
| ENVIRONMENT_DEFECT | Native Python helper used nonexistent Python27 | Authorized user-level Python correction and Codex restart; native startup and preflight now succeed |
| ENVIRONMENT_DEFECT | Native finalization retained stale pending-review coverage | First sealed report preserved; subsequent final-HEAD scan reconciles all 34 source files and seals complete coverage with zero deferred items |

## Security evidence and limits

Native scan `f01ed42d-4edc-4d11-a012-63c263819f86` finalized successfully for source anchor through verified code SHA. All 34 native changed-source inventory files were reviewed, with zero candidates/findings (critical/high/medium/low: 0/0/0/0). Readback nevertheless marked coverage partial because the tool retained three earlier pending-review checkpoint records after the final complete draft. This scan alone is not treated as the final acceptance gate.

Final-HEAD scan `01942a06-bbe9-4f1e-9638-feb90115304b` covers `8e1abc746a81f5b9f3f2fc6431648b5a10e09d58` through `f19f2c09be3546ce57c661dfe6cde12bb3e287dd`. Source blobs and the 34-file native inventory were verified identical to the reviewed code; the added report was independently reviewed against its evidence. Native finalization and sealed readback both succeeded: **complete coverage, zero deferred items, 35 reviewed surfaces including the report, zero findings (0 critical / 0 high / 0 medium / 0 low)**. This is the reconciled security gate; the earlier partial report remains unchanged for auditability.

The native reports and SARIF are preserved in their registered scan directories. Native-reported usage is a thread rollup, not incremental cost: first scan 22,273,998 tokens total including 21,759,616 cached input; reconciled scan 3,114,066 total including 3,061,760 cached input.

Advisor commands passed their configured error threshold. Three authenticated SECURITY DEFINER warnings correspond to intentional guarded projection, candidates and create-options RPCs; their actor/permission/scope checks and public/anon revocations were reviewed. Leaked-password protection remains a documented Cloud DEV Free-plan limitation; no Auth configuration was changed. The performance advisor's two permissive snapshot policies preserve separate journey/config permission paths. These dispositions do not certify Production configuration.

TAC status could not be verified because the access connector was not connected; protected output display may be unavailable. This was advisory and did not gate source review. No runtime exploit probes or database mutations were performed during the native scan.

## Release boundary

All code and runtime acceptance evidence is passing, including native coverage reconciliation. The final report-only change does not invalidate source, browser, database or performance results. Its native verification must preserve the same complete/zero-critical-high result before the orchestrator declares the milestones. WP5 real VQH pilot work requires separate authorization. No push or merge is included in this acceptance work.
