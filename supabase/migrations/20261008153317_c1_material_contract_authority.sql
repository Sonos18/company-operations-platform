set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 46);

create table public.material_direct_authorizations (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
 order_id uuid not null unique, contract_id uuid not null unique, contract_version_id uuid not null unique,
 signed_value numeric(20,4) not null check (signed_value > 0),
 currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
 signed_contract_evidence_file_id uuid not null unique,
 signed_quotation_evidence_file_id uuid not null,
 signed_contract_sha256 text not null check (signed_contract_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_by uuid not null references auth.users(id) on delete restrict,
 recorded_at timestamptz not null default now(),
 unique(id,tenant_id,company_id,project_id),
 unique(tenant_id,company_id,signed_contract_sha256),
 check(signed_contract_evidence_file_id <> signed_quotation_evidence_file_id),
 foreign key(order_id,tenant_id,company_id,project_id) references public.material_orders(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(contract_id,tenant_id,company_id,project_id) references public.cost_workflow_contracts(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(contract_version_id,tenant_id,company_id,project_id) references public.cost_workflow_contract_versions(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(signed_contract_evidence_file_id,tenant_id,company_id,project_id) references public.cost_evidence_files(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(signed_quotation_evidence_file_id,tenant_id,company_id,project_id) references public.cost_evidence_files(id,tenant_id,company_id,project_id) on delete restrict
);
create index material_direct_authorizations_scope_idx on public.material_direct_authorizations(tenant_id,company_id,project_id,order_id);

create table public.material_contract_absorptions (
 old_installment_id uuid primary key,
 tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
 authorization_id uuid not null,
 opening_gross numeric(20,4) not null check(opening_gross >= 0),
 absorbed_at timestamptz not null default now(),
 unique(old_installment_id,tenant_id,company_id,project_id),
 foreign key(old_installment_id,tenant_id,company_id,project_id) references public.cost_workflow_installments(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(authorization_id,tenant_id,company_id,project_id) references public.material_direct_authorizations(id,tenant_id,company_id,project_id) on delete restrict
);
create index material_contract_absorptions_authority_idx on public.material_contract_absorptions(authorization_id);

alter table public.cost_workflow_installments
 add column authority_source text not null default 'manager_decision',
 add column direct_authorization_id uuid,
 alter column request_id drop not null,
 alter column decision_id drop not null,
 add constraint cost_workflow_installment_authority_source_check check (
  (authority_source='manager_decision' and request_id is not null and decision_id is not null and direct_authorization_id is null)
  or (authority_source='direct_authorization' and request_id is null and decision_id is null and direct_authorization_id is not null and contract_id is not null and contract_version_id is not null)
 ),
 add constraint cost_workflow_installment_direct_authority_fk foreign key(direct_authorization_id,tenant_id,company_id,project_id)
 references public.material_direct_authorizations(id,tenant_id,company_id,project_id) on delete restrict,
 add constraint cost_workflow_installment_direct_authority_unique unique(direct_authorization_id);

alter table public.cost_workflow_notifications
 add column authority_source text not null default 'manager_decision',
 add column direct_authorization_id uuid,
 alter column decision_id drop not null,
 add constraint cost_workflow_notification_authority_source_check check (
  (authority_source='manager_decision' and decision_id is not null and direct_authorization_id is null)
  or (authority_source='direct_authorization' and decision_id is null and direct_authorization_id is not null)
 ),
 add constraint cost_workflow_notification_direct_authority_fk foreign key(direct_authorization_id,tenant_id,company_id,project_id)
 references public.material_direct_authorizations(id,tenant_id,company_id,project_id) on delete restrict,
 add constraint cost_workflow_notification_direct_authority_unique unique(direct_authorization_id);

create table public.material_contract_source_claims (
 tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
 signed_contract_sha256 text not null check(signed_contract_sha256 ~ '^[a-f0-9]{64}$'),
 contract_id uuid not null unique, order_id uuid not null unique,
 claimed_at timestamptz not null default now(),
 primary key(tenant_id,company_id,signed_contract_sha256),
 foreign key(contract_id,tenant_id,company_id,project_id) references public.cost_workflow_contracts(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(order_id,tenant_id,company_id,project_id) references public.material_orders(id,tenant_id,company_id,project_id) on delete restrict
);

create function private.c1_material_contract_source_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare v_hash text;
begin
 for v_hash in select distinct f.verified_sha256 from public.cost_evidence_files f
  where f.id=any(new.evidence_file_ids) and f.tenant_id=new.tenant_id and f.company_id=new.company_id
  and f.status='finalized' order by f.verified_sha256
 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1-material-contract-source:'||new.tenant_id::text||':'||new.company_id::text||':'||v_hash,0));
  if exists(select 1 from public.material_contract_source_claims claim
   where claim.tenant_id=new.tenant_id and claim.company_id=new.company_id
   and claim.signed_contract_sha256=v_hash and claim.contract_id<>new.contract_id)
  then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_SOURCE_CONFLICT';end if;
 end loop;
 return new;
end;$$;
create trigger c1_material_contract_source_guard before insert on public.cost_workflow_contract_versions
for each row execute function private.c1_material_contract_source_guard();

create function private.c1_material_require_signed_file(t uuid,c uuid,p uuid,order_id uuid,file_id uuid,role text) returns text
language plpgsql stable security definer set search_path='' as $$
declare v_hash text;
begin
 select evidence.verified_sha256 into v_hash
 from public.cost_evidence_files evidence
 join public.material_evidence_scopes scope on scope.evidence_file_id=evidence.id
  and scope.tenant_id=evidence.tenant_id and scope.company_id=evidence.company_id and scope.project_id=evidence.project_id
 where evidence.id=file_id and evidence.tenant_id=t and evidence.company_id=c and evidence.project_id=p
  and evidence.status='finalized' and evidence.verified_mime_type='application/pdf'
  and scope.target_kind='material_order' and scope.order_id=order_id and scope.evidence_role=role;
 if not found or v_hash is null then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
 return v_hash;
end;$$;

create function private.c1_material_contract_ack(order_id uuid,order_version bigint,replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('resourceId',order_id,'version',order_version,'replayed',replayed,
  'contractId',link.contract_id,'authorizationId',authority.id,'installmentId',installment.id,'notificationId',notification.id)
 from public.material_order_contracts link
 join public.material_direct_authorizations authority on authority.order_id=link.order_id and authority.contract_id=link.contract_id
 join public.cost_workflow_installments installment on installment.direct_authorization_id=authority.id
 join public.cost_workflow_notifications notification on notification.direct_authorization_id=authority.id
 where link.order_id=$1;
$$;

create function public.c1_material_record_contract(
 target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,
 target_idempotency_key uuid,target_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_context jsonb;v_tenant uuid;v_actor uuid:=auth.uid();v_order public.material_orders%rowtype;
 v_contract public.cost_workflow_contracts%rowtype;v_version public.cost_workflow_contract_versions%rowtype;
 v_authority public.material_direct_authorizations%rowtype;v_installment public.cost_workflow_installments%rowtype;
 v_notification public.cost_workflow_notifications%rowtype;v_receipt public.cost_command_receipts%rowtype;
 v_expected bigint;v_cap numeric;v_scale integer;v_reference text;v_existing uuid;v_signed_id uuid;v_quote_id uuid;
 v_signed_hash text;v_quote_hash text;v_hash text;v_category uuid;v_recipient uuid;v_available boolean;
 v_opening numeric:=0;v_legacy public.cost_workflow_installments%rowtype;v_source_hash text;
begin
 v_context:=private.c1_material_context(target_company_id,'material.contract.record');
 v_tenant:=(v_context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(v_tenant,target_company_id,'material.contract.record');
 perform private.c1_workflow_require_keys(target_input,
  array['expectedOrderVersion','contractReference','signedValue','currencyCode','signedContractEvidenceFileId','signedQuotationEvidenceFileId','documentsReviewed'],
  array['expectedOrderVersion','contractReference','signedValue','currencyCode','signedContractEvidenceFileId','signedQuotationEvidenceFileId','documentsReviewed','existingContractId']);
 if target_idempotency_key is null or target_request_id is null or target_input->'documentsReviewed'<>'true'::jsonb
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_expected:=private.c1_material_version(target_input->'expectedOrderVersion');
 v_reference:=private.c1_material_short_text(target_input->'contractReference');
 v_signed_id:=private.c1_material_uuid(target_input->'signedContractEvidenceFileId');
 v_quote_id:=private.c1_material_uuid(target_input->'signedQuotationEvidenceFileId');
 if v_signed_id=v_quote_id then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if target_input ? 'existingContractId' then v_existing:=private.c1_material_uuid(target_input->'existingContractId');end if;
 select settings.money_scale into v_scale from public.company_cost_settings settings
  where settings.tenant_id=v_tenant and settings.company_id=target_company_id and settings.enabled for share;
 if not found then raise exception using errcode='P0001',message='WORKFLOW_CONFIGURATION_REQUIRED';end if;
 v_cap:=private.c1_workflow_money(target_input->'signedValue',v_scale);
 if v_cap<=0 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_material_require_project(v_tenant,target_company_id,target_project_id);
 select material_order.* into v_order from public.material_orders material_order
  where material_order.id=target_id and material_order.tenant_id=v_tenant and material_order.company_id=target_company_id
   and material_order.project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 -- Same hierarchy as order cancellation: proposal, stable lines, order, contract, windows, source.
 perform proposal.id from public.material_proposals proposal
  where proposal.id=v_order.proposal_id and proposal.tenant_id=v_tenant and proposal.company_id=target_company_id
   and proposal.project_id=target_project_id for update;
 perform line.id from public.material_proposal_lines line
  where line.proposal_id=v_order.proposal_id and line.tenant_id=v_tenant and line.company_id=target_company_id
   and line.project_id=target_project_id order by line.id for update;
 select material_order.* into v_order from public.material_orders material_order
  where material_order.id=target_id and material_order.tenant_id=v_tenant and material_order.company_id=target_company_id
   and material_order.project_id=target_project_id for update;
 v_hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);
 v_receipt:=private.c1_workflow_receipt(v_tenant,target_company_id,'material.record_contract',target_idempotency_key,v_hash);
 if v_receipt.id is not null then
  if v_receipt.result_resource_id<>v_order.id then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT';end if;
  return private.c1_material_contract_ack(v_order.id,v_receipt.result_version,true);
 end if;
 if v_order.version<>v_expected or v_order.state<>'active' or v_order.currency_code<>private.c1_workflow_text(target_input->'currencyCode')
  or exists(select 1 from public.material_order_contracts link where link.order_id=v_order.id)
 then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if not exists(select 1 from public.material_proposals proposal
  where proposal.id=v_order.proposal_id and proposal.tenant_id=v_tenant and proposal.company_id=target_company_id
   and proposal.project_id=target_project_id and proposal.review_state='approved'
   and proposal.approved_revision_id=v_order.approved_revision_id)
 then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 v_signed_hash:=private.c1_material_require_signed_file(v_tenant,target_company_id,target_project_id,v_order.id,v_signed_id,'signed_contract');
 v_quote_hash:=private.c1_material_require_signed_file(v_tenant,target_company_id,target_project_id,v_order.id,v_quote_id,'signed_quotation');
 if v_quote_hash=v_signed_hash then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
 select category.id into v_category from public.cost_categories category
  where category.tenant_id=v_tenant and category.company_id=target_company_id
   and category.code='materials' and category.is_active for share;
 if not found then raise exception using errcode='P0001',message='WORKFLOW_CONFIGURATION_REQUIRED';end if;
 select company.notification_recipient_id into v_recipient from public.cost_workflow_companies company
  where company.tenant_id=v_tenant and company.company_id=target_company_id
   and company.mode='document_backed_v1' for share;
 if v_recipient is null then raise exception using errcode='P0001',message='WORKFLOW_CONFIGURATION_REQUIRED';end if;
 if v_existing is null then
  insert into public.cost_workflow_contracts(tenant_id,company_id,project_id,party_id,reference,currency_code,created_by)
   values(v_tenant,target_company_id,target_project_id,v_order.supplier_id,v_reference,v_order.currency_code,v_actor)
   returning * into v_contract;
 else
  select contract.* into v_contract from public.cost_workflow_contracts contract
   where contract.id=v_existing and contract.tenant_id=v_tenant and contract.company_id=target_company_id
    and contract.project_id=target_project_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  select version.* into v_version from public.cost_workflow_contract_versions version
   where version.contract_id=v_contract.id and version.tenant_id=v_tenant and version.company_id=target_company_id
    and version.project_id=target_project_id and version.version=v_contract.current_version for update;
  if not found or v_contract.party_id<>v_order.supplier_id or v_contract.currency_code<>v_order.currency_code
   or v_contract.reference<>v_reference or v_version.cap<>v_cap or v_contract.source_subcontract_id is not null
   or exists(select 1 from public.material_order_contracts link where link.contract_id=v_contract.id)
   or exists(select 1 from public.material_direct_authorizations authority where authority.contract_id=v_contract.id)
  then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_MISMATCH';end if;
  if exists(select 1 from public.cost_workflow_installments installment
   join public.cost_categories category on category.id=installment.category_id and category.tenant_id=installment.tenant_id and category.company_id=installment.company_id
   where installment.contract_id=v_contract.id and installment.tenant_id=v_tenant and installment.company_id=target_company_id
    and (installment.project_id<>target_project_id or installment.party_id<>v_order.supplier_id
     or installment.currency_code<>v_order.currency_code or category.code<>'materials'
     or installment.authority_source<>'manager_decision'
     or exists(select 1 from public.material_contract_absorptions absorbed where absorbed.old_installment_id=installment.id)))
  then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_MISMATCH';end if;
  for v_legacy in select installment.* from public.cost_workflow_installments installment
   where installment.contract_id=v_contract.id and installment.tenant_id=v_tenant and installment.company_id=target_company_id
    and installment.project_id=target_project_id order by installment.id for update
  loop
   select coalesce(sum(consumption.amount),0) into v_cap from public.cost_workflow_consumptions consumption
    where consumption.installment_id=v_legacy.id;
   v_opening:=v_opening+v_cap;
  end loop;
  v_cap:=v_version.cap;
 end if;
 for v_source_hash in select distinct x.value from unnest(array[v_signed_hash,v_quote_hash]) as x(value) order by x.value loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1-material-contract-source:'||v_tenant::text||':'||target_company_id::text||':'||v_source_hash,0));
 end loop;
 if exists(select 1 from public.material_contract_source_claims claim where claim.tenant_id=v_tenant
  and claim.company_id=target_company_id and claim.signed_contract_sha256=v_signed_hash)
 then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_SOURCE_CONFLICT';end if;
 if exists(select 1 from public.cost_workflow_contract_versions version
  join public.cost_evidence_files evidence on evidence.id=any(version.evidence_file_ids)
   and evidence.tenant_id=version.tenant_id and evidence.company_id=version.company_id
  where version.tenant_id=v_tenant and version.company_id=target_company_id
   and evidence.verified_sha256=v_signed_hash and (v_existing is null or version.contract_id<>v_existing))
 then raise exception using errcode='P0001',message='MATERIAL_CONTRACT_SOURCE_CONFLICT';end if;
 if v_existing is null then
  insert into public.cost_workflow_contract_versions(tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by)
   values(v_tenant,target_company_id,target_project_id,v_contract.id,1,v_cap,array[v_signed_id,v_quote_id],
    'reviewed_reference',v_actor) returning * into v_version;
 end if;
 if v_opening>v_cap then raise exception using errcode='P0001',message='CASH_AUTHORITY_EXCEEDED';end if;
 insert into public.material_order_contracts(order_id,tenant_id,company_id,project_id,contract_id,created_by)
  values(v_order.id,v_tenant,target_company_id,target_project_id,v_contract.id,v_actor);
 insert into public.material_direct_authorizations(tenant_id,company_id,project_id,order_id,contract_id,contract_version_id,
  signed_value,currency_code,signed_contract_evidence_file_id,signed_quotation_evidence_file_id,signed_contract_sha256,recorded_by)
  values(v_tenant,target_company_id,target_project_id,v_order.id,v_contract.id,v_version.id,v_cap,v_order.currency_code,
   v_signed_id,v_quote_id,v_signed_hash,v_actor) returning * into v_authority;
 insert into public.material_contract_source_claims(tenant_id,company_id,project_id,signed_contract_sha256,contract_id,order_id)
  values(v_tenant,target_company_id,target_project_id,v_signed_hash,v_contract.id,v_order.id);
 if v_existing is not null then
  insert into public.material_contract_absorptions(old_installment_id,tenant_id,company_id,project_id,authorization_id,opening_gross)
   select installment.id,v_tenant,target_company_id,target_project_id,v_authority.id,
    coalesce((select sum(consumption.amount) from public.cost_workflow_consumptions consumption where consumption.installment_id=installment.id),0)
   from public.cost_workflow_installments installment
   where installment.contract_id=v_contract.id and installment.tenant_id=v_tenant and installment.company_id=target_company_id
    and installment.project_id=target_project_id order by installment.id;
 end if;
 insert into public.cost_workflow_installments(tenant_id,company_id,project_id,request_id,decision_id,contract_id,contract_version_id,
  party_id,category_id,authorized_amount,currency_code,approved_at,authority_source,direct_authorization_id)
  values(v_tenant,target_company_id,target_project_id,null,null,v_contract.id,v_version.id,v_order.supplier_id,v_category,
   v_cap,v_order.currency_code,now(),'direct_authorization',v_authority.id) returning * into v_installment;
 v_available:=private.c1_workflow_user_has_permission(v_tenant,target_company_id,v_recipient,'cost.notification.read');
 insert into public.cost_workflow_notifications(tenant_id,company_id,project_id,decision_id,recipient_id,delivery_state,
  authority_source,direct_authorization_id)
  values(v_tenant,target_company_id,target_project_id,null,v_recipient,case when v_available then 'available' else 'undelivered' end,
   'direct_authorization',v_authority.id) returning * into v_notification;
 update public.material_orders material_order set version=material_order.version+1,updated_at=now()
  where material_order.id=v_order.id returning * into v_order;
 perform private.c1_workflow_record_command(v_tenant,target_company_id,'material.record_contract',target_idempotency_key,v_hash,
  v_order.id,v_order.version,target_request_id,jsonb_build_object('projectId',target_project_id,'contractId',v_contract.id,
   'authorizationId',v_authority.id,'installmentId',v_installment.id,'notificationId',v_notification.id,
   'openingGross',v_opening::text,'signedValue',v_cap::text));
 return private.c1_material_contract_ack(v_order.id,v_order.version,false);
end;$$;

create function public.c1_material_list_eligible_contracts(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_order public.material_orders%rowtype;v_result jsonb;
begin
 v_context:=private.c1_material_context(target_company_id,'material.read');
 v_tenant:=(v_context->>'tenantId')::uuid;
 if not private.c1_material_actor_has_permission(v_tenant,target_company_id,'material.contract.record')
 then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select material_order.* into v_order from public.material_orders material_order
  where material_order.id=target_id and material_order.tenant_id=v_tenant
   and material_order.company_id=target_company_id and material_order.project_id=target_project_id
   and material_order.state='active';
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',contract.id,'reference',contract.reference,
  'cap',version.cap::text,'currencyCode',contract.currency_code) order by contract.reference,contract.id),'[]'::jsonb)
 into v_result from public.cost_workflow_contracts contract
 join public.cost_workflow_contract_versions version on version.contract_id=contract.id
  and version.tenant_id=contract.tenant_id and version.company_id=contract.company_id
  and version.project_id=contract.project_id and version.version=contract.current_version
 where contract.tenant_id=v_tenant and contract.company_id=target_company_id and contract.project_id=target_project_id
  and contract.party_id=v_order.supplier_id and contract.currency_code=v_order.currency_code
  and contract.source_subcontract_id is null and version.cap>0
  and not exists(select 1 from public.material_order_contracts link where link.contract_id=contract.id)
  and not exists(select 1 from public.material_direct_authorizations authority where authority.contract_id=contract.id)
  and not exists(select 1 from public.cost_workflow_installments installment
   join public.cost_categories category on category.id=installment.category_id
    and category.tenant_id=installment.tenant_id and category.company_id=installment.company_id
   where installment.contract_id=contract.id and installment.tenant_id=v_tenant and installment.company_id=target_company_id
    and (installment.project_id<>target_project_id or installment.party_id<>v_order.supplier_id
     or installment.currency_code<>v_order.currency_code or category.code<>'materials'
     or installment.authority_source<>'manager_decision'
     or exists(select 1 from public.material_contract_absorptions absorbed where absorbed.old_installment_id=installment.id)));
 return v_result;
end;$$;

-- Preserve the T4 order projection verbatim and layer only signed cash facts.
do $$
declare v_definition text;
begin
 select pg_get_functiondef('private.c1_material_order_json(uuid,uuid,uuid,uuid)'::regprocedure) into v_definition;
 if position('private.c1_material_order_json(' in v_definition)=0
 then raise exception using errcode='P0001',message='MATERIAL_ORDER_PROJECTION_DRIFT';end if;
 execute replace(v_definition,'private.c1_material_order_json(','private.c1_material_order_json_base(');
end $$;

create or replace function private.c1_material_order_json(t uuid,c uuid,p uuid,order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb;v_authority public.material_direct_authorizations%rowtype;v_installment public.cost_workflow_installments%rowtype;
 v_opening numeric;v_paid numeric;v_version bigint;
begin
 v_base:=private.c1_material_order_json_base(t,c,p,order_id);
 select authority.* into v_authority from public.material_direct_authorizations authority
  where authority.order_id=order_id and authority.tenant_id=t and authority.company_id=c and authority.project_id=p;
 if not found then
  return jsonb_set(v_base,'{cash}',jsonb_build_object('grossPaid','0.0000','availableToPay','0.0000','installmentVersion',null));
 end if;
 select installment.* into v_installment from public.cost_workflow_installments installment
  where installment.direct_authorization_id=v_authority.id and installment.tenant_id=t
   and installment.company_id=c and installment.project_id=p;
 select coalesce(sum(absorbed.opening_gross),0) into v_opening from public.material_contract_absorptions absorbed
  where absorbed.authorization_id=v_authority.id;
 select count(*),coalesce(sum(consumption.amount),0) into v_version,v_paid from public.cost_workflow_consumptions consumption
  where consumption.installment_id=v_installment.id;
 v_paid:=v_opening+v_paid;
 v_base:=jsonb_set(v_base,'{contract}',jsonb_build_object('id',v_authority.contract_id,
  'signedValue',v_authority.signed_value::text,'currencyCode',v_authority.currency_code,
  'authorizationId',v_authority.id,'installmentId',v_installment.id));
 return jsonb_set(v_base,'{cash}',jsonb_build_object('grossPaid',v_paid::numeric(20,4)::text,
  'availableToPay',(v_authority.signed_value-v_paid)::numeric(20,4)::text,'installmentVersion',v_version));
end;$$;

alter table public.material_direct_authorizations enable row level security;
alter table public.material_direct_authorizations force row level security;
revoke all on public.material_direct_authorizations from public,anon,authenticated,service_role;
grant select on public.material_direct_authorizations to authenticated;
create policy material_direct_authorizations_read on public.material_direct_authorizations for select to authenticated
using(private.c1_material_can_read_order(tenant_id,company_id,project_id));
create trigger material_direct_authorizations_immutable before update or delete on public.material_direct_authorizations
for each row execute function private.c1_material_retain_history();

alter table public.material_contract_absorptions enable row level security;
alter table public.material_contract_absorptions force row level security;
revoke all on public.material_contract_absorptions from public,anon,authenticated,service_role;
grant select on public.material_contract_absorptions to authenticated;
create policy material_contract_absorptions_read on public.material_contract_absorptions for select to authenticated
using(private.c1_material_can_read_order(tenant_id,company_id,project_id));
create trigger material_contract_absorptions_immutable before update or delete on public.material_contract_absorptions
for each row execute function private.c1_material_retain_history();

alter table public.material_contract_source_claims enable row level security;
alter table public.material_contract_source_claims force row level security;
revoke all on public.material_contract_source_claims from public,anon,authenticated,service_role;
create trigger material_contract_source_claims_immutable before update or delete on public.material_contract_source_claims
for each row execute function private.c1_material_retain_history();

revoke all on function private.c1_material_contract_source_guard() from public,anon,authenticated,service_role;
revoke all on function private.c1_material_require_signed_file(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.c1_material_contract_ack(uuid,bigint,boolean) from public,anon,authenticated,service_role;
revoke all on function private.c1_material_order_json_base(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_material_list_eligible_contracts(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;
grant execute on function public.c1_material_list_eligible_contracts(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
