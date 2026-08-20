# Employee Management and Normalized RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a company-scoped employee directory, private HR profiles, account invitation/offboarding, and normalized RBAC for VQH, including the approved departments and six development employees.

**Architecture:** Keep Supabase Auth as identity, memberships as tenancy boundaries, `employees` as employment records, and normalized role assignments as the only company authorization source. PostgreSQL RLS and security-definer helpers enforce company isolation; Nuxt server routes perform request validation and action authorization; the current prototype frontend consumes an employee repository so the UI remains usable before a separate login experience is introduced.

**Tech Stack:** Nuxt 4.3.1, Vue 3.5.28, TypeScript 5.9, Nuxt UI 4.4.0, Supabase JS 2.112.x, Supabase CLI 2.114.x, PostgreSQL/RLS, Zod 4, Vitest 4.1.9, pgTAP, Playwright 1.61.1.

**Spec:** [`docs/superpowers/specs/2026-08-18-employee-management-rbac-design.md`](../specs/2026-08-18-employee-management-rbac-design.md)

## Global Constraints

- Preserve tenant and company isolation on every table, function, query, route, and repository method.
- Treat department and position as organizational facts only; they never grant a permission.
- Resolve company roles and permissions from active database assignments on each protected request. Do not place them in user metadata or trust stale JWT role claims.
- Keep `tenant_memberships.roles` as the tenant-administration boundary. Keep `company_memberships.roles` only as a temporary compatibility column containing `employee`; no new authorization decision may read it.
- Never expose the Supabase service-role key to `runtimeConfig.public`, browser bundles, repository adapters, logs, or API responses.
- Do not invent date of birth, position, hire date, phone number, or other unknown employee data. Persist unknown values as `NULL` and display an incomplete-profile marker.
- Every employee returned by the directory must have an Auth user, tenant membership, company membership, and active base `employee` role.
- Như may manage employee profiles and invite accounts, but may not assign/revoke roles, disable accounts, self-elevate, approve payments, or approve stock adjustments.
- Role grant/revoke operations prohibit changing the actor's own roles and prohibit removing the final active `company_admin`.
- Production onboarding uses real email invitations. Deterministic `@vqh.local` accounts and passwords are development seed data only.
- Database migrations are forward-only. Do not edit the three existing migration files.
- Generate `shared/types/database.types.ts` from the local database; never hand-edit it.
- Keep the current frontend repository abstraction. This phase supplies mock UI data plus an authenticated HTTP adapter contract; enabling the adapter in the browser waits for the separate login/session UI.
- Run database, unit, type, lint, build, and browser checks before calling the feature complete.

---

## File Map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260818095022_employee_management_rbac.sql` | Employee/RBAC schema, constraints, indexes, helper functions, RLS, grants, atomic onboarding, audit triggers |
| `supabase/seed.sql` | Approved departments, roles, permissions, six development users and assignments |
| `supabase/tests/database/employee_rbac_schema.test.sql` | Schema, constraints, catalogs, and seed contract |
| `supabase/tests/database/employee_rbac_rls.test.sql` | Cross-company isolation, private HR access, permission and grant-safety checks |
| `shared/constants/permissions.ts` | Canonical action-level permission codes |
| `shared/schemas/employees.ts` | Employee, invitation, mutation, and API response schemas |
| `shared/schemas/rbac.ts` | Role and role-assignment schemas |
| `shared/schemas/session.ts` | Company roles and permissions returned by resolved context |
| `shared/schemas/api-error.ts` | Employee/RBAC error codes |
| `shared/types/database.types.ts` | Supabase-generated database types |
| `server/utils/supabase-config.ts` | Public and server-only Supabase config validation |
| `server/utils/supabase-client.ts` | User-scoped and server-only admin clients |
| `server/features/authorization/authorization.service.ts` | Permission resolution and `requirePermission` |
| `server/features/employees/employee.repository.ts` | Typed employee queries and database RPC calls |
| `server/features/employees/employee.service.ts` | Directory/detail/update/onboarding/offboarding use cases |
| `server/features/employees/employee.routes.ts` | Route dependency assembly and response mapping |
| `server/features/rbac/rbac.repository.ts` | Roles and active assignment persistence |
| `server/features/rbac/rbac.service.ts` | Safe grant/revoke use cases |
| `server/features/tenancy/tenancy.service.ts` | Normalized role/permission company context |
| `server/api/companies/[companyId]/employees/index.get.ts` | Employee directory endpoint |
| `server/api/companies/[companyId]/employees/[employeeId].get.ts` | Employee detail endpoint |
| `server/api/companies/[companyId]/employees/[employeeId].patch.ts` | Employee update endpoint |
| `server/api/companies/[companyId]/employee-invitations.post.ts` | Account invitation and atomic onboarding endpoint |
| `server/api/companies/[companyId]/employees/[employeeId]/offboarding.post.ts` | Offboarding endpoint |
| `server/api/companies/[companyId]/roles/index.get.ts` | Role catalog endpoint |
| `server/api/companies/[companyId]/role-assignments.post.ts` | Role grant endpoint |
| `server/api/companies/[companyId]/role-assignments/[assignmentId].delete.ts` | Logical role revoke endpoint |
| `app/features/employees/employee.types.ts` | Frontend employee and role view models |
| `app/repositories/contracts.ts` | Employee repository contract |
| `app/repositories/mock/schemas.ts` | Persisted mock employee state |
| `app/repositories/mock/fixtures.ts` | Approved six employee fixtures |
| `app/repositories/mock/mock-repositories.ts` | Mock employee repository implementation |
| `app/repositories/http/http-employee-repository.ts` | Authenticated backend adapter, inactive until login integration |
| `app/components/employees/EmployeeTable.vue` | Responsive directory table/cards |
| `app/components/employees/EmployeeRoleBadges.vue` | Multiple active-role display |
| `app/pages/employees/index.vue` | Employee management page states and filters |
| `app/components/app/AppSidebar.vue` | Employee navigation entry |
| `app/config/companies/vqh.company.ts` | Independent Engineering and Design departments |
| `tests/unit/server/authorization.service.spec.ts` | Immediate permission-resolution behavior |
| `tests/unit/server/employee.service.spec.ts` | Employee lifecycle and failure-path coverage |
| `tests/unit/server/rbac.service.spec.ts` | Self-change and last-admin invariants |
| `tests/unit/server/supabase-config.spec.ts` | Server-only credential validation |
| `tests/unit/repositories/http-employee-repository.spec.ts` | HTTP method, URL, auth header, and response parsing |
| `tests/e2e/employees.spec.ts` | Directory, department split, account/role display, responsive behavior |
| `docs/runbooks/employee-onboarding-and-rbac.md` | Production invite, role transfer, offboarding, rollback, and cloud gates |

