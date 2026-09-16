begin;

do $$
declare
  tenant_a constant uuid := 'c1010000-0000-4000-8000-000000000010';
  company_a constant uuid := 'c1010000-0000-4000-8000-000000000020';
  company_disabled constant uuid := 'c1010000-0000-4000-8000-000000000021';
  tenant_b constant uuid := 'c1010000-0000-4000-8000-000000000011';
  company_b constant uuid := 'c1010000-0000-4000-8000-000000000022';
  reader constant uuid := 'c1010000-0000-4000-8000-000000000901';
  manager constant uuid := 'c1010000-0000-4000-8000-000000000902';
  corrector constant uuid := 'c1010000-0000-4000-8000-000000000903';
  denied constant uuid := 'c1010000-0000-4000-8000-000000000904';
begin
  insert into auth.users(id, email) values
    (reader, 'c101-reader@taskovia.invalid'), (manager, 'c101-manager@taskovia.invalid'),
    (corrector, 'c101-corrector@taskovia.invalid'), (denied, 'c101-denied@taskovia.invalid');
  insert into public.tenants(id, code, name) values (tenant_a, 'C101-A', 'C101 synthetic tenant A'), (tenant_b, 'C101-B', 'C101 synthetic tenant B');
  insert into public.companies(id, tenant_id, code, name) values
    (company_a, tenant_a, 'C101-A1', 'C101 synthetic company A'),
    (company_disabled, tenant_a, 'C101-A2', 'C101 synthetic company disabled'),
    (company_b, tenant_b, 'C101-B1', 'C101 synthetic company B');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    (reader, tenant_a, array['member']), (manager, tenant_a, array['member']),
    (corrector, tenant_a, array['member']), (denied, tenant_a, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    (reader, tenant_a, company_a, array['member'], true), (manager, tenant_a, company_a, array['member'], true),
    (corrector, tenant_a, company_a, array['member'], true), (denied, tenant_a, company_a, array['member'], true),
    (manager, tenant_a, company_disabled, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1010000-0000-4000-8000-000000000911', tenant_a, company_a, 'c101_reader', 'C101 reader', 'Synthetic read role', false),
    ('c1010000-0000-4000-8000-000000000912', tenant_a, company_a, 'c101_manager', 'C101 manager', 'Synthetic manage role', false),
    ('c1010000-0000-4000-8000-000000000913', tenant_a, company_a, 'c101_corrector', 'C101 corrector', 'Synthetic correct role', false),
    ('c1010000-0000-4000-8000-000000000914', tenant_a, company_a, 'c101_denied', 'C101 denied', 'Synthetic denied role', false),
    ('c1010000-0000-4000-8000-000000000915', tenant_a, company_disabled, 'c101_disabled_manager', 'C101 disabled manager', 'Synthetic disabled role', false);
  insert into public.role_permissions(role_id, permission_code) values
    ('c1010000-0000-4000-8000-000000000911', 'cost.read'),
    ('c1010000-0000-4000-8000-000000000912', 'cost.read'), ('c1010000-0000-4000-8000-000000000912', 'cost.manage'),
    ('c1010000-0000-4000-8000-000000000913', 'cost.read'), ('c1010000-0000-4000-8000-000000000913', 'cost.correct'),
    ('c1010000-0000-4000-8000-000000000915', 'cost.manage');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_a, company_a, reader, 'c1010000-0000-4000-8000-000000000911', manager, 'C101 fixture'),
    (tenant_a, company_a, manager, 'c1010000-0000-4000-8000-000000000912', manager, 'C101 fixture'),
    (tenant_a, company_a, corrector, 'c1010000-0000-4000-8000-000000000913', manager, 'C101 fixture'),
    (tenant_a, company_a, denied, 'c1010000-0000-4000-8000-000000000914', manager, 'C101 fixture'),
    (tenant_a, company_disabled, manager, 'c1010000-0000-4000-8000-000000000915', manager, 'C101 fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by) values (company_a, tenant_a, true, manager), (company_disabled, tenant_a, false, manager);
  insert into public.projects(id, tenant_id, company_id, code, name, origin, created_by) values
    ('c1010000-0000-4000-8000-000000000101', tenant_a, company_a, 'C101-P1', 'C101 project one', 'manual', manager),
    ('c1010000-0000-4000-8000-000000000102', tenant_a, company_a, 'C101-P2', 'C101 project two', 'manual', manager),
    ('c1010000-0000-4000-8000-000000000103', tenant_b, company_b, 'C101-P3', 'C101 project foreign', 'manual', manager);
  insert into public.business_parties(id, tenant_id, company_id, code, display_name, party_kind, created_by) values
    ('c1010000-0000-4000-8000-000000000201', tenant_a, company_a, 'C101-PARTY', 'C101 party', 'organization', manager);
  insert into public.project_engagements(id, tenant_id, company_id, project_id, party_id, code, name, currency_code, created_by) values
    ('c1010000-0000-4000-8000-000000000301', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'c1010000-0000-4000-8000-000000000201', 'C101-ENG', 'C101 engagement', 'VND', manager);
  insert into public.engagement_components(id, tenant_id, company_id, engagement_id, code, name, pricing_method, created_by) values
    ('c1010000-0000-4000-8000-000000000401', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000301', 'C101-COMP', 'C101 component', 'fixed', manager);
  insert into public.controlled_import_runs(id, tenant_id, company_id, run_id, actor_id, idempotency_key, payload_digest, manifest_digest, input_digests, workbook_family, adapter_id, adapter_version, manifest_snapshot, request_id) values
    ('c1010000-0000-4000-8000-000000000501', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000502', manager, 'c1010000-0000-4000-8000-000000000503', repeat('a', 64), repeat('b', 64), array[repeat('c', 64)], 'c101-workbook', 'c101-adapter', '1', '{}'::jsonb, 'c1010000-0000-4000-8000-000000000504');
  insert into public.accounting_sources(id, tenant_id, company_id, code, title, source_system, created_by) values ('c1010000-0000-4000-8000-000000000601', tenant_a, company_a, 'C101-SOURCE', 'C101 source', 'synthetic', manager);
  insert into public.accounting_source_versions(id, tenant_id, company_id, source_id, import_run_id, version_no, input_file_identity, input_file_sha256, original_filename, created_by) values ('c1010000-0000-4000-8000-000000000602', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000601', 'c1010000-0000-4000-8000-000000000501', 1, 'c101.xlsx', repeat('d', 64), 'c101.xlsx', manager);
  insert into public.source_selections(id, tenant_id, company_id, source_version_id, import_run_id, locator, locator_key, mapping_state, reviewed_mapping, observed_labels, raw_values, unresolved_issues, created_by) values ('c1010000-0000-4000-8000-000000000603', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000602', 'c1010000-0000-4000-8000-000000000501', '{"kind":"logical_section"}'::jsonb, 'c101-selection', 'pending', '{}'::jsonb, array['C101'], array['100'], array[]::text[], manager);
  insert into public.source_reported_figures(id, tenant_id, company_id, source_selection_id, import_run_id, figure_identity, label, raw_value_text, value_state, amount_text, amount, metric_kind, basis, rounding_basis, period_basis, mapping_state, reviewed_mapping, scope_kind, scope_description, confirmation, created_by) values ('c1010000-0000-4000-8000-000000000604', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000603', 'c1010000-0000-4000-8000-000000000501', repeat('e', 64), 'C101 figure', '100', 'known', '100', 100, 'cost_total', 'net', 'exact', 'unknown', 'pending', '{}'::jsonb, 'whole_project', 'C101 evidence', 'unverified', manager);
end;
$$;

do $$
begin
  if pg_catalog.has_table_privilege('authenticated', 'public.project_cost_items', 'insert') or pg_catalog.has_table_privilege('authenticated', 'public.project_cost_items', 'update') or pg_catalog.has_table_privilege('authenticated', 'public.project_cost_items', 'delete') or pg_catalog.has_table_privilege('authenticated', 'public.project_cost_item_sources', 'insert') then raise exception 'C1_PC_PERMISSION_BOUNDARY direct authenticated writes granted'; end if;
  if pg_catalog.has_function_privilege('authenticated', 'private.c1_create_project_cost_item(uuid,jsonb,uuid,uuid)', 'execute') or pg_catalog.has_function_privilege('authenticated', 'private.c1_update_project_cost_item(uuid,uuid,jsonb,uuid)', 'execute') or pg_catalog.has_function_privilege('authenticated', 'private.c1_correct_project_cost_item(uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'C1_PC_PERMISSION_BOUNDARY private command execute granted'; end if;
end;
$$;

set local role anon;
do $$ begin
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', '{}'::jsonb, 'c1010000-0000-4000-8000-000000000701', 'c1010000-0000-4000-8000-000000000702'); raise exception 'C1_PC_PERMISSION_BOUNDARY anonymous RPC succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1010000-0000-4000-8000-000000000902","role":"authenticated"}', true);
do $$
declare first_create jsonb; replay jsonb; item_id uuid; item_version bigint;
begin
  select public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 tracked item','amount','100.0000','currencyCode','VND','workStatus','in_progress','nonOverlapConfirmationReference','C101-confirmation'), 'c1010000-0000-4000-8000-000000000711', 'c1010000-0000-4000-8000-000000000712') into first_create;
  item_id := (first_create->>'id')::uuid;
  if item_id is null or (first_create->>'version')::bigint <> 0 or (first_create->>'replayed')::boolean then raise exception 'C1_PC_IDEMPOTENCY first create result invalid'; end if;
  select public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 tracked item','amount','100.0000','currencyCode','VND','workStatus','in_progress','nonOverlapConfirmationReference','C101-confirmation'), 'c1010000-0000-4000-8000-000000000711', 'c1010000-0000-4000-8000-000000000713') into replay;
  if (replay->>'id')::uuid is distinct from item_id or (replay->>'version')::bigint <> 0 or not (replay->>'replayed')::boolean or (select count(*) from public.project_cost_items where id = item_id) <> 1 then raise exception 'C1_PC_IDEMPOTENCY replay created another item'; end if;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 changed payload','amount','100.0000','currencyCode','VND','workStatus','in_progress','nonOverlapConfirmationReference','C101-confirmation'), 'c1010000-0000-4000-8000-000000000711', 'c1010000-0000-4000-8000-000000000714'); raise exception 'C1_PC_IDEMPOTENCY conflict missing'; exception when sqlstate 'P0001' then if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  select public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 hierarchical item','amount','20','currencyCode','VND','workStatus','accepted','businessReference','C101-REF','partyId','c1010000-0000-4000-8000-000000000201','engagementId','c1010000-0000-4000-8000-000000000301','componentId','c1010000-0000-4000-8000-000000000401','relevantDate','2026-09-16','nonOverlapConfirmationReference','C101-confirmation-2'), 'c1010000-0000-4000-8000-000000000715', 'c1010000-0000-4000-8000-000000000716');
  select public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000102','description','C101 same reference other project','amount','10','currencyCode','VND','workStatus','unknown','businessReference','C101-REF','nonOverlapConfirmationReference','C101-confirmation-3'), 'c1010000-0000-4000-8000-000000000717', 'c1010000-0000-4000-8000-000000000718');
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 duplicate reference','amount','10','currencyCode','VND','workStatus','unknown','businessReference','C101-REF','nonOverlapConfirmationReference','C101-confirmation-4'), 'c1010000-0000-4000-8000-000000000719', 'c1010000-0000-4000-8000-000000000720'); raise exception 'C1_PC_F05_REFERENCE duplicate accepted'; exception when unique_violation then null; end;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 invalid amount','amount','-1','currencyCode','VND','workStatus','unknown','nonOverlapConfirmationReference','C101-x'), 'c1010000-0000-4000-8000-000000000721', 'c1010000-0000-4000-8000-000000000722'); raise exception 'C1_PC_MONEY negative accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'INPUT_INVALID' then raise; end if; end;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 precision','amount','1.00001','currencyCode','VND','workStatus','unknown','nonOverlapConfirmationReference','C101-x'), 'c1010000-0000-4000-8000-000000000732', 'c1010000-0000-4000-8000-000000000733'); raise exception 'C1_PC_MONEY precision accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'INPUT_INVALID' then raise; end if; end;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 status','amount','1','currencyCode','VND','workStatus','paid','nonOverlapConfirmationReference','C101-x'), 'c1010000-0000-4000-8000-000000000734', 'c1010000-0000-4000-8000-000000000735'); raise exception 'C1_PC_MONEY status accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'INPUT_INVALID' then raise; end if; end;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 invalid date','amount','1','currencyCode','VND','workStatus','unknown','relevantDate','2026-02-31','nonOverlapConfirmationReference','C101-x'), 'c1010000-0000-4000-8000-000000000723', 'c1010000-0000-4000-8000-000000000724'); raise exception 'C1_PC_MONEY calendar date accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'INPUT_INVALID' then raise; end if; end;
  select public.c1_update_project_cost_item('c1010000-0000-4000-8000-000000000020', item_id, jsonb_build_object('workStatus','accepted','expectedVersion',0), 'c1010000-0000-4000-8000-000000000725');
  select version into item_version from public.project_cost_items where id = item_id;
  if item_version <> 1 or (select work_status from public.project_cost_items where id = item_id) <> 'accepted' or (select count(*) from public.project_cost_items where description = 'C101 tracked item') <> 1 then raise exception 'C1_PC_F04_SAME_ROW transition created successor'; end if;
  begin perform public.c1_update_project_cost_item('c1010000-0000-4000-8000-000000000020', item_id, jsonb_build_object('description','C101 stale','expectedVersion',0), 'c1010000-0000-4000-8000-000000000726'); raise exception 'C1_PC_VERSION_CONFLICT stale update accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'VERSION_CONFLICT' then raise; end if; end;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000102','description','C101 cross project engagement','amount','1','currencyCode','VND','workStatus','unknown','engagementId','c1010000-0000-4000-8000-000000000301','nonOverlapConfirmationReference','C101-x'), 'c1010000-0000-4000-8000-000000000727', 'c1010000-0000-4000-8000-000000000728'); raise exception 'C1_PC_HIERARCHY cross project engagement accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'RESOURCE_NOT_FOUND' then raise; end if; end;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', jsonb_build_object('projectId','c1010000-0000-4000-8000-000000000101','description','C101 component no engagement','amount','1','currencyCode','VND','workStatus','unknown','componentId','c1010000-0000-4000-8000-000000000401','nonOverlapConfirmationReference','C101-x'), 'c1010000-0000-4000-8000-000000000736', 'c1010000-0000-4000-8000-000000000737'); raise exception 'C1_PC_HIERARCHY component without engagement accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'RESOURCE_NOT_FOUND' then raise; end if; end;
  begin perform public.c1_correct_project_cost_item('c1010000-0000-4000-8000-000000000020', item_id, jsonb_build_object('expectedVersion',item_version,'reason','C101 forbidden','amount','101'), 'c1010000-0000-4000-8000-000000000738'); raise exception 'C1_PC_PERMISSION_BOUNDARY manager corrected'; exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
