begin;

select plan(37);

select has_column('public', 'project_cost_items', 'publication_state', 'publication state exists');
select col_default_is('public', 'project_cost_items', 'publication_state', '''draft''::text', 'new cost rows default to draft');
select ok(not exists (
  select 1 from public.project_cost_items where publication_state <> 'published'
), 'all historical project costs were backfilled as published');

select is(
  (select array_agg(permission.permission_code order by permission.permission_code)
   from public.role_permissions permission
   join public.roles role on role.id = permission.role_id
   where role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
     and role.company_id = '10000000-0000-4000-8000-000000000020'::uuid
     and role.code = 'accountant'
     and role.is_active),
  array[
    'accounting_document.read','accounting_document.update','cost.correct','cost.file.read',
    'cost.manage','cost.prepare','cost.publish_import','cost.read','cost.record_cash',
    'cost.source.read','inventory_value.read','supplier.read'
  ]::text[],
  'VQH Accountant has the exact approved permission set'
);

do $$
declare
  tenant_id constant uuid := 'c1060000-0000-4000-8000-000000000010';
  company_id constant uuid := 'c1060000-0000-4000-8000-000000000020';
  reader constant uuid := 'c1060000-0000-4000-8000-000000000901';
  preparer constant uuid := 'c1060000-0000-4000-8000-000000000902';
  manager constant uuid := 'c1060000-0000-4000-8000-000000000903';
  publisher constant uuid := 'c1060000-0000-4000-8000-000000000904';
begin
  insert into auth.users(id, email) values
    (reader, 'c106-reader@taskovia.invalid'),
    (preparer, 'c106-preparer@taskovia.invalid'),
    (manager, 'c106-manager@taskovia.invalid'),
    (publisher, 'c106-publisher@taskovia.invalid');
  insert into public.tenants(id, code, name) values (tenant_id, 'c106', 'C106 synthetic tenant');
  insert into public.companies(id, tenant_id, code, name) values (company_id, tenant_id, 'C106', 'C106 synthetic company');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    (reader, tenant_id, array['member']), (preparer, tenant_id, array['member']), (manager, tenant_id, array['member']), (publisher, tenant_id, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    (reader, tenant_id, company_id, array['member'], true),
    (preparer, tenant_id, company_id, array['member'], true),
    (manager, tenant_id, company_id, array['member'], true),
    (publisher, tenant_id, company_id, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1060000-0000-4000-8000-000000000911', tenant_id, company_id, 'c106_reader', 'C106 reader', 'Synthetic read role', false),
    ('c1060000-0000-4000-8000-000000000912', tenant_id, company_id, 'c106_preparer', 'C106 preparer', 'Synthetic prepare role', false),
    ('c1060000-0000-4000-8000-000000000913', tenant_id, company_id, 'c106_manager', 'C106 manager', 'Synthetic manage role', false),
    ('c1060000-0000-4000-8000-000000000914', tenant_id, company_id, 'c106_publisher', 'C106 publisher', 'Synthetic publish role', false);
  insert into public.role_permissions(role_id, permission_code) values
    ('c1060000-0000-4000-8000-000000000911', 'cost.read'),
    ('c1060000-0000-4000-8000-000000000912', 'cost.prepare'),
    ('c1060000-0000-4000-8000-000000000913', 'cost.manage'),
    ('c1060000-0000-4000-8000-000000000914', 'cost.publish_import');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_id, company_id, reader, 'c1060000-0000-4000-8000-000000000911', preparer, 'C106 fixture'),
    (tenant_id, company_id, preparer, 'c1060000-0000-4000-8000-000000000912', preparer, 'C106 fixture'),
    (tenant_id, company_id, manager, 'c1060000-0000-4000-8000-000000000913', preparer, 'C106 fixture'),
    (tenant_id, company_id, publisher, 'c1060000-0000-4000-8000-000000000914', preparer, 'C106 fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by) values (company_id, tenant_id, true, preparer);
  insert into public.projects(id, tenant_id, company_id, code, name, origin, created_by) values
    ('c1060000-0000-4000-8000-000000000101', tenant_id, company_id, 'C106-P', 'C106 project', 'manual', preparer);
  insert into public.cost_categories(id, tenant_id, company_id, code, name, display_order, created_by, updated_by) values
    ('c1060000-0000-4000-8000-000000000301', tenant_id, company_id, 'materials', 'Materials', 1, preparer, preparer),
    ('c1060000-0000-4000-8000-000000000302', tenant_id, company_id, 'subcontract_labor', 'Subcontract labor', 2, preparer, preparer);
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
  '{"expectedVersion":0,"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Explicit zero","amount":"0.0000"}],"sourceFigureIds":[]}',
  'c1060000-0000-4000-8000-000000000719'
)->>'amount'), '0', 'cost.prepare accepts an explicit zero detail snapshot');
select is((public.c1_read_project_cost_draft('c1060000-0000-4000-8000-000000000020', (select (result->>'id')::uuid from c1_p2_result))->'publishReadiness'->>'ready')::boolean, true, 'prepared ordinary draft is publish-ready');
select is((public.c1_read_project_cost_draft('c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000202')->'publishReadiness'->'blockingCodes'->>0), 'FINANCIAL_DETAILS_REQUIRED', 'unprepared draft reports the financial-details blocker');
select throws_ok(
  $$select public.c1_prepare_project_cost_financials('c1060000-0000-4000-8000-000000000020', 'c1060000-0000-4000-8000-000000000201', '{"expectedVersion":0,"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Published","amount":"1.0000"}],"sourceFigureIds":[]}', 'c1060000-0000-4000-8000-000000000720')$$,
  'P0001', 'COST_NOT_DRAFT', 'financial preparation rejects a published item'
);
select set_config('request.jwt.claims', '{"sub":"c1060000-0000-4000-8000-000000000903","role":"authenticated"}', true);
select throws_ok(
  $$select public.c1_create_project_cost_draft('c1060000-0000-4000-8000-000000000020', '{"projectId":"c1060000-0000-4000-8000-000000000101","description":"Subcontract duplicate","costCategoryId":"c1060000-0000-4000-8000-000000000302"}', 'c1060000-0000-4000-8000-000000000721', 'c1060000-0000-4000-8000-000000000722')$$,
  'P0001', 'SUBCONTRACT_COST_MODEL_UNSUPPORTED', 'new subcontract cost drafts are blocked from duplicating the cash-ledger Actual model'
);

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

select * from finish();
rollback;
