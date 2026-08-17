begin;
select plan(8);

insert into auth.users (id, email) values
  ('31000000-0000-4000-8000-000000000001', 'test-a@rls.invalid'),
  ('32000000-0000-4000-8000-000000000001', 'test-b@rls.invalid');

insert into public.tenants (id, code, name) values
  ('31000000-0000-4000-8000-000000000010', 'test-a', 'RLS tenant A'),
  ('32000000-0000-4000-8000-000000000010', 'test-b', 'RLS tenant B');

insert into public.companies (id, tenant_id, code, name) values
  ('31000000-0000-4000-8000-000000000020', '31000000-0000-4000-8000-000000000010', 'TEST-A', 'RLS company A'),
  ('32000000-0000-4000-8000-000000000020', '32000000-0000-4000-8000-000000000010', 'TEST-B', 'RLS company B');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000010', array['tenant_admin']),
  ('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000010', array['tenant_admin']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000010', '31000000-0000-4000-8000-000000000020', array['director']),
  ('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000020', array['director']);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  'select code from public.tenants order by code',
  array['test-a']::text[],
  'test A user sees only the test A tenant'
);
select results_eq(
  'select code from public.companies order by code',
  array['TEST-A']::text[],
  'test A user sees only the test A company'
);
select results_eq(
  'select tenant_id::text from public.tenant_memberships',
  array['31000000-0000-4000-8000-000000000010']::text[],
  'test A user sees only their tenant membership'
);
select results_eq(
  'select company_id::text from public.company_memberships',
  array['31000000-0000-4000-8000-000000000020']::text[],
  'test A user sees only their company membership'
);
select is_empty(
  'select id from public.companies where id = ''32000000-0000-4000-8000-000000000020''',
  'test A user cannot infer the test B company'
);
select throws_ok(
  'insert into public.companies (id, tenant_id, code, name) values (''31000000-0000-4000-8000-000000000099'', ''31000000-0000-4000-8000-000000000010'', ''NOPE'', ''Direct insert'')',
  '42501',
  'permission denied for table companies',
  'authenticated users cannot write tenancy tables directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  'select code from public.companies order by code',
  array['TEST-B']::text[],
  'test B user sees only the test B company'
);
select is_empty(
  'select id from public.companies where id = ''31000000-0000-4000-8000-000000000020''',
  'test B user cannot infer the test A company'
);

select * from finish();
rollback;