end;
$$;
reset role;

insert into public.project_cost_items(id, tenant_id, company_id, project_id, description, amount, currency_code, work_status, created_by)
values ('c1010000-0000-4000-8000-000000000801', 'c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-000000000022', 'c1010000-0000-4000-8000-000000000103', 'C101 foreign item', 1, 'VND', 'unknown', 'c1010000-0000-4000-8000-000000000902');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1010000-0000-4000-8000-000000000901","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.project_cost_items where company_id = 'c1010000-0000-4000-8000-000000000020') < 2 then raise exception 'C1_PC_READ reader cannot read scoped items'; end if;
  if (select count(*) from public.project_cost_items where company_id = 'c1010000-0000-4000-8000-000000000022') <> 0 then raise exception 'C1_PC_READ reader saw foreign company'; end if;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', '{}'::jsonb, 'c1010000-0000-4000-8000-000000000729', 'c1010000-0000-4000-8000-000000000730'); raise exception 'C1_PC_PERMISSION_BOUNDARY reader created'; exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1010000-0000-4000-8000-000000000904","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.project_cost_items where company_id = 'c1010000-0000-4000-8000-000000000020') <> 0 then raise exception 'C1_PC_PERMISSION_BOUNDARY denied actor read'; end if;
  begin perform public.c1_create_project_cost_item('c1010000-0000-4000-8000-000000000020', '{}'::jsonb, 'c1010000-0000-4000-8000-000000000739', 'c1010000-0000-4000-8000-000000000740'); raise exception 'C1_PC_PERMISSION_BOUNDARY denied actor created'; exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1010000-0000-4000-8000-000000000903","role":"authenticated"}', true);
