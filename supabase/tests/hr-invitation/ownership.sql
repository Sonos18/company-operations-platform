-- HR INVITATION FIXED OWNED FIXTURE
do $ownership$
declare
 fixture_ids uuid[] := array['8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000002','8b041004-0000-4000-8000-000000000001']::uuid[];
 fixture_tenants uuid[] := array['8a041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000010']::uuid[];
 fixture_companies uuid[] := array['8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020']::uuid[];
 fixture_roles uuid[] := array['8a041004-0000-4000-8000-000000000301','8a041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000302']::uuid[];
 fixture_departments uuid[] := array['8a041004-0000-4000-8000-000000000201','8a041004-0000-4000-8000-000000000202','8b041004-0000-4000-8000-000000000201']::uuid[];
 fixture_positions uuid[] := array['8a041004-0000-4000-8000-000000000211','8a041004-0000-4000-8000-000000000212']::uuid[];
 owned integer;
 fk record;
 referenced boolean;
 parent_ids uuid[];
 dependent_ids text[];
begin
 -- Cooperating setup/reset/cleanup operations share this fixed advisory key; race actors do not.
 if __LOCK_PARENTS__ then perform pg_advisory_xact_lock(884104,0); end if;
 if __ALLOW_ABSENT__ and not exists(select 1 from auth.users where id=any(fixture_ids) or email in ('actor-a@hr-reissue.invalid','target@hr-reissue.invalid','actor-b@hr-reissue.invalid'))
  and not exists(select 1 from public.tenants where id=any(fixture_tenants) or code in ('hr-reissue-20261004-a','hr-reissue-20261004-b'))
  and not exists(select 1 from public.companies where id=any(fixture_companies) or code in ('HR-REISSUE-A','HR-REISSUE-B'))
  and not exists(select 1 from public.roles where id=any(fixture_roles))
  and not exists(select 1 from public.departments where id=any(fixture_departments))
  and not exists(select 1 from public.positions where id=any(fixture_positions))
  and not exists(select 1 from public.audit_events where request_id='__RUN_ID__'::uuid)
 then return; end if;
 select count(*) into owned from auth.users where id=any(fixture_ids)
  and raw_app_meta_data->>'hr_reissue_fixture_run'='__RUN_ID__'
  and email=case id when fixture_ids[1] then 'actor-a@hr-reissue.invalid' when fixture_ids[2] then 'target@hr-reissue.invalid' when fixture_ids[3] then 'actor-b@hr-reissue.invalid' end;
 if owned <> (select count(*) from auth.users where id=any(fixture_ids))
  or (owned<>3 and not (__ALLOW_RETAINED__ and owned=1 and exists(select 1 from auth.users where id=fixture_ids[1])))
  or not exists(select 1 from public.tenants where id=fixture_tenants[1] and code='hr-reissue-20261004-a' and name='HR fixture __RUN_ID__')
  or not exists(select 1 from public.tenants where id=fixture_tenants[2] and code='hr-reissue-20261004-b' and name='HR fixture __RUN_ID__')
  or not exists(select 1 from public.companies where id=fixture_companies[1] and tenant_id=fixture_tenants[1] and code='HR-REISSUE-A' and name='HR fixture __RUN_ID__')
  or not exists(select 1 from public.companies where id=fixture_companies[2] and tenant_id=fixture_tenants[2] and code='HR-REISSUE-B' and name='HR fixture __RUN_ID__')
 then raise exception 'HR_FIXTURE_NOT_OWNED'; end if;
 if __LOCK_PARENTS__ then
  -- Prevent concurrent FK references/cascades while proving all child rows are owned.
  perform 1 from auth.users where id=any(fixture_ids) order by id for update;
  perform 1 from public.tenants where id=any(fixture_tenants) order by id for update;
  perform 1 from public.companies where id=any(fixture_companies) order by id for update;
  perform 1 from public.roles where company_id=any(fixture_companies) order by id for update;
  perform 1 from public.departments where company_id=any(fixture_companies) order by id for update;
  perform 1 from public.positions where company_id=any(fixture_companies) order by id for update;
  perform 1 from public.employees where company_id=any(fixture_companies) order by id for update;
  perform 1 from public.employee_private_details where company_id=any(fixture_companies) order by employee_id for update;
  perform 1 from public.company_role_assignments where company_id=any(fixture_companies) order by id for update;
 select count(*) into owned from auth.users where id=any(fixture_ids)
  and raw_app_meta_data->>'hr_reissue_fixture_run'='__RUN_ID__'
  and email=case id when fixture_ids[1] then 'actor-a@hr-reissue.invalid' when fixture_ids[2] then 'target@hr-reissue.invalid' when fixture_ids[3] then 'actor-b@hr-reissue.invalid' end;
 if owned <> (select count(*) from auth.users where id=any(fixture_ids))
  or (owned<>3 and not (__ALLOW_RETAINED__ and owned=1 and exists(select 1 from auth.users where id=fixture_ids[1])))
  or not exists(select 1 from public.tenants where id=fixture_tenants[1] and code='hr-reissue-20261004-a' and name='HR fixture __RUN_ID__')
  or not exists(select 1 from public.tenants where id=fixture_tenants[2] and code='hr-reissue-20261004-b' and name='HR fixture __RUN_ID__')
  or not exists(select 1 from public.companies where id=fixture_companies[1] and tenant_id=fixture_tenants[1] and code='HR-REISSUE-A' and name='HR fixture __RUN_ID__')
  or not exists(select 1 from public.companies where id=fixture_companies[2] and tenant_id=fixture_tenants[2] and code='HR-REISSUE-B' and name='HR fixture __RUN_ID__')
 then raise exception 'HR_FIXTURE_NOT_OWNED'; end if;

 end if;
 if exists(select 1 from auth.users where id=any(fixture_ids) and (coalesce(encrypted_password,'')<>'' or email_confirmed_at is not null or last_sign_in_at is not null))
 then raise exception 'HR_FIXTURE_AUTH_NOT_SYNTHETIC'; end if;
 if exists(select 1 from public.companies where tenant_id=any(fixture_tenants) and id<>all(fixture_companies))
  or exists(select 1 from public.tenant_memberships where (tenant_id=any(fixture_tenants) and user_id<>all(fixture_ids)) or (user_id=any(fixture_ids) and tenant_id<>all(fixture_tenants)))
  or exists(select 1 from public.company_memberships where (company_id=any(fixture_companies) and user_id<>all(fixture_ids)) or (user_id=any(fixture_ids) and company_id<>all(fixture_companies)))
  or exists(select 1 from public.employees where company_id=any(fixture_companies) and (company_id<>fixture_companies[1] or user_id is distinct from fixture_ids[2] or employee_code<>'HR-FIXTURE' or work_email<>'target@hr-reissue.invalid'))
  or exists(select 1 from public.roles where (company_id=any(fixture_companies) and id<>all(fixture_roles)) or (id=any(fixture_roles) and (company_id<>case when id=fixture_roles[3] then fixture_companies[2] else fixture_companies[1] end or is_system or is_privileged)))
  or exists(select 1 from public.departments where (company_id=any(fixture_companies) and id<>all(fixture_departments)) or (id=any(fixture_departments) and company_id<>case when id=fixture_departments[3] then fixture_companies[2] else fixture_companies[1] end))
  or exists(select 1 from public.positions where (company_id=any(fixture_companies) and id<>all(fixture_positions)) or (id=any(fixture_positions) and company_id<>fixture_companies[1]))
  or exists(select 1 from public.company_role_assignments where company_id=any(fixture_companies) and (user_id<>all(fixture_ids) or role_id<>all(fixture_roles)))
  or exists(select 1 from public.role_permissions where role_id=any(fixture_roles) and permission_code not in ('account.invite','employee.create','employee.update','employee.read_directory','employee.offboard','account.disable'))
  or exists(select 1 from public.audit_events where company_id=any(fixture_companies) and request_id is distinct from '__RUN_ID__'::uuid)
 then raise exception 'HR_FIXTURE_HAS_UNOWNED_ROWS'; end if;
 if exists(select 1 from public.audit_events where company_id=any(fixture_companies) and actor_id is not null and actor_id<>fixture_ids[1])
 then raise exception 'HR_UNAPPROVED_AUDIT_ACTOR'; end if;
 -- No unapproved relation may depend on the deleted private-details/assignment parents.
 for fk in
  select ns.nspname,rel.relname,att.attname,c.confrelid from pg_constraint c
  join pg_class rel on rel.oid=c.conrelid join pg_namespace ns on ns.oid=rel.relnamespace
  cross join lateral unnest(c.conkey,c.confkey) keys(source_num,target_num)
  join pg_attribute att on att.attrelid=c.conrelid and att.attnum=keys.source_num
  where c.contype='f' and c.confrelid in ('public.employee_private_details'::regclass,'public.company_role_assignments'::regclass)
 loop
  if fk.confrelid='public.employee_private_details'::regclass then
   dependent_ids:=array(select employee_id::text from public.employee_private_details where company_id=any(fixture_companies));
  else dependent_ids:=array(select id::text from public.company_role_assignments where company_id=any(fixture_companies)); end if;
  execute format('select exists(select 1 from %I.%I where %I::text=any($1))',fk.nspname,fk.relname,fk.attname) into referenced using dependent_ids;
  if referenced then raise exception 'HR_FIXTURE_HAS_EXTERNAL_REFERENCES'; end if;
 end loop;
 -- Check every FK to parents that cleanup deletes or retains. Unexpected dependencies stop cleanup.
 for fk in
  select ns.nspname,rel.relname,att.attname,c.confrelid,target.attname as target_column
  from pg_constraint c join pg_class rel on rel.oid=c.conrelid join pg_namespace ns on ns.oid=rel.relnamespace
  cross join lateral unnest(c.conkey,c.confkey) keys(source_num,target_num)
  join pg_attribute att on att.attrelid=c.conrelid and att.attnum=keys.source_num
  join pg_attribute target on target.attrelid=c.confrelid and target.attnum=keys.target_num
  where c.contype='f' and c.confrelid in ('auth.users'::regclass,'public.companies'::regclass,'public.tenants'::regclass,'public.roles'::regclass,'public.departments'::regclass,'public.positions'::regclass,'public.employees'::regclass) and target.attname='id'
 loop
  parent_ids:=case fk.confrelid when 'auth.users'::regclass then fixture_ids when 'public.companies'::regclass then fixture_companies
   when 'public.tenants'::regclass then fixture_tenants when 'public.roles'::regclass then fixture_roles
   when 'public.departments'::regclass then fixture_departments when 'public.positions'::regclass then fixture_positions
   else array(select id from public.employees where company_id=any(fixture_companies)) end;
  execute format('select exists(select 1 from %I.%I where %I=any($1))',fk.nspname,fk.relname,fk.attname) into referenced using parent_ids;
  if referenced then
   if fk.nspname<>'public' or fk.relname not in ('companies','tenant_memberships','company_memberships','employees','employee_private_details','departments','positions','roles','role_permissions','company_role_assignments','audit_events')
   then raise exception 'HR_FIXTURE_HAS_EXTERNAL_REFERENCES'; end if;
   if fk.relname not in ('tenant_memberships','role_permissions','companies') then
    execute format('select exists(select 1 from public.%I where %I=any($1) and company_id<>all($2))',fk.relname,fk.attname) into referenced using parent_ids,fixture_companies;
    if referenced then raise exception 'HR_FIXTURE_HAS_EXTERNAL_REFERENCES'; end if;
   end if;
  end if;
 end loop;
end $ownership$;
