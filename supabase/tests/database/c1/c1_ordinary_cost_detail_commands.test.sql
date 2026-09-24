begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(81);

select has_table('public', 'project_cost_item_detail_sources', 'detail source provenance is introduced with the command slice');
select has_function('public', 'c1_create_project_cost_detail_draft', 'draft-detail create RPC exists');
select has_function('public', 'c1_update_project_cost_detail_draft', 'operational update RPC exists');
select has_function('public', 'c1_prepare_project_cost_detail_financials', 'one-detail financial preparation RPC exists');
select has_function('public', 'c1_read_project_cost_detail_draft', 'financial draft read RPC exists');
select has_function('public', 'c1_read_project_cost_detail_draft_operational', 'operational draft read RPC exists');
select has_function('public', 'c1_publish_project_cost_detail', 'existing-detail publish RPC exists');
select has_function('public', 'c1_create_and_publish_project_cost_detail', 'atomic direct publish RPC exists');
select has_function('public', 'c1_correct_published_project_cost_detail', 'published-detail correction RPC exists');
select col_is_null('public', 'project_cost_item_details', 'amount_text', 'draft detail may remain financially unprepared');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.project_cost_item_detail_sources'::regclass and contype = 'u'), 'detail source linkage is unique');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'insert'), 'authenticated has no direct detail-source DML');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_details', 'insert'), 'authenticated has no direct detail DML');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can use guarded draft create');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_publish_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can use guarded detail publish');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_create_and_publish_project_cost_detail(uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can use guarded direct publish');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can use guarded correction');
select ok(exists (select 1 from pg_proc where proname = 'c1_read_project_cost_detail_draft_operational'), 'manage-only projection remains a separate boundary');
select has_function('private', 'c1_detail_validate_linked_sources', array['uuid', 'uuid', 'uuid'], 'publish and correction revalidate persisted detail sources');
select ok(pg_get_functiondef('private.c1_can_read_project_cost_detail(uuid,uuid,uuid,text)'::regprocedure) !~ 'cost.prepare', 'raw detail RLS never exposes drafts through combined read and prepare permissions');
select ok(pg_get_functiondef('private.c1_detail_receipt(uuid,uuid,uuid,text,uuid,text)'::regprocedure) ~ 'pg_advisory_xact_lock', 'idempotent receipt lookup takes a deterministic advisory lock');
select ok(pg_get_functiondef('private.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)'::regprocedure) ~ 'COST_DETAIL_NOT_PUBLISHED', 'draft correction rejects with the published-detail lifecycle error');

do $$
declare
  tenant_id constant uuid := 'c1d10000-0000-4000-8000-000000000010';
  company_id constant uuid := 'c1d10000-0000-4000-8000-000000000020';
  actor_id constant uuid := 'c1d10000-0000-4000-8000-000000000901';
  actor_without_manage constant uuid := 'c1d10000-0000-4000-8000-000000000902';
  actor_without_prepare constant uuid := 'c1d10000-0000-4000-8000-000000000903';
  actor_without_publish constant uuid := 'c1d10000-0000-4000-8000-000000000904';
  project_id constant uuid := 'c1d10000-0000-4000-8000-000000000101';
  foreign_tenant_id constant uuid := 'c1d10000-0000-4000-8000-000000000011';
  foreign_company_id constant uuid := 'c1d10000-0000-4000-8000-000000000021';
  foreign_project_id constant uuid := 'c1d10000-0000-4000-8000-000000000102';
  same_tenant_company_id constant uuid := 'c1d10000-0000-4000-8000-000000000022';
  same_tenant_project_id constant uuid := 'c1d10000-0000-4000-8000-000000000103';
  category_id constant uuid := 'c1d10000-0000-4000-8000-000000000301';
  subcontract_category_id constant uuid := 'c1d10000-0000-4000-8000-000000000302';
  role_id constant uuid := 'c1d10000-0000-4000-8000-000000000911';
  role_without_manage constant uuid := 'c1d10000-0000-4000-8000-000000000912';
  role_without_prepare constant uuid := 'c1d10000-0000-4000-8000-000000000913';
  role_without_publish constant uuid := 'c1d10000-0000-4000-8000-000000000914';
