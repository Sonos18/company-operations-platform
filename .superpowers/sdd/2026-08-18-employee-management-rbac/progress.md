# SDD ledger — plan: docs/superpowers/plans/2026-08-18-employee-management-rbac.md

## Setup

- Branch: `codex/employee-management-rbac`
- Worktree: `D:\work\company-operations-suite\company-operations-platform\.worktrees\employee-management-rbac`
- Branch base: `26bcccb`
- Node runtime: prepend `C:\Program Files\nodejs` to `PATH` to use Node `v24.4.1`; the default PATH resolves Node `v22.23.2` and violates `package.json`.
- Baseline unit suite: `104/104` passing after `pnpm exec nuxt prepare`.
- Database baseline: unavailable because neither Docker nor Podman is installed/on PATH; Supabase CLI 2.114.0 exits with `LegacyDockerLifecycleInspectError`.
- Supabase documentation checked 2026-08-18: current Data API requires explicit grants independently of RLS; security-definer functions belong in an unexposed schema; Auth invitations require a trusted server secret key and `inviteUserByEmail`.

## Pre-flight rulings

- Ruling: The migration path in Task 2 will be created by `pnpm exec supabase migration new employee_management_rbac`; every later task will use the CLI-generated path instead of the plan's invented timestamp — current Supabase tooling explicitly requires CLI-generated migration names — if wrong, only migration naming/history must be reconciled.
- Ruling: Mutating RPC implementations will be security-definer functions in the unexposed `private` schema, exposed through narrowly granted `public` security-invoker wrappers where PostgREST access is required — current Supabase security guidance prohibits security-definer functions in exposed schemas — if wrong, RPC grants/wrappers require rework but table contracts remain stable.
- Ruling: Add `company_memberships.is_active boolean not null default true`; all company membership helpers and authorization reads must require it, onboarding reactivates it, and offboarding sets it false — the approved spec requires active membership and removal of normal company access but the existing table has no lifecycle state — if wrong, one additive column and its predicates must be removed.
- Ruling: Implement `GET /employees` pagination with validated `page` and `pageSize` plus `{ items, page, pageSize, total }` because the spec requires a paginated directory even though Task 7's repository sketch omitted it — if wrong, callers need a small response-contract adjustment.
- Ruling: Browser E2E in this plan covers the read-only mock-backed directory; onboarding, role transfer, unauthorized direct calls, and audit behavior are verified at API/service/pgTAP layers until a separate browser login/session feature activates the HTTP repository — the plan explicitly defers frontend auth and mutation controls — if wrong, this branch will need a new login/session UI and authenticated browser fixtures.
- Ruling: Do not hand-edit `shared/types/database.types.ts`; type generation and executable pgTAP verification remain pending until Docker/Podman is available, while tasks may use narrow repository row interfaces at Data API boundaries to keep TypeScript honest — the global constraint forbids fabricated generated types — if wrong, generated types may later require small query-cast cleanup.
- Ruling: `public.revoke_company_role_assignment(target_assignment_id bigint, target_revoke_reason text)` returns the logically revoked assignment row; actor and scope derive from `auth.uid()` plus the assignment — this matches the endpoint and prevents client-supplied actor/tenant scope — if wrong, the wrapper and its callers need a signature migration before release.
- Ruling: Test the final-admin invariant through a privileged direct assignment revocation that must be rejected by a database trigger, while the public RPC continues to return `SELF_ROLE_CHANGE_FORBIDDEN` for the sole admin's self-revoke — no actor can simultaneously be a different active company admin when only one admin remains, so the public permission/self checks make that invariant otherwise unreachable — if wrong, Task 3 needs error-precedence or trigger redesign.
- Ruling: `tenant_memberships` and `public.is_tenant_member` remain unchanged; `company_memberships.is_active` gates company authorization only — tenant-level RBAC/lifecycle is explicitly outside this phase and an offboarded account may retain a tenant-history membership while losing all company access — if wrong, tenant membership needs its own lifecycle migration and policies.
- Ruling: Roles and role-permission mappings have no authenticated mutation route in this phase, but privileged/direct catalog mutations will still be audited and system-role code/deactivation/deletion will be guarded because they can invalidate final-admin guarantees — if wrong, extra catalog audit events can be removed without changing API contracts.
- Ruling: Development account seeds follow the repository's existing deterministic `auth.users(id,email)` identity-only pattern; no password or password hash is invented/committed because no documented convention exists and browser login is deferred — if wrong, a later local-auth fixture migration can add explicitly approved credentials.
- Ruling: Task 6 adds `public.get_my_company_access(company_id uuid)` as a narrowly granted security-invoker wrapper over a private security-definer implementation returning only the caller's active normalized role/permission rows — ordinary members cannot safely build their permission union through the intentionally restricted role-mapping tables, and widening those table policies would expose catalog detail — if wrong, the RPC can be replaced after generated types/RLS policy redesign without changing the session schema.
- Ruling: Task 7 adds `public.get_company_employee_access_links(target_company_id uuid, target_employee_ids uuid[])` as an authenticated security-invoker wrapper over a private security-definer implementation returning only employee-to-account links and active normalized role codes the caller may see — ordinary directory queries intentionally cannot select `employees.user_id` or role assignments, so a narrow projection preserves column grants and list redaction without introducing a service-role request path — if wrong, the projection can later move to a view or generated API after equivalent row/column authorization is proven.

