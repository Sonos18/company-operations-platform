begin;
select no_plan();

\set tenant_a_id '41000000-0000-4000-8000-000000000010'
\set company_a_id '41000000-0000-4000-8000-000000000020'
\set tenant_b_id '42000000-0000-4000-8000-000000000010'
\set company_b_id '42000000-0000-4000-8000-000000000020'
\set self_user_id '41000000-0000-4000-8000-000000000001'
\set other_user_id '41000000-0000-4000-8000-000000000002'
\set hr_user_id '41000000-0000-4000-8000-000000000003'
\set admin_user_id '41000000-0000-4000-8000-000000000004'
\set second_admin_user_id '41000000-0000-4000-8000-000000000005'
\set legacy_admin_user_id '41000000-0000-4000-8000-000000000006'
\set grant_target_user_id '41000000-0000-4000-8000-000000000007'
\set onboarding_user_id '41000000-0000-4000-8000-000000000008'
\set unrelated_admin_user_id '42000000-0000-4000-8000-000000000001'
\set self_employee_id '41000000-0000-4000-8000-000000000101'
\set other_employee_id '41000000-0000-4000-8000-000000000102'

select set_config('request.headers', '{"x-request-id":"41000000-0000-4000-8000-000000000999"}', true);

insert into auth.users (id, email) values
  (:'self_user_id'::uuid, 'employee@employee-rbac.invalid'),
  (:'other_user_id'::uuid, 'other@employee-rbac.invalid'),
  (:'hr_user_id'::uuid, 'hr@employee-rbac.invalid'),
  (:'admin_user_id'::uuid, 'admin@employee-rbac.invalid'),
  (:'second_admin_user_id'::uuid, 'second-admin@employee-rbac.invalid'),
  (:'legacy_admin_user_id'::uuid, 'legacy-admin@employee-rbac.invalid'),
  (:'grant_target_user_id'::uuid, 'grant-target@employee-rbac.invalid'),
  (:'onboarding_user_id'::uuid, 'onboarding@employee-rbac.invalid'),
  (:'unrelated_admin_user_id'::uuid, 'unrelated-admin@employee-rbac.invalid');

insert into public.tenants (id, code, name) values
  (:'tenant_a_id'::uuid, 'employee-rbac-a', 'Employee RBAC tenant A'),
  (:'tenant_b_id'::uuid, 'employee-rbac-b', 'Employee RBAC tenant B');

