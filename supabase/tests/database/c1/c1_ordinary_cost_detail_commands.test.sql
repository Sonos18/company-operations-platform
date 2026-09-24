begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

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
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_publish_project_cost_detail(uuid,uuid,bigint,uuid,uuid)', 'execute'), 'authenticated can use guarded detail publish');
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
  project_id constant uuid := 'c1d10000-0000-4000-8000-000000000101';
  category_id constant uuid := 'c1d10000-0000-4000-8000-000000000301';
  subcontract_category_id constant uuid := 'c1d10000-0000-4000-8000-000000000302';
  role_id constant uuid := 'c1d10000-0000-4000-8000-000000000911';
begin
  insert into auth.users(id,email) values(actor_id,'c1d-commands@taskovia.invalid');
  insert into public.tenants(id,code,name) values(tenant_id,'C1D','C1 detail command tenant');
  insert into public.companies(id,tenant_id,code,name) values(company_id,tenant_id,'C1D','C1 detail command company');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values(actor_id,tenant_id,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values(actor_id,tenant_id,company_id,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values(role_id,tenant_id,company_id,'c1d_detail_operator','C1D detail operator','fixture',false);
  insert into public.role_permissions(role_id,permission_code) values(role_id,'cost.manage'),(role_id,'cost.prepare'),(role_id,'cost.publish_import'),(role_id,'cost.correct'),(role_id,'cost.read');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values(tenant_id,company_id,actor_id,role_id,actor_id,'fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values(company_id,tenant_id,true,actor_id);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values(project_id,tenant_id,company_id,'C1D-P1','C1 detail command project','manual',actor_id);
  insert into public.cost_categories(id,tenant_id,company_id,code,name,display_order,posting_strategy,created_by,updated_by) values(category_id,tenant_id,company_id,'materials','Materials',1,'ordinary_detail',actor_id,actor_id),(subcontract_category_id,tenant_id,company_id,'subcontract_labor','Subcontract',2,'subcontract_payment',actor_id,actor_id);
end;
$$;

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
select is((public.c1_create_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','first draft'),'c1d10000-0000-4000-8000-000000000601','c1d10000-0000-4000-8000-000000000702')->>'replayed'),'true','same create key replays one draft');
select is((public.c1_update_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',0,'description','renamed draft'),'c1d10000-0000-4000-8000-000000000703')->>'version'),'1','operational update versions only the target detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'0.0000','operational update retains zero official effect');
create temp table c1d_sibling as select public.c1_create_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','sibling draft'),'c1d10000-0000-4000-8000-000000000607','c1d10000-0000-4000-8000-000000000713') result;
select throws_ok($$select public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',0,'amount','5.0000'),'c1d10000-0000-4000-8000-000000000704')$$,'P0001','VERSION_CONFLICT','stale preparation version is rejected');
select throws_ok($$select public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',1,'amount','5.0000','sourceFigureIds',jsonb_build_array('c1d10000-0000-4000-8000-000000000999')),'c1d10000-0000-4000-8000-000000000714')$$,'P0001','COST_DETAIL_PUBLISH_NOT_READY','foreign or missing detail sources are never accepted');
select is((public.c1_prepare_project_cost_detail_financials('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',1,'amount','5.0000'),'c1d10000-0000-4000-8000-000000000705')->>'version'),'2','prepare updates one draft detail');
select is((select amount_text from public.project_cost_item_details where id=(select (result->>'id')::uuid from c1d_sibling)),null,'prepare leaves sibling detail financially untouched');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'0.0000','prepare retains zero official effect');
select is((public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),2,'c1d10000-0000-4000-8000-000000000602','c1d10000-0000-4000-8000-000000000706')->>'publicationState'),'published','publish transitions one prepared detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'5','publish updates the parent exactly once');
select is((public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),2,'c1d10000-0000-4000-8000-000000000602','c1d10000-0000-4000-8000-000000000707')->>'replayed'),'true','same publish key replays');
select throws_ok($$select public.c1_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),3,'c1d10000-0000-4000-8000-000000000603','c1d10000-0000-4000-8000-000000000708')$$,'P0001','COST_DETAIL_ALREADY_PUBLISHED','new publish key cannot publish twice');
select is((public.c1_correct_published_project_cost_detail('c1d10000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c1d_result),jsonb_build_object('expectedVersion',3,'reason','correct amount','changes',jsonb_build_object('amount','6.0000')),'c1d10000-0000-4000-8000-000000000604','c1d10000-0000-4000-8000-000000000709')->>'version'),'4','published correction versions the same detail');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'6','published correction recalculates the parent');
reset role;
select ok(exists(select 1 from public.audit_events where resource_id=(select result->>'id' from c1d_result) and action='c1.project_cost_detail.corrected'),'correction writes an immutable audit event');
set local role authenticated;
select throws_ok($$select public.c1_create_project_cost_detail_draft('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000302','description','unsupported'),'c1d10000-0000-4000-8000-000000000605','c1d10000-0000-4000-8000-000000000710')$$,'P0001','SUBCONTRACT_COST_MODEL_UNSUPPORTED','subcontract categories reject ordinary detail commands');
select is((public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct','amount','2.0000'),'c1d10000-0000-4000-8000-000000000606','c1d10000-0000-4000-8000-000000000711')->>'publicationState'),'published','direct command creates and publishes atomically');
select is((public.c1_create_and_publish_project_cost_detail('c1d10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1d10000-0000-4000-8000-000000000101','categoryId','c1d10000-0000-4000-8000-000000000301','description','direct','amount','2.0000'),'c1d10000-0000-4000-8000-000000000606','c1d10000-0000-4000-8000-000000000712')->>'replayed'),'true','same direct command key replays');
select is((select amount_text from public.project_cost_items where id=(select (result->>'projectCostItemId')::uuid from c1d_result)),'8','direct publish has one additional exact aggregate effect');

select * from finish();
rollback;
