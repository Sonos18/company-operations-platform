begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;

select plan(46);

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
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='cost_evidence_links' and policyname='c1_cost_evidence_links_select'), 'evidence link RLS remains explicit');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_details', 'update'), 'detail lifecycle remains command-only');
select ok(to_regprocedure('private.c1_sync_project_cost_item_amount(uuid)') is not null, 'parent aggregate remains derived from details');
select ok(to_regprocedure('private.c1_can_read_project_cost_detail(uuid,uuid,uuid,text)') is not null, 'detail read authorization remains lifecycle-aware');
select ok(not pg_catalog.has_function_privilege('authenticated', 'private.c1_detail_is_published(uuid,uuid,uuid)', 'execute'), 'authenticated cannot probe arbitrary detail publication state');
select ok(to_regprocedure('private.c1_can_select_evidence_object(text,text)') is not null, 'storage raw read remains resource-aware');

do $$
declare
  v_tenant uuid := 'c1f30000-0000-4000-8000-000000000010';
  v_company uuid := 'c1f30000-0000-4000-8000-000000000020';
  v_other_company uuid := 'c1f30000-0000-4000-8000-000000000021';
  v_actor uuid := 'c1f30000-0000-4000-8000-000000000901';
  v_file_only uuid := 'c1f30000-0000-4000-8000-000000000902';
  v_read_only uuid := 'c1f30000-0000-4000-8000-000000000903';
  v_prepare_only uuid := 'c1f30000-0000-4000-8000-000000000904';
  v_manage_only uuid := 'c1f30000-0000-4000-8000-000000000905';