insert into public.companies (id, tenant_id, code, name) values
  (:'company_a_id'::uuid, :'tenant_a_id'::uuid, 'EMP-RBAC-A', 'Employee RBAC company A'),
  (:'company_b_id'::uuid, :'tenant_b_id'::uuid, 'EMP-RBAC-B', 'Employee RBAC company B');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  (:'self_user_id'::uuid, :'tenant_a_id'::uuid, array['tenant_admin']),
  (:'other_user_id'::uuid, :'tenant_a_id'::uuid, array['tenant_admin']),
  (:'hr_user_id'::uuid, :'tenant_a_id'::uuid, array['tenant_admin']),
  (:'admin_user_id'::uuid, :'tenant_a_id'::uuid, array['tenant_admin']),
  (:'second_admin_user_id'::uuid, :'tenant_a_id'::uuid, array['tenant_admin']),
  (:'legacy_admin_user_id'::uuid, :'tenant_a_id'::uuid, array['tenant_admin']),
  (:'grant_target_user_id'::uuid, :'tenant_a_id'::uuid, array['tenant_admin']),
  (:'unrelated_admin_user_id'::uuid, :'tenant_b_id'::uuid, array['tenant_admin']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  (:'self_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'other_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'hr_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'admin_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'second_admin_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'legacy_admin_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['company_admin']),
  (:'grant_target_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'unrelated_admin_user_id'::uuid, :'tenant_b_id'::uuid, :'company_b_id'::uuid, array['employee']);

insert into public.departments (id, tenant_id, company_id, code, name) values
  ('41000000-0000-4000-8000-000000000201', :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'HR', 'Human Resources'),
  ('42000000-0000-4000-8000-000000000201', :'tenant_b_id'::uuid, :'company_b_id'::uuid, 'HR', 'Human Resources');

insert into public.positions (id, tenant_id, company_id, code, name) values
  ('41000000-0000-4000-8000-000000000211', :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'HR-ASSISTANT', 'HR Assistant');

insert into public.employees (id, tenant_id, company_id, user_id, employee_code, full_name, work_email, department_id, employment_status, created_by) values
  (:'self_employee_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, :'self_user_id'::uuid, 'EMP-SELF', 'Employee Self', 'employee@employee-rbac.invalid', '41000000-0000-4000-8000-000000000201', 'active', :'admin_user_id'::uuid),
  (:'other_employee_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, :'other_user_id'::uuid, 'EMP-OTHER', 'Employee Other', 'other@employee-rbac.invalid', '41000000-0000-4000-8000-000000000201', 'active', :'admin_user_id'::uuid);

insert into public.employee_private_details (employee_id, tenant_id, company_id, personal_email) values
  (:'self_employee_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'employee.personal@employee-rbac.invalid'),
  (:'other_employee_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'other.personal@employee-rbac.invalid');

insert into public.roles (id, tenant_id, company_id, code, name, description, is_privileged) values
  ('41000000-0000-4000-8000-000000000301', :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'employee', 'Employee', 'Directory and own private profile', false),
  ('41000000-0000-4000-8000-000000000302', :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'hr_manager', 'HR manager', 'Employee and private profile administration', false),
  ('41000000-0000-4000-8000-000000000303', :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'company_admin', 'Company admin', 'Company administration', true),
  ('42000000-0000-4000-8000-000000000301', :'tenant_b_id'::uuid, :'company_b_id'::uuid, 'company_admin', 'Company admin', 'Company administration', true);

insert into public.permissions (code, module, name, description) values
  ('employee.read_directory', 'employee', 'Read employee directory', 'Read company employee directory'),
  ('employee.read_self_private', 'employee', 'Read own private profile', 'Read own private employee details'),
  ('employee.read_private', 'employee', 'Read private profiles', 'Read private employee details'),
  ('employee.create', 'employee', 'Create employees', 'Onboard an employee'),
  ('role.assign', 'role', 'Assign company roles', 'Grant company role assignments'),
  ('role.revoke', 'role', 'Revoke company roles', 'Revoke company role assignments');

insert into public.role_permissions (role_id, permission_code) values
  ('41000000-0000-4000-8000-000000000301', 'employee.read_directory'),
  ('41000000-0000-4000-8000-000000000301', 'employee.read_self_private'),
  ('41000000-0000-4000-8000-000000000302', 'employee.read_directory'),
  ('41000000-0000-4000-8000-000000000302', 'employee.read_private'),
  ('41000000-0000-4000-8000-000000000303', 'employee.read_directory'),
  ('41000000-0000-4000-8000-000000000303', 'employee.read_private'),
  ('41000000-0000-4000-8000-000000000303', 'employee.create'),
  ('41000000-0000-4000-8000-000000000303', 'role.assign'),
  ('41000000-0000-4000-8000-000000000303', 'role.revoke'),
  ('42000000-0000-4000-8000-000000000301', 'employee.read_directory'),
  ('42000000-0000-4000-8000-000000000301', 'employee.read_private'),
  ('42000000-0000-4000-8000-000000000301', 'role.revoke');

insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
  (:'tenant_a_id'::uuid, :'company_a_id'::uuid, :'self_user_id'::uuid, '41000000-0000-4000-8000-000000000301', :'admin_user_id'::uuid, 'test employee role'),
  (:'tenant_a_id'::uuid, :'company_a_id'::uuid, :'other_user_id'::uuid, '41000000-0000-4000-8000-000000000301', :'admin_user_id'::uuid, 'test employee role'),
  (:'tenant_a_id'::uuid, :'company_a_id'::uuid, :'hr_user_id'::uuid, '41000000-0000-4000-8000-000000000302', :'admin_user_id'::uuid, 'test HR role'),
  (:'tenant_a_id'::uuid, :'company_a_id'::uuid, :'admin_user_id'::uuid, '41000000-0000-4000-8000-000000000303', :'admin_user_id'::uuid, 'test company admin role'),
  (:'tenant_a_id'::uuid, :'company_a_id'::uuid, :'second_admin_user_id'::uuid, '41000000-0000-4000-8000-000000000303', :'admin_user_id'::uuid, 'test second company admin role'),
  (:'tenant_a_id'::uuid, :'company_a_id'::uuid, :'legacy_admin_user_id'::uuid, '41000000-0000-4000-8000-000000000301', :'admin_user_id'::uuid, 'test normalized employee role'),
  (:'tenant_b_id'::uuid, :'company_b_id'::uuid, :'unrelated_admin_user_id'::uuid, '42000000-0000-4000-8000-000000000301', :'unrelated_admin_user_id'::uuid, 'test unrelated company admin role');

select id as second_admin_assignment_id
from public.company_role_assignments
where tenant_id = :'tenant_a_id'::uuid
  and company_id = :'company_a_id'::uuid
  and user_id = :'second_admin_user_id'::uuid
  and role_id = '41000000-0000-4000-8000-000000000303'::uuid
  and revoked_at is null
\gset

select id as other_employee_assignment_id
from public.company_role_assignments
where tenant_id = :'tenant_a_id'::uuid
  and company_id = :'company_a_id'::uuid
  and user_id = :'other_user_id'::uuid
  and role_id = '41000000-0000-4000-8000-000000000301'::uuid
  and revoked_at is null
\gset

select ok(
  not has_function_privilege('anon', 'private.has_company_permission(uuid, uuid, text)', 'execute'),
  'anonymous users cannot execute the private permission helper'
);
select ok(
  not has_function_privilege('anon', 'private.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date)', 'execute'),
  'anonymous users cannot execute the private onboarding implementation'
);
select ok(
  not has_function_privilege('authenticated', 'private.audit_employee_rbac_change()', 'execute'),
  'authenticated users cannot invoke the private audit trigger function directly'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  ),
  'the exposed public schema has no security-definer functions'
);
select ok(
  not has_column_privilege('authenticated', 'public.employees', 'user_id', 'select'),
  'account user IDs are not selectable through the employee directory table'
);
select ok(
  not has_table_privilege('authenticated', 'public.employees', 'insert'),
  'authenticated users cannot create employee rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.company_role_assignments', 'insert')
  and not has_table_privilege('authenticated', 'public.company_role_assignments', 'update')
  and not has_table_privilege('authenticated', 'public.company_role_assignments', 'delete'),
  'authenticated users have no direct assignment write privilege'
);
select ok(
  not has_table_privilege('authenticated', 'public.role_permissions', 'insert')
  and not has_table_privilege('authenticated', 'public.role_permissions', 'update')
  and not has_table_privilege('authenticated', 'public.role_permissions', 'delete'),
  'authenticated users have no direct role-permission write privilege'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'insert')
  and not has_table_privilege('authenticated', 'public.audit_events', 'update')
  and not has_table_privilege('authenticated', 'public.audit_events', 'delete'),
  'authenticated users have no direct audit-event write privilege'
);

set local role anon;
select throws_ok(
  'select id from public.employees',
  '42501',
  'permission denied for table employees',
  'anonymous users have no employee-directory table privilege'
);
select throws_ok(
  'select employee_id from public.employee_private_details',
  '42501',
  'permission denied for table employee_private_details',
  'anonymous users have no private-detail table privilege'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'self_user_id'), true);
select is((select count(*) from public.employees where company_id = :'company_a_id'::uuid), 2::bigint, 'employee reads the company directory');
select throws_ok(
  'select user_id from public.employees',
  '42501',
  'permission denied for table employees',
  'employee directory queries cannot project account user IDs'
);
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
select is((select count(*) from public.employees where company_id = :'company_b_id'::uuid), 0::bigint, 'employee cannot read another company directory');

reset role;
update public.company_memberships
set is_active = false
where tenant_id = :'tenant_a_id'::uuid
  and company_id = :'company_a_id'::uuid
  and user_id = :'other_user_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'self_user_id'), true);
select is(
  (select count(*) from public.employees where company_id = :'company_a_id'::uuid),
  1::bigint,
  'directory excludes an employee whose same-company membership is inactive'
);

reset role;
update public.company_memberships
set is_active = true
where tenant_id = :'tenant_a_id'::uuid
  and company_id = :'company_a_id'::uuid
  and user_id = :'other_user_id'::uuid;
update public.company_role_assignments
set revoked_at = now(),
    revoked_by = :'admin_user_id'::uuid,
    revoke_reason = 'test target base employee role revoked'
where id = :'other_employee_assignment_id'::bigint;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'self_user_id'), true);
select is(
  (select count(*) from public.employees where company_id = :'company_a_id'::uuid),
  1::bigint,
  'directory excludes an employee without an active normalized base employee role'
);

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'hr_user_id'), true);
select is((select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid), 2::bigint, 'HR manager reads company private profiles');
select is((select count(*) from public.employee_private_details where company_id = :'company_b_id'::uuid), 0::bigint, 'HR manager cannot read another company private profiles');
select throws_ok(
  format(
    'select public.revoke_company_role_assignment(%s, %L)',
    :'second_admin_assignment_id'::bigint,
    'test HR role-revoke denial'
  ),
  'P0001',
  'PERMISSION_DENIED',
  'HR manager cannot invoke company role revocation'
);
select throws_ok(
  'update public.company_role_assignments set revoke_reason = ''test HR direct mutation denial'' where false',
  '42501',
  'permission denied for table company_role_assignments',
  'HR manager cannot mutate role assignments directly'
);
select throws_ok(
  format(
    'select public.grant_company_role_assignment(%L::uuid, %L::uuid, %L::uuid, %L)',
    :'company_a_id',
    :'grant_target_user_id',
    '41000000-0000-4000-8000-000000000301',
    'test HR grant denial'
  ),
  'P0001',
  'PERMISSION_DENIED',
  'HR manager cannot grant a company role'
);

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","app_metadata":{"company_roles":["company_admin"]},"company_roles":["company_admin"]}', :'legacy_admin_user_id'), true);
select is((select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid), 0::bigint, 'legacy company membership roles and stale JWT role claims cannot read private profiles');
select throws_ok(
  format(
    'select public.revoke_company_role_assignment(%s, %L)',
    :'second_admin_assignment_id'::bigint,
    'test legacy role-revoke denial'
  ),
  'P0001',
  'PERMISSION_DENIED',
  'legacy company membership roles and stale JWT role claims cannot revoke roles'
);

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'unrelated_admin_user_id'), true);
select is((select count(*) from public.employees where company_id = :'company_a_id'::uuid), 0::bigint, 'unrelated-company admin cannot read the target company directory');
select is((select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid), 0::bigint, 'unrelated-company admin cannot read target company private profiles');

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'admin_user_id'), true);
select is(
  (
    select (public.grant_company_role_assignment(
      :'company_a_id'::uuid,
      :'grant_target_user_id'::uuid,
      '41000000-0000-4000-8000-000000000301'::uuid,
      'test safe employee grant'
    )).user_id
  ),
  :'grant_target_user_id'::uuid,
  'company admin grants a role without caller-supplied tenant or actor data'
);
select throws_ok(
  format(
    'select public.grant_company_role_assignment(%L::uuid, %L::uuid, %L::uuid, %L)',
    :'company_a_id',
    :'admin_user_id',
    '41000000-0000-4000-8000-000000000301',
    'test self grant denial'
  ),
  'P0001',
  'SELF_ROLE_CHANGE_FORBIDDEN',
  'company admins cannot grant themselves a role'
);
select is(
  public.complete_employee_onboarding(
    :'company_a_id'::uuid,
    :'onboarding_user_id'::uuid,
    'EMP-ONBOARDING',
    'Onboarding Employee',
    'onboarding@employee-rbac.invalid',
    '41000000-0000-4000-8000-000000000201'::uuid,
    '41000000-0000-4000-8000-000000000211'::uuid,
    '2026-08-18'::date
  ),
  (
    select id
    from public.employees
    where company_id = :'company_a_id'::uuid
      and employee_code = 'EMP-ONBOARDING'
  ),
  'onboarding atomically returns the account-linked employee record'
);
select is(
  public.complete_employee_onboarding(
    :'company_a_id'::uuid,
    :'onboarding_user_id'::uuid,
    'EMP-ONBOARDING',
    'Onboarding Employee',
    'onboarding@employee-rbac.invalid',
    '41000000-0000-4000-8000-000000000201'::uuid,
    '41000000-0000-4000-8000-000000000211'::uuid,
    '2026-08-18'::date
  ),
  (
    select id
    from public.employees
    where company_id = :'company_a_id'::uuid
      and employee_code = 'EMP-ONBOARDING'
  ),
  'repeating matching onboarding is idempotent'
);
select is(
  (
    select count(*)
    from public.company_role_assignments cra
    join public.roles r on r.id = cra.role_id
    where cra.company_id = :'company_a_id'::uuid
      and cra.user_id = :'onboarding_user_id'::uuid
      and r.code = 'employee'
      and cra.revoked_at is null
  ),
  1::bigint,
  'onboarding grants exactly one active base employee role'
);
select throws_ok(
  format(
    'select public.complete_employee_onboarding(%L::uuid, %L::uuid, %L, %L, %L, %L::uuid, %L::uuid, %L::date)',
    :'company_a_id',
    :'onboarding_user_id',
    'EMP-ONBOARDING',
    'Onboarding Employee',
    'different@employee-rbac.invalid',
    '41000000-0000-4000-8000-000000000201',
    '41000000-0000-4000-8000-000000000211',
    '2026-08-18'
  ),
  'P0001',
  'EMPLOYEE_EMAIL_CONFLICT',
  'onboarding rejects an immutable work-email mismatch'
);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'onboarding_user_id'), true);
select is(
  (select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid),
  1::bigint,
  'a position assignment does not grant access to other private employee profiles'
);

