begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;

select plan(35);

select has_table('public', 'project_cost_item_detail_sources', 'detail source provenance table exists');
select has_table('public', 'cost_evidence_links', 'evidence links table exists');
select has_column('public', 'cost_evidence_links', 'project_cost_item_detail_id', 'evidence links can target a detail');
select col_not_null('public', 'project_cost_item_detail_sources', 'tenant_id', 'detail provenance remains tenant scoped');
select col_not_null('public', 'project_cost_item_detail_sources', 'company_id', 'detail provenance remains company scoped');
select has_index('public', 'project_cost_item_detail_sources', 'project_cost_item_detail_sources_scope_idx', 'detail provenance has a scoped index');
select has_index('public', 'cost_evidence_links', 'cost_evidence_links_detail_idx', 'detail evidence has a scoped index');
select has_index('public', 'cost_evidence_links', 'cost_evidence_links_detail_unique', 'detail evidence prevents duplicate links');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'insert'), 'authenticated cannot write source provenance directly');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'update'), 'authenticated cannot update source provenance directly');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'delete'), 'authenticated cannot delete source provenance directly');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_links', 'insert'), 'authenticated cannot write evidence links directly');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_links', 'update'), 'authenticated cannot update evidence links directly');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_links', 'delete'), 'authenticated cannot delete evidence links directly');
select ok(to_regprocedure('public.c1_link_project_cost_detail_evidence(uuid,uuid,jsonb,uuid,uuid)') is not null, 'detail evidence link RPC exists');
select ok(has_function_privilege('authenticated', 'public.c1_link_project_cost_detail_evidence(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated may call guarded detail evidence link RPC');
select ok(to_regprocedure('public.c1_get_cost_evidence_read_target(uuid,uuid)') is not null, 'guarded raw evidence target remains available');
select ok(exists (select 1 from pg_constraint where conrelid='public.cost_evidence_links'::regclass and contype='c' and pg_get_constraintdef(oid) like '%project_cost_item_detail_id%'), 'exactly-one target check includes detail links');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='project_cost_item_detail_sources' and policyname='c1_project_cost_item_detail_sources_select'), 'detail source RLS is explicit');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='cost_evidence_links' and policyname='c1_cost_evidence_links_select'), 'evidence link RLS remains explicit');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_details', 'update'), 'detail lifecycle remains command-only');
select ok(to_regprocedure('private.c1_sync_project_cost_item_amount(uuid)') is not null, 'parent aggregate remains derived from details');
select ok(to_regprocedure('private.c1_can_read_project_cost_detail(uuid,uuid,uuid,text)') is not null, 'detail read authorization remains lifecycle-aware');
select ok(to_regprocedure('private.c1_can_select_evidence_object(text,text)') is not null, 'storage raw read remains resource-aware');

do $$
declare
  v_tenant uuid := 'c1f30000-0000-4000-8000-000000000010';
  v_company uuid := 'c1f30000-0000-4000-8000-000000000020';
  v_actor uuid := 'c1f30000-0000-4000-8000-000000000901';
  v_file_only uuid := 'c1f30000-0000-4000-8000-000000000902';
