import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { runSupabaseDevCli } from './run-supabase-dev.mjs'

export const VQH_RLS_SMOKE_SQL = String.raw`begin;
do $$
declare
  member_id uuid;
  member_tenant_count integer;
  member_company_count integer;
  non_member_tenant_count integer;
  non_member_company_count integer;
begin
  select user_id
    into member_id
    from public.tenant_memberships
    where tenant_id = '10000000-0000-4000-8000-000000000010'
      and roles @> array['tenant_admin']::text[]
    limit 1;
  if not found then
    raise exception 'VQH tenant admin membership is missing';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', member_id::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select count(*) into member_tenant_count
    from public.tenants
    where id = '10000000-0000-4000-8000-000000000010';
  select count(*) into member_company_count
    from public.companies
    where id = '10000000-0000-4000-8000-000000000020'
      and tenant_id = '10000000-0000-4000-8000-000000000010';
  if member_tenant_count <> 1 or member_company_count <> 1 then
    raise exception 'VQH member visibility check failed';
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );

  select count(*) into non_member_tenant_count from public.tenants;
  select count(*) into non_member_company_count from public.companies;
  if non_member_tenant_count <> 0 or non_member_company_count <> 0 then
    raise exception 'VQH non-member visibility check failed';
  end if;
end $$;
select 'PASS' as result;
rollback;`

export function runVqhRlsSmoke() {
  assertCloudDevTarget()
  const result = runSupabaseDevCli(['db', 'query', '--linked', VQH_RLS_SMOKE_SQL])
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runVqhRlsSmoke()
}
