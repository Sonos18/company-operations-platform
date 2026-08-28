# Employee onboarding and normalized RBAC operations

This runbook operates the employee and normalized company-RBAC release in the Taskovia Supabase workflow. Taskovia is the application's sole Supabase database. It does not authorize a Cloud database push, reset, seed, or Production deployment. The local Supabase/Docker stack is not a release dependency.

## Runtime and CLI configuration

Set values only in deployment settings or ignored local files. Do not record a value in source control, this runbook, browser configuration, logs, or tickets.

| Variable | Scope | Use |
| --- | --- | --- |
| `NUXT_PUBLIC_SUPABASE_URL` | Public runtime | The sole Taskovia application database URL. |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | Public runtime | The sole Taskovia application database publishable/anon key. |
| `NUXT_SUPABASE_SERVICE_ROLE_KEY` | Server-only runtime | Maps to private `runtimeConfig.supabaseServiceRoleKey`; used only to construct the invitation/offboarding Supabase Admin client. |
| `SUPABASE_DEV_ACCESS_TOKEN` | Ignored `.supabase.dev.env.local`, CLI only | Dedicated Cloud DEV PAT for `pnpm db:dev:*`; it is not an application runtime variable. |

Copy `.env.example` to ignored `.env.local` and fill the three generic variables from Taskovia's Supabase API settings. Keep the server-only key outside `NUXT_PUBLIC_*`, `runtimeConfig.public`, client code, repository adapters, API responses, and logs. Configure the same variable names separately for Vercel Development, Preview, and Production scopes; changing Vercel scope does not require renaming or regenerating Supabase keys.

Copy `.supabase.dev.env.example` to ignored `.supabase.dev.env.local` for the Cloud DEV PAT. A Supabase Personal Access Token is a CLI credential, not an application or Vercel runtime variable. Supabase-managed JWT signing secrets/private keys are also not application environment variables for this architecture. The CLI runner validates the canonical Taskovia DEV project ref before every linked operation; do not use its link state for Production.

