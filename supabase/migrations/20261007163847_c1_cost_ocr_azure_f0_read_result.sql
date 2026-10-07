-- Source-only forward migration: no operational row, quota, provider or configuration changes.
-- Raw evidence remains private; the request-bound server wrapper MUST freshly authorize
-- the user/actor/file/request before and after this service-role-only capability.
create function public.c1_cost_ocr_azure_f0_read_result(p_binding jsonb,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 t uuid;c uuid;p uuid;fid uuid;actor uuid;rid uuid;fv integer;rv integer;sha text;
 resource text;key text;expected_key text;source_mime text;source_size bigint;pdf_scope text;
 job private.c1_cost_ocr_azure_jobs%rowtype;raw jsonb;v_pages jsonb;v_returned jsonb;v_requested jsonb;
begin
 perform private.c1_workflow_require_keys(p_binding,
  array['actorId','tenantId','companyId','projectId','fileId','fileVersion','sha256','requestId','requestVersion'],
  array['actorId','tenantId','companyId','projectId','fileId','fileVersion','sha256','requestId','requestVersion']);
 perform private.c1_workflow_require_keys(p_payload,array['key','resourceId'],array['key','resourceId']);
 if exists(select 1 from jsonb_each(p_binding) e where e.key in('actorId','tenantId','companyId','projectId','fileId','sha256') and jsonb_typeof(e.value) is distinct from 'string')
 or jsonb_typeof(p_binding->'fileVersion') is distinct from 'number' or p_binding->>'fileVersion' !~ '^[1-9][0-9]*$'
 or (p_binding->'requestId'<>'null'::jsonb and jsonb_typeof(p_binding->'requestId') is distinct from 'string')
 or (p_binding->'requestVersion'<>'null'::jsonb and (jsonb_typeof(p_binding->'requestVersion') is distinct from 'number' or p_binding->>'requestVersion' !~ '^[0-9]+$'))
 or jsonb_typeof(p_payload->'key') is distinct from 'string' or jsonb_typeof(p_payload->'resourceId') is distinct from 'string'
 then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
 begin
  t:=(p_binding->>'tenantId')::uuid;c:=(p_binding->>'companyId')::uuid;p:=(p_binding->>'projectId')::uuid;
  fid:=(p_binding->>'fileId')::uuid;actor:=(p_binding->>'actorId')::uuid;fv:=(p_binding->>'fileVersion')::integer;
  rid:=(p_binding->>'requestId')::uuid;rv:=(p_binding->>'requestVersion')::integer;sha:=p_binding->>'sha256';
 exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';
 end;
 resource:=p_payload->>'resourceId';key:=p_payload->>'key';
 if t is null or c is null or p is null or fid is null or actor is null or fv is null or fv<1
 or sha is null or sha !~ '^[0-9a-f]{64}$' or (rid is null)<>(rv is null) or rv<0
 or resource is distinct from 'taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
 or key is null or key !~ '^[0-9a-f]{64}$'
 then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
 select f.verified_mime_type,f.verified_size_bytes into source_mime,source_size
 from public.cost_evidence_files f where f.id=fid and f.tenant_id=t and f.company_id=c and f.project_id=p
 and f.status='finalized' and f.workflow_evidence_kind='quotation' and f.version=fv and f.verified_sha256=sha and f.verified_size_bytes between 1 and 4000000
 and f.verified_mime_type in('application/pdf','image/png','image/jpeg');
 if not found then raise exception using errcode='P0001',message='AZURE_STORE_SCOPE_CHANGED';end if;
 if rid is not null then
  perform 1 from public.cost_workflow_requests r where r.id=rid and r.tenant_id=t and r.company_id=c and r.project_id=p
  and r.kind='installment' and r.version=rv and r.state in('working','returned');
  if not found then raise exception using errcode='P0001',message='AZURE_STORE_SCOPE_CHANGED';end if;
 end if;
 select j.* into job from private.c1_cost_ocr_azure_jobs j where j.job_key=key and j.resource_id=resource
 and j.tenant_id=t and j.company_id=c and j.project_id=p and j.file_id=fid and j.file_version=fv and j.sha256=sha
 and j.created_by=actor and j.request_id is not distinct from rid and j.request_version is not distinct from rv
 and j.state='complete' and j.model='prebuilt-layout'
 and j.configuration_version='azure-f0-rest-2024-11-30-quotation-v2' and j.pages between 1 and 2;
 if not found then raise exception using errcode='P0001',message='AZURE_STORE_SCOPE_CHANGED';end if;
 if source_mime='application/pdf' then
  perform private.c1_workflow_validate_pdf_coverage(job.result,sha,source_size,job.pages);
  if job.result->'azurePdfCoverage'->'requestedPagesMatched' is distinct from 'true'::jsonb
  then raise exception using errcode='P0001',message='AZURE_STORE_RESPONSE_INVALID';end if;
  pdf_scope:=case job.pages when 1 then '1' when 2 then '1-2' end;
 elsif job.result ? 'azurePdfCoverage' then
  raise exception using errcode='P0001',message='AZURE_STORE_RESPONSE_INVALID';
 end if;
 -- Canonical provider job identity is unchanged; mapper revision never participates.
 expected_key:=encode(extensions.digest(convert_to('['||to_json(resource)::text||','||to_json(job.configuration_version)::text||','||to_json(c::text)::text||','||to_json(p::text)::text||','||to_json(fid::text)::text||','||to_json(sha)::text||','||to_json(job.model)::text||case when source_mime='application/pdf' then ','||to_json('azure-pdf-scope-v1'::text)::text||','||to_json(pdf_scope)::text else '' end||']','UTF8'),'sha256'),'hex');
 if key is distinct from expected_key then raise exception using errcode='P0001',message='AZURE_STORE_INPUT_INVALID';end if;
 raw:=job.raw_result;
 if jsonb_typeof(raw) is distinct from 'object' or octet_length(raw::text)>4000000
 or raw->>'status' is distinct from 'succeeded'
 or raw->'analyzeResult'->>'apiVersion' is distinct from '2024-11-30'
 or raw->'analyzeResult'->>'modelId' is distinct from 'prebuilt-layout'
 or jsonb_typeof(raw->'analyzeResult'->'pages') is distinct from 'array'
 or job.result->>'methodVersion' is distinct from 'azure-f0-v1'
 or job.result->'reviewRequired' is distinct from 'true'::jsonb
 or job.result->>'status' is null or job.result->>'status' not in('needs_review','unavailable')
 then raise exception using errcode='P0001',message='AZURE_STORE_RESPONSE_INVALID';end if;
 if raw->'analyzeResult' ? 'warnings' then
  if raw->'analyzeResult'->'warnings' is distinct from '[]'::jsonb
  then raise exception using errcode='P0001',message='AZURE_STORE_RESPONSE_INVALID';end if;
 end if;
 v_pages:=raw->'analyzeResult'->'pages';
 if jsonb_array_length(v_pages)<>job.pages or exists(select 1 from jsonb_array_elements(v_pages) e(value)
  where jsonb_typeof(e.value->'pageNumber') is distinct from 'number' or e.value->>'pageNumber' not in('1','2'))
 then raise exception using errcode='P0001',message='AZURE_STORE_RESPONSE_INVALID';end if;
 select jsonb_agg(e.value->'pageNumber' order by (e.value->>'pageNumber')::integer) into v_returned from jsonb_array_elements(v_pages) e(value);
 v_requested:=case job.pages when 1 then '[1]'::jsonb when 2 then '[1,2]'::jsonb end;
 if v_returned is distinct from v_requested then raise exception using errcode='P0001',message='AZURE_STORE_RESPONSE_INVALID';end if;
 if source_mime='application/pdf' and job.result->'azurePdfCoverage'->'returnedPages' is distinct from
  (select jsonb_agg(e.value->'pageNumber' order by e.ordinality) from jsonb_array_elements(v_pages) with ordinality e(value,ordinality))
 then raise exception using errcode='P0001',message='AZURE_STORE_RESPONSE_INVALID';end if;
 return jsonb_build_object('raw',raw);
end;$$;
revoke all on function public.c1_cost_ocr_azure_f0_read_result(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.c1_cost_ocr_azure_f0_read_result(jsonb,jsonb) to service_role;
comment on function public.c1_cost_ocr_azure_f0_read_result(jsonb,jsonb) is 'Read-only completed quotation evidence. Fresh user-JWT actor/file/request authorization before and after each private server read is required; no browser/raw endpoint or provider fallback.';
