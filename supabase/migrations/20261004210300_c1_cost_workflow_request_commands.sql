set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,31);
alter table public.cost_workflow_contracts add column source_subcontract_id uuid;
alter table public.cost_workflow_contract_versions add column approval_decision_id uuid;
alter table public.cost_workflow_contract_versions add constraint c1_workflow_contract_decision_fk foreign key(approval_decision_id,tenant_id,company_id,project_id) references public.cost_workflow_decisions(id,tenant_id,company_id,project_id) on delete restrict;
alter table public.cost_workflow_contract_versions add constraint c1_workflow_contract_decision_shape check((basis_state='reviewed_reference' and approval_decision_id is null) or (basis_state='approved_adjustment' and approval_decision_id is not null));
create unique index c1_workflow_one_contract_decision on public.cost_workflow_contract_versions(approval_decision_id) where approval_decision_id is not null;
alter table public.cost_workflow_contracts add constraint c1_workflow_canonical_subcontract_fk
 foreign key(source_subcontract_id,tenant_id,company_id,project_id,currency_code)
 references public.project_subcontracts(id,tenant_id,company_id,project_id,currency_code) on delete restrict;
create unique index c1_workflow_one_canonical_subcontract on public.cost_workflow_contracts(source_subcontract_id) where source_subcontract_id is not null;
create unique index c1_workflow_contract_reference on public.cost_workflow_contracts(tenant_id,company_id,project_id,reference);

create function private.c1_workflow_require_keys(input jsonb,required text[],allowed text[]) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(input) is distinct from 'object' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if not(input ?& required) or exists(select 1 from jsonb_object_keys(input) k where not(k=any(allowed))) then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
end;$$;
create function private.c1_workflow_money(input jsonb,money_scale integer) returns numeric
language plpgsql immutable set search_path='' as $$
declare amount numeric;
begin
 if jsonb_typeof(input) is distinct from 'string' or input#>>'{}' !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 amount:=(input#>>'{}')::numeric;
 if money_scale is null or money_scale not between 0 and 4 or amount<>round(amount,money_scale) then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 return amount;
end;$$;
create function private.c1_workflow_text(input jsonb) returns text language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(input) is distinct from 'string' or btrim(input#>>'{}')='' or length(input#>>'{}')>2000 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 return btrim(input#>>'{}');
end;$$;
create function private.c1_workflow_date(input jsonb) returns date language plpgsql immutable set search_path='' as $$
declare value text;result date;
begin
 value:=private.c1_workflow_text(input);
 if value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 begin result:=value::date;exception when others then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 if to_char(result,'YYYY-MM-DD')<>value then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 return result;
end;$$;
create function private.c1_workflow_evidence_ids(input jsonb) returns uuid[] language plpgsql immutable set search_path='' as $$
declare result uuid[];
begin
 if jsonb_typeof(input) is distinct from 'array' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 begin
  if exists(select 1 from jsonb_array_elements(input) v where jsonb_typeof(v) is distinct from 'string') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  select array_agg(value::uuid order by ordinality) into result from jsonb_array_elements_text(input) with ordinality;
 exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 return result;
end;$$;
create function private.c1_workflow_user_has_permission(t uuid,c uuid,u uuid,permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_memberships m
 join auth.users account on account.id=m.user_id and (account.banned_until is null or account.banned_until<=now())
 join public.company_role_assignments a on a.tenant_id=m.tenant_id and a.company_id=m.company_id and a.user_id=m.user_id and a.revoked_at is null
 join public.roles r on r.id=a.role_id and r.tenant_id=a.tenant_id and r.company_id=a.company_id and r.is_active
 join public.role_permissions rp on rp.role_id=r.id
 where m.tenant_id=t and m.company_id=c and m.user_id=u and m.is_active and rp.permission_code=permission);
$$;
create function private.c1_workflow_lock_actor(t uuid,c uuid,permission text) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.company_memberships m where m.tenant_id=t and m.company_id=c and m.user_id=auth.uid() and m.is_active for share;
 if not found then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 perform 1 from public.company_role_assignments a where a.tenant_id=t and a.company_id=c and a.user_id=auth.uid() and a.revoked_at is null order by a.id for share;
 if not private.c1_workflow_user_has_permission(t,c,auth.uid(),permission) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
end;$$;
create function private.c1_workflow_lock_assignment(t uuid,c uuid,p uuid) returns public.cost_workflow_manager_assignments
language plpgsql volatile security definer set search_path='' as $$
declare assignment public.cost_workflow_manager_assignments%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cost_workflow.assignment:'||t::text||':'||c::text||':'||p::text,0));
 select * into assignment from public.cost_workflow_manager_assignments where tenant_id=t and company_id=c and project_id=p order by assignment_version desc limit 1;
 return assignment;
end;$$;
create function private.c1_workflow_hash(p uuid,id uuid,input jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('projectId',p,'id',id,'input',input)),'UTF8'),'sha256'),'hex');
$$;
create function private.c1_workflow_receipt(t uuid,c uuid,command text,key uuid,hash text) returns public.cost_command_receipts
language plpgsql volatile security definer set search_path='' as $$
declare receipt public.cost_command_receipts%rowtype;
begin
 if key is null then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 receipt:=private.c1_detail_receipt(t,c,auth.uid(),command,key,hash);
 return receipt;
end;$$;
create function private.c1_workflow_record_command(t uuid,c uuid,command text,key uuid,hash text,id uuid,version bigint,request_id uuid,summary jsonb)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if request_id is null then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
 values(t,c,auth.uid(),command,key,hash,id,version);
 insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary)
 values(t,c,auth.uid(),command,'cost_workflow',id::text,request_id,summary);
