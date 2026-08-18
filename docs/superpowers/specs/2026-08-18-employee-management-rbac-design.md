# Employee Management and Normalized RBAC Design

**Status:** Approved in design review on 2026-08-18

**Scope:** VQH employee directory, HR-private data, account onboarding, company-scoped RBAC, initial departments and development accounts

**Application:** Taskovia / Company Operations Platform

## 1. Context

The backend already uses Supabase Auth, `tenant_memberships`, `company_memberships`, PostgreSQL RLS, server-derived company context, and append-oriented audit events. Company roles are currently stored as unconstrained `text[]` values on membership rows. This supports basic reads but does not provide a role catalog, permission mapping, grant boundaries, revocation history, or action-level authorization.

VQH needs an employee-management module in which every displayed employee has an account and one or more system roles. An employee may temporarily cover several responsibilities. Như, for example, belongs to Human Resources while also sourcing suppliers and auditing inventory. Those responsibilities must later be transferable to new hires without replacing Như's employee record or login account.

## 2. Goals

- Store company-scoped employee profiles with department, position, date of birth, hire date, employment status, manager, and useful contact information.
- Keep organizational facts separate from authorization: department and position never grant permissions automatically.
- Link every visible employee one-to-one with a Supabase Auth account and a VQH company membership.
- Replace company-level free-form role arrays with normalized roles, permissions, role-permission mappings, and auditable role assignments.
- Let one account hold multiple active roles and support immediate, auditable role revocation.
- Split the existing combined Design–Engineering department into independent Engineering and Design departments.
- Let Như manage employee profiles and invite accounts without allowing self-elevation or privileged-role assignment.
- Preserve tenant/company isolation through PostgreSQL RLS and server-derived scope.
- Seed the six requested development accounts and their approved department/role assignments.

## 3. Non-goals

- Payroll, salary history, bank accounts, attendance, leave, recruitment pipelines, performance reviews, and employment-contract document storage are outside this phase.
- Custom per-user permission overrides and explicit deny rules are not included. Access is the union of active role permissions.
- Departments and positions do not become project teams or task assignment groups in this phase.
- Production passwords are never generated, stored, or committed. Production users receive Supabase Auth invitations at real company email addresses.
- Tenant-level RBAC is not normalized in this phase. `tenant_memberships.roles` remains the tenant administration boundary; normalized RBAC becomes canonical for company-level permissions.

## 4. Approved architectural decisions

### 4.1 Identity, employment, and authorization are distinct

- `auth.users` owns login identity and session lifecycle.
- `company_memberships` proves that an Auth user belongs to a company.
- `employees` owns the employment and organizational record.
- `departments` and `positions` describe where a person sits in the organization.
- `roles` bundle business responsibilities.
- `permissions` describe individual authorized actions.
- `company_role_assignments` records which user currently holds which company role and who granted or revoked it.

Moving an employee between departments or changing a job title does not implicitly add or remove permissions. Role changes are explicit operations with their own authorization and audit trail.

### 4.2 Company RBAC is normalized

The approved approach replaces `company_memberships.roles text[]` as the company authorization source with normalized tables. Existing arrays remain only during an expand–migrate–contract transition and must not remain a second source of truth.

Permissions are resolved from active database assignments for each protected request. Company roles are not embedded in user-editable metadata, and authorization does not depend on JWT role claims that can remain stale after a role is revoked.

### 4.3 HR-private data is isolated

Directory and organizational fields live in `employees`. Personal and legally sensitive fields live in `employee_private_details`. This avoids relying on column-level grants or a server allowlist to protect private fields when RLS/Data API access is involved.

Company members may read the employee directory. Private details are readable only by the employee themself, `hr_manager`, and `company_admin`. Only `hr_manager` and `company_admin` can mutate private details in this phase.

## 5. Data model

All identifiers use lowercase snake_case. Every new table in `public` has RLS enabled, explicit grants, timestamps with `timestamptz`, and indexes on foreign keys and RLS predicates. Company-scoped tables carry `tenant_id` and `company_id` and use composite foreign keys so a row cannot reference another tenant's company, department, position, role, employee, or membership.

### 5.1 `departments`

Purpose: canonical company organization units.

Fields:

- `id uuid primary key`
- `tenant_id uuid not null`
- `company_id uuid not null`
- `code text not null`
- `name text not null`
- `description text null`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- Composite FK `(company_id, tenant_id)` to `companies(id, tenant_id)`.
- Unique `(company_id, code)`.
- Unique `(id, tenant_id, company_id)` for same-scope composite references.
- Index `(tenant_id, company_id, is_active, name)` for scoped directory reads.

VQH department catalog:

| Code | Name |
|---|---|
| `BLD` | Ban lãnh đạo |
| `HR` | Phòng Nhân sự |
| `TECH` | Phòng Kỹ thuật |
| `DESIGN` | Phòng Thiết kế |
| `CONSTRUCTION` | Thi công – Hiện trường |
| `PROCUREMENT` | Vật tư – Mua hàng |
| `ACCOUNTING` | Phòng Kế toán |

The old `TKE` / “Thiết kế – Kỹ thuật” entry is replaced by the independent `TECH` and `DESIGN` departments. Existing prototype configuration and fixtures must be migrated to these canonical codes.

### 5.2 `positions`

Purpose: company job-title catalog, independent of permissions.

Fields:

- `id uuid primary key`
- `tenant_id uuid not null`
- `company_id uuid not null`
- `code text not null`
- `name text not null`
- `level smallint null` with a positive-value check when present
- `description text null`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes mirror `departments`, including unique `(company_id, code)` and unique `(id, tenant_id, company_id)`. Position is nullable on an employee until HR supplies an approved title.

### 5.3 `employees`

Purpose: non-sensitive employee directory and employment state.

Fields:

- `id uuid primary key`
- `tenant_id uuid not null`
- `company_id uuid not null`
- `user_id uuid not null references auth.users(id) on delete restrict`
- `employee_code text not null`
- `full_name text not null`
- `work_email text not null`
- `department_id uuid not null`
- `position_id uuid null`
- `manager_employee_id uuid null`
- `hire_date date null`
- `probation_end_date date null`
- `employment_status text not null` constrained to `probation`, `active`, `on_leave`, or `terminated`
- `created_by uuid not null references auth.users(id) on delete restrict`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- Composite FKs to company, department, position, and manager within the same tenant/company.
- Unique `(company_id, user_id)` so one account has one employee record per company.
- Unique `(company_id, employee_code)`.
- Unique expression index `(company_id, lower(work_email))` so email matching is case-insensitive within a company.
- Unique `(id, tenant_id, company_id)` for same-scope references.
- Index `(tenant_id, company_id, employment_status, full_name)` for the employee list.
- Indexes on `department_id`, `position_id`, `manager_employee_id`, and `user_id`.
- `probation_end_date >= hire_date` when both are present.
- `manager_employee_id <> id`.

An Auth user is never hard-deleted during normal offboarding. Offboarding terminates employment, revokes active company roles, removes normal company access, and disables the Auth account through the isolated administrative path while retaining the employee and audit history.

### 5.4 `employee_private_details`

Purpose: sensitive personal information separated from the directory.

Fields:

