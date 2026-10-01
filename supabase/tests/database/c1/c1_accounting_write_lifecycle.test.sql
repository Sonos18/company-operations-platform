begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;

select plan(30);

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
select is((select array_agg(permission_code order by permission_code) from public.role_permissions where role_id=(select id from public.roles where code='c1_vqh_cost_operator' and is_active)),array['cost.correct','cost.manage']::text[],'the transitional cost operator retains manage and correction permissions');
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
  -- A published historical parent remains available for correction and reporting.
  insert into public.project_cost_items(id,tenant_id,company_id,project_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_at,created_by)
  values('c1060000-0000-4000-8000-000000000201',tenant_id,company_id,'c1060000-0000-4000-8000-000000000101','C106 published',1,'1.0000','VND','unknown','published','legacy_backfill',now(),preparer);
end;
$$;

select ok(not exists(select 1 from public.project_cost_items where tenant_id='c1060000-0000-4000-8000-000000000010' and publication_state='draft'),'fixture has no parent drafts');
select ok(not exists(select 1 from unnest(array[
  'public.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid)',
  'public.c1_update_project_cost_draft(uuid,uuid,jsonb,uuid)',
  'public.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid)',
  'public.c1_read_project_cost_draft(uuid,uuid)',
  'public.c1_list_project_cost_drafts(uuid,uuid)',
  'public.c1_read_project_cost_draft_operational(uuid,uuid)',
  'public.c1_list_project_cost_drafts_operational(uuid,uuid)',
  'public.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid)',
  'public.c1_create_project_cost_item(uuid,jsonb,uuid,uuid)',
  'public.c1_update_project_cost_item(uuid,uuid,jsonb,uuid)',
  'private.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid)',
  'private.c1_update_project_cost_draft(uuid,uuid,jsonb,uuid)',
  'private.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid)',
  'private.c1_read_project_cost_draft(uuid,uuid)',
  'private.c1_list_project_cost_drafts(uuid,uuid)',
  'private.c1_read_project_cost_draft_operational(uuid,uuid)',
  'private.c1_list_project_cost_drafts_operational(uuid,uuid)',
  'private.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid)',
  'private.c1_project_cost_draft_json(uuid,uuid,uuid)',
  'private.c1_project_cost_draft_operational_json(uuid,uuid,uuid)',
  'private.c1_project_cost_publish_readiness(uuid,uuid,uuid)'
]) signature where to_regprocedure(signature) is not null),'all 21 retired signatures are absent');
select ok(to_regprocedure('private.c1_create_project_cost_item(uuid,jsonb,uuid,uuid)') is not null and to_regprocedure('private.c1_update_project_cost_item(uuid,uuid,jsonb,uuid)') is not null,'two older private same-name functions remain');
select has_function('public','c1_correct_published_project_cost',array['uuid','uuid','jsonb','uuid','uuid'],'published-parent correction remains');
select has_function('public','c1_read_project_cost_draft_management_metadata',array['uuid'],'ordinary draft-management metadata remains');
select has_function('public','c1_create_project_cost_detail_draft',array['uuid','jsonb','uuid','uuid'],'ordinary detail creation remains');
select has_function('public','c1_prepare_project_cost_detail_financials',array['uuid','uuid','jsonb','uuid'],'ordinary detail preparation remains');
select has_function('public','c1_publish_project_cost_detail',array['uuid','uuid','jsonb','uuid','uuid'],'ordinary detail publication remains');
select has_function('public','c1_correct_published_project_cost_detail',array['uuid','uuid','jsonb','uuid','uuid'],'ordinary detail correction remains');
select ok(has_function_privilege('authenticated','public.c1_correct_published_project_cost(uuid,uuid,jsonb,uuid,uuid)','execute'),'authenticated retains guarded published-parent correction grant');
select ok(has_function_privilege('authenticated','public.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid)','execute'),'authenticated retains guarded ordinary detail grant');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select ok(exists(select 1 from public.project_cost_items where id='c1060000-0000-4000-8000-000000000201'),'reader sees published historical parent');
select throws_ok($$insert into public.project_cost_items(tenant_id,company_id,project_id,description,currency_code,work_status,created_by) values('c1060000-0000-4000-8000-000000000010','c1060000-0000-4000-8000-000000000020','c1060000-0000-4000-8000-000000000101','denied','VND','unknown','c1060000-0000-4000-8000-000000000901')$$,'42501',null,'authenticated direct parent insert remains denied');
select throws_ok($$select public.c1_create_project_cost_detail_draft('c1060000-0000-4000-8000-000000000020','{"projectId":"c1060000-0000-4000-8000-000000000101","categoryId":"c1060000-0000-4000-8000-000000000301","description":"Denied"}','c1060000-0000-4000-8000-000000000711','c1060000-0000-4000-8000-000000000712')$$,'P0001','PERMISSION_DENIED','cost.read cannot create an ordinary detail');
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select ok(public.c1_read_project_cost_draft_management_metadata('c1060000-0000-4000-8000-000000000020') ? 'categories','cost.manage reads metadata used by ordinary detail creation');
create temp table c106_detail as
select public.c1_create_project_cost_detail_draft('c1060000-0000-4000-8000-000000000020',
  '{"projectId":"c1060000-0000-4000-8000-000000000101","categoryId":"c1060000-0000-4000-8000-000000000301","description":"Ordinary detail"}',
  'c1060000-0000-4000-8000-000000000713','c1060000-0000-4000-8000-000000000714') result;
