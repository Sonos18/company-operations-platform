do $$
declare
  target_email constant text := 'replace-with-dev-admin@example.com';
  target_user_id uuid;
begin
  if target_email = 'replace-with-dev-admin@example.com' then
    raise exception 'Replace the DEV admin email before running this script';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email);

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for %', target_email;
  end if;

  insert into public.tenant_memberships (user_id, tenant_id, roles)
  values (
    target_user_id,
    '10000000-0000-4000-8000-000000000010',
    array['tenant_admin']
  )
  on conflict (user_id, tenant_id) do update
    set roles = excluded.roles;

  insert into public.company_memberships (user_id, tenant_id, company_id, roles)
  values (
    target_user_id,
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020',
    array['director']
  )
  on conflict (user_id, company_id) do update
    set tenant_id = excluded.tenant_id,
        roles = excluded.roles;
end
$$;
