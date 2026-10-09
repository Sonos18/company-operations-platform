begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 101);

do $a1$
declare
  engineer_id uuid;
  buyer_id uuid;
begin
  select id into strict engineer_id from auth.users where lower(email) = lower('__A1_ENGINEER_EMAIL__');
  select id into strict buyer_id from auth.users where lower(email) = lower('__A1_BUYER_EMAIL__');
  if engineer_id = buyer_id then raise exception 'A1 fixture actors must differ'; end if;
  if exists(select 1 from auth.users where id in(engineer_id,buyer_id) and (email_confirmed_at is null or banned_until > now())) then
    raise exception 'A1 fixture actor cannot sign in';
  end if;

  insert into public.tenants(id,code,name)
  values('a1000000-0000-4000-8000-000000000010','taskovia-a1-alpha-dev','Taskovia A1 Alpha DEV')
  on conflict do nothing;
  if not exists(select 1 from public.tenants where id='a1000000-0000-4000-8000-000000000010' and code='taskovia-a1-alpha-dev' and name='Taskovia A1 Alpha DEV') then
    raise exception 'A1 fixture tenant collision';
  end if;

  insert into public.companies(id,tenant_id,code,name)
  values('a1000000-0000-4000-8000-000000000020','a1000000-0000-4000-8000-000000000010','A1_ALPHA_DEV','A1 Alpha Test Company')
  on conflict do nothing;
  if not exists(select 1 from public.companies where id='a1000000-0000-4000-8000-000000000020' and tenant_id='a1000000-0000-4000-8000-000000000010' and code='A1_ALPHA_DEV' and name='A1 Alpha Test Company') then
    raise exception 'A1 fixture company collision';
  end if;

  insert into public.tenant_memberships(user_id,tenant_id,roles)
  values
    (engineer_id,'a1000000-0000-4000-8000-000000000010',array['member']),
    (buyer_id,'a1000000-0000-4000-8000-000000000010',array['member'])
  on conflict do nothing;
  if (select count(*) from public.tenant_memberships where tenant_id='a1000000-0000-4000-8000-000000000010' and user_id in(engineer_id,buyer_id) and roles=array['member']) <> 2
     or (select count(*) from public.tenant_memberships where tenant_id='a1000000-0000-4000-8000-000000000010') <> 2 then
    raise exception 'A1 fixture tenant membership collision';
  end if;

  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
  values
    (engineer_id,'a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',array['member'],true),
    (buyer_id,'a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',array['member'],true)
  on conflict do nothing;
  if (select count(*) from public.company_memberships where tenant_id='a1000000-0000-4000-8000-000000000010' and company_id='a1000000-0000-4000-8000-000000000020' and user_id in(engineer_id,buyer_id) and roles=array['member'] and is_active) <> 2
     or (select count(*) from public.company_memberships where company_id='a1000000-0000-4000-8000-000000000020') <> 2 then
    raise exception 'A1 fixture company membership collision';
  end if;

  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system,is_active)
  values
    ('a1000000-0000-4000-8000-000000000031','a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020','a1_engineer','A1 Engineer','A1 Cloud DEV fixture',false,true),
    ('a1000000-0000-4000-8000-000000000032','a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020','a1_buyer','A1 Buyer','A1 Cloud DEV fixture',false,true)
  on conflict do nothing;
  if (select count(*) from public.roles where tenant_id='a1000000-0000-4000-8000-000000000010' and company_id='a1000000-0000-4000-8000-000000000020' and ((id='a1000000-0000-4000-8000-000000000031' and code='a1_engineer' and name='A1 Engineer' and description='A1 Cloud DEV fixture') or (id='a1000000-0000-4000-8000-000000000032' and code='a1_buyer' and name='A1 Buyer' and description='A1 Cloud DEV fixture')) and is_active and not is_system and not is_privileged) <> 2
     or (select count(*) from public.roles where company_id='a1000000-0000-4000-8000-000000000020') <> 2 then
    raise exception 'A1 fixture role collision';
  end if;

  insert into public.role_permissions(role_id,permission_code)
  values
    ('a1000000-0000-4000-8000-000000000031','material.read'),
    ('a1000000-0000-4000-8000-000000000031','material.proposal.submit'),
    ('a1000000-0000-4000-8000-000000000032','material.read'),
    ('a1000000-0000-4000-8000-000000000032','material.manage'),
    ('a1000000-0000-4000-8000-000000000032','material.proposal.decide'),
    ('a1000000-0000-4000-8000-000000000032','material.order.manage'),
    ('a1000000-0000-4000-8000-000000000032','material.supplier.record')
  on conflict do nothing;
  if (select count(*) from public.role_permissions where role_id='a1000000-0000-4000-8000-000000000031') <> 2
     or (select count(*) from public.role_permissions where role_id='a1000000-0000-4000-8000-000000000032') <> 5 then
    raise exception 'A1 fixture permission collision';
  end if;

  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
  values
    ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',engineer_id,'a1000000-0000-4000-8000-000000000031',buyer_id,'A1 Cloud DEV fixture grant'),
    ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',buyer_id,'a1000000-0000-4000-8000-000000000032',buyer_id,'A1 Cloud DEV fixture grant')
  on conflict do nothing;
  if (select count(*) from public.company_role_assignments where tenant_id='a1000000-0000-4000-8000-000000000010' and company_id='a1000000-0000-4000-8000-000000000020' and user_id in(engineer_id,buyer_id) and revoked_at is null) <> 2
     or (select count(*) from public.company_role_assignments where company_id='a1000000-0000-4000-8000-000000000020' and revoked_at is null) <> 2
     or not exists(select 1 from public.company_role_assignments where company_id='a1000000-0000-4000-8000-000000000020' and user_id=engineer_id and role_id='a1000000-0000-4000-8000-000000000031' and revoked_at is null)
     or not exists(select 1 from public.company_role_assignments where company_id='a1000000-0000-4000-8000-000000000020' and user_id=buyer_id and role_id='a1000000-0000-4000-8000-000000000032' and revoked_at is null) then
    raise exception 'A1 fixture assignment collision';
  end if;

  insert into public.company_cost_settings(company_id,tenant_id,enabled,default_currency_code,created_by)
  values('a1000000-0000-4000-8000-000000000020','a1000000-0000-4000-8000-000000000010',true,'VND',buyer_id)
  on conflict do nothing;
  if not exists(select 1 from public.company_cost_settings where company_id='a1000000-0000-4000-8000-000000000020' and tenant_id='a1000000-0000-4000-8000-000000000010' and enabled and default_currency_code='VND') then
    raise exception 'A1 fixture cost settings collision';
  end if;

  insert into public.cost_workflow_companies(tenant_id,company_id,mode,notification_recipient_id)
  values('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020','document_backed_v1',null)
  on conflict do nothing;
  if not exists(select 1 from public.cost_workflow_companies where company_id='a1000000-0000-4000-8000-000000000020' and tenant_id='a1000000-0000-4000-8000-000000000010' and mode='document_backed_v1' and notification_recipient_id is null) then
    raise exception 'A1 fixture workflow collision';
  end if;

  insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
  values('a1000000-0000-4000-8000-000000000101','a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020','A1-ALPHA-PROJECT','A1 Alpha Project','A1 Default Delivery Site','active','manual',buyer_id)
  on conflict do nothing;
  if not exists(select 1 from public.projects where id='a1000000-0000-4000-8000-000000000101' and tenant_id='a1000000-0000-4000-8000-000000000010' and company_id='a1000000-0000-4000-8000-000000000020' and code='A1-ALPHA-PROJECT' and location_text='A1 Default Delivery Site' and operational_state='active' and created_by=buyer_id) then
    raise exception 'A1 fixture project collision';
  end if;

  insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,is_active,created_by)
  values('a1000000-0000-4000-8000-000000000201','a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020','A1-CEMENT-PCB40','Cement','PCB40 50kg','bag',true,buyer_id)
  on conflict do nothing;
  if not exists(select 1 from public.material_items where id='a1000000-0000-4000-8000-000000000201' and tenant_id='a1000000-0000-4000-8000-000000000010' and company_id='a1000000-0000-4000-8000-000000000020' and code='A1-CEMENT-PCB40' and name='Cement' and specification='PCB40 50kg' and unit='bag' and is_active and created_by=buyer_id) then
    raise exception 'A1 fixture material collision';
  end if;
end
$a1$;

select 'A1_FIXTURE_READY' as result,
  'a1000000-0000-4000-8000-000000000020'::uuid as company_id,
  'a1000000-0000-4000-8000-000000000101'::uuid as project_id,
  'a1000000-0000-4000-8000-000000000201'::uuid as material_id;
commit;