begin
  insert into auth.users(id,email) values(actor_id,'c1d-commands@taskovia.invalid'),(actor_without_manage,'c1d-no-manage@taskovia.invalid'),(actor_without_prepare,'c1d-no-prepare@taskovia.invalid'),(actor_without_publish,'c1d-no-publish@taskovia.invalid');
  insert into public.tenants(id,code,name) values(tenant_id,'C1D','C1 detail command tenant'),(foreign_tenant_id,'C1DF','C1 detail foreign tenant');
  insert into public.companies(id,tenant_id,code,name) values(company_id,tenant_id,'C1D','C1 detail command company'),(foreign_company_id,foreign_tenant_id,'C1DF','C1 detail foreign company'),(same_tenant_company_id,tenant_id,'C1D2','C1 detail same-tenant foreign company');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values(actor_id,tenant_id,array['member']),(actor_without_manage,tenant_id,array['member']),(actor_without_prepare,tenant_id,array['member']),(actor_without_publish,tenant_id,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values(actor_id,tenant_id,company_id,array['member'],true),(actor_without_manage,tenant_id,company_id,array['member'],true),(actor_without_prepare,tenant_id,company_id,array['member'],true),(actor_without_publish,tenant_id,company_id,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values(role_id,tenant_id,company_id,'c1d_detail_operator','C1D detail operator','fixture',false);
  insert into public.role_permissions(role_id,permission_code) values(role_id,'cost.manage'),(role_id,'cost.prepare'),(role_id,'cost.publish_import'),(role_id,'cost.correct'),(role_id,'cost.read');
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values(role_without_manage,tenant_id,company_id,'c1d_no_manage','C1D no manage','fixture',false),(role_without_prepare,tenant_id,company_id,'c1d_no_prepare','C1D no prepare','fixture',false),(role_without_publish,tenant_id,company_id,'c1d_no_publish','C1D no publish','fixture',false);
  insert into public.role_permissions(role_id,permission_code) values(role_without_manage,'cost.prepare'),(role_without_manage,'cost.publish_import'),(role_without_prepare,'cost.manage'),(role_without_prepare,'cost.publish_import'),(role_without_publish,'cost.manage'),(role_without_publish,'cost.prepare');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values(tenant_id,company_id,actor_id,role_id,actor_id,'fixture'),(tenant_id,company_id,actor_without_manage,role_without_manage,actor_id,'fixture'),(tenant_id,company_id,actor_without_prepare,role_without_prepare,actor_id,'fixture'),(tenant_id,company_id,actor_without_publish,role_without_publish,actor_id,'fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values(company_id,tenant_id,true,actor_id),(foreign_company_id,foreign_tenant_id,true,actor_id);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values(project_id,tenant_id,company_id,'C1D-P1','C1 detail command project','manual',actor_id),(foreign_project_id,foreign_tenant_id,foreign_company_id,'C1DF-P1','C1 detail foreign project','manual',actor_id),(same_tenant_project_id,tenant_id,same_tenant_company_id,'C1D2-P1','C1 detail same-tenant foreign project','manual',actor_id);
  perform set_config('taskovia.c1_finance.actor_id',actor_id::text,true); perform set_config('taskovia.c1_finance.request_id','c1d10000-0000-4000-8000-000000000701',true); perform set_config('taskovia.c1_finance.change_reason','fixture',true);
  insert into public.cost_categories(id,tenant_id,company_id,code,name,display_order,posting_strategy,created_by,updated_by) values(category_id,tenant_id,company_id,'materials','Materials',1,'ordinary_detail',actor_id,actor_id),(subcontract_category_id,tenant_id,company_id,'subcontract_labor','Subcontract',2,'subcontract_payment',actor_id,actor_id),('c1d10000-0000-4000-8000-000000000303',foreign_tenant_id,foreign_company_id,'materials','Foreign materials',1,'ordinary_detail',actor_id,actor_id),('c1d10000-0000-4000-8000-000000000304',tenant_id,same_tenant_company_id,'materials','Same-tenant foreign materials',1,'ordinary_detail',actor_id,actor_id);
  insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_at,created_by) values
    ('c1d10000-0000-4000-8000-000000000801',foreign_tenant_id,foreign_company_id,foreign_project_id,'c1d10000-0000-4000-8000-000000000303','Foreign detail parent',0,'0','VND','unknown','published','legacy_backfill',now(),actor_id),
    ('c1d10000-0000-4000-8000-000000000803',tenant_id,same_tenant_company_id,same_tenant_project_id,'c1d10000-0000-4000-8000-000000000304','Same-tenant foreign detail parent',0,'0','VND','unknown','published','legacy_backfill',now(),actor_id);
  insert into public.project_cost_item_details(id,tenant_id,company_id,project_cost_item_id,line_no,description,amount_text,publication_state,created_by) values
    ('c1d10000-0000-4000-8000-000000000802',foreign_tenant_id,foreign_company_id,'c1d10000-0000-4000-8000-000000000801',1,'Foreign tenant detail','1','draft',actor_id),
    ('c1d10000-0000-4000-8000-000000000804',tenant_id,same_tenant_company_id,'c1d10000-0000-4000-8000-000000000803',1,'Same-tenant foreign company detail','1','draft',actor_id);
  insert into public.controlled_import_runs(id,tenant_id,company_id,run_id,actor_id,idempotency_key,payload_digest,manifest_digest,input_digests,workbook_family,adapter_id,adapter_version,manifest_snapshot,request_id) values('c1d10000-0000-4000-8000-000000000401',tenant_id,company_id,'c1d10000-0000-4000-8000-000000000402',actor_id,'c1d10000-0000-4000-8000-000000000403',repeat('a',64),repeat('b',64),array[repeat('c',64)],'fixture','fixture','1',jsonb_build_object('fixture',true),'c1d10000-0000-4000-8000-000000000404');
  insert into public.accounting_sources(id,tenant_id,company_id,code,title,source_system,created_by) values('c1d10000-0000-4000-8000-000000000405',tenant_id,company_id,'C1D-S','C1 detail source','fixture',actor_id);
  insert into public.accounting_source_versions(id,tenant_id,company_id,source_id,import_run_id,version_no,input_file_identity,input_file_sha256,original_filename,status,created_by,shared_by,shared_at) values('c1d10000-0000-4000-8000-000000000406',tenant_id,company_id,'c1d10000-0000-4000-8000-000000000405','c1d10000-0000-4000-8000-000000000401',1,'fixture',repeat('d',64),'fixture.xlsx','shared',actor_id,actor_id,now());
  insert into public.source_selections(id,tenant_id,company_id,source_version_id,import_run_id,locator,locator_key,mapping_state,reviewed_mapping,mapped_project_id,observed_labels,raw_values,unresolved_issues,created_by) values('c1d10000-0000-4000-8000-000000000407',tenant_id,company_id,'c1d10000-0000-4000-8000-000000000406','c1d10000-0000-4000-8000-000000000401',jsonb_build_object('sheet','fixture'),'fixture!A1','confirmed',jsonb_build_object('projectId',project_id),project_id,array['fixture'],array['1'],array[]::text[],actor_id);
  insert into public.source_reported_figures(id,tenant_id,company_id,source_selection_id,import_run_id,figure_identity,label,raw_value_text,value_state,amount_text,amount,currency_code,metric_kind,basis,rounding_basis,period_basis,mapping_state,reviewed_mapping,project_id,scope_kind,scope_description,confirmation,status,created_by,shared_by,shared_at) values
    ('c1d10000-0000-4000-8000-000000000501',tenant_id,company_id,'c1d10000-0000-4000-8000-000000000407','c1d10000-0000-4000-8000-000000000401',repeat('e',64),'shared figure','1','known','1',1,'VND','cost_total','net','exact','unknown','confirmed',jsonb_build_object('projectId',project_id),project_id,'whole_project','fixture','confirmed_external','shared',actor_id,actor_id,now()),
    ('c1d10000-0000-4000-8000-000000000502',tenant_id,company_id,'c1d10000-0000-4000-8000-000000000407','c1d10000-0000-4000-8000-000000000401',repeat('f',64),'stale figure','1','known','1',1,'VND','cost_total','net','exact','unknown','confirmed',jsonb_build_object('projectId',project_id),project_id,'whole_project','fixture','confirmed_external','draft',actor_id,null,null);
end;
$$;

create temp table c1d_cross_scope_before as
select detail.id, detail.description, detail.amount_text, detail.version, detail.publication_state
from public.project_cost_item_details detail
where detail.id in ('c1d10000-0000-4000-8000-000000000802','c1d10000-0000-4000-8000-000000000804');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1d10000-0000-4000-8000-000000000901","role":"authenticated"}', true);

create temp table c1d_result as
select public.c1_create_project_cost_detail_draft(
  'c1d10000-0000-4000-8000-000000000020',
  jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','first draft'),
  'c1d10000-0000-4000-8000-000000000601','c1d10000-0000-4000-8000-000000000701'
) result;

select is((select result->>'publicationState' from c1d_result),'draft','draft create returns a draft detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'0.0000','draft create has zero parent effect');
select throws_ok($$select public.c1_create_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000102','categoryId','c1d10000-0000-4000-8000-000000000301','description','foreign project'),'c1d10000-0000-4000-8000-000000000608','c1d10000-0000-4000-8000-000000000715')$$,'P0001','RESOURCE_NOT_FOUND','foreign project IDs do not leak across tenant or company scope');
select throws_ok($$select public.c1_update_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020','c1d10000-0000-4000-8000-000000000802',jsonb_build_object('expectedVersion',0,'description','foreign mutation'),'c1d10000-0000-4000-8000-000000000716')$$,'P0001','RESOURCE_NOT_FOUND','foreign-tenant existing detail update does not leak or mutate');
select throws_ok($$select public.c1_read_project_cost_detail_draft_operational('c1d10000-0000-4000-8000-000000000020','c1d10000-0000-4000-8000-000000000802')$$,'P0001','RESOURCE_NOT_FOUND','foreign-tenant existing detail operational read does not leak');
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020','c1d10000-0000-4000-8000-000000000802',jsonb_build_object('expectedVersion',0),'c1d10000-0000-4000-8000-000000000609','c1d10000-0000-4000-8000-000000000717')$$,'P0001','RESOURCE_NOT_FOUND','foreign-tenant existing detail publish does not leak or mutate');
select throws_ok($$select public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020','c1d10000-0000-4000-8000-000000000804',jsonb_build_object('expectedVersion',0,'amount','2.0000'),'c1d10000-0000-4000-8000-000000000718')$$,'P0001','RESOURCE_NOT_FOUND','same-tenant different-company existing detail preparation does not leak or mutate');
select throws_ok($$select public.c1_read_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020','c1d10000-0000-4000-8000-000000000804')$$,'P0001','RESOURCE_NOT_FOUND','same-tenant different-company existing detail financial read does not leak');
reset role;
select is(
  (select jsonb_agg(jsonb_build_object('id',detail.id,'description',detail.description,'amountText',detail.amount_text,'version',detail.version,'publicationState',detail.publication_state) order by detail.id) from public.project_cost_item_details detail where detail.id in ('c1d10000-0000-4000-8000-000000000802','c1d10000-0000-4000-8000-000000000804')),
  (select jsonb_agg(jsonb_build_object('id',snapshot.id,'description',snapshot.description,'amountText',snapshot.amount_text,'version',snapshot.version,'publicationState',snapshot.publication_state) order by snapshot.id) from c1d_cross_scope_before snapshot),
  'cross-scope detail commands leave existing foreign fixtures unchanged'
);
select is((select count(*) from public.audit_events event where event.resource_id in ('c1d10000-0000-4000-8000-000000000802','c1d10000-0000-4000-8000-000000000804')) + (select count(*) from public.cost_command_receipts receipt where receipt.idempotency_key='c1d10000-0000-4000-8000-000000000609'),0::bigint,'cross-scope command failures create no audit event or receipt');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1d10000-0000-4000-8000-000000000901","role":"authenticated"}', true);
select is((public.c1_create_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','first draft'),'c1d10000-0000-4000-8000-000000000601','c1d10000-0000-4000-8000-000000000702')->>'replayed'),'true','same create key replays one draft');
select throws_ok($$select public.c1_update_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),'{}'::jsonb,'c1d10000-0000-4000-8000-000000000730')$$,'P0001','INPUT_INVALID','direct update rejects a missing expected version before any cast');
select throws_ok($$select public.c1_update_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',9223372036854775808,'description','oversized'),'c1d10000-0000-4000-8000-000000000731')$$,'P0001','INPUT_INVALID','direct update rejects an oversized expected version before any cast');
select throws_ok($$select public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('amount','5.0000'),'c1d10000-0000-4000-8000-000000000732')$$,'P0001','INPUT_INVALID','direct prepare rejects a missing expected version before any cast');
select throws_ok($$select public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',9223372036854775808,'amount','5.0000'),'c1d10000-0000-4000-8000-000000000733')$$,'P0001','INPUT_INVALID','direct prepare rejects an oversized expected version before any cast');
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',null),'c1d10000-0000-4000-8000-000000000734','c1d10000-0000-4000-8000-000000000735')$$,'P0001','INPUT_INVALID','direct publish rejects a null expected version before any cast');
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',9223372036854775808),'c1d10000-0000-4000-8000-000000000736','c1d10000-0000-4000-8000-000000000737')$$,'P0001','INPUT_INVALID','direct publish rejects an oversized expected version before any cast');
select throws_ok($$select public.c1_correct_published_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('reason','missing version','changes',jsonb_build_object('amount','1.0000')),'c1d10000-0000-4000-8000-000000000738','c1d10000-0000-4000-8000-000000000739')$$,'P0001','INPUT_INVALID','direct correction rejects a missing expected version before any cast');
select throws_ok($$select public.c1_correct_published_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',9223372036854775808,'reason','oversized version','changes',jsonb_build_object('amount','1.0000')),'c1d10000-0000-4000-8000-000000000740','c1d10000-0000-4000-8000-000000000741')$$,'P0001','INPUT_INVALID','direct correction rejects an oversized expected version before any cast');
select is((public.c1_update_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',0,'description','renamed draft'),'c1d10000-0000-4000-8000-000000000703')->>'version'),'1','operational update versions only the target detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'0.0000','operational update retains zero official effect');
create temp table c1d_sibling as select public.c1_create_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','sibling draft'),'c1d10000-0000-4000-8000-000000000607','c1d10000-0000-4000-8000-000000000713') result;
select throws_ok($$select public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',0,'amount','5.0000'),'c1d10000-0000-4000-8000-000000000704')$$,'P0001','VERSION_CONFLICT','stale preparation version is rejected');
select throws_ok($$select public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',1,'amount','5.0000','sourceFigureIds',jsonb_build_array('c1d10000-0000-4000-8000-000000000999')),'c1d10000-0000-4000-8000-000000000714')$$,'P0001','RESOURCE_NOT_FOUND','foreign or missing detail source IDs do not leak across scope');
select is((public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',1,'amount','5.0000'),'c1d10000-0000-4000-8000-000000000705')->>'version'),'2','prepare updates one draft detail');
select is((select amount_text from public.project_cost_item_details where id=(select (result->>'id')::uuid from c1d_sibling)),null,'prepare leaves sibling detail financially untouched');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'0.0000','prepare retains zero official effect');
select is((public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_sibling),jsonb_build_object('expectedVersion',0,'amount','1.0000','sourceFigureIds',jsonb_build_array('c1d10000-0000-4000-8000-000000000501')),'c1d10000-0000-4000-8000-000000000717')->>'version'),'1','prepared sibling persists an explicit shared source link');
reset role;
select throws_ok(
  $$update public.source_reported_figures set status='draft', shared_by=null, shared_at=null where id='c1d10000-0000-4000-8000-000000000501'$$,
  'P0001','HISTORY_IMMUTABLE','a persisted shared source cannot become non-shared after preparation'
);
insert into public.source_review_issues(id,tenant_id,company_id,source_selection_id,import_run_id,issue_identity,issue_kind,impact,description,status,opened_by) values('c1d10000-0000-4000-8000-000000000503','c1d10000-0000-4000-8000-000000000010','c1d10000-0000-4000-8000-000000000020','c1d10000-0000-4000-8000-000000000407','c1d10000-0000-4000-8000-000000000401',repeat('1',64),'other','blocks_normalization','fixture blocking review','open','c1d10000-0000-4000-8000-000000000901');
set local role authenticated;
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_sibling),jsonb_build_object('expectedVersion',1),'c1d10000-0000-4000-8000-000000000611','c1d10000-0000-4000-8000-000000000719')$$,'P0001','COST_DETAIL_PUBLISH_NOT_READY','publish revalidates an open blocking review issue on a persisted source');
reset role;
delete from public.source_review_issues where id='c1d10000-0000-4000-8000-000000000503';
set local role authenticated;
select is((public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',2),'c1d10000-0000-4000-8000-000000000602','c1d10000-0000-4000-8000-000000000706')->>'publicationState'),'published','publish transitions one prepared detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'5','publish updates the parent exactly once');
select is((public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',2),'c1d10000-0000-4000-8000-000000000602','c1d10000-0000-4000-8000-000000000707')->>'replayed'),'true','same publish key replays');
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),NULL::jsonb,'c1d10000-0000-4000-8000-000000000629','c1d10000-0000-4000-8000-000000000729')$$,'P0001','INPUT_INVALID','publish rejects a SQL null JSON payload before hashing or receipt lookup');
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',3,'unexpected',true),'c1d10000-0000-4000-8000-000000000626','c1d10000-0000-4000-8000-000000000726')$$,'P0001','INPUT_INVALID','publish rejects extra JSON keys before hashing or receipt lookup');
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',3),'c1d10000-0000-4000-8000-000000000603','c1d10000-0000-4000-8000-000000000708')$$,'P0001','COST_DETAIL_ALREADY_PUBLISHED','new publish key cannot publish twice');
select is((public.c1_correct_published_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',3,'reason','correct amount','changes',jsonb_build_object('amount','6.0000')),'c1d10000-0000-4000-8000-000000000604','c1d10000-0000-4000-8000-000000000709')->>'version'),'4','published correction versions the same detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'6','published correction recalculates the parent');
select is((select amount_text from public.project_cost_item_details where id=(select (result->>'id')::uuid from c1d_sibling)),'1','correction preserves the sibling detail unchanged');
reset role;
select ok(exists(select 1 from public.audit_events where resource_id=(select result->>'id' from c1d_result) and action='c1.project_cost_detail.corrected'),'correction writes an immutable audit event');
insert into public.project_cost_item_detail_sources(tenant_id,company_id,project_cost_item_detail_id,source_reported_figure_id) values('c1d10000-0000-4000-8000-000000000010','c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),'c1d10000-0000-4000-8000-000000000502');
set local role authenticated;
select is((public.c1_correct_published_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',4,'reason','replace stale source','changes',jsonb_build_object('sourceFigureIds',jsonb_build_array('c1d10000-0000-4000-8000-000000000501'))),'c1d10000-0000-4000-8000-000000000612','c1d10000-0000-4000-8000-000000000720')->>'version'),'5','correction remediates stale persisted sources with an explicit replacement');
reset role;
select is((select before_summary->'sourceFigureIds' from public.audit_events where request_id='c1d10000-0000-4000-8000-000000000720'),'["c1d10000-0000-4000-8000-000000000502"]'::jsonb,'correction audit records exactly the prior source-link array');
select is((select after_summary->'sourceFigureIds' from public.audit_events where request_id='c1d10000-0000-4000-8000-000000000720'),'["c1d10000-0000-4000-8000-000000000501"]'::jsonb,'correction audit records exactly the replacement source-link array');
select is((select after_summary->>'reason' from public.audit_events where request_id='c1d10000-0000-4000-8000-000000000720'),'replace stale source','correction audit retains the explicit reason and request identity');
set local role authenticated;
select throws_ok($$select public.c1_create_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000302','description','unsupported'),'c1d10000-0000-4000-8000-000000000605','c1d10000-0000-4000-8000-000000000710')$$,'P0001','SUBCONTRACT_COST_MODEL_UNSUPPORTED','subcontract categories reject ordinary detail commands');
reset role;
create temp table c1d_direct_before as select count(*) detail_count,count(*) filter(where publication_state='draft') draft_count from public.project_cost_item_details where project_cost_item_id=(select (result->>'projectCostItemId')::uuid from c1d_result);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1d10000-0000-4000-8000-000000000901","role":"authenticated"}', true);
select is((public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct','amount','2.0000'),'c1d10000-0000-4000-8000-000000000606','c1d10000-0000-4000-8000-000000000711')->>'publicationState'),'published','direct command creates and publishes atomically');
reset role;
select is((select count(*) from public.project_cost_item_details where project_cost_item_id=(select (result->>'projectCostItemId')::uuid from c1d_result)),(select detail_count+1 from c1d_direct_before),'direct publish creates exactly one detail');
select is((select count(*) filter(where publication_state='draft') from public.project_cost_item_details where project_cost_item_id=(select (result->>'projectCostItemId')::uuid from c1d_result)),(select draft_count from c1d_direct_before),'direct publish leaves no committed draft or transient duplicate');
set local role authenticated;
select is((public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct','amount','2.0000'),'c1d10000-0000-4000-8000-000000000606','c1d10000-0000-4000-8000-000000000712')->>'replayed'),'true','same direct command key replays');
reset role;
select is((select count(*) from public.project_cost_item_details where project_cost_item_id=(select (result->>'projectCostItemId')::uuid from c1d_result)),(select detail_count+1 from c1d_direct_before),'direct replay creates no second detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'8','direct publish has one additional exact aggregate effect');
select is((public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct absent sources','amount','3.0000'),'c1d10000-0000-4000-8000-000000000624','c1d10000-0000-4000-8000-000000000724')->>'publicationState'),'published','direct publish accepts an absent sourceFigureIds field');
select is((public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct empty sources','amount','4.0000','sourceFigureIds','[]'::jsonb),'c1d10000-0000-4000-8000-000000000625','c1d10000-0000-4000-8000-000000000725')->>'publicationState'),'published','direct publish preserves an explicit empty sourceFigureIds array');
select throws_ok($$select public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct null sources','amount','5.0000','sourceFigureIds',null),'c1d10000-0000-4000-8000-000000000627','c1d10000-0000-4000-8000-000000000727')$$,'P0001','INPUT_INVALID','direct publish rejects a null sourceFigureIds value');
select throws_ok($$select public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct malformed sources','amount','5.0000','sourceFigureIds','not-an-array'),'c1d10000-0000-4000-8000-000000000628','c1d10000-0000-4000-8000-000000000728')$$,'P0001','INPUT_INVALID','direct publish rejects a non-array sourceFigureIds value');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'15','direct source payload variants retain exact aggregate accounting');
create temp table c1d_permission_before as select count(*) detail_count from public.project_cost_item_details where project_cost_item_id=(select (result->>'projectCostItemId')::uuid from c1d_result);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1d10000-0000-4000-8000-000000000902","role":"authenticated"}', true);
select throws_ok($$select public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','no manage','amount','1.0000'),'c1d10000-0000-4000-8000-000000000613','c1d10000-0000-4000-8000-000000000721')$$,'P0001','PERMISSION_DENIED','direct publish independently requires cost.manage');
select set_config('request.jwt.claims', '{"sub":"c1d10000-0000-4000-8000-000000000903","role":"authenticated"}', true);
select throws_ok($$select public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','no prepare','amount','1.0000'),'c1d10000-0000-4000-8000-000000000614','c1d10000-0000-4000-8000-000000000722')$$,'P0001','PERMISSION_DENIED','direct publish independently requires cost.prepare');
select set_config('request.jwt.claims', '{"sub":"c1d10000-0000-4000-8000-000000000904","role":"authenticated"}', true);
select throws_ok($$select public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','no publish','amount','1.0000'),'c1d10000-0000-4000-8000-000000000615','c1d10000-0000-4000-8000-000000000723')$$,'P0001','PERMISSION_DENIED','direct publish independently requires cost.publish_import');
reset role;
select is((select count(*) from public.project_cost_item_details where project_cost_item_id=(select (result->>'projectCostItemId')::uuid from c1d_result)),(select detail_count from c1d_permission_before),'denied direct commands create no row or aggregate effect');

select * from finish();
rollback;
