begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 102);

-- Adds the A4/A5 accountant and treasurer to the A1 Alpha DEV company created by
-- material-a1-alpha.sql, so the contract -> payment request -> payment flow runs on the
-- proposals and orders of kysu/muahang. Memberships in other companies are left untouched.
-- Note: material-a1-alpha.sql counts exactly two members/roles in that company, so it
-- refuses to rerun (and rolls back) once these actors exist.
do $a4a5$
declare
  accountant_id uuid;
  treasurer_id uuid;
begin
  select id into strict accountant_id from auth.users where lower(email) = lower('__A4A5_ACCOUNTANT_EMAIL__');
  select id into strict treasurer_id from auth.users where lower(email) = lower('__A4A5_TREASURER_EMAIL__');
  if accountant_id = treasurer_id then raise exception 'A4/A5 finance actors must differ'; end if;
  if exists(select 1 from auth.users where id in(accountant_id,treasurer_id) and (email_confirmed_at is null or banned_until > now())) then
    raise exception 'A4/A5 finance actor cannot sign in';
  end if;
  if not exists(select 1 from public.companies where id='a1000000-0000-4000-8000-000000000020' and tenant_id='a1000000-0000-4000-8000-000000000010' and code='A1_ALPHA_DEV') then
    raise exception 'A1 Alpha DEV company is missing; run db:dev:a1:fixture first';
  end if;

  insert into public.tenant_memberships(user_id,tenant_id,roles)
  values
    (accountant_id,'a1000000-0000-4000-8000-000000000010',array['member']),
    (treasurer_id,'a1000000-0000-4000-8000-000000000010',array['member'])
  on conflict do nothing;
  if (select count(*) from public.tenant_memberships where tenant_id='a1000000-0000-4000-8000-000000000010' and user_id in(accountant_id,treasurer_id) and roles=array['member']) <> 2 then
    raise exception 'A4/A5 finance tenant membership collision';
  end if;

  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
  values
    (accountant_id,'a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',array['member'],true),
    (treasurer_id,'a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',array['member'],true)
  on conflict do nothing;
  if (select count(*) from public.company_memberships where tenant_id='a1000000-0000-4000-8000-000000000010' and company_id='a1000000-0000-4000-8000-000000000020' and user_id in(accountant_id,treasurer_id) and roles=array['member'] and is_active) <> 2 then
    raise exception 'A4/A5 finance company membership collision';
  end if;

  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system,is_active)
  values
    ('a1000000-0000-4000-8000-000000000033','a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020','a1_accountant','A1 Accountant','A4/A5 Cloud DEV fixture',false,true),
    ('a1000000-0000-4000-8000-000000000034','a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020','a1_treasurer','A1 Treasurer','A4/A5 Cloud DEV fixture',false,true)
  on conflict do nothing;
  if (select count(*) from public.roles where tenant_id='a1000000-0000-4000-8000-000000000010' and company_id='a1000000-0000-4000-8000-000000000020' and ((id='a1000000-0000-4000-8000-000000000033' and code='a1_accountant' and name='A1 Accountant') or (id='a1000000-0000-4000-8000-000000000034' and code='a1_treasurer' and name='A1 Treasurer')) and description='A4/A5 Cloud DEV fixture' and is_active and not is_system and not is_privileged) <> 2 then
    raise exception 'A4/A5 finance role collision';
  end if;

  -- docs/server/material-finance.md: accountant records contracts/invoices, requests payment and
  -- records the payment; treasurer approves it. Both read finance amounts.
  -- Rerunning moves a role granted under the earlier split (treasurer executing) to this one: the
  -- delete is limited to these two fixture roles and removes only permissions outside their own list.
  delete from public.role_permissions
  where role_id in ('a1000000-0000-4000-8000-000000000033','a1000000-0000-4000-8000-000000000034')
    and (
      (role_id='a1000000-0000-4000-8000-000000000033' and permission_code not in('material.read','material.finance.read','material.contract.record','material.payment.request','material.payment.execute'))
      or (role_id='a1000000-0000-4000-8000-000000000034' and permission_code not in('material.read','material.finance.read','material.payment.approve'))
    );
  insert into public.role_permissions(role_id,permission_code)
  values
    ('a1000000-0000-4000-8000-000000000033','material.read'),
    ('a1000000-0000-4000-8000-000000000033','material.finance.read'),
    ('a1000000-0000-4000-8000-000000000033','material.contract.record'),
    ('a1000000-0000-4000-8000-000000000033','material.payment.request'),
    ('a1000000-0000-4000-8000-000000000033','material.payment.execute'),
    ('a1000000-0000-4000-8000-000000000034','material.read'),
    ('a1000000-0000-4000-8000-000000000034','material.finance.read'),
    ('a1000000-0000-4000-8000-000000000034','material.payment.approve')
  on conflict do nothing;
  if (select count(*) from public.role_permissions where role_id='a1000000-0000-4000-8000-000000000033') <> 5
     or (select count(*) from public.role_permissions where role_id='a1000000-0000-4000-8000-000000000034') <> 3 then
    raise exception 'A4/A5 finance permission collision';
  end if;

  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
  values
    ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',accountant_id,'a1000000-0000-4000-8000-000000000033',accountant_id,'A4/A5 Cloud DEV fixture grant'),
    ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000020',treasurer_id,'a1000000-0000-4000-8000-000000000034',accountant_id,'A4/A5 Cloud DEV fixture grant')
  on conflict do nothing;
  if not exists(select 1 from public.company_role_assignments where company_id='a1000000-0000-4000-8000-000000000020' and user_id=accountant_id and role_id='a1000000-0000-4000-8000-000000000033' and revoked_at is null)
     or not exists(select 1 from public.company_role_assignments where company_id='a1000000-0000-4000-8000-000000000020' and user_id=treasurer_id and role_id='a1000000-0000-4000-8000-000000000034' and revoked_at is null) then
    raise exception 'A4/A5 finance assignment collision';
  end if;
end
$a4a5$;

select 'A4A5_FINANCE_ACTORS_READY' as result,
  'a1000000-0000-4000-8000-000000000020'::uuid as company_id;
commit;
