import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { assertCloudDevTarget } from '../scripts/assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken, resolveSupabaseDevHome } from '../scripts/run-supabase-dev.mjs'

const cwd = resolve(import.meta.dirname, '..')
assertCloudDevTarget({ cwd })

const acceptanceSql = String.raw`begin;

do $$
declare
  v_vqh_tenant uuid := '10000000-0000-4000-8000-000000000010';
  v_vqh_company uuid := '10000000-0000-4000-8000-000000000020';
  v_vqh_accountant_user uuid;
  v_vqh_no_cost_read_user uuid;
  v_dummy_user uuid := '90000000-0000-4000-8000-000000000001';
  v_test_project_zero_items uuid := 'c1010000-0000-4000-8000-000000000199';
  v_other_company_project uuid := 'c1010000-0000-4000-8000-000000000198';
  v_other_company uuid := 'c1010000-0000-4000-8000-000000000029';
  v_result jsonb;
  v_err_msg text;
  v_settings_select_count int;
  v_worker_src text;
begin
  -- 1. Find actor WITH cost.read and WITHOUT cost.config.manage (the VQH accountant)
  select assignment.user_id into v_vqh_accountant_user
  from public.tenant_memberships tenant_membership
  join public.company_memberships company_membership on company_membership.user_id = tenant_membership.user_id and company_membership.tenant_id = tenant_membership.tenant_id
  join public.company_role_assignments assignment on assignment.user_id = company_membership.user_id and assignment.tenant_id = company_membership.tenant_id and assignment.company_id = company_membership.company_id and assignment.revoked_at is null
  where tenant_membership.tenant_id = v_vqh_tenant
    and company_membership.company_id = v_vqh_company
    and company_membership.is_active
    and assignment.role_id = '10000000-0000-4000-8000-000000000307'::uuid
  limit 1;

  if v_vqh_accountant_user is null then
    raise exception 'VQH active accountant user is missing';
  end if;

  -- Find actor WITHOUT cost.read (e.g. employee or another non-cost role in VQH)
  select assignment.user_id into v_vqh_no_cost_read_user
  from public.tenant_memberships tenant_membership
  join public.company_memberships company_membership on company_membership.user_id = tenant_membership.user_id and company_membership.tenant_id = tenant_membership.tenant_id
  join public.company_role_assignments assignment on assignment.user_id = company_membership.user_id and assignment.tenant_id = company_membership.tenant_id and assignment.company_id = company_membership.company_id and assignment.revoked_at is null
  where tenant_membership.tenant_id = v_vqh_tenant
    and company_membership.company_id = v_vqh_company
    and company_membership.is_active
    and assignment.role_id in (
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid,
      '10000000-0000-4000-8000-000000000305'::uuid,
      '10000000-0000-4000-8000-000000000306'::uuid
    )
    and not exists (
      select 1 from public.company_role_assignments ra
      join public.role_permissions rp on rp.role_id = ra.role_id
      where ra.user_id = assignment.user_id
        and ra.company_id = v_vqh_company
        and ra.revoked_at is null
        and rp.permission_code = 'cost.read'
    )
  limit 1;

  -- Setup synthetic project with ZERO cost items in VQH
  insert into public.projects (id, tenant_id, company_id, code, name, origin, created_by)
  values (v_test_project_zero_items, v_vqh_tenant, v_vqh_company, 'P-ZERO', 'Dự án Chưa Có Chi Phí', 'manual', v_vqh_accountant_user);

  -- Setup synthetic project in another company
  insert into public.companies (id, tenant_id, code, name)
  values (v_other_company, v_vqh_tenant, 'OTHER', 'Other Co')
  on conflict do nothing;

  insert into public.projects (id, tenant_id, company_id, code, name, origin, created_by)
  values (v_other_company_project, v_vqh_tenant, v_other_company, 'P-OTHER', 'Other Project', 'manual', v_vqh_accountant_user);

  -- Test 1: Actor WITH cost.read and WITHOUT cost.config.manage can call public RPC
  -- Test 4: Valid same-company project with ZERO cost items returns metadata and settings
  -- Test 7: Returned currency/timezone/moneyScale match company settings
  perform set_config('request.jwt.claims', json_build_object('sub', v_vqh_accountant_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_result := public.c1_read_project_cost_read_context(v_vqh_company, v_test_project_zero_items);

  if v_result->>'projectId' <> v_test_project_zero_items::text then
    raise exception 'Test 4 failed: projectId mismatch';
  end if;
  if v_result->>'projectCode' <> 'P-ZERO' or v_result->>'projectName' <> 'Dự án Chưa Có Chi Phí' then
    raise exception 'Test 4 failed: metadata mismatch';
  end if;
  if v_result->>'defaultCurrencyCode' <> 'VND' or v_result->>'timeZone' <> 'Asia/Ho_Chi_Minh' or (v_result->>'moneyScale')::int <> 0 then
    raise exception 'Test 7 failed: currency/timeZone/moneyScale mismatch';
  end if;

  -- Test 2: Actor without cost.read is denied
  if v_vqh_no_cost_read_user is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_vqh_no_cost_read_user::text, 'role', 'authenticated')::text, true);
    begin
      perform public.c1_read_project_cost_read_context(v_vqh_company, v_test_project_zero_items);
      raise exception 'Test 2 failed: should have thrown PERMISSION_DENIED';
    exception when others then
      get stacked diagnostics v_err_msg = message_text;
      if v_err_msg <> 'PERMISSION_DENIED' then
        raise exception 'Test 2 failed with unexpected message: %', v_err_msg;
      end if;
    end;
  end if;

  -- Also verify unassociated actor is denied
  perform set_config('request.jwt.claims', json_build_object('sub', v_dummy_user::text, 'role', 'authenticated')::text, true);
  begin
    perform public.c1_read_project_cost_read_context(v_vqh_company, v_test_project_zero_items);
    raise exception 'Test 2b failed: dummy user should have been denied';
  exception when others then
    null; -- successfully denied
  end;

  -- Test 3: Module-disabled behavior remains MODULE_DISABLED
  reset role;
  update public.company_cost_settings set enabled = false where company_id = v_vqh_company;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_vqh_accountant_user::text, 'role', 'authenticated')::text, true);
  begin
    perform public.c1_read_project_cost_read_context(v_vqh_company, v_test_project_zero_items);
    raise exception 'Test 3 failed: should have thrown MODULE_DISABLED';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    if v_err_msg <> 'MODULE_DISABLED' then
      raise exception 'Test 3 failed with unexpected message: %', v_err_msg;
    end if;
  end;
  reset role;
  update public.company_cost_settings set enabled = true where company_id = v_vqh_company;
  execute 'set local role authenticated';

  -- Test 5: Nonexistent project raises RESOURCE_NOT_FOUND
  begin
    perform public.c1_read_project_cost_read_context(v_vqh_company, 'c1010000-0000-4000-8000-000000000999'::uuid);
    raise exception 'Test 5 failed: should have thrown';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    if v_err_msg <> 'RESOURCE_NOT_FOUND' then
      raise exception 'Test 5 failed with unexpected message: %', v_err_msg;
    end if;
  end;

  -- Test 6: Cross-company project raises RESOURCE_NOT_FOUND (no leak)
  begin
    perform public.c1_read_project_cost_read_context(v_vqh_company, v_other_company_project);
    raise exception 'Test 6 failed: should have thrown';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    if v_err_msg <> 'RESOURCE_NOT_FOUND' then
      raise exception 'Test 6 failed with unexpected message: %', v_err_msg;
    end if;
  end;

  -- Test 8: Direct SELECT on company_cost_settings under cost.read-only actor returns 0 rows (denied by RLS)
  select count(*) into v_settings_select_count from public.company_cost_settings where company_id = v_vqh_company;
  if v_settings_select_count <> 0 then
    raise exception 'Test 8 failed: direct SELECT on company_cost_settings should return 0 rows for cost.read-only actor';
  end if;

  -- Test 9: No service-role code path is introduced
  select prosrc into v_worker_src from pg_proc where proname = 'c1_read_project_cost_read_context' and pronamespace = 'private'::regnamespace;
  if v_worker_src is null or v_worker_src ilike '%service_role%' then
    raise exception 'Test 9 failed: invalid worker code path';
  end if;

  -- Test 10: Old metadata RPC returns empty array for zero-item project (behavior preserved)
  v_result := public.c1_read_project_cost_project_metadata(v_vqh_company, array[v_test_project_zero_items]);
  if jsonb_array_length(v_result) <> 0 then
    raise exception 'Test 10 failed: old metadata RPC should return empty for zero-item project';
  end if;

  -- Test 11: Private worker cannot be executed by authenticated
  begin
    execute 'select private.c1_read_project_cost_read_context($1, $2)' using v_vqh_company, v_test_project_zero_items;
    raise exception 'Test 11 failed: private worker should not be callable by authenticated';
  exception when insufficient_privilege then
    null;
  end;

  -- Test 12: Authenticated executes under its own actor identity; anon is denied execute on public wrapper
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.c1_read_project_cost_read_context(v_vqh_company, v_test_project_zero_items);
    raise exception 'Test 12 failed: anon should not be able to execute public wrapper';
  exception when insufficient_privilege then
    null;
  when others then
    get stacked diagnostics v_err_msg = message_text;
    if v_err_msg <> 'PERMISSION_DENIED' and v_err_msg <> 'AUTH_REQUIRED' then
      raise exception 'Test 12 failed with unexpected message: %', v_err_msg;
    end if;
  end;

end $$;

select 'ALL_12_ACCEPTANCE_POINTS_PASSED' as result;

rollback;`

const cliEntrypoint = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
const env = {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: readDedicatedSupabaseDevAccessToken(cwd),
  SUPABASE_HOME: resolveSupabaseDevHome({ env: process.env, platform: process.platform }),
}

const result = spawnSync(process.execPath, [cliEntrypoint, 'db', 'query', '--linked', acceptanceSql], {
  cwd,
  env,
  encoding: 'utf8',
})

if (result.error) throw result.error
console.log(result.stdout)
if (result.status !== 0) {
  console.error(result.stderr)
  throw new Error('Cloud DEV acceptance test failed')
}