begin
  insert into auth.users(id,email) values(v_actor,'c1f3-actor@taskovia.invalid'),(v_file_only,'c1f3-file@taskovia.invalid'),(v_read_only,'c1f3-read@taskovia.invalid'),(v_prepare_only,'c1f3-prepare@taskovia.invalid'),(v_manage_only,'c1f3-manage@taskovia.invalid');
  insert into public.tenants(id,code,name) values(v_tenant,'c1f3','C1F3');
  insert into public.companies(id,tenant_id,code,name) values(v_company,v_tenant,'C1F3','C1F3'),(v_other_company,v_tenant,'C1F3X','C1F3 foreign company');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values(v_actor,v_tenant,array['member']),(v_file_only,v_tenant,array['member']),(v_read_only,v_tenant,array['member']),(v_prepare_only,v_tenant,array['member']),(v_manage_only,v_tenant,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values(v_actor,v_tenant,v_company,array['member'],true),(v_file_only,v_tenant,v_company,array['member'],true),(v_read_only,v_tenant,v_company,array['member'],true),(v_prepare_only,v_tenant,v_company,array['member'],true),(v_manage_only,v_tenant,v_company,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values('c1f30000-0000-4000-8000-000000000911',v_tenant,v_company,'c1f3_primary','C1F3 primary','fixture',false),('c1f30000-0000-4000-8000-000000000912',v_tenant,v_company,'c1f3_file','C1F3 file','fixture',false),('c1f30000-0000-4000-8000-000000000913',v_tenant,v_company,'c1f3_read','C1F3 read','fixture',false),('c1f30000-0000-4000-8000-000000000914',v_tenant,v_company,'c1f3_prepare','C1F3 prepare','fixture',false),('c1f30000-0000-4000-8000-000000000915',v_tenant,v_company,'c1f3_manage','C1F3 manage','fixture',false);
  insert into public.role_permissions(role_id,permission_code) values('c1f30000-0000-4000-8000-000000000911','cost.prepare'),('c1f30000-0000-4000-8000-000000000911','cost.source.read'),('c1f30000-0000-4000-8000-000000000911','cost.read'),('c1f30000-0000-4000-8000-000000000911','cost.file.read'),('c1f30000-0000-4000-8000-000000000911','cost.record_cash'),('c1f30000-0000-4000-8000-000000000912','cost.file.read'),('c1f30000-0000-4000-8000-000000000913','cost.read'),('c1f30000-0000-4000-8000-000000000914','cost.prepare'),('c1f30000-0000-4000-8000-000000000915','cost.manage');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values(v_tenant,v_company,v_actor,'c1f30000-0000-4000-8000-000000000911',v_actor,'fixture'),(v_tenant,v_company,v_file_only,'c1f30000-0000-4000-8000-000000000912',v_actor,'fixture'),(v_tenant,v_company,v_read_only,'c1f30000-0000-4000-8000-000000000913',v_actor,'fixture'),(v_tenant,v_company,v_prepare_only,'c1f30000-0000-4000-8000-000000000914',v_actor,'fixture'),(v_tenant,v_company,v_manage_only,'c1f30000-0000-4000-8000-000000000915',v_actor,'fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values(v_company,v_tenant,true,v_actor),(v_other_company,v_tenant,true,v_actor);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values
    ('c1f30000-0000-4000-8000-000000000101',v_tenant,v_company,'C1F3-P','C1F3 project','manual',v_actor),
    ('c1f30000-0000-4000-8000-000000000102',v_tenant,v_other_company,'C1F3X-P','C1F3 foreign project','manual',v_actor),
    ('c1f30000-0000-4000-8000-000000000103',v_tenant,v_company,'C1F3-LEGACY-PUBLISH','C1F3 legacy publish project','manual',v_actor),
    ('c1f30000-0000-4000-8000-000000000104',v_tenant,v_company,'C1F3-LEGACY-CORRECT','C1F3 legacy correction project','manual',v_actor);
  perform set_config('taskovia.c1_finance.actor_id',v_actor::text,true); perform set_config('taskovia.c1_finance.request_id','c1f30000-0000-4000-8000-000000000790',true); perform set_config('taskovia.c1_finance.change_reason','fixture',true);
  insert into public.cost_categories(id,tenant_id,company_id,code,name,display_order,posting_strategy,created_by,updated_by) values('c1f30000-0000-4000-8000-000000000301',v_tenant,v_company,'materials','Materials',1,'ordinary_detail',v_actor,v_actor),('c1f30000-0000-4000-8000-000000000302',v_tenant,v_company,'subcontract_labor','Subcontract labor',2,'subcontract_payment',v_actor,v_actor),('c1f30000-0000-4000-8000-000000000303',v_tenant,v_other_company,'materials','Foreign materials',1,'ordinary_detail',v_actor,v_actor);
  insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_by,published_at,publication_request_id,created_by) values
    ('c1f30000-0000-4000-8000-000000000201',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000301','Published parent',1,'1.0000','VND','unknown','published','command',v_actor,now(),'c1f30000-0000-4000-8000-000000000701',v_actor),
    ('c1f30000-0000-4000-8000-000000000205',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000302','Legacy subcontract parent',19,'19.0000','VND','unknown','published','legacy_backfill',null,now(),null,v_actor),
    ('c1f30000-0000-4000-8000-000000000210',v_tenant,v_other_company,'c1f30000-0000-4000-8000-000000000102','c1f30000-0000-4000-8000-000000000303','Foreign parent',1,'1.0000','VND','unknown','published','legacy_backfill',null,now(),null,v_actor);
  insert into public.project_cost_item_details(id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,amount_text,publication_state,publication_origin,published_by,published_at,publication_request_id,created_by) values
    ('c1f30000-0000-4000-8000-000000000401',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000201',1,'line_item','Draft detail','1.0000','draft',null,null,null,null,v_actor),
    ('c1f30000-0000-4000-8000-000000000402',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000201',2,'line_item','Published detail','1.0000','published','command',v_actor,now(),'c1f30000-0000-4000-8000-000000000702',v_actor),
    ('c1f30000-0000-4000-8000-000000000405',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000205',1,'line_item','Legacy subcontract detail','19.0000','published','legacy_backfill',null,now(),null,v_actor),
    ('c1f30000-0000-4000-8000-000000000410',v_tenant,v_other_company,'c1f30000-0000-4000-8000-000000000210',1,'line_item','Foreign detail','1.0000','published','legacy_backfill',null,now(),null,v_actor);
  insert into public.controlled_import_runs(id,tenant_id,company_id,run_id,actor_id,idempotency_key,payload_digest,manifest_digest,input_digests,workbook_family,adapter_id,adapter_version,manifest_snapshot,request_id) values
    ('c1f30000-0000-4000-8000-000000000506',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000507',v_actor,'c1f30000-0000-4000-8000-000000000508',repeat('a',64),repeat('b',64),array[repeat('c',64)],'fixture','fixture','1','{}','c1f30000-0000-4000-8000-000000000509'),
    ('c1f30000-0000-4000-8000-000000000530',v_tenant,v_other_company,'c1f30000-0000-4000-8000-000000000531',v_actor,'c1f30000-0000-4000-8000-000000000532',repeat('d',64),repeat('e',64),array[repeat('f',64)],'fixture','fixture','1','{}','c1f30000-0000-4000-8000-000000000533');
  insert into public.accounting_sources(id,tenant_id,company_id,code,title,source_system,created_by) values('c1f30000-0000-4000-8000-000000000510',v_tenant,v_company,'C1F3-S','C1F3 source','fixture',v_actor),('c1f30000-0000-4000-8000-000000000534',v_tenant,v_other_company,'C1F3X-S','C1F3 foreign source','fixture',v_actor);
  insert into public.accounting_source_versions(id,tenant_id,company_id,source_id,import_run_id,version_no,input_file_identity,input_file_sha256,original_filename,status,created_by,shared_by,shared_at) values('c1f30000-0000-4000-8000-000000000511',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000510','c1f30000-0000-4000-8000-000000000506',1,'fixture',repeat('1',64),'fixture.xlsx','shared',v_actor,v_actor,now()),('c1f30000-0000-4000-8000-000000000535',v_tenant,v_other_company,'c1f30000-0000-4000-8000-000000000534','c1f30000-0000-4000-8000-000000000530',1,'foreign',repeat('2',64),'foreign.xlsx','shared',v_actor,v_actor,now());
  insert into public.source_selections(id,tenant_id,company_id,source_version_id,import_run_id,locator,locator_key,mapping_state,reviewed_mapping,mapped_project_id,observed_labels,raw_values,unresolved_issues,created_by) values('c1f30000-0000-4000-8000-000000000512',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000511','c1f30000-0000-4000-8000-000000000506','{"kind":"fixture"}','c1f3-source','confirmed','{}','c1f30000-0000-4000-8000-000000000101',array['C1F3'],array['1'],array[]::text[],v_actor),('c1f30000-0000-4000-8000-000000000536',v_tenant,v_other_company,'c1f30000-0000-4000-8000-000000000535','c1f30000-0000-4000-8000-000000000530','{"kind":"fixture"}','c1f3-foreign-source','confirmed','{}','c1f30000-0000-4000-8000-000000000102',array['C1F3X'],array['1'],array[]::text[],v_actor);
  insert into public.source_reported_figures(id,tenant_id,company_id,source_selection_id,import_run_id,figure_identity,label,raw_value_text,value_state,amount_text,amount,currency_code,metric_kind,basis,rounding_basis,period_basis,mapping_state,reviewed_mapping,project_id,scope_kind,scope_description,confirmation,status,created_by,shared_by,shared_at) values
    ('c1f30000-0000-4000-8000-000000000513',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000512','c1f30000-0000-4000-8000-000000000506',repeat('3',64),'Published detail source','1','known','1',1,'VND','cost_total','net','exact','unknown','confirmed','{}','c1f30000-0000-4000-8000-000000000101','whole_project','fixture','confirmed_external','shared',v_actor,v_actor,now()),
    ('c1f30000-0000-4000-8000-000000000514',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000512','c1f30000-0000-4000-8000-000000000506',repeat('4',64),'Draft detail source','1','known','1',1,'VND','cost_total','net','exact','unknown','confirmed','{}','c1f30000-0000-4000-8000-000000000101','whole_project','fixture','confirmed_external','shared',v_actor,v_actor,now()),
    ('c1f30000-0000-4000-8000-000000000537',v_tenant,v_other_company,'c1f30000-0000-4000-8000-000000000536','c1f30000-0000-4000-8000-000000000530',repeat('5',64),'Foreign detail source','1','known','1',1,'VND','cost_total','net','exact','unknown','confirmed','{}','c1f30000-0000-4000-8000-000000000102','whole_project','fixture','confirmed_external','shared',v_actor,v_actor,now());
  insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version) values
    ('c1f30000-0000-4000-8000-000000000501',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101',v_tenant::text||'/'||v_company::text||'/c1f30000-0000-4000-8000-000000000101/c1f30000-0000-4000-8000-000000000501','proof.pdf','application/pdf',8,repeat('a',64),'application/pdf',8,repeat('a',64),'finalized',now()+interval '1 hour',v_actor,v_actor,now(),1),
    ('c1f30000-0000-4000-8000-000000000502',v_tenant,v_other_company,'c1f30000-0000-4000-8000-000000000102',v_tenant::text||'/'||v_other_company::text||'/c1f30000-0000-4000-8000-000000000102/c1f30000-0000-4000-8000-000000000502','foreign-proof.pdf','application/pdf',8,repeat('b',64),'application/pdf',8,repeat('b',64),'finalized',now()+interval '1 hour',v_actor,v_actor,now(),1);
  insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by) values('c1f30000-0000-4000-8000-000000000601',v_tenant,v_company,'C1F3-SUB','C1F3 subcontractor','organization',v_actor);
  insert into public.project_subcontracts(id,tenant_id,company_id,project_id,subcontractor_party_id,code,contract_name,currency_code,created_by,updated_by) values('c1f30000-0000-4000-8000-000000000602',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000601','C1F3-SUB','C1F3 subcontract','VND',v_actor,v_actor);
  insert into public.project_subcontract_payments(id,tenant_id,company_id,project_id,project_subcontract_id,currency_code,description,paid_amount_text,created_by,updated_by) values('c1f30000-0000-4000-8000-000000000603',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000602','VND','C1F3 recorded payment','7.0000',v_actor,v_actor),('c1f30000-0000-4000-8000-000000000604',v_tenant,v_company,'c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000602','VND','C1F3 voided payment','11.0000',v_actor,v_actor);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000901","role":"authenticated"}',true);
create temp table c1f3_void_result as
select public.c1_void_subcontract_payment('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000602','c1f30000-0000-4000-8000-000000000604',0,'fixture void','c1f30000-0000-4000-8000-000000000740','c1f30000-0000-4000-8000-000000000741') result;
reset role;
create temp table c1f3_subcontract_actual_before as
select coalesce(sum(payment.paid_amount_text::numeric),0)::text actual
from public.project_subcontract_payments payment
where payment.project_subcontract_id='c1f30000-0000-4000-8000-000000000602' and payment.status='recorded';
insert into public.project_cost_item_detail_sources(tenant_id,company_id,project_cost_item_detail_id,source_reported_figure_id) values
  ('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000402','c1f30000-0000-4000-8000-000000000513'),
  ('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000021','c1f30000-0000-4000-8000-000000000410','c1f30000-0000-4000-8000-000000000537');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000901","role":"authenticated"}',true);
create temp table c1f3_prepare_result as
select public.c1_prepare_project_cost_detail_financials('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"expectedVersion":0,"amount":"1.0000","sourceFigureIds":["c1f30000-0000-4000-8000-000000000514"]}','c1f30000-0000-4000-8000-000000000742') result;
select is((public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"c1f30000-0000-4000-8000-000000000501","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000711','c1f30000-0000-4000-8000-000000000712')->>'replayed')::boolean,false,'finalized same-project detail evidence links once');
select is((public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"c1f30000-0000-4000-8000-000000000501","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000711','c1f30000-0000-4000-8000-000000000712')->>'replayed')::boolean,true,'detail evidence command replays exactly');
select throws_ok($$select public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"c1f30000-0000-4000-8000-000000000501","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000721','c1f30000-0000-4000-8000-000000000722')$$,'P0001','INPUT_INVALID','duplicate detail evidence under a new key is stable');
select throws_ok($$select public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000401','{"evidenceFileId":"not-a-uuid","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000713','c1f30000-0000-4000-8000-000000000714')$$,'P0001','INPUT_INVALID','invalid detail evidence UUID is stable');
select throws_ok($$select public.c1_link_project_cost_detail_evidence('c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000410','{"evidenceFileId":"c1f30000-0000-4000-8000-000000000502","evidenceKind":"invoice"}','c1f30000-0000-4000-8000-000000000750','c1f30000-0000-4000-8000-000000000751')$$,'P0001','RESOURCE_NOT_FOUND','same-tenant foreign detail and finalized evidence do not leak through the primary company command');
reset role;
select is((select count(*) from public.cost_evidence_links where project_cost_item_detail_id='c1f30000-0000-4000-8000-000000000410'),0::bigint,'foreign detail link attempt creates no link');
select is((select count(*) from public.audit_events where action='c1.cost_evidence.detail_linked' and request_id='c1f30000-0000-4000-8000-000000000751'),0::bigint,'foreign detail link attempt creates no audit event');
select is((select count(*) from public.cost_command_receipts where company_id='c1f30000-0000-4000-8000-000000000020' and actor_id='c1f30000-0000-4000-8000-000000000901' and command_name='cost_evidence.detail_link' and idempotency_key='c1f30000-0000-4000-8000-000000000750'),0::bigint,'foreign detail link attempt creates no receipt');
select throws_ok($$insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,evidence_kind,request_id,created_by) values('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000501','invoice','c1f30000-0000-4000-8000-000000000715','c1f30000-0000-4000-8000-000000000901')$$,'23514',null,'exact-one target rejects an unscoped evidence link');
insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,project_cost_item_id,evidence_kind,request_id,created_by) values('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000501','c1f30000-0000-4000-8000-000000000201','contract','c1f30000-0000-4000-8000-000000000716','c1f30000-0000-4000-8000-000000000901');
insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,project_subcontract_payment_id,evidence_kind,request_id,created_by) values('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000101','c1f30000-0000-4000-8000-000000000501','c1f30000-0000-4000-8000-000000000603','payment_proof','c1f30000-0000-4000-8000-000000000723','c1f30000-0000-4000-8000-000000000901');
select is((select count(*) from public.cost_evidence_links where evidence_file_id='c1f30000-0000-4000-8000-000000000501' and (project_cost_item_id is not null or project_subcontract_payment_id is not null)),2::bigint,'existing parent and subcontract-payment evidence targets remain valid');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select ok(not private.c1_can_select_evidence_object('c1-accounting-evidence','c1f30000-0000-4000-8000-000000000010/c1f30000-0000-4000-8000-000000000020/c1f30000-0000-4000-8000-000000000101/c1f30000-0000-4000-8000-000000000501'),'a draft detail link blocks mixed parent raw access');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((select count(*) from public.project_cost_item_detail_sources where project_cost_item_detail_id='c1f30000-0000-4000-8000-000000000402'),1::bigint,'cost.read can select a published detail source ID');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is((select count(*) from public.project_cost_item_detail_sources where project_cost_item_detail_id='c1f30000-0000-4000-8000-000000000401'),1::bigint,'cost.prepare can select a draft detail source ID');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000905","role":"authenticated"}',true);
select is((select count(*) from public.project_cost_item_detail_sources),0::bigint,'cost.manage alone cannot select raw detail source IDs');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1f30000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((select count(*) from public.project_cost_item_detail_sources where project_cost_item_detail_id='c1f30000-0000-4000-8000-000000000410'),0::bigint,'cross-company detail source rows are denied');
reset role;
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
insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,created_by) values('c1f30000-0000-4000-8000-000000000202','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000103','c1f30000-0000-4000-8000-000000000301','Draft parent',1,'1.0000','VND','unknown','draft','c1f30000-0000-4000-8000-000000000901');
insert into public.project_cost_item_details(id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,amount_text,publication_state,created_by) values('c1f30000-0000-4000-8000-000000000403','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000202',1,'line_item','Legacy prepared draft','1.0000','draft','c1f30000-0000-4000-8000-000000000901');
update public.project_cost_items set publication_state='published',publication_origin='command',published_by='c1f30000-0000-4000-8000-000000000901',published_at=now(),publication_request_id='c1f30000-0000-4000-8000-000000000718' where id='c1f30000-0000-4000-8000-000000000202';
select is((select publication_state from public.project_cost_item_details where id='c1f30000-0000-4000-8000-000000000403'),'published','legacy parent publish promotes draft snapshot children');
insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_at,created_by) values('c1f30000-0000-4000-8000-000000000203','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000104','c1f30000-0000-4000-8000-000000000301','Legacy parent',1,'1.0000','VND','unknown','published','legacy_backfill',now(),'c1f30000-0000-4000-8000-000000000901');
select set_config('taskovia.c1_cost_write.snapshot','1',true);
insert into public.project_cost_item_details(id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,amount_text,publication_state,created_by) values('c1f30000-0000-4000-8000-000000000404','c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000203',1,'line_item','Legacy correction replacement','1.0000','draft','c1f30000-0000-4000-8000-000000000901');
insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary) values('c1f30000-0000-4000-8000-000000000010','c1f30000-0000-4000-8000-000000000020','c1f30000-0000-4000-8000-000000000901','c1.project_cost_item.corrected','project_cost_item','c1f30000-0000-4000-8000-000000000203','c1f30000-0000-4000-8000-000000000719','{}');
select is((select publication_request_id from public.project_cost_item_details where id='c1f30000-0000-4000-8000-000000000404'),'c1f30000-0000-4000-8000-000000000719'::uuid,'legacy correction replacement receives current command request metadata');
reset role;
select is((select coalesce(sum(payment.paid_amount_text::numeric),0)::text from public.project_subcontract_payments payment where payment.project_subcontract_id='c1f30000-0000-4000-8000-000000000602' and payment.status='recorded'),'7.0000','canonical subcontract Actual excludes the legacy detail and voided payment');
select is((select coalesce(sum(payment.paid_amount_text::numeric),0)::text from public.project_subcontract_payments payment where payment.project_subcontract_id='c1f30000-0000-4000-8000-000000000602' and payment.status='recorded'),(select actual from c1f3_subcontract_actual_before),'ordinary detail, source, and evidence operations do not change payment-only Actual');

select * from finish();
rollback;
