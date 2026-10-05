-- PREPARED SOURCE ONLY. Requires a new explicit CloudDEV rehearsal authorization.
-- Run only against the reviewed migration chain, in ONE rollback transaction.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Existing pgTAP in extensions is a prerequisite; this fixture installs nothing.
do $prerequisite$
begin
 if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap' and n.nspname='extensions')
 then raise exception 'AZURE_FIXTURE_PGTAP_REQUIRED';end if;
end;$prerequisite$;
set local search_path=public,extensions;
select no_plan();
-- Abort rather than reuse, delete or modify ANY operational Azure resource.
do $guard$
begin
 if exists(select 1 from private.c1_cost_ocr_azure_resources) then raise exception 'AZURE_FIXTURE_RESOURCE_NOT_EMPTY';end if;
 if exists(select 1 from auth.users where id='c1f60000-0000-4000-8000-000000000901')
 or exists(select 1 from public.tenants where id='c1f60000-0000-4000-8000-000000000010')
 then raise exception 'AZURE_FIXTURE_ID_COLLISION';end if;
 -- Stop on unreviewed user triggers; sequence/audit impact cannot be assumed away.
 if exists(
  select 1 from pg_catalog.pg_trigger where not tgisinternal and tgenabled<>'D'
  and tgrelid in('auth.users'::regclass,'public.tenants'::regclass,'public.companies'::regclass,'public.projects'::regclass,'public.cost_evidence_files'::regclass,
   'private.c1_cost_ocr_azure_resources'::regclass,'private.c1_cost_ocr_azure_months'::regclass,'private.c1_cost_ocr_azure_jobs'::regclass)
  and not (
   (tgrelid='public.projects'::regclass and tgname in('a_c1_completed_project_guard','c1_workflow_capture_completion'))
   or (tgrelid='public.cost_evidence_files'::regclass and tgname in('a_c1_completed_project_guard','aa_c1_workflow_legacy_file_gate','c1_cost_evidence_files_immutable','c1_workflow_original_target_immutable'))
  )
 ) then raise exception 'AZURE_FIXTURE_TRIGGER_REVIEW_REQUIRED';end if;
end;$guard$;
insert into auth.users(id,email) values('c1f60000-0000-4000-8000-000000000901','c1f6-azure@taskovia.invalid');
insert into public.tenants(id,code,name) values('c1f60000-0000-4000-8000-000000000010','c1f6-azure','Synthetic Azure tenant');
insert into public.companies(id,tenant_id,code,name) values
('c1f60000-0000-4000-8000-000000000020','c1f60000-0000-4000-8000-000000000010','C1F6-A','Synthetic Azure A'),
('c1f60000-0000-4000-8000-000000000021','c1f60000-0000-4000-8000-000000000010','C1F6-B','Synthetic Azure B');
insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by,operational_state) values
('c1f60000-0000-4000-8000-000000000101','c1f60000-0000-4000-8000-000000000010','c1f60000-0000-4000-8000-000000000020','C1F6-A-P','Synthetic A project','manual','c1f60000-0000-4000-8000-000000000901','active'),
('c1f60000-0000-4000-8000-000000000102','c1f60000-0000-4000-8000-000000000010','c1f60000-0000-4000-8000-000000000021','C1F6-B-P','Synthetic B project','manual','c1f60000-0000-4000-8000-000000000901','active');
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,workflow_origin,workflow_target_kind,workflow_evidence_kind)
select f,'c1f60000-0000-4000-8000-000000000010'::uuid,c,p,
 'c1f60000-0000-4000-8000-000000000010/'||c||'/'||p||'/'||f,'synthetic.pdf','application/pdf',8,repeat('a',64),'application/pdf',8,repeat('a',64),'finalized',now()+interval '15 minutes','c1f60000-0000-4000-8000-000000000901'::uuid,'c1f60000-0000-4000-8000-000000000901'::uuid,now(),1,true,'request','quotation'
from (values
('c1f60000-0000-4000-8000-000000000501'::uuid,'c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid),
('c1f60000-0000-4000-8000-000000000502'::uuid,'c1f60000-0000-4000-8000-000000000021'::uuid,'c1f60000-0000-4000-8000-000000000102'::uuid)) v(f,c,p);
create temporary table azure_fixture(n integer primary key,binding jsonb,reservation jsonb);
insert into azure_fixture(n,binding,reservation)
select n,jsonb_build_object('actorId','c1f60000-0000-4000-8000-000000000901','tenantId',f.tenant_id,'companyId',f.company_id,'projectId',f.project_id,'fileId',f.id,'fileVersion',1,'sha256',f.verified_sha256,'requestId',null,'requestVersion',null),
 jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','configurationVersion','v1','model','prebuilt-invoice','month',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),'pages',2,'limit',500,'scope',jsonb_build_object('companyId',f.company_id,'projectId',f.project_id),'fileId',f.id,'sha256',f.verified_sha256,
 'key',encode(extensions.digest(convert_to('["taskovia-doc-intelligence-dev.cognitiveservices.azure.com","v1","'||f.company_id||'","'||f.project_id||'","'||f.id||'","'||f.verified_sha256||'","prebuilt-invoice"]','UTF8'),'sha256'),'hex'))