reset role;
select ok(
  exists (
    select 1
    from public.audit_events
    where tenant_id = :'tenant_a_id'::uuid
      and company_id = :'company_a_id'::uuid
      and actor_id = :'admin_user_id'::uuid
      and action = 'role.granted'
      and resource_type = 'company_role_assignment'
      and request_id = '41000000-0000-4000-8000-000000000999'::uuid
      and after_summary ? 'role_id'
  ),
  'role grants create scoped, attributed, request-correlated audit events'
);
update public.company_memberships
set is_active = false
where tenant_id = :'tenant_a_id'::uuid
  and company_id = :'company_a_id'::uuid
  and user_id = :'self_user_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'self_user_id'), true);
select is((select count(*) from public.employees where company_id = :'company_a_id'::uuid), 0::bigint, 'inactive company membership immediately loses directory access');
select is((select count(*) from public.employee_private_details where employee_id = :'self_employee_id'), 0::bigint, 'inactive company membership immediately loses private-profile access');

reset role;
update public.company_role_assignments
set revoked_at = now(), revoked_by = :'admin_user_id'::uuid, revoke_reason = 'test immediate permission loss'
where tenant_id = :'tenant_a_id'::uuid
  and company_id = :'company_a_id'::uuid
  and user_id = :'hr_user_id'::uuid
  and revoked_at is null;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'hr_user_id'), true);