begin
  insert into auth.users(id,email) values(v_actor,'c1f3-actor@taskovia.invalid'),(v_file_only,'c1f3-file@taskovia.invalid');
  insert into public.tenants(id,code,name) values(v_tenant,'c1f3','C1F3');
  insert into public.companies(id,tenant_id,code,name) values(v_company,v_tenant,'C1F3','C1F3');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values(v_actor,v_tenant,array['member']),(v_file_only,v_tenant,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values(v_actor,v_tenant,v_company,array['member'],true),(v_file_only,v_tenant,v_company,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values('c1f30000-0000-4000-8000-000000000911',v_tenant,v_company,'c1f3_reader','C1F3 reader','fixture',false),('c1f30000-0000-4000-8000-000000000912',v_tenant,v_company,'c1f3_file','C1F3 file','fixture',false);
  insert into public.role_permissions(role_id,permission_code) values('c1f30000-0000-4000-8000-000000000911','cost.prepare'),('c1f30000-0000-4000-8000-000000000911','cost.source.read'),('c1f30000-0000-4000-8000-000000000911','cost.read'),('c1f30000-0000-4000-8000-000000000911','cost.file.read'),('c1f30000-0000-4000-8000-000000000912','cost.file.read');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values(v_tenant,v_company,v_actor,'c1f30000-0000-4000-8000-000000000911',v_actor,'fixture'),(v_tenant,v_company,v_file_only,'c1f30000-0000-4000-8000-000000000912',v_actor,'fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values(v_company,v_tenant,true,v_actor);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values('c1f30000-0000-4000-8000-000000000101',v_tenant,v_company,'C1F3-P','C1F3 project','manual',v_actor);
  insert into public.cost_categories(id,tenant_id,company_id,code,name,display_order,posting_strategy,created_by,updated_by) values('c1f30000-0000-4000-8000-000000000301',v_tenant,v_company,'materials','Materials',1,'ordinary_detail',v_actor,v_actor);
  insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_by,published_at,publication_request_id,created_by) values
    ('c1f30000-0000-4000-8000-000000000201',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000301','Published parent',1,'1.0000','VND','unknown','published','command',v_actor,now(),'c1f30000-0000-4000-8000-000000000701',v_actor);
  insert into public.project_cost_item_details(id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,amount_text,publication_state,publication_origin,published_by,published_at,publication_request_id,created_by) values
    ('c1f30000-0000-4000-8000-000000000401',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000201',1,'line_item','Draft detail','1.0000','draft',null,null,null,null,v_actor),
    ('c1f30000-0000-4000-8000-000000000402',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000201',2,'line_item','Published detail','1.0000','published','command',v_actor,now(),'c1f30000-0000-4000-8000-000000000702',v_actor);
  insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version) values
    ('c1f30000-0000-4000-8000-000000000501',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101',v_tenant::text||'/'||v_company::text||'/c1f30000-0000-4000-8000-000000000101/c1f30000-0000-4000-8000-000000000501','proof.pdf','application/pdf',8,repeat('a',64),'application/pdf',8,repeat('a',64),'finalized',now()+interval '1 hour',v_actor,v_actor,now(),1);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"c1f30000-0000-4000-8000-000000000501","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000711','c1f30000-0000-4000-8000-000000000712')->>'replayed')::boolean,false,'finalized same-project detail evidence links once');
select is((public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"c1f30000-0000-4000-8000-000000000501","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000711','c1f30000-0000-4000-8000-000000000712')->>'replayed')::boolean,true,'detail evidence command replays exactly');
select throws_ok($$select public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"c1f30000-0000-4000-8000-000000000501","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000721','c1f30000-0000-4000-8000-000000000722')$$,'P0001','INPUT_INVALID','duplicate detail evidence under a new key is stable');
select throws_ok($$select public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"not-a-uuid","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000713','c1f30000-0000-4000-8000-000000000714')$$,'P0001','INPUT_INVALID','invalid detail evidence UUID is stable');
reset role;
set local role service_role;
select throws_ok($$insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,evidence_kind,request_id,created_by) values('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000501','invoice','c1f30000-0000-4000-8000-000000000715','c1f30000-0000-4000-8000-000000000901')$$,'23514',null,'exact-one target rejects an unscoped evidence link');
insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,project_cost_item_id,evidence_kind,request_id,created_by) values('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000501','c1f30000-0000-4000-8000-000000000201','contract','c1f30000-0000-4000-8000-000000000716','c1f30000-0000-4000-8000-000000000901');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select ok(not private.c1_can_select_evidence_object('c1-accounting-evidence','c1f30000-0000-4000-8000-000000000010/c1f30000-0000-4000-8000-000000000020/c1f30000-0000-4000-8000-000000000101/c1f30000-0000-4000-8000-000000000501'),'a draft detail link blocks mixed parent raw access');
reset role;
set local role service_role;
update public.project_cost_item_details set publication_state='published',publication_origin='command',published_by='c1f30000-0000-4000-8000-000000000901',published_at=now(),publication_request_id='c1f30000-0000-4000-8000-000000000717' where id='c1f30000-0000-4000-8000-000000000401';
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select ok(private.c1_can_select_evidence_object('c1-accounting-evidence','c1f30000-0000-4000-8000-000000000010/c1f30000-0000-4000-8000-000000000020/c1f30000-0000-4000-8000-000000000101/c1f30000-0000-4000-8000-000000000501'),'published detail link permits raw access with both capabilities');
select is((select version from public.project_cost_items where id='c1f30000-0000-4000-8000-000000000201'),0::bigint,'detail evidence link is financially and version neutral');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is((select count(*) from public.cost_evidence_links where evidence_file_id='c1f30000-0000-4000-8000-000000000501'),0::bigint,'cost.file.read alone cannot list evidence metadata');
reset role;
set local role service_role;
insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,created_by) values('c1f30000-0000-4000-8000-000000000202','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000301','Draft parent',1,'1.0000','VND','unknown','draft','c1f30000-0000-4000-8000-000000000901');
insert into public.project_cost_item_details(id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,amount_text,publication_state,created_by) values('c1f30000-0000-4000-8000-000000000403','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000202',1,'line_item','Legacy prepared draft','1.0000','draft','c1f30000-0000-4000-8000-000000000901');
update public.project_cost_items set publication_state='published',publication_origin='command',published_by='c1f30000-0000-4000-8000-000000000901',published_at=now(),publication_request_id='c1f30000-0000-4000-8000-000000000718' where id='c1f30000-0000-4000-8000-000000000202';
select is((select publication_state from public.project_cost_item_details where id='c1f30000-0000-4000-8000-000000000403'),'published','legacy parent publish promotes draft snapshot children');
insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_at,created_by) values('c1f30000-0000-4000-8000-000000000203','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000301','Legacy parent',1,'1.0000','VND','unknown','published','legacy_backfill',now(),'c1f30000-0000-4000-8000-000000000901');
select set_config('taskovia.c1_cost_write.snapshot','1',true);
insert into public.project_cost_item_details(id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,amount_text,publication_state,created_by) values('c1f30000-0000-4000-8000-000000000404','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000203',1,'line_item','Legacy correction replacement','1.0000','draft','c1f30000-0000-4000-8000-000000000901');
insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary) values('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000901','c1.project_cost_item.corrected','project_cost_item','c1f30000-0000-4000-8000-000000000203','c1f30000-0000-4000-8000-000000000719','{}');
select is((select publication_request_id from public.project_cost_item_details where id='c1f30000-0000-4000-8000-000000000404'),'c1f30000-0000-4000-8000-000000000719'::uuid,'legacy correction replacement receives current command request metadata');
reset role;

select * from finish();
rollback;
