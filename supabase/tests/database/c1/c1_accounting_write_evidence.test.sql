begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;

select plan(21);

select has_table('public', 'cost_evidence_files', 'evidence file registry exists');
select has_table('public', 'cost_evidence_links', 'evidence link registry exists');
select is((select public from storage.buckets where id = 'c1-accounting-evidence'), false, 'evidence bucket is private');
select is((select file_size_limit from storage.buckets where id = 'c1-accounting-evidence'), 26214400::bigint, 'evidence bucket limit is 25 MiB');
select is((select allowed_mime_types from storage.buckets where id = 'c1-accounting-evidence'), array['application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg']::text[], 'evidence MIME allow-list is exact');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'c1_accounting_evidence_%' and cmd in ('UPDATE','DELETE')), 0::bigint, 'evidence objects have no update or delete policy');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_files', 'insert'), 'authenticated cannot insert evidence registry rows directly');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_files', 'update'), 'authenticated cannot mutate evidence registry rows directly');
select ok(has_function_privilege('authenticated', 'public.c1_create_cost_evidence_intent(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can call intent RPC');
select ok(has_function_privilege('authenticated', 'public.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can call finalize RPC');
select ok(has_function_privilege('authenticated', 'public.c1_link_cost_evidence(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can call link RPC');

do $$
declare
  tenant_id constant uuid := 'c1070000-0000-4000-8000-000000000010';
  company_id constant uuid := 'c1070000-0000-4000-8000-000000000020';
  preparer constant uuid := 'c1070000-0000-4000-8000-000000000901';
  manager constant uuid := 'c1070000-0000-4000-8000-000000000902';
begin
  insert into auth.users(id,email) values(preparer,'c107-preparer@taskovia.invalid'),(manager,'c107-manager@taskovia.invalid');
  insert into public.tenants(id,code,name) values(tenant_id,'c107','C107 synthetic tenant');
  insert into public.companies(id,tenant_id,code,name) values(company_id,tenant_id,'C107','C107 synthetic company');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values(preparer,tenant_id,array['member']), (manager,tenant_id,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values(preparer,tenant_id,company_id,array['member'],true),(manager,tenant_id,company_id,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
    ('c1070000-0000-4000-8000-000000000911',tenant_id,company_id,'c107_preparer','C107 preparer','Synthetic',false),
    ('c1070000-0000-4000-8000-000000000912',tenant_id,company_id,'c107_manager','C107 manager','Synthetic',false);
  insert into public.role_permissions(role_id,permission_code) values
    ('c1070000-0000-4000-8000-000000000911','cost.prepare'),
    ('c1070000-0000-4000-8000-000000000911','cost.source.read'),
    ('c1070000-0000-4000-8000-000000000911','cost.file.read'),
    ('c1070000-0000-4000-8000-000000000912','cost.manage');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
    (tenant_id,company_id,preparer,'c1070000-0000-4000-8000-000000000911',preparer,'fixture'),
    (tenant_id,company_id,manager,'c1070000-0000-4000-8000-000000000912',preparer,'fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values(company_id,tenant_id,true,preparer);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values('c1070000-0000-4000-8000-000000000101',tenant_id,company_id,'C107-P','C107 project','manual',preparer);
  perform set_config('taskovia.c1_finance.actor_id',preparer::text,true); perform set_config('taskovia.c1_finance.request_id','c1070000-0000-4000-8000-000000000601',true); perform set_config('taskovia.c1_finance.change_reason','fixture',true);
  insert into public.cost_categories(id,tenant_id,company_id,code,name,display_order,created_by,updated_by) values('c1070000-0000-4000-8000-000000000301',tenant_id,company_id,'materials','Materials',1,preparer,preparer);
  insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_at,created_by)
  values('c1070000-0000-4000-8000-000000000201',tenant_id,company_id,'c1070000-0000-4000-8000-000000000101','c1070000-0000-4000-8000-000000000301','C107 published',1,'1','VND','unknown','published','legacy_backfill',now(),preparer);
  insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version)
  values('c1070000-0000-4000-8000-000000000401',tenant_id,company_id,'c1070000-0000-4000-8000-000000000101',tenant_id::text||'/'||company_id::text||'/c1070000-0000-4000-8000-000000000101/c1070000-0000-4000-8000-000000000401','contract.pdf','application/pdf',8,repeat('a',64),'application/pdf',8,repeat('a',64),'finalized',now()+interval '15 minutes',preparer,preparer,now(),1);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1070000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_create_cost_evidence_intent('c1070000-0000-4000-8000-000000000020','c1070000-0000-4000-8000-000000000101','{"originalFilename":"denied.pdf","mimeType":"application/pdf","sizeBytes":8,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}','c1070000-0000-4000-8000-000000000701','c1070000-0000-4000-8000-000000000702')$$,
  'P0001','PERMISSION_DENIED','cost.manage cannot substitute for cost.prepare'
);

select set_config('request.jwt.claims','{"sub":"c1070000-0000-4000-8000-000000000901","role":"authenticated"}',true);
create temp table c1_evidence_intent_result as select public.c1_create_cost_evidence_intent(
  'c1070000-0000-4000-8000-000000000020','c1070000-0000-4000-8000-000000000101',
  '{"originalFilename":"invoice.pdf","mimeType":"application/pdf","sizeBytes":8,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
  'c1070000-0000-4000-8000-000000000711','c1070000-0000-4000-8000-000000000712') result;
select is((select result->>'version' from c1_evidence_intent_result),'0','intent creates pending version zero');
select is((select array_length(string_to_array(result->>'objectPath','/'),1) from c1_evidence_intent_result),4,'immutable object path has scoped IDs and no filename');
select is((public.c1_create_cost_evidence_intent(
  'c1070000-0000-4000-8000-000000000020','c1070000-0000-4000-8000-000000000101',
  '{"originalFilename":"invoice.pdf","mimeType":"application/pdf","sizeBytes":8,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
  'c1070000-0000-4000-8000-000000000711','c1070000-0000-4000-8000-000000000713')->>'replayed')::boolean,true,'intent replay returns the same registry row');
select throws_ok(
  $$select public.c1_finalize_cost_evidence('c1070000-0000-4000-8000-000000000020',(select (result->>'evidenceFileId')::uuid from c1_evidence_intent_result),'{"expectedVersion":0,"mimeType":"application/pdf","sizeBytes":9,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}','c1070000-0000-4000-8000-000000000714','c1070000-0000-4000-8000-000000000715')$$,
  'P0001','EVIDENCE_UPLOAD_MISMATCH','finalize rejects mismatched verified identity'
);
select is((public.c1_link_cost_evidence(
  'c1070000-0000-4000-8000-000000000020','c1070000-0000-4000-8000-000000000201',
  '{"evidenceFileId":"c1070000-0000-4000-8000-000000000401","evidenceKind":"contract"}',
  'c1070000-0000-4000-8000-000000000716','c1070000-0000-4000-8000-000000000717')->>'evidenceKind'),'contract','finalized evidence links to a published cost');

reset role;
select is((select version from public.project_cost_items where id='c1070000-0000-4000-8000-000000000201'),0::bigint,'evidence-only link does not change cost version');
select is((select count(*) from public.project_cost_item_sources where project_cost_item_id='c1070000-0000-4000-8000-000000000201'),0::bigint,'evidence-only link creates no financial source figure');
select throws_ok(
  $$update public.cost_evidence_files set original_filename='replacement.pdf' where id='c1070000-0000-4000-8000-000000000401'$$,
  'P0001','HISTORY_IMMUTABLE','finalized evidence identity is immutable'
);
select throws_ok(
  $$delete from public.cost_evidence_links where project_cost_item_id='c1070000-0000-4000-8000-000000000201'$$,
  'P0001','HISTORY_IMMUTABLE','evidence links are immutable'
);

select * from extensions.finish(true);
rollback;
