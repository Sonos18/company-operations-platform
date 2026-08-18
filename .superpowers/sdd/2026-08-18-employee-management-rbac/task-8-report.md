# Task 8: secure Auth administration and employee invitations

## Status

`DONE_WITH_CONCERNS`

## Summary

- Added a private-only `supabaseServiceRoleKey` runtime field and a separate, strict `SupabaseAdminConfig` parser. Empty or whitespace-only credentials fail closed; the value is not interpreted as a JWT.
- Added a server-only Admin client whose public type exposes only `auth.admin` invitation/list operations, with session persistence, refresh, and URL detection disabled. Normal request database work continues through the verified caller-JWT client.
- Added `POST /api/companies/:companyId/employee-invitations`. It resolves the authenticated company context and verifies both `account.invite` and `employee.create` before reading the body or constructing the privileged client.
- Added an Auth adapter that normalizes email; treats only documented `email_exists` and `user_already_exists` codes as retryable existing-user outcomes; performs finite, exact normalized-email pagination; and exposes no provider details.
- Added the caller-JWT repository adapter for `complete_employee_onboarding`. It maps database partial completion to `ONBOARDING_INCOMPLETE` and known work-email conflicts to `EMPLOYEE_EMAIL_CONFLICT`.
- Retries rerun the idempotent database RPC for the exact resolved Auth user. If account/role metadata is redacted by existing directory policy for an invite/create-only caller, the endpoint returns the schema-valid redacted employee summary rather than falsely reporting an incomplete transaction.

## TDD and verification evidence

- RED: focused invitation/config/boundary tests initially had 16 expected failures for missing private parser, admin factory/adapter, service method, and route boundary.
- RED: authorization-precedence route tests failed before the handler was changed to authorize before reading the invitation body.
- RED: redacted-summary test failed before the service stopped mistaking authorized metadata redaction for database incompleteness.
- `pnpm test:unit -- tests/unit/server/supabase-config.spec.ts tests/unit/server/service-role-boundary.spec.ts tests/unit/server/employee.repository.spec.ts tests/unit/server/employee.service.spec.ts tests/unit/server/employee-routes.spec.ts` — passed, 49 tests.
- `pnpm test:unit` — passed, 29 files / 176 tests.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm build` — passed and generated the Nitro server, including the invitation endpoint. External font-provider TLS/certificate warnings remain environmental.
- Static boundary checks: no private-admin symbols in generated browser assets; no logging sinks in changed invitation paths; only invitation assembly and `supabase-client.ts` reference the Admin factory; `git diff --check` passed.
- `pnpm db:local:test` — blocked: local Postgres at `127.0.0.1:54322` refused the connection; Docker/Podman/local Supabase remains unavailable.

## Security review

- Reviewed the complete Task 8 diff and the directly supporting employee RLS/access-link path. No remaining reportable finding was identified.
- Fixed during review: invite/create-only permissions can legitimately receive redacted account/role projections. The service now returns that validated summary instead of converting a successful idempotent database transaction into `ONBOARDING_INCOMPLETE`.
- Reviewer subagent dispatch was intentionally not used because this task explicitly prohibited subagents.

## Remaining risks

- Runtime PostgreSQL/RLS/pgTAP execution is still a release-blocking verification gap until a local Supabase/Postgres runtime is available.
- The production environment must provide the private `NUXT_SUPABASE_SERVICE_ROLE_KEY` (current secret/admin key or legacy service-role credential); a missing value fails closed only when the authorized invitation flow reaches the private factory.

## Commit

Intentional Task 8 commit: `feat: add secure employee invitations`.