The current Supabase Data API requires explicit grants in addition to RLS. The feature migrations bundle their explicit grants and policies; do not assume that creating a `public` table exposes it to the Data API. [Supabase’s Data API guidance](https://supabase.com/docs/guides/api/securing-your-api) describes grants and RLS as separate controls.

## Local seed identities

The seed contains deterministic local identities only. There is no committed local-password convention: authentication credentials are intentionally not committed, and this runbook does not invent or repeat a password. Do not promote these emails, UUIDs, or test identities to Cloud DEV or Production.

| Employee | Code | Local email | Department | Active roles |
| --- | --- | --- | --- | --- |
| Như | `VQH-NHU` | `nhu@vqh.local` | HR | `employee`, `hr_manager`, `supplier_sourcing`, `inventory_auditor` |
| Long | `VQH-LONG` | `long@vqh.local` | TECH | `employee`, `technical_staff` |
| Hiếu | `VQH-HIEU` | `hieu@vqh.local` | TECH | `employee`, `technical_staff` |
| Y | `VQH-Y` | `y@vqh.local` | ACCOUNTING | `employee`, `accountant` |
| Nhi | `VQH-NHI` | `nhi@vqh.local` | DESIGN | `employee`, `designer` |
| Hậu | `VQH-HAU` | `hau@vqh.local` | DESIGN | `employee`, `designer` |

Unknown employment and private-detail values remain null. These identities establish local fixture scope only; they do not prove that a Production account exists.

## Production invitation and onboarding

1. Use an authenticated account with both `account.invite` and `employee.create` for `POST /api/companies/:companyId/employee-invitations`.
2. Supply employee code, full name, real work email, department ID, and optional position ID and hire date. The route derives actor, tenant, and company scope from the authenticated request; it accepts no caller-supplied actor or scope.
3. The server-only Admin client sends the Supabase Auth invitation. Do not create, choose, transmit, or store a password.
4. After Supabase Auth returns a user ID, the onboarding RPC links the tenant/company memberships, creates the employee and private-detail shell, and grants only the base `employee` role.
5. If Auth reports an existing account, the service resolves it by normalized email and retries the onboarding RPC. The email and employee code must agree with an existing employee record.
6. Treat `ONBOARDING_INCOMPLETE` as a partial operation: retain the error and request context, resolve the condition, then retry the same employee data. Do not send a duplicate invitation simply to repair database completion. Escalate `EMPLOYEE_EMAIL_CONFLICT` or `ACCOUNT_INVITE_FAILED` without disclosing provider errors or credentials.

The current feature does not implement invitation rate limiting or an idempotency-key request header. Operators must use the documented retry behavior rather than assuming either control exists. Additional business roles are a separate company-admin action; the invitation input has no role-selection field.

## Transfer `supplier_sourcing` or `inventory_auditor` from Như

Use a company-admin account. Như cannot assign or revoke roles, including her own.

1. Invite/onboard the replacement and confirm their account, membership, employee record, and base `employee` role are active.
2. Read `GET /api/companies/:companyId/roles` and identify the normalized role ID.
3. Grant the role with `POST /api/companies/:companyId/role-assignments`, providing the replacement `targetUserId`, role ID, and a non-empty operational `reason`.
4. Confirm the replacement's effective access on a new request. Authorization resolves active normalized assignments per request; do not wait for a JWT refresh or rely on `company_memberships.roles`.
5. Read `GET /api/companies/:companyId/role-assignments?targetUserId=:targetUserId` to obtain Như's active `assignmentId`, then logically revoke it with `DELETE /api/companies/:companyId/role-assignments/:assignmentId`, with a non-empty reason.
6. Confirm Như retains her other approved roles and inspect the `role.granted` and `role.revoked` audit rows through the restricted administrative process below.

Do not self-change roles. Do not revoke or offboard the final active `company_admin`; establish another active company admin first.

## Offboarding, retry, and reconciliation

1. An operator with both `employee.offboard` and `account.disable` posts a non-empty reason to `POST /api/companies/:companyId/employees/:employeeId/offboarding`. The actor cannot offboard themself.
2. The database operation locks the employee, logically revokes active role assignments, sets the employment status to `terminated` with termination metadata, and sets the company membership inactive. It retains employee, assignment, and audit history.
3. The server-only Admin client then disables the linked Supabase Auth user. Normal offboarding never hard-deletes the Auth identity, employee, assignments, or audit events.
4. If the response is `EMPLOYEE_OFFBOARDING_FAILED`, the database transition is durable but Auth disabling did not complete. The service attempts to record the idempotent `employee.offboarding_auth_disable_failed` audit action twice; that audit write can still fail and must be escalated with the original API failure.
5. After resolving the Auth/Admin condition, retry the same endpoint. A terminated employee returns its existing identity from the database operation, so the Auth-disable step can be retried.
6. Reconcile terminated status and termination metadata, inactive company membership, revoked assignments, Auth disabled state, and audit history. Keep the incident open until all agree.

Escalate with employee ID, company ID, API error code, and redacted audit metadata. Do not include private HR fields, tokens, invitation links, service-role keys, or raw provider errors.

## Audit inspection

There is no employee-audit API route, and the pending feature migration revokes `audit_events` access from normal `authenticated` application users without adding a selectable policy/grant for `hr_manager` or `company_admin`. Do not inspect audit history through the application/Data API or direct a normal authenticated user to query it.

Use an approved restricted administrative path, such as the Supabase Dashboard SQL Editor or a controlled database role, after verifying the target is the canonical Cloud DEV project. The approving operator is responsible for least privilege, access logging, and handling the output as sensitive. Filter by company ID, resource ID, action, and time range; retrieve only the audit fields needed for the incident.

```sql
select created_at, actor_id, action, resource_type, resource_id, request_id,
       before_summary, after_summary
from public.audit_events
where company_id = <company_uuid>
  and resource_id = <employee_or_assignment_id>
  and created_at >= <incident_start_timestamptz>
  and created_at < <incident_end_timestamptz>
  and action in (
    'employee.created',
    'employee.updated',
    'employee.status_changed',
    'employee.private_created',
    'employee.private_updated',
    'role.granted',
    'role.revoked',
    'employee.offboarding_auth_disable_failed'
  )
order by created_at desc;
```

The action names above are exact. For a completed offboarding, inspect `employee.status_changed` and `role.revoked`; `employee.offboarding_auth_disable_failed` exists only when Auth disabling failed. Audit summaries are redacted and are not a source for passwords, credentials, invitation links, or private-detail values.

## Compatibility role-array rollout

Use expand–migrate–contract:

1. Expand with normalized roles, permissions, active assignments, RLS, explicit Data API grants, and audit triggers.
2. Migrate/backfill while keeping only the compatibility `employee` value in `company_memberships.roles`; normalized role assignments are authoritative, and additional business roles are not dual-written to the array.
3. Deploy and verify every application, session, and company-context consumer reads normalized active roles and permissions.
4. Contract only after all deployed consumers prove normalized reads in Cloud DEV verification. Remove the deprecated company role array in a forward migration. `tenant_memberships.roles` is outside this scope.

Until the contract migration, `company_memberships.roles` is compatibility-only: it must not decide authorization or receive new business-role writes.

## Rollback

If this feature release must be rolled back, disable the new employee/RBAC routes and UI exposure first. Preserve the forward schema, Auth identities, employee records, normalized assignments, and audit history for reconciliation. Do not reverse migrations destructively, hard-delete lifecycle records, or restore legacy authorization reads from `company_memberships.roles`. Any remediation must be forward-only and retain normalized authorization as the company access boundary.

## Cloud DEV release procedure

### 1. Node 24 application and browser gates

Select Node.js 24.19.0 (for example, `nvm use 24.19.0`) and confirm `node --version` prints `v24.19.0`. Then run the application gate, using an unused Playwright port if the default is occupied:

```powershell
node --version
pnpm verify:app
$env:PLAYWRIGHT_PORT = '4318'
pnpm test:e2e
Remove-Item Env:PLAYWRIGHT_PORT
```

### 2. Non-mutating Cloud DEV preflight

The following commands are approved before a migration push. They must target only canonical Cloud DEV and do not seed, reset, or push the database:

```powershell
pnpm db:dev:auth-check
pnpm db:dev:link
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
```

Review the dry-run before seeking deployment authorization. The root controller reran the status/dry-run after commit `8ecaf19`: it succeeded with exactly these five forward migrations, `seeds=[]`, and CLI `roles=[]`. The empty CLI `roles` field is unrelated to the fifth migration's database role catalog; on a clean target that migration contains only reference data (7 departments, 8 roles, and a versioned contract of 34 permissions and 71 mappings), not Auth identities, employees, memberships, role assignments, or local fixture seed. This release does not support custom permission codes: future codes require a coordinated code, schema, and migration release.

1. `20260818033418_employee_management_rbac.sql`
2. `20260818074118_harden_employee_onboarding_permissions.sql`
3. `20260818075749_employee_offboarding_audit.sql`
4. `20260818121555_scoped_role_revoke_and_offboarding_lock.sql`
5. `20260820042507_bootstrap_vqh_employee_rbac_catalog.sql`

The security advisor reported seven existing warnings on the pre-feature remote: six executable-function warnings for `public.is_company_member`, `public.is_tenant_member`, and `public.rls_auto_enable` (each reported for `anon` and `authenticated`), plus disabled leaked-password protection. The performance advisor reported no issues. Because the feature migrations remain pending, this preflight cannot prove that a post-migration advisor regression is absent.

### 3. Post-push verification — separately authorized only

Do not run this section until an authorized reviewer approves the dry-run and explicitly authorizes `db:dev:push`. After authorization, push the migration:

```powershell
pnpm db:dev:push
```

### 3a. Bootstrap the authorized Cloud DEV administrator

An authorized operator opens `docs/development/sql/onboard-vqh-dev-admin.sql`, replaces the `replace-with-dev-admin@example.com` sentinel email, and runs it through the restricted Cloud DEV SQL Editor or a controlled role. This manual operation does not commit identity data. It creates the required active normalized `company_admin` assignment so that the subsequent RLS smoke check has an authorized principal.

Then run the post-push checks. The canonical check deliberately precedes the RLS smoke check:

```powershell
pnpm db:dev:status
pnpm db:dev:types
pnpm db:dev:canonical-check
pnpm db:dev:rls-smoke
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
```

This mandatory no-Docker post-push sequence intentionally excludes `db:dev:test`. Run `pnpm db:dev:test` separately only from a Docker/container-capable environment as the optional pgTAP check described in the Cloud DEV workflow. Do not claim database, RLS, generated-type, or post-migration advisor verification until the mandatory sequence completes successfully against the applied feature migrations; record optional pgTAP evidence separately when that environment is available.
