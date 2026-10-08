set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 45);

create table public.material_order_cancellations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  order_id uuid not null,
  order_version bigint not null check (order_version > 0),
  reason text not null check (btrim(reason) <> '' and char_length(reason) <= 2000),
  cancelled_by uuid not null references auth.users(id) on delete restrict,
  cancelled_at timestamptz not null default now(),
  request_id uuid not null,
  command_idempotency_key uuid not null,
  unique (order_id),
  unique (order_id, tenant_id, company_id, project_id),
  foreign key (order_id, tenant_id, company_id, project_id)
    references public.material_orders(id, tenant_id, company_id, project_id) on delete restrict
);

create index material_order_cancellations_scope_idx
on public.material_order_cancellations(tenant_id, company_id, project_id, cancelled_at, order_id);

alter table public.material_order_cancellations enable row level security;
alter table public.material_order_cancellations force row level security;
revoke all on public.material_order_cancellations from public,anon,authenticated,service_role;
grant select on public.material_order_cancellations to authenticated;
create policy material_order_cancellations_financial_read on public.material_order_cancellations
for select to authenticated using (
  private.c1_material_can_read_order(tenant_id, company_id, project_id)
);
create trigger material_order_cancellations_history_immutable
before update or delete on public.material_order_cancellations
for each row execute function private.c1_material_retain_history();

create function private.c1_material_guard_order_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_default_currency text;
begin
  select settings.default_currency_code into v_default_currency
  from public.company_cost_settings as settings
  where settings.tenant_id = new.tenant_id
    and settings.company_id = new.company_id
    and settings.enabled
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'WORKFLOW_CONFIGURATION_REQUIRED';
  end if;
  if new.currency_code is distinct from v_default_currency then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  return new;
end;
$$;

create trigger material_order_default_currency_guard
before insert on public.material_orders
for each row execute function private.c1_material_guard_order_currency();

create or replace function private.c1_material_order_json(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_order public.material_orders%rowtype;
  v_supplier_name text;
  v_allocations jsonb;
begin
  select material_order.* into v_order
  from public.material_orders as material_order
  where material_order.id = target_id
    and material_order.tenant_id = target_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select supplier.display_name into v_supplier_name
  from public.business_parties as supplier
  where supplier.id = v_order.supplier_id
    and supplier.tenant_id = v_order.tenant_id
    and supplier.company_id = v_order.company_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderLineId', allocation.id,
    'proposalLineId', allocation.proposal_line_id,
    'materialId', snapshot.material_id,
    'materialName', snapshot.material_name,
    'specification', snapshot.specification,
    'unit', snapshot.unit,
    'quantity', allocation.quantity::text,
    'unitPrice', allocation.unit_price::text,
    'quotationMaterialName', allocation.quotation_material_name,
    'mappingConfirmed', allocation.mapping_confirmed
  ) order by allocation.id), '[]'::jsonb)
  into v_allocations
  from public.material_order_allocations as allocation
  join public.material_proposal_revision_lines as snapshot
    on snapshot.revision_id = v_order.approved_revision_id
   and snapshot.proposal_line_id = allocation.proposal_line_id
   and snapshot.tenant_id = allocation.tenant_id
   and snapshot.company_id = allocation.company_id
   and snapshot.project_id = allocation.project_id
  where allocation.order_id = v_order.id
    and allocation.tenant_id = v_order.tenant_id
    and allocation.company_id = v_order.company_id
    and allocation.project_id = v_order.project_id;

  return jsonb_build_object(
    'id', v_order.id,
    'version', v_order.version,
    'orderState', v_order.state,
    'proposalId', v_order.proposal_id,
    'approvedRevisionId', v_order.approved_revision_id,
    'supplierId', v_order.supplier_id,
    'supplierName', v_supplier_name,
    'currencyCode', v_order.currency_code,
    'allocations', v_allocations,
    'unsignedQuotationEvidenceFileId', v_order.unsigned_quotation_evidence_file_id,
    'contract', null,
    'cash', jsonb_build_object('grossPaid', '0.0000', 'availableToPay', '0.0000')
  );
