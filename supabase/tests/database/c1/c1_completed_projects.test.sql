begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
declare
  v_tenant uuid := 'c1f40000-0000-4000-8000-000000000010';
  v_company uuid := 'c1f40000-0000-4000-8000-000000000020';
  v_reader uuid := 'c1f40000-0000-4000-8000-000000000901';
  v_denied uuid := 'c1f40000-0000-4000-8000-000000000902';
  v_role_reader uuid := 'c1f40000-0000-4000-8000-000000000911';
  v_role_denied uuid := 'c1f40000-0000-4000-8000-000000000912';
begin
  insert into auth.users(id,email) values (v_reader,'c1f4-reader@taskovia.invalid'),(v_denied,'c1f4-denied@taskovia.invalid');
  insert into public.tenants(id,code,name) values (v_tenant,'C1F4','C1F4 tenant');
  insert into public.companies(id,tenant_id,code,name) values (v_company,v_tenant,'C1F4','C1F4 company');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values (v_reader,v_tenant,array['member']),(v_denied,v_tenant,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values
    (v_reader,v_tenant,v_company,array['member'],true),(v_denied,v_tenant,v_company,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
    (v_role_reader,v_tenant,v_company,'c1f4_reader','C1F4 reader','Synthetic reader',false),
    (v_role_denied,v_tenant,v_company,'c1f4_denied','C1F4 denied','Synthetic denied',false);
  insert into public.role_permissions(role_id,permission_code) values (v_role_reader,'cost.read');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
    (v_tenant,v_company,v_reader,v_role_reader,v_reader,'C1F4'),(v_tenant,v_company,v_denied,v_role_denied,v_reader,'C1F4');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values (v_company,v_tenant,true,v_reader);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,operational_state,created_by) values
    ('c1f40000-0000-4000-8000-000000000101',v_tenant,v_company,'C1F4-P1','Active','manual','active',v_reader),
    ('c1f40000-0000-4000-8000-000000000102',v_tenant,v_company,'C1F4-P2','Completed','manual','completed',v_reader),
    ('c1f40000-0000-4000-8000-000000000103',v_tenant,v_company,'C1F4-P3','Paused','manual','paused',v_reader),
    ('c1f40000-0000-4000-8000-000000000104',v_tenant,v_company,'C1F4-P4','Unknown','manual','unknown',v_reader);
end $$;

-- Directory ordering is global across small pages, not UUID-only.
update public.projects set updated_at='2026-01-01T00:00:00Z'
where company_id='c1f40000-0000-4000-8000-000000000020' and operational_state <> 'completed';
insert into public.projects(id,tenant_id,company_id,code,name,origin,operational_state,created_by,updated_at) values
('c1f40000-0000-4000-8000-000000000105','c1f40000-0000-4000-8000-000000000010','c1f40000-0000-4000-8000-000000000020','C1F4-P5','Newer active','manual','active','c1f40000-0000-4000-8000-000000000901','2026-10-03T00:00:00.000002Z'),
('c1f40000-0000-4000-8000-000000000106','c1f40000-0000-4000-8000-000000000010','c1f40000-0000-4000-8000-000000000020','C1F4-P6','Older active','manual','active','c1f40000-0000-4000-8000-000000000901','2026-10-03T00:00:00.000001Z');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f40000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$
declare v_page jsonb; v_after uuid; v_ids uuid[] := array[]::uuid[]; v_expected uuid[];
begin
  loop
    v_page:=public.c1_read_project_finance_directory_v2('c1f40000-0000-4000-8000-000000000020',v_after,1);
    if jsonb_array_length(v_page->'projects') <> 1 or v_page->'projects'->0->>'updatedAt' is null then raise exception 'C1F4_DIRECTORY_METADATA'; end if;
    v_ids:=array_append(v_ids,(v_page->'projects'->0->>'projectId')::uuid);
    v_after:=(v_page->>'nextCursor')::uuid;
    exit when v_after is null;
    if cardinality(v_ids)>6 then raise exception 'C1F4_DIRECTORY_CURSOR_STUCK'; end if;
  end loop;
  v_expected:=array[
    'c1f40000-0000-4000-8000-000000000105'::uuid,'c1f40000-0000-4000-8000-000000000106'::uuid,
    'c1f40000-0000-4000-8000-000000000101'::uuid,'c1f40000-0000-4000-8000-000000000103'::uuid,
    'c1f40000-0000-4000-8000-000000000104'::uuid,'c1f40000-0000-4000-8000-000000000102'::uuid];
  if v_ids is distinct from v_expected then raise exception 'C1F4_DIRECTORY_ORDER'; end if;
  begin
    perform public.c1_read_project_finance_directory_v2('c1f40000-0000-4000-8000-000000000020','c1f40000-0000-4000-8000-000000000999',1);
    raise exception 'C1F4_CURSOR_SCOPE';
  exception when sqlstate 'P0001' then if sqlerrm<>'RESOURCE_NOT_FOUND' then raise; end if; end;
end $$;
-- Permission remains checked before any scoped metadata is revealed.
select set_config('request.jwt.claims','{"sub":"c1f40000-0000-4000-8000-000000000902","role":"authenticated"}',true);
do $$ begin
  perform public.c1_read_project_finance_directory_v2('c1f40000-0000-4000-8000-000000000020',null,1);
  raise exception 'C1F4_DIRECTORY_AUTH';
exception when sqlstate 'P0001' then if sqlerrm<>'PERMISSION_DENIED' then raise; end if; end $$;
reset role;

-- Storage/table triggers are the final authority, even for privileged callers.
do $$
declare v_table text; v_count integer;
begin
  begin update public.projects set name='changed' where id='c1f40000-0000-4000-8000-000000000102'; raise exception 'C1F4_EDIT_COMPLETED';
  exception when sqlstate 'P0001' then if sqlerrm<>'PROJECT_COMPLETED' then raise; end if; end;
  begin update public.projects set operational_state='active' where id='c1f40000-0000-4000-8000-000000000102'; raise exception 'C1F4_REOPEN_COMPLETED';
  exception when sqlstate 'P0001' then if sqlerrm<>'PROJECT_COMPLETED' then raise; end if; end;
  begin delete from public.projects where id='c1f40000-0000-4000-8000-000000000102'; raise exception 'C1F4_DELETE_COMPLETED';
  exception when sqlstate 'P0001' then if sqlerrm<>'PROJECT_COMPLETED' then raise; end if; end;

  foreach v_table in array array['project_cost_items','project_engagements','project_budget_versions','project_budget_lines','project_owner_advances','project_subcontracts','project_subcontract_payments','project_cost_reconciliation_resolutions','cost_evidence_files','cost_evidence_links'] loop
    begin
      execute format('insert into public.%I(tenant_id,company_id,project_id) values ($1,$2,$3)',v_table)
      using 'c1f40000-0000-4000-8000-000000000010'::uuid,'c1f40000-0000-4000-8000-000000000020'::uuid,'c1f40000-0000-4000-8000-000000000102'::uuid;
      raise exception 'C1F4_COMPLETED_WRITE_ALLOWED: %',v_table;
    exception when sqlstate 'P0001' then if sqlerrm<>'PROJECT_COMPLETED' then raise; end if; end;
  end loop;
  -- Also ensure indirect child/evidence tables have active guards.
  select count(*) into v_count from pg_trigger
  where tgname='a_c1_completed_project_guard' and not tgisinternal and tgenabled='O'
    and tgrelid in ('public.project_cost_item_details'::regclass,'public.project_cost_item_sources'::regclass,'public.project_cost_item_detail_sources'::regclass,'public.engagement_components'::regclass);
  if v_count<>4 then raise exception 'C1F4_CHILD_GUARD_MISSING'; end if;
  if pg_catalog.has_function_privilege('authenticated','private.c1_lock_writable_project(uuid,uuid,uuid)','execute')
    or pg_catalog.has_function_privilege('anon','private.c1_guard_completed_project_write()','execute') then raise exception 'C1F4_PRIVATE_GUARD_ACL'; end if;
  perform private.c1_lock_writable_project('c1f40000-0000-4000-8000-000000000010','c1f40000-0000-4000-8000-000000000020','c1f40000-0000-4000-8000-000000000101');
  begin perform private.c1_lock_writable_project('c1f40000-0000-4000-8000-000000000010','c1f40000-0000-4000-8000-000000000020','c1f40000-0000-4000-8000-000000000102'); raise exception 'C1F4_COMPLETED_LOCK';
  exception when sqlstate 'P0001' then if sqlerrm<>'PROJECT_COMPLETED' then raise; end if; end;
end $$;
rollback;
