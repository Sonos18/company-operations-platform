# C1-P3R Post-Gate G Project Cost Timestamp Offset Fix Report

```yaml
status: PASS_PROJECT_COST_TIMESTAMP_OFFSET_FIX_READY_FOR_REVIEW
phase: C1-P3R-POST-GATE-G-PROJECT-COST-TIMESTAMP-OFFSET-FIX

root_cause:
  postgres_timestamptz_offset_rejected_by_runtime_schema: true

observed_shape:
  example: 2026-09-17T07:45:34.829269+00:00

fix:
  shared_timestamp_accepts_offset: true
  server_row_timestamp_accepts_offset: true
  utc_z_compatibility_preserved: true
  data_normalization_added: false

safety:
  cloud_commands: 0
  database_changes: 0
  migration_changes: 0
  rbac_changes: 0
  auth_changes: 0
  ui_changes: 0

gates:
  gate_g: COMPLETE
  gate_h: NOT_STARTED_NOT_AUTHORIZED
```

## Summary

This bounded runtime regression fix resolves an issue where real Cloud DEV Project Cost rows containing PostgreSQL `timestamptz` values with explicit timezone offsets (such as `2026-09-17T07:45:34.829269+00:00`) were rejected by strict `z.string().datetime()` schemas, resulting in a runtime error ("Không thể tải dữ liệu").

1. **Root Cause Analysis & TDD Reproduction**:
   - `z.string().datetime()` by default only accepts UTC timestamps ending in `Z`.
   - Real PostgreSQL responses from Supabase provide ISO strings with timezone offsets (`+00:00`).
   - Adding a regression test in `tests/unit/costs/project-costs.spec.ts` and `tests/unit/server/project-cost.service.spec.ts` reproduced the failure: `rowSchema` and `projectCostItemSchema` threw parsing errors.

2. **Minimal Fix Applied**:
   - `shared/schemas/costs/project-costs.ts`: updated `timestamp = z.string().datetime({ offset: true })`.
   - `server/features/costs/project-cost.repository.ts`: updated `rowSchema` fields `created_at` and `updated_at` to `z.string().datetime({ offset: true })`.
   - Preserved UTC `Z` compatibility and rejection of non-datetime strings.
   - Preserved representation without manual string mutations, time zone normalization, or data rewriting.

3. **Verification**:
   - Focused unit suites: 85 tests passing in `tests/unit/costs/project-costs.spec.ts`, `tests/unit/server/project-cost.service.spec.ts`, and `tests/unit/repositories/http-project-cost-repository.spec.ts`.
   - Playwright suite: 10 tests passing in `tests/e2e/project-costs.spec.ts`.
   - Full app verification (`pnpm verify:app`): unit tests, typecheck, lint, and build all passed.