---

### Task 1: Add failing database contract tests

**Files:**
- Create: `supabase/tests/database/employee_rbac_schema.test.sql`
- Create: `supabase/tests/database/employee_rbac_rls.test.sql`

**Interfaces:**
- Consumes: existing `tenants`, `companies`, `tenant_memberships`, `company_memberships`, `audit_events`, and JWT test helpers.
- Produces: executable database requirements for the new schema and authorization boundary.

- [ ] **Step 1: Write schema assertions before the migration**

Create a pgTAP transaction that asserts the eight approved tables, primary/composite foreign keys, unique indexes, RLS enablement, and the three key routines:

```sql
begin;
select no_plan();

select has_table('public', 'departments');
select has_table('public', 'positions');
select has_table('public', 'employees');
select has_table('public', 'employee_private_details');
select has_table('public', 'roles');
select has_table('public', 'permissions');
select has_table('public', 'role_permissions');
select has_table('public', 'company_role_assignments');

select has_function('private', 'has_company_permission', array['uuid', 'uuid', 'text']);
select has_function('public', 'complete_employee_onboarding');
select has_function('public', 'revoke_company_role_assignment');

select * from finish();
rollback;
```

Add assertions for all columns and constraints named in sections 5.1–5.8 of the approved spec. Assert a partial unique index permits only one active `(tenant_id, company_id, user_id, role_id)` assignment.

- [ ] **Step 2: Write RLS scenarios before the policies**

Cover these identities in a rollback-only fixture: employee, self, HR manager, company admin, unrelated-company admin, and anonymous. Assert:

```sql
select is(
  (select count(*) from public.employee_private_details where employee_id = :'self_employee_id'),
  1::bigint,
  'employee reads own private profile'
);

select is(
  (select count(*) from public.employee_private_details where employee_id = :'other_employee_id'),
  0::bigint,
  'employee cannot read another private profile'
);
```

Also test directory reads, HR private reads, cross-company denial, immediate permission loss after revocation, self-role-change denial, and final-admin denial.

- [ ] **Step 3: Prove the tests fail for the missing feature**

Run:

```powershell
pnpm db:local:reset
pnpm db:local:test
```

Expected: reset succeeds; the two new pgTAP files fail because the employee/RBAC relations and functions do not exist.

- [ ] **Step 4: Commit the red contract tests**

```powershell
git add supabase/tests/database/employee_rbac_schema.test.sql supabase/tests/database/employee_rbac_rls.test.sql
git commit -m "test: define employee rbac database contract"
```

---

### Task 2: Create the normalized employee and RBAC schema

**Files:**
- Create: `supabase/migrations/20260818095022_employee_management_rbac.sql`
- Modify: `supabase/tests/database/employee_rbac_schema.test.sql`

**Interfaces:**
- Consumes: existing company and membership composite keys.
- Produces: company-scoped organizational, employee, role, permission, and assignment relations.

- [ ] **Step 1: Create catalogs and employee records**

Implement the exact columns, nullability, defaults, and uniqueness rules in spec sections 5.1–5.4. Use named composite constraints such as:

```sql
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  employee_code text not null,
  full_name text not null,
  work_email text not null,
  department_id uuid not null,
  position_id uuid,
  manager_employee_id uuid,
  hire_date date,
  probation_end_date date,
  employment_status text not null default 'active'
    check (employment_status in ('invited', 'active', 'inactive', 'terminated')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_company_fk foreign key (company_id, tenant_id)
    references public.companies(id, tenant_id) on delete cascade,
  constraint employees_membership_fk foreign key (tenant_id, company_id, user_id)
    references public.company_memberships(tenant_id, company_id, user_id) on delete restrict,
  constraint employees_department_fk foreign key (tenant_id, company_id, department_id)
    references public.departments(tenant_id, company_id, id) on delete restrict,
  constraint employees_position_fk foreign key (tenant_id, company_id, position_id)
    references public.positions(tenant_id, company_id, id) on delete restrict,
  constraint employees_manager_fk foreign key (tenant_id, company_id, manager_employee_id)
    references public.employees(tenant_id, company_id, id) on delete restrict,
  unique (tenant_id, company_id, id),
  unique (tenant_id, company_id, user_id),
  unique (tenant_id, company_id, employee_code)
);

create unique index employees_company_work_email_key
  on public.employees (tenant_id, company_id, lower(work_email));
```

Add matching composite unique keys to departments and positions before referencing them. Add check constraints preventing blank codes/names/emails and impossible probation dates.

Before adding the employee membership FK, add a same-scope candidate key to the existing membership table:

```sql
alter table public.company_memberships
  add constraint company_memberships_scope_user_key
  unique (tenant_id, company_id, user_id);
```

- [ ] **Step 2: Create normalized RBAC tables**

Implement spec sections 5.5–5.8. The assignment invariant must be database-enforced:

```sql
create unique index company_role_assignments_one_active
  on public.company_role_assignments (tenant_id, company_id, user_id, role_id)
  where revoked_at is null;

create index company_role_assignments_permission_lookup
  on public.company_role_assignments (tenant_id, company_id, user_id)
  where revoked_at is null;
```

