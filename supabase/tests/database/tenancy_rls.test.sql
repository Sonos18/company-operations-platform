begin;
select plan(8);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  'select code from public.tenants order by code',
  array['vqh']::text[],
  'VQH user sees only the VQH tenant'
);
select results_eq(
  'select code from public.companies order by code',
  array['VQH']::text[],
  'VQH user sees only the VQH company'
);
select results_eq(
  'select tenant_id::text from public.tenant_memberships',
  array['10000000-0000-4000-8000-000000000010']::text[],
  'VQH user sees only their tenant membership'
);
select results_eq(
  'select company_id::text from public.company_memberships',
  array['10000000-0000-4000-8000-000000000020']::text[],
  'VQH user sees only their company membership'
);
select is_empty(
  'select id from public.companies where id = ''20000000-0000-4000-8000-000000000020''',
  'VQH user cannot infer the isolation company'
);
select throws_ok(
  'insert into public.companies (id, tenant_id, code, name) values (''10000000-0000-4000-8000-000000000099'', ''10000000-0000-4000-8000-000000000010'', ''NOPE'', ''Direct insert'')',
  '42501',
  'permission denied for table companies',
  'authenticated users cannot write tenancy tables directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  'select code from public.companies order by code',
  array['ISO']::text[],
  'isolation user sees only the isolation company'
);
select is_empty(
  'select id from public.companies where id = ''10000000-0000-4000-8000-000000000020''',
  'isolation user cannot infer the VQH company'
);

select * from finish();
rollback;