from (values(1,'c1f60000-0000-4000-8000-000000000501'::uuid),(2,'c1f60000-0000-4000-8000-000000000502'::uuid)) v(n,id) join public.cost_evidence_files f on f.id=v.id;
-- A third distinct configuration exercises submission/completion separately from uncertain job 1.
insert into azure_fixture select 3,binding,reservation||jsonb_build_object('configurationVersion','v2','key',encode(extensions.digest(convert_to('["taskovia-doc-intelligence-dev.cognitiveservices.azure.com","v2","'||(binding->>'companyId')||'","'||(binding->>'projectId')||'","'||(binding->>'fileId')||'","'||(binding->>'sha256')||'","prebuilt-invoice"]','UTF8'),'sha256'),'hex')) from azure_fixture where n=1;
create function pg_temp.azure_call(cmd text,fixture integer default 1,extra jsonb default '{}'::jsonb) returns jsonb
language sql volatile set search_path='' as $$
 select public.c1_cost_ocr_azure_f0_job(cmd,binding,
  (case when cmd='reserve' then reservation when cmd='acquire' then jsonb_build_object('resourceId',reservation->>'resourceId','kind','get')
   else jsonb_build_object('resourceId',reservation->>'resourceId','key',reservation->>'key') end)||extra)
 from pg_temp.azure_fixture where n=fixture;