Use `on delete restrict` for roles and permissions referenced by history. Preserve revoked assignments instead of deleting them.

- [ ] **Step 3: Add update timestamps and all RLS-supporting indexes**

Reuse one trigger function for `updated_at`. Index every company scope, membership lookup, department/position foreign key, employee user lookup, role code, and active assignment predicate exercised by RLS.

- [ ] **Step 4: Run the schema contract**

```powershell
pnpm db:local:reset
pnpm db:local:test
```

Expected: all schema assertions pass; RLS behavior assertions remain red until Task 3.

- [ ] **Step 5: Commit the schema**

```powershell
git add supabase/migrations/20260818095022_employee_management_rbac.sql supabase/tests/database/employee_rbac_schema.test.sql
git commit -m "feat: add employee and normalized rbac schema"
```

---

### Task 3: Enforce RLS, permission checks, grant safety, and audit

**Files:**
- Modify: `supabase/migrations/20260818095022_employee_management_rbac.sql`
- Modify: `supabase/tests/database/employee_rbac_rls.test.sql`

**Interfaces:**
- Consumes: `auth.uid()`, company membership, active role assignments, role-permission mappings.
- Produces: immediate database authorization, safe role mutation RPCs, atomic employee onboarding, immutable audit records.

- [ ] **Step 1: Implement the permission helper**

Create a stable security-definer helper with a fixed search path. It must require both active membership and active assignment:

```sql
create or replace function private.has_company_permission(
  target_tenant_id uuid,
  target_company_id uuid,
  target_permission text
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.company_memberships cm
    join public.company_role_assignments cra
      on cra.tenant_id = cm.tenant_id
     and cra.company_id = cm.company_id
     and cra.user_id = cm.user_id
     and cra.revoked_at is null
    join public.role_permissions rp on rp.role_id = cra.role_id
    join public.permissions p on p.code = rp.permission_code
    where cm.tenant_id = target_tenant_id
      and cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and p.code = target_permission
  );
$$;
```

Revoke execute from `public` and `anon`. Grant only the minimum required execution path to `authenticated`; do not grant table access to bypass the policies.

- [ ] **Step 2: Add row-level policies and explicit grants**

Enable RLS on all eight new tables. Policies must implement:

- company member: active directory rows and active catalogs;
- employee: own private record;
- HR/admin: all company employee/private records plus allowed mutations;
- company admin: role catalog and assignments;
- no anonymous access;
- no direct authenticated writes to `company_role_assignments`, `role_permissions`, or `audit_events`.

Use explicit column lists or separate tables so directory queries never return HR-private columns.

- [ ] **Step 3: Add atomic onboarding RPC**

Create `public.complete_employee_onboarding(...) returns uuid` as security definer. It checks `employee.create`, derives tenant from the caller's company membership, validates the target Auth user, upserts target tenant/company memberships with compatibility role `employee`, inserts the employee/private row, and inserts the base employee role assignment in one transaction. Repeated calls for the same company/user return the existing employee only when the immutable email and employee code match; otherwise raise `EMPLOYEE_EMAIL_CONFLICT` or `ONBOARDING_INCOMPLETE`.

- [ ] **Step 4: Add safe grant and revoke RPCs**

Create grant/revoke functions that require `role.assign`/`role.revoke`, reject `target_user_id = auth.uid()`, verify company scope, and preserve history. Revoke must lock active company-admin assignments and reject removal when the count is one:

```sql
if target_role_code = 'company_admin' and active_admin_count <= 1 then
  raise exception using errcode = 'P0001', message = 'LAST_COMPANY_ADMIN_REQUIRED';
end if;
```

Return the complete assignment row from grant and the updated logical-revocation row from revoke.

- [ ] **Step 5: Add append-only database audit triggers**

Create one trigger function that records employee creation/update/status changes and role grant/revoke in `audit_events`. Include actor, tenant, company, entity type/id, before/after payload, and `request_id` read from `request.headers`. Revoke all direct audit mutations from `authenticated`.

- [ ] **Step 6: Make every RLS test green**

```powershell
pnpm db:local:reset
pnpm db:local:test
```

Expected: existing tenancy tests and both employee/RBAC pgTAP files pass with no skipped assertions.

- [ ] **Step 7: Commit database authorization**

```powershell
git add supabase/migrations/20260818095022_employee_management_rbac.sql supabase/tests/database/employee_rbac_rls.test.sql
git commit -m "feat: enforce employee rbac policies"
```

---

### Task 4: Seed the approved VQH organization and accounts

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `supabase/tests/database/employee_rbac_schema.test.sql`
- Modify: `app/config/companies/vqh.company.ts`

**Interfaces:**
- Consumes: canonical VQH tenant/company IDs and normalized RBAC tables.
- Produces: idempotent local data for seven departments, eight roles, canonical permissions, and six account-linked employees.

- [ ] **Step 1: Add failing seed assertions**

Assert exact department codes `BLD`, `HR`, `TECH`, `DESIGN`, `CONSTRUCTION`, `PROCUREMENT`, `ACCOUNTING`; role codes; six employee codes; and active role matrix. Explicitly assert `TECH` and `DESIGN` resolve to different department IDs.

- [ ] **Step 2: Replace the combined frontend department**

In `app/config/companies/vqh.company.ts`, replace `TKE` with:

```ts
{ id: 'dept-tech', code: 'TECH', name: 'Phòng Kỹ thuật' },
{ id: 'dept-design', code: 'DESIGN', name: 'Phòng Thiết kế' },
```

Preserve other departments and update any tests that assert the old combined code.

- [ ] **Step 3: Seed permissions and role mappings idempotently**

Use the complete permission families from spec section 6, with no wildcard permission. Seed roles `employee`, `hr_manager`, `supplier_sourcing`, `inventory_auditor`, `technical_staff`, `designer`, `accountant`, and `company_admin`. Map Như's HR role to employee profile/invite capabilities only; keep role management, account disable, payment approval, and stock-adjustment approval out of that role.