end;$$;
create function private.c1_workflow_validate_basis(input jsonb,category text) returns void
language plpgsql immutable set search_path='' as $$
declare row jsonb;kind text;
begin
 kind:=private.c1_workflow_text(input->'kind');
 if (case kind when 'subcontract' then 'subcontract_labor' else kind end) is distinct from category then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if kind in('materials','machinery','other') then
  perform private.c1_workflow_require_keys(input,case when kind='materials' then array['kind','lines','deliverySite'] else array['kind','lines'] end,case when kind='materials' then array['kind','lines','deliverySite'] else array['kind','lines'] end);
  if jsonb_typeof(input->'lines') is distinct from 'array' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  if jsonb_array_length(input->'lines') not between 1 and 1000 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  if kind='materials' then perform private.c1_workflow_text(input->'deliverySite');end if;
  for row in select value from jsonb_array_elements(input->'lines') loop
   perform private.c1_workflow_require_keys(row,array['description','quantity','unit','unitPrice'],array['description','quantity','unit','unitPrice']);
   perform private.c1_workflow_text(row->'description');perform private.c1_workflow_text(row->'unit');
   perform private.c1_workflow_money(row->'quantity',4);perform private.c1_workflow_money(row->'unitPrice',4);
  end loop;
 elsif kind='direct_labor' then
  perform private.c1_workflow_require_keys(input,array['kind','weekStart','workers'],array['kind','weekStart','workers']);
  perform private.c1_workflow_date(input->'weekStart');
  if jsonb_typeof(input->'workers') is distinct from 'array' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  if jsonb_array_length(input->'workers') not between 1 and 1000 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  for row in select value from jsonb_array_elements(input->'workers') loop
   perform private.c1_workflow_require_keys(row,array['workerReference','days','dailyRate','allowance'],array['workerReference','days','dailyRate','allowance']);
   perform private.c1_workflow_text(row->'workerReference');perform private.c1_workflow_money(row->'days',4);
   perform private.c1_workflow_money(row->'dailyRate',4);perform private.c1_workflow_money(row->'allowance',4);
  end loop;
 elsif kind='subcontract' then
  perform private.c1_workflow_require_keys(input,array['kind','subcontractId','acceptanceReference','retentionAmount'],array['kind','subcontractId','acceptanceReference','retentionAmount']);
  perform private.c1_workflow_text(input->'acceptanceReference');perform private.c1_workflow_money(input->'retentionAmount',4);
  if jsonb_typeof(input->'subcontractId') is distinct from 'string' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  begin perform (input->>'subcontractId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 else raise exception using errcode='P0001',message='INPUT_INVALID';end if;
end;$$;

revoke all on function private.c1_workflow_require_keys(jsonb,text[],text[]),
private.c1_workflow_money(jsonb,integer),
private.c1_workflow_text(jsonb),
private.c1_workflow_date(jsonb),
private.c1_workflow_evidence_ids(jsonb),
private.c1_workflow_user_has_permission(uuid,uuid,uuid,text),
private.c1_workflow_lock_actor(uuid,uuid,text),
private.c1_workflow_lock_assignment(uuid,uuid,uuid),
private.c1_workflow_hash(uuid,uuid,jsonb),
private.c1_workflow_receipt(uuid,uuid,text,uuid,text),
private.c1_workflow_record_command(uuid,uuid,text,uuid,text,uuid,bigint,uuid,jsonb),
private.c1_workflow_validate_basis(jsonb,text) from public,anon,authenticated,service_role;

create function private.c1_workflow_validate_request(t uuid,c uuid,p uuid,input jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare scale integer;currency text;party public.business_parties%rowtype;category public.cost_categories%rowtype;
 crew text;ids uuid[];contract public.cost_workflow_contracts%rowtype;basis_version public.cost_workflow_contract_versions%rowtype;given_version uuid;amount numeric;source_id uuid;
begin
 perform private.c1_workflow_require_keys(input,array['partyId','partyKind','categoryId','amount','currencyCode','basis','evidenceFileIds'],array['partyId','partyKind','crewOwnership','categoryId','contractVersionId','amount','currencyCode','basis','evidenceFileIds']);
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
    join public.cost_evidence_files selected on selected.id=any(ids) and selected.verified_sha256=known.verified_sha256
    join public.cost_workflow_contracts identified on identified.id=v.contract_id and identified.party_id=party.id
    where v.tenant_id=t and v.company_id=c and v.project_id=p and category.code<>'direct_labor')
  then raise exception using errcode='P0001',message='CONTRACT_BASIS_REQUIRED';end if;
 end if;
 if contract.id is not null and (contract.party_id<>party.id or contract.currency_code<>currency or (source_id is not null and contract.source_subcontract_id is distinct from source_id))
 then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return jsonb_build_object('partyId',party.id,'categoryId',category.id,'contractId',contract.id,'contractVersionId',given_version,'amount',amount::text,'currencyCode',currency,'evidenceFileIds',ids);
end;$$;
create function private.c1_workflow_require_cap(t uuid,c uuid,p uuid,contract_id uuid,proposed numeric) returns void
language plpgsql volatile security definer set search_path='' as $$
declare contract public.cost_workflow_contracts%rowtype;cap numeric;authorized numeric;
begin
 if contract_id is null then return;end if;
 select * into contract from public.cost_workflow_contracts where id=contract_id and tenant_id=t and company_id=c and project_id=p for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 -- Existing source cash must be reconciled before it can demonstrate remaining cap.
 if contract.source_subcontract_id is not null and exists(select 1 from public.project_subcontract_payments old
   where old.project_subcontract_id=contract.source_subcontract_id and old.status='recorded'
   and not exists(select 1 from public.cost_workflow_payments mapped where mapped.subcontract_payment_id=old.id))
 then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 select v.cap into cap from public.cost_workflow_contract_versions v where v.contract_id=contract.id and v.version=contract.current_version;
 select coalesce(sum(i.authorized_amount),0) into authorized from public.cost_workflow_installments i where i.contract_id=contract.id and i.tenant_id=t and i.company_id=c and i.project_id=p;
 if cap is null or authorized+proposed>cap then raise exception using errcode='P0001',message='CONTRACT_CAP_EXCEEDED';end if;
end;$$;

create function public.c1_workflow_assign_manager(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;current_assignment public.cost_workflow_manager_assignments%rowtype;created public.cost_workflow_manager_assignments%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;manager uuid;expected bigint;reason text;
begin
 context:=private.c1_master_context(target_company_id,'project.cost_manager.assign');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'project.cost_manager.assign');
 if not private.c1_workflow_is_director(t,target_company_id) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 perform 1 from public.projects where id=target_project_id and tenant_id=t and company_id=target_company_id for share;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 current_assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 perform private.c1_workflow_require_keys(target_input,array['managerUserId','expectedAssignmentVersion','reason'],array['managerUserId','expectedAssignmentVersion','reason']);
 expected:=private.c1_detail_expected_version(jsonb_build_object('expectedVersion',target_input->'expectedAssignmentVersion'));reason:=private.c1_workflow_text(target_input->'reason');
 begin manager:=(target_input->>'managerUserId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 hash:=private.c1_workflow_hash(target_project_id,null,target_input);
 receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.assign_manager',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('assignmentId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 if coalesce(current_assignment.assignment_version,0)<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 perform 1 from public.company_memberships m where m.tenant_id=t and m.company_id=target_company_id and m.user_id=manager and m.is_active for share;
 if not found or not private.c1_workflow_user_has_permission(t,target_company_id,manager,'cost.request.decide') then raise exception using errcode='P0001',message='MANAGER_INELIGIBLE';end if;
 insert into public.cost_workflow_manager_assignments(tenant_id,company_id,project_id,manager_user_id,assignment_version,assigned_by,reason)
 values(t,target_company_id,target_project_id,manager,expected+1,auth.uid(),reason) returning * into created;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.assign_manager',target_idempotency_key,hash,created.id,created.assignment_version,target_request_id,jsonb_build_object('projectId',target_project_id,'previousAssignmentId',current_assignment.id,'managerUserId',manager,'reason',reason));
 return jsonb_build_object('assignmentId',created.id,'version',created.assignment_version,'replayed',false);
end;$$;

-- Only explicit contract/quotation originals identify a hard-cap basis.
-- Invoices, acceptance and other supporting originals may be shared legitimately.
create function private.c1_workflow_primary_basis_hashes(t uuid,c uuid,p uuid,ids uuid[]) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare hashes text[];
begin
 select array_agg(distinct f.verified_sha256 order by f.verified_sha256) into hashes
 from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized'
 and (f.workflow_evidence_kind in('contract','quotation') or exists(select 1 from public.cost_evidence_links l where l.evidence_file_id=f.id and l.tenant_id=t and l.company_id=c and l.project_id=p and l.evidence_kind='contract'));
 return coalesce(hashes,array[]::text[]);
end;$$;
revoke all on function private.c1_workflow_primary_basis_hashes(uuid,uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
create function public.c1_workflow_create_contract_basis(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;receipt public.cost_command_receipts%rowtype;hash text;
 contract public.cost_workflow_contracts%rowtype;basis public.cost_workflow_contract_versions%rowtype;source public.project_subcontracts%rowtype;
 party uuid;source_id uuid;ids uuid[];scale integer;currency text;basis_reference text;cap numeric;original_hashes text[];candidate_count integer;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.submit');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 perform private.c1_workflow_require_keys(target_input,array['partyId','reference','referenceAmount','currencyCode','evidenceFileIds'],array['partyId','sourceSubcontractId','reference','referenceAmount','currencyCode','evidenceFileIds']);
 select s.money_scale,s.default_currency_code into scale,currency from public.company_cost_settings s where s.tenant_id=t and s.company_id=target_company_id and s.enabled for share;
 cap:=private.c1_workflow_money(target_input->'referenceAmount',scale);basis_reference:=private.c1_workflow_text(target_input->'reference');
 if private.c1_workflow_text(target_input->'currencyCode')<>currency then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 ids:=private.c1_workflow_evidence_ids(target_input->'evidenceFileIds');perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,ids);
 begin party:=(target_input->>'partyId')::uuid;source_id:=(target_input->>'sourceSubcontractId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 if not exists(select 1 from public.business_parties p where p.id=party and p.tenant_id=t and p.company_id=target_company_id and p.is_active) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 hash:=private.c1_workflow_hash(target_project_id,null,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.contract_basis',target_idempotency_key,hash);
 if receipt.id is not null then
  select * into basis from public.cost_workflow_contract_versions where contract_id=receipt.result_resource_id and version=receipt.result_version;
  return jsonb_build_object('contractId',receipt.result_resource_id,'contractVersionId',basis.id,'version',receipt.result_version,'replayed',true);
 end if;
 if source_id is not null then
  select * into source from public.project_subcontracts where id=source_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and subcontractor_party_id=party and currency_code=currency and is_active for share;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  if source.contract_value is not null and source.contract_value<>cap then raise exception using errcode='P0001',message='CONTRACT_REFERENCE_CONFLICT';end if;
 end if;
 original_hashes:=private.c1_workflow_primary_basis_hashes(t,target_company_id,target_project_id,ids);
 if source_id is null and cardinality(original_hashes)=0 then raise exception using errcode='P0001',message='CONTRACT_BASIS_REQUIRED';end if;
 -- The assignment mutex serializes identity lookup and insertion in this project.
 -- A changed free-text reference or re-uploaded original cannot open another cap.
 select count(*) into candidate_count from public.cost_workflow_contracts identified
 where identified.tenant_id=t and identified.company_id=target_company_id and identified.project_id=target_project_id
 and (identified.reference=basis_reference or (source_id is not null and identified.source_subcontract_id=source_id)
 or exists(select 1 from public.cost_workflow_contract_versions v join public.cost_evidence_files known on known.id=any(v.evidence_file_ids)
 where v.contract_id=identified.id and v.tenant_id=t and v.company_id=target_company_id and v.project_id=target_project_id
 and known.tenant_id=t and known.company_id=target_company_id and known.project_id=target_project_id and known.verified_sha256=any(original_hashes)));
 if candidate_count>1 then raise exception using errcode='P0001',message='CONTRACT_REFERENCE_CONFLICT';end if;
 select * into contract from public.cost_workflow_contracts identified
 where identified.tenant_id=t and identified.company_id=target_company_id and identified.project_id=target_project_id
 and (identified.reference=basis_reference or (source_id is not null and identified.source_subcontract_id=source_id)
 or exists(select 1 from public.cost_workflow_contract_versions v join public.cost_evidence_files known on known.id=any(v.evidence_file_ids)
 where v.contract_id=identified.id and v.tenant_id=t and v.company_id=target_company_id and v.project_id=target_project_id
 and known.tenant_id=t and known.company_id=target_company_id and known.project_id=target_project_id and known.verified_sha256=any(original_hashes))) for update;

 -- Identical reviewed references reuse their original identity; ambiguity requires review.
 if found then
  select * into basis from public.cost_workflow_contract_versions where contract_id=contract.id and version=1;
  if basis.id is null or contract.party_id<>party or contract.reference<>basis_reference or contract.currency_code<>currency or contract.source_subcontract_id is distinct from source_id or basis.cap<>cap or cardinality(basis.evidence_file_ids)<>cardinality(ids) or not(basis.evidence_file_ids @> ids) then raise exception using errcode='P0001',message='CONTRACT_REFERENCE_CONFLICT';end if;
  perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.contract_basis',target_idempotency_key,hash,contract.id,1,target_request_id,jsonb_build_object('reused',true));
  return jsonb_build_object('contractId',contract.id,'contractVersionId',basis.id,'version',1,'replayed',false);
 end if;
 insert into public.cost_workflow_contracts(tenant_id,company_id,project_id,party_id,reference,currency_code,source_subcontract_id,created_by)
 values(t,target_company_id,target_project_id,party,basis_reference,currency,source_id,auth.uid()) returning * into contract;
 insert into public.cost_workflow_contract_versions(tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by)
 values(t,target_company_id,target_project_id,contract.id,1,cap,ids,'reviewed_reference',auth.uid()) returning * into basis;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.contract_basis',target_idempotency_key,hash,contract.id,1,target_request_id,jsonb_build_object('projectId',target_project_id,'partyId',party,'cap',cap::text,'reference',basis_reference,'sourceSubcontractId',source_id));
 return jsonb_build_object('contractId',contract.id,'contractVersionId',basis.id,'version',1,'replayed',false);
end;$$;

create function public.c1_workflow_create_request(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;meta jsonb;request public.cost_workflow_requests%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.submit');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');perform private.c1_workflow_project_state(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 meta:=private.c1_workflow_validate_request(t,target_company_id,target_project_id,target_input);
 hash:=private.c1_workflow_hash(target_project_id,null,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.create_request',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('requestId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 insert into public.cost_workflow_requests(tenant_id,company_id,project_id,kind,party_id,category_id,contract_id,working_input,created_by)
 values(t,target_company_id,target_project_id,'installment',(meta->>'partyId')::uuid,(meta->>'categoryId')::uuid,(meta->>'contractId')::uuid,target_input,auth.uid()) returning * into request;
 insert into public.cost_workflow_request_evidence(tenant_id,company_id,project_id,request_id,request_version,evidence_file_id,evidence_kind,created_by)
 select t,target_company_id,target_project_id,request.id,0,f.id,coalesce(f.workflow_evidence_kind,'accounting_support'),auth.uid()
 from public.cost_evidence_files f where f.id=any(private.c1_workflow_evidence_ids(target_input->'evidenceFileIds')) and f.tenant_id=t and f.company_id=target_company_id and f.project_id=target_project_id;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.create_request',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('projectId',target_project_id,'partyId',request.party_id,'state','working'));
 return jsonb_build_object('requestId',request.id,'version',request.version,'replayed',false);
end;$$;

create function public.c1_workflow_update_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;meta jsonb;request public.cost_workflow_requests%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;expected bigint;input jsonb;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.submit');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');perform private.c1_workflow_project_state(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 expected:=private.c1_detail_expected_version(target_input);input:=target_input-'expectedVersion';
 meta:=private.c1_workflow_validate_request(t,target_company_id,target_project_id,input);
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.update_request',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('requestId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not found or request.kind<>'installment' then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if request.version<>expected or request.state not in('working','returned') then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 update public.cost_workflow_requests set party_id=(meta->>'partyId')::uuid,category_id=(meta->>'categoryId')::uuid,contract_id=(meta->>'contractId')::uuid,working_input=input,version=version+1,updated_at=now() where id=request.id returning * into request;
 insert into public.cost_workflow_request_evidence(tenant_id,company_id,project_id,request_id,request_version,evidence_file_id,evidence_kind,created_by)
 select t,target_company_id,target_project_id,request.id,request.version,f.id,coalesce(f.workflow_evidence_kind,'accounting_support'),auth.uid()
 from public.cost_evidence_files f where f.id=any(private.c1_workflow_evidence_ids(input->'evidenceFileIds')) and f.tenant_id=t and f.company_id=target_company_id and f.project_id=target_project_id;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.update_request',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('projectId',target_project_id,'version',request.version,'state',request.state));
 return jsonb_build_object('requestId',request.id,'version',request.version,'replayed',false);
end;$$;

create function public.c1_workflow_submit_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;meta jsonb;request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;expected bigint;next_snapshot bigint;
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
 select coalesce(max(version),0)+1 into next_snapshot from public.cost_workflow_request_versions where request_id=request.id;
 insert into public.cost_workflow_request_versions(tenant_id,company_id,project_id,request_id,version,snapshot,amount,currency_code,evidence_file_ids,manager_assignment_id,submitted_by)
 values(t,target_company_id,target_project_id,request.id,next_snapshot,request.working_input,(meta->>'amount')::numeric,meta->>'currencyCode',private.c1_workflow_evidence_ids(request.working_input->'evidenceFileIds'),assignment.id,auth.uid()) returning * into snapshot;
 update public.cost_workflow_requests set state='submitted',submitted_version_id=snapshot.id,version=version+1,updated_at=now() where id=request.id returning * into request;
 insert into public.cost_workflow_request_evidence(tenant_id,company_id,project_id,request_id,request_version,evidence_file_id,evidence_kind,created_by)
 select t,target_company_id,target_project_id,request.id,request.version,f.id,coalesce(f.workflow_evidence_kind,'accounting_support'),auth.uid() from public.cost_evidence_files f where f.id=any(snapshot.evidence_file_ids) and f.tenant_id=t and f.company_id=target_company_id and f.project_id=target_project_id;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.submit_request',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('projectId',target_project_id,'submittedVersionId',snapshot.id,'assignmentId',assignment.id));
 return jsonb_build_object('requestId',request.id,'version',request.version,'replayed',false);
end;$$;

create function private.c1_workflow_notify_director(t uuid,c uuid,p uuid,decision_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare recipient uuid;available boolean;
begin
 select notification_recipient_id into recipient from public.cost_workflow_companies where tenant_id=t and company_id=c;
 if recipient is null then raise exception using errcode='P0001',message='WORKFLOW_CONFIGURATION_REQUIRED';end if;
 available:=private.c1_workflow_user_has_permission(t,c,recipient,'cost.notification.read');
 insert into public.cost_workflow_notifications(tenant_id,company_id,project_id,decision_id,recipient_id,delivery_state)
 values(t,c,p,decision_id,recipient,case when available then 'available' else 'undelivered' end);
end;$$;

create function public.c1_workflow_decide_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
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
  select * into basis from public.cost_workflow_contract_versions where contract_id=contract.id and version=contract.current_version;
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

create function private.c1_workflow_project_state(t uuid,c uuid,p uuid) returns text
language plpgsql volatile security definer set search_path='' as $$
declare state text;
begin
 select operational_state into state from public.projects where id=p and tenant_id=t and company_id=c for share;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return state;
end;$$;
revoke all on function private.c1_workflow_project_state(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Fresh account state accompanies company permission checks, including direct RLS reads.
create function private.c1_workflow_actor_has_permission(t uuid,c uuid,permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.c1_workflow_user_has_permission(t,c,auth.uid(),permission);
$$;
create or replace function private.c1_workflow_context(target_company_id uuid,target_permission text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb;
begin
 context:=private.c1_master_context(target_company_id,target_permission);
 if not private.c1_workflow_actor_has_permission((context->>'tenantId')::uuid,target_company_id,target_permission)
 or (context->>'actorId')::uuid is distinct from auth.uid() then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if not exists(select 1 from public.cost_workflow_companies w where w.tenant_id=(context->>'tenantId')::uuid and w.company_id=target_company_id and w.mode='document_backed_v1')
 then raise exception using errcode='P0001',message='WORKFLOW_NOT_ACTIVE';end if;
 return context;
end;$$;
create or replace function private.c1_workflow_is_current_manager(target_tenant_id uuid,target_company_id uuid,target_project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.c1_workflow_actor_has_permission(target_tenant_id,target_company_id,'cost.request.decide')
 and coalesce((select a.manager_user_id from public.cost_workflow_manager_assignments a where a.tenant_id=target_tenant_id and a.company_id=target_company_id and a.project_id=target_project_id order by a.assignment_version desc limit 1)=auth.uid(),false);
$$;
create or replace function private.c1_workflow_is_director(target_tenant_id uuid,target_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.c1_workflow_actor_has_permission(target_tenant_id,target_company_id,'project.cost_manager.assign')
 and exists(select 1 from public.cost_workflow_companies w where w.tenant_id=target_tenant_id and w.company_id=target_company_id and w.notification_recipient_id=auth.uid());
$$;
create or replace function private.c1_workflow_can_read(target_tenant_id uuid,target_company_id uuid,target_project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.c1_workflow_actor_has_permission(target_tenant_id,target_company_id,'cost.request.read')
 and (private.c1_workflow_actor_has_permission(target_tenant_id,target_company_id,'cost.request.submit') or private.c1_workflow_is_current_manager(target_tenant_id,target_company_id,target_project_id) or private.c1_workflow_is_director(target_tenant_id,target_company_id));
$$;
alter policy cost_workflow_companies_read on public.cost_workflow_companies using(private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.request.read') or private.c1_workflow_is_director(tenant_id,company_id));
alter policy cost_workflow_party_classifications_read on public.cost_workflow_party_classifications using(private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.party.read'));
alter policy cost_workflow_notifications_read on public.cost_workflow_notifications using(recipient_id=auth.uid() and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.notification.read'));

create function private.c1_workflow_lock_manager(t uuid,c uuid,p uuid) returns public.cost_workflow_manager_assignments
language plpgsql volatile security definer set search_path='' as $$
declare assignment public.cost_workflow_manager_assignments%rowtype;
begin
 assignment:=private.c1_workflow_lock_assignment(t,c,p);
 if assignment.id is null or not private.c1_workflow_user_has_permission(t,c,assignment.manager_user_id,'cost.request.decide')
 then raise exception using errcode='P0001',message='PROJECT_MANAGER_REQUIRED';end if;
 return assignment;
end;$$;
create function private.c1_workflow_cap_floor(t uuid,c uuid,p uuid,target_contract_id uuid,cap numeric) returns void
language plpgsql volatile security definer set search_path='' as $$
declare authorized numeric;
begin
 -- Caller already holds the project assignment mutex and contract row.
 select coalesce(sum(i.authorized_amount),0) into authorized from public.cost_workflow_installments i
 where i.tenant_id=t and i.company_id=c and i.project_id=p and i.contract_id=target_contract_id;
 if cap<authorized then raise exception using errcode='P0001',message='CONTRACT_CAP_EXCEEDED';end if;
end;$$;

create function public.c1_workflow_submit_contract_adjustment(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;contract public.cost_workflow_contracts%rowtype;
 request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;receipt public.cost_command_receipts%rowtype;hash text;expected bigint;scale integer;cap numeric;ids uuid[];
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.submit');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');perform private.c1_workflow_project_state(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_manager(t,target_company_id,target_project_id);
 select * into contract from public.cost_workflow_contracts where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 perform private.c1_workflow_require_keys(target_input,array['expectedVersion','proposedCap','reason','evidenceFileIds'],array['expectedVersion','proposedCap','reason','evidenceFileIds']);
 expected:=private.c1_detail_expected_version(target_input);perform private.c1_workflow_text(target_input->'reason');
 select money_scale into scale from public.company_cost_settings where tenant_id=t and company_id=target_company_id and enabled;
 cap:=private.c1_workflow_money(target_input->'proposedCap',scale);ids:=private.c1_workflow_evidence_ids(target_input->'evidenceFileIds');
 perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,ids);
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);
 receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.submit_contract_adjustment',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('adjustmentId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 if contract.current_version<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 perform private.c1_workflow_cap_floor(t,target_company_id,target_project_id,contract.id,cap);
 insert into public.cost_workflow_requests(tenant_id,company_id,project_id,kind,party_id,contract_id,working_input,created_by)
 values(t,target_company_id,target_project_id,'contract_adjustment',contract.party_id,contract.id,target_input,auth.uid()) returning * into request;
 insert into public.cost_workflow_request_versions(tenant_id,company_id,project_id,request_id,version,snapshot,amount,currency_code,evidence_file_ids,manager_assignment_id,submitted_by)
 values(t,target_company_id,target_project_id,request.id,1,target_input,cap,contract.currency_code,ids,assignment.id,auth.uid()) returning * into snapshot;
 update public.cost_workflow_requests set state='submitted',submitted_version_id=snapshot.id,version=1,updated_at=now() where id=request.id returning * into request;
 insert into public.cost_workflow_request_evidence(tenant_id,company_id,project_id,request_id,request_version,evidence_file_id,evidence_kind,created_by)
 select t,target_company_id,target_project_id,request.id,1,f.id,coalesce(f.workflow_evidence_kind,'contract'),auth.uid() from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=target_company_id and f.project_id=target_project_id;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.submit_contract_adjustment',target_idempotency_key,hash,request.id,1,target_request_id,jsonb_build_object('projectId',target_project_id,'contractId',contract.id,'proposedCap',cap::text,'submittedVersionId',snapshot.id));
 return jsonb_build_object('adjustmentId',request.id,'version',1,'replayed',false);
end;$$;

create function public.c1_workflow_decide_contract_adjustment(target_company_id uuid,target_project_id uuid,target_contract_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;assignment public.cost_workflow_manager_assignments%rowtype;contract public.cost_workflow_contracts%rowtype;
 request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;decision public.cost_workflow_decisions%rowtype;basis public.cost_workflow_contract_versions%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;submitted uuid;choice text;reason text;expected bigint;scale integer;cap numeric;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.decide');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.decide');perform private.c1_workflow_project_state(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_manager(t,target_company_id,target_project_id);
 if assignment.manager_user_id is distinct from auth.uid() then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select * into contract from public.cost_workflow_contracts where id=target_contract_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 perform private.c1_workflow_require_keys(target_input,array['submittedVersionId','decision'],array['submittedVersionId','decision','reason']);
 begin submitted:=(target_input->>'submittedVersionId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 choice:=private.c1_workflow_text(target_input->'decision');
 if choice not in('approve','return') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if target_input ? 'reason' then reason:=private.c1_workflow_text(target_input->'reason');end if;
 if choice='return' and reason is null then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and contract_id=contract.id and kind='contract_adjustment';
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select * into snapshot from public.cost_workflow_request_versions where id=submitted and request_id=request.id and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 hash:=private.c1_workflow_hash(target_project_id,target_id,jsonb_build_object('contractId',target_contract_id,'decision',target_input));
 receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.decide_contract_adjustment',target_idempotency_key,hash);
 if receipt.id is not null then
  select * into basis from public.cost_workflow_contract_versions v where v.approval_decision_id=(select d.id from public.cost_workflow_decisions d where d.submitted_version_id=submitted);
  return jsonb_strip_nulls(jsonb_build_object('adjustmentId',receipt.result_resource_id,'contractVersionId',basis.id,'version',receipt.result_version,'replayed',true));
 end if;
 perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 select * into request from public.cost_workflow_requests where id=request.id for update;
 if request.state<>'submitted' or request.submitted_version_id is distinct from submitted then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if choice='approve' then
  expected:=private.c1_detail_expected_version(snapshot.snapshot);
  if contract.current_version<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
  select money_scale into scale from public.company_cost_settings where tenant_id=t and company_id=target_company_id and enabled;
  cap:=private.c1_workflow_money(snapshot.snapshot->'proposedCap',scale);
  perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,snapshot.evidence_file_ids);
  perform private.c1_workflow_cap_floor(t,target_company_id,target_project_id,contract.id,cap);
 end if;
 insert into public.cost_workflow_decisions(tenant_id,company_id,project_id,submitted_version_id,decision,manager_assignment_id,decided_by,reason)
 values(t,target_company_id,target_project_id,submitted,choice,assignment.id,auth.uid(),reason) returning * into decision;
 if choice='approve' then
  insert into public.cost_workflow_contract_versions(tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by,approved_by,reason,approval_decision_id)
  values(t,target_company_id,target_project_id,contract.id,contract.current_version+1,cap,snapshot.evidence_file_ids,'approved_adjustment',snapshot.submitted_by,auth.uid(),private.c1_workflow_text(snapshot.snapshot->'reason'),decision.id) returning * into basis;
  update public.cost_workflow_contracts set current_version=basis.version where id=contract.id;
  perform private.c1_workflow_notify_director(t,target_company_id,target_project_id,decision.id);
 end if;
 update public.cost_workflow_requests set state=case when choice='approve' then 'approved' else 'returned' end,version=version+1,updated_at=now() where id=request.id returning * into request;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.decide_contract_adjustment',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('contractId',contract.id,'submittedVersionId',submitted,'decision',choice,'reason',reason,'contractVersionId',basis.id,'assignmentId',assignment.id));
 return jsonb_strip_nulls(jsonb_build_object('adjustmentId',request.id,'contractVersionId',basis.id,'version',request.version,'replayed',false));
end;$$;

create function private.c1_workflow_read_scope(c uuid,p uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare context jsonb;t uuid;
begin
 context:=private.c1_workflow_context(c,'cost.request.read');t:=(context->>'tenantId')::uuid;
 if not private.c1_workflow_can_read(t,c,p) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if not exists(select 1 from public.projects where id=p and tenant_id=t and company_id=c) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return t;
end;$$;
create function private.c1_workflow_decision_view(snapshot_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'submittedVersionId',d.submitted_version_id,'decision',d.decision,'reason',d.reason,'assignmentId',d.manager_assignment_id,'decidedBy',d.decided_by,'decidedAt',d.decided_at)
 from public.cost_workflow_decisions d where d.submitted_version_id=snapshot_id;
$$;
create function private.c1_workflow_payment_view(payment_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'amount',coalesce(p.ordinary_amount,canonical.paid_amount)::text,
 'refunded',coalesce((select sum(r.amount) from public.cost_workflow_refunds r where r.source_payment_id=p.id),0)::text,
 'correctedCash',coalesce((select x.corrected_outgoing from public.cost_workflow_corrections x where x.source_payment_id=p.id order by x.applied_at desc,x.id desc limit 1),coalesce(p.ordinary_amount,canonical.paid_amount))::text,
 'currencyCode',p.currency_code,'paymentDate',p.payment_date,'evidenceFileIds',p.evidence_file_ids)
 from public.cost_workflow_payments p left join public.project_subcontract_payments canonical
 on canonical.id=p.subcontract_payment_id and canonical.tenant_id=p.tenant_id and canonical.company_id=p.company_id and canonical.project_id=p.project_id where p.id=$1;
$$;
create function private.c1_workflow_request_view(request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'version',r.version,'submittedVersionId',r.submitted_version_id,'status',r.state,
 'partyId',r.party_id,'partyKind',r.working_input->>'partyKind','crewOwnership',r.working_input->>'crewOwnership',
 'categoryId',r.category_id,'contractVersionId',r.working_input->>'contractVersionId','latestDecision',private.c1_workflow_decision_view(r.submitted_version_id),
 'amount',r.working_input->>'amount','currencyCode',r.working_input->>'currencyCode','evidenceFileIds',r.working_input->'evidenceFileIds','basis',r.working_input->'basis',
 'assignmentVersion',(select a.assignment_version from public.cost_workflow_manager_assignments a where a.tenant_id=r.tenant_id and a.company_id=r.company_id and a.project_id=r.project_id order by a.assignment_version desc limit 1),
 'installment',(select jsonb_build_object('id',i.id,'authorized',i.authorized_amount::text,'consumed',coalesce((select sum(c.amount) from public.cost_workflow_consumptions c where c.installment_id=i.id),0)::text,'remaining',(i.authorized_amount-coalesce((select sum(c.amount) from public.cost_workflow_consumptions c where c.installment_id=i.id),0))::text) from public.cost_workflow_installments i where i.request_id=r.id),
 'payments',coalesce((select jsonb_agg(private.c1_workflow_payment_view(p.id) order by p.confirmed_at,p.id) from public.cost_workflow_payments p join public.cost_workflow_installments i on i.id=p.installment_id where i.request_id=r.id),'[]'::jsonb))
 from public.cost_workflow_requests r where r.id=$1 and r.kind='installment';
$$;
create function public.c1_workflow_list_requests(target_company_id uuid,target_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;result jsonb;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 select coalesce(jsonb_agg(private.c1_workflow_request_view(r.id) order by r.updated_at desc,r.id),'[]'::jsonb) into result
 from public.cost_workflow_requests r where r.tenant_id=t and r.company_id=target_company_id and r.project_id=target_project_id and r.kind='installment';
 return result;
end;$$;
create function public.c1_workflow_read_request(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;result jsonb;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 if not exists(select 1 from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and kind='installment') then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 result:=private.c1_workflow_request_view(target_id);return result;
end;$$;
create function private.c1_workflow_contract_view(contract_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'partyId',c.party_id,'reference',c.reference,'currencyCode',c.currency_code,'version',c.current_version,'cap',v.cap::text,'evidenceFileIds',v.evidence_file_ids,'sourceSubcontractId',c.source_subcontract_id)
 from public.cost_workflow_contracts c join public.cost_workflow_contract_versions v on v.contract_id=c.id and v.version=c.current_version where c.id=$1;
$$;
create function public.c1_workflow_list_contracts(target_company_id uuid,target_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;result jsonb;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 select coalesce(jsonb_agg(private.c1_workflow_contract_view(c.id) order by c.reference,c.id),'[]'::jsonb) into result from public.cost_workflow_contracts c where c.tenant_id=t and c.company_id=target_company_id and c.project_id=target_project_id;
 return result;
end;$$;
create function public.c1_workflow_read_contract(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 if not exists(select 1 from public.cost_workflow_contracts where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return private.c1_workflow_contract_view(target_id);
end;$$;
create function private.c1_workflow_adjustment_view(request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'submittedVersionId',r.submitted_version_id,'status',r.state,'partyId',r.party_id,'contractId',r.contract_id,'sourcePaymentId',r.source_payment_id,'input',r.working_input,'latestDecision',private.c1_workflow_decision_view(r.submitted_version_id))
 from public.cost_workflow_requests r where r.id=$1 and r.kind in('contract_adjustment','refund','correction');
$$;
create function public.c1_workflow_list_adjustments(target_company_id uuid,target_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;result jsonb;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 select coalesce(jsonb_agg(private.c1_workflow_adjustment_view(r.id) order by r.updated_at desc,r.id),'[]'::jsonb) into result from public.cost_workflow_requests r where r.tenant_id=t and r.company_id=target_company_id and r.project_id=target_project_id and r.kind in('contract_adjustment','refund','correction');
 return result;
end;$$;
create function public.c1_workflow_read_adjustment(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 if not exists(select 1 from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and kind in('contract_adjustment','refund','correction')) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return private.c1_workflow_adjustment_view(target_id);
end;$$;

-- Assignment and context reads are permitted during preparation in legacy mode.
-- No financial request, cap or cash command bypasses the workflow activation check.
create function public.c1_workflow_project_context(target_company_id uuid,target_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare context jsonb;t uuid;state text;assignment public.cost_workflow_manager_assignments%rowtype;director boolean;mode text;eligible jsonb:='[]'::jsonb;
begin
 context:=private.c1_master_context(target_company_id,'cost.request.read');t:=(context->>'tenantId')::uuid;
 director:=private.c1_workflow_is_director(t,target_company_id);
 if not private.c1_workflow_can_read(t,target_company_id,target_project_id) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select operational_state into state from public.projects where id=target_project_id and tenant_id=t and company_id=target_company_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select w.mode into mode from public.cost_workflow_companies w where w.tenant_id=t and w.company_id=target_company_id;mode:=coalesce(mode,'legacy');
 select * into assignment from public.cost_workflow_manager_assignments a where a.tenant_id=t and a.company_id=target_company_id and a.project_id=target_project_id order by a.assignment_version desc limit 1;
 if director then
  select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'label',coalesce(u.email,m.user_id::text)) order by u.email,m.user_id),'[]'::jsonb) into eligible
  from public.company_memberships m join auth.users u on u.id=m.user_id where m.tenant_id=t and m.company_id=target_company_id and m.is_active and private.c1_workflow_user_has_permission(t,target_company_id,m.user_id,'cost.request.decide');
 end if;
 return jsonb_build_object('mode',coalesce(mode,'legacy'),'operationalState',state,'manager',case when assignment.id is null then null else jsonb_build_object('userId',assignment.manager_user_id,'assignmentId',assignment.id,'version',assignment.assignment_version,'reason',assignment.reason) end,
 'canSubmit',mode='document_backed_v1' and state<>'completed' and assignment.id is not null and private.c1_workflow_user_has_permission(t,target_company_id,assignment.manager_user_id,'cost.request.decide') and private.c1_workflow_actor_has_permission(t,target_company_id,'cost.request.submit'),
 'canDecide',mode='document_backed_v1' and private.c1_workflow_is_current_manager(t,target_company_id,target_project_id),'canAssign',director,'eligibleManagers',eligible);
end;$$;

create function public.c1_workflow_list_notifications(target_company_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;result jsonb;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.notification.read');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.notification.read');
 -- Reactivation delivers the same durable event and recipient once.
 update public.cost_workflow_notifications set delivery_state='available'
 where tenant_id=t and company_id=target_company_id and recipient_id=auth.uid() and delivery_state='undelivered';
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'projectId',n.project_id,'decisionId',n.decision_id,'recipientId',n.recipient_id,'deliveryState',n.delivery_state,'readAt',n.read_at,'createdAt',n.created_at) order by n.created_at desc,n.id),'[]'::jsonb) into result
 from public.cost_workflow_notifications n where n.tenant_id=t and n.company_id=target_company_id and n.recipient_id=auth.uid();
 return result;
end;$$;
create function public.c1_workflow_read_notification(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;notification public.cost_workflow_notifications%rowtype;receipt public.cost_command_receipts%rowtype;hash text;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.notification.read');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.notification.read');perform private.c1_workflow_require_keys(target_input,array[]::text[],array[]::text[]);
 select * into notification from public.cost_workflow_notifications where id=target_id and tenant_id=t and company_id=target_company_id and recipient_id=auth.uid() for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 hash:=private.c1_workflow_hash(notification.project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.read_notification',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('notificationId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 update public.cost_workflow_notifications set read_at=coalesce(read_at,now()),delivery_state='available' where id=notification.id;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.read_notification',target_idempotency_key,hash,notification.id,0,target_request_id,jsonb_build_object('projectId',notification.project_id,'read',true));
 return jsonb_build_object('notificationId',notification.id,'version',0,'replayed',false);
end;$$;

-- Private helpers are never PostgREST commands. Public commands recheck scope and actor.
do $acl$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and p.proname like 'c1_workflow_%'
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'c1_workflow_%'
 loop execute format('grant execute on function %s to authenticated',f.signature);end loop;
end;$acl$;
grant execute on function private.c1_workflow_actor_has_permission(uuid,uuid,text),private.c1_workflow_is_current_manager(uuid,uuid,uuid),private.c1_workflow_is_director(uuid,uuid),private.c1_workflow_can_read(uuid,uuid,uuid),private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid) to authenticated;
