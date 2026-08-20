-- Run only in the approved Cloud DEV SQL Editor after the catalog migration is applied.
do $$
declare
  target_email constant text := 'replace-with-dev-admin@example.com';
  target_user_id uuid;
  company_admin_role_id uuid;
begin
  if target_email = 'replace-with-dev-admin@example.com' then
    raise exception 'Replace the DEV admin email before running this script';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email);
  if target_user_id is null then
    raise exception 'No Supabase Auth user found for the supplied DEV admin email';
  end if;

  select id into company_admin_role_id
  from public.roles
  where tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
    and company_id = '10000000-0000-4000-8000-000000000020'::uuid
    and code = 'company_admin'
    and is_system
    and is_active;
  if company_admin_role_id is null
     or (select count(*) from public.permissions) <> 34
     or (select count(*) from public.role_permissions where role_id = company_admin_role_id) <> 34 then
    raise exception 'VQH canonical RBAC catalog is missing or incomplete';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      '10000000-0000-4000-8000-000000000010:10000000-0000-4000-8000-000000000020:company_admin',
      0
    )
  );

  insert into public.tenant_memberships (user_id, tenant_id, roles)
  values (target_user_id, '10000000-0000-4000-8000-000000000010', array['tenant_admin'])
  on conflict (user_id, tenant_id) do update
    set roles = excluded.roles;

  insert into public.company_memberships (user_id, tenant_id, company_id, roles, is_active)
  values (target_user_id, '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true)
  on conflict (user_id, company_id) do update
    set tenant_id = excluded.tenant_id,
        roles = array['employee']::text[],
        is_active = true;

  -- The assignment audit trigger uses auth.uid(); attribute this self-bootstrap explicitly.
  perform set_config('request.jwt.claims', json_build_object('sub', target_user_id::text, 'role', 'authenticated')::text, true);
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason)
  values (
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020',
    target_user_id,
    company_admin_role_id,
    target_user_id,
    'manual Cloud DEV normalized company-admin bootstrap'
  )
  on conflict (tenant_id, company_id, user_id, role_id) where revoked_at is null do nothing;
end
$$;