- [ ] **Step 4: Seed six deterministic development Auth users and employee records**

Use these exact local emails and assignments:

| Employee | Code | Email | Department | Active roles |
| --- | --- | --- | --- | --- |
| Như | `VQH-NHU` | `nhu@vqh.local` | `HR` | `employee`, `hr_manager`, `supplier_sourcing`, `inventory_auditor` |
| Long | `VQH-LONG` | `long@vqh.local` | `TECH` | `employee`, `technical_staff` |
| Hiếu | `VQH-HIEU` | `hieu@vqh.local` | `TECH` | `employee`, `technical_staff` |
| Y | `VQH-Y` | `y@vqh.local` | `ACCOUNTING` | `employee`, `accountant` |
| Nhi | `VQH-NHI` | `nhi@vqh.local` | `DESIGN` | `employee`, `designer` |
| Hậu | `VQH-HAU` | `hau@vqh.local` | `DESIGN` | `employee`, `designer` |

Use stable UUIDs and the repository's existing local password convention. Leave unknown position, birth date, and hire date null. Add tenant/company memberships before employees and assignments.

Backfill every seeded `company_memberships.roles` value to the compatibility-only array `array['employee']`; grant the existing VQH owner the normalized `company_admin` role, and keep the isolation tenant's employee/admin fixtures wholly separate for RLS tests.

- [ ] **Step 5: Verify reset idempotency and exact seed state**

```powershell
pnpm db:local:reset
pnpm db:local:reset
pnpm db:local:test
```

Expected: both resets succeed and all assertions pass with exactly six VQH employees and no duplicate active assignments.

- [ ] **Step 6: Commit canonical development data**

```powershell
git add supabase/seed.sql supabase/tests/database/employee_rbac_schema.test.sql app/config/companies/vqh.company.ts
git commit -m "feat: seed vqh employees and role assignments"
```

---

### Task 5: Define shared employee, RBAC, session, and error contracts

**Files:**
- Create: `shared/constants/permissions.ts`
- Create: `shared/schemas/employees.ts`
- Create: `shared/schemas/rbac.ts`
- Modify: `shared/schemas/session.ts`
- Modify: `shared/schemas/api-error.ts`
- Modify: `shared/types/database.types.ts`
- Create: `tests/unit/shared/employee-schemas.spec.ts`

**Interfaces:**
- Consumes: database enums/columns and approved API shapes.
- Produces: one validated contract shared by server and frontend.

- [ ] **Step 1: Write schema parsing tests**

Test valid employee summaries, null optional HR fields, normalized lowercase emails, rejected unknown statuses, rejected malformed UUIDs, rejected empty role arrays, and every new API error code.

- [ ] **Step 2: Create canonical permission constants**

Export an immutable list and type:

```ts
export const permissionCodes = [
  'employee.read_directory',
  'employee.read_self_private',
  'employee.read_all',
  'employee.read_private',
  'employee.create',
  'employee.update',
  'employee.offboard',
  'account.invite',
  'account.disable',
  'role.read',
  'role.assign',
  'role.revoke',
  'supplier.read',
  'supplier.create',
  'supplier.update',
  'quotation_request.create',
  'quotation_request.update',
  'inventory.read',
  'stock_count.create',
  'stock_count.update',
  'stock_adjustment.read',
  'stock_adjustment.approve',
  'technical_document.read',
  'technical_document.update',
  'drawing.read',
  'drawing.create',
  'drawing.update',
  'accounting_document.read',
  'accounting_document.update',
  'supplier_payment.approve',
  'inventory_value.read',
  'project.read',
  'task.read_assigned',
  'task.update_assigned',
] as const

export type PermissionCode = (typeof permissionCodes)[number]
```

Keep this list byte-for-byte aligned with seeded permission codes.

- [ ] **Step 3: Implement Zod contracts**

At minimum export `employeeSummarySchema`, `employeeDetailSchema`, `employeeInvitationInputSchema`, `employeeUpdateInputSchema`, `employeeOffboardingInputSchema`, `roleSummarySchema`, `roleAssignmentInputSchema`, and inferred types. The employee summary must include account email, department, optional position, employment status, `profileComplete`, and an array of active roles.

- [ ] **Step 4: Expand context and errors**

Add `permissions: PermissionCode[]` to company access/context. Add exactly these errors: `PERMISSION_DENIED`, `EMPLOYEE_NOT_FOUND`, `EMPLOYEE_ACCOUNT_REQUIRED`, `EMPLOYEE_EMAIL_CONFLICT`, `ACCOUNT_INVITE_FAILED`, `ONBOARDING_INCOMPLETE`, `ROLE_ASSIGNMENT_CONFLICT`, `SELF_ROLE_CHANGE_FORBIDDEN`, `LAST_COMPANY_ADMIN_REQUIRED`, and `EMPLOYEE_OFFBOARDING_FAILED`.

- [ ] **Step 5: Generate database types and run focused tests**

```powershell
pnpm db:local:types
pnpm test:unit -- tests/unit/shared/employee-schemas.spec.ts
pnpm typecheck
```

Expected: generated types include all new relations/functions; focused tests and typecheck pass.

- [ ] **Step 6: Commit shared contracts**

```powershell
git add shared/constants/permissions.ts shared/schemas/employees.ts shared/schemas/rbac.ts shared/schemas/session.ts shared/schemas/api-error.ts shared/types/database.types.ts tests/unit/shared/employee-schemas.spec.ts
git commit -m "feat: define employee rbac api contracts"
```

---

### Task 6: Resolve normalized permissions in request context

**Files:**
- Create: `server/features/authorization/authorization.service.ts`
- Modify: `server/features/tenancy/tenancy.service.ts`
- Modify: `server/api/auth/session.get.ts`
- Modify: `server/api/companies/[companyId]/context.get.ts`
- Create: `tests/unit/server/authorization.service.spec.ts`
- Modify: `tests/unit/server/tenancy.service.spec.ts`
- Modify: `tests/unit/server/company-context-route.spec.ts`