## Pre-flight consistency scan

| Tasks / interface | Producer → consumer | Finding / ruling |
| --- | --- | --- |
| Task 1 self-check | pgTAP contracts → expected RED | Internally consistent; database execution is environment-blocked and must be reported, not fabricated. |
| Task 2 self-check | schema DDL → schema pgTAP | Conflict: invented migration filename; ruled to CLI-generated path. |
| Task 3 self-check | RLS/RPC/audit → RLS pgTAP | Conflict: public security-definer RPCs; ruled to private implementations plus public invoker wrappers. |
| Task 4 self-check | seed/config → seed assertions | Internally consistent; unknown HR fields stay null. |
| Task 5 self-check | shared schemas/generated types → type tests | Conflict: local generation needs Docker; generated file remains untouched until available. |
| Task 6 self-check | authorization service → context tests | Internally consistent; normalized assignments replace legacy company role reads. |
| Task 7 self-check | employee service/routes → unit tests | Conflict: spec requires pagination while sketch omits it; pagination added by ruling. |
| Task 8 self-check | private Auth admin client → invitation tests | Internally consistent after current-doc terminology permits a secret key or legacy service-role key through one private config field. |
| Task 9 self-check | role/offboarding services → lifecycle tests | Conflict: existing membership lacks active state; additive lifecycle column ruled above. |
| Task 10 self-check | repository contract/adapters → repository tests | Internally consistent; HTTP adapter remains inactive without browser auth. |
| Task 11 self-check | mock repository → directory UI/E2E | Spec E2E mutation flows conflict with read-only plan; ruled to backend coverage until login/session work. |
| Task 12 self-check | completed feature → runbook/release gates | Internally consistent; cloud push remains outside authorization and local DB gate may stay blocked. |
| Tasks 1 → 2 | schema tests → tables/constraints | Task 2 consumes the RED contract; use exact spec columns and constraint names asserted by Task 1. |
| Tasks 1 → 3 | RLS tests → policies/functions | Task 3 consumes RLS cases; wrappers preserve public routine names asserted by Task 1. |
| Tasks 1 → 4 | schema test file → seed assertions | Shared file is sequential; Task 4 extends rather than rewrites prior assertions. |
| Tasks 2 → 3 | migration → RLS/RPC/audit | Shared migration is sequential; final committed file must enable RLS and grants before feature completion. |
| Tasks 2 → 5 | database schema → generated/shared types | Generation blocked locally; narrow interfaces bridge temporarily without editing generated output. |
| Tasks 2/3 → 4 | tables/policies → seed data | Seed order must create memberships before employees and assignments; admin backfill uses normalized roles. |
| Tasks 3 → 6 | permission helper/assignments → authorization reader | Access is recalculated per request and filters revoked assignments plus inactive membership. |
| Tasks 3 → 7 | RLS projections → employee repository | User-JWT client remains in use; private details use a separate query/projection. |
| Tasks 3 → 8 | onboarding RPC → invite orchestration | Public invoker wrapper retains the planned RPC API while private implementation owns elevated writes. |
| Tasks 3 → 9 | grant/revoke/offboard RPCs → lifecycle services | Database locks and invariants remain authoritative; TypeScript maps stable errors only. |
| Tasks 4 → 10 | canonical seed matrix → mock fixtures | Exact names, emails, departments, and roles must match; unknown fields remain null. |
| Tasks 4 → 11 | split departments → filters/UI assertions | TECH and DESIGN remain independent in config, fixtures, and display. |
| Tasks 5 → 6 | permission constants/session schemas → context service | Permission values are one exact union shared across server responses. |
| Tasks 5 → 7 | employee schemas/errors → routes | Route bodies never accept tenant/actor/audit fields; list response adds ruled pagination envelope. |
| Tasks 5 → 8 | invitation schema/errors → route/service | Fixed base role only; provider errors remain redacted. |
| Tasks 5 → 9 | RBAC schemas/errors → mutation routes | Actor and company scope derive from auth context, never request body. |
| Tasks 5 → 10 | shared response schemas → adapters | Both mock and HTTP adapters parse/produce the same contract. |
| Tasks 6 → 7 | normalized context → employee authorization | Legacy arrays are never action authorization input. |
| Tasks 6 → 8 | permission guard → invite service | Như needs both `account.invite` and `employee.create`; no arbitrary role input. |
| Tasks 6 → 9 | permission guard → role/offboard service | Company admin-only permissions plus database invariants form defense in depth. |
| Tasks 7 → 10 | API contract → HTTP adapter | Pagination envelope must be adapted to the frontend list contract without losing total metadata internally. |
| Tasks 8 → 9 | admin client boundary → account disable | Same server-only factory is reused; no browser/shared import is allowed. |
| Tasks 10 → 11 | employee repository → page | Page consumes repository only and remains mock-backed in this phase. |
| Tasks 1–11 → 12 | tests/implementation → release gates/runbook | Task 12 may only claim gates actually executed; Docker and cloud checks cannot be marked passing without evidence. |

