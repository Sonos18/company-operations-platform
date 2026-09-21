begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
declare
  v_tenant uuid := 'c1050000-0000-4000-8000-000000000010';
  v_company uuid := 'c1050000-0000-4000-8000-000000000020';
  v_reader uuid := 'c1050000-0000-4000-8000-000000000901';
  v_denied uuid := 'c1050000-0000-4000-8000-000000000902';
  v_role_reader uuid := 'c1050000-0000-4000-8000-000000000911';
  v_role_denied uuid := 'c1050000-0000-4000-8000-000000000912';
begin
  insert into auth.users(id,email) values (v_reader,'c105-reader@taskovia.invalid'),(v_denied,'c105-denied@taskovia.invalid');
  insert into public.tenants(id,code,name) values (v_tenant,'C105','C105 tenant');
  insert into public.companies(id,tenant_id,code,name) values (v_company,v_tenant,'C105','C105 company');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values (v_reader,v_tenant,array['member']),(v_denied,v_tenant,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values
    (v_reader,v_tenant,v_company,array['member'],true),(v_denied,v_tenant,v_company,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
    (v_role_reader,v_tenant,v_company,'c105_reader','C105 reader','Synthetic reader',false),
    (v_role_denied,v_tenant,v_company,'c105_denied','C105 denied','Synthetic denied',false);
  insert into public.role_permissions(role_id,permission_code) values (v_role_reader,'cost.read');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
    (v_tenant,v_company,v_reader,v_role_reader,v_reader,'C105'),(v_tenant,v_company,v_denied,v_role_denied,v_reader,'C105');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values (v_company,v_tenant,true,v_reader);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,operational_state,created_by) values
    ('c1050000-0000-4000-8000-000000000101',v_tenant,v_company,'C105-P1','Active','manual','active',v_reader),
    ('c1050000-0000-4000-8000-000000000102',v_tenant,v_company,'C105-P2','Completed','manual','completed',v_reader),
    ('c1050000-0000-4000-8000-000000000103',v_tenant,v_company,'C105-P3','Paused','manual','paused',v_reader),
    ('c1050000-0000-4000-8000-000000000104',v_tenant,v_company,'C105-P4','Unknown','manual','unknown',v_reader);
end $$;

do $$ begin
  if pg_catalog.has_function_privilege('authenticated','private.c1_read_project_finance_operational_states(uuid,uuid[])','execute')
    or not pg_catalog.has_function_privilege('authenticated','public.c1_read_project_finance_operational_states(uuid,uuid[])','execute') then
    raise exception 'C105_FINANCE_LIFECYCLE_ACL';
  end if;
end $$;
set local role anon;
do $$ begin
  perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',array['c1050000-0000-4000-8000-000000000101'::uuid]);
  raise exception 'C105_FINANCE_LIFECYCLE_ANON';
exception when insufficient_privilege then null; end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1050000-0000-4000-8000-000000000902","role":"authenticated"}',true);
do $$ begin
  perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',array['c1050000-0000-4000-8000-000000000101'::uuid]);
  raise exception 'C105_FINANCE_LIFECYCLE_DENIED';
exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end $$;
select set_config('request.jwt.claims','{"sub":"c1050000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$ declare v_rows jsonb; v_many uuid[]; begin
  if exists (select 1 from public.role_permissions where role_id='c1050000-0000-4000-8000-000000000911'::uuid and permission_code='project.register.manage') then raise exception 'C105_FINANCE_LIFECYCLE_MANAGEMENT_PERMISSION'; end if;
  if exists (select 1 from public.projects where company_id='c1050000-0000-4000-8000-000000000020'::uuid) then raise exception 'C105_FINANCE_LIFECYCLE_BROAD_PROJECT_READ'; end if;
  select public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',array[
    'c1050000-0000-4000-8000-000000000101'::uuid,'c1050000-0000-4000-8000-000000000102'::uuid,
    'c1050000-0000-4000-8000-000000000103'::uuid,'c1050000-0000-4000-8000-000000000104'::uuid
  ]) into v_rows;
  if jsonb_array_length(v_rows)<>4 or v_rows->0->>'operationalState'<>'active' or v_rows->1->>'operationalState'<>'completed'
    or v_rows->2->>'operationalState'<>'paused' or v_rows->3->>'operationalState'<>'unknown' then raise exception 'C105_FINANCE_LIFECYCLE_STATES'; end if;
  begin perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000021',array['c1050000-0000-4000-8000-000000000101'::uuid]); raise exception 'C105_FINANCE_LIFECYCLE_COMPANY'; exception when sqlstate 'P0001' then if sqlerrm<>'COMPANY_FORBIDDEN' then raise; end if; end;
  begin perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',array['c1050000-0000-4000-8000-000000000999'::uuid]); raise exception 'C105_FINANCE_LIFECYCLE_PROJECT'; exception when sqlstate 'P0001' then if sqlerrm<>'RESOURCE_NOT_FOUND' then raise; end if; end;
  begin perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',array[]::uuid[]); raise exception 'C105_FINANCE_LIFECYCLE_EMPTY'; exception when sqlstate 'P0001' then if sqlerrm<>'INPUT_INVALID' then raise; end if; end;
  begin perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',array['c1050000-0000-4000-8000-000000000101'::uuid,'c1050000-0000-4000-8000-000000000101'::uuid]); raise exception 'C105_FINANCE_LIFECYCLE_DUPLICATE'; exception when sqlstate 'P0001' then if sqlerrm<>'INPUT_INVALID' then raise; end if; end;
  begin perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',array[null::uuid]); raise exception 'C105_FINANCE_LIFECYCLE_NULL'; exception when sqlstate 'P0001' then if sqlerrm<>'INPUT_INVALID' then raise; end if; end;
  select array_agg(('c1050000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid) into v_many from generate_series(1,101) n;
  begin perform public.c1_read_project_finance_operational_states('c1050000-0000-4000-8000-000000000020',v_many); raise exception 'C105_FINANCE_LIFECYCLE_LIMIT'; exception when sqlstate 'P0001' then if sqlerrm<>'INPUT_INVALID' then raise; end if; end;
end $$;
-- Additional input-contract and exact-output checks, using the same synthetic actor.
do $$
declare
  v_rows jsonb;
begin
  begin
    perform public.c1_read_project_finance_operational_states(
      'c1050000-0000-4000-8000-000000000020',
      array[array['c1050000-0000-4000-8000-000000000101'::uuid],
            array['c1050000-0000-4000-8000-000000000102'::uuid]]);
    raise exception 'C105_FINANCE_LIFECYCLE_MULTIDIMENSIONAL';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'INPUT_INVALID' then raise; end if;
  end;
  begin
    perform public.c1_read_project_finance_operational_states(
      'c1050000-0000-4000-8000-000000000020', null::uuid[]);
    raise exception 'C105_FINANCE_LIFECYCLE_NULL_ARRAY';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'INPUT_INVALID' then raise; end if;
  end;
  select public.c1_read_project_finance_operational_states(
    'c1050000-0000-4000-8000-000000000020', array[
      'c1050000-0000-4000-8000-000000000104'::uuid,
      'c1050000-0000-4000-8000-000000000103'::uuid,
      'c1050000-0000-4000-8000-000000000102'::uuid,
      'c1050000-0000-4000-8000-000000000101'::uuid
    ]) into v_rows;
  if v_rows is distinct from '[
    {"projectId":"c1050000-0000-4000-8000-000000000101","operationalState":"active"},
    {"projectId":"c1050000-0000-4000-8000-000000000102","operationalState":"completed"},
    {"projectId":"c1050000-0000-4000-8000-000000000103","operationalState":"paused"},
    {"projectId":"c1050000-0000-4000-8000-000000000104","operationalState":"unknown"}
  ]'::jsonb then raise exception 'C105_FINANCE_LIFECYCLE_EXACT_SORTED_RESPONSE'; end if;
end $$;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  perform public.c1_read_project_finance_operational_states(
    'c1050000-0000-4000-8000-000000000020',
    array['c1050000-0000-4000-8000-000000000101'::uuid]);
  raise exception 'C105_FINANCE_LIFECYCLE_MISSING_ACTOR';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
end $$;
reset role;
do $$ begin
  if pg_catalog.has_function_privilege('service_role','public.c1_read_project_finance_operational_states(uuid,uuid[])','execute')
    or pg_catalog.has_function_privilege('service_role','private.c1_read_project_finance_operational_states(uuid,uuid[])','execute')
    or pg_catalog.has_function_privilege('anon','public.c1_read_project_finance_operational_states(uuid,uuid[])','execute')
    or pg_catalog.has_function_privilege('anon','private.c1_read_project_finance_operational_states(uuid,uuid[])','execute') then
    raise exception 'C105_FINANCE_LIFECYCLE_EXCESS_EXECUTE_GRANT';
  end if;
end $$;
update public.company_cost_settings set enabled=false
where tenant_id='c1050000-0000-4000-8000-000000000010'
  and company_id='c1050000-0000-4000-8000-000000000020';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1050000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$ begin
  perform public.c1_read_project_finance_operational_states(
    'c1050000-0000-4000-8000-000000000020',
    array['c1050000-0000-4000-8000-000000000101'::uuid]);
  raise exception 'C105_FINANCE_LIFECYCLE_DISABLED_MODULE';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'MODULE_DISABLED' then raise; end if;
end $$;
reset role;
select jsonb_build_object('original_c105_suite','PASS','multidimensional_input','INPUT_INVALID','null_array','INPUT_INVALID','reverse_order_exact_response','PASS','missing_actor','PERMISSION_DENIED','module_disabled','MODULE_DISABLED','anon_and_service_role_acl','DENIED','transaction','rollback-only') as lifecycle_fixture_results;
rollback;
