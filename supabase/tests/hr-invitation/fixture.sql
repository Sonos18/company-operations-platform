-- HR INVITATION FIXED OWNED FIXTURE
select pg_advisory_xact_lock(884104,0);
select set_config('request.jwt.claims','{}',true);
select set_config('request.headers', '{"x-request-id":"__RUN_ID__"}', true);
do $fixture$
begin
  if exists(select 1 from auth.users where id in (
    '8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000002','8b041004-0000-4000-8000-000000000001')
    or email in ('actor-a@hr-reissue.invalid','target@hr-reissue.invalid','actor-b@hr-reissue.invalid'))
    or exists(select 1 from public.tenants where id in ('8a041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000010')
      or code in ('hr-reissue-20261004-a','hr-reissue-20261004-b'))
    or exists(select 1 from public.companies where id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')
      or code in ('HR-REISSUE-A','HR-REISSUE-B'))
    or exists(select 1 from public.departments where id in ('8a041004-0000-4000-8000-000000000201','8a041004-0000-4000-8000-000000000202','8b041004-0000-4000-8000-000000000201'))
    or exists(select 1 from public.positions where id in ('8a041004-0000-4000-8000-000000000211','8a041004-0000-4000-8000-000000000212'))
    or exists(select 1 from public.roles where id in ('8a041004-0000-4000-8000-000000000301','8a041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000302'))
  then raise exception 'HR_FIXTURE_COLLISION'; end if;
  if (select count(*) from public.permissions where code in
    ('account.invite','employee.create','employee.update','employee.read_directory','employee.offboard','account.disable')) <> 6
  then raise exception 'HR_PERMISSION_CATALOG_INCOMPLETE'; end if;
end $fixture$;
insert into auth.users(id,email,raw_app_meta_data) values
 ('8a041004-0000-4000-8000-000000000001','actor-a@hr-reissue.invalid','{"hr_reissue_fixture_run":"__RUN_ID__"}'),
 ('8a041004-0000-4000-8000-000000000002','target@hr-reissue.invalid','{"hr_reissue_fixture_run":"__RUN_ID__"}'),
 ('8b041004-0000-4000-8000-000000000001','actor-b@hr-reissue.invalid','{"hr_reissue_fixture_run":"__RUN_ID__"}');
insert into public.tenants(id,code,name) values
 ('8a041004-0000-4000-8000-000000000010','hr-reissue-20261004-a','HR fixture __RUN_ID__'),
 ('8b041004-0000-4000-8000-000000000010','hr-reissue-20261004-b','HR fixture __RUN_ID__');
insert into public.companies(id,tenant_id,code,name) values
 ('8a041004-0000-4000-8000-000000000020','8a041004-0000-4000-8000-000000000010','HR-REISSUE-A','HR fixture __RUN_ID__'),
 ('8b041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000010','HR-REISSUE-B','HR fixture __RUN_ID__');
insert into public.departments(id,tenant_id,company_id,code,name) values
 ('8a041004-0000-4000-8000-000000000201','8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020','HR','Fixture HR'),
 ('8a041004-0000-4000-8000-000000000202','8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020','ALT','Fixture alternate'),
 ('8b041004-0000-4000-8000-000000000201','8b041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000020','HR','Fixture HR');
insert into public.positions(id,tenant_id,company_id,code,name) values
 ('8a041004-0000-4000-8000-000000000211','8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020','P1','Fixture position'),
 ('8a041004-0000-4000-8000-000000000212','8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020','P2','Fixture alternate');
insert into public.roles(id,tenant_id,company_id,code,name,description,is_privileged,is_system) values
 ('8a041004-0000-4000-8000-000000000301','8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020','employee','Fixture employee','HR fixture',false,false),
 ('8a041004-0000-4000-8000-000000000302','8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020','hr_fixture','Fixture operator','HR fixture',false,false),
 ('8b041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000020','hr_fixture','Fixture operator','HR fixture',false,false);
insert into public.role_permissions(role_id,permission_code)
select role_id, permission_code from
 (values ('8a041004-0000-4000-8000-000000000302'::uuid),('8b041004-0000-4000-8000-000000000302'::uuid)) roles(role_id)
cross join (values ('account.invite'),('employee.create'),('employee.update'),('employee.read_directory'),('employee.offboard'),('account.disable')) permissions(permission_code);
insert into public.tenant_memberships(user_id,tenant_id,roles) values
 ('8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000010',array['employee']),
 ('8b041004-0000-4000-8000-000000000001','8b041004-0000-4000-8000-000000000010',array['employee']);
insert into public.company_memberships(user_id,tenant_id,company_id,roles) values
 ('8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020',array['employee']),
 ('8b041004-0000-4000-8000-000000000001','8b041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000020',array['employee']);
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
 ('8a041004-0000-4000-8000-000000000010','8a041004-0000-4000-8000-000000000020','8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000302','8a041004-0000-4000-8000-000000000001','HR fixture'),
 ('8b041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000001','8b041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000001','HR fixture');
select set_config('request.jwt.claims','{"sub":"8a041004-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.complete_employee_onboarding(
 '8a041004-0000-4000-8000-000000000020','8a041004-0000-4000-8000-000000000002','HR-FIXTURE','HR Fixture',
 'target@hr-reissue.invalid','8a041004-0000-4000-8000-000000000201','8a041004-0000-4000-8000-000000000211','2026-10-01');