## Task execution

- Task 1: dispatched `/root/task_1_db_contracts` at base `26bcccb`; brief `task-1-brief.md`; report `task-1-report.md`.
- Task 1: initial review blocked approval at `d7c0b0d` with three Important findings: unauthorized non-admin final-admin fixture, no adversarial legacy/JWT role proof, and incomplete composite-FK assertions.
- Task 1: minor (deferred): add a position-based denial case proving position does not grant permissions; final whole-branch review must triage it.
- Task 1: fix round 1/5 (2 addressed, 1 open — last-admin invariant not exercised; commit `a1696b2`).
- Task 1: fix round 2/5 (1 addressed, 0 open — final-admin trigger contract restored; commit `469a140`).
- Task 1: complete (commits `26bcccb..469a140`, review clean; executable pgTAP remains environment-blocked and is carried to Task 12).
- Task 2: dispatched `/root/task_2_schema` at base `469a140`; brief `task-2-brief.md`; report `task-2-report.md`.
- Task 2: initial review blocked approval at `65f248b`: prior routine contracts were deleted without relocation, and membership lifecycle/key/index lack durable pgTAP assertions.
- Task 2: fix round 1/5 (2 addressed, 0 open — routine contracts restored and membership invariants asserted; commit `33f8be1`).
- Task 2: complete (commits `469a140..33f8be1`, static review clean; executable migration/pgTAP remains environment-blocked).
- Task 3: dispatched `/root/task_3_security` at base `33f8be1`; brief `task-3-brief.md`; report `task-3-report.md`; deferred position-denial Minor carried into scope.
- Task 3: initial security review blocked approval at `bdd7a87`: final-admin role-catalog bypass, full-name audit leakage, directory target integrity gap, assignment hard-delete/catalog audit gap, and revoke denial tests resolving NULL under RLS. Tenant-read finding ruled out of phase. Position-denial assertion remains a deferred Minor.
- Task 3: fix round 1/5 (5 addressed, 0 open — lifecycle guards, audit redaction/catalog audit, target directory gate, hard-delete denial, reachable revoke-denial fixtures; commit `fc8f81f`).
- Task 3: complete (commits `33f8be1..fc8f81f`, static security review clean; runtime SQL/RLS/pgTAP/concurrency remains a release-blocking environment gap).
- Task 4: dispatched `/root/task_4_seed` at base `fc8f81f`; brief `task-4-brief.md`; report `task-4-report.md`.
- Task 4: initial review blocked approval at `a81b405`: two multi-employee pgTAP scalar subqueries return multiple rows, and exact department-name/employee identity-email-department fixtures lack durable assertions.
- Task 4: minor (deferred): scope the compatibility-membership assertion to canonical fixture users/companies so future unrelated fixtures do not fail it; final review must triage.
- Task 4: fix round 1/5 (2 addressed, 0 open — scalar role assertions and exact canonical mappings; commit `72ac08e`).
- Task 4: complete (commits `fc8f81f..72ac08e`, static/unit review clean; runtime seed/idempotency/pgTAP remains environment-blocked).
- Task 5: dispatched `/root/task_5_contracts` at base `72ac08e`; brief `task-5-brief.md`; report `task-5-report.md`; generated DB types explicitly blocked/deferred.
- Task 5: initial review blocked approval at `35a715a`: employee response cannot represent ordinary-viewer redaction because account/roles are mandatory; session/context schemas are not strict.
- Task 5: minor (deferred): role-assignment forbidden-field test also fails for blank reason, so it does not isolate `grantedBy` rejection.
- Task 5: minor (deferred): add direct offboarding-schema coverage and exact permission-set/count regression assertion; final review must triage.
- Task 5: fix round 1/5 (2 addressed, 0 open — redacted/full employee projections and strict session/context contracts; commit `b11237d`).
- Task 5: complete (commits `72ac08e..b11237d`, review clean; generated database types remain environment-blocked and unchanged).
- Task 6: dispatched `/root/task_6_authorization` at base `b11237d`; brief `task-6-brief.md`; report `task-6-report.md`; self-access RPC ruling included.
- Task 6: initial review blocked approval at `fd13cd2`: stale generated-type cast for `company_memberships.is_active` escaped the localized RPC adapter boundary.
- Task 6: minor (deferred): add a direct unit contract for the changed auth session endpoint; final review must triage.
- Task 6: fix round 1/5 (1 addressed, 0 open — active membership now verified through the typed `is_company_member` RPC; commit `bfbb44e`).
- Task 6: complete (commits `b11237d..bfbb44e`, review clean; runtime database verification remains environment-blocked).
- Task 7: dispatched at base `bfbb44e`; brief `task-7-brief.md`; report `task-7-report.md`; narrow employee-access projection ruling included.
- Task 7: initial review blocked approval at `88d5c69`: private-detail SELECT inferred from self/update instead of explicit read permissions; PATCH was non-atomic and did not verify affected rows; access-link RPC admitted terminated/non-directory targets; generic PATCH allowed `terminated` and could bypass offboarding role/membership/account cleanup.
- Task 7: minor (included in fix): add deterministic employee-ID tie-breaker to pagination ordering and adversarial regression coverage for the three Important findings.
- Task 7: fix round 1/5 (4 original Important findings addressed; 2 new Important findings open — update RPC target lookup precedes authorization and JSON scalar validation may call `jsonb_object_keys` before proving object type; commit `a2208cc`).
- Task 7: fix round 2/5 (2 addressed, 0 open — authorization precedence and stable JSON shape validation; commit `ec31777`).
- Task 7: complete (commits `bfbb44e..ec31777`, review clean; 151 unit tests/typecheck/lint/build pass; runtime database verification remains environment-blocked).
- Task 8: dispatched at base `ec31777`; brief `task-8-brief.md`; report `task-8-report.md`; Auth-admin credential boundary and idempotent invite retry are security-review scope.
- Task 8: complete — private Auth admin credential/client, permission-first invitation route, normalized exact-email retry, caller-JWT onboarding RPC, and boundary/service/repository tests committed. Static security review is clean after fixing invite/create-only response redaction; local pgTAP remains blocked by unavailable Postgres/Docker.