select is((select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid), 0::bigint, 'revoking an HR role takes effect on the next request');

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'admin_user_id'), true);
select is(
  (
    select (public.revoke_company_role_assignment(
      :'second_admin_assignment_id'::bigint,
      'test second company admin revocation'
    )).revoked_at is not null
  ),
  true,
  'company admin can revoke a second active company admin'
);
select is(
  (select count(*) from public.company_role_assignments where tenant_id = :'tenant_a_id'::uuid and company_id = :'company_a_id'::uuid and role_id = '41000000-0000-4000-8000-000000000303'::uuid and revoked_at is null),
  1::bigint,
  'revoking a second company admin leaves one active company admin'
);
reset role;
select throws_ok(
  format(
    'update public.company_role_assignments set revoked_at = now(), revoked_by = %L::uuid, revoke_reason = %L where id = %s',
    :'admin_user_id',
    'test direct final admin protection',
    (select id from public.company_role_assignments where tenant_id = :'tenant_a_id'::uuid and company_id = :'company_a_id'::uuid and user_id = :'admin_user_id'::uuid and role_id = '41000000-0000-4000-8000-000000000303'::uuid and revoked_at is null)
  ),
  'P0001',
  'LAST_COMPANY_ADMIN_REQUIRED',
  'database prevents privileged direct revocation of the final company admin'
);
select throws_ok(
  'update public.roles set is_active = false where id = ''41000000-0000-4000-8000-000000000303''::uuid',
  'P0001',
  'LAST_COMPANY_ADMIN_REQUIRED',
  'database prevents privileged deactivation of the final company-admin role'
);
select throws_ok(
  'update public.roles set code = ''retired_company_admin'' where id = ''41000000-0000-4000-8000-000000000303''::uuid',
  'P0001',
  'LAST_COMPANY_ADMIN_REQUIRED',
  'database prevents privileged code changes that remove the final company-admin role'
);
select throws_ok(
  'delete from public.roles where id = ''41000000-0000-4000-8000-000000000303''::uuid',
  'P0001',
  'LAST_COMPANY_ADMIN_REQUIRED',
  'database prevents privileged deletion of the final company-admin role'
);
select throws_ok(
  'update public.roles set is_active = false where id = ''41000000-0000-4000-8000-000000000301''::uuid',
  'P0001',
  'SYSTEM_ROLE_LIFECYCLE_FORBIDDEN',
  'database prevents privileged lifecycle changes to assigned system roles'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'admin_user_id'), true);