**Interfaces:**
- Consumes: active normalized assignments for the authenticated user and requested company.
- Produces: `{ roles, permissions }` and a reusable immediate authorization guard.

- [ ] **Step 1: Write tests proving role arrays are ignored**

Create a membership fixture whose legacy `roles` contains `company_admin` while normalized assignments contain only `employee`. Assert context returns only normalized roles/permissions. Revoke an assignment between two calls and assert the second call denies the permission without refreshing the JWT.

- [ ] **Step 2: Implement the guard**

```ts
export interface AuthorizationReader {
  listAccess(userId: string, companyId: string): Promise<{
    roles: string[]
    permissions: PermissionCode[]
  }>
}

export function createAuthorizationService(reader: AuthorizationReader) {
  return {
    async requirePermission(userId: string, companyId: string, permission: PermissionCode) {
      const access = await reader.listAccess(userId, companyId)
      if (!access.permissions.includes(permission)) {
        throw new AppApiError('PERMISSION_DENIED', 403)
      }
      return access
    },
  }
}
```

Deduplicate and sort roles/permissions for deterministic responses.

- [ ] **Step 3: Replace company authorization reads**

Keep company membership as the scope check, but remove all authorization meaning from `company_memberships.roles`. Make session/context routes return normalized values.

- [ ] **Step 4: Run focused authorization tests**

```powershell
pnpm test:unit -- tests/unit/server/authorization.service.spec.ts tests/unit/server/tenancy.service.spec.ts tests/unit/server/company-context-route.spec.ts
```

Expected: legacy-role spoofing is ignored and immediate revoke coverage passes.

- [ ] **Step 5: Commit the authorization boundary**

```powershell
git add server/features/authorization server/features/tenancy/tenancy.service.ts server/api/auth/session.get.ts server/api/companies/[companyId]/context.get.ts tests/unit/server
git commit -m "feat: resolve normalized company permissions"
```

---

### Task 7: Implement employee directory and profile APIs

**Files:**
- Create: `server/features/employees/employee.repository.ts`
- Create: `server/features/employees/employee.service.ts`
- Create: `server/features/employees/employee.routes.ts`
- Create: `server/api/companies/[companyId]/employees/index.get.ts`
- Create: `server/api/companies/[companyId]/employees/[employeeId].get.ts`
- Create: `server/api/companies/[companyId]/employees/[employeeId].patch.ts`
- Create: `tests/unit/server/employee.service.spec.ts`
- Create: `tests/unit/server/employee-routes.spec.ts`

**Interfaces:**
- Consumes: authenticated company context, permission guard, generated Supabase types, shared schemas.
- Produces: validated list/detail/update endpoints that never leak private HR fields.

- [ ] **Step 1: Write service tests first**

Cover directory access, self-private access, HR-private access, ordinary employee private denial, cross-company not-found behavior, profile completeness, and update authorization. Assert the repository always receives `companyId` and never accepts scope from request bodies.

- [ ] **Step 2: Implement repository projections**

Use separate methods so private data cannot enter directory results accidentally:

```ts
export interface EmployeeRepository {
  listDirectory(companyId: string): Promise<EmployeeSummary[]>
  getDirectoryEmployee(companyId: string, employeeId: string): Promise<EmployeeSummary | null>
  getPrivateDetails(companyId: string, employeeId: string): Promise<EmployeePrivateDetails | null>
  updateEmployee(companyId: string, employeeId: string, input: EmployeeUpdateInput): Promise<EmployeeDetail>
}
```

Select active role codes through active assignments. Compute `profileComplete` from required business fields without fabricating values.

- [ ] **Step 3: Implement use-case authorization**

- list: `employee.read_directory`;
- detail: directory plus own private with `employee.read_self_private`, or all private with `employee.read_private`;
- update: `employee.update` and immutable `tenant_id`, `company_id`, `user_id`, `employee_code`.

Return `EMPLOYEE_NOT_FOUND` for missing or out-of-scope IDs.

- [ ] **Step 4: Add thin route handlers**

Each handler uses `runApiRoute`, authenticated server-derived context, Zod params/body parsing, and the feature service. No handler queries Supabase directly.

- [ ] **Step 5: Run focused tests**

```powershell
pnpm test:unit -- tests/unit/server/employee.service.spec.ts tests/unit/server/employee-routes.spec.ts
pnpm typecheck
```

Expected: all employee read/update paths pass and response types contain no private fields for unauthorized users.

- [ ] **Step 6: Commit employee read/update APIs**

```powershell
git add server/features/employees server/api/companies/[companyId]/employees tests/unit/server/employee.service.spec.ts tests/unit/server/employee-routes.spec.ts
git commit -m "feat: add employee directory api"
```

---

### Task 8: Isolate Auth administration and implement invitations

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `server/utils/supabase-config.ts`
- Modify: `server/utils/supabase-client.ts`
- Create: `server/api/companies/[companyId]/employee-invitations.post.ts`
- Modify: `server/features/employees/employee.service.ts`
- Modify: `server/features/employees/employee.routes.ts`
- Modify: `tests/unit/server/supabase-config.spec.ts`
- Modify: `tests/unit/server/employee.service.spec.ts`
- Create: `tests/unit/server/service-role-boundary.spec.ts`

**Interfaces:**
- Consumes: caller JWT for authorization, private service-role credential for Supabase Auth invite, onboarding RPC for database state.
- Produces: one account-linked employee or a stable onboarding error.

- [ ] **Step 1: Write credential-boundary and invitation tests**

Assert missing service role fails closed, private runtime config parses it, public runtime config never contains it, regular user client never receives it, and only the invitation/offboarding dependency assembly imports the admin-client factory. Test invite success, existing invited user retry, Auth failure, and database completion failure.

