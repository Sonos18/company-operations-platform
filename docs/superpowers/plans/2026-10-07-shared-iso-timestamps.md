# Shared ISO timestamps implementation plan

**Goal:** Prevent valid Supabase timestamp offsets from breaking Taskovia DB/API reads through a shared validator that preserves the input string.

**Architecture:** Move the existing offset-aware ISO timestamp convention to `shared/schemas/iso-timestamp.ts`. Reuse it in the 22 audited consumer modules; maintain existing export names, nullable/optional wrappers, object strictness and other field validations. Parsing does not normalize or format timestamps.

**Spec:** User scope expansion Sentinel_b82df8f9ad408191a8f07bf971b4ff08, followed by parent implementation delegation. Publication and deployment remain held.

## Scope

- Add `shared/schemas/iso-timestamp.ts`, exporting `isoTimestampSchema`.
- Shared consumers: costs/{cost-evidence,cost-workflow-cutover,cost-workflow,master-data,project-costs,project-finance,source-read-model,sources}.ts; {opportunities,stage01-config,stage01,workflow}.ts.
- DB consumers: business-parties/business-party.repository.ts; costs/{cost-settings,project-cost}.repository.ts; costs/workflow/cost-workflow-cutover.repository.ts; engagements/engagement.repository.ts; opportunities/opportunity.repository.ts; project-register/project-register.repository.ts; stage01-config/stage01-config.repository.ts; stage01/stage01.repository.ts; workflow/workflow.repository.ts.
- Tests: real project timestamp regression, shared ISO timestamp validation cases, and an AST contract guard for the audited DB timestamp fields.

## Constraints and exclusions

- Accept ISO date-times ending in `Z` or an explicit numeric offset; retain fractional precision and original string.
- Reject invalid dates, malformed offsets, timezone-naive strings, date-only values and coercion from nonstrings.
- Preserve all existing nullable/optional rules. No change to business-date `date()` schemas, numeric/epoch timestamps, authentication, RLS, migrations or data.
- Existing `deriveFinanceDate` and `localDateInputValue` serve explicit calendar/display behavior and remain unchanged. Audit found no intentionally UTC-only ISO DB/API contract among the migrated fields; new deliberate exceptions require an explicit reviewed contract rather than a repository-wide string ban.
- No new dependencies, synthetic application/DB stages, private financial diagnostics, auth workarounds, publication or deployment.

## Execution

- [x] Add the limited AST guard and observe failures against the existing DB boundaries.
- [x] Implement the shared schema and replace only audited timestamp validators; retain the source-read-model and finance timestamp exports.
- [x] Cover real DEV microseconds/+00:00, Z, positive/negative offsets, nullable/optional and invalid/naive/date-only cases. Recheck real project mapping without mocks in an isolated source probe.
- [x] Run appropriate unit contracts, scoped lint and strict TypeScript; report dependency/runtime limitations separately from results.
- [x] Freeze an exact hashed patch/manifest against DEV e8c70952.
- [ ] Complete independent review of that immutable artifact (result retained in its separate verification receipt).

## Verification limits

Installed local dependencies are reused. Local Node is 22.23.2 while the repository requests Node 24; the stale controller dependencies lack pngjs, so a full Nuxt prepare/build is not available here. Isolated unit configuration and the existing Nitro auto-import type support targeted checks. Native UI confirmation must follow an explicitly released rollout; no claim of an already corrected live page is made.
