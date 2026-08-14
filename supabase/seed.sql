insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner@vqh.local'),
  ('20000000-0000-4000-8000-000000000001', 'owner@isolation.local')
on conflict (id) do nothing;

insert into public.tenants (id, code, name) values
  ('10000000-0000-4000-8000-000000000010', 'vqh', 'Việt Quốc Huy'),
  ('20000000-0000-4000-8000-000000000010', 'isolation', 'Tenant kiểm thử cách ly')
on conflict do nothing;

insert into public.companies (id, tenant_id, code, name) values
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000010', 'VQH', 'Việt Quốc Huy'),
  ('20000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000010', 'ISO', 'Công ty kiểm thử cách ly')
on conflict do nothing;

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', array['tenant_admin']),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000010', array['tenant_admin'])
on conflict do nothing;

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['director']),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000020', array['director'])
on conflict do nothing;
