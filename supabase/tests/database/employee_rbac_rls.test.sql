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
  (:'unrelated_admin_user_id'::uuid, :'tenant_b_id'::uuid, array['tenant_admin']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  (:'self_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'other_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'hr_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'admin_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'second_admin_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['employee']),
  (:'legacy_admin_user_id'::uuid, :'tenant_a_id'::uuid, :'company_a_id'::uuid, array['company_admin']),
  (:'unrelated_admin_user_id'::uuid, :'tenant_b_id'::uuid, :'company_b_id'::uuid, array['employee']);

insert into public.departments (id, tenant_id, company_id, code, name) values
  ('41000000-0000-4000-8000-000000000201', :'tenant_a_id'::uuid, :'company_a_id'::uuid, 'HR', 'Human Resources'),
  ('42000000-0000-4000-8000-000000000201', :'tenant_b_id'::uuid, :'company_b_id'::uuid, 'HR', 'Human Resources');

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
  ('role.revoke', 'role', 'Revoke company roles', 'Revoke company role assignments');

insert into public.role_permissions (role_id, permission_code) values
  ('41000000-0000-4000-8000-000000000301', 'employee.read_directory'),
  ('41000000-0000-4000-8000-000000000301', 'employee.read_self_private'),
  ('41000000-0000-4000-8000-000000000302', 'employee.read_directory'),
  ('41000000-0000-4000-8000-000000000302', 'employee.read_private'),
  ('41000000-0000-4000-8000-000000000303', 'employee.read_directory'),
  ('41000000-0000-4000-8000-000000000303', 'employee.read_private'),
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

set local role anon;
select is((select count(*) from public.employees), 0::bigint, 'anonymous cannot read the employee directory');
select is((select count(*) from public.employee_private_details), 0::bigint, 'anonymous cannot read private employee details');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'self_user_id'), true);
select is((select count(*) from public.employees where company_id = :'company_a_id'::uuid), 2::bigint, 'employee reads the company directory');
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

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'hr_user_id'), true);
select is((select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid), 2::bigint, 'HR manager reads company private profiles');
select is((select count(*) from public.employee_private_details where company_id = :'company_b_id'::uuid), 0::bigint, 'HR manager cannot read another company private profiles');
select throws_ok(
  format(
    'select public.revoke_company_role_assignment(%s, %L)',
    (select id from public.company_role_assignments where tenant_id = :'tenant_a_id'::uuid and company_id = :'company_a_id'::uuid and user_id = :'second_admin_user_id'::uuid and role_id = '41000000-0000-4000-8000-000000000303'::uuid and revoked_at is null),
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

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","app_metadata":{"company_roles":["company_admin"]},"company_roles":["company_admin"]}', :'legacy_admin_user_id'), true);
select is((select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid), 0::bigint, 'legacy company membership roles and stale JWT role claims cannot read private profiles');
select throws_ok(
  format(
    'select public.revoke_company_role_assignment(%s, %L)',
    (select id from public.company_role_assignments where tenant_id = :'tenant_a_id'::uuid and company_id = :'company_a_id'::uuid and user_id = :'second_admin_user_id'::uuid and role_id = '41000000-0000-4000-8000-000000000303'::uuid and revoked_at is null),
    'test legacy role-revoke denial'
  ),
  'P0001',
  'PERMISSION_DENIED',
  'legacy company membership roles and stale JWT role claims cannot revoke roles'
);

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'unrelated_admin_user_id'), true);
select is((select count(*) from public.employees where company_id = :'company_a_id'::uuid), 0::bigint, 'unrelated-company admin cannot read the target company directory');
select is((select count(*) from public.employee_private_details where company_id = :'company_a_id'::uuid), 0::bigint, 'unrelated-company admin cannot read target company private profiles');

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
      (select id from public.company_role_assignments where tenant_id = :'tenant_a_id'::uuid and company_id = :'company_a_id'::uuid and user_id = :'second_admin_user_id'::uuid and role_id = '41000000-0000-4000-8000-000000000303'::uuid and revoked_at is null),
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

select * from finish();
rollback;