select throws_ok(
  format(
    'select public.revoke_company_role_assignment(%s, %L)',
    (select id from public.company_role_assignments where tenant_id = :'tenant_a_id'::uuid and company_id = :'company_a_id'::uuid and user_id = :'admin_user_id'::uuid and role_id = '41000000-0000-4000-8000-000000000303'::uuid and revoked_at is null),
    'test self role change protection'
  ),
  'P0001',
  'SELF_ROLE_CHANGE_FORBIDDEN',
  'final company admin cannot change their own roles'
);

reset role;
select set_config('request.headers', '', true);
insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason)
values (
  :'tenant_a_id'::uuid,
  :'company_a_id'::uuid,
  :'grant_target_user_id'::uuid,
  '41000000-0000-4000-8000-000000000302'::uuid,
  :'admin_user_id'::uuid,
  'test audit fallback request identifier'
);
select ok(
  exists (
    select 1
    from public.audit_events
    where tenant_id = :'tenant_a_id'::uuid
      and company_id = :'company_a_id'::uuid
      and action = 'role.granted'
      and resource_id = (
        select id::text
        from public.company_role_assignments
        where tenant_id = :'tenant_a_id'::uuid
          and company_id = :'company_a_id'::uuid
          and user_id = :'grant_target_user_id'::uuid
          and role_id = '41000000-0000-4000-8000-000000000302'::uuid
          and revoked_at is null
      )
      and request_id is not null
  ),
  'audit triggers safely generate a request ID when no request header is present'
);
select ok(
  not exists (
    select 1
    from public.audit_events
    where coalesce(before_summary, '{}'::jsonb) ?| array[
      'personal_email', 'personal_phone', 'current_address', 'permanent_address',
      'tax_code', 'social_insurance_number', 'emergency_contact_name', 'emergency_contact_phone'
    ]
       or coalesce(after_summary, '{}'::jsonb) ?| array[
      'personal_email', 'personal_phone', 'current_address', 'permanent_address',
      'tax_code', 'social_insurance_number', 'emergency_contact_name', 'emergency_contact_phone'
    ]
  ),
  'audit summaries redact employee private-detail fields'
);
select ok(
  not exists (
    select 1
    from public.audit_events
    where coalesce(before_summary, '{}'::jsonb) ? 'full_name'
       or coalesce(after_summary, '{}'::jsonb) ? 'full_name'
  ),
  'audit summaries redact employee full names'
);
select throws_ok(
  format('delete from public.company_role_assignments where id = %s', :'other_employee_assignment_id'::bigint),
  'P0001',
  'ROLE_ASSIGNMENT_HISTORY_REQUIRED',
  'privileged callers cannot hard-delete role-assignment history'
);
insert into public.roles (id, tenant_id, company_id, code, name, description, is_system, is_privileged)
values (
  '41000000-0000-4000-8000-000000000304'::uuid,
  :'tenant_a_id'::uuid,
  :'company_a_id'::uuid,
  'audit_catalog_role',
  'Audit catalog role',
  'audit catalog mutation fixture',
  false,
  false
);
insert into public.role_permissions (role_id, permission_code)
values ('41000000-0000-4000-8000-000000000304'::uuid, 'employee.read_directory');
update public.roles
set description = 'audit catalog mutation fixture updated'
where id = '41000000-0000-4000-8000-000000000304'::uuid;
update public.role_permissions
set permission_code = 'employee.read_self_private'
where role_id = '41000000-0000-4000-8000-000000000304'::uuid
  and permission_code = 'employee.read_directory';
