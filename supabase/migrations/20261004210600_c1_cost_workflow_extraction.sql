set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,31);
-- A staged original can be reviewed before selecting a party or creating a working request.
alter table public.cost_workflow_extractions alter column request_id drop not null;

create function private.c1_workflow_extraction_target(t uuid,c uuid,p uuid,r uuid,fid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.cost_evidence_files%rowtype;request public.cost_workflow_requests%rowtype;
begin
 if not private.c1_workflow_can_read_file(t,c,p,fid) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select * into f from public.cost_evidence_files where id=fid and tenant_id=t and company_id=c and project_id=p and status='finalized';
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if r is not null then
  select * into request from public.cost_workflow_requests where id=r and tenant_id=t and company_id=c and project_id=p and kind='installment';
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  if request.state not in('working','returned') then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 end if;
 return jsonb_build_object('fileId',f.id,'companyId',c,'projectId',p,'requestId',r,'fileVersion',f.version,'requestVersion',request.version,'sha256',f.verified_sha256,'mimeType',f.verified_mime_type,'sizeBytes',f.verified_size_bytes,'bucketId',f.bucket_id,'objectPath',f.object_path);
end;$$;
create function public.c1_workflow_extraction_target(target_company_id uuid,target_project_id uuid,target_request_id uuid,target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare context jsonb;t uuid;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.prepare');t:=(context->>'tenantId')::uuid;
 if not private.c1_workflow_actor_has_permission(t,target_company_id,'cost.request.submit') or not private.c1_workflow_actor_has_permission(t,target_company_id,'cost.request.file.read') or not private.c1_workflow_can_read(t,target_company_id,target_project_id)
 then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 return private.c1_workflow_extraction_target(t,target_company_id,target_project_id,target_request_id,target_id);
end;$$;

create function public.c1_workflow_record_extraction(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;original jsonb;result jsonb;request_id uuid;hash text;receipt public.cost_command_receipts%rowtype;extraction public.cost_workflow_extractions%rowtype;method text;state text;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.prepare');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.prepare');perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.read');perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.file.read');
 perform private.c1_workflow_project_state(t,target_company_id,target_project_id);perform private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 perform private.c1_workflow_require_keys(target_input,array['requestId','fileVersion','requestVersion','sha256','result'],array['requestId','fileVersion','requestVersion','sha256','result']);
 begin request_id:=(target_input->>'requestId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 if request_id is not null then perform 1 from public.cost_workflow_requests where id=request_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for share;end if;
 original:=private.c1_workflow_extraction_target(t,target_company_id,target_project_id,request_id,target_id);
 if target_input->'fileVersion' is distinct from original->'fileVersion' or target_input->'requestVersion' is distinct from original->'requestVersion' or target_input->'sha256' is distinct from original->'sha256'
 then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 result:=target_input->'result';
 -- Non-authoritative suggestions only: JSON cannot become a request, grant, party or cash event.
 if octet_length(result::text)>300000 or jsonb_typeof(result) is distinct from 'object' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_workflow_require_keys(result,array['status','reviewRequired','fields','warnings','sourceLocations','methodVersion'],array['status','reviewRequired','fields','warnings','sourceLocations','methodVersion']);
 method:=result->>'methodVersion';state:=result->>'status';
 if method not in('excel-offline-v1','offline-unavailable-v1','synthetic-fixture-v1') or state not in('ready','needs_review','unavailable','failed') or result->'reviewRequired' is distinct from 'true'::jsonb
 or jsonb_typeof(result->'fields') is distinct from 'object' or jsonb_typeof(result->'warnings') is distinct from 'array' or jsonb_typeof(result->'sourceLocations') is distinct from 'array'
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if jsonb_array_length(result->'warnings')>100 or jsonb_array_length(result->'sourceLocations')>10000 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_workflow_require_keys(result->'fields',array[]::text[],array['partyHint','amount','currencyCode','basis','accountingBasis']);
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.extract',target_idempotency_key,hash);
 if receipt.id is not null then
  select * into extraction from public.cost_workflow_extractions where id=receipt.result_resource_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
  return jsonb_build_object('extractionId',extraction.id,'fileId',extraction.evidence_file_id,'requestId',extraction.request_id,'result',extraction.result,'replayed',true);
 end if;
 insert into public.cost_workflow_extractions(tenant_id,company_id,project_id,request_id,evidence_file_id,method_version,status,result,created_by)
 values(t,target_company_id,target_project_id,request_id,target_id,method,state,result,auth.uid()) returning * into extraction;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.extract',target_idempotency_key,hash,extraction.id,1,target_request_id,jsonb_build_object('projectId',target_project_id,'fileId',target_id,'requestId',request_id,'methodVersion',method,'status',state,'reviewRequired',true));
 return jsonb_build_object('extractionId',extraction.id,'fileId',target_id,'requestId',request_id,'result',result,'replayed',false);
end;$$;
revoke all on function private.c1_workflow_extraction_target(uuid,uuid,uuid,uuid,uuid),public.c1_workflow_extraction_target(uuid,uuid,uuid,uuid),public.c1_workflow_record_extraction(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_extraction_target(uuid,uuid,uuid,uuid),public.c1_workflow_record_extraction(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;

create or replace function private.c1_workflow_validate_request(t uuid,c uuid,p uuid,input jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare scale integer;currency text;party public.business_parties%rowtype;category public.cost_categories%rowtype;
 crew text;ids uuid[];contract public.cost_workflow_contracts%rowtype;basis_version public.cost_workflow_contract_versions%rowtype;given_version uuid;amount numeric;source_id uuid;
begin
 perform private.c1_workflow_require_keys(input,array['partyId','partyKind','categoryId','amount','currencyCode','basis','evidenceFileIds'],array['partyId','partyKind','crewOwnership','categoryId','contractVersionId','amount','currencyCode','basis','evidenceFileIds','accountingBasis']);

 if input ? 'accountingBasis' then
  perform private.c1_workflow_require_keys(input->'accountingBasis',array[]::text[],array['vatBasis','roundingBasis','allowanceBasis']);
  if input->'accountingBasis'='{}'::jsonb then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  if input->'accountingBasis' ? 'vatBasis' then perform private.c1_workflow_text(input->'accountingBasis'->'vatBasis');end if;
  if input->'accountingBasis' ? 'roundingBasis' then perform private.c1_workflow_text(input->'accountingBasis'->'roundingBasis');end if;
  if input->'accountingBasis' ? 'allowanceBasis' then perform private.c1_workflow_text(input->'accountingBasis'->'allowanceBasis');end if;
 end if;
 select s.money_scale,s.default_currency_code into scale,currency from public.company_cost_settings s where s.tenant_id=t and s.company_id=c and s.enabled for share;
 if not found then raise exception using errcode='P0001',message='MODULE_DISABLED';end if;
 if private.c1_workflow_text(input->'currencyCode')<>currency then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 amount:=private.c1_workflow_money(input->'amount',scale);
 ids:=private.c1_workflow_evidence_ids(input->'evidenceFileIds');perform private.c1_workflow_require_evidence(t,c,p,ids);
 begin
  select * into party from public.business_parties where id=(input->>'partyId')::uuid and tenant_id=t and company_id=c and is_active;
  if not found or party.party_kind is distinct from input->>'partyKind' then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  select * into category from public.cost_categories where id=(input->>'categoryId')::uuid and tenant_id=t and company_id=c and is_active;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  given_version:=(input->>'contractVersionId')::uuid;
  source_id:=(input->'basis'->>'subcontractId')::uuid;
 exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 if party.party_kind='crew' then
  select x.crew_ownership into crew from public.cost_workflow_party_classifications x where x.party_id=party.id and x.tenant_id=t and x.company_id=c order by x.version desc limit 1;
  if crew is null or crew is distinct from input->>'crewOwnership' then raise exception using errcode='P0001',message='PARTY_CLASSIFICATION_REQUIRED';end if;
 elsif input ? 'crewOwnership' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if category.code='direct_labor' and (party.party_kind<>'crew' or crew is distinct from 'vqh_internal')
 or category.code='subcontract_labor' and crew='vqh_internal' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_workflow_validate_basis(input->'basis',category.code);
 if source_id is not null and not exists(select 1 from public.project_subcontracts s where s.id=source_id and s.tenant_id=t and s.company_id=c and s.project_id=p and s.currency_code=currency and s.subcontractor_party_id=party.id and s.is_active)
 then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if given_version is not null then
  select * into basis_version from public.cost_workflow_contract_versions where id=given_version and tenant_id=t and company_id=c and project_id=p;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  select * into contract from public.cost_workflow_contracts where id=basis_version.contract_id and tenant_id=t and company_id=c and project_id=p for update;
 elsif source_id is not null then
  select * into contract from public.cost_workflow_contracts where source_subcontract_id=source_id and tenant_id=t and company_id=c and project_id=p for update;
  if not found then raise exception using errcode='P0001',message='CONTRACT_BASIS_REQUIRED';end if;
 else
  -- The same original cannot silently be reclassified as a contract-free installment.
  if exists(select 1 from public.cost_workflow_contract_versions v join public.cost_evidence_files known on known.id=any(v.evidence_file_ids)
    join public.cost_evidence_files selected on selected.id=any(ids) and selected.verified_sha256=known.verified_sha256 and selected.verified_sha256=any(private.c1_workflow_primary_basis_hashes(t,c,p,ids))
    join public.cost_workflow_contracts identified on identified.id=v.contract_id and identified.party_id=party.id
    where v.tenant_id=t and v.company_id=c and v.project_id=p and category.code<>'direct_labor')
  then raise exception using errcode='P0001',message='CONTRACT_BASIS_REQUIRED';end if;
 end if;
 -- Explicit version selection must still refer to the same identified basis.
 -- Other supporting documents do not establish a separate cap identity.
 if contract.id is not null and exists(
  select 1 from public.cost_workflow_contract_versions v join public.cost_evidence_files known on known.id=any(v.evidence_file_ids)
  where v.tenant_id=t and v.company_id=c and v.project_id=p and v.contract_id<>contract.id
  and known.tenant_id=t and known.company_id=c and known.project_id=p
  and known.verified_sha256=any(private.c1_workflow_primary_basis_hashes(t,c,p,ids))
 ) then raise exception using errcode='P0001',message='CONTRACT_REFERENCE_CONFLICT';end if;
 if contract.id is not null and (contract.party_id<>party.id or contract.currency_code<>currency or (source_id is not null and contract.source_subcontract_id is distinct from source_id))
 then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return jsonb_build_object('partyId',party.id,'categoryId',category.id,'contractId',contract.id,'contractVersionId',given_version,'amount',amount::text,'currencyCode',currency,'evidenceFileIds',ids);
end;$$;

create or replace function private.c1_workflow_request_view(request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'version',r.version,'submittedVersionId',r.submitted_version_id,'status',r.state,
 'partyId',r.party_id,'partyKind',r.working_input->>'partyKind','crewOwnership',r.working_input->>'crewOwnership',
 'categoryId',r.category_id,'contractVersionId',r.working_input->>'contractVersionId','latestDecision',private.c1_workflow_decision_view(r.submitted_version_id),
 'amount',r.working_input->>'amount','currencyCode',r.working_input->>'currencyCode','evidenceFileIds',r.working_input->'evidenceFileIds','basis',r.working_input->'basis','accountingBasis',r.working_input->'accountingBasis',
 'assignmentVersion',(select a.assignment_version from public.cost_workflow_manager_assignments a where a.tenant_id=r.tenant_id and a.company_id=r.company_id and a.project_id=r.project_id order by a.assignment_version desc limit 1),
 'installment',(select jsonb_build_object('id',i.id,'version',(select count(*) from public.cost_workflow_consumptions x where x.installment_id=i.id),'authorized',i.authorized_amount::text,'consumed',coalesce((select sum(c.amount) from public.cost_workflow_consumptions c where c.installment_id=i.id),0)::text,'remaining',(i.authorized_amount-coalesce((select sum(c.amount) from public.cost_workflow_consumptions c where c.installment_id=i.id),0))::text) from public.cost_workflow_installments i where i.request_id=r.id),
 'payments',coalesce((select jsonb_agg(private.c1_workflow_payment_view(p.id) order by p.confirmed_at,p.id) from public.cost_workflow_payments p join public.cost_workflow_installments i on i.id=p.installment_id where i.request_id=r.id),'[]'::jsonb))
 from public.cost_workflow_requests r where r.id=$1 and r.kind='installment';
$$;