- `employee_id uuid primary key`
- `tenant_id uuid not null`
- `company_id uuid not null`
- `date_of_birth date null`
- `gender text null` constrained to `female`, `male`, `other`, or `undisclosed`
- `personal_email text null`
- `personal_phone text null`
- `current_address text null`
- `permanent_address text null`
- `tax_code text null`
- `social_insurance_number text null`
- `emergency_contact_name text null`
- `emergency_contact_phone text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

The employee FK includes tenant/company scope and cascades only when the employee record itself is deliberately removed by a privileged maintenance operation. Tax and social-insurance values are unique per company when non-null through partial unique indexes. This phase does not store salary, bank, national-ID scans, or contract files.

### 5.5 `roles`

Purpose: company-scoped bundles of business responsibility.

Fields:

- `id uuid primary key`
- `tenant_id uuid not null`
- `company_id uuid not null`
- `code text not null`
- `name text not null`
- `description text not null`
- `is_privileged boolean not null default false`
- `is_system boolean not null default true`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints include unique `(company_id, code)` and unique `(id, tenant_id, company_id)`. System roles cannot be deleted; they may be deactivated only after no active assignments depend on them.

Approved initial company roles:

- `employee`
- `hr_manager`
- `supplier_sourcing`
- `inventory_auditor`
- `technical_staff`
- `designer`
- `accountant`
- `company_admin` (`is_privileged = true`)

### 5.6 `permissions`

Purpose: global catalog of atomic actions. Permission codes are stable application contracts.

Fields:

- `code text primary key`
- `module text not null`
- `name text not null`
- `description text not null`
- `created_at timestamptz not null default now()`

Initial permission families:

- Employee directory: `employee.read_directory`, `employee.read_self_private`, `employee.read_all`, `employee.read_private`, `employee.create`, `employee.update`, `employee.offboard`.
- Accounts: `account.invite`, `account.disable`.
- RBAC: `role.read`, `role.assign`, `role.revoke`.
- Suppliers: `supplier.read`, `supplier.create`, `supplier.update`, `quotation_request.create`, `quotation_request.update`.
- Inventory: `inventory.read`, `stock_count.create`, `stock_count.update`, `stock_adjustment.read`, `stock_adjustment.approve`.
- Technical work: `technical_document.read`, `technical_document.update`.
- Design work: `drawing.read`, `drawing.create`, `drawing.update`.
- Accounting: `accounting_document.read`, `accounting_document.update`, `supplier_payment.approve`, `inventory_value.read`.
- Shared work: `project.read`, `task.read_assigned`, `task.update_assigned`.

There is no wildcard permission at runtime. `company_admin` receives the explicit approved permission set so additions remain reviewable.

### 5.7 `role_permissions`

Purpose: many-to-many mapping from company role to stable permission code.

Fields:

- `role_id uuid not null`
- `permission_code text not null`
- `created_at timestamptz not null default now()`
- Primary key `(role_id, permission_code)`.

The role FK is company-scoped through the parent role. Only `company_admin` may change mappings; initial system-role mappings are migration-controlled and normal application routes do not edit them in this phase.

### 5.8 `company_role_assignments`

Purpose: auditable role grant and revocation history.

Fields:

- `id bigint generated always as identity primary key`
- `tenant_id uuid not null`
- `company_id uuid not null`
- `user_id uuid not null`
- `role_id uuid not null`
- `granted_by uuid not null references auth.users(id) on delete restrict`
- `granted_at timestamptz not null default now()`
- `grant_reason text not null`
- `revoked_by uuid null references auth.users(id) on delete restrict`
- `revoked_at timestamptz null`
- `revoke_reason text null`

Constraints and indexes:

- Composite FK to `company_memberships(user_id, company_id)` and same-scope role.
- Partial unique index `(company_id, user_id, role_id) where revoked_at is null`.
- Check that revocation fields are either both null or both present and `revoked_at >= granted_at`.
- Index `(tenant_id, company_id, user_id, revoked_at)` for permission resolution.
- Index `(role_id, revoked_at)` for role administration.

Assignments are never hard-deleted through the application. Revocation updates the active row, preserves history, and takes effect on the next request.

## 6. Approved role matrix

### `employee`

- Read the company employee directory.
- Read the employee's own private details.
- Read/update tasks assigned to the employee.
- Read projects needed for assigned work.

### `hr_manager`

- Read all employee directory and private-detail fields.
- Create and update employee records.
- Invite an Auth account as part of onboarding.
- Read the role catalog and active assignments.
- Cannot assign or revoke roles, disable accounts, approve payments, approve stock adjustments, or edit audit events.

### `supplier_sourcing`

- Read/create/update suppliers and quotation requests.
- Read inventory context needed for sourcing.
- Cannot approve supplier payments.

### `inventory_auditor`

- Read inventory and stock-adjustment history.
- Create/update stock counts.
- Cannot approve stock adjustments.

### `technical_staff`

- Read projects and assigned tasks.
- Read/update technical documents.

### `designer`

- Read projects and assigned tasks.
- Read/create/update design drawings.

### `accountant`

- Read/update accounting documents.
- Read supplier documents and inventory value.
- Payment approval is granted only if the explicitly mapped accounting permission is approved for the role; the initial seed does not give Như this role.

### `company_admin`

- Receives the complete explicit company permission set.
- Assigns and revokes company roles.
- Disables accounts and performs offboarding.
- Cannot revoke the last active `company_admin` assignment in the company.

## 7. Initial VQH development data

Local development accounts use deterministic UUIDs and `@vqh.local` emails. They are never promoted to production. Production onboarding uses real email invitations and does not use committed passwords.

| Employee | Employee code | Local email | Department | Active roles |
|---|---|---|---|---|
| Như | `VQH-NHU` | `nhu@vqh.local` | Phòng Nhân sự | `employee`, `hr_manager`, `supplier_sourcing`, `inventory_auditor` |
| Long | `VQH-LONG` | `long@vqh.local` | Phòng Kỹ thuật | `employee`, `technical_staff` |
| Hiếu | `VQH-HIEU` | `hieu@vqh.local` | Phòng Kỹ thuật | `employee`, `technical_staff` |
| Y | `VQH-Y` | `y@vqh.local` | Phòng Kế toán | `employee`, `accountant` |
| Nhi | `VQH-NHI` | `nhi@vqh.local` | Phòng Thiết kế | `employee`, `designer` |
| Hậu | `VQH-HAU` | `hau@vqh.local` | Phòng Thiết kế | `employee`, `designer` |

Only the names, local emails, departments, and approved roles are known. `position_id`, `hire_date`, `probation_end_date`, and private-detail fields are seeded as null rather than inventing personal or employment data. The employee list must visibly mark incomplete HR profiles so Như can complete them later.

Existing VQH owner/admin fixtures remain and receive the normalized `company_admin` role during backfill. The isolation tenant keeps a separate employee/admin fixture for RLS tests.

## 8. Authorization and RLS

### 8.1 Request scope

Protected requests follow this order:

1. Verify the bearer access token using Supabase Auth.
2. Accept `companyId` as a route selector only.
3. Resolve `tenantId` from the authenticated user's company membership; never trust a client-supplied tenant ID.
4. Resolve required permissions from active role assignments in the database.
5. Execute data access with the user's JWT so PostgreSQL RLS remains active.
6. Write an audit event for every successful sensitive mutation and every role/account lifecycle change.

UI visibility is a convenience and never the authorization boundary. Server permission checks and database RLS enforce access even if a client calls the API or Data API directly.

### 8.2 RLS rules

- `departments`, `positions`, `roles`, and the non-sensitive `employees` directory are selectable by active company members within their tenant/company.
- `employee_private_details` is selectable by the matching employee, `hr_manager`, or `company_admin` in the same company.
- Employee and private-detail inserts/updates require `employee.create` or `employee.update` in the same company.
- `company_role_assignments` is readable by the assigned user, `hr_manager`, and `company_admin`; mutation requires `role.assign` or `role.revoke` and therefore initial `company_admin` authority. Ordinary members can see names, departments, and positions in the directory but not another employee's account/role details.
- Permission and role lookups use indexed company/user predicates and stable helper functions in a non-exposed private schema. Helpers always incorporate `(select auth.uid())` and do not trust function parameters as actor identity.
- New `public` tables revoke automatic `anon`/`authenticated` privileges first, grant only required operations, and enable RLS before exposure.
- RLS policies specify `to authenticated`, use both `using` and `with check` for updates, and wrap stable identity/helper calls in `select` where appropriate.

### 8.3 Grant safety

- An actor cannot grant or revoke any role for themself.
- Only a company admin may assign or revoke roles.
- The last active company admin cannot be revoked or offboarded until another active admin exists.
- A role from one company cannot be assigned to a membership in another company, even within the same tenant.
- Department and position changes do not alter role assignments.
- Permission resolution is database-backed per request or uses a short cache with explicit invalidation on role changes. JWT claims are not the source of current company permissions.

## 9. Account lifecycle

### 9.1 Production onboarding

1. Như submits the employee's name, company email, department, optional position, and optional hire date.
2. The server checks `employee.create` and `account.invite`, validates company scope, rate-limits the operation, and uses an idempotency key.
3. An isolated server-only Supabase Admin client sends the invitation. Its privileged credential never enters the browser or normal data request path.
4. After Auth returns the user ID, a database transaction creates the company membership, employee row, private-detail shell, and base `employee` role assignment.
5. A company admin assigns any additional business roles.
6. The employee becomes visible in the active directory only after the Auth user, membership, and employee row are linked.
7. The route writes audit records containing actor, company scope, employee/user identifiers, action, request ID, and redacted before/after summaries.

The onboarding operation may grant only the non-privileged base `employee` role as a fixed system effect. Như cannot choose an arbitrary role in the invitation request; every additional role still requires a separate company-admin grant.

If Auth succeeds but the database transaction fails, retry links the existing Auth user by normalized email rather than sending duplicate invitations. The partial state is not shown as an active employee and is surfaced to an admin recovery queue/log with the request ID.

### 9.2 Role transfer

To move inventory auditing from Như to a new employee:

1. Invite/onboard the new employee and establish base membership.
2. A company admin grants `inventory_auditor` to the new employee with a reason.
3. The admin revokes Như's active `inventory_auditor` assignment with a reason.
4. Như retains `employee`, `hr_manager`, and `supplier_sourcing`.
5. Both changes are audited; the old assignment row remains as history.
6. The next request sees the new permission set without waiting for a JWT refresh.

### 9.3 Offboarding

Offboarding is an audited administrative workflow: mark employment `terminated`, revoke all active business roles, remove normal company access, and disable Auth access through the isolated admin client. Hard deletion is not the normal workflow because it would destroy identity links needed by employee and audit history.

## 10. API design

All endpoints are authenticated and scoped under `/api/companies/:companyId`.

- `GET /employees`: paginated employee directory. All company members receive directory fields; only `hr_manager` and `company_admin` receive account linkage and active role summaries for every employee. Other users receive those details only for their own row.
- `GET /employees/:employeeId`: employee details; private fields are returned only when authorized.
- `POST /employee-invitations`: invite and create an employee/account atomically from the application's perspective.
- `PATCH /employees/:employeeId`: update authorized HR fields with an explicit field allowlist.
- `POST /employees/:employeeId/offboarding`: company-admin offboarding workflow.
- `GET /roles`: role catalog and permission summaries visible to authorized company members.
- `POST /role-assignments`: company-admin role grant.
- `DELETE /role-assignments/:assignmentId`: logical revocation; no hard delete.

Request bodies never accept `tenantId`, `actorId`, `grantedBy`, or `revokedBy`; the server derives these values from authenticated context. IDs for cross-tenant resources return the same not-found/forbidden shape as absent in-scope records and do not reveal resource existence.

## 11. Error handling

Routes use the existing stable API error envelope and request ID. New error codes:

- `PERMISSION_DENIED` — authenticated actor lacks the required permission.
- `EMPLOYEE_NOT_FOUND` — employee is absent or outside the current scope.
- `EMPLOYEE_ACCOUNT_REQUIRED` — an operation would expose an employee without a linked account.
- `EMPLOYEE_EMAIL_CONFLICT` — company email is already linked to another employee/account.
- `ACCOUNT_INVITE_FAILED` — Supabase invitation failed before database creation.
- `ONBOARDING_INCOMPLETE` — Auth exists but the scoped database transaction must be retried.
- `ROLE_ASSIGNMENT_CONFLICT` — the active assignment already exists or violates scope.
- `SELF_ROLE_CHANGE_FORBIDDEN` — actor attempted to grant/revoke their own role.
- `LAST_COMPANY_ADMIN_REQUIRED` — operation would remove the final active company admin.
- `EMPLOYEE_OFFBOARDING_FAILED` — offboarding could not complete safely.

Responses never include access tokens, service credentials, raw Supabase errors, sensitive private values, or full before/after private-detail payloads.

## 12. Audit requirements

The existing `audit_events` table remains the audit sink. Required actions include:

- `employee.created`
- `employee.updated`
- `employee.private_details_updated`
- `employee.invited`
- `employee.offboarded`
- `role.granted`
- `role.revoked`
- `account.disabled`

Before/after summaries contain changed field names and non-sensitive organizational values. Date of birth, addresses, personal contacts, tax code, social-insurance number, access tokens, invitation links, and credentials are redacted.

Authenticated clients receive no direct insert, update, or delete grant on `audit_events`. Employee, private-detail, and role-assignment mutations use database audit triggers so the business change and audit append share one transaction. Trigger functions derive the actor from `(select auth.uid())`, take tenant/company from the changed row, read the propagated request ID, use an empty search path with fully qualified objects, and cannot be invoked directly by public API roles. The isolated account-invitation/offboarding workflow records its lifecycle audit event as part of the database completion transaction after the Supabase Auth administrative action succeeds. Audit rows remain append-only.

## 13. Migration strategy

Use an expand–migrate–contract rollout:

1. Add HR and normalized RBAC tables, constraints, indexes, grants, RLS policies, helper functions, permission/role catalogs, and pgTAP coverage. While the legacy non-null company role array still exists, new memberships receive only the compatibility value `employee`; normalized assignments are authoritative and additional roles are never dual-written to the array.
2. Seed VQH departments, split `TKE` into `TECH` and `DESIGN`, and add approved accounts/employees/assignments locally.
3. Backfill the existing VQH owner/director company role into normalized roles and assignments.
4. Deploy services and session/company-context responses that read normalized active roles and permissions.
5. Stop application writes to `company_memberships.roles` and verify normalized authorization in local and cloud development.
6. Remove the deprecated company role array in a later contract migration after all consumers have switched. `tenant_memberships.roles` remains unchanged in this phase.

SQL migrations remain the schema source of truth. Generated `shared/types/database.types.ts` is regenerated after schema changes and never edited manually.

## 14. Testing and verification

### Database schema tests

- Every table, column, FK, unique/check constraint, partial unique index, and required helper exists.
- Every new exposed table has RLS enabled and explicit least-privilege grants.
- Every foreign key and RLS lookup column has a supporting index.
- Department/position/role references cannot cross tenant/company boundaries.
- One Auth user cannot have duplicate employee records in the same company.
- Only one active assignment exists for a user/role/company tuple.

### RLS and permission tests

- A VQH member cannot read or mutate any isolation-tenant employee, private detail, role, or assignment.
- A normal employee reads the directory and their own private details but not another employee's private details.
- Như can create/update employee records and invite accounts.
- Như cannot assign a role, revoke a role, disable an account, approve a payment, approve a stock adjustment, or modify audit events.
- A company admin can grant/revoke another user's role but cannot change their own roles or remove the last company admin.
- Revoking `inventory_auditor` removes the permission on the next request without a JWT refresh.

### Service tests

- Company context is always derived from membership and never from a client tenant ID.
- Permission resolution returns the union of active role permissions and ignores revoked assignments.
- Invitation retries are idempotent and recover an existing Auth user after a partial failure.
- Field allowlists prevent mass assignment of scope, actor, audit, or authorization fields.
- Stable error codes and request IDs are preserved.

### End-to-end tests

- The employee list shows Như, Long, Hiếu, Y, Nhi, and Hậu with account, department, and approved roles.
- Engineering and Design are shown as separate departments.
- Như can create an incomplete employee profile and send an invitation.
- A company admin transfers `inventory_auditor` from Như to a new employee; the UI and API reflect the change immediately.
- Unauthorized actions are hidden in the UI and rejected by the API/RLS when called directly.
- Audit entries exist for onboarding, profile edits, role grants/revocations, and offboarding.

### Release gates

- Local database reset, pgTAP, generated types, unit tests, typecheck, lint, build, and focused Playwright flows pass.
- Cloud-development migration dry-run, RLS smoke tests, canonical-data checks, and Supabase security/performance advisors pass.
- Static checks confirm no privileged Supabase credential appears in browser code or normal user data request paths.

## 15. Acceptance criteria

- Every employee shown in the module has a linked Supabase Auth user, company membership, department, and at least the base `employee` role.
- Như belongs to Human Resources and simultaneously holds the approved HR, supplier-sourcing, and inventory-auditing roles.
- Long and Hiếu belong to Engineering; Y belongs to Accounting; Nhi and Hậu belong to Design.
- Engineering and Design are independent canonical departments.
- Company roles and permissions are normalized; free-form company role arrays are no longer authoritative.
- Role transfer is explicit, auditable, scoped, and effective on the next request.
- HR-private data is protected separately from the employee directory.
- Cross-tenant reads and writes fail at the database layer.
- Như cannot self-elevate, grant privileged roles, disable accounts, or perform approval actions outside the approved matrix.
- No production password or privileged credential is stored in source control or exposed to the browser.