delete from public.role_permissions
where role_id = '41000000-0000-4000-8000-000000000304'::uuid
  and permission_code = 'employee.read_self_private';
delete from public.roles
where id = '41000000-0000-4000-8000-000000000304'::uuid;
select ok(
  exists (
    select 1
    from public.audit_events
    where resource_type = 'role'
      and action in ('role.catalog_created', 'role.catalog_updated', 'role.catalog_deleted')
    group by resource_type
    having count(distinct action) = 3
  )
  and exists (
    select 1
    from public.audit_events
    where resource_type = 'role_permission'
      and action in ('role_permission.created', 'role_permission.updated', 'role_permission.deleted')
    group by resource_type
    having count(distinct action) = 3
  ),
  'privileged direct role and role-permission catalog mutations are audited'
);
select ok(
  not exists (
    select 1
    from public.audit_events
    where resource_type in ('role', 'role_permission')
      and (
        coalesce(before_summary, '{}'::jsonb) ?| array['name', 'description']
        or coalesce(after_summary, '{}'::jsonb) ?| array['name', 'description']
      )
  ),
  'role and role-permission audit summaries contain only non-sensitive catalog fields'
);
select throws_ok(
  'update public.audit_events set action = ''tampered'' where id = (select min(id) from public.audit_events)',
  'P0001',
  'AUDIT_EVENTS_APPEND_ONLY',
  'audit triggers prevent even privileged direct audit-event mutation'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'admin_user_id'), true);
select throws_ok(
  'update public.audit_events set action = ''tampered'' where false',
  '42501',
  'permission denied for table audit_events',
  'audit events are append-only to authenticated callers'
);

select * from finish();
rollback;