- [ ] **Step 2: Add private runtime config**

```ts
runtimeConfig: {
  supabaseServiceRoleKey: '',
  public: {
    supabaseUrl: '',
    supabaseAnonKey: '',
  },
},
```

Export a separate `parseSupabaseAdminConfig` requiring URL plus non-empty service role key. Never merge its return type with `SupabaseRuntimeConfig`.

- [ ] **Step 3: Create a server-only admin client factory**

Configure `persistSession: false`, `autoRefreshToken: false`, and no global browser storage. Keep the factory in `server/utils/supabase-client.ts`; do not export it from shared or app code.

- [ ] **Step 4: Implement invitation orchestration**

Require both `account.invite` and `employee.create`. Normalize email, invite via `auth.admin.inviteUserByEmail`, then call `complete_employee_onboarding` with the returned Auth user ID. On retry, resolve an existing Auth user by normalized email and safely repeat the idempotent database RPC. Map provider failures to `ACCOUNT_INVITE_FAILED` and partial completion to `ONBOARDING_INCOMPLETE`; do not return provider details or credentials.

- [ ] **Step 5: Run focused security tests**

```powershell
pnpm test:unit -- tests/unit/server/supabase-config.spec.ts tests/unit/server/service-role-boundary.spec.ts tests/unit/server/employee.service.spec.ts
pnpm typecheck
```

Expected: admin credential remains server-only and invite retry produces one employee and one active base role.

- [ ] **Step 6: Commit onboarding**

```powershell
git add nuxt.config.ts server/utils/supabase-config.ts server/utils/supabase-client.ts server/features/employees server/api/companies/[companyId]/employee-invitations.post.ts tests/unit/server
git commit -m "feat: add secure employee invitations"
```

---

### Task 9: Implement safe role lifecycle and offboarding APIs

**Files:**
- Create: `server/features/rbac/rbac.repository.ts`
- Create: `server/features/rbac/rbac.service.ts`
- Create: `server/api/companies/[companyId]/roles/index.get.ts`
- Create: `server/api/companies/[companyId]/role-assignments.post.ts`
- Create: `server/api/companies/[companyId]/role-assignments/[assignmentId].delete.ts`
- Create: `server/api/companies/[companyId]/employees/[employeeId]/offboarding.post.ts`
- Modify: `server/features/employees/employee.service.ts`
- Create: `tests/unit/server/rbac.service.spec.ts`
- Modify: `tests/unit/server/employee.service.spec.ts`

**Interfaces:**
- Consumes: safe database RPCs and server-only Auth admin client.
- Produces: list/grant/revoke/offboard actions with database-enforced invariants and audit history.

- [ ] **Step 1: Write failure-path tests**

Cover duplicate active role, actor changes own role, wrong-company target, last admin revoke, role transfer from Như to a new user, Auth disable failure, and successful offboarding. Assert offboarding does not erase employee or assignment history.

- [ ] **Step 2: Implement role catalog and mutation services**

List active company roles with permissions behind `role.read`. Grant behind `role.assign`; revoke behind `role.revoke`. Call the database RPCs rather than reproducing concurrency-sensitive rules in TypeScript. Map database error messages to shared stable error codes.

- [ ] **Step 3: Implement offboarding in safe order**

Require `employee.offboard` and `account.disable`. The employee cannot offboard themself. First call a database RPC that locks the employee, marks status/termination metadata, revokes all active non-history assignments, and verifies final-admin safety; then disable the Auth account. If Auth disable fails, return `EMPLOYEE_OFFBOARDING_FAILED`, emit an audit failure event through a dedicated security-definer audit RPC, and make retry idempotent.

- [ ] **Step 4: Add thin route handlers and focused tests**

```powershell
pnpm test:unit -- tests/unit/server/rbac.service.spec.ts tests/unit/server/employee.service.spec.ts
pnpm typecheck
```

Expected: all grant-safety and offboarding cases pass, including concurrent last-admin behavior mocked at the RPC boundary.

- [ ] **Step 5: Commit lifecycle APIs**

```powershell
git add server/features/rbac server/features/employees server/api/companies/[companyId]/roles server/api/companies/[companyId]/role-assignments server/api/companies/[companyId]/employees/[employeeId]/offboarding.post.ts tests/unit/server
git commit -m "feat: add role lifecycle and employee offboarding"
```

---

### Task 10: Add employee repository implementations and fixtures

**Files:**
- Create: `app/features/employees/employee.types.ts`
- Modify: `app/repositories/contracts.ts`
- Modify: `app/repositories/mock/schemas.ts`
- Modify: `app/repositories/mock/fixtures.ts`
- Modify: `app/repositories/mock/mock-repositories.ts`
- Modify: `app/plugins/repositories.client.ts`
- Create: `app/repositories/http/http-employee-repository.ts`
- Create: `tests/unit/repositories/http-employee-repository.spec.ts`
- Create: `tests/unit/repositories/mock-employee-repository.spec.ts`

**Interfaces:**
- Consumes: shared employee response schemas and the approved local matrix.
- Produces: `EmployeeRepository` with mock and authenticated HTTP adapters.

- [ ] **Step 1: Write repository contract tests**

Assert both implementations satisfy:

```ts
export interface EmployeeRepository {
  list(): Promise<EmployeeSummary[]>
  getById(employeeId: string): Promise<EmployeeDetail | null>
  update(employeeId: string, input: EmployeeUpdateInput): Promise<EmployeeDetail>
}
```

For HTTP, assert company-scoped URL, bearer header supplied by an injected `getAccessToken`, Zod response parsing, and stable API-error mapping. For mock, assert all six people, accounts, departments, and multiple Như roles.

- [ ] **Step 2: Add employee state and exact fixtures**

Extend `MockState` without breaking saved prototype state: schema defaults missing `employees` to the six canonical fixtures. Include null values for unknown dates/positions and `profileComplete: false`.

- [ ] **Step 3: Register the mock repository**

