-- HR INVITATION FIXED OWNED FIXTURE
select set_config('request.headers','{"x-request-id":"__RUN_ID__"}',true);
select set_config('request.jwt.claims','{"sub":"8a041004-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- Retain immutable assignment history and its FK parents; revoke effective company access.
update public.company_role_assignments set revoked_at=clock_timestamp(),revoked_by='8a041004-0000-4000-8000-000000000001',
 revoke_reason='Synthetic HR fixture deactivation __RUN_ID__'
where company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020') and revoked_at is null;
delete from public.role_permissions where role_id in ('8a041004-0000-4000-8000-000000000301','8a041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000302');
update public.roles set is_active=false where company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020');
update public.company_memberships set is_active=false where company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020');
delete from public.employee_private_details where company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020');
delete from public.employees where company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020');
delete from public.positions where company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020');
delete from public.departments where company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020');
do $closure$
declare
 fixture_companies uuid[]:=array['8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020']::uuid[];
 fixture_tenants uuid[]:=array['8a041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000010']::uuid[];
 fixture_users uuid[]:=array['8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000002','8b041004-0000-4000-8000-000000000001']::uuid[];
 access_row record;
begin
 if (select count(*) from auth.users where id=any(fixture_users))<>3
  or (select count(*) from public.tenants where id=any(fixture_tenants))<>2
  or (select count(*) from public.companies where id=any(fixture_companies))<>2
  or (select count(*) from public.roles where company_id=any(fixture_companies))<>3
  or (select count(*) from public.company_memberships where company_id=any(fixture_companies))<>3
  or (select count(*) from public.tenant_memberships where tenant_id=any(fixture_tenants))<>3
  or (select count(*) from public.company_role_assignments where company_id=any(fixture_companies))<>4
 then raise exception 'HR_RETENTION_NOT_EXACTLY_20'; end if;
 if (select count(*) from public.audit_events where company_id=any(fixture_companies))<>66 then raise exception 'HR_RETENTION_AUDIT_COUNT_NOT_66'; end if;
 if exists(select 1 from auth.users where id=any(fixture_users) and (coalesce(encrypted_password,'')<>'' or email_confirmed_at is not null or phone_confirmed_at is not null or last_sign_in_at is not null))
  or exists(select 1 from public.company_memberships where company_id=any(fixture_companies) and is_active)
  or exists(select 1 from public.roles where company_id=any(fixture_companies) and is_active)
  or exists(select 1 from public.company_role_assignments where company_id=any(fixture_companies) and revoked_at is null)
  or exists(select 1 from public.role_permissions where role_id in ('8a041004-0000-4000-8000-000000000301','8a041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000302'))
  or exists(select 1 from public.employees where company_id=any(fixture_companies))
  or exists(select 1 from public.employee_private_details where company_id=any(fixture_companies))
  or exists(select 1 from public.departments where company_id=any(fixture_companies))
  or exists(select 1 from public.positions where company_id=any(fixture_companies))
 then raise exception 'HR_RETAINED_ACCESS_OR_BUSINESS_ROWS'; end if;
 if exists(select 1 from public.audit_events where company_id=any(fixture_companies) and (request_id is distinct from '__RUN_ID__'::uuid or (actor_id is not null and actor_id<>'8a041004-0000-4000-8000-000000000001')))
 then raise exception 'HR_UNOWNED_RETAINED_AUDIT'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.audit_events'::regclass and tgname='audit_events_prevent_mutation' and tgenabled='O')
  or not exists(select 1 from pg_trigger where tgrelid='public.company_role_assignments'::regclass and tgname='company_role_assignments_prevent_last_admin_removal' and tgenabled='O')
 then raise exception 'HR_IMMUTABLE_GUARD_CHANGED'; end if;
 for access_row in select user_id,tenant_id,company_id from public.company_memberships where company_id=any(fixture_companies) loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',access_row.user_id,'role','authenticated')::text,true);
  if public.is_company_member(access_row.tenant_id,access_row.company_id)
    or private.has_company_permission(access_row.tenant_id,access_row.company_id,'account.invite')
    or private.has_company_permission(access_row.tenant_id,access_row.company_id,'employee.create')
  then raise exception 'HR_RETAINED_COMPANY_ACCESS'; end if;
  -- Tenant membership intentionally remains; do not claim it is absent/inactive.
  if not public.is_tenant_member(access_row.tenant_id) then raise exception 'HR_EXPECTED_RETAINED_TENANT_RELATION'; end if;
 end loop;
 perform set_config('request.jwt.claims','{"sub":"8a041004-0000-4000-8000-000000000001","role":"authenticated"}',true);
end $closure$;

-- Narrow authenticated RLS visibility proof. No login/session is created.
set local role authenticated;
do $rls$
declare actor_id uuid; expected_tenant uuid;
begin
 for actor_id,expected_tenant in select * from (values
  ('8a041004-0000-4000-8000-000000000001'::uuid,'8a041004-0000-4000-8000-000000000010'::uuid),
  ('8a041004-0000-4000-8000-000000000002'::uuid,'8a041004-0000-4000-8000-000000000010'::uuid),
  ('8b041004-0000-4000-8000-000000000001'::uuid,'8b041004-0000-4000-8000-000000000010'::uuid)) actors(user_id,tenant_id)
 loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_id,'role','authenticated')::text,true);
  if exists(select 1 from public.companies)
    or exists(select 1 from public.roles)
    or exists(select 1 from public.company_role_assignments)
    or exists(select 1 from public.company_memberships where is_active)
  then raise exception 'HR_RETAINED_RLS_COMPANY_ACCESS'; end if;
  if (select count(*) from public.tenants)<>1 or not exists(select 1 from public.tenants where id=expected_tenant)
    or (select count(*) from public.tenant_memberships)<>1
    or (select count(*) from public.company_memberships)<>1
  then raise exception 'HR_RETAINED_TENANT_VISIBILITY_CHANGED'; end if;
 end loop;
end $rls$;
reset role;
select set_config('request.jwt.claims','{"sub":"8a041004-0000-4000-8000-000000000001","role":"authenticated"}',true);
