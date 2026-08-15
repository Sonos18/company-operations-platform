insert into public.tenants (id, code, name) values
  ('10000000-0000-4000-8000-000000000010', 'vqh', 'Việt Quốc Huy')
on conflict do nothing;

insert into public.companies (id, tenant_id, code, name) values
  (
    '10000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000010',
    'VQH',
    'Việt Quốc Huy'
  )
on conflict do nothing;
