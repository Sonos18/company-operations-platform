do $$
declare
  existing_tenant_id uuid;
  existing_tenant_code text;
  existing_company_id uuid;
  existing_company_tenant_id uuid;
  existing_company_code text;
begin
  select id, code
    into existing_tenant_id, existing_tenant_code
    from public.tenants
    where id = '10000000-0000-4000-8000-000000000010';
  if found and existing_tenant_code <> 'vqh' then
    raise exception 'VQH tenant ID conflicts with the canonical code';
  end if;

  select id
    into existing_tenant_id
    from public.tenants
    where code = 'vqh';
  if found and existing_tenant_id <> '10000000-0000-4000-8000-000000000010' then
    raise exception 'VQH tenant code conflicts with the canonical ID';
  end if;

  select id, tenant_id, code
    into existing_company_id, existing_company_tenant_id, existing_company_code
    from public.companies
    where id = '10000000-0000-4000-8000-000000000020';
  if found and (
    existing_company_tenant_id <> '10000000-0000-4000-8000-000000000010'
    or existing_company_code <> 'VQH'
  ) then
    raise exception 'VQH company ID conflicts with the canonical tenant or code';
  end if;

  select id
    into existing_company_id
    from public.companies
    where tenant_id = '10000000-0000-4000-8000-000000000010'
      and code = 'VQH';
  if found and existing_company_id <> '10000000-0000-4000-8000-000000000020' then
    raise exception 'VQH company code conflicts with the canonical ID';
  end if;
end $$;

insert into public.tenants (id, code, name) values
  ('10000000-0000-4000-8000-000000000010', 'vqh', 'Việt Quốc Huy')
on conflict (id) do update
  set code = excluded.code,
      name = excluded.name;

insert into public.companies (id, tenant_id, code, name) values
  (
    '10000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000010',
    'VQH',
    'Việt Quốc Huy'
  )
on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      code = excluded.code,
      name = excluded.name;
