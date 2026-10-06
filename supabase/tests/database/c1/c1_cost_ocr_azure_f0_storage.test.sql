-- SQL_UNEXECUTED: prepared source only; separate Cloud DEV approval is required.
-- Exact base bac0f137e6f50df2f947fc0d3817be367f7f6737; no migration/extension installation here.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
set local idle_in_transaction_session_timeout='120s';
set local search_path=public,extensions;
do $prerequisite$
begin
 if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap' and n.nspname='extensions')
 or pg_catalog.to_regprocedure('extensions.finish(boolean)') is null
 then raise exception 'AZURE_FIXTURE_PGTAP_REQUIRED';end if;
 if pg_catalog.to_regprocedure('private.c1_workflow_validate_pdf_coverage(jsonb,text,bigint,integer)') is null
 or pg_catalog.to_regprocedure('public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)') is null
 then raise exception 'AZURE_FIXTURE_PREREQUISITE_REQUIRED';end if;
 if clock_timestamp()+interval '120 seconds'>=((date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month') at time zone 'UTC')
 then raise exception 'AZURE_FIXTURE_MONTH_BOUNDARY';end if;
end;$prerequisite$;
-- Before approval, compare installed prerequisite/trigger function definitions to the report's pinned source.
-- Never reuse/delete an operational resource. Unknown triggers and persistent sequence defaults abort.
do $guard$
begin
 if exists(select 1 from pg_catalog.pg_event_trigger where evtenabled<>'D')
 then raise exception 'AZURE_FIXTURE_EVENT_TRIGGER_REVIEW_REQUIRED';end if;
 if pg_catalog.to_regclass('pg_temp.__tcache__') is not null
 or pg_catalog.to_regclass('pg_temp.__tcache___id_seq') is not null
 or pg_catalog.to_regclass('pg_temp.__tresults___numb_seq') is not null
 then raise exception 'AZURE_FIXTURE_FRESH_SESSION_REQUIRED';end if;
 if exists(select 1 from private.c1_cost_ocr_azure_resources) then raise exception 'AZURE_FIXTURE_RESOURCE_NOT_EMPTY';end if;
 if exists(select 1 from auth.users where id in('c1f60000-0000-4000-8000-000000000901'::uuid)) then raise exception 'AZURE_FIXTURE_ID_COLLISION';end if;
 if exists(select 1 from public.tenants where id in('c1f60000-0000-4000-8000-000000000010'::uuid)) then raise exception 'AZURE_FIXTURE_ID_COLLISION';end if;
 if exists(select 1 from public.companies where id in('c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000021'::uuid)) then raise exception 'AZURE_FIXTURE_ID_COLLISION';end if;
 if exists(select 1 from public.projects where id in('c1f60000-0000-4000-8000-000000000101'::uuid,'c1f60000-0000-4000-8000-000000000102'::uuid)) then raise exception 'AZURE_FIXTURE_ID_COLLISION';end if;
 if exists(select 1 from public.cost_evidence_files where id in('c1f60000-0000-4000-8000-000000000501'::uuid,'c1f60000-0000-4000-8000-000000000502'::uuid,'c1f60000-0000-4000-8000-000000000503'::uuid,'c1f60000-0000-4000-8000-000000000504'::uuid,'c1f60000-0000-4000-8000-000000000505'::uuid,'c1f60000-0000-4000-8000-000000000506'::uuid)) then raise exception 'AZURE_FIXTURE_ID_COLLISION';end if;
 if exists(select 1 from auth.users where email='c1f6-azure@taskovia.invalid')
 or exists(select 1 from public.tenants where code='c1f6-azure')
 then raise exception 'AZURE_FIXTURE_ID_COLLISION';end if;
 if exists(select 1 from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid in('auth.users'::regclass,'public.tenants'::regclass,'public.companies'::regclass,'public.projects'::regclass,'public.cost_evidence_files'::regclass,
   'private.c1_cost_ocr_azure_resources'::regclass,'private.c1_cost_ocr_azure_months'::regclass,'private.c1_cost_ocr_azure_jobs'::regclass)
  and (a.attidentity<>'' or coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'') ~ '(nextval|setval)'))
 then raise exception 'AZURE_FIXTURE_SEQUENCE_REVIEW_REQUIRED';end if;
 if exists(select 1 from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgenabled<>'D'
  and t.tgrelid in('auth.users'::regclass,'public.tenants'::regclass,'public.companies'::regclass,'public.projects'::regclass,'public.cost_evidence_files'::regclass,
   'private.c1_cost_ocr_azure_resources'::regclass,'private.c1_cost_ocr_azure_months'::regclass,'private.c1_cost_ocr_azure_jobs'::regclass)
  and not (
   (t.tgrelid='public.projects'::regclass and (
    (t.tgname='a_c1_completed_project_guard' and t.tgfoid='private.c1_guard_completed_project_write()'::regprocedure)
    or (t.tgname='c1_workflow_capture_completion' and t.tgfoid='private.c1_workflow_capture_completion()'::regprocedure)))
   or (t.tgrelid='public.cost_evidence_files'::regclass and (
    (t.tgname='a_c1_completed_project_guard' and t.tgfoid='private.c1_guard_completed_project_write()'::regprocedure)
    or (t.tgname='aa_c1_workflow_legacy_file_gate' and t.tgfoid='private.c1_workflow_guard_legacy_file()'::regprocedure)
    or (t.tgname='c1_cost_evidence_files_immutable' and t.tgfoid='private.c1_guard_evidence_history()'::regprocedure)
    or (t.tgname='c1_workflow_original_target_immutable' and t.tgfoid='private.c1_workflow_guard_original_target()'::regprocedure)))
  ))
 then raise exception 'AZURE_FIXTURE_TRIGGER_REVIEW_REQUIRED';end if;
end;$guard$;
select plan(124);
insert into auth.users(id,email) values('c1f60000-0000-4000-8000-000000000901','c1f6-azure@taskovia.invalid');
insert into public.tenants(id,code,name) values('c1f60000-0000-4000-8000-000000000010','c1f6-azure','Synthetic Azure tenant');
insert into public.companies(id,tenant_id,code,name) values
('c1f60000-0000-4000-8000-000000000020','c1f60000-0000-4000-8000-000000000010','C1F6-A','Synthetic Azure A'),('c1f60000-0000-4000-8000-000000000021','c1f60000-0000-4000-8000-000000000010','C1F6-B','Synthetic Azure B');
insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by,operational_state) values
('c1f60000-0000-4000-8000-000000000101','c1f60000-0000-4000-8000-000000000010','c1f60000-0000-4000-8000-000000000020','C1F6-A-P','Synthetic Azure project','manual','c1f60000-0000-4000-8000-000000000901','active'),('c1f60000-0000-4000-8000-000000000102','c1f60000-0000-4000-8000-000000000010','c1f60000-0000-4000-8000-000000000021','C1F6-B-P','Synthetic Azure project','manual','c1f60000-0000-4000-8000-000000000901','active');
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,workflow_origin,workflow_target_kind,workflow_evidence_kind)
select f,'c1f60000-0000-4000-8000-000000000010'::uuid,c,p,'c1f60000-0000-4000-8000-000000000010'||'/'||c||'/'||p||'/'||f,
 case when mime='image/png' then 'synthetic.png' else 'synthetic.pdf' end,mime,8,repeat('a',64),mime,8,repeat('a',64),'finalized',
 now()+interval '15 minutes','c1f60000-0000-4000-8000-000000000901'::uuid,'c1f60000-0000-4000-8000-000000000901'::uuid,now(),1,true,'request','quotation'