do $$
declare item_id uuid; item_version bigint;
begin
  select id, version into item_id, item_version from public.project_cost_items where description = 'C101 tracked item';
  begin perform public.c1_update_project_cost_item('c1010000-0000-4000-8000-000000000020', item_id, jsonb_build_object('description','C101 forbidden update','expectedVersion',item_version), 'c1010000-0000-4000-8000-000000000741'); raise exception 'C1_PC_PERMISSION_BOUNDARY corrector updated'; exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  begin perform public.c1_correct_project_cost_item('c1010000-0000-4000-8000-000000000020', item_id, jsonb_build_object('expectedVersion',item_version,'reason',' ' ,'amount','110.0000'), 'c1010000-0000-4000-8000-000000000742'); raise exception 'C1_PC_CORRECTION empty reason accepted'; exception when sqlstate 'P0001' then if sqlerrm <> 'INPUT_INVALID' then raise; end if; end;
  select public.c1_correct_project_cost_item('c1010000-0000-4000-8000-000000000020', item_id, jsonb_build_object('expectedVersion',item_version,'reason','C101 correction','amount','110.0000'), 'c1010000-0000-4000-8000-000000000731');
  if (select amount from public.project_cost_items where id = item_id) <> 110 or (select version from public.project_cost_items where id = item_id) <> item_version + 1 then raise exception 'C1_PC_CORRECTION failed'; end if;
