set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,47);

create table public.material_payment_invoices (
 payment_id uuid primary key,
 tenant_id uuid not null,company_id uuid not null,project_id uuid not null,
 order_id uuid not null,invoice_evidence_file_id uuid not null,
 recorded_at timestamptz not null default now(),
 foreign key(payment_id,tenant_id,company_id,project_id) references public.cost_workflow_payments(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(order_id,tenant_id,company_id,project_id) references public.material_orders(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(invoice_evidence_file_id,tenant_id,company_id,project_id) references public.cost_evidence_files(id,tenant_id,company_id,project_id) on delete restrict
);
create index material_payment_invoices_evidence_idx on public.material_payment_invoices(invoice_evidence_file_id);
create table public.material_payment_invoice_names (
 payment_id uuid not null,order_line_id uuid not null,
 tenant_id uuid not null,company_id uuid not null,project_id uuid not null,
 material_id uuid not null,supplier_id uuid not null,
 invoice_name text not null check(btrim(invoice_name)<>'' and char_length(invoice_name)<=200),
 primary key(payment_id,order_line_id),
 foreign key(payment_id,tenant_id,company_id,project_id) references public.cost_workflow_payments(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(order_line_id,tenant_id,company_id,project_id) references public.material_order_allocations(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(material_id,tenant_id,company_id) references public.material_items(id,tenant_id,company_id) on delete restrict,
 foreign key(supplier_id,tenant_id,company_id) references public.business_parties(id,tenant_id,company_id) on delete restrict
);

alter table public.material_payment_invoices enable row level security;
alter table public.material_payment_invoices force row level security;
revoke all on public.material_payment_invoices from public,anon,authenticated,service_role;
grant select on public.material_payment_invoices to authenticated;
create policy material_payment_invoices_read on public.material_payment_invoices for select to authenticated
using(private.c1_material_can_read_order(tenant_id,company_id,project_id));
create trigger material_payment_invoices_immutable before update or delete on public.material_payment_invoices
for each row execute function private.c1_material_retain_history();
alter table public.material_payment_invoice_names enable row level security;
alter table public.material_payment_invoice_names force row level security;
revoke all on public.material_payment_invoice_names from public,anon,authenticated,service_role;
grant select on public.material_payment_invoice_names to authenticated;
create policy material_payment_invoice_names_read on public.material_payment_invoice_names for select to authenticated
using(private.c1_material_can_read_order(tenant_id,company_id,project_id));
create trigger material_payment_invoice_names_immutable before update or delete on public.material_payment_invoice_names
for each row execute function private.c1_material_retain_history();

create function public.c1_workflow_installment_authority_source(target_company_id uuid,target_project_id uuid,target_id uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_source text;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');
 v_tenant:=(v_context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(v_tenant,target_company_id,'cost.record_cash');
 perform private.c1_workflow_project_state(v_tenant,target_company_id,target_project_id);
 select installment.authority_source into v_source from public.cost_workflow_installments installment
  where installment.id=target_id and installment.tenant_id=v_tenant and installment.company_id=target_company_id
   and installment.project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return v_source;
end;$$;

-- Move the unchanged legacy implementation, preserving its strict input and JSON return.
alter function public.c1_workflow_confirm_payment(uuid,uuid,uuid,jsonb,uuid,uuid) set schema private;
alter function private.c1_workflow_confirm_payment(uuid,uuid,uuid,jsonb,uuid,uuid) rename to c1_workflow_confirm_payment_legacy;
revoke all on function private.c1_workflow_confirm_payment_legacy(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function private.c1_material_confirm_direct_payment(
 target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,
 target_idempotency_key uuid,target_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_context jsonb;v_tenant uuid;v_state text;v_installment public.cost_workflow_installments%rowtype;
 v_contract public.cost_workflow_contracts%rowtype;v_authority public.material_direct_authorizations%rowtype;
 v_payment public.cost_workflow_payments%rowtype;v_receipt public.cost_command_receipts%rowtype;
 v_hash text;v_event_hash text;v_expected bigint;v_version bigint;v_scale integer;
 v_amount numeric;v_opening numeric;v_direct numeric;v_ids uuid[];v_invoice_id uuid;
 v_date date;v_reference text;v_names jsonb;v_name jsonb;v_line_id uuid;v_name_text text;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');v_tenant:=(v_context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(v_tenant,target_company_id,'cost.record_cash');
 v_state:=private.c1_workflow_project_state(v_tenant,target_company_id,target_project_id);
 select installment.* into v_installment from public.cost_workflow_installments installment
  where installment.id=target_id and installment.tenant_id=v_tenant and installment.company_id=target_company_id
   and installment.project_id=target_project_id and installment.authority_source='direct_authorization';
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select contract.* into v_contract from public.cost_workflow_contracts contract
  where contract.id=v_installment.contract_id and contract.tenant_id=v_tenant and contract.company_id=target_company_id
   and contract.project_id=target_project_id for update;
 select authority.* into v_authority from public.material_direct_authorizations authority
  where authority.id=v_installment.direct_authorization_id and authority.tenant_id=v_tenant
   and authority.company_id=target_company_id and authority.project_id=target_project_id for update;
 select installment.* into v_installment from public.cost_workflow_installments installment
  where installment.id=target_id and installment.tenant_id=v_tenant and installment.company_id=target_company_id
   and installment.project_id=target_project_id for update;
 perform private.c1_workflow_require_keys(target_input,
  array['amount','currencyCode','paymentDate','reference','evidenceFileIds','expectedVersion','invoiceEvidenceFileId','invoiceNames'],
  array['amount','currencyCode','paymentDate','reference','evidenceFileIds','expectedVersion','invoiceEvidenceFileId','invoiceNames']);
 v_expected:=private.c1_detail_expected_version(target_input);
 select money_scale into v_scale from public.company_cost_settings
  where tenant_id=v_tenant and company_id=target_company_id and enabled;
 v_amount:=private.c1_workflow_money(target_input->'amount',v_scale);
 v_date:=private.c1_workflow_date(target_input->'paymentDate');
 v_reference:=private.c1_workflow_text(target_input->'reference');
 if v_amount<=0 or private.c1_workflow_text(target_input->'currencyCode')<>v_installment.currency_code
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_ids:=private.c1_workflow_evidence_ids(target_input->'evidenceFileIds');
 v_invoice_id:=private.c1_material_uuid(target_input->'invoiceEvidenceFileId');
 if v_invoice_id=any(v_ids) then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if jsonb_typeof(target_input->'invoiceNames')<>'array'
  or jsonb_array_length(target_input->'invoiceNames')<1 or jsonb_array_length(target_input->'invoiceNames')>1000
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_names:=target_input->'invoiceNames';
 if exists(select 1 from jsonb_array_elements(v_names) name
  where jsonb_typeof(name)<>'object' or not(name ?& array['orderLineId','name'])
   or exists(select 1 from jsonb_object_keys(name) field where field not in('orderLineId','name')))
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if exists(select 1 from jsonb_array_elements(v_names) name
  group by name->>'orderLineId' having count(*)>1)
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_workflow_require_cash_target_proof(v_tenant,target_company_id,target_project_id,v_ids,
  'payment',v_installment.id,null);
 if cardinality(v_ids)<>(select count(*) from public.cost_evidence_files evidence
  where evidence.id=any(v_ids) and evidence.tenant_id=v_tenant and evidence.company_id=target_company_id
   and evidence.project_id=target_project_id and evidence.status='finalized'
   and evidence.workflow_origin and evidence.created_by=auth.uid() and evidence.workflow_evidence_kind='payment_proof'
   and evidence.workflow_target_kind='payment' and evidence.workflow_target_id=v_installment.id)
 then raise exception using errcode='P0001',message='CASH_PROOF_REQUIRED';end if;
 if not exists(select 1 from public.cost_evidence_files evidence where evidence.id=v_invoice_id
  and evidence.tenant_id=v_tenant and evidence.company_id=target_company_id and evidence.project_id=target_project_id
  and evidence.status='finalized' and evidence.workflow_origin and evidence.created_by=auth.uid() and evidence.workflow_evidence_kind='invoice'
  and evidence.workflow_target_kind='payment' and evidence.workflow_target_id=v_installment.id)
 then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
 v_hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);
 v_receipt:=private.c1_workflow_receipt(v_tenant,target_company_id,'cost_workflow.confirm_payment',target_idempotency_key,v_hash);
 if v_receipt.id is not null then return jsonb_build_object('paymentId',v_receipt.result_resource_id,
  'version',v_receipt.result_version,'replayed',true);end if;
 if v_state='completed' and not exists(select 1 from public.cost_workflow_completion_installments history
  where history.installment_id=v_installment.id and history.tenant_id=v_tenant
   and history.company_id=target_company_id and history.project_id=target_project_id)
 then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
 select coalesce(sum(absorbed.opening_gross),0) into v_opening from public.material_contract_absorptions absorbed
  where absorbed.authorization_id=v_authority.id;
 select count(*),coalesce(sum(consumption.amount),0) into v_version,v_direct
  from public.cost_workflow_consumptions consumption where consumption.installment_id=v_installment.id;
 if v_version<>v_expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if v_opening+v_direct+v_amount>v_authority.signed_value
  or v_authority.signed_value<>v_installment.authorized_amount
  or v_authority.contract_id<>v_contract.id
 then raise exception using errcode='P0001',message='CASH_AUTHORITY_EXCEEDED';end if;
 v_event_hash:=private.c1_workflow_cash_event_hash(v_tenant,target_company_id,target_project_id,'payment',
  jsonb_build_object('amount',v_amount::numeric(20,4)::text,'currency',v_installment.currency_code,'date',v_date),v_ids);
 if exists(select 1 from public.cost_workflow_payments payment where payment.tenant_id=v_tenant
  and payment.company_id=target_company_id and payment.project_id=target_project_id and payment.cash_event_hash=v_event_hash)
 then raise exception using errcode='P0001',message='CASH_DUPLICATE_EVENT';end if;
 perform private.c1_workflow_require_unused_cash_proof(v_tenant,target_company_id,target_project_id,v_ids);
 insert into public.cost_workflow_payments(tenant_id,company_id,project_id,installment_id,cash_kind,ordinary_amount,
  currency_code,payment_date,reference,evidence_file_ids,confirmed_by,cash_event_hash)
 values(v_tenant,target_company_id,target_project_id,v_installment.id,'ordinary',v_amount,v_installment.currency_code,
  v_date,v_reference,v_ids,auth.uid(),v_event_hash) returning * into v_payment;
 perform private.c1_workflow_claim_cash_proof(v_tenant,target_company_id,target_project_id,v_ids,v_payment.id,null);
 insert into public.cost_workflow_consumptions(tenant_id,company_id,project_id,installment_id,payment_id,amount)
 values(v_tenant,target_company_id,target_project_id,v_installment.id,v_payment.id,v_amount);
 insert into public.cost_workflow_cash_states(payment_id,tenant_id,company_id,project_id)
 values(v_payment.id,v_tenant,target_company_id,target_project_id);
 insert into public.material_payment_invoices(payment_id,tenant_id,company_id,project_id,order_id,invoice_evidence_file_id)
 values(v_payment.id,v_tenant,target_company_id,target_project_id,v_authority.order_id,v_invoice_id);
 for v_name in select value from jsonb_array_elements(v_names) value loop
  v_line_id:=private.c1_material_uuid(v_name->'orderLineId');
  v_name_text:=private.c1_material_short_text(v_name->'name');
  insert into public.material_payment_invoice_names(payment_id,order_line_id,tenant_id,company_id,project_id,
   material_id,supplier_id,invoice_name)
  select v_payment.id,allocation.id,v_tenant,target_company_id,target_project_id,
   snapshot.material_id,v_installment.party_id,v_name_text
  from public.material_order_allocations allocation
  join public.material_proposal_revision_lines snapshot on snapshot.revision_id=allocation.approved_revision_id
   and snapshot.proposal_line_id=allocation.proposal_line_id and snapshot.tenant_id=allocation.tenant_id
   and snapshot.company_id=allocation.company_id and snapshot.project_id=allocation.project_id
  where allocation.id=v_line_id and allocation.order_id=v_authority.order_id
   and allocation.tenant_id=v_tenant and allocation.company_id=target_company_id and allocation.project_id=target_project_id;
  if not found then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 end loop;
 perform private.c1_workflow_record_command(v_tenant,target_company_id,'cost_workflow.confirm_payment',target_idempotency_key,
  v_hash,v_payment.id,v_version+1,target_request_id,jsonb_build_object('projectId',target_project_id,
   'installmentId',v_installment.id,'orderId',v_authority.order_id,'invoiceEvidenceFileId',v_invoice_id,
   'amount',v_amount::text,'cashKind','ordinary','evidenceFileIds',v_ids));
 return jsonb_build_object('paymentId',v_payment.id,'version',v_version+1,'replayed',false);
end;$$;

create function public.c1_workflow_confirm_payment(target_company_id uuid,target_project_id uuid,target_id uuid,
 target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_source text;v_result jsonb;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');
 v_tenant:=(v_context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(v_tenant,target_company_id,'cost.record_cash');
 select installment.authority_source into v_source from public.cost_workflow_installments installment
  where installment.id=target_id and installment.tenant_id=v_tenant
   and installment.company_id=target_company_id and installment.project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if v_source='direct_authorization' then
  return private.c1_material_confirm_direct_payment(target_company_id,target_project_id,target_id,target_input,
   target_idempotency_key,target_request_id);
 end if;
 if v_source<>'manager_decision' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_result:=private.c1_workflow_confirm_payment_legacy(target_company_id,target_project_id,target_id,target_input,
  target_idempotency_key,target_request_id);
 -- An exact old receipt may replay, but no new gross consumption can land on a retired window.
 if v_result->>'replayed'='false' and exists(select 1 from public.material_contract_absorptions absorbed
  where absorbed.old_installment_id=target_id and absorbed.tenant_id=v_tenant
   and absorbed.company_id=target_company_id and absorbed.project_id=target_project_id)
 then raise exception using errcode='P0001',message='CASH_AUTHORITY_EXCEEDED';end if;
 return v_result;
end;$$;

-- Existing dev-preview readers retain their JSON contract; only active windows change.
alter function public.c1_workflow_cash_snapshot(uuid,uuid) set schema private;
alter function private.c1_workflow_cash_snapshot(uuid,uuid) rename to c1_workflow_cash_snapshot_base;
revoke all on function private.c1_workflow_cash_snapshot_base(uuid,uuid) from public,anon,authenticated,service_role;
create function public.c1_workflow_cash_snapshot(target_company_id uuid,target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb;v_categories jsonb;v_category jsonb;v_windows jsonb;v_window jsonb;
 v_window_id uuid;v_authority uuid;v_opening numeric;v_consumed numeric;
begin
 v_base:=private.c1_workflow_cash_snapshot_base(target_company_id,target_project_id);
 v_categories:='[]'::jsonb;
 for v_category in select value from jsonb_array_elements(v_base->'categories') value loop
  v_windows:='[]'::jsonb;
  for v_window in select value from jsonb_array_elements(v_category->'installments') value loop
   v_window_id:=(v_window->>'id')::uuid;
   if exists(select 1 from public.material_contract_absorptions absorbed
    where absorbed.old_installment_id=v_window_id and absorbed.company_id=target_company_id
     and absorbed.project_id=target_project_id)
   then continue;end if;
   select installment.direct_authorization_id into v_authority from public.cost_workflow_installments installment
    where installment.id=v_window_id and installment.company_id=target_company_id and installment.project_id=target_project_id;
   if v_authority is not null then
    select coalesce(sum(absorbed.opening_gross),0) into v_opening from public.material_contract_absorptions absorbed
     where absorbed.authorization_id=v_authority;
    v_consumed:=(v_window->>'consumed')::numeric+v_opening;
    v_window:=jsonb_set(v_window,'{consumed}',to_jsonb(v_consumed::numeric(20,4)::text));
   end if;
   v_windows:=v_windows||jsonb_build_array(v_window);
  end loop;
  v_categories:=v_categories||jsonb_build_array(jsonb_set(v_category,'{installments}',v_windows));
 end loop;
 return jsonb_set(v_base,'{categories}',v_categories);
end;$$;

revoke all on function private.c1_material_confirm_direct_payment(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_workflow_confirm_payment(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_workflow_installment_authority_source(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_workflow_cash_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_confirm_payment(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;
grant execute on function public.c1_workflow_installment_authority_source(uuid,uuid,uuid) to authenticated;
grant execute on function public.c1_workflow_cash_snapshot(uuid,uuid) to authenticated;

create function private.c1_material_direct_evidence_target_allowed(t uuid,c uuid,p uuid,installment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_workflow_installments installment
 join public.material_direct_authorizations authority on authority.id=installment.direct_authorization_id
  and authority.tenant_id=installment.tenant_id and authority.company_id=installment.company_id
  and authority.project_id=installment.project_id
 join public.projects project on project.id=installment.project_id and project.tenant_id=installment.tenant_id
  and project.company_id=installment.company_id
 where installment.id=installment_id and installment.tenant_id=t and installment.company_id=c and installment.project_id=p
  and installment.authority_source='direct_authorization'
  and (project.operational_state<>'completed' or exists(select 1 from public.cost_workflow_completion_installments h
   where h.installment_id=installment.id and h.tenant_id=t and h.company_id=c and h.project_id=p))
  and authority.signed_value>
   coalesce((select sum(absorbed.opening_gross) from public.material_contract_absorptions absorbed where absorbed.authorization_id=authority.id),0)
   +coalesce((select sum(consumption.amount) from public.cost_workflow_consumptions consumption where consumption.installment_id=installment.id),0));
$$;
create function private.c1_material_direct_evidence_file(file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files evidence
  join public.cost_workflow_installments installment on installment.id=evidence.workflow_target_id
   and installment.tenant_id=evidence.tenant_id and installment.company_id=evidence.company_id
   and installment.project_id=evidence.project_id
  where evidence.id=file_id and evidence.workflow_origin and evidence.workflow_target_kind='payment'
   and evidence.workflow_evidence_kind in('invoice','payment_proof')
   and installment.authority_source='direct_authorization');
$$;
create function private.c1_material_can_upload_direct_evidence(file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files evidence
  where evidence.id=file_id and private.c1_material_direct_evidence_file(evidence.id)
   and evidence.created_by=auth.uid() and evidence.status='pending_upload' and evidence.intent_expires_at>now()
   and private.c1_workflow_actor_has_permission(evidence.tenant_id,evidence.company_id,'cost.record_cash')
   and private.c1_material_direct_evidence_target_allowed(evidence.tenant_id,evidence.company_id,
    evidence.project_id,evidence.workflow_target_id));
$$;
create function private.c1_material_can_read_direct_evidence(file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files evidence
  where evidence.id=file_id and private.c1_material_direct_evidence_file(evidence.id)
   and evidence.created_by=auth.uid() and evidence.status='finalized'
   and private.c1_workflow_actor_has_permission(evidence.tenant_id,evidence.company_id,'cost.record_cash'));
$$;

-- Generic evidence remains limited to manager-decision payment targets.
do $$
declare v_definition text;
begin
 select pg_get_functiondef('private.c1_workflow_evidence_target_allowed(uuid,uuid,uuid,text,uuid,boolean)'::regprocedure)
 into v_definition;
 if position('private.c1_workflow_evidence_target_allowed(' in v_definition)=0
 then raise exception using errcode='P0001',message='WORKFLOW_EVIDENCE_TARGET_DRIFT';end if;
 execute replace(v_definition,'private.c1_workflow_evidence_target_allowed(',
  'private.c1_workflow_evidence_target_allowed_base(');
end $$;
create or replace function private.c1_workflow_evidence_target_allowed(t uuid,c uuid,p uuid,k text,target uuid,completed boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select case when k='payment' and (
  exists(select 1 from public.cost_workflow_installments installment where installment.id=target
   and installment.tenant_id=t and installment.company_id=c and installment.project_id=p
   and installment.authority_source='direct_authorization')
  or exists(select 1 from public.material_contract_absorptions absorbed where absorbed.old_installment_id=target
   and absorbed.tenant_id=t and absorbed.company_id=c and absorbed.project_id=p))
 then false else private.c1_workflow_evidence_target_allowed_base(t,c,p,k,target,completed) end;
$$;

create function public.c1_material_payment_evidence_intent(target_company_id uuid,target_project_id uuid,target_input jsonb,
 target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_actor uuid:=auth.uid();v_id uuid:=gen_random_uuid();v_target uuid;
 v_kind text;v_size bigint;v_hash text;v_receipt public.cost_command_receipts%rowtype;v_file public.cost_evidence_files%rowtype;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');v_tenant:=(v_context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(v_tenant,target_company_id,'cost.record_cash');
 perform private.c1_workflow_require_keys(target_input,
  array['originalFilename','mimeType','sizeBytes','sha256','evidenceKind','target'],
  array['originalFilename','mimeType','sizeBytes','sha256','evidenceKind','target']);
 if target_idempotency_key is null or target_request_id is null
  or jsonb_typeof(target_input->'target')<>'object'
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_workflow_require_keys(target_input->'target',array['kind','id'],array['kind','id']);
 if target_input#>>'{target,kind}'<>'payment' or jsonb_typeof(target_input->'originalFilename')<>'string'
  or btrim(target_input->>'originalFilename')='' or char_length(target_input->>'originalFilename')>255
  or target_input->>'mimeType' not in('application/pdf','image/png','image/jpeg')
  or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_kind:=private.c1_workflow_text(target_input->'evidenceKind');
 if v_kind not in('invoice','payment_proof') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_target:=private.c1_material_uuid(target_input#>'{target,id}');
 if not private.c1_material_direct_evidence_target_allowed(v_tenant,target_company_id,target_project_id,v_target)
 then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if jsonb_typeof(target_input->'sizeBytes')<>'number' or target_input->>'sizeBytes' !~ '^[0-9]+$'
  or length(target_input->>'sizeBytes')>8
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_size:=(target_input->>'sizeBytes')::bigint;
 if v_size<1 or v_size>26214400 then raise exception using errcode='P0001',message='FILE_TOO_LARGE';end if;
 v_hash:=private.c1_workflow_hash(target_project_id,v_target,target_input);
 v_receipt:=private.c1_workflow_receipt(v_tenant,target_company_id,'material.payment_evidence_intent',target_idempotency_key,v_hash);
 if v_receipt.id is not null then
  select evidence.* into v_file from public.cost_evidence_files evidence where evidence.id=v_receipt.result_resource_id
   and evidence.tenant_id=v_tenant and evidence.company_id=target_company_id and evidence.project_id=target_project_id
   and evidence.created_by=v_actor and evidence.workflow_target_id=v_target;
  if not found then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,
   'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',true);
 end if;
 insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
  declared_mime_type,declared_size_bytes,declared_sha256,intent_expires_at,created_by,workflow_origin,
  workflow_target_kind,workflow_target_id,workflow_evidence_kind)
 values(v_id,v_tenant,target_company_id,target_project_id,
  v_tenant::text||'/'||target_company_id::text||'/'||target_project_id::text||'/'||v_id::text,
  btrim(target_input->>'originalFilename'),target_input->>'mimeType',v_size,target_input->>'sha256',
  now()+interval '15 minutes',v_actor,true,'payment',v_target,v_kind) returning * into v_file;
 perform private.c1_workflow_record_command(v_tenant,target_company_id,'material.payment_evidence_intent',
  target_idempotency_key,v_hash,v_file.id,v_file.version,target_request_id,
  jsonb_build_object('projectId',target_project_id,'installmentId',v_target,'evidenceKind',v_kind));
 return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,
  'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',false);
end;$$;

create function public.c1_material_payment_evidence_source(target_company_id uuid,target_project_id uuid,target_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_file public.cost_evidence_files%rowtype;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');v_tenant:=(v_context->>'tenantId')::uuid;
 select evidence.* into v_file from public.cost_evidence_files evidence
  where evidence.id=target_id and evidence.tenant_id=v_tenant and evidence.company_id=target_company_id
   and evidence.project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return private.c1_material_direct_evidence_file(v_file.id);
end;$$;

create function private.c1_finalize_material_payment_evidence(target_company_id uuid,target_id uuid,target_input jsonb,
 target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_file public.cost_evidence_files%rowtype;
 v_receipt public.cost_command_receipts%rowtype;v_hash text;v_expected bigint;v_size bigint;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');v_tenant:=(v_context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(v_tenant,target_company_id,'cost.record_cash');
 perform private.c1_workflow_require_keys(target_input,array['expectedVersion','mimeType','sizeBytes','sha256'],
  array['expectedVersion','mimeType','sizeBytes','sha256']);
 if target_idempotency_key is null or target_request_id is null
  or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
  or target_input->>'mimeType' not in('application/pdf','image/png','image/jpeg')
  or jsonb_typeof(target_input->'sizeBytes')<>'number'
  or target_input->>'sizeBytes' !~ '^[0-9]+$' or length(target_input->>'sizeBytes')>8
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 v_expected:=private.c1_material_version(target_input->'expectedVersion');
 v_size:=(target_input->>'sizeBytes')::bigint;
 if v_size<1 or v_size>26214400 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 select evidence.* into v_file from public.cost_evidence_files evidence where evidence.id=target_id
  and evidence.tenant_id=v_tenant and evidence.company_id=target_company_id
  and evidence.created_by=auth.uid() and private.c1_material_direct_evidence_file(evidence.id);
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 v_hash:=private.c1_workflow_hash(v_file.project_id,target_id,target_input);
 v_receipt:=private.c1_workflow_receipt(v_tenant,target_company_id,'material.payment_evidence_finalize',target_idempotency_key,v_hash);
 if v_receipt.id is not null then
  if v_receipt.result_resource_id<>v_file.id then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('id',v_file.id,'status',v_file.status,'originalFilename',v_file.original_filename,
   'mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,
   'version',v_file.version,'finalizedAt',v_file.finalized_at,'replayed',true);
 end if;
 select evidence.* into v_file from public.cost_evidence_files evidence where evidence.id=target_id for update;
 if not private.c1_material_can_upload_direct_evidence(v_file.id)
  or v_file.version<>v_expected or v_file.declared_mime_type<>target_input->>'mimeType'
  or v_file.declared_size_bytes<>v_size or v_file.declared_sha256<>target_input->>'sha256'
 then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
 perform set_config('taskovia.c1_evidence.finalize','1',true);
 update public.cost_evidence_files evidence set status='finalized',verified_mime_type=target_input->>'mimeType',
  verified_size_bytes=v_size,verified_sha256=target_input->>'sha256',finalized_by=auth.uid(),
  finalized_at=now(),version=evidence.version+1 where evidence.id=v_file.id returning * into v_file;
 perform set_config('taskovia.c1_evidence.finalize','0',true);
 perform private.c1_workflow_record_command(v_tenant,target_company_id,'material.payment_evidence_finalize',
  target_idempotency_key,v_hash,v_file.id,v_file.version,target_request_id,
  jsonb_build_object('projectId',v_file.project_id,'installmentId',v_file.workflow_target_id,
   'evidenceKind',v_file.workflow_evidence_kind));
 return jsonb_build_object('id',v_file.id,'status',v_file.status,'originalFilename',v_file.original_filename,
  'mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,
  'version',v_file.version,'finalizedAt',v_file.finalized_at,'replayed',false);
end;$$;
create function public.c1_finalize_material_payment_evidence_server(target_actor_id uuid,target_company_id uuid,
 target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or target_actor_id is null
 then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target_actor_id,'role','authenticated')::text,true);
 return private.c1_finalize_material_payment_evidence(target_company_id,target_id,target_input,
  target_idempotency_key,target_request_id);
end;$$;

create function public.c1_material_payment_evidence_read_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb;v_tenant uuid;v_file public.cost_evidence_files%rowtype;
begin
 v_context:=private.c1_workflow_context(target_company_id,'cost.record_cash');v_tenant:=(v_context->>'tenantId')::uuid;
 select evidence.* into v_file from public.cost_evidence_files evidence where evidence.id=target_id
  and evidence.tenant_id=v_tenant and evidence.company_id=target_company_id
  and evidence.project_id=target_project_id and private.c1_material_can_read_direct_evidence(evidence.id);
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return jsonb_build_object('bucketId',v_file.bucket_id,'objectPath',v_file.object_path);
end;$$;

-- Storage uses the same verified object identity, with a narrow direct cash branch.
do $$
declare v_definition text;
begin
 select pg_get_functiondef('private.c1_can_select_evidence_object(text,text)'::regprocedure) into v_definition;
 if position('private.c1_material_can_upload_evidence(evidence.id)' in v_definition)=0
 then raise exception using errcode='P0001',message='MATERIAL_EVIDENCE_STORAGE_DRIFT';end if;
 execute replace(v_definition,'private.c1_material_can_upload_evidence(evidence.id)',
  '(private.c1_material_can_upload_evidence(evidence.id) or private.c1_material_can_upload_direct_evidence(evidence.id) or private.c1_material_can_read_direct_evidence(evidence.id))');
 select pg_get_functiondef('private.c1_can_insert_evidence_object(text,text)'::regprocedure) into v_definition;
 if position('private.c1_material_can_upload_evidence(evidence.id)' in v_definition)=0
 then raise exception using errcode='P0001',message='MATERIAL_EVIDENCE_STORAGE_DRIFT';end if;
 execute replace(v_definition,'private.c1_material_can_upload_evidence(evidence.id)',
  '(private.c1_material_can_upload_evidence(evidence.id) or private.c1_material_can_upload_direct_evidence(evidence.id))');
end $$;

-- Existing generic file readers do not inherit direct-payment file access.
do $$
declare v_definition text;
begin
 select pg_get_functiondef('private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid)'::regprocedure) into v_definition;
 if position('private.c1_workflow_can_read_file(' in v_definition)=0
 then raise exception using errcode='P0001',message='WORKFLOW_FILE_READER_DRIFT';end if;
 execute replace(v_definition,'private.c1_workflow_can_read_file(','private.c1_workflow_can_read_file_base(');
end $$;
create or replace function private.c1_workflow_can_read_file(t uuid,c uuid,p uuid,file_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not private.c1_material_direct_evidence_file(file_id)
  and private.c1_workflow_can_read_file_base(t,c,p,file_id);
$$;
alter policy c1_cost_evidence_files_select on public.cost_evidence_files using (
 (not private.c1_material_evidence_file(id) and private.c1_material_can_upload_direct_evidence(id))
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

revoke all on function private.c1_material_direct_evidence_target_allowed(uuid,uuid,uuid,uuid),
 private.c1_material_direct_evidence_file(uuid),private.c1_material_can_upload_direct_evidence(uuid),
 private.c1_material_can_read_direct_evidence(uuid),private.c1_workflow_evidence_target_allowed_base(uuid,uuid,uuid,text,uuid,boolean),
 private.c1_finalize_material_payment_evidence(uuid,uuid,jsonb,uuid,uuid),
 private.c1_workflow_can_read_file_base(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_material_payment_evidence_intent(uuid,uuid,jsonb,uuid,uuid),
 public.c1_material_payment_evidence_source(uuid,uuid,uuid),
 public.c1_material_payment_evidence_read_target(uuid,uuid,uuid),
 public.c1_finalize_material_payment_evidence_server(uuid,uuid,uuid,jsonb,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.c1_material_payment_evidence_intent(uuid,uuid,jsonb,uuid,uuid),
 public.c1_material_payment_evidence_source(uuid,uuid,uuid),
 public.c1_material_payment_evidence_read_target(uuid,uuid,uuid) to authenticated;
grant execute on function public.c1_finalize_material_payment_evidence_server(uuid,uuid,uuid,jsonb,uuid,uuid) to service_role;
notify pgrst,'reload schema';