from (values
('c1f60000-0000-4000-8000-000000000501'::uuid,'c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'application/pdf'),
('c1f60000-0000-4000-8000-000000000502'::uuid,'c1f60000-0000-4000-8000-000000000021'::uuid,'c1f60000-0000-4000-8000-000000000102'::uuid,'application/pdf'),
('c1f60000-0000-4000-8000-000000000503'::uuid,'c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'application/pdf'),
('c1f60000-0000-4000-8000-000000000504'::uuid,'c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'application/pdf'),
('c1f60000-0000-4000-8000-000000000505'::uuid,'c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'image/png'),
('c1f60000-0000-4000-8000-000000000506'::uuid,'c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'application/pdf')) v(f,c,p,mime);
create temporary table azure_fixture(n integer primary key,binding jsonb not null,reservation jsonb not null,completion jsonb);
create function pg_temp.azure_key(config text,c uuid,p uuid,f uuid,sha text,model text,pdf_scope text default null) returns text
language sql immutable set search_path='' as $key$
 select encode(extensions.digest(convert_to('['||to_json('taskovia-doc-intelligence-dev.cognitiveservices.azure.com'::text)::text||','||to_json(config)::text||','||to_json(c::text)::text||','||to_json(p::text)::text||','||to_json(f::text)::text||','||to_json(sha)::text||','||to_json(model)::text
 ||case when pdf_scope is null then '' else ','||to_json('azure-pdf-scope-v1'::text)::text||','||to_json(pdf_scope)::text end||']','UTF8'),'sha256'),'hex');
$key$;
revoke all on function pg_temp.azure_key(text,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
insert into azure_fixture(n,binding,reservation,completion)
select n,jsonb_build_object('actorId','c1f60000-0000-4000-8000-000000000901','tenantId',f.tenant_id,'companyId',f.company_id,'projectId',f.project_id,'fileId',f.id,'fileVersion',1,'sha256',f.verified_sha256,'requestId',null,'requestVersion',null),
 jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','configurationVersion','v1','model','prebuilt-invoice','month',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),'pages',units,'limit',500,'scope',jsonb_build_object('companyId',f.company_id,'projectId',f.project_id),'fileId',f.id,'sha256',f.verified_sha256,
 'key',pg_temp.azure_key('v1',f.company_id,f.project_id,f.id,f.verified_sha256,'prebuilt-invoice',prefix))
 ||case when prefix is null then '{}'::jsonb else jsonb_build_object('pdfPageScope',prefix) end,completion
from (values
(1,'c1f60000-0000-4000-8000-000000000501'::uuid,2,'1-2'::text,null::jsonb),
(2,'c1f60000-0000-4000-8000-000000000502'::uuid,1,'1'::text,'{"raw":{"status":"succeeded","apiVersion":"2024-11-30","analyzeResult":{"modelId":"prebuilt-invoice","pages":[{"pageNumber":1}]}},"result":{"status":"needs_review","reviewRequired":true,"fields":{"amount":"123.45","currencyCode":"VND"},"warnings":["OCR_PDF_PARTIAL_DOCUMENT"],"sourceLocations":[],"methodVersion":"azure-f0-v1","azurePdfCoverage":{"kind":"azure-pdf-scope-v1","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceByteLength":8,"requestedPages":[1],"returnedPages":[1],"requestedPagesMatched":true,"sourcePageCount":{"kind":"trusted-metadata","count":1},"wholeDocumentComplete":false,"reviewRequired":true}}}'::jsonb),
(3,'c1f60000-0000-4000-8000-000000000503'::uuid,2,'1-2'::text,'{"raw":{"status":"succeeded","apiVersion":"2024-11-30","analyzeResult":{"modelId":"prebuilt-invoice","pages":[{"pageNumber":1},{"pageNumber":2}]}},"result":{"status":"needs_review","reviewRequired":true,"fields":{"amount":"123.45","currencyCode":"VND"},"warnings":["OCR_PDF_PARTIAL_DOCUMENT"],"sourceLocations":[],"methodVersion":"azure-f0-v1","azurePdfCoverage":{"kind":"azure-pdf-scope-v1","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceByteLength":8,"requestedPages":[1,2],"returnedPages":[1,2],"requestedPagesMatched":true,"sourcePageCount":{"kind":"user-declared","count":9},"wholeDocumentComplete":false,"reviewRequired":true}}}'::jsonb),
(4,'c1f60000-0000-4000-8000-000000000504'::uuid,1,'1'::text,'{"raw":{"status":"succeeded","apiVersion":"2024-11-30","analyzeResult":{"modelId":"prebuilt-invoice","pages":[]}},"result":{"status":"unavailable","reviewRequired":true,"fields":{},"warnings":["OCR_PDF_PARTIAL_DOCUMENT"],"sourceLocations":[],"methodVersion":"azure-f0-v1","azurePdfCoverage":{"kind":"azure-pdf-scope-v1","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceByteLength":8,"requestedPages":[1],"returnedPages":[],"requestedPagesMatched":false,"sourcePageCount":{"kind":"unknown"},"wholeDocumentComplete":false,"reviewRequired":true}}}'::jsonb),
(5,'c1f60000-0000-4000-8000-000000000505'::uuid,1,null::text,'{"raw":{"status":"succeeded","apiVersion":"2024-11-30","analyzeResult":{"modelId":"prebuilt-invoice","pages":[{"pageNumber":1}]}},"result":{"status":"needs_review","reviewRequired":true,"fields":{},"warnings":[],"sourceLocations":[],"methodVersion":"azure-f0-v1"}}'::jsonb),
(6,'c1f60000-0000-4000-8000-000000000506'::uuid,2,null::text,null::jsonb)) v(n,id,units,prefix,completion) join public.cost_evidence_files f on f.id=v.id;
-- Related variants are never a way around an unknown prior send.
insert into azure_fixture(n,binding,reservation)
select v.n,binding,reservation||jsonb_build_object('configurationVersion',v.config,'model',v.model,'pages',v.units,'pdfPageScope',v.prefix,
 'key',pg_temp.azure_key(v.config,(binding->>'companyId')::uuid,(binding->>'projectId')::uuid,(binding->>'fileId')::uuid,binding->>'sha256',v.model,v.prefix))
from azure_fixture cross join (values(7,6,'v1','prebuilt-invoice',1,'1'),(8,1,'v1','prebuilt-invoice',1,'1'),(9,1,'v2','prebuilt-invoice',2,'1-2'),(10,1,'v1','prebuilt-layout',2,'1-2'),(11,6,'v1','prebuilt-invoice',2,'1-2')) v(n,base,config,model,units,prefix)
where azure_fixture.n=v.base;
create function pg_temp.azure_call(cmd text,fixture integer default 1,extra jsonb default '{}'::jsonb) returns jsonb
language sql volatile set search_path='' as $call$
 select public.c1_cost_ocr_azure_f0_job(cmd,binding,
  (case when cmd='reserve' then reservation when cmd='acquire' then jsonb_build_object('resourceId',reservation->>'resourceId','kind','get')
   when cmd='complete' then jsonb_build_object('resourceId',reservation->>'resourceId','key',reservation->>'key')||completion
   else jsonb_build_object('resourceId',reservation->>'resourceId','key',reservation->>'key') end)||extra)
 from pg_temp.azure_fixture where n=fixture;
$call$;
revoke all on function pg_temp.azure_call(text,integer,jsonb) from public,anon,authenticated,service_role;
select is(pg_temp.azure_key('v1','c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'c1f60000-0000-4000-8000-000000000501'::uuid,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','prebuilt-invoice','1-2'),'5b1f73fe555c6a57d731ff7283f2e91b445cef7b8fe2159a7b0c0a8ff8c0505d','pdf-two-pages canonical key golden');
select is(pg_temp.azure_key('v1','c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'c1f60000-0000-4000-8000-000000000501'::uuid,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','prebuilt-invoice','1'),'4fbee77b241ed8bcf3130377746c7ed206f54c14db5aee44f33300fbbd5d8830','pdf-first-page canonical key golden');
select is(pg_temp.azure_key('v1','c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'c1f60000-0000-4000-8000-000000000505'::uuid,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','prebuilt-invoice',null),'f2d10486e448859dc20eee8e5c95727dfc8a65e3fd86e5fccfa8dfa453137228','image-legacy canonical key golden');
select is(pg_temp.azure_key(E'quote"back\\slash/ Tiếng Việt\n','c1f60000-0000-4000-8000-000000000020'::uuid,'c1f60000-0000-4000-8000-000000000101'::uuid,'c1f60000-0000-4000-8000-000000000501'::uuid,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','prebuilt-invoice','1-2'),'2787b7677020088bb2db34f88b031e606b66fdcc5cc855ddebef411cc40747cb','escaped-pdf-configuration canonical key golden');
select is(pg_temp.azure_call('reserve')->>'blocked','quota','unknown resource blocks');
insert into private.c1_cost_ocr_azure_resources(resource_id) values('taskovia-doc-intelligence-dev.cognitiveservices.azure.com');
select is(pg_temp.azure_call('reserve')->>'blocked','quota','nonexclusive resource blocks');
update private.c1_cost_ocr_azure_resources set exclusive_controller=true where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com';
select is(pg_temp.azure_call('reserve')->>'blocked','quota','unreconciled UTC month blocks');
insert into private.c1_cost_ocr_azure_months(resource_id,utc_month,external_pages,ceiling,reconciled_at,reconciliation_reference) values('taskovia-doc-intelligence-dev.cognitiveservices.azure.com',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),1,3,clock_timestamp(),'Synthetic rollback-only reconciliation');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('reserve',binding,reservation-'pdfPageScope') from pg_temp.azure_fixture where n=1$$,'P0001','AZURE_STORE_INPUT_INVALID','PDF scope missing');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('reserve',binding,reservation||'{"pdfPageScope":null}'::jsonb) from pg_temp.azure_fixture where n=1$$,'P0001','AZURE_STORE_INPUT_INVALID','PDF scope null');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('reserve',binding,reservation||'{"pdfPageScope":"2"}'::jsonb) from pg_temp.azure_fixture where n=1$$,'P0001','AZURE_STORE_INPUT_INVALID','PDF later-page scope');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('reserve',binding,reservation||'{"pdfPageScope":"1-2","pages":1}'::jsonb) from pg_temp.azure_fixture where n=1$$,'P0001','AZURE_STORE_INPUT_INVALID','PDF prefix units mismatch');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('reserve',binding,reservation||jsonb_build_object('key',pg_temp.azure_key('v1',(binding->>'companyId')::uuid,(binding->>'projectId')::uuid,(binding->>'fileId')::uuid,binding->>'sha256','prebuilt-invoice',null))) from pg_temp.azure_fixture where n=1$$,'P0001','AZURE_STORE_INPUT_INVALID','legacy PDF key rejected');
select throws_ok($$select pg_temp.azure_call('reserve',5,'{"pdfPageScope":"1"}')$$,'P0001','AZURE_STORE_INPUT_INVALID','image rejects a PDF scope');
select is(pg_temp.azure_call('reserve')->'job'->>'state','reserved','two-page PDF reserved');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),2,'exact two page units charged');
select is(pg_temp.azure_call('reserve')->'job'->>'state','reserved','reservation replay idempotent');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),2,'replay never recharges');
select is(pg_temp.azure_call('reserve',2)->>'blocked','quota','company B shares resource ceiling');
insert into private.c1_cost_ocr_azure_months(resource_id,utc_month,external_pages,reserved_pages,ceiling,reconciled_at,reconciliation_reference) values('taskovia-doc-intelligence-dev.cognitiveservices.azure.com',to_char((clock_timestamp() at time zone 'UTC')-interval '1 month','YYYY-MM'),0,2,25,clock_timestamp(),'Synthetic previous month');
update private.c1_cost_ocr_azure_months set reserved_pages=reserved_pages-2 where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
update private.c1_cost_ocr_azure_jobs set utc_month=to_char((clock_timestamp() at time zone 'UTC')-interval '1 month','YYYY-MM') where job_key=(select reservation->>'key' from azure_fixture where n=1);
select is(pg_temp.azure_call('reserve')->'job'->>'state','reserved','replay retains original prior-month job');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),0,'prior-month replay does not charge current month');
select is(pg_temp.azure_call('send')->>'ok','false','past-month reserved job cannot first send');
update private.c1_cost_ocr_azure_jobs set utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM') where job_key=(select reservation->>'key' from azure_fixture where n=1);
update private.c1_cost_ocr_azure_months set reserved_pages=reserved_pages+2 where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
update private.c1_cost_ocr_azure_months set reserved_pages=reserved_pages-2 where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char((clock_timestamp() at time zone 'UTC')-interval '1 month','YYYY-MM');
select is(pg_temp.azure_call('send')->>'ok','true','CAS first sender wins');
select is(pg_temp.azure_call('send')->>'ok','false','second sender cannot resend');
select is(pg_temp.azure_call('reserve',8)->>'blocked','busy','sending blocks a new prefix');
select is(pg_temp.azure_call('uncertain')->>'ok','true','unknown send becomes uncertain');
select is(pg_temp.azure_call('uncertain')->>'ok','true','uncertain state idempotent');
select is(pg_temp.azure_call('send')->>'ok','false','uncertain cannot resend');
select is(pg_temp.azure_call('reserve',8)->>'blocked','busy','uncertain blocks changed prefix');
select is(pg_temp.azure_call('reserve',9)->>'blocked','busy','uncertain blocks changed configuration');
select is(pg_temp.azure_call('reserve',10)->>'blocked','busy','uncertain blocks changed model');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),2,'blocked variants never charge');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('send',binding||'{"fileVersion":2}'::jsonb,jsonb_build_object('key',reservation->>'key','resourceId',reservation->>'resourceId')) from pg_temp.azure_fixture where n=1$$,'P0001','AZURE_STORE_SCOPE_CHANGED','original revision freshly checked');
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('send',(select binding from pg_temp.azure_fixture where n=2),(select jsonb_build_object('key',reservation->>'key','resourceId',reservation->>'resourceId') from pg_temp.azure_fixture where n=1))$$,'P0001','AZURE_STORE_SCOPE_CHANGED','leaked key cannot cross company');
update private.c1_cost_ocr_azure_months set ceiling=25 where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
select is(pg_temp.azure_call('reserve',2)->'job'->>'state','reserved','first-page PDF reserves independently');
select is(pg_temp.azure_call('send',2)->>'ok','true','first-page PDF first send claim');
select is(pg_temp.azure_call('operation',2,jsonb_build_object('operationUrl','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000002?api-version=2024-11-30','pollAfter',floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)))->>'ok','true','first-page PDF operation stored');
select is(pg_temp.azure_call('reserve',3)->'job'->>'state','reserved','independent two-page PDF reserves independently');
select is(pg_temp.azure_call('send',3)->>'ok','true','independent two-page PDF first send claim');
select is(pg_temp.azure_call('operation',3,jsonb_build_object('operationUrl','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000003?api-version=2024-11-30','pollAfter',floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)))->>'ok','true','independent two-page PDF operation stored');
select is(pg_temp.azure_call('reserve',4)->'job'->>'state','reserved','unavailable PDF reserves independently');
select is(pg_temp.azure_call('send',4)->>'ok','true','unavailable PDF first send claim');
select is(pg_temp.azure_call('operation',4,jsonb_build_object('operationUrl','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000004?api-version=2024-11-30','pollAfter',floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)))->>'ok','true','unavailable PDF operation stored');
select is(pg_temp.azure_call('reserve',5)->'job'->>'state','reserved','image legacy identity reserves independently');
select is(pg_temp.azure_call('send',5)->>'ok','true','image legacy identity first send claim');
select is(pg_temp.azure_call('operation',5,jsonb_build_object('operationUrl','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000005?api-version=2024-11-30','pollAfter',floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)))->>'ok','true','image legacy identity operation stored');
select throws_ok($$select pg_temp.azure_call('operation',3,'{"operationUrl":"https://evil.invalid/result","pollAfter":1}')$$,'P0001','AZURE_STORE_INPUT_INVALID','operation URL pinned');
create temporary table azure_deadline as select poll_after from private.c1_cost_ocr_azure_jobs where job_key=(select reservation->>'key' from azure_fixture where n=3);
select is(pg_temp.azure_call('operation',3,jsonb_build_object('operationUrl','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000003?api-version=2024-11-30','pollAfter',1))->>'ok','true','operation replay cannot shorten retry');
select is((select poll_after from private.c1_cost_ocr_azure_jobs where job_key=(select reservation->>'key' from azure_fixture where n=3)),(select poll_after from azure_deadline),'long retry deadline immutable');
select is(pg_temp.azure_call('operation',3,jsonb_build_object('operationUrl','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000004?api-version=2024-11-30','pollAfter',1))->>'ok','false','operation URL immutable');
select throws_ok($$select pg_temp.azure_call('complete',3,completion #- '{result,azurePdfCoverage}') from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','PDF completion requires coverage');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourceSha256}','"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"'::jsonb)) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','coverage hash bound');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourceByteLength}','9')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','coverage byte length bound');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,requestedPages}','[1]')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','coverage prefix bound to reservation');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,wholeDocumentComplete}','true')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','whole-document claim rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,reviewRequired}','false')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','coverage always requires review');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,unexpected}','true',true)) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','coverage extra property rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,returnedPages}','[1]')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','missing returned page cannot claim match');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,returnedPages}','[1,1]')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','duplicate returned page rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,returnedPages}','[1,2,3]')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','extra returned page rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,returnedPages}','[0,2]')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','out-of-range returned page rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,returnedPages}','[1.5,2]')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','noninteger returned page rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,requestedPagesMatched}','false')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','dishonest unmatched flag rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourcePageCount}','{"kind":"unknown","count":2}')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','unknown provenance has no count');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourcePageCount}','{"kind":"trusted-metadata","count":1}')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','known count cannot be below prefix');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourcePageCount}','{"kind":"user-declared","count":0}')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','zero source count rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourcePageCount}','{"kind":"user-declared","count":1.5}')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','fractional source count rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourcePageCount}','{"kind":"user-declared","count":9007199254740992}')) from pg_temp.azure_fixture where n=3$$,'P0001','INPUT_INVALID','unsafe source count rejected');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,methodVersion}','"offline-unavailable-v1"')) from pg_temp.azure_fixture where n=3$$,'P0001','AZURE_STORE_INPUT_INVALID','PDF completion must use Azure method');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,status}','"ready"')) from pg_temp.azure_fixture where n=3$$,'P0001','AZURE_STORE_INPUT_INVALID','PDF completion cannot be ready');
select throws_ok($$select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,reviewRequired}','false')) from pg_temp.azure_fixture where n=3$$,'P0001','AZURE_STORE_INPUT_INVALID','result always requires review');
select throws_ok($$select pg_temp.azure_call('complete',3,'{"raw":{"status":"succeeded","apiVersion":"2024-11-30","analyzeResult":{"modelId":"prebuilt-invoice","pages":[{"pageNumber":1},{"pageNumber":2}]}},"result":{"status":"needs_review","reviewRequired":true,"fields":{"amount":"123.45","currencyCode":"VND"},"warnings":["OCR_PDF_PARTIAL_DOCUMENT"],"sourceLocations":[],"methodVersion":"azure-f0-v1","azurePdfCoverage":{"kind":"azure-pdf-scope-v1","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceByteLength":8,"requestedPages":[1,2],"returnedPages":[1,2],"requestedPagesMatched":true,"sourcePageCount":{"kind":"user-declared","count":9},"wholeDocumentComplete":true,"reviewRequired":true}}}'::jsonb)$$,'P0001','INPUT_INVALID','literal dishonest whole-document result rejected');
select throws_ok($$select pg_temp.azure_call('complete',4,jsonb_set(completion,'{result,fields}','{"partyHint":"synthetic hint"}')) from pg_temp.azure_fixture where n=4$$,'P0001','INPUT_INVALID','unmatched PDF has no financial hints');
select throws_ok($$select pg_temp.azure_call('complete',4,jsonb_set(completion,'{result,providerLocations}','[{"field":"amount","pageNumber":1,"polygon":[0,0,1,0,1,1,0,1]}]',true)) from pg_temp.azure_fixture where n=4$$,'P0001','INPUT_INVALID','unmatched PDF has no provider locations');
select throws_ok($$select pg_temp.azure_call('complete',5,(select completion from pg_temp.azure_fixture where n=3))$$,'P0001','AZURE_STORE_INPUT_INVALID','image result rejects PDF coverage');
select lives_ok($$select private.c1_workflow_validate_pdf_coverage(jsonb_set(completion->'result','{azurePdfCoverage,returnedPages}','[2,1]'),binding->>'sha256',8,2) from pg_temp.azure_fixture where n=3$$,'unique reversed returned prefix accepted');
select is(pg_temp.azure_call('complete',2)->>'ok','true','matched first-page completion accepted');
select is(pg_temp.azure_call('complete',2)->>'ok','true','matched first-page completion idempotent');
select is(pg_temp.azure_call('reserve',2)->'job'->>'state','complete','matched first-page cached result');
select is(pg_temp.azure_call('reserve',2)->'job'->'result'->'azurePdfCoverage',(select completion->'result'->'azurePdfCoverage' from azure_fixture where n=2),'matched first-page cached coverage preserved');
select is(pg_temp.azure_call('reserve',2)->'job'->'result'->'azurePdfCoverage'->>'wholeDocumentComplete','false','matched first-page source coverage remains partial');
select is(pg_temp.azure_call('complete',3)->>'ok','true','matched two-page completion accepted');
select is(pg_temp.azure_call('complete',3)->>'ok','true','matched two-page completion idempotent');
select is(pg_temp.azure_call('reserve',3)->'job'->>'state','complete','matched two-page cached result');
select is(pg_temp.azure_call('reserve',3)->'job'->'result'->'azurePdfCoverage',(select completion->'result'->'azurePdfCoverage' from azure_fixture where n=3),'matched two-page cached coverage preserved');
select is(pg_temp.azure_call('reserve',3)->'job'->'result'->'azurePdfCoverage'->>'wholeDocumentComplete','false','matched two-page source coverage remains partial');
select is(pg_temp.azure_call('complete',4)->>'ok','true','honest unavailable completion accepted');
select is(pg_temp.azure_call('complete',4)->>'ok','true','honest unavailable completion idempotent');
select is(pg_temp.azure_call('reserve',4)->'job'->>'state','complete','honest unavailable cached result');
select is(pg_temp.azure_call('reserve',4)->'job'->'result'->'azurePdfCoverage',(select completion->'result'->'azurePdfCoverage' from azure_fixture where n=4),'honest unavailable cached coverage preserved');
select is(pg_temp.azure_call('reserve',4)->'job'->'result'->'azurePdfCoverage'->>'wholeDocumentComplete','false','honest unavailable source coverage remains partial');
select is(pg_temp.azure_call('complete',5)->>'ok','true','image completion accepted');
select is(pg_temp.azure_call('complete',5)->>'ok','true','image completion idempotent');
select is(pg_temp.azure_call('reserve',5)->'job'->>'state','complete','image cached result');
select is(pg_temp.azure_call('complete',3,'{"raw":{"status":"changed"}}')->>'ok','false','raw completion immutable');
select is((select pg_temp.azure_call('complete',3,jsonb_set(completion,'{result,azurePdfCoverage,sourcePageCount,count}','10'))->>'ok' from azure_fixture where n=3),'false','valid changed coverage immutable');
select ok(not (pg_temp.azure_call('reserve',3)->'job' ? 'raw'),'raw evidence absent from cached replay');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),7,'completed replay retains exact charged units');
insert into private.c1_cost_ocr_azure_jobs(job_key,resource_id,utc_month,tenant_id,company_id,project_id,file_id,file_version,sha256,model,configuration_version,pages,created_by)
select reservation->>'key',reservation->>'resourceId',reservation->>'month',(binding->>'tenantId')::uuid,(binding->>'companyId')::uuid,(binding->>'projectId')::uuid,(binding->>'fileId')::uuid,1,binding->>'sha256','prebuilt-invoice','v1',2,(binding->>'actorId')::uuid from azure_fixture where n=6;
update private.c1_cost_ocr_azure_months set reserved_pages=reserved_pages+2 where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM');
select is(pg_temp.azure_call('send',6)->>'ok','false','legacy reserved PDF cannot claim send');
select is(pg_temp.azure_call('reserve',7)->'job'->>'state','reserved','new scoped job can reserve beside unsent legacy');
update private.c1_cost_ocr_azure_jobs set state='sending',operation_url=null,poll_after=null,raw_result=null,result=null where job_key=(select reservation->>'key' from azure_fixture where n=6);
select is(pg_temp.azure_call('reserve',11)->>'blocked','busy','legacy sending blocks new prefix');
select is(pg_temp.azure_call('send',7)->>'ok','false','legacy sending blocks scoped claim');
update private.c1_cost_ocr_azure_jobs set state='submitted',operation_url='https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000006?api-version=2024-11-30',poll_after=clock_timestamp()+interval '1 hour',raw_result=null,result=null where job_key=(select reservation->>'key' from azure_fixture where n=6);
select is(pg_temp.azure_call('reserve',11)->>'blocked','busy','legacy submitted blocks new prefix');
select is(pg_temp.azure_call('send',7)->>'ok','false','legacy submitted blocks scoped claim');
update private.c1_cost_ocr_azure_jobs set state='uncertain',operation_url=null,poll_after=null,raw_result=null,result=null where job_key=(select reservation->>'key' from azure_fixture where n=6);
select is(pg_temp.azure_call('reserve',11)->>'blocked','busy','legacy uncertain blocks new prefix');
select is(pg_temp.azure_call('send',7)->>'ok','false','legacy uncertain blocks scoped claim');
update private.c1_cost_ocr_azure_jobs set state='complete',operation_url='https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/c1f60000-0000-4000-8000-000000000006?api-version=2024-11-30',poll_after=clock_timestamp()+interval '1 hour',raw_result='{"status":"succeeded"}'::jsonb,result='{"status":"needs_review","reviewRequired":true,"fields":{},"warnings":[],"sourceLocations":[],"methodVersion":"azure-f0-v1"}'::jsonb where job_key=(select reservation->>'key' from azure_fixture where n=6);
select is(pg_temp.azure_call('reserve',11)->>'blocked','busy','legacy completed PDF blocks new prefix');
select is(pg_temp.azure_call('send',7)->>'ok','false','legacy completed PDF blocks scoped claim');
select is((select reserved_pages from private.c1_cost_ocr_azure_months where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com' and utc_month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')),10,'legacy and current reservations remain charged');
select is((select count(*)::integer from private.c1_cost_ocr_azure_jobs),7,'seven bounded synthetic jobs only');
create temporary table azure_lease as select pg_temp.azure_call('acquire')->'lease' as value;
select ok((select value->>'token' from azure_lease) is not null,'resource lease persisted');
select is(pg_temp.azure_call('acquire',2)->'lease','null'::jsonb,'company B cannot overlap resource lease');
update private.c1_cost_ocr_azure_resources set lease_issued_at=v.ts,lease_expires_at=v.ts+interval '20 seconds' from (select clock_timestamp()-interval '25 seconds' as ts) v where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com';
select is(pg_temp.azure_call('acquire',2)->'lease','null'::jsonb,'expired lease never auto regranted');
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=2),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','unused'))->>'ok','false','other binding cannot release owner token');
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=1),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','unused'))->>'ok','true','known unused expired lease releases');
select is(pg_temp.azure_call('acquire')->'lease','null'::jsonb,'release imposes three-second cooldown');
update private.c1_cost_ocr_azure_resources set released_at=clock_timestamp()-interval '4 seconds',slots=array(select clock_timestamp()-interval '4 seconds' from generate_series(1,20)) where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com';
select is(pg_temp.azure_call('acquire')->'lease','null'::jsonb,'twenty rolling-minute grants block');
update private.c1_cost_ocr_azure_resources set slots=array[clock_timestamp()+interval '1 hour'] where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com';
select is(pg_temp.azure_call('acquire')->'lease','null'::jsonb,'future clock grant fails closed');
update private.c1_cost_ocr_azure_resources set slots=array[]::timestamptz[],released_at=null where resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com';
update azure_lease set value=pg_temp.azure_call('acquire')->'lease';
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=1),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','uncertain'))->>'ok','true','unknown dispatch retains resource ownership');
select is(public.c1_cost_ocr_azure_f0_job('release',(select binding from azure_fixture where n=1),jsonb_build_object('resourceId','taskovia-doc-intelligence-dev.cognitiveservices.azure.com','token',(select value->>'token' from azure_lease),'outcome','settled'))->>'ok','false','uncertain lease cannot be guessed settled');
select is(pg_temp.azure_call('acquire',2)->'lease','null'::jsonb,'uncertain lease blocks future runners');
select ok(not has_table_privilege('anon','private.c1_cost_ocr_azure_jobs','select') and not has_table_privilege('authenticated','private.c1_cost_ocr_azure_jobs','select') and not has_table_privilege('service_role','private.c1_cost_ocr_azure_jobs','select'),'private jobs have no direct role grant');
select ok(not has_function_privilege('anon','public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)','execute') and not has_function_privilege('authenticated','public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)','execute') and has_function_privilege('service_role','public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)','execute'),'only service role executes provider RPC');
set local role authenticated;
select throws_ok($$select public.c1_cost_ocr_azure_f0_job('complete','{}','{}')$$,'42501','permission denied for function c1_cost_ocr_azure_f0_job','browser cannot inject completion');
reset role;
select is((select count(*)::integer from public.audit_events where tenant_id='c1f60000-0000-4000-8000-000000000010'),0,'fixture emits no accounting audit rows');
select * from finish(true);
rollback;