$$;
revoke all on function pg_temp.azure_call(text,integer,jsonb) from public,anon,authenticated,service_role;
select is(pg_temp.azure_call('reserve')->>'blocked','quota','unknown resource blocks without assuming unused pages');
insert into private.c1_cost_ocr_azure_resources(resource_id) values('taskovia-doc-intelligence-dev.cognitiveservices.azure.com');
select is(pg_temp.azure_call('reserve')->>'blocked','quota','nonexclusive resource blocks');
update private.c1_cost_ocr_azure_resources set exclusive_controller=true;
select is(pg_temp.azure_call('reserve')->>'blocked','quota','unreconciled UTC month blocks');
insert into private.c1_cost_ocr_azure_months(resource_id,utc_month,external_pages,ceiling,reconciled_at,reconciliation_reference)
values('taskovia-doc-intelligence-dev.cognitiveservices.azure.com',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),1,3,clock_timestamp(),'Synthetic rollback-only reconciliation');
select is(pg_temp.azure_call('reserve')->'job'->>'state','reserved','all pages atomically reserved');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),2,'resource ledger reserves two pages');
select is(pg_temp.azure_call('reserve')->'job'->>'state','reserved','same key replays reservation');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),2,'replay never recharges pages');
select is(pg_temp.azure_call('reserve',2)->>'blocked','quota','second company shares resource quota');
-- Synthetic-only relocation tests a deferred first send; no operational row is reused.
insert into private.c1_cost_ocr_azure_months(resource_id,utc_month,external_pages,ceiling,reconciled_at,reconciliation_reference)
values('taskovia-doc-intelligence-dev.cognitiveservices.azure.com',to_char((clock_timestamp() at time zone 'UTC')-interval '1 month','YYYY-MM'),0,500,clock_timestamp(),'Synthetic prior-month rollback fixture');
update private.c1_cost_ocr_azure_jobs set utc_month=to_char((clock_timestamp() at time zone 'UTC')-interval '1 month','YYYY-MM') where job_key=(select reservation->>'key' from azure_fixture where n=1);
select is(pg_temp.azure_call('send')->>'ok','false','past-month reserved job cannot first send in an unreconciled later month');
update private.c1_cost_ocr_azure_jobs set utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM') where job_key=(select reservation->>'key' from azure_fixture where n=1);
select is(pg_temp.azure_call('send')->>'ok','true','CAS first sender wins');
select is(pg_temp.azure_call('send')->>'ok','false','second sender cannot resend');
select is(pg_temp.azure_call('uncertain')->>'ok','true','uncertain retains send reservation');
select is(pg_temp.azure_call('send')->>'ok','false','uncertain cannot resend');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),2,'uncertain pages never released');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('send',(select binding||'{"fileVersion":2}'::jsonb from pg_temp.azure_fixture where n=1),(select jsonb_build_object('key',reservation->>'key','resourceId',reservation->>'resourceId') from pg_temp.azure_fixture where n=1))$$,'P0001','AZURE_STORE_SCOPE_CHANGED','original revision freshly checked');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('send',(select binding from pg_temp.azure_fixture where n=2),(select jsonb_build_object('key',reservation->>'key','resourceId',reservation->>'resourceId') from pg_temp.azure_fixture where n=1))$$,'P0001','AZURE_STORE_SCOPE_CHANGED','leaked job key cannot cross company');
update private.c1_cost_ocr_azure_months set ceiling=5 where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
select is(pg_temp.azure_call('reserve',3)->'job'->>'state','reserved','distinct immutable configuration uses distinct job');
select is(pg_temp.azure_call('send',3)->>'ok','true','new job send CAS');
select throws_ok($$select pg_temp.azure_call('operation',3,'{"operationUrl":"https://evil.invalid/result","pollAfter":1}')$$,'P0001','AZURE_STORE_INPUT_INVALID','operation URL pinned');
select is(pg_temp.azure_call('operation',3,jsonb_build_object('operationUrl','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000001?api-version=2024-11-30','pollAfter',floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)))->>'ok','true','operation deadline persisted');
create temporary table azure_deadline as select poll_after from private.c1_cost_ocr_azure_jobs where configuration_version='v2';
select is(pg_temp.azure_call('operation',3,'{"operationUrl":"https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000001?api-version=2024-11-30","pollAfter":1}')->>'ok','true','same operation replay cannot shorten retry');
select is((select poll_after from private.c1_cost_ocr_azure_jobs where configuration_version='v2'),(select poll_after from azure_deadline),'long retry deadline remains unchanged');
select is(pg_temp.azure_call('operation',3,'{"operationUrl":"https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000002?api-version=2024-11-30","pollAfter":1}')->>'ok','false','operation immutable');
select is(pg_temp.azure_call('complete',3,'{"raw":{"status":"succeeded"},"result":{"status":"needs_review","reviewRequired":true,"fields":{},"warnings":[],"sourceLocations":[],"methodVersion":"azure-f0-v1"}}')->>'ok','true','review-only result stored privately');
select is(pg_temp.azure_call('complete',3,'{"raw":{"status":"succeeded"},"result":{"status":"needs_review","reviewRequired":true,"fields":{},"warnings":[],"sourceLocations":[],"methodVersion":"azure-f0-v1"}}')->>'ok','true','identical completion idempotent');
select is(pg_temp.azure_call('complete',3,'{"raw":{"status":"changed"},"result":{"status":"needs_review","reviewRequired":true,"fields":{},"warnings":[],"sourceLocations":[],"methodVersion":"azure-f0-v1"}}')->>'ok','false','raw completion immutable');
select is(pg_temp.azure_call('reserve',3)->'job'->>'state','complete','private cached result returned only through scoped RPC');
select ok(not (pg_temp.azure_call('reserve',3)->'job' ? 'raw'),'raw provider content not returned in replay');
create temporary table azure_lease as select pg_temp.azure_call('acquire')->'lease' as value;
select ok((select value->>'token' from azure_lease) is not null,'resource lease persisted');
select is(pg_temp.azure_call('acquire',2)->'lease','null'::jsonb,'other company cannot overlap an active resource lease');
update private.c1_cost_ocr_azure_resources set lease_issued_at=v.ts,lease_expires_at=v.ts+interval '20 seconds' from (select clock_timestamp()-interval '25 seconds' as ts) v;
select is(pg_temp.azure_call('acquire',2)->'lease','null'::jsonb,'expired lease never automatically regranted');
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=2),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','unused'))->>'ok','false','another actor/scope cannot release owner token');
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=1),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','unused'))->>'ok','true','known unused expired grant releases conservatively');
select is(pg_temp.azure_call('acquire')->'lease','null'::jsonb,'release imposes three-second DB cooldown');
update private.c1_cost_ocr_azure_resources set released_at=clock_timestamp()-interval '4 seconds',slots=array(select clock_timestamp()-interval '4 seconds' from generate_series(1,20));
select is(pg_temp.azure_call('acquire')->'lease','null'::jsonb,'twenty persistent rolling-minute grants block');
update private.c1_cost_ocr_azure_resources set slots=array[clock_timestamp()+interval '1 hour'];
select is(pg_temp.azure_call('acquire')->'lease','null'::jsonb,'future persisted clock grant fails closed');
update private.c1_cost_ocr_azure_resources set slots=array[]::timestamptz[],released_at=null;
update azure_lease set value=pg_temp.azure_call('acquire')->'lease';
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=1),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','uncertain'))->>'ok','true','unknown network outcome retains resource ownership');
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=1),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','settled'))->>'ok','false','uncertain grant cannot be guessed settled');
select is(pg_temp.azure_call('acquire',2)->'lease','null'::jsonb,'uncertain grant blocks all future runners');
select ok(not has_table_privilege('anon','private.c1_cost_ocr_azure_jobs','select') and not has_table_privilege('authenticated','private.c1_cost_ocr_azure_jobs','select') and not has_table_privilege('service_role','private.c1_cost_ocr_azure_jobs','select'),'private jobs have no direct client/server role table grant');
select ok(not has_function_privilege('anon','public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)','execute') and not has_function_privilege('authenticated','public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)','execute') and has_function_privilege('service_role','public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)','execute'),'only server role executes provider RPC');
set local role authenticated;
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('complete','{}','{}')$$,'42501','permission denied for function c1_cost_ocr_azure_f0_job','browser cannot inject completion');
reset role;
select is((select count(*)::integer from public.audit_events where tenant_id='c1f60000-0000-4000-8000-000000000010'),0,'fixture and provider port do not emit accounting audit events');
select * from finish();
rollback;
