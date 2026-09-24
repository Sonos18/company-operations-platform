begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;

select plan(55);

select has_column('public', 'project_cost_items', 'publication_state', 'publication state exists');
select is((select column_default from information_schema.columns where table_schema='public' and table_name='project_cost_items' and column_name='publication_state'), '''draft''::text', 'new cost rows default to draft');
select ok(not exists (
  select 1 from public.project_cost_items where publication_state <> 'published'
), 'all historical project costs were backfilled as published');

select ok(exists(
  select 1 from public.roles role
  where role.code = 'accountant' and role.is_active
    and (select array_agg(permission.permission_code order by permission.permission_code)
         from public.role_permissions permission where permission.role_id = role.id) = array[
      'accounting_document.read','accounting_document.update','cost.correct','cost.file.read',
      'cost.manage','cost.prepare','cost.publish_import','cost.read','cost.record_cash',
      'cost.source.read','inventory_value.read','supplier.read'
    ]::text[]
), 'an active Accountant has the exact approved permission set');
select is((select array_agg(permission_code order by permission_code) from public.role_permissions where role_id=(select id from public.roles where code='c1_vqh_cost_operator' and is_active)),array['cost.correct','cost.manage']::text[],'the transitional cost operator remains manage-only for draft access');
do $$declare v_default text;v_nonpublished bigint;v_accountant boolean;begin if extensions.num_failed()>0 then select column_default into v_default from information_schema.columns where table_schema='public' and table_name='project_cost_items' and column_name='publication_state';select count(*) into v_nonpublished from public.project_cost_items where publication_state<>'published';select exists(select 1 from public.roles role where role.code='accountant' and role.is_active and (select array_agg(permission_code order by permission_code) from public.role_permissions where role_id=role.id)=array['accounting_document.read','accounting_document.update','cost.correct','cost.file.read','cost.manage','cost.prepare','cost.publish_import','cost.read','cost.record_cash','cost.source.read','inventory_value.read','supplier.read']::text[]) into v_accountant;raise exception 'C1 lifecycle baseline assertion failed: default=%, nonpublished=%, accountant=%',v_default,v_nonpublished,v_accountant;end if;end$$;

do $$
declare
  tenant_id constant uuid := 'c1060000-0000-4000-8000-000000000010';
  company_id constant uuid := 'c1060000-0000-4000-8000-000000000020';
  reader constant uuid := 'c1060000-0000-4000-8000-000000000901';
  preparer constant uuid := 'c1060000-0000-4000-8000-000000000902';
  manager constant uuid := 'c1060000-0000-4000-8000-000000000903';
  publisher constant uuid := 'c1060000-0000-4000-8000-000000000904';
  corrector constant uuid := 'c1060000-0000-4000-8000-000000000905';
begin
  insert into auth.users(id, email) values
    (reader, 'c106-reader@taskovia.invalid'),
    (preparer, 'c106-preparer@taskovia.invalid'),
    (manager, 'c106-manager@taskovia.invalid'),
    (publisher, 'c106-publisher@taskovia.invalid'),
    (corrector, 'c106-corrector@taskovia.invalid');
  insert into public.tenants(id, code, name) values (tenant_id, 'c106', 'C106 synthetic tenant');
  insert into public.companies(id, tenant_id, code, name) values (company_id, tenant_id, 'C106', 'C106 synthetic company');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    (reader, tenant_id, array['member']), (preparer, tenant_id, array['member']), (manager, tenant_id, array['member']), (publisher, tenant_id, array['member']), (corrector, tenant_id, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    (reader, tenant_id, company_id, array['member'], true),
    (preparer, tenant_id, company_id, array['member'], true),
    (manager, tenant_id, company_id, array['member'], true),
    (publisher, tenant_id, company_id, array['member'], true),
    (corrector, tenant_id, company_id, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1060000-0000-4000-8000-000000000911', tenant_id, company_id, 'c106_reader', 'C106 reader', 'Synthetic read role', false),
    ('c1060000-0000-4000-8000-000000000912', tenant_id, company_id, 'c106_preparer', 'C106 preparer', 'Synthetic prepare role', false),
    ('c1060000-0000-4000-8000-000000000913', tenant_id, company_id, 'c106_manager', 'C106 manager', 'Synthetic manage role', false),
    ('c1060000-0000-4000-8000-000000000914', tenant_id, company_id, 'c106_publisher', 'C106 publisher', 'Synthetic publish role', false),
    ('c1060000-0000-4000-8000-000000000915', tenant_id, company_id, 'c106_corrector', 'C106 corrector', 'Synthetic correct role', false);
  insert into public.role_permissions(role_id, permission_code) values
    ('c1060000-0000-4000-8000-000000000911', 'cost.read'),
    ('c1060000-0000-4000-8000-000000000912', 'cost.prepare'),
    ('c1060000-0000-4000-8000-000000000913', 'cost.manage'),
    ('c1060000-0000-4000-8000-000000000914', 'cost.publish_import'),
    ('c1060000-0000-4000-8000-000000000915', 'cost.correct');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_id, company_id, reader, 'c1060000-0000-4000-8000-000000000911', preparer, 'C106 fixture'),
    (tenant_id, company_id, preparer, 'c1060000-0000-4000-8000-000000000912', preparer, 'C106 fixture'),
    (tenant_id, company_id, manager, 'c1060000-0000-4000-8000-000000000913', preparer, 'C106 fixture'),
    (tenant_id, company_id, publisher, 'c1060000-0000-4000-8000-000000000914', preparer, 'C106 fixture'),
    (tenant_id, company_id, corrector, 'c1060000-0000-4000-8000-000000000915', preparer, 'C106 fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by) values (company_id, tenant_id, true, preparer);
  insert into public.projects(id, tenant_id, company_id, code, name, origin, created_by) values
    ('c1060000-0000-4000-8000-000000000101', tenant_id, company_id, 'C106-P', 'C106 project', 'manual', preparer);
  perform set_config('taskovia.c1_finance.actor_id', preparer::text, true); perform set_config('taskovia.c1_finance.request_id', 'c1060000-0000-4000-8000-000000000601', true); perform set_config('taskovia.c1_finance.change_reason', 'fixture', true);
  insert into public.cost_categories(id, tenant_id, company_id, code, name, display_order, posting_strategy, created_by, updated_by) values
    ('c1060000-0000-4000-8000-000000000301', tenant_id, company_id, 'materials', 'Materials', 1, 'ordinary_detail', preparer, preparer),
    ('c1060000-0000-4000-8000-000000000302', tenant_id, company_id, 'subcontract_labor', 'Subcontract labor', 2, 'subcontract_payment', preparer, preparer);
  insert into public.controlled_import_runs(id,tenant_id,company_id,run_id,actor_id,idempotency_key,payload_digest,manifest_digest,input_digests,workbook_family,adapter_id,adapter_version,manifest_snapshot,request_id)
  values('c1060000-0000-4000-8000-000000000501',tenant_id,company_id,'c1060000-0000-4000-8000-000000000502',preparer,'c1060000-0000-4000-8000-000000000503',repeat('a',64),repeat('b',64),array[repeat('c',64)],'c106','c106','1.0.0','{}','c1060000-0000-4000-8000-000000000504');
  insert into public.accounting_sources(id,tenant_id,company_id,code,title,source_system,created_by)
  values('c1060000-0000-4000-8000-000000000505',tenant_id,company_id,'C106-SOURCE','C106 source','synthetic',preparer);
  insert into public.accounting_source_versions(id,tenant_id,company_id,source_id,import_run_id,version_no,input_file_identity,input_file_sha256,original_filename,created_by)
  values('c1060000-0000-4000-8000-000000000506',tenant_id,company_id,'c1060000-0000-4000-8000-000000000505','c1060000-0000-4000-8000-000000000501',1,'c106.xlsx',repeat('d',64),'c106.xlsx',preparer);
  insert into public.source_selections(id,tenant_id,company_id,source_version_id,import_run_id,locator,locator_key,mapping_state,reviewed_mapping,mapped_project_id,observed_labels,raw_values,unresolved_issues,created_by)
  values('c1060000-0000-4000-8000-000000000507',tenant_id,company_id,'c1060000-0000-4000-8000-000000000506','c1060000-0000-4000-8000-000000000501','{"kind":"logical_section"}','c106-selection','confirmed','{}','c1060000-0000-4000-8000-000000000101',array['C106'],array['0'],array[]::text[],preparer);
  insert into public.source_reported_figures(id,tenant_id,company_id,source_selection_id,import_run_id,figure_identity,label,raw_value_text,value_state,amount_text,amount,currency_code,metric_kind,basis,rounding_basis,period_basis,mapping_state,reviewed_mapping,project_id,scope_kind,scope_description,confirmation,status,created_by,shared_by,shared_at)
  values('c1060000-0000-4000-8000-000000000508',tenant_id,company_id,'c1060000-0000-4000-8000-000000000507','c1060000-0000-4000-8000-000000000501',repeat('e',64),'C106 figure','0','known','0',0,'VND','cost_total','net','exact','unknown','confirmed','{}','c1060000-0000-4000-8000-000000000101','whole_project','C106 fixture','unverified','shared',preparer,preparer,now());
  insert into public.project_cost_items(id, tenant_id, company_id, project_id, description, amount, amount_text, currency_code, work_status, publication_state, publication_origin, published_at, created_by) values
    ('c1060000-0000-4000-8000-000000000201', tenant_id, company_id, 'c1060000-0000-4000-8000-000000000101', 'C106 published', 1, '1', 'VND', 'unknown', 'published', 'legacy_backfill', now(), preparer),
    ('c1060000-0000-4000-8000-000000000202', tenant_id, company_id, 'c1060000-0000-4000-8000-000000000101', 'C106 draft', null, null, 'VND', 'unknown', 'draft', null, null, preparer);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1060000-0000-4000-8000-000000000901","role":"authenticated"}', true);
select is((select count(*) from public.project_cost_items where company_id = 'c1060000-0000-4000-8000-000000000020'), 1::bigint, 'cost.read sees only published cost rows');
select ok(exists(select 1 from public.project_cost_items where id = 'c1060000-0000-4000-8000-000000000201'), 'cost.read sees the published row');
select ok(not exists(select 1 from public.project_cost_items where id = 'c1060000-0000-4000-8000-000000000202'), 'cost.read cannot see draft row');
select throws_ok(
  $$insert into public.project_cost_items(tenant_id, company_id, project_id, description, currency_code, work_status, created_by) values ('c1060000-0000-4000-8000-000000000010','c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000101','denied','VND','unknown','c1060000-0000-4000-8000-000000000901')$$,
  '42501', null, 'authenticated direct cost insert remains denied'
);
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_create_project_cost_item(uuid,jsonb,uuid,uuid)', 'execute'), 'legacy create RPC is restored only as the lifecycle-safe draft wrapper');

select set_config('request.jwt.claims', '{"sub":"c1060000-0000-4000-8000-000000000902","role":"authenticated"}', true);
select ok(exists(select 1 from public.project_cost_items where id = 'c1060000-0000-4000-8000-000000000202'), 'cost.prepare can read draft row');

select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can execute create draft RPC');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_update_project_cost_draft(uuid,uuid,jsonb,uuid)', 'execute'), 'authenticated can execute update draft RPC');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid)', 'execute'), 'authenticated can execute prepare financials RPC');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_read_project_cost_draft(uuid,uuid)', 'execute'), 'authenticated can execute read draft RPC');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_list_project_cost_drafts(uuid,uuid)', 'execute'), 'authenticated can execute list drafts RPC');
do $$begin if extensions.num_failed()>0 then raise exception 'C1 lifecycle RLS or grant assertion failed';end if;end$$;

select throws_ok(
  $$select public.c1_create_project_cost_draft('c1060000-0000-4000-8000-000000000020', '{"projectId":"c1060000-0000-4000-8000-000000000101","description":"Denied","costCategoryId":"c1060000-0000-4000-8000-000000000301"}', 'c1060000-0000-4000-8000-000000000701', 'c1060000-0000-4000-8000-000000000702')$$,
  'P0001', 'PERMISSION_DENIED', 'cost.prepare cannot substitute for cost.manage'
);

select set_config('request.jwt.claims', '{"sub":"c1060000-0000-4000-8000-000000000903","role":"authenticated"}', true);
create temp table c1_p2_result as
select public.c1_create_project_cost_draft(
  'c1060000-0000-4000-8000-000000000020',
  '{"projectId":"c1060000-0000-4000-8000-000000000101","description":"C106 managed draft","costCategoryId":"c1060000-0000-4000-8000-000000000301"}',
  'c1060000-0000-4000-8000-000000000711',
  'c1060000-0000-4000-8000-000000000712'
) result;
select is((select result->>'publicationState' from c1_p2_result), 'draft', 'cost.manage creates a draft');
select is((select count(*) from public.project_cost_items where id=(select (result->>'id')::uuid from c1_p2_result)),0::bigint,'cost.manage cannot directly select the financial draft parent');
select ok(not (public.c1_read_project_cost_draft_operational('c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result)) ? 'amount'),'cost.manage operational projection omits amount');
select is(jsonb_array_length(public.c1_list_project_cost_drafts_operational('c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000101')),2,'cost.manage can list operational draft projections');
select is((public.c1_create_project_cost_draft(
  'c1060000-0000-4000-8000-000000000020',
  '{"projectId":"c1060000-0000-4000-8000-000000000101","description":"C106 managed draft","costCategoryId":"c1060000-0000-4000-8000-000000000301"}',
  'c1060000-0000-4000-8000-000000000711',
  'c1060000-0000-4000-8000-000000000713'
)->>'replayed')::boolean, true, 'exact create replay returns the receipt');
select throws_ok(
  $$select public.c1_create_project_cost_draft('c1060000-0000-4000-8000-000000000020', '{"projectId":"c1060000-0000-4000-8000-000000000101","description":"Changed","costCategoryId":"c1060000-0000-4000-8000-000000000301"}', 'c1060000-0000-4000-8000-000000000711', 'c1060000-0000-4000-8000-000000000714')$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'changed create replay conflicts'
);
select throws_ok(
  $$select public.c1_prepare_project_cost_financials('c1060000-0000-4000-8000-000000000020', (select (result->>'id')::uuid from c1_p2_result), '{"expectedVersion":0,"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Zero","amount":"0.0000"}],"sourceFigureIds":[]}', 'c1060000-0000-4000-8000-000000000715')$$,
  'P0001', 'PERMISSION_DENIED', 'cost.manage cannot substitute for cost.prepare'
);
select throws_ok(
  $$select public.c1_update_project_cost_draft('c1060000-0000-4000-8000-000000000020', (select (result->>'id')::uuid from c1_p2_result), '{"expectedVersion":9,"description":"stale"}', 'c1060000-0000-4000-8000-000000000716')$$,
  'P0001', 'VERSION_CONFLICT', 'draft update rejects a stale version'
);
select throws_ok(
  $$select public.c1_update_project_cost_draft('c1060000-0000-4000-8000-000000000020', 'c1060000-0000-4000-8000-000000000201', '{"expectedVersion":0,"description":"published"}', 'c1060000-0000-4000-8000-000000000717')$$,
  'P0001', 'COST_NOT_DRAFT', 'draft update rejects a published item'
);

reset role;
delete from public.role_permissions where role_id = 'c1060000-0000-4000-8000-000000000913' and permission_code = 'cost.manage';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1060000-0000-4000-8000-000000000903","role":"authenticated"}', true);
select throws_ok(
  $$select public.c1_create_project_cost_draft('c1060000-0000-4000-8000-000000000020', '{"projectId":"c1060000-0000-4000-8000-000000000101","description":"C106 managed draft","costCategoryId":"c1060000-0000-4000-8000-000000000301"}', 'c1060000-0000-4000-8000-000000000711', 'c1060000-0000-4000-8000-000000000718')$$,
  'P0001', 'PERMISSION_DENIED', 'create replay reauthorizes before returning a receipt'
);
reset role;
insert into public.role_permissions(role_id, permission_code) values ('c1060000-0000-4000-8000-000000000913', 'cost.manage');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1060000-0000-4000-8000-000000000902","role":"authenticated"}', true);
select is((public.c1_prepare_project_cost_financials(
  'c1060000-0000-4000-8000-000000000020',
  (select (result->>'id')::uuid from c1_p2_result),
  '{"expectedVersion":0,"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Explicit zero","amount":"0.0000"}],"sourceFigureIds":["c1060000-0000-4000-8000-000000000508"]}',
  'c1060000-0000-4000-8000-000000000719'
)->>'amount'), '0.0000', 'cost.prepare accepts an explicit zero detail snapshot');
select is((public.c1_read_project_cost_draft('c1060000-0000-4000-8000-000000000020', (select (result->>'id')::uuid from c1_p2_result))->'publishReadiness'->>'ready')::boolean, true, 'prepared ordinary draft is publish-ready');
select is((public.c1_read_project_cost_draft('c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000202')->'publishReadiness'->'blockingCodes'->>0), 'FINANCIAL_DETAILS_REQUIRED', 'unprepared draft reports the financial-details blocker');
select ok(
  jsonb_array_length(public.c1_read_project_cost_draft('c1060000-0000-4000-8000-000000000020', (select (result->>'id')::uuid from c1_p2_result))->'details') = 1
    and (select count(*) from public.project_cost_item_details where project_cost_item_id=(select (result->>'id')::uuid from c1_p2_result)) = 0,
  'cost.prepare reads draft financial details through the guarded RPC, not raw detail RLS'
);
select is((select count(*) from public.project_cost_item_sources where project_cost_item_id=(select (result->>'id')::uuid from c1_p2_result)),1::bigint,'cost.prepare can directly read draft source links');
select throws_ok(
  $$select public.c1_prepare_project_cost_financials('c1060000-0000-4000-8000-000000000020', 'c1060000-0000-4000-8000-000000000201', '{"expectedVersion":0,"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Published","amount":"1.0000"}],"sourceFigureIds":[]}', 'c1060000-0000-4000-8000-000000000720')$$,
  'P0001', 'COST_NOT_DRAFT', 'financial preparation rejects a published item'
);
select set_config('request.jwt.claims', '{"sub":"c1060000-0000-4000-8000-000000000903","role":"authenticated"}', true);
select is((select count(*) from public.project_cost_item_details where project_cost_item_id=(select (result->>'id')::uuid from c1_p2_result)),0::bigint,'cost.manage cannot directly read draft financial details');
select is((select count(*) from public.project_cost_item_sources where project_cost_item_id=(select (result->>'id')::uuid from c1_p2_result)),0::bigint,'cost.manage cannot directly read draft source links');
select throws_ok(
  $$select public.c1_create_project_cost_draft('c1060000-0000-4000-8000-000000000020', '{"projectId":"c1060000-0000-4000-8000-000000000101","description":"Subcontract duplicate","costCategoryId":"c1060000-0000-4000-8000-000000000302"}', 'c1060000-0000-4000-8000-000000000721', 'c1060000-0000-4000-8000-000000000722')$$,
  'P0001', 'SUBCONTRACT_COST_MODEL_UNSUPPORTED', 'new subcontract cost drafts are blocked from duplicating the cash-ledger Actual model'
);
do $$begin if extensions.num_failed()>0 then raise exception 'C1 lifecycle draft or prepare assertion failed';end if;end$$;

select ok(pg_catalog.has_function_privilege('authenticated','public.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid)','execute'),'authenticated can execute publish RPC');
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000904","role":"authenticated"}',true);
create temp table c1_publish_result as select public.c1_publish_project_cost(
  'c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),1,
  'c1060000-0000-4000-8000-000000000731','c1060000-0000-4000-8000-000000000732') result;
select is((select result->>'publicationState' from c1_publish_result),'published','ready draft publishes explicitly');
reset role;
select is((select publication_state from public.project_cost_items where id=(select (result->>'id')::uuid from c1_p2_result)),'published','publish changes canonical state exactly once');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is((public.c1_publish_project_cost('c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),1,'c1060000-0000-4000-8000-000000000731','c1060000-0000-4000-8000-000000000733')->>'replayed')::boolean,true,'exact publish replay is idempotent');
select throws_ok(
  $$select public.c1_publish_project_cost('c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),1,'c1060000-0000-4000-8000-000000000734','c1060000-0000-4000-8000-000000000735')$$,
  'P0001','COST_ALREADY_PUBLISHED','different-key double publish is rejected'
);
select throws_ok(
  $$select public.c1_publish_project_cost('c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000202',99,'c1060000-0000-4000-8000-000000000736','c1060000-0000-4000-8000-000000000737')$$,
  'P0001','VERSION_CONFLICT','publish rejects stale expectedVersion'
);
select throws_ok(
  $$select public.c1_publish_project_cost('c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000202',0,'c1060000-0000-4000-8000-000000000738','c1060000-0000-4000-8000-000000000739')$$,
  'P0001','COST_PUBLISH_NOT_READY','publish rejects a draft without financial details'
);
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_publish_project_cost('c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000202',0,'c1060000-0000-4000-8000-000000000740','c1060000-0000-4000-8000-000000000741')$$,
  'P0001','PERMISSION_DENIED','read-only actor cannot publish'
);
select ok(exists(select 1 from public.project_cost_items where id=(select (result->>'id')::uuid from c1_p2_result)),'cost.read sees the item after publish');
do $$begin if extensions.num_failed()>0 then raise exception 'C1 lifecycle publish assertion failed';end if;end$$;

select ok(pg_catalog.has_function_privilege('authenticated','public.c1_correct_published_project_cost(uuid,uuid,jsonb,uuid,uuid)','execute'),'authenticated can execute correction RPC');
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_correct_published_project_cost('c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),'{"expectedVersion":2,"reason":"Denied","operationalChanges":{"workStatus":"accepted"}}','c1060000-0000-4000-8000-000000000751','c1060000-0000-4000-8000-000000000752')$$,
  'P0001','PERMISSION_DENIED','cost.manage cannot substitute for cost.correct'
);
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000905","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_correct_published_project_cost('c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),'{"expectedVersion":2,"reason":"","operationalChanges":{"workStatus":"accepted"}}','c1060000-0000-4000-8000-000000000753','c1060000-0000-4000-8000-000000000754')$$,
  'P0001','INPUT_INVALID','correction reason is mandatory'
);
create temp table c1_correction_result as select public.c1_correct_published_project_cost(
  'c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),
  '{"expectedVersion":2,"reason":"Correct source total","financialChanges":{"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Corrected","amount":"2.0000"}],"sourceFigureIds":[]}}',
  'c1060000-0000-4000-8000-000000000755','c1060000-0000-4000-8000-000000000756') result;
select is((select (result->>'version')::bigint from c1_correction_result),3::bigint,'correction increments the external version exactly once');
reset role;
select is((select amount_text from public.project_cost_items where id=(select (result->>'id')::uuid from c1_p2_result)),'2.0000','corrected parent amount is derived from the new snapshot');
select is((select sum(amount_text::numeric)::text from public.project_cost_item_details where project_cost_item_id=(select (result->>'id')::uuid from c1_p2_result)),'2.0000','corrected detail sum equals the parent amount');
select ok(exists(select 1 from public.audit_events where action='c1.project_cost_item.corrected' and resource_id=(select result->>'id' from c1_p2_result) and before_summary ? 'details' and after_summary ? 'details'),'correction audit retains before and after snapshots');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000905","role":"authenticated"}',true);
select is((public.c1_correct_published_project_cost(
  'c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),
  '{"expectedVersion":2,"reason":"Correct source total","financialChanges":{"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Corrected","amount":"2.0000"}],"sourceFigureIds":[]}}',
  'c1060000-0000-4000-8000-000000000755','c1060000-0000-4000-8000-000000000757')->>'replayed')::boolean,true,'exact correction replay is idempotent');
select throws_ok(
  $$select public.c1_correct_published_project_cost('c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),'{"expectedVersion":2,"reason":"Changed","operationalChanges":{"workStatus":"accepted"}}','c1060000-0000-4000-8000-000000000755','c1060000-0000-4000-8000-000000000758')$$,
  'P0001','IDEMPOTENCY_CONFLICT','changed correction replay conflicts'
);
select throws_ok(
  $$select public.c1_correct_published_project_cost('c1060000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1_p2_result),'{"expectedVersion":2,"reason":"Stale","operationalChanges":{"workStatus":"accepted"}}','c1060000-0000-4000-8000-000000000759','c1060000-0000-4000-8000-000000000760')$$,
  'P0001','VERSION_CONFLICT','correction rejects stale expectedVersion'
);

select * from extensions.finish(true);
rollback;