Add `employees` to `RepositoryRegistry` and current client plugin. Keep the plugin on mock storage in this phase.

- [ ] **Step 4: Implement but do not activate the HTTP adapter**

The adapter receives `{ companyId, getAccessToken, fetch }`; it must never read a token from local storage directly. This creates the production boundary without adding an unapproved login UI.

- [ ] **Step 5: Run repository tests**

```powershell
pnpm test:unit -- tests/unit/repositories/http-employee-repository.spec.ts tests/unit/repositories/mock-employee-repository.spec.ts
pnpm typecheck
```

Expected: both adapters obey one contract and the six fixture records match the database seed matrix.

- [ ] **Step 6: Commit repository support**

```powershell
git add app/features/employees app/repositories app/plugins/repositories.client.ts tests/unit/repositories
git commit -m "feat: add employee repository adapters"
```

---

### Task 11: Build the employee management page

**Files:**
- Create: `app/components/employees/EmployeeRoleBadges.vue`
- Create: `app/components/employees/EmployeeTable.vue`
- Create: `app/pages/employees/index.vue`
- Modify: `app/components/app/AppSidebar.vue`
- Create: `tests/e2e/employees.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `useRepositories().employees.list()` and frontend view models.
- Produces: searchable employee directory showing account, department, position, status, profile completeness, and every active role.

- [ ] **Step 1: Write browser acceptance tests first**

Test route `/employees`, six employee names/emails, Như's four roles, two technical employees in `Phòng Kỹ thuật`, two designers in `Phòng Thiết kế`, Y in Accounting, incomplete-profile markers, department/status filters, mobile layout, keyboard reachability, and no serious/critical axe violations.

- [ ] **Step 2: Build role badges and responsive directory**

Use Nuxt UI table/badge/input/select/skeleton/alert primitives. Display all roles without truncating authorization information. On narrow screens switch each row to a card; maintain minimum `44px` interactive targets.

- [ ] **Step 3: Add page states and navigation**

The page owns loading, error, empty, search, department filter, and status filter. Add a sidebar link labeled `Nhân sự` with an appropriate Lucide icon. Do not expose invite/edit/role mutation buttons until real browser authentication and permission context are connected.

- [ ] **Step 4: Run browser checks**

```powershell
pnpm test:e2e -- tests/e2e/employees.spec.ts tests/e2e/mobile.spec.ts tests/e2e/accessibility.spec.ts
pnpm typecheck
pnpm lint
```

Expected: desktop/mobile/accessibility acceptance passes and existing navigation tests remain green.

- [ ] **Step 5: Commit the employee UI**

```powershell
git add app/components/employees app/pages/employees app/components/app/AppSidebar.vue tests/e2e
git commit -m "feat: add employee management directory"
```

---

### Task 12: Document operations and run full release gates

**Files:**
- Create: `docs/runbooks/employee-onboarding-and-rbac.md`
- Modify: `docs/superpowers/plans/2026-08-18-employee-management-rbac.md`

**Interfaces:**
- Consumes: completed schema, APIs, adapters, UI, and verification scripts.
- Produces: reproducible local/cloud rollout and an evidence-backed completion record.

- [x] **Step 1: Write the operational runbook**

Document:

- required private/public environment variables without secret values;
- local seed accounts and the existing documented local-only password convention;
- production email invitation flow;
- transfer of `supplier_sourcing` or `inventory_auditor` from Như to a new employee;
- offboarding retry/reconciliation;
- how to inspect role/employee audit events;
- expand–migrate–contract note: `company_memberships.roles` remains compatibility-only until all deployed consumers prove normalized reads;
- rollback: disable new routes/UI, preserve forward schema and history, and never restore legacy authorization reads.

- [x] **Step 2: Scan for forbidden patterns**

Run:

```powershell
rg -n "company_memberships.*roles|roles.*company_memberships" server app shared
rg -n "serviceRole|service_role|SUPABASE_SERVICE_ROLE" app shared
$forbiddenPlanTerms = @('TO' + 'DO', 'T' + 'BD', 'implement ' + 'later')
Select-String -LiteralPath 'docs/superpowers/plans/2026-08-18-employee-management-rbac.md' -Pattern $forbiddenPlanTerms
```

Expected: no server/app authorization reads of legacy company role arrays; no service-role references in browser/shared code; no plan placeholders.

- [x] **Step 3: Run the application gates with Node.js 24**

```powershell
node --version
pnpm verify:app
```

Expected: Node.js reports `v24.x`; unit tests, Nuxt typecheck, ESLint, and production build pass. By approved project decision, the local Supabase stack is not used; database verification runs against the canonical Cloud DEV target after separate migration authorization.

- [x] **Step 4: Run the complete browser suite**

```powershell
pnpm test:e2e
```

Expected: all existing and employee browser tests pass on configured projects.

- [x] **Step 5: Run cloud-development preflight without mutation**

```powershell
pnpm db:dev:auth-check
pnpm db:dev:link
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
```

Expected: the dedicated DEV credential can access the canonical project, the linked development target is verified, dry-run contains only the new forward migrations, and no unresolved security/performance advisor finding is introduced. Linking changes only ignored local CLI state. Do not push to Cloud DEV unless the user separately authorizes deployment after reviewing the dry-run.

- [x] **Step 6: Record verification evidence and commit documentation**

Append command timestamps and pass/fail summaries to this plan, check completed boxes, then run:

```powershell
git add docs/runbooks/employee-onboarding-and-rbac.md docs/superpowers/plans/2026-08-18-employee-management-rbac.md
git commit -m "docs: add employee rbac operations runbook"
```

#### Task 12 verification evidence — 2026-08-18 20:32–20:34 +07:00

| Gate | Command / check | Outcome |
| --- | --- | --- |
| Runbook | `docs/runbooks/employee-onboarding-and-rbac.md` | Complete. Based on this worktree's actual routes, private runtime config, seed, audit actions, and offboarding retry implementation. |
| Legacy authorization scan | `rg -n "company_memberships.*roles|roles.*company_memberships" server app shared` | Passed: no matches (exit code 1 is `rg`'s expected no-match status). |
| Browser/shared credential scan | `rg -n "serviceRole|service_role|SUPABASE_SERVICE_ROLE" app shared` | Passed: no matches (exit code 1 is `rg`'s expected no-match status). |
| Plan placeholder scan | `Select-String` using the Task 12 forbidden-term array | Passed: no matches. |
| Focused lifecycle/security units | `pnpm test:unit -- tests/unit/server/employee.service.spec.ts tests/unit/server/rbac.service.spec.ts tests/unit/server/supabase-config.spec.ts tests/unit/server/service-role-boundary.spec.ts` | Passed with a process-local Git `safe.directory` setting: 4 files, 70 tests. The package still warned that Node `v22.23.2` does not satisfy required Node `24.x`. |
| Nuxt typecheck | `pnpm typecheck` | Passed (exit code 0), with the same unsupported-Node warning. |
| Local backend gate | `pnpm verify:backend:local` | Blocked before database tests: required Node is `24.x`, environment is Node `v22.23.2`; `supabase db reset --local` then failed when the CLI could not write its telemetry temporary file (`EPERM`). Local Supabase/Postgres verification did not run. |
| Browser gate | `pnpm test:e2e` | Blocked: the configured web-server URL `http://127.0.0.1:4317` was already in use. No browser tests ran in this worktree invocation. The existing process was not stopped. |
| Cloud DEV preflight | `pnpm db:dev:status` | Blocked before target verification because this worktree has no `.env.local`. `db:dev:dry-run` and both advisor commands were not run because the prerequisite status gate did not complete. No Cloud mutation was attempted. |
| Documentation commit | `git add` / `git commit` | Not attempted by Task 12 constraint. Git index permission prevents staging/committing; no commit claim is made. |