select is((select result->>'publicationState' from c106_detail),'draft','cost.manage creates only a detail draft');
select is((public.c1_create_project_cost_detail_draft('c1060000-0000-4000-8000-000000000020',
  '{"projectId":"c1060000-0000-4000-8000-000000000101","categoryId":"c1060000-0000-4000-8000-000000000301","description":"Ordinary detail"}',
  'c1060000-0000-4000-8000-000000000713','c1060000-0000-4000-8000-000000000715')->>'replayed'),'true','ordinary detail create receipt replays');
reset role;
select ok(not exists(select 1 from public.project_cost_items where tenant_id='c1060000-0000-4000-8000-000000000010' and publication_state='draft'),'ordinary detail create leaves no parent draft');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000902","role":"authenticated"}',true);
create temp table c106_prepared as select public.c1_prepare_project_cost_detail_financials('c1060000-0000-4000-8000-000000000020',
  (select (result->>'id')::uuid from c106_detail),'{"expectedVersion":0,"amount":"2.0000"}',
  'c1060000-0000-4000-8000-000000000716') result;
select is((select result->>'version' from c106_prepared),'1','cost.prepare versions ordinary detail financials');
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000904","role":"authenticated"}',true);
create temp table c106_published as select public.c1_publish_project_cost_detail('c1060000-0000-4000-8000-000000000020',
  (select (result->>'id')::uuid from c106_detail),'{"expectedVersion":1}',
  'c1060000-0000-4000-8000-000000000717','c1060000-0000-4000-8000-000000000718') result;
select is((select result->>'publicationState' from c106_published),'published','cost.publish_import publishes ordinary detail');
reset role;
select is((select item.amount_text from public.project_cost_items item where item.id=(select (result->>'projectCostItemId')::uuid from c106_detail)),'2.0000','ordinary detail publication derives exact parent total');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1060000-0000-4000-8000-000000000905","role":"authenticated"}',true);
create temp table c106_corrected as select public.c1_correct_published_project_cost('c1060000-0000-4000-8000-000000000020',
  'c1060000-0000-4000-8000-000000000201','{"expectedVersion":0,"reason":"Correct historical description","operationalChanges":{"description":"C106 corrected historical parent"}}',
  'c1060000-0000-4000-8000-000000000719','c1060000-0000-4000-8000-000000000720') result;
select is((select result->>'publicationState' from c106_corrected),'published','published-parent correction remains available');
select is((public.c1_correct_published_project_cost('c1060000-0000-4000-8000-000000000020',
  'c1060000-0000-4000-8000-000000000201','{"expectedVersion":0,"reason":"Correct historical description","operationalChanges":{"description":"C106 corrected historical parent"}}',
  'c1060000-0000-4000-8000-000000000719','c1060000-0000-4000-8000-000000000721')->>'replayed'),'true','published-parent correction receipt replays');
reset role;
select is((select amount_text from public.project_cost_items where id='c1060000-0000-4000-8000-000000000201'),'1.0000','operational correction preserves historical parent amount');
select ok(exists(select 1 from public.audit_events where action='c1.project_cost_item.corrected' and resource_id='c1060000-0000-4000-8000-000000000201'),'published-parent correction keeps audit history');
select * from extensions.finish(true);
rollback;
