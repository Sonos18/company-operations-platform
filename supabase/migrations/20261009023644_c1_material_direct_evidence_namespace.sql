set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,48);

-- Direct invoice/proof files belong to the material namespace even though they
-- use the canonical workflow evidence table and payment target.
create or replace function private.c1_material_evidence_file(target_file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.material_evidence_scopes scope where scope.evidence_file_id=target_file_id)
  or private.c1_material_direct_evidence_file(target_file_id);
$$;

-- The generic workflow evidence validator excludes the material namespace.
-- Cash has its own exact-target, exact-kind, finalized, creator-bound proof check.
create function private.c1_material_require_direct_payment_proofs(t uuid,c uuid,p uuid,installment_id uuid,ids uuid[])
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if cardinality(ids) is null or cardinality(ids)<1 or cardinality(ids)>100
  or array_position(ids,null) is not null
  or cardinality(ids)<>(select count(distinct proof_id) from unnest(ids) proof_id)
  or cardinality(ids)<>(select count(*) from public.cost_evidence_files evidence
   where evidence.id=any(ids) and evidence.tenant_id=t and evidence.company_id=c
    and evidence.project_id=p and evidence.status='finalized'
    and evidence.workflow_origin and evidence.created_by=auth.uid()
    and evidence.workflow_evidence_kind='payment_proof'
    and evidence.workflow_target_kind='payment' and evidence.workflow_target_id=installment_id
    and private.c1_material_direct_evidence_file(evidence.id))
 then raise exception using errcode='P0001',message='CASH_PROOF_REQUIRED';end if;
end;$$;

-- Correct only the direct branch; preserve the moved legacy RPC body verbatim.
do $$
declare
 v_definition text;
 v_old text:=$old$
 perform private.c1_workflow_require_cash_target_proof(v_tenant,target_company_id,target_project_id,v_ids,
  'payment',v_installment.id,null);
 if cardinality(v_ids)<>(select count(*) from public.cost_evidence_files evidence
  where evidence.id=any(v_ids) and evidence.tenant_id=v_tenant and evidence.company_id=target_company_id
   and evidence.project_id=target_project_id and evidence.status='finalized'
   and evidence.workflow_origin and evidence.created_by=auth.uid() and evidence.workflow_evidence_kind='payment_proof'
   and evidence.workflow_target_kind='payment' and evidence.workflow_target_id=v_installment.id)
 then raise exception using errcode='P0001',message='CASH_PROOF_REQUIRED';end if;