Superseded release note: Node.js `v24.19.0` is now confirmed installed, and the approved database verification path is Cloud DEV only. The old local-Supabase blocker no longer applies.

#### Task 12 verification evidence — 2026-08-20 (current controller / canonical Cloud DEV)

| Gate | Command / check | Outcome |
| --- | --- | --- |
| Application gate | Node `v24.19.0`; `pnpm verify:app` | Passed on current HEAD after Tasks 10/11: 32 files / 225 unit tests, Nuxt typecheck, ESLint, and production build. The build emitted only a dependency deprecation warning. |
| Browser gate | `PLAYWRIGHT_PORT=4318 pnpm test:e2e` | Passed: 43/43 tests in approximately 2.5 minutes. |
| Cloud DEV non-mutating preflight | `pnpm db:dev:auth-check`, `db:dev:link`, `db:dev:status`, `db:dev:dry-run`, and both advisor commands | Passed on canonical ref `ykrurrumqlsxnqfqunjc`; no push, reset, or seed was run. This evidence predates the catalog migration; a new dry-run is required and should list five forward migrations with no seed/role data. |
| Security advisor baseline | Cloud DEV security advisor | Completed with seven existing pre-feature warnings: `public.is_company_member`, `public.is_tenant_member`, and `public.rls_auto_enable` executable by both `anon` and `authenticated` (six warnings), plus leaked-password protection disabled. Performance advisor reported no issues. Because feature migrations are pending, post-migration advisor regression is not proven. |
| Database release verification | Pending feature schema | Not run. No pgTAP, RLS, or concurrency test has executed against the five pending feature migrations; generated types, Cloud RLS smoke, and canonical-data checks also remain post-push work. |
| Task 12 static checks | Exact forbidden scans and placeholder scan, 2026-08-20 | Passed: no legacy company-role-array reads in `server`, `app`, or `shared`; no service-role references in `app` or `shared`; no Task 12 plan placeholders. |
| Catalog bootstrap readiness | Forward migration `20260820042507_bootstrap_vqh_employee_rbac_catalog.sql`; focused Cloud DEV/config units | Prepared but not applied: the migration is catalog-only (no identity, membership, employee, or assignment seed), canonical checks require 7 departments, 8 system roles, 34 permissions, 71 mappings, and an active normalized company admin. Cloud DEV dry-run/push remain separately authorized. |
| Targeted docs/config units | Five Cloud DEV/config test files, Node `v24.19.0`, 2026-08-20 | Passed: 47 tests in 5 files. |
| Documentation commit | Scoped root-session commit of the two Task 12 documentation files, 2026-08-20 | Git index write access was restored and verified. Only the runbook and this plan are included in the Task 12 commit; the SDD progress file and unrelated `debug.log` remain unstaged. |

The remaining deployment gate is separately authorized Cloud DEV migration application, followed by the mandatory no-Docker `db:dev:status`, `db:dev:types`, `db:dev:rls-smoke`, `db:dev:canonical-check`, and both advisor commands. `db:dev:test` is a separately recorded optional Docker/container-capable pgTAP check. Completion checklist items remain unchecked until the pending schema is applied and those database gates produce evidence.

---

## Completion Checklist

- [ ] Six approved VQH employees each have one Auth account, memberships, employee record, and active base role.
- [ ] Engineering and Design are separate departments in database, frontend config, fixtures, and UI.
- [ ] Như has four approved roles and cannot assign/revoke roles, disable accounts, or self-elevate.
- [ ] Adding/removing one responsibility changes authorization immediately without changing employee identity or JWT.
- [ ] Employee directory and HR-private fields have distinct projections and RLS boundaries.
- [ ] Cross-company reads and mutations are denied at both server and database layers.
- [ ] Role history and employee lifecycle events are auditable and not physically deleted.
- [ ] Final-admin and self-role-change invariants hold under concurrent database execution.
- [ ] Service-role credentials remain server-only.
- [ ] Database, unit, type, lint, build, E2E, accessibility, and cloud preflight gates pass.
