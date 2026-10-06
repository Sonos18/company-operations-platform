set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,32);
-- UNAPPLIED. No resource, usage, credentials or operational data are seeded.
create table private.c1_cost_ocr_azure_resources(
 resource_id text primary key check(resource_id='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'),
 exclusive_controller boolean not null default false,
 slots timestamptz[] not null default array[]::timestamptz[],
 lease_token uuid,lease_kind text,lease_binding jsonb,lease_issued_at timestamptz,lease_expires_at timestamptz,
 lease_uncertain boolean not null default false,released_at timestamptz,
 check(cardinality(slots)<=20),
 check((lease_token is null and lease_kind is null and lease_binding is null and lease_issued_at is null and lease_expires_at is null and not lease_uncertain)
  or (lease_token is not null and lease_kind is not null and lease_kind in('post','get') and lease_binding is not null and jsonb_typeof(lease_binding)='object' and lease_issued_at is not null and lease_expires_at is not null and lease_expires_at=lease_issued_at+interval '20 seconds'))
);
create table private.c1_cost_ocr_azure_months(
 resource_id text not null references private.c1_cost_ocr_azure_resources(resource_id),
 utc_month text not null check(utc_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 external_pages integer not null check(external_pages>=0),
 reserved_pages integer not null default 0 check(reserved_pages>=0),
 ceiling integer not null check(ceiling between 1 and 500),
 reconciled_at timestamptz not null,
 reconciliation_reference text not null check(length(reconciliation_reference) between 1 and 200),
 primary key(resource_id,utc_month)
);
create table private.c1_cost_ocr_azure_jobs(
 job_key text primary key check(job_key ~ '^[0-9a-f]{64}$'),
 resource_id text not null,
 utc_month text not null,
 tenant_id uuid not null,company_id uuid not null,project_id uuid not null,file_id uuid not null,
 file_version integer not null check(file_version>0),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 model text not null check(model in('prebuilt-invoice','prebuilt-layout')),
 configuration_version text not null check(length(configuration_version) between 1 and 100),
 pages integer not null check(pages between 1 and 2),
 state text not null default 'reserved' check(state in('reserved','sending','submitted','uncertain','complete')),
 created_by uuid not null,request_id uuid,request_version integer,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 operation_url text,poll_after timestamptz,raw_result jsonb,result jsonb,
 foreign key(resource_id,utc_month) references private.c1_cost_ocr_azure_months(resource_id,utc_month),
 foreign key(file_id,tenant_id,company_id,project_id) references public.cost_evidence_files(id,tenant_id,company_id,project_id),
 check((request_id is null)=(request_version is null)),
 check(request_version is null or request_version>=0),
 check((state in('submitted','complete') and operation_url is not null and poll_after is not null) or (state not in('submitted','complete') and operation_url is null and poll_after is null)),
 check((state='complete' and result is not null and raw_result is not null) or (state<>'complete' and result is null and raw_result is null)),
 check(raw_result is null or octet_length(raw_result::text)<=4000000),
 check(result is null or octet_length(result::text)<=300000)
);
create index c1_cost_ocr_azure_jobs_original on private.c1_cost_ocr_azure_jobs(tenant_id,company_id,project_id,file_id);
alter table private.c1_cost_ocr_azure_resources enable row level security;
alter table private.c1_cost_ocr_azure_months enable row level security;
alter table private.c1_cost_ocr_azure_jobs enable row level security;
revoke all on private.c1_cost_ocr_azure_resources,private.c1_cost_ocr_azure_months,private.c1_cost_ocr_azure_jobs from public,anon,authenticated,service_role;

-- Narrow RPC only: browser roles cannot call this function or access the private tables.
-- User-JWT fresh authorization is REQUIRED in the request-bound server wrapper; service role is not an actor.
create function public.c1_cost_ocr_azure_f0_job(p_command text,p_binding jsonb,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 t uuid;c uuid;p uuid;fid uuid;actor uuid;rid uuid;fv integer;rv integer;sha text;
 resource text;key text;expected_key text;month text;model text;config text;pages integer;budget integer;source_mime text;source_size bigint;pdf_scope text;
 resource_row private.c1_cost_ocr_azure_resources%rowtype;
 quota private.c1_cost_ocr_azure_months%rowtype;
 job private.c1_cost_ocr_azure_jobs%rowtype;
 ts timestamptz;deadline timestamptz;url text;recent timestamptz[];raw jsonb;v_result jsonb;token uuid;dispatch_kind text;dispatch_outcome text;
begin
 if p_command is null or p_command not in('reserve','send','acquire','release','operation','uncertain','complete')
 then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
 perform private.c1_workflow_require_keys(p_binding,array['actorId','tenantId','companyId','projectId','fileId','fileVersion','sha256','requestId','requestVersion'],array['actorId','tenantId','companyId','projectId','fileId','fileVersion','sha256','requestId','requestVersion']);
 begin
  t:=(p_binding->>'tenantId')::uuid;c:=(p_binding->>'companyId')::uuid;p:=(p_binding->>'projectId')::uuid;
  fid:=(p_binding->>'fileId')::uuid;actor:=(p_binding->>'actorId')::uuid;fv:=(p_binding->>'fileVersion')::integer;
  rid:=(p_binding->>'requestId')::uuid;rv:=(p_binding->>'requestVersion')::integer;sha:=p_binding->>'sha256';
 exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';
 end;
 if t is null or c is null or p is null or fid is null or actor is null or fv is null or fv<1 or sha is null or sha !~ '^[0-9a-f]{64}$'
 or (rid is null)<>(rv is null) or rv<0 then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
 resource:=p_payload->>'resourceId';
 if resource is distinct from 'taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
 then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
 -- One resource lock serializes every quota/job/rate transition across ALL companies/workers.
 select * into resource_row from private.c1_cost_ocr_azure_resources where resource_id=resource for update;
 if not found or not resource_row.exclusive_controller then
  if p_command='reserve' then return '{"blocked":"quota"}'::jsonb;end if;
  if p_command='acquire' then return '{"lease":null}'::jsonb;end if;
  return '{"ok":false}'::jsonb;
 end if;
 select f.verified_mime_type,f.verified_size_bytes into source_mime,source_size from public.cost_evidence_files f where f.id=fid and f.tenant_id=t and f.company_id=c and f.project_id=p
 and f.status='finalized' and f.version=fv and f.verified_sha256=sha and f.verified_size_bytes between 1 and 4000000
 and f.verified_mime_type in('application/pdf','image/png','image/jpeg') for share;
 if not found then raise exception using errcode='P0001',message='AZURE_STORE_SCOPE_CHANGED';end if;
 if rid is not null then
  perform 1 from public.cost_workflow_requests r where r.id=rid and r.tenant_id=t and r.company_id=c and r.project_id=p
  and r.kind='installment' and r.version=rv and r.state in('working','returned') for share;
  if not found then raise exception using errcode='P0001',message='AZURE_STORE_SCOPE_CHANGED';end if;
 end if;
 ts:=clock_timestamp();
 if p_command='acquire' then
  perform private.c1_workflow_require_keys(p_payload,array['resourceId','kind'],array['resourceId','kind']);
  dispatch_kind:=p_payload->>'kind';
  if dispatch_kind is null or dispatch_kind not in('post','get') then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  -- Do not issue a first-POST lease whose fixed TTL could straddle DB UTC-month rollover.
  if dispatch_kind='post' and ts+interval '20 seconds'>=((date_trunc('month',ts at time zone 'UTC')+interval '1 month') at time zone 'UTC')
  then return '{"lease":null}'::jsonb;end if;
  -- NEVER regrant on expiry: an old worker may be paused or delivery ambiguous.
  if resource_row.lease_token is not null then return '{"lease":null}'::jsonb;end if;
  select coalesce(array_agg(s order by s),array[]::timestamptz[]) into recent from unnest(resource_row.slots) s where s>ts-interval '60 seconds';
  if cardinality(recent)>=20 or (cardinality(recent)>0 and recent[cardinality(recent)]>ts-interval '3 seconds')
  or resource_row.released_at>ts-interval '3 seconds' then return '{"lease":null}'::jsonb;end if;
  token:=gen_random_uuid();
  update private.c1_cost_ocr_azure_resources set slots=array_append(recent,ts),lease_token=token,lease_kind=dispatch_kind,lease_binding=p_binding,
   lease_issued_at=ts,lease_expires_at=ts+interval '20 seconds',lease_uncertain=false where resource_id=resource;
  return jsonb_build_object('lease',jsonb_build_object('token',token,'resourceId',resource,'kind',dispatch_kind,'issuedAt',floor(extract(epoch from ts)*1000),'expiresAt',floor(extract(epoch from ts+interval '20 seconds')*1000)));
 elsif p_command='release' then
  perform private.c1_workflow_require_keys(p_payload,array['resourceId','token','outcome'],array['resourceId','token','outcome']);
  begin token:=(p_payload->>'token')::uuid;
  exception when invalid_text_representation then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end;
  dispatch_outcome:=p_payload->>'outcome';
  if token is null or dispatch_outcome is null or dispatch_outcome not in('settled','unused','uncertain') then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  if resource_row.lease_token is distinct from token or resource_row.lease_binding is distinct from p_binding then return '{"ok":false}'::jsonb;end if;
  if dispatch_outcome='uncertain' then
   update private.c1_cost_ocr_azure_resources set lease_uncertain=true where resource_id=resource;
   return '{"ok":true}'::jsonb;
  end if;
  -- A timeout/unknown outcome cannot later be guessed unused/settled or auto-released.
  if resource_row.lease_uncertain then return '{"ok":false}'::jsonb;end if;
  update private.c1_cost_ocr_azure_resources set lease_token=null,lease_kind=null,lease_binding=null,lease_issued_at=null,lease_expires_at=null,lease_uncertain=false,released_at=ts where resource_id=resource;
  return '{"ok":true}'::jsonb;
 end if;
 key:=p_payload->>'key';
 if key is null or key !~ '^[0-9a-f]{64}$' then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
 select * into job from private.c1_cost_ocr_azure_jobs where job_key=key for update;
 if found and (job.resource_id<>resource or job.tenant_id<>t or job.company_id<>c or job.project_id<>p or job.file_id<>fid or job.file_version<>fv or job.sha256<>sha)
 then raise exception using errcode='P0001',message='AZURE_STORE_SCOPE_CHANGED';end if;
 if p_command='reserve' then
  perform private.c1_workflow_require_keys(p_payload,array['key','resourceId','month','pages','limit','scope','fileId','sha256','model','configurationVersion'],array['key','resourceId','month','pages','limit','scope','fileId','sha256','model','configurationVersion','pdfPageScope']);
  model:=p_payload->>'model';config:=p_payload->>'configurationVersion';month:=p_payload->>'month';
  begin pages:=(p_payload->>'pages')::integer;budget:=(p_payload->>'limit')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end;
  if model is null or model not in('prebuilt-invoice','prebuilt-layout') or config is null or length(config) not between 1 and 100
  or month is null or month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or pages is null or pages not between 1 and 2 or budget is null or budget not between 1 and 500
  or p_payload->>'fileId' is distinct from fid::text or p_payload->>'sha256' is distinct from sha
  or p_payload->'scope' is distinct from jsonb_build_object('companyId',c,'projectId',p)
  then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  pdf_scope:=p_payload->>'pdfPageScope';
  if source_mime='application/pdf' then
   if pdf_scope is null or pdf_scope not in('1','1-2') or (pdf_scope='1' and pages<>1) or (pdf_scope='1-2' and pages<>2)
   then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  elsif p_payload ? 'pdfPageScope' then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';
  end if;
  -- Match JSON.stringify's compact string array, including escaped configuration strings.
  expected_key:=encode(extensions.digest(convert_to('['||to_json(resource)::text||','||to_json(config)::text||','||to_json(c::text)::text||','||to_json(p::text)::text||','||to_json(fid::text)::text||','||to_json(sha)::text||','||to_json(model)::text||case when source_mime='application/pdf' then ','||to_json('azure-pdf-scope-v1'::text)::text||','||to_json(pdf_scope)::text else '' end||']','UTF8'),'sha256'),'hex');
  if key<>expected_key then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  if job.job_key is not null then
   if job.model<>model or job.configuration_version<>config or job.pages<>pages then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
   -- Replay retains original month reservation; never recharges at UTC rollover.
  else
   -- Same immutable original: a new prefix/config/model must not bypass an
   -- in-flight or uncertain send, or silently replace a legacy completed PDF.
   if exists(select 1 from private.c1_cost_ocr_azure_jobs other_job where other_job.resource_id=resource
    and other_job.tenant_id=t and other_job.company_id=c and other_job.project_id=p and other_job.file_id=fid and other_job.sha256=sha
    and (other_job.state in('sending','submitted','uncertain')
     or (source_mime='application/pdf' and other_job.state='complete' and other_job.result->'azurePdfCoverage' is null)))
   then return '{"blocked":"busy"}'::jsonb;end if;
   if month<>to_char(ts at time zone 'UTC','YYYY-MM') then return '{"blocked":"quota"}'::jsonb;end if;
   select * into quota from private.c1_cost_ocr_azure_months where resource_id=resource and utc_month=month for update;
   if not found or quota.reconciled_at>ts or quota.external_pages::bigint+quota.reserved_pages+pages>least(budget,quota.ceiling)
   then return '{"blocked":"quota"}'::jsonb;end if;
   update private.c1_cost_ocr_azure_months set reserved_pages=reserved_pages+pages where resource_id=resource and utc_month=month;
   insert into private.c1_cost_ocr_azure_jobs(job_key,resource_id,utc_month,tenant_id,company_id,project_id,file_id,file_version,sha256,model,configuration_version,pages,created_by,request_id,request_version)
   values(key,resource,month,t,c,p,fid,fv,sha,model,config,pages,actor,rid,rv) returning * into job;
  end if;
  return jsonb_build_object('job',jsonb_strip_nulls(jsonb_build_object('key',job.job_key,'state',job.state,'operationUrl',job.operation_url,'pollAfter',floor(extract(epoch from job.poll_after)*1000),'result',job.result)));
 end if;
 if job.job_key is null then return '{"ok":false}'::jsonb;end if;
 if p_command in('send','uncertain') then
  perform private.c1_workflow_require_keys(p_payload,array['key','resourceId'],array['key','resourceId']);
  if p_command='send' then
   -- A deferred first POST cannot spend a past-month reservation in a new month.
   if job.state<>'reserved' or job.utc_month<>to_char(ts at time zone 'UTC','YYYY-MM') then return '{"ok":false}'::jsonb;end if;
   if exists(select 1 from private.c1_cost_ocr_azure_jobs other_job where other_job.resource_id=resource
    and other_job.tenant_id=t and other_job.company_id=c and other_job.project_id=p and other_job.file_id=fid and other_job.sha256=sha
    and other_job.job_key<>job.job_key and (other_job.state in('sending','submitted','uncertain')
     or (source_mime='application/pdf' and other_job.state='complete' and other_job.result->'azurePdfCoverage' is null)))
   then return '{"ok":false}'::jsonb;end if;
   if source_mime='application/pdf' then
    -- A paused legacy worker cannot claim a PDF job lacking explicit prefix identity.
    expected_key:=encode(extensions.digest(convert_to('['||to_json(resource)::text||','||to_json(job.configuration_version)::text||','||to_json(c::text)::text||','||to_json(p::text)::text||','||to_json(fid::text)::text||','||to_json(sha)::text||','||to_json(job.model)::text||','||to_json('azure-pdf-scope-v1'::text)::text||','||to_json((case job.pages when 1 then '1' when 2 then '1-2' end)::text)::text||']','UTF8'),'sha256'),'hex');
    if job.job_key<>expected_key then return '{"ok":false}'::jsonb;end if;
   end if;
   update private.c1_cost_ocr_azure_jobs set state='sending',updated_at=ts where job_key=key;
  else
   if job.state='uncertain' then return '{"ok":true}'::jsonb;end if;
   if job.state<>'sending' then return '{"ok":false}'::jsonb;end if;
   update private.c1_cost_ocr_azure_jobs set state='uncertain',updated_at=ts where job_key=key;
  end if;
 elsif p_command='operation' then
  perform private.c1_workflow_require_keys(p_payload,array['key','resourceId','operationUrl','pollAfter'],array['key','resourceId','operationUrl','pollAfter']);
  url:=p_payload->>'operationUrl';
  if url is null or url !~ ('^https://taskovia-doc-intelligence-dev[.]cognitiveservices[.]azure[.]com/documentintelligence/documentModels/'||job.model||'/analyzeResults/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[?]api-version=2024-11-30$')
  or jsonb_typeof(p_payload->'pollAfter') is distinct from 'number' or (p_payload->>'pollAfter') !~ '^[0-9]+$'
  then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  begin deadline:=to_timestamp((p_payload->>'pollAfter')::numeric/1000);
  exception when numeric_value_out_of_range or datetime_field_overflow then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end;
  if job.state not in('sending','submitted') or (job.operation_url is not null and job.operation_url<>url) then return '{"ok":false}'::jsonb;end if;
  update private.c1_cost_ocr_azure_jobs set state='submitted',operation_url=url,poll_after=greatest(job.poll_after,deadline,ts+interval '2 seconds'),updated_at=ts where job_key=key;
 elsif p_command='complete' then
  perform private.c1_workflow_require_keys(p_payload,array['key','resourceId','raw','result'],array['key','resourceId','raw','result']);
  raw:=p_payload->'raw';v_result:=p_payload->'result';
  if raw is null or raw='null'::jsonb or octet_length(raw::text)>4000000 or v_result is null or octet_length(v_result::text)>300000 or jsonb_typeof(v_result) is distinct from 'object'
  then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  perform private.c1_workflow_require_keys(v_result,array['status','reviewRequired','fields','warnings','sourceLocations','methodVersion'],array['status','reviewRequired','fields','warnings','sourceLocations','methodVersion','providerLocations','azurePdfCoverage']);
  if v_result->>'methodVersion' is distinct from 'azure-f0-v1' or v_result->>'status' is null or v_result->>'status' not in('needs_review','unavailable') or v_result->'reviewRequired' is distinct from 'true'::jsonb
  or jsonb_typeof(v_result->'fields') is distinct from 'object' or jsonb_typeof(v_result->'warnings') is distinct from 'array' or jsonb_typeof(v_result->'sourceLocations') is distinct from 'array'
  then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
  if source_mime='application/pdf' then
   perform private.c1_workflow_validate_pdf_coverage(v_result,sha,source_size,job.pages);
  elsif v_result ? 'azurePdfCoverage' then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';
  end if;
  if job.state='complete' then return jsonb_build_object('ok',job.raw_result=raw and job.result=v_result);end if;
  if job.state<>'submitted' then return '{"ok":false}'::jsonb;end if;
  update private.c1_cost_ocr_azure_jobs set state='complete',raw_result=raw,result=v_result,updated_at=ts where job_key=key;
 end if;
 return '{"ok":true}'::jsonb;
end;$$;
revoke all on function public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb) to service_role;
comment on function public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb) is 'Private gated Azure F0 port. Fresh user-JWT authorization before/after RPC required. No resource/month enrollment, browser access or quota release.';