$old$;
begin
 select pg_get_functiondef('private.c1_material_confirm_direct_payment(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
 into v_definition;
 if position(v_old in v_definition)=0
  or position('private.c1_material_require_direct_payment_proofs(' in v_definition)>0
 then raise exception using errcode='P0001',message='MATERIAL_DIRECT_PROOF_FUNCTION_DRIFT';end if;
 execute replace(v_definition,v_old,
  ' perform private.c1_material_require_direct_payment_proofs(v_tenant,target_company_id,target_project_id,v_installment.id,v_ids);');
end $$;

-- Pending direct uploads remain visible to their exact creator after the
-- broader material namespace predicate begins classifying those files.
alter policy c1_cost_evidence_files_select on public.cost_evidence_files using (
 private.c1_material_can_upload_direct_evidence(id)
 or private.c1_material_can_read_direct_evidence(id)
 or (not private.c1_material_direct_evidence_file(id) and not private.c1_material_evidence_file(id)
  and (private.c1_workflow_can_read_file(tenant_id,company_id,project_id,id)
   or (workflow_origin and created_by=auth.uid()
    and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.request.submit')
    and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.prepare'))
   or (not workflow_origin and ((status='pending_upload' and created_by=auth.uid()
    and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.prepare'))
    or (status='finalized' and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.source.read'))))))
);

revoke all on function private.c1_material_require_direct_payment_proofs(uuid,uuid,uuid,uuid,uuid[])
from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- Only an explicit material signed_contract scope or durable direct claim
-- attests the signed source. A legacy generic contract label is a source fact,
-- not proof that the document was signed. Quotation-only files may recur.
create function private.c1_material_explicit_signed_source(file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.material_evidence_scopes scope
  where scope.evidence_file_id=file_id and scope.evidence_role='signed_contract')
  or exists(select 1 from public.material_direct_authorizations authority
   where authority.signed_contract_evidence_file_id=file_id);
$$;
create function private.c1_material_legacy_contract_source_fact(file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files evidence
  where evidence.id=file_id and (
   evidence.workflow_evidence_kind='contract'
   or exists(select 1 from public.cost_evidence_links link
    where link.evidence_file_id=evidence.id and link.tenant_id=evidence.tenant_id
     and link.company_id=evidence.company_id and link.project_id=evidence.project_id
     and link.evidence_kind='contract')));
$$;
create function private.c1_material_ambiguous_legacy_source(file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files evidence
  where evidence.id=file_id and evidence.workflow_evidence_kind is null
   and not exists(select 1 from public.cost_evidence_links link
    where link.evidence_file_id=evidence.id and link.tenant_id=evidence.tenant_id
     and link.company_id=evidence.company_id and link.project_id=evidence.project_id)
   and not exists(select 1 from public.material_evidence_scopes scope
    where scope.evidence_file_id=evidence.id and scope.tenant_id=evidence.tenant_id
     and scope.company_id=evidence.company_id and scope.project_id=evidence.project_id));
$$;

create or replace function private.c1_material_contract_source_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare v_hash text;
begin
 for v_hash in select distinct evidence.verified_sha256 from public.cost_evidence_files evidence
  where evidence.id=any(new.evidence_file_ids)
   and evidence.tenant_id=new.tenant_id and evidence.company_id=new.company_id
   and evidence.project_id=new.project_id and evidence.status='finalized'
   and (private.c1_material_explicit_signed_source(evidence.id)
    or private.c1_material_legacy_contract_source_fact(evidence.id)
    or (new.basis_state='reviewed_reference' and private.c1_material_ambiguous_legacy_source(evidence.id)))
  order by evidence.verified_sha256
 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   'c1-material-contract-source:'||new.tenant_id::text||':'||new.company_id::text||':'||v_hash,0));
  if exists(select 1 from public.material_contract_source_claims claim
   where claim.tenant_id=new.tenant_id and claim.company_id=new.company_id
    and claim.signed_contract_sha256=v_hash and claim.contract_id<>new.contract_id)
  then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_SOURCE_CONFLICT';end if;
 end loop;
 return new;
end;$$;

-- The existing function OID is referenced by the record command. Positional
-- arguments avoid PL/pgSQL's order_id/role column-name collision.
create or replace function private.c1_material_require_signed_file(t uuid,c uuid,p uuid,order_id uuid,file_id uuid,role text)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_hash text;
begin
 select evidence.verified_sha256 into v_hash
 from public.cost_evidence_files evidence
 join public.material_evidence_scopes scope on scope.evidence_file_id=evidence.id
  and scope.tenant_id=evidence.tenant_id and scope.company_id=evidence.company_id
  and scope.project_id=evidence.project_id
 where evidence.id=$5 and evidence.tenant_id=$1 and evidence.company_id=$2 and evidence.project_id=$3
  and evidence.status='finalized' and evidence.verified_mime_type='application/pdf'
  and scope.target_kind='material_order' and scope.order_id=$4 and scope.evidence_role=$6;
 if not found or v_hash is null then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
 return v_hash;
end;$$;

-- Retain the original input/result signature and insert read authority before
-- any order, contract, source or receipt mutation.
do $$
declare v_definition text;v_old text;
begin
 select pg_get_functiondef('public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
 into v_definition;
 v_old:='v_context:=private.c1_material_context(target_company_id,''material.contract.record'');';
 if position(v_old in v_definition)=0
  or position('private.c1_material_context(target_company_id,''material.read'')' in v_definition)>0
 then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_READ_GUARD_DRIFT';end if;
 execute replace(v_definition,v_old,
  'perform private.c1_material_context(target_company_id,''material.read'');' || chr(10) || ' ' || v_old);
 select pg_get_functiondef('public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
 into v_definition;
 v_old:='perform private.c1_workflow_lock_actor(v_tenant,target_company_id,''material.contract.record'');';
 if position(v_old in v_definition)=0 then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_READ_GUARD_DRIFT';end if;
 execute replace(v_definition,v_old,
  'perform private.c1_workflow_lock_actor(v_tenant,target_company_id,''material.read'');' || chr(10) || ' ' || v_old);
end $$;

-- The former collision scan treated any attached quotation/supporting file as
-- a signed contract. Typed quotations remain reusable; untyped old reference
-- evidence with the exact signed hash is ambiguous and requires explicit review.
do $$
declare v_definition text;v_old text;v_new text;
begin
 select pg_get_functiondef('public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
 into v_definition;
 v_old:='and evidence.verified_sha256=v_signed_hash and (v_existing is null or version.contract_id<>v_existing)';
 v_new:='and evidence.verified_sha256=v_signed_hash'
  ||chr(10)||'   and (private.c1_material_explicit_signed_source(evidence.id)'
  ||chr(10)||'    or private.c1_material_legacy_contract_source_fact(evidence.id)'
  ||chr(10)||'    or (version.basis_state=''reviewed_reference'' and private.c1_material_ambiguous_legacy_source(evidence.id)))'
  ||chr(10)||'   and (v_existing is null or version.contract_id<>v_existing)';
 if position(v_old in v_definition)=0 or position('private.c1_material_explicit_signed_source(evidence.id)' in v_definition)>0
 then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_SOURCE_SCAN_DRIFT';end if;
 execute replace(v_definition,v_old,v_new);
end $$;

-- Absorbed windows remain historical. The direct window is the single active
-- authority counted against canonical cap floor; gross consumptions stay put.
create or replace function private.c1_workflow_cap_floor(t uuid,c uuid,p uuid,target_contract_id uuid,cap numeric)
returns void language plpgsql volatile security definer set search_path='' as $$
declare authorized numeric;historic_cash numeric;
begin
 select coalesce(sum(installment.authorized_amount),0) into authorized
 from public.cost_workflow_installments installment
 where installment.tenant_id=t and installment.company_id=c and installment.project_id=p
  and installment.contract_id=target_contract_id
  and not exists(select 1 from public.material_contract_absorptions absorbed
   where absorbed.old_installment_id=installment.id and absorbed.tenant_id=t
    and absorbed.company_id=c and absorbed.project_id=p);
 select coalesce(sum(payment.paid_amount),0) into historic_cash
 from public.project_subcontract_payments payment
 join public.cost_workflow_contracts contract on contract.source_subcontract_id=payment.project_subcontract_id
 where contract.id=target_contract_id and contract.tenant_id=t and contract.company_id=c and contract.project_id=p
  and payment.status='recorded'
  and not exists(select 1 from public.cost_workflow_payments mapped
   where mapped.subcontract_payment_id=payment.id and mapped.installment_id is not null);
 if cap<authorized+historic_cash then raise exception using errcode='P0001',message='CONTRACT_CAP_EXCEEDED';end if;
end;$$;

-- A legacy request cannot open a second active manager-decision window for a
-- material contract that already has its immutable direct signed authority.
create or replace function private.c1_workflow_require_cap(t uuid,c uuid,p uuid,contract_id uuid,proposed numeric)
returns void language plpgsql volatile security definer set search_path='' as $$
declare contract public.cost_workflow_contracts%rowtype;cap numeric;authorized numeric;
begin
 if contract_id is null then return;end if;
 select * into contract from public.cost_workflow_contracts
  where id=contract_id and tenant_id=t and company_id=c and project_id=p for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if exists(select 1 from public.material_direct_authorizations authority
  where authority.contract_id=contract.id and authority.tenant_id=t
   and authority.company_id=c and authority.project_id=p)
 then raise exception using errcode='P0001',message='CONTRACT_CAP_EXCEEDED';end if;
 if contract.source_subcontract_id is not null and exists(select 1 from public.project_subcontract_payments old
  where old.project_subcontract_id=contract.source_subcontract_id and old.status='recorded'
   and not exists(select 1 from public.cost_workflow_payments mapped
    where mapped.subcontract_payment_id=old.id and mapped.installment_id is not null))
 then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 if exists(select 1 from public.project_cost_items legacy
  left join public.cost_categories legacy_category on legacy_category.id=legacy.cost_category_id
   and legacy_category.tenant_id=t and legacy_category.company_id=c
  where legacy.tenant_id=t and legacy.company_id=c and legacy.project_id=p
   and (legacy.party_id=contract.party_id or legacy.party_id is null)
   and legacy.publication_state='published'
   and (legacy_category.code is null or legacy_category.code<>'subcontract_labor'))
 then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 select version.cap into cap from public.cost_workflow_contract_versions version
  where version.contract_id=contract.id and version.version=contract.current_version;
 select coalesce(sum(installment.authorized_amount),0) into authorized
 from public.cost_workflow_installments installment
 where installment.contract_id=contract.id and installment.tenant_id=t
  and installment.company_id=c and installment.project_id=p
  and not exists(select 1 from public.material_contract_absorptions absorbed
   where absorbed.old_installment_id=installment.id and absorbed.tenant_id=t
    and absorbed.company_id=c and absorbed.project_id=p);
 if cap is null or authorized+proposed>cap then raise exception using errcode='P0001',message='CONTRACT_CAP_EXCEEDED';end if;
end;$$;

revoke all on function private.c1_material_explicit_signed_source(uuid),
 private.c1_material_legacy_contract_source_fact(uuid),
 private.c1_material_ambiguous_legacy_source(uuid)
from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- A company can disable or remove cost settings after contract recording.
-- Cash then reports the controlled missing-configuration error, not a parser error.
do $$
declare v_definition text;v_old text;v_new text;
begin
 select pg_get_functiondef('private.c1_material_confirm_direct_payment(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
 into v_definition;
 v_old:='where tenant_id=v_tenant and company_id=target_company_id and enabled;'
  ||chr(10)||' v_amount:=private.c1_workflow_money(target_input->''amount'',v_scale);';
 v_new:='where tenant_id=v_tenant and company_id=target_company_id and enabled;'
  ||chr(10)||' if not found then raise exception using errcode=''P0001'',message=''WORKFLOW_CONFIGURATION_REQUIRED'';end if;'
  ||chr(10)||' v_amount:=private.c1_workflow_money(target_input->''amount'',v_scale);';
 if position(v_old in v_definition)=0
  or position('if not found then raise exception using errcode=''P0001'',message=''WORKFLOW_CONFIGURATION_REQUIRED'';end if;' in v_definition)>0
 then raise exception using errcode='P0001',message='MATERIAL_DIRECT_CASH_SETTINGS_DRIFT';end if;
 execute replace(v_definition,v_old,v_new);
end $$;

-- The user-bound source preflight must prove the exact creator, payment target
-- and file state before the server can resolve a privileged finalizer.
create or replace function public.c1_material_payment_evidence_source(target_company_id uuid,target_project_id uuid,target_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_file public.cost_evidence_files%rowtype;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');
 v_tenant:=(v_context->>'tenantId')::uuid;
 select evidence.* into v_file from public.cost_evidence_files evidence
  where evidence.id=target_id and evidence.tenant_id=v_tenant
   and evidence.company_id=target_company_id and evidence.project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if not private.c1_material_direct_evidence_file(v_file.id) then return false;end if;
 if v_file.created_by is distinct from auth.uid()
 then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if v_file.status='pending_upload' and not private.c1_material_can_upload_direct_evidence(v_file.id)
 then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
 if v_file.status not in('pending_upload','finalized')
 then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
 return true;
end;$$;

-- Keep the canonical order ID explicit in the strict record result. SQL function
-- parameter names can otherwise collide with joined order_id columns.
create or replace function private.c1_material_contract_ack(order_id uuid,order_version bigint,replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('resourceId',$1,'version',$2,'replayed',$3,
  'contractId',link.contract_id,'authorizationId',authority.id,
  'installmentId',installment.id,'notificationId',notification.id)
 from public.material_order_contracts link
 join public.material_direct_authorizations authority
  on authority.order_id=link.order_id and authority.contract_id=link.contract_id
 join public.cost_workflow_installments installment on installment.direct_authorization_id=authority.id
 join public.cost_workflow_notifications notification on notification.direct_authorization_id=authority.id
 where link.order_id=$1;
$$;
do $$
declare v_definition text;v_old text:='where authority.order_id=order_id and authority.tenant_id=t';
begin
 select pg_get_functiondef('private.c1_material_order_json(uuid,uuid,uuid,uuid)'::regprocedure)
 into v_definition;
 if position(v_old in v_definition)=0
 then raise exception using errcode='P0001',message='MATERIAL_ORDER_PROJECTION_DRIFT';end if;
 execute replace(v_definition,v_old,'where authority.order_id=$4 and authority.tenant_id=t');
end $$;

-- A previously recorded receipt can replay after project completion; a new
-- signed commitment still needs an active project.
do $$
declare v_definition text;v_old text;
begin
 select pg_get_functiondef('public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
 into v_definition;
 v_old:='if v_order.version<>v_expected or v_order.state<>''active''';
 if position(v_old in v_definition)=0
 then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_PROJECT_STATE_DRIFT';end if;
 execute replace(v_definition,v_old,
  'if (private.c1_material_require_project(v_tenant,target_company_id,target_project_id)).operational_state=''completed'''
  ||chr(10)||' then raise exception using errcode=''P0001'',message=''PROJECT_COMPLETED'';end if;'
  ||chr(10)||' '||v_old);
end $$;