end;
$$;

create or replace function private.c1_material_list_orders(
  target_company_id uuid,
  target_project_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_tenant_id uuid; v_result jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  select coalesce(jsonb_agg(
    private.c1_material_order_json(v_tenant_id, target_company_id, target_project_id, material_order.id)
    order by material_order.created_at desc, material_order.id
  ), '[]'::jsonb)
  into v_result
  from public.material_orders as material_order
  where material_order.tenant_id = v_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id;
  return v_result;
end;
$$;

create function private.c1_material_cancel_order(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_expected_version bigint;
  v_reason text;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_order public.material_orders%rowtype;
  v_cancelled_at timestamptz := now();
begin
  v_context := private.c1_material_context(target_company_id, 'material.order.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.order.manage');
  perform private.c1_workflow_require_keys(
    target_input,
    array['expectedOrderVersion','reason'],
    array['expectedOrderVersion','reason']
  );
  v_expected_version := private.c1_material_version(target_input->'expectedOrderVersion');
  v_reason := private.c1_workflow_text(target_input->'reason');
  if char_length(v_reason) > 2000 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  select material_order.* into v_order
  from public.material_orders as material_order
  where material_order.id = target_id
    and material_order.tenant_id = v_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  perform proposal.id
  from public.material_proposals as proposal
  where proposal.id = v_order.proposal_id
    and proposal.tenant_id = v_order.tenant_id
    and proposal.company_id = v_order.company_id
    and proposal.project_id = v_order.project_id
  for update;
  perform line.id
  from public.material_proposal_lines as line
  where line.proposal_id = v_order.proposal_id
    and line.tenant_id = v_order.tenant_id
    and line.company_id = v_order.company_id
    and line.project_id = v_order.project_id
  order by line.id
  for update;
  select material_order.* into v_order
  from public.material_orders as material_order
  where material_order.id = target_id
    and material_order.tenant_id = v_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id
  for update of material_order;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.cancel_order', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    if v_receipt.result_resource_id <> v_order.id
      or v_receipt.result_version <> v_expected_version + 1
      or v_order.state <> 'cancelled'
    then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return private.c1_material_ack(v_order.id, v_order.version, true);
  end if;

  if v_order.version <> v_expected_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if v_order.state = 'cancelled' or exists (
    select 1 from public.material_order_contracts as contract_link
    where contract_link.order_id = v_order.id
      and contract_link.tenant_id = v_order.tenant_id
      and contract_link.company_id = v_order.company_id
      and contract_link.project_id = v_order.project_id
  ) then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  update public.material_orders as material_order
  set state = 'cancelled',
      version = material_order.version + 1,
      updated_at = v_cancelled_at
  where material_order.id = v_order.id
  returning material_order.* into v_order;

  insert into public.material_order_cancellations(
    tenant_id, company_id, project_id, order_id, order_version,
    reason, cancelled_by, cancelled_at, request_id, command_idempotency_key
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_order.id, v_order.version,
    v_reason, v_actor_id, v_cancelled_at, target_request_id, target_idempotency_key
  );
  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key,
    request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'material.cancel_order', target_idempotency_key,
    v_hash, v_order.id, v_order.version
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.material_order.cancelled',
    'material_order', v_order.id::text, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id,
      'proposalId', v_order.proposal_id,
      'approvedRevisionId', v_order.approved_revision_id,
      'orderState', v_order.state,
      'version', v_order.version,
      'reason', v_reason,
      'cancelledAt', v_cancelled_at
    )
  );
  return private.c1_material_ack(v_order.id, v_order.version, false);
end;
$$;

create function public.c1_material_cancel_order(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_cancel_order(
    target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id
  );
$$;

revoke all on function
  private.c1_material_guard_order_currency(),
  private.c1_material_cancel_order(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function public.c1_material_cancel_order(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.c1_material_cancel_order(uuid,uuid,uuid,jsonb,uuid,uuid)
to authenticated;

notify pgrst, 'reload schema';
