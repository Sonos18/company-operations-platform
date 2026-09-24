begin;

do $$
declare
  tenant_a constant uuid:='c1010000-0000-4000-8000-000000000010'; company_a constant uuid:='c1010000-0000-4000-8000-000000000020'; company_disabled constant uuid:='c1010000-0000-4000-8000-000000000021';
  tenant_b constant uuid:='c1010000-0000-4000-8000-000000000011'; company_b constant uuid:='c1010000-0000-4000-8000-000000000022';
  reader constant uuid:='c1010000-0000-4000-8000-000000000901'; manager constant uuid:='c1010000-0000-4000-8000-000000000902'; preparer constant uuid:='c1010000-0000-4000-8000-000000000903'; publisher constant uuid:='c1010000-0000-4000-8000-000000000904'; corrector constant uuid:='c1010000-0000-4000-8000-000000000905'; denied constant uuid:='c1010000-0000-4000-8000-000000000906';
begin
  insert into auth.users(id,email) values(reader,'c101-reader@taskovia.invalid'),(manager,'c101-manager@taskovia.invalid'),(preparer,'c101-preparer@taskovia.invalid'),(publisher,'c101-publisher@taskovia.invalid'),(corrector,'c101-corrector@taskovia.invalid'),(denied,'c101-denied@taskovia.invalid');
  insert into public.tenants(id,code,name) values(tenant_a,'C101-A','C101 tenant A'),(tenant_b,'C101-B','C101 tenant B');
  insert into public.companies(id,tenant_id,code,name) values(company_a,tenant_a,'C101-A1','C101 company A'),(company_disabled,tenant_a,'C101-A2','C101 disabled'),(company_b,tenant_b,'C101-B1','C101 foreign');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values(reader,tenant_a,array['member']),(manager,tenant_a,array['member']),(preparer,tenant_a,array['member']),(publisher,tenant_a,array['member']),(corrector,tenant_a,array['member']),(denied,tenant_a,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values(reader,tenant_a,company_a,array['member'],true),(manager,tenant_a,company_a,array['member'],true),(preparer,tenant_a,company_a,array['member'],true),(publisher,tenant_a,company_a,array['member'],true),(corrector,tenant_a,company_a,array['member'],true),(denied,tenant_a,company_a,array['member'],true),(manager,tenant_a,company_disabled,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
    ('c1010000-0000-4000-8000-000000000911',tenant_a,company_a,'c101_reader','Reader','Synthetic',false),('c1010000-0000-4000-8000-000000000912',tenant_a,company_a,'c101_manager','Manager','Synthetic',false),('c1010000-0000-4000-8000-000000000913',tenant_a,company_a,'c101_preparer','Preparer','Synthetic',false),('c1010000-0000-4000-8000-000000000914',tenant_a,company_a,'c101_publisher','Publisher','Synthetic',false),('c1010000-0000-4000-8000-000000000915',tenant_a,company_a,'c101_corrector','Corrector','Synthetic',false),('c1010000-0000-4000-8000-000000000916',tenant_a,company_a,'c101_denied','Denied','Synthetic',false),('c1010000-0000-4000-8000-000000000917',tenant_a,company_disabled,'c101_disabled_manager','Disabled manager','Synthetic',false);
  insert into public.role_permissions(role_id,permission_code) values('c1010000-0000-4000-8000-000000000911','cost.read'),('c1010000-0000-4000-8000-000000000912','cost.manage'),('c1010000-0000-4000-8000-000000000913','cost.prepare'),('c1010000-0000-4000-8000-000000000914','cost.publish_import'),('c1010000-0000-4000-8000-000000000915','cost.correct'),('c1010000-0000-4000-8000-000000000917','cost.manage');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
    (tenant_a,company_a,reader,'c1010000-0000-4000-8000-000000000911',manager,'fixture'),(tenant_a,company_a,manager,'c1010000-0000-4000-8000-000000000912',manager,'fixture'),(tenant_a,company_a,preparer,'c1010000-0000-4000-8000-000000000913',manager,'fixture'),(tenant_a,company_a,publisher,'c1010000-0000-4000-8000-000000000914',manager,'fixture'),(tenant_a,company_a,corrector,'c1010000-0000-4000-8000-000000000915',manager,'fixture'),(tenant_a,company_a,denied,'c1010000-0000-4000-8000-000000000916',manager,'fixture'),(tenant_a,company_disabled,manager,'c1010000-0000-4000-8000-000000000917',manager,'fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values(company_a,tenant_a,true,manager),(company_disabled,tenant_a,false,manager);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values('c1010000-0000-4000-8000-000000000101',tenant_a,company_a,'C101-P1','Project one','manual',manager),('c1010000-0000-4000-8000-000000000103',tenant_b,company_b,'C101-P3','Foreign project','manual',manager),('c1010000-0000-4000-8000-000000000104',tenant_a,company_disabled,'C101-P4','Disabled project','manual',manager),('c1010000-0000-4000-8000-000000000105',tenant_a,company_a,'C101-P5','No-cost project','manual',manager);
  perform set_config('taskovia.c1_finance.actor_id',manager::text,true); perform set_config('taskovia.c1_finance.request_id','c1010000-0000-4000-8000-000000000601',true); perform set_config('taskovia.c1_finance.change_reason','fixture',true);
  insert into public.cost_categories(id,tenant_id,company_id,code,name,display_order,posting_strategy,created_by,updated_by) values('c1010000-0000-4000-8000-000000000301',tenant_a,company_a,'materials','Materials',1,'ordinary_detail',manager,manager);
  insert into public.project_cost_items(id,tenant_id,company_id,project_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_at,created_by) values
    ('c1010000-0000-4000-8000-000000000801',tenant_b,company_b,'c1010000-0000-4000-8000-000000000103','Foreign official',1,'1','VND','unknown','published','legacy_backfill',now(),manager),
    ('c1010000-0000-4000-8000-000000000802',tenant_a,company_disabled,'c1010000-0000-4000-8000-000000000104','Disabled official',1,'1','VND','unknown','published','legacy_backfill',now(),manager),
    ('c1010000-0000-4000-8000-000000000803',tenant_a,company_a,'c1010000-0000-4000-8000-000000000101','High precision official',9007199254740993.0000,'9007199254740993.0000','VND','unknown','published','legacy_backfill',now(),manager);
end $$;

do $$ begin
  if has_table_privilege('authenticated','public.project_cost_items','insert') or has_table_privilege('authenticated','public.project_cost_items','update') or has_table_privilege('authenticated','public.project_cost_items','delete') then raise exception 'C1_PC_PERMISSION_BOUNDARY'; end if;
  if has_function_privilege('authenticated','private.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid)','execute') or has_function_privilege('authenticated','private.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid)','execute') then raise exception 'C1_PC_PRIVATE_BOUNDARY'; end if;
  if not exists(select 1 from public.project_cost_items where id='c1010000-0000-4000-8000-000000000803' and amount=9007199254740993.0000 and amount_text='9007199254740993.0000') then raise exception 'C1_PC_DECIMAL_SAFE_AMOUNT'; end if;
end $$;

set local role anon;
do $$ begin begin perform public.c1_read_project_cost_project_metadata('c1010000-0000-4000-8000-000000000020',array['c1010000-0000-4000-8000-000000000101'::uuid]);raise exception 'C1_PC_METADATA_ANON_RPC';exception when insufficient_privilege then null;end;end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000902","role":"authenticated"}',true);
create temp table c101_created as select public.c1_create_project_cost_draft('c1010000-0000-4000-8000-000000000020','{"projectId":"c1010000-0000-4000-8000-000000000101","description":"Tracked draft","costCategoryId":"c1010000-0000-4000-8000-000000000301","workStatus":"in_progress","businessReference":"C101-REF"}','c1010000-0000-4000-8000-000000000711','c1010000-0000-4000-8000-000000000712') result;
do $$ declare replay jsonb; begin
  if (select amount is not null or publication_state<>'draft' from public.project_cost_items where id=(select (result->>'id')::uuid from c101_created)) then raise exception 'C1_PC_DRAFT_SHAPE'; end if;
  select public.c1_create_project_cost_draft('c1010000-0000-4000-8000-000000000020','{"projectId":"c1010000-0000-4000-8000-000000000101","description":"Tracked draft","costCategoryId":"c1010000-0000-4000-8000-000000000301","workStatus":"in_progress","businessReference":"C101-REF"}','c1010000-0000-4000-8000-000000000711','c1010000-0000-4000-8000-000000000713') into replay;
  if not(replay->>'replayed')::boolean then raise exception 'C1_PC_IDEMPOTENCY'; end if;
  begin perform public.c1_create_project_cost_draft('c1010000-0000-4000-8000-000000000020','{"projectId":"c1010000-0000-4000-8000-000000000101","description":"Changed","costCategoryId":"c1010000-0000-4000-8000-000000000301"}','c1010000-0000-4000-8000-000000000711','c1010000-0000-4000-8000-000000000714');raise exception 'missing conflict';exception when sqlstate 'P0001' then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
  perform public.c1_update_project_cost_draft('c1010000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c101_created),'{"expectedVersion":0,"description":"Tracked item"}','c1010000-0000-4000-8000-000000000715');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.project_cost_items where id=(select (result->>'id')::uuid from c101_created)) then raise exception 'C1_PC_DRAFT_LEAK'; end if; end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000903","role":"authenticated"}',true);
do $$ declare prepared jsonb; begin select public.c1_prepare_project_cost_financials('c1010000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c101_created),'{"expectedVersion":1,"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Canonical detail","amount":"100.0000"}],"sourceFigureIds":[]}','c1010000-0000-4000-8000-000000000716') into prepared;if prepared->>'amount'<>'100.0000' or (prepared->>'version')::bigint<>2 then raise exception 'C1_PC_PREPARE';end if;end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000904","role":"authenticated"}',true);
create temp table c101_published as select public.c1_publish_project_cost('c1010000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c101_created),2,'c1010000-0000-4000-8000-000000000717','c1010000-0000-4000-8000-000000000718') result;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$ declare metadata jsonb; begin
  if not exists(select 1 from public.project_cost_items where id=(select (result->>'id')::uuid from c101_created) and publication_state='published') then raise exception 'C1_PC_PUBLISH_VISIBILITY'; end if;
  if exists(select 1 from public.project_cost_items where company_id in('c1010000-0000-4000-8000-000000000021','c1010000-0000-4000-8000-000000000022')) then raise exception 'C1_PC_SCOPE'; end if;
  select public.c1_read_project_cost_project_metadata('c1010000-0000-4000-8000-000000000020',array['c1010000-0000-4000-8000-000000000101'::uuid,'c1010000-0000-4000-8000-000000000105'::uuid]) into metadata;
  if jsonb_array_length(metadata)<>1 or metadata->0->>'projectId'<>'c1010000-0000-4000-8000-000000000101' then raise exception 'C1_PC_METADATA_SCOPE C1_PC_METADATA_NO_COST_PROJECT'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(metadata->0) key)<>array['projectCode','projectId','projectName'] then raise exception 'C1_PC_METADATA_MINIMIZATION';end if;
  if exists(select 1 from public.projects where company_id='c1010000-0000-4000-8000-000000000020') then raise exception 'C1_PC_METADATA_PROJECT_RLS';end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000906","role":"authenticated"}',true);
do $$ begin begin perform public.c1_read_project_cost_project_metadata('c1010000-0000-4000-8000-000000000020',array['c1010000-0000-4000-8000-000000000101'::uuid]);raise exception 'C1_PC_METADATA_PERMISSION';exception when sqlstate 'P0001' then if sqlerrm<>'PERMISSION_DENIED' then raise;end if;end;end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000905","role":"authenticated"}',true);
do $$ declare corrected jsonb; begin
  begin perform public.c1_correct_published_project_cost('c1010000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c101_created),'{"expectedVersion":3,"reason":" ","operationalChanges":{"workStatus":"accepted"}}','c1010000-0000-4000-8000-000000000719','c1010000-0000-4000-8000-000000000720');raise exception 'empty reason';exception when sqlstate 'P0001' then if sqlerrm<>'INPUT_INVALID' then raise;end if;end;
  select public.c1_correct_published_project_cost('c1010000-0000-4000-8000-000000000020',(select (result->>'id')::uuid from c101_created),'{"expectedVersion":3,"reason":"Correct source","financialChanges":{"currencyCode":"VND","details":[{"lineNo":1,"detailKind":"line_item","description":"Corrected detail","amount":"110.0000"}],"sourceFigureIds":[]}}','c1010000-0000-4000-8000-000000000721','c1010000-0000-4000-8000-000000000722') into corrected;
  if (corrected->>'version')::bigint<>4 then raise exception 'C1_PC_CORRECTION_VERSION'; end if;
end $$;
reset role;

do $$ begin
  if (select amount_text from public.project_cost_items where id=(select (result->>'id')::uuid from c101_created))<>'110.0000' or (select sum(amount_text::numeric) from public.project_cost_item_details where project_cost_item_id=(select (result->>'id')::uuid from c101_created))<>110 then raise exception 'C1_PC_DERIVED_AMOUNT'; end if;
  if not exists(select 1 from public.audit_events where action='c1.project_cost_item.corrected' and resource_id=(select result->>'id' from c101_created) and before_summary?'details' and after_summary?'details') then raise exception 'C1_PC_AUDIT_HISTORY'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1010000-0000-4000-8000-000000000902","role":"authenticated"}',true);
do $$ begin begin perform public.c1_create_project_cost_draft('c1010000-0000-4000-8000-000000000021','{"projectId":"c1010000-0000-4000-8000-000000000104","description":"Disabled","costCategoryId":"c1010000-0000-4000-8000-000000000301"}','c1010000-0000-4000-8000-000000000723','c1010000-0000-4000-8000-000000000724');raise exception 'disabled accepted';exception when sqlstate 'P0001' then if sqlerrm<>'MODULE_DISABLED' then raise;end if;end;end $$;
reset role;

select 'C1_PROJECT_COST_ITEMS_COMPLETE' as c1_fixture_completion;
rollback;