end $$;
reset role;

do $$
declare item_a uuid; item_b uuid; figure_id uuid;
begin
  select id into item_a from public.project_cost_items where description = 'C101 tracked item';
  select id into item_b from public.project_cost_items where description = 'C101 hierarchical item';
  figure_id := 'c1010000-0000-4000-8000-000000000604';
  insert into public.project_cost_item_sources(tenant_id, company_id, project_cost_item_id, source_reported_figure_id) values ('c1010000-0000-4000-8000-000000000010','c1010000-0000-4000-8000-000000000020',item_a,figure_id);
  begin insert into public.project_cost_item_sources(tenant_id, company_id, project_cost_item_id, source_reported_figure_id) values ('c1010000-0000-4000-8000-000000000010','c1010000-0000-4000-8000-000000000020',item_a,figure_id); raise exception 'C1_PC_F07_SOURCE_REUSE duplicate pair accepted'; exception when unique_violation then null; end;
  insert into public.project_cost_item_sources(tenant_id, company_id, project_cost_item_id, source_reported_figure_id) values ('c1010000-0000-4000-8000-000000000010','c1010000-0000-4000-8000-000000000020',item_b,figure_id);
  if (select count(*) from public.project_cost_item_sources where source_reported_figure_id = figure_id) <> 2 then raise exception 'C1_PC_F07_SOURCE_REUSE source reuse rejected'; end if;
  if not exists (select 1 from public.audit_events where resource_type = 'project_cost_item' and action = 'c1.project_cost_item.created' and after_summary ? 'nonOverlapConfirmationReference') or not exists (select 1 from public.audit_events where resource_type = 'project_cost_item' and action = 'c1.project_cost_item.updated' and before_summary is not null and after_summary is not null) or not exists (select 1 from public.audit_events where resource_type = 'project_cost_item' and action = 'c1.project_cost_item.corrected' and after_summary ? 'reason') then raise exception 'C1_PC_AUDIT_HISTORY missing command audit'; end if;
end;
$$;

select 'C1_PROJECT_COST_ITEMS_COMPLETE' as c1_fixture_completion;

rollback;
