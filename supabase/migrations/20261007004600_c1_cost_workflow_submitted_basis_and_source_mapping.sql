-- Forward-only PR29 correction. Source prepared only; requires separately approved Cloud DEV apply.
-- Preserve all existing decision/submission ACLs, replay, locks, completion and current-cap guards.

create or replace function public.c1_workflow_submit_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;meta jsonb;request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;expected bigint;next_snapshot bigint;submitted_input jsonb;contract public.cost_workflow_contracts%rowtype;basis public.cost_workflow_contract_versions%rowtype;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.submit');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');perform private.c1_workflow_project_state(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 if assignment.id is null or not private.c1_workflow_user_has_permission(t,target_company_id,assignment.manager_user_id,'cost.request.decide') then raise exception using errcode='P0001',message='PROJECT_MANAGER_REQUIRED';end if;
 perform private.c1_workflow_require_keys(target_input,array['expectedVersion'],array['expectedVersion']);expected:=private.c1_detail_expected_version(target_input);
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
 if not found or request.kind<>'installment' then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.submit_request',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('requestId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 meta:=private.c1_workflow_validate_request(t,target_company_id,target_project_id,request.working_input);
 perform private.c1_workflow_require_cap(t,target_company_id,target_project_id,request.contract_id,(meta->>'amount')::numeric);
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if request.version<>expected or request.state not in('working','returned') then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if request.contract_id is distinct from (meta->>'contractId')::uuid then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 -- Freeze the resolved basis while the contract lock is held, including implicit canonical mappings.
 submitted_input:=request.working_input;
 if request.contract_id is not null then
  select * into contract from public.cost_workflow_contracts where id=request.contract_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  select * into basis from public.cost_workflow_contract_versions
  where contract_id=contract.id and tenant_id=t and company_id=target_company_id and project_id=target_project_id
  and (id=(meta->>'contractVersionId')::uuid or (meta->>'contractVersionId' is null and version=contract.current_version));
  if not found then raise exception using errcode='P0001',message='CONTRACT_BASIS_REQUIRED';end if;
  submitted_input:=submitted_input||jsonb_build_object('contractVersionId',basis.id);
 end if;
 select coalesce(max(version),0)+1 into next_snapshot from public.cost_workflow_request_versions where request_id=request.id;
 insert into public.cost_workflow_request_versions(tenant_id,company_id,project_id,request_id,version,snapshot,amount,currency_code,evidence_file_ids,manager_assignment_id,submitted_by)
 values(t,target_company_id,target_project_id,request.id,next_snapshot,submitted_input,(meta->>'amount')::numeric,meta->>'currencyCode',private.c1_workflow_evidence_ids(request.working_input->'evidenceFileIds'),assignment.id,auth.uid()) returning * into snapshot;
 update public.cost_workflow_requests set state='submitted',working_input=submitted_input,submitted_version_id=snapshot.id,version=version+1,updated_at=now() where id=request.id returning * into request;
 insert into public.cost_workflow_request_evidence(tenant_id,company_id,project_id,request_id,request_version,evidence_file_id,evidence_kind,created_by)
 select t,target_company_id,target_project_id,request.id,request.version,f.id,coalesce(f.workflow_evidence_kind,'accounting_support'),auth.uid() from public.cost_evidence_files f where f.id=any(snapshot.evidence_file_ids) and f.tenant_id=t and f.company_id=target_company_id and f.project_id=target_project_id;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.submit_request',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('projectId',target_project_id,'submittedVersionId',snapshot.id,'assignmentId',assignment.id));
 return jsonb_build_object('requestId',request.id,'version',request.version,'replayed',false);
end;$$;

create or replace function public.c1_workflow_decide_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;
 decision public.cost_workflow_decisions%rowtype;installment public.cost_workflow_installments%rowtype;contract public.cost_workflow_contracts%rowtype;basis public.cost_workflow_contract_versions%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;submitted uuid;choice text;reason text;meta jsonb;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.decide');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.decide');perform private.c1_workflow_project_state(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 if assignment.manager_user_id is distinct from auth.uid() then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 perform private.c1_workflow_require_keys(target_input,array['submittedVersionId','decision'],array['submittedVersionId','decision','reason']);
 choice:=private.c1_workflow_text(target_input->'decision');
 if choice not in('approve','return') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if target_input ? 'reason' then reason:=private.c1_workflow_text(target_input->'reason');end if;
 if choice='return' and reason is null then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 begin submitted:=(target_input->>'submittedVersionId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
 if not found or request.kind<>'installment' then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select * into snapshot from public.cost_workflow_request_versions where id=submitted and request_id=request.id and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if request.contract_id is not null then
  select * into contract from public.cost_workflow_contracts where id=request.contract_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 end if;
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.decide_request',target_idempotency_key,hash);
 if receipt.id is not null then
  select * into installment from public.cost_workflow_installments where request_id=receipt.result_resource_id;
  return jsonb_strip_nulls(jsonb_build_object('requestId',receipt.result_resource_id,'installmentId',installment.id,'version',receipt.result_version,'replayed',true));
 end if;
 perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if request.state<>'submitted' or request.submitted_version_id is distinct from submitted then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if choice='approve' then
  meta:=private.c1_workflow_validate_request(t,target_company_id,target_project_id,snapshot.snapshot);
  if request.party_id is distinct from (meta->>'partyId')::uuid or request.category_id is distinct from (meta->>'categoryId')::uuid or request.contract_id is distinct from (meta->>'contractId')::uuid then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
  -- Historical identity comes from the submitted immutable snapshot. Current cap is rechecked separately below.
  if request.contract_id is not null then
   select * into basis from public.cost_workflow_contract_versions
   where id=(snapshot.snapshot->>'contractVersionId')::uuid and contract_id=contract.id
   and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
   if not found then raise exception using errcode='P0001',message='CONTRACT_BASIS_REQUIRED';end if;
  end if;
  begin perform private.c1_workflow_require_cap(t,target_company_id,target_project_id,request.contract_id,snapshot.amount);
  exception when sqlstate 'P0001' then
   if sqlerrm='CONTRACT_CAP_EXCEEDED' then choice:='return';reason:='Đợt vượt trần hợp đồng đang có hiệu lực; cần điều chỉnh được duyệt trước.';
   else raise;end if;
  end;
 end if;
 insert into public.cost_workflow_decisions(tenant_id,company_id,project_id,submitted_version_id,decision,manager_assignment_id,decided_by,reason)
 values(t,target_company_id,target_project_id,submitted,choice,assignment.id,auth.uid(),reason) returning * into decision;
 if choice='approve' then
  insert into public.cost_workflow_installments(tenant_id,company_id,project_id,request_id,decision_id,contract_id,contract_version_id,party_id,category_id,authorized_amount,currency_code,approved_at)
  values(t,target_company_id,target_project_id,request.id,decision.id,request.contract_id,basis.id,request.party_id,request.category_id,snapshot.amount,snapshot.currency_code,decision.decided_at) returning * into installment;
  perform private.c1_workflow_notify_director(t,target_company_id,target_project_id,decision.id);
 end if;
 update public.cost_workflow_requests set state=case when choice='approve' then 'approved' else 'returned' end,version=version+1,updated_at=now() where id=request.id returning * into request;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.decide_request',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('projectId',target_project_id,'submittedVersionId',submitted,'decision',choice,'reason',reason,'assignmentId',assignment.id,'installmentId',installment.id));
 return jsonb_strip_nulls(jsonb_build_object('requestId',request.id,'installmentId',installment.id,'version',request.version,'replayed',false));
end;$$;

create function public.c1_workflow_list_source_subcontracts(target_company_id uuid,target_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;result jsonb;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 if not private.c1_workflow_actor_has_permission(t,target_company_id,'cost.request.submit')
 or not private.c1_workflow_actor_has_permission(t,target_company_id,'cost.prepare')
 then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'partyId',s.subcontractor_party_id,'code',s.code,'contractName',s.contract_name,'currencyCode',s.currency_code) order by s.code,s.id),'[]'::jsonb) into result
 from public.project_subcontracts s
 where s.tenant_id=t and s.company_id=target_company_id and s.project_id=target_project_id and s.is_active
 and exists(select 1 from public.business_parties party where party.id=s.subcontractor_party_id and party.tenant_id=t and party.company_id=target_company_id and party.is_active)
 and not exists(select 1 from public.cost_workflow_contracts mapped where mapped.source_subcontract_id=s.id and mapped.tenant_id=t and mapped.company_id=target_company_id and mapped.project_id=target_project_id);
 return result;
end;$$;
revoke all on function public.c1_workflow_list_source_subcontracts(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_list_source_subcontracts(uuid,uuid) to authenticated;
