set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 43);

create function private.c1_material_context(target_company_id uuid, target_permission text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb;
begin
  v_context := private.c1_master_context(target_company_id, target_permission);
  if auth.uid() is null
    or (v_context->>'actorId')::uuid is distinct from auth.uid()
    or not private.c1_workflow_user_has_permission(
      (v_context->>'tenantId')::uuid,
      target_company_id,
      auth.uid(),
      target_permission
    )
  then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  return v_context;
end;
$$;

create function private.c1_material_short_text(target_value jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_value text;
begin
  v_value := private.c1_workflow_text(target_value);
  if char_length(v_value) > 200 then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  return v_value;
end;
$$;

create function private.c1_material_uuid(target_value jsonb)
returns uuid language plpgsql immutable set search_path='' as $$
declare v_value uuid;
begin
  if jsonb_typeof(target_value) is distinct from 'string' then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  begin
    v_value := (target_value#>>'{}')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end;
  return v_value;
end;
$$;

create function private.c1_material_version(target_value jsonb)
returns bigint language plpgsql immutable set search_path='' as $$
declare v_text text; v_value bigint;
begin
  v_text := target_value#>>'{}';
  if jsonb_typeof(target_value) is distinct from 'number' or v_text !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  begin
    v_value := v_text::bigint;
  exception when numeric_value_out_of_range then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end;
  return v_value;
end;
$$;

create function private.c1_material_positive(target_value jsonb)
returns numeric language plpgsql immutable set search_path='' as $$
declare v_value numeric;
begin
  v_value := private.c1_workflow_money(target_value, 4);
  if v_value <= 0 then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  return v_value;
end;
$$;

create function private.c1_material_ack(
  target_id uuid,
  target_version bigint,
  target_replayed boolean,
  target_review_state text default null
)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'resourceId', target_id,
    'version', target_version,
    'replayed', target_replayed,
    'reviewState', target_review_state
  ));
$$;

create function private.c1_material_require_project(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid
)
returns public.projects language plpgsql stable security definer set search_path='' as $$
declare v_project public.projects%rowtype;
begin
  select project.* into v_project
  from public.projects as project
  where project.id = target_project_id
    and project.tenant_id = target_tenant_id
    and project.company_id = target_company_id;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  return v_project;
end;
$$;

create function private.c1_material_proposal_json(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_proposal public.material_proposals%rowtype;
  v_lines jsonb;
  v_order_count bigint;
  v_signed_order_count bigint;
begin
  select proposal.* into v_proposal
  from public.material_proposals as proposal
  where proposal.id = target_id
    and proposal.tenant_id = target_tenant_id
    and proposal.company_id = target_company_id
    and proposal.project_id = target_project_id;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineId', line.id,
      'materialId', line.material_id,
      'quantity', (
        case when v_proposal.review_state in ('submitted','approved')
          then snapshot.quantity else line.quantity end
      )::text,
      'materialName', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.material_name else item.name end,
      'specification', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.specification else item.specification end,
      'unit', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.unit else item.unit end,
      'allocatedQuantity', coalesce((
        select sum(allocation.quantity)
        from public.material_order_allocations as allocation
        join public.material_orders as material_order
          on material_order.id = allocation.order_id
         and material_order.tenant_id = allocation.tenant_id
         and material_order.company_id = allocation.company_id
         and material_order.project_id = allocation.project_id
        where allocation.proposal_line_id = line.id
          and allocation.tenant_id = line.tenant_id
          and allocation.company_id = line.company_id
          and allocation.project_id = line.project_id
          and material_order.state <> 'cancelled'
      ), 0)::text,
      'signedQuantity', coalesce((
        select sum(allocation.quantity)
        from public.material_order_allocations as allocation
        join public.material_order_contracts as contract_link
          on contract_link.order_id = allocation.order_id
         and contract_link.tenant_id = allocation.tenant_id
         and contract_link.company_id = allocation.company_id
         and contract_link.project_id = allocation.project_id
        where allocation.proposal_line_id = line.id
          and allocation.tenant_id = line.tenant_id
          and allocation.company_id = line.company_id
          and allocation.project_id = line.project_id
      ), 0)::text,
      'remainingQuantity', greatest(
        case when v_proposal.review_state in ('submitted','approved')
          then snapshot.quantity else line.quantity end
        - coalesce((
          select sum(allocation.quantity)
          from public.material_order_allocations as allocation
          join public.material_orders as material_order
            on material_order.id = allocation.order_id
           and material_order.tenant_id = allocation.tenant_id
           and material_order.company_id = allocation.company_id
           and material_order.project_id = allocation.project_id
          where allocation.proposal_line_id = line.id
            and allocation.tenant_id = line.tenant_id
            and allocation.company_id = line.company_id
            and allocation.project_id = line.project_id
            and material_order.state <> 'cancelled'
        ), 0),
        0
      )::text
    )
    order by line.id
  ), '[]'::jsonb)
  into v_lines
  from public.material_proposal_lines as line
  join public.material_items as item
    on item.id = line.material_id
   and item.tenant_id = line.tenant_id
   and item.company_id = line.company_id
  left join public.material_proposal_revision_lines as snapshot
    on snapshot.revision_id = v_proposal.current_revision_id
   and snapshot.proposal_line_id = line.id
   and snapshot.tenant_id = line.tenant_id
   and snapshot.company_id = line.company_id
   and snapshot.project_id = line.project_id
  where line.proposal_id = v_proposal.id
    and line.tenant_id = v_proposal.tenant_id
    and line.company_id = v_proposal.company_id
    and line.project_id = v_proposal.project_id
    and (
      (v_proposal.review_state in ('submitted','approved') and snapshot.proposal_line_id is not null)
      or (v_proposal.review_state not in ('submitted','approved') and line.is_active)
    );

  select count(*), count(contract_link.order_id)
  into v_order_count, v_signed_order_count
  from public.material_orders as material_order
  left join public.material_order_contracts as contract_link
    on contract_link.order_id = material_order.id
   and contract_link.tenant_id = material_order.tenant_id
   and contract_link.company_id = material_order.company_id
   and contract_link.project_id = material_order.project_id
  where material_order.proposal_id = v_proposal.id
    and material_order.tenant_id = v_proposal.tenant_id
    and material_order.company_id = v_proposal.company_id
    and material_order.project_id = v_proposal.project_id
    and material_order.state <> 'cancelled';

  return jsonb_build_object(
    'id', v_proposal.id,
    'version', v_proposal.version,
    'reviewState', v_proposal.review_state,
    'returnReason', case when v_proposal.review_state = 'returned' then (
      select decision.reason
      from public.material_proposal_decisions as decision
      where decision.proposal_id = v_proposal.id
        and decision.revision_id = v_proposal.current_revision_id
        and decision.tenant_id = v_proposal.tenant_id
        and decision.company_id = v_proposal.company_id
        and decision.project_id = v_proposal.project_id
        and decision.decision = 'return'
      order by decision.decided_at desc, decision.id desc
      limit 1
    ) else null end,
    'approvedRevisionId', v_proposal.approved_revision_id,
    'projectId', v_proposal.project_id,
    'createdBy', v_proposal.created_by,
    'neededOn', to_char(v_proposal.needed_on, 'YYYY-MM-DD'),
    'deliveryAddress', v_proposal.delivery_address,
    'notes', v_proposal.notes,
    'lines', v_lines,
    'orderProgress', jsonb_build_object(
      'orderCount', v_order_count,
      'signedOrderCount', v_signed_order_count
    )
  );
end;
$$;

create function private.c1_material_order_json(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_order public.material_orders%rowtype; v_allocations jsonb;
begin
  select material_order.* into v_order
  from public.material_orders as material_order
  where material_order.id = target_id
    and material_order.tenant_id = target_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id
    and material_order.state <> 'cancelled';
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderLineId', allocation.id,
    'proposalLineId', allocation.proposal_line_id,
    'quantity', allocation.quantity::text,
    'unitPrice', allocation.unit_price::text,
    'quotationMaterialName', allocation.quotation_material_name,
    'mappingConfirmed', allocation.mapping_confirmed
  ) order by allocation.id), '[]'::jsonb)
  into v_allocations
  from public.material_order_allocations as allocation
  where allocation.order_id = v_order.id
    and allocation.tenant_id = v_order.tenant_id
    and allocation.company_id = v_order.company_id
    and allocation.project_id = v_order.project_id;

  return jsonb_build_object(
    'id', v_order.id,
    'version', v_order.version,
    'proposalId', v_order.proposal_id,
    'approvedRevisionId', v_order.approved_revision_id,
    'supplierId', v_order.supplier_id,
    'currencyCode', v_order.currency_code,
    'allocations', v_allocations,
    'unsignedQuotationEvidenceFileId', v_order.unsigned_quotation_evidence_file_id,
    'contract', null,
    'cash', jsonb_build_object('grossPaid', '0.0000', 'availableToPay', '0.0000')
  );
end;
$$;

create function private.c1_material_list_projects(target_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_result jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  select coalesce(jsonb_agg(jsonb_build_object(
    'projectId', project.id,
    'code', project.code,
    'name', project.name,
    'locationText', project.location_text
  ) order by project.code, project.id), '[]'::jsonb)
  into v_result
  from public.projects as project
  where project.tenant_id = (v_context->>'tenantId')::uuid
    and project.company_id = target_company_id;
  return v_result;
end;
$$;

create function private.c1_material_list_items(target_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_result jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'code', item.code,
    'name', item.name,
    'specification', item.specification,
    'unit', item.unit,
    'isActive', item.is_active,
    'version', item.version
  ) order by item.code, item.id), '[]'::jsonb)
  into v_result
  from public.material_items as item
  where item.tenant_id = (v_context->>'tenantId')::uuid
    and item.company_id = target_company_id;
  return v_result;
end;
$$;

create function private.c1_material_create_item(
  target_company_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_item public.material_items%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.manage');
  perform private.c1_workflow_require_keys(
    target_input,
    array['code','name','specification','unit'],
    array['code','name','specification','unit']
  );
  perform private.c1_material_short_text(target_input->'code');
  perform private.c1_material_short_text(target_input->'name');
  perform private.c1_workflow_text(target_input->'specification');
  perform private.c1_material_short_text(target_input->'unit');

  v_hash := private.c1_workflow_hash(null, null, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.create_item', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  insert into public.material_items(
    tenant_id, company_id, code, name, specification, unit, created_by
  ) values (
    v_tenant_id,
    target_company_id,
    private.c1_material_short_text(target_input->'code'),
    private.c1_material_short_text(target_input->'name'),
    private.c1_workflow_text(target_input->'specification'),
    private.c1_material_short_text(target_input->'unit'),
    auth.uid()
  )
  returning * into v_item;

  perform private.c1_workflow_record_command(
    v_tenant_id,
    target_company_id,
    'material.create_item',
    target_idempotency_key,
    v_hash,
    v_item.id,
    v_item.version,
    target_request_id,
    jsonb_build_object('itemId', v_item.id)
  );
  return private.c1_material_ack(v_item.id, v_item.version, false);
end;
$$;

create function private.c1_material_update_item(
  target_company_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_expected_version bigint;
  v_receipt public.cost_command_receipts%rowtype;
  v_item public.material_items%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.manage');
  perform private.c1_workflow_require_keys(
    target_input,
    array['expectedVersion'],
    array['expectedVersion','code','name','specification','unit','isActive']
  );
  if jsonb_object_length(target_input) = 1 then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  v_expected_version := private.c1_material_version(target_input->'expectedVersion');
  if target_input ? 'code' then perform private.c1_material_short_text(target_input->'code'); end if;
  if target_input ? 'name' then perform private.c1_material_short_text(target_input->'name'); end if;
  if target_input ? 'specification' then perform private.c1_workflow_text(target_input->'specification'); end if;
  if target_input ? 'unit' then perform private.c1_material_short_text(target_input->'unit'); end if;
  if target_input ? 'isActive' and jsonb_typeof(target_input->'isActive') is distinct from 'boolean' then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;

  v_hash := private.c1_workflow_hash(null, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.update_item', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  select item.* into v_item
  from public.material_items as item
  where item.id = target_id
    and item.tenant_id = v_tenant_id
    and item.company_id = target_company_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if v_item.version <> v_expected_version then
    raise exception using errcode='P0001', message='VERSION_CONFLICT';
  end if;
  if target_input ? 'unit'
    and private.c1_material_short_text(target_input->'unit') <> v_item.unit
    and exists (
      select 1
      from public.material_proposal_lines as proposal_line
      join public.material_order_allocations as allocation
        on allocation.proposal_line_id = proposal_line.id
       and allocation.tenant_id = proposal_line.tenant_id
       and allocation.company_id = proposal_line.company_id
       and allocation.project_id = proposal_line.project_id
      join public.material_order_contracts as contract_link
        on contract_link.order_id = allocation.order_id
       and contract_link.tenant_id = allocation.tenant_id
       and contract_link.company_id = allocation.company_id
       and contract_link.project_id = allocation.project_id
      where proposal_line.material_id = v_item.id
        and proposal_line.tenant_id = v_tenant_id
        and proposal_line.company_id = target_company_id
    )
  then
    raise exception using errcode='P0001', message='SIGNED_MATERIAL_UNIT_IMMUTABLE';
  end if;

  update public.material_items as item
  set code = case when target_input ? 'code' then private.c1_material_short_text(target_input->'code') else item.code end,
      name = case when target_input ? 'name' then private.c1_material_short_text(target_input->'name') else item.name end,
      specification = case when target_input ? 'specification' then private.c1_workflow_text(target_input->'specification') else item.specification end,
      unit = case when target_input ? 'unit' then private.c1_material_short_text(target_input->'unit') else item.unit end,
      is_active = case when target_input ? 'isActive' then (target_input->>'isActive')::boolean else item.is_active end,
      version = item.version + 1,
      updated_at = now()
  where item.id = v_item.id
  returning item.* into v_item;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.update_item', target_idempotency_key, v_hash,
    v_item.id, v_item.version, target_request_id, jsonb_build_object('itemId', v_item.id)
  );
  return private.c1_material_ack(v_item.id, v_item.version, false);
end;
$$;

create function private.c1_material_list_supplier_names(target_company_id uuid, target_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_result jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if not (
    private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.supplier.record')
    or private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.contract.record')
  ) then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  if not exists (
    select 1 from public.material_items as item
    where item.id = target_id and item.tenant_id = v_tenant_id and item.company_id = target_company_id
  ) then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', supplier_name.id,
    'materialId', supplier_name.material_id,
    'supplierId', supplier_name.supplier_id,
    'documentKind', supplier_name.document_kind,
    'name', supplier_name.name,
    'version', supplier_name.version
  ) order by supplier_name.document_kind, supplier_name.name, supplier_name.id), '[]'::jsonb)
  into v_result
  from public.material_supplier_names as supplier_name
  where supplier_name.material_id = target_id
    and supplier_name.tenant_id = v_tenant_id
    and supplier_name.company_id = target_company_id;
  return v_result;
end;
$$;

create function private.c1_material_record_supplier_name(
  target_company_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_supplier_id uuid;
  v_name text;
  v_kind text;
  v_receipt public.cost_command_receipts%rowtype;
  v_record public.material_supplier_names%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.supplier.record');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.supplier.record');
  perform private.c1_workflow_require_keys(
    target_input,
    array['supplierId','documentKind','name','mappingConfirmed'],
    array['supplierId','documentKind','name','mappingConfirmed']
  );
  v_supplier_id := private.c1_material_uuid(target_input->'supplierId');
  v_kind := target_input->>'documentKind';
  v_name := private.c1_material_short_text(target_input->'name');
  if v_kind not in ('quotation','invoice') or target_input->'mappingConfirmed' is distinct from 'true'::jsonb then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;

  v_hash := private.c1_workflow_hash(null, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.record_supplier_name', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  if not exists (
    select 1 from public.material_items as item
    where item.id = target_id and item.tenant_id = v_tenant_id
      and item.company_id = target_company_id and item.is_active
  ) or not exists (
    select 1 from public.business_parties as supplier
    where supplier.id = v_supplier_id and supplier.tenant_id = v_tenant_id
      and supplier.company_id = target_company_id and supplier.party_kind = 'organization'
      and supplier.is_active
  ) then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'material.supplier_name:' || v_tenant_id::text || ':' || target_company_id::text || ':'
      || target_id::text || ':' || v_supplier_id::text || ':' || v_kind || ':' || v_name,
    0
  ));
  select supplier_name.* into v_record
  from public.material_supplier_names as supplier_name
  where supplier_name.material_id = target_id
    and supplier_name.supplier_id = v_supplier_id
    and supplier_name.document_kind = v_kind
    and supplier_name.name = v_name
  for update;
  if not found then
    insert into public.material_supplier_names(
      tenant_id, company_id, material_id, supplier_id, document_kind, name, created_by
    ) values (
      v_tenant_id, target_company_id, target_id, v_supplier_id, v_kind, v_name, auth.uid()
    )
    returning * into v_record;
  end if;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.record_supplier_name', target_idempotency_key, v_hash,
    v_record.id, v_record.version, target_request_id,
    jsonb_build_object('materialId', target_id, 'supplierId', v_supplier_id)
  );
  return private.c1_material_ack(v_record.id, v_record.version, false);
end;
$$;

create function private.c1_material_resolve_supplier(
  target_company_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_code text;
  v_receipt public.cost_command_receipts%rowtype;
  v_supplier public.business_parties%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.supplier.record');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.supplier.record');
  perform private.c1_workflow_require_keys(
    target_input,
    array['code','displayName','partyKind','supplierAlreadyChosen'],
    array['code','displayName','partyKind','taxIdentifier','contactDisplayName','contactPhone','supplierAlreadyChosen']
  );
  v_code := private.c1_material_short_text(target_input->'code');
  perform private.c1_material_short_text(target_input->'displayName');
  if target_input->>'partyKind' is distinct from 'organization'
    or target_input->'supplierAlreadyChosen' is distinct from 'true'::jsonb
  then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  if target_input ? 'taxIdentifier' then perform private.c1_workflow_text(target_input->'taxIdentifier'); end if;
  if target_input ? 'contactDisplayName' then perform private.c1_workflow_text(target_input->'contactDisplayName'); end if;
  if target_input ? 'contactPhone' then perform private.c1_workflow_text(target_input->'contactPhone'); end if;

  v_hash := private.c1_workflow_hash(null, null, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.resolve_supplier', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'material.supplier:' || v_tenant_id::text || ':' || target_company_id::text || ':' || v_code,
    0
  ));
  select supplier.* into v_supplier
  from public.business_parties as supplier
  where supplier.tenant_id = v_tenant_id
    and supplier.company_id = target_company_id
    and supplier.code = v_code
  for update;
  if found then
    if v_supplier.party_kind <> 'organization' or not v_supplier.is_active then
      raise exception using errcode='P0001', message='SUPPLIER_UNAVAILABLE';
    end if;
  else
    insert into public.business_parties(
      tenant_id, company_id, code, display_name, party_kind,
      tax_identifier, contact_display_name, contact_phone, created_by
    ) values (
      v_tenant_id,
      target_company_id,
      v_code,
      private.c1_material_short_text(target_input->'displayName'),
      'organization',
      case when target_input ? 'taxIdentifier' then private.c1_workflow_text(target_input->'taxIdentifier') end,
      case when target_input ? 'contactDisplayName' then private.c1_workflow_text(target_input->'contactDisplayName') end,
      case when target_input ? 'contactPhone' then private.c1_workflow_text(target_input->'contactPhone') end,
      auth.uid()
    )
    returning * into v_supplier;
  end if;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.resolve_supplier', target_idempotency_key, v_hash,
    v_supplier.id, v_supplier.version, target_request_id,
    jsonb_build_object('supplierId', v_supplier.id, 'supplierAlreadyChosen', true)
  );
  return private.c1_material_ack(v_supplier.id, v_supplier.version, false);
end;
$$;

create function private.c1_material_list_proposals(
  target_company_id uuid,
  target_project_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_result jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  select coalesce(jsonb_agg(
    private.c1_material_proposal_json(v_tenant_id, target_company_id, target_project_id, proposal.id)
    order by proposal.updated_at desc, proposal.id
  ), '[]'::jsonb)
  into v_result
  from public.material_proposals as proposal
  where proposal.tenant_id = v_tenant_id
    and proposal.company_id = target_company_id
    and proposal.project_id = target_project_id
    and (
      proposal.created_by = auth.uid()
      or private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.proposal.decide')
      or private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.order.manage')
      or private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.contract.record')
    );
  return v_result;
end;
$$;

create function private.c1_material_read_proposal(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not private.c1_material_can_read_proposal(
    v_tenant_id, target_company_id, target_project_id, target_id
  ) then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  return private.c1_material_proposal_json(
    v_tenant_id, target_company_id, target_project_id, target_id
  );
end;
$$;

create function private.c1_material_create_proposal(
  target_company_id uuid,
  target_project_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_proposal public.material_proposals%rowtype;
  v_project public.projects%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_material_id uuid;
  v_seen_ids uuid[] := array[]::uuid[];
begin
  v_context := private.c1_material_context(target_company_id, 'material.proposal.submit');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.proposal.submit');
  perform private.c1_workflow_require_keys(
    target_input,
    array['neededOn','deliveryAddress','lines'],
    array['neededOn','deliveryAddress','notes','lines']
  );
  perform private.c1_workflow_date(target_input->'neededOn');
  perform private.c1_workflow_text(target_input->'deliveryAddress');
  if target_input ? 'notes' then perform private.c1_workflow_text(target_input->'notes'); end if;
  if jsonb_typeof(target_input->'lines') is distinct from 'array'
    or jsonb_array_length(target_input->'lines') not between 1 and 1000
  then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;

  v_hash := private.c1_workflow_hash(target_project_id, null, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.create_proposal', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(
      v_receipt.result_resource_id, v_receipt.result_version, true
    );
  end if;

  v_project := private.c1_material_require_project(
    v_tenant_id, target_company_id, target_project_id
  );
  if v_project.operational_state = 'completed' then
    raise exception using errcode='P0001', message='PROJECT_COMPLETED';
  end if;

  insert into public.material_proposals(
    tenant_id, company_id, project_id, needed_on, delivery_address, notes, created_by
  ) values (
    v_tenant_id,
    target_company_id,
    target_project_id,
    private.c1_workflow_date(target_input->'neededOn'),
    private.c1_workflow_text(target_input->'deliveryAddress'),
    case when target_input ? 'notes' then private.c1_workflow_text(target_input->'notes') end,
    auth.uid()
  )
  returning * into v_proposal;

  for v_line in select entry.value from jsonb_array_elements(target_input->'lines') as entry(value)
  loop
    perform private.c1_workflow_require_keys(
      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity']
    );
    v_line_id := private.c1_material_uuid(v_line->'lineId');
    v_material_id := private.c1_material_uuid(v_line->'materialId');
    if v_line_id = any(v_seen_ids) then
      raise exception using errcode='P0001', message='INPUT_INVALID';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_line_id);
    if not exists (
      select 1 from public.material_items as item
      where item.id = v_material_id
        and item.tenant_id = v_tenant_id
        and item.company_id = target_company_id
        and item.is_active
    ) then
      raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
    end if;
    insert into public.material_proposal_lines(
      id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by
    ) values (
      v_line_id,
      v_tenant_id,
      target_company_id,
      target_project_id,
      v_proposal.id,
      v_material_id,
      private.c1_material_positive(v_line->'quantity'),
      auth.uid()
    );
  end loop;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.create_proposal', target_idempotency_key, v_hash,
    v_proposal.id, v_proposal.version, target_request_id,
    jsonb_build_object('projectId', target_project_id, 'reviewState', v_proposal.review_state)
  );
  return private.c1_material_ack(
    v_proposal.id, v_proposal.version, false, v_proposal.review_state
  );
end;
$$;

create function private.c1_material_update_proposal(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_expected_version bigint;
  v_receipt public.cost_command_receipts%rowtype;
  v_proposal public.material_proposals%rowtype;
  v_existing_line public.material_proposal_lines%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_material_id uuid;
  v_quantity numeric;
  v_signed_quantity numeric;
  v_reserved_quantity numeric;
  v_seen_ids uuid[] := array[]::uuid[];
begin
  v_context := private.c1_material_context(target_company_id, 'material.proposal.submit');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.proposal.submit');
  perform private.c1_workflow_require_keys(
    target_input,
    array['expectedVersion','neededOn','deliveryAddress','lines'],
    array['expectedVersion','neededOn','deliveryAddress','notes','lines']
  );
  v_expected_version := private.c1_material_version(target_input->'expectedVersion');
  perform private.c1_workflow_date(target_input->'neededOn');
  perform private.c1_workflow_text(target_input->'deliveryAddress');
  if target_input ? 'notes' then perform private.c1_workflow_text(target_input->'notes'); end if;
  if jsonb_typeof(target_input->'lines') is distinct from 'array'
    or jsonb_array_length(target_input->'lines') not between 1 and 1000
  then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.update_proposal', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(
      v_receipt.result_resource_id, v_receipt.result_version, true
    );
  end if;

  select proposal.* into v_proposal
  from public.material_proposals as proposal
  where proposal.id = target_id
    and proposal.tenant_id = v_tenant_id
    and proposal.company_id = target_company_id
    and proposal.project_id = target_project_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if v_proposal.created_by <> auth.uid() then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  if v_proposal.review_state not in ('draft','returned') then
    raise exception using errcode='P0001', message='PROPOSAL_NOT_EDITABLE';
  end if;
  if v_proposal.version <> v_expected_version then
    raise exception using errcode='P0001', message='VERSION_CONFLICT';
  end if;

  perform line.id
  from public.material_proposal_lines as line
  where line.proposal_id = v_proposal.id
    and line.tenant_id = v_tenant_id
    and line.company_id = target_company_id
    and line.project_id = target_project_id
  order by line.id
  for update;

  for v_line in select entry.value from jsonb_array_elements(target_input->'lines') as entry(value)
  loop
    perform private.c1_workflow_require_keys(
      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity']
    );
    v_line_id := private.c1_material_uuid(v_line->'lineId');
    v_material_id := private.c1_material_uuid(v_line->'materialId');
    v_quantity := private.c1_material_positive(v_line->'quantity');
    if v_line_id = any(v_seen_ids) then
      raise exception using errcode='P0001', message='INPUT_INVALID';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_line_id);

    select line.* into v_existing_line
    from public.material_proposal_lines as line
    where line.id = v_line_id
      and line.proposal_id = v_proposal.id
      and line.tenant_id = v_tenant_id
      and line.company_id = target_company_id
      and line.project_id = target_project_id;

    if found then
      if v_existing_line.material_id <> v_material_id then
        raise exception using errcode='P0001', message='MATERIAL_LINE_IDENTITY_CONFLICT';
      end if;
    elsif not exists (
      select 1 from public.material_items as item
      where item.id = v_material_id
        and item.tenant_id = v_tenant_id
        and item.company_id = target_company_id
        and item.is_active
    ) then
      raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
    end if;

    select coalesce(sum(allocation.quantity), 0)
    into v_signed_quantity
    from public.material_order_allocations as allocation
    join public.material_order_contracts as contract_link
      on contract_link.order_id = allocation.order_id
     and contract_link.tenant_id = allocation.tenant_id
     and contract_link.company_id = allocation.company_id
     and contract_link.project_id = allocation.project_id
    where allocation.proposal_line_id = v_line_id
      and allocation.tenant_id = v_tenant_id
      and allocation.company_id = target_company_id
      and allocation.project_id = target_project_id;
    if v_quantity < v_signed_quantity then
      raise exception using errcode='P0001', message='SIGNED_QUANTITY_CONFLICT';
    end if;

    select coalesce(sum(allocation.quantity), 0)
    into v_reserved_quantity
    from public.material_order_allocations as allocation
    join public.material_orders as existing_order
      on existing_order.id = allocation.order_id
     and existing_order.tenant_id = allocation.tenant_id
     and existing_order.company_id = allocation.company_id
     and existing_order.project_id = allocation.project_id
    where allocation.proposal_line_id = v_line_id
      and allocation.tenant_id = v_tenant_id
      and allocation.company_id = target_company_id
      and allocation.project_id = target_project_id
      and existing_order.state <> 'cancelled';
    if v_quantity < v_reserved_quantity then
      raise exception using errcode='P0001', message='MATERIAL_ALLOCATION_EXCEEDED';
    end if;

    if v_existing_line.id is null then
      insert into public.material_proposal_lines(
        id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by
      ) values (
        v_line_id, v_tenant_id, target_company_id, target_project_id,
        v_proposal.id, v_material_id, v_quantity, auth.uid()
      );
    else
      update public.material_proposal_lines as line
      set quantity = v_quantity, is_active = true, updated_at = now()
      where line.id = v_existing_line.id;
    end if;
  end loop;

  if exists (
    select 1
    from public.material_proposal_lines as line
    join public.material_order_allocations as allocation
      on allocation.proposal_line_id = line.id
     and allocation.tenant_id = line.tenant_id
     and allocation.company_id = line.company_id
     and allocation.project_id = line.project_id
    join public.material_order_contracts as contract_link
      on contract_link.order_id = allocation.order_id
     and contract_link.tenant_id = allocation.tenant_id
     and contract_link.company_id = allocation.company_id
     and contract_link.project_id = allocation.project_id
    where line.proposal_id = v_proposal.id
      and line.tenant_id = v_tenant_id
      and line.company_id = target_company_id
      and line.project_id = target_project_id
      and line.is_active
      and line.id <> all(v_seen_ids)
  ) then
    raise exception using errcode='P0001', message='SIGNED_QUANTITY_CONFLICT';
  end if;

  if exists (
    select 1
    from public.material_proposal_lines as line
    join public.material_order_allocations as allocation
      on allocation.proposal_line_id = line.id
     and allocation.tenant_id = line.tenant_id
     and allocation.company_id = line.company_id
     and allocation.project_id = line.project_id
    join public.material_orders as existing_order
      on existing_order.id = allocation.order_id
     and existing_order.tenant_id = allocation.tenant_id
     and existing_order.company_id = allocation.company_id
     and existing_order.project_id = allocation.project_id
    where line.proposal_id = v_proposal.id
      and line.tenant_id = v_tenant_id
      and line.company_id = target_company_id
      and line.project_id = target_project_id
      and line.is_active
      and line.id <> all(v_seen_ids)
      and existing_order.state <> 'cancelled'
  ) then
    raise exception using errcode='P0001', message='MATERIAL_ALLOCATION_EXCEEDED';
  end if;

  update public.material_proposal_lines as line
  set is_active = false, updated_at = now()
  where line.proposal_id = v_proposal.id
    and line.tenant_id = v_tenant_id
    and line.company_id = target_company_id
    and line.project_id = target_project_id
    and line.is_active
    and line.id <> all(v_seen_ids);

  update public.material_proposals as proposal
  set needed_on = private.c1_workflow_date(target_input->'neededOn'),
      delivery_address = private.c1_workflow_text(target_input->'deliveryAddress'),
      notes = case when target_input ? 'notes' then private.c1_workflow_text(target_input->'notes') end,
      version = proposal.version + 1,
      updated_at = now()
  where proposal.id = v_proposal.id
  returning proposal.* into v_proposal;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.update_proposal', target_idempotency_key, v_hash,
    v_proposal.id, v_proposal.version, target_request_id,
    jsonb_build_object('projectId', target_project_id, 'reviewState', v_proposal.review_state)
  );
  return private.c1_material_ack(
    v_proposal.id, v_proposal.version, false, v_proposal.review_state
  );
end;
$$;

create function private.c1_material_submit_proposal(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_expected_version bigint;
  v_revision_id uuid := gen_random_uuid();
  v_revision_no bigint;
  v_receipt public.cost_command_receipts%rowtype;
  v_proposal public.material_proposals%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.proposal.submit');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.proposal.submit');
  perform private.c1_workflow_require_keys(
    target_input, array['expectedVersion'], array['expectedVersion']
  );
  v_expected_version := private.c1_material_version(target_input->'expectedVersion');
  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.submit_proposal', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(
      v_receipt.result_resource_id, v_receipt.result_version, true
    );
  end if;

  select proposal.* into v_proposal
  from public.material_proposals as proposal
  where proposal.id = target_id
    and proposal.tenant_id = v_tenant_id
    and proposal.company_id = target_company_id
    and proposal.project_id = target_project_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if v_proposal.created_by <> auth.uid() then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  if v_proposal.review_state not in ('draft','returned') then
    raise exception using errcode='P0001', message='PROPOSAL_NOT_EDITABLE';
  end if;
  if v_proposal.version <> v_expected_version then
    raise exception using errcode='P0001', message='VERSION_CONFLICT';
  end if;
  if not exists (
    select 1 from public.material_proposal_lines as line
    where line.proposal_id = v_proposal.id
      and line.tenant_id = v_tenant_id
      and line.company_id = target_company_id
      and line.project_id = target_project_id
      and line.is_active
  ) then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;

  perform line.id
  from public.material_proposal_lines as line
  where line.proposal_id = v_proposal.id
    and line.tenant_id = v_tenant_id
    and line.company_id = target_company_id
    and line.project_id = target_project_id
  order by line.id
  for update;

  if exists (
    select 1
    from public.material_proposal_lines as line
    join public.material_order_allocations as allocation
      on allocation.proposal_line_id = line.id
     and allocation.tenant_id = line.tenant_id
     and allocation.company_id = line.company_id
     and allocation.project_id = line.project_id
    join public.material_order_contracts as contract_link
      on contract_link.order_id = allocation.order_id
     and contract_link.tenant_id = allocation.tenant_id
     and contract_link.company_id = allocation.company_id
     and contract_link.project_id = allocation.project_id
    where line.proposal_id = v_proposal.id
      and line.tenant_id = v_tenant_id
      and line.company_id = target_company_id
      and line.project_id = target_project_id
    group by line.id, line.quantity
    having (not bool_and(line.is_active)) or sum(allocation.quantity) > line.quantity
  ) then
    raise exception using errcode='P0001', message='SIGNED_QUANTITY_CONFLICT';
  end if;

  if exists (
    select 1
    from public.material_proposal_lines as line
    join public.material_order_allocations as allocation
      on allocation.proposal_line_id = line.id
     and allocation.tenant_id = line.tenant_id
     and allocation.company_id = line.company_id
     and allocation.project_id = line.project_id
    join public.material_orders as existing_order
      on existing_order.id = allocation.order_id
     and existing_order.tenant_id = allocation.tenant_id
     and existing_order.company_id = allocation.company_id
     and existing_order.project_id = allocation.project_id
    where line.proposal_id = v_proposal.id
      and line.tenant_id = v_tenant_id
      and line.company_id = target_company_id
      and line.project_id = target_project_id
      and existing_order.state <> 'cancelled'
    group by line.id, line.quantity
    having (not bool_and(line.is_active)) or sum(allocation.quantity) > line.quantity
  ) then
    raise exception using errcode='P0001', message='MATERIAL_ALLOCATION_EXCEEDED';
  end if;

  select coalesce(max(revision.revision_no), 0) + 1
  into v_revision_no
  from public.material_proposal_revisions as revision
  where revision.proposal_id = v_proposal.id
    and revision.tenant_id = v_tenant_id
    and revision.company_id = target_company_id
    and revision.project_id = target_project_id;

  insert into public.material_proposal_revisions(
    id, tenant_id, company_id, project_id, proposal_id, revision_no,
    needed_on, delivery_address, notes, submitted_by
  ) values (
    v_revision_id, v_tenant_id, target_company_id, target_project_id, v_proposal.id,
    v_revision_no, v_proposal.needed_on, v_proposal.delivery_address, v_proposal.notes, auth.uid()
  );

  insert into public.material_proposal_revision_lines(
    revision_id, proposal_line_id, proposal_id, tenant_id, company_id, project_id,
    material_id, material_name, specification, unit, quantity
  )
  select
    v_revision_id,
    line.id,
    line.proposal_id,
    line.tenant_id,
    line.company_id,
    line.project_id,
    line.material_id,
    item.name,
    item.specification,
    item.unit,
    line.quantity
  from public.material_proposal_lines as line
  join public.material_items as item
    on item.id = line.material_id
   and item.tenant_id = line.tenant_id
   and item.company_id = line.company_id
  where line.proposal_id = v_proposal.id
    and line.tenant_id = v_tenant_id
    and line.company_id = target_company_id
    and line.project_id = target_project_id
    and line.is_active
  order by line.id;

  update public.material_proposals as proposal
  set review_state = 'submitted',
      current_revision_id = v_revision_id,
      approved_revision_id = null,
      version = proposal.version + 1,
      updated_at = now()
  where proposal.id = v_proposal.id
  returning proposal.* into v_proposal;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.submit_proposal', target_idempotency_key, v_hash,
    v_proposal.id, v_proposal.version, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id,
      'revisionId', v_revision_id,
      'reviewState', v_proposal.review_state
    )
  );
  return private.c1_material_ack(
    v_proposal.id, v_proposal.version, false, v_proposal.review_state
  );
end;
$$;

create function private.c1_material_decide_proposal(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_expected_version bigint;
  v_decision text;
  v_reason text;
  v_receipt public.cost_command_receipts%rowtype;
  v_proposal public.material_proposals%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.proposal.decide');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.proposal.decide');
  perform private.c1_workflow_require_keys(
    target_input,
    array['expectedVersion','decision'],
    array['expectedVersion','decision','reason']
  );
  v_expected_version := private.c1_material_version(target_input->'expectedVersion');
  v_decision := target_input->>'decision';
  if v_decision not in ('approve','return') then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  if target_input ? 'reason' then v_reason := private.c1_workflow_text(target_input->'reason'); end if;
  if v_decision = 'return' and v_reason is null then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.decide_proposal', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(
      v_receipt.result_resource_id, v_receipt.result_version, true
    );
  end if;

  select proposal.* into v_proposal
  from public.material_proposals as proposal
  where proposal.id = target_id
    and proposal.tenant_id = v_tenant_id
    and proposal.company_id = target_company_id
    and proposal.project_id = target_project_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if v_proposal.version <> v_expected_version then
    raise exception using errcode='P0001', message='VERSION_CONFLICT';
  end if;
  if v_proposal.current_revision_id is null
    or (v_decision = 'approve' and v_proposal.review_state <> 'submitted')
    or (v_decision = 'return' and v_proposal.review_state not in ('submitted','approved'))
  then
    raise exception using errcode='P0001', message='PROPOSAL_NOT_DECIDABLE';
  end if;

  insert into public.material_proposal_decisions(
    tenant_id, company_id, project_id, proposal_id, revision_id,
    proposal_version, decision, reason, decided_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_proposal.id,
    v_proposal.current_revision_id, v_proposal.version, v_decision, v_reason, auth.uid()
  );

  update public.material_proposals as proposal
  set review_state = case when v_decision = 'approve' then 'approved' else 'returned' end,
      approved_revision_id = case when v_decision = 'approve' then proposal.current_revision_id end,
      version = proposal.version + 1,
      updated_at = now()
  where proposal.id = v_proposal.id
  returning proposal.* into v_proposal;

  if v_decision = 'return' then
    update public.material_orders as material_order
    set state = 'suspended',
        version = material_order.version + 1,
        updated_at = now()
    where material_order.proposal_id = v_proposal.id
      and material_order.tenant_id = v_tenant_id
      and material_order.company_id = target_company_id
      and material_order.project_id = target_project_id
      and material_order.state = 'active'
      and not exists (
        select 1 from public.material_order_contracts as contract_link
        where contract_link.order_id = material_order.id
          and contract_link.tenant_id = material_order.tenant_id
          and contract_link.company_id = material_order.company_id
          and contract_link.project_id = material_order.project_id
      );
  end if;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.decide_proposal', target_idempotency_key, v_hash,
    v_proposal.id, v_proposal.version, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id,
      'revisionId', v_proposal.current_revision_id,
      'decision', v_decision,
      'reason', v_reason,
      'reviewState', v_proposal.review_state
    )
  );
  return private.c1_material_ack(
    v_proposal.id, v_proposal.version, false, v_proposal.review_state
  );
end;
$$;

create function private.c1_material_create_order(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_hash text;
  v_revision_id uuid;
  v_supplier_id uuid;
  v_evidence_id uuid;
  v_receipt public.cost_command_receipts%rowtype;
  v_proposal public.material_proposals%rowtype;
  v_order public.material_orders%rowtype;
  v_revision_line public.material_proposal_revision_lines%rowtype;
  v_allocation jsonb;
  v_line_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_allocated numeric;
  v_seen_ids uuid[] := array[]::uuid[];
begin
  v_context := private.c1_material_context(target_company_id, 'material.order.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.order.manage');
  perform private.c1_workflow_require_keys(
    target_input,
    array['approvedRevisionId','supplierId','currencyCode','unsignedQuotationEvidenceFileId','allocations'],
    array['approvedRevisionId','supplierId','currencyCode','unsignedQuotationEvidenceFileId','allocations']
  );
  v_revision_id := private.c1_material_uuid(target_input->'approvedRevisionId');
  v_supplier_id := private.c1_material_uuid(target_input->'supplierId');
  v_evidence_id := private.c1_material_uuid(target_input->'unsignedQuotationEvidenceFileId');
  if jsonb_typeof(target_input->'currencyCode') is distinct from 'string'
    or target_input->>'currencyCode' !~ '^[A-Z]{3}$'
    or jsonb_typeof(target_input->'allocations') is distinct from 'array'
    or jsonb_array_length(target_input->'allocations') not between 1 and 1000
  then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.create_order', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    return private.c1_material_ack(
      v_receipt.result_resource_id, v_receipt.result_version, true
    );
  end if;

  if (private.c1_material_require_project(
    v_tenant_id, target_company_id, target_project_id
  )).operational_state = 'completed' then
    raise exception using errcode='P0001', message='PROJECT_COMPLETED';
  end if;

  select proposal.* into v_proposal
  from public.material_proposals as proposal
  where proposal.id = target_id
    and proposal.tenant_id = v_tenant_id
    and proposal.company_id = target_company_id
    and proposal.project_id = target_project_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if v_proposal.review_state <> 'approved'
    or v_proposal.approved_revision_id is distinct from v_revision_id
  then
    raise exception using errcode='P0001', message='PROPOSAL_NOT_APPROVED';
  end if;
  if not exists (
    select 1 from public.business_parties as supplier
    where supplier.id = v_supplier_id
      and supplier.tenant_id = v_tenant_id
      and supplier.company_id = target_company_id
      and supplier.party_kind = 'organization'
      and supplier.is_active
  ) then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if not exists (
    select 1
    from public.cost_evidence_files as evidence
    join public.material_evidence_scopes as evidence_scope
      on evidence_scope.evidence_file_id = evidence.id
     and evidence_scope.tenant_id = evidence.tenant_id
     and evidence_scope.company_id = evidence.company_id
     and evidence_scope.project_id = evidence.project_id
    where evidence.id = v_evidence_id
      and evidence.tenant_id = v_tenant_id
      and evidence.company_id = target_company_id
      and evidence.project_id = target_project_id
      and evidence.status = 'finalized'
      and lower(coalesce(evidence.verified_mime_type, evidence.declared_mime_type)) = 'application/pdf'
      and evidence_scope.target_kind = 'material_proposal'
      and evidence_scope.proposal_id = v_proposal.id
      and evidence_scope.revision_id = v_revision_id
  ) then
    raise exception using errcode='P0001', message='EVIDENCE_UPLOAD_MISMATCH';
  end if;

  for v_allocation in select entry.value from jsonb_array_elements(target_input->'allocations') as entry(value)
  loop
    perform private.c1_workflow_require_keys(
      v_allocation,
      array['proposalLineId','quantity','unitPrice','quotationMaterialName','mappingConfirmed'],
      array['proposalLineId','quantity','unitPrice','quotationMaterialName','mappingConfirmed']
    );
    v_line_id := private.c1_material_uuid(v_allocation->'proposalLineId');
    perform private.c1_material_positive(v_allocation->'quantity');
    perform private.c1_material_positive(v_allocation->'unitPrice');
    perform private.c1_material_short_text(v_allocation->'quotationMaterialName');
    if v_allocation->'mappingConfirmed' is distinct from 'true'::jsonb
      or v_line_id = any(v_seen_ids)
    then
      raise exception using errcode='P0001', message='INPUT_INVALID';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_line_id);
  end loop;

  perform line.id
  from public.material_proposal_lines as line
  where line.id = any(v_seen_ids)
    and line.proposal_id = v_proposal.id
    and line.tenant_id = v_tenant_id
    and line.company_id = target_company_id
    and line.project_id = target_project_id
  order by line.id
  for update;
  if (
    select count(*)
    from public.material_proposal_lines as line
    where line.id = any(v_seen_ids)
      and line.proposal_id = v_proposal.id
      and line.tenant_id = v_tenant_id
      and line.company_id = target_company_id
      and line.project_id = target_project_id
  ) <> cardinality(v_seen_ids) then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;

  for v_allocation in select entry.value from jsonb_array_elements(target_input->'allocations') as entry(value)
  loop
    v_line_id := private.c1_material_uuid(v_allocation->'proposalLineId');
    v_quantity := private.c1_material_positive(v_allocation->'quantity');
    v_unit_price := private.c1_material_positive(v_allocation->'unitPrice');
    select revision_line.* into v_revision_line
    from public.material_proposal_revision_lines as revision_line
    where revision_line.revision_id = v_revision_id
      and revision_line.proposal_line_id = v_line_id
      and revision_line.proposal_id = v_proposal.id
      and revision_line.tenant_id = v_tenant_id
      and revision_line.company_id = target_company_id
      and revision_line.project_id = target_project_id;
    if not found then
      raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
    end if;
    select coalesce(sum(allocation.quantity), 0)
    into v_allocated
    from public.material_order_allocations as allocation
    join public.material_orders as existing_order
      on existing_order.id = allocation.order_id
     and existing_order.tenant_id = allocation.tenant_id
     and existing_order.company_id = allocation.company_id
     and existing_order.project_id = allocation.project_id
    where allocation.proposal_line_id = v_line_id
      and allocation.tenant_id = v_tenant_id
      and allocation.company_id = target_company_id
      and allocation.project_id = target_project_id
      and existing_order.state <> 'cancelled';
    if v_allocated + v_quantity > v_revision_line.quantity then
      raise exception using errcode='P0001', message='MATERIAL_ALLOCATION_EXCEEDED';
    end if;
  end loop;

  insert into public.material_orders(
    tenant_id, company_id, project_id, proposal_id, approved_revision_id,
    supplier_id, currency_code, unsigned_quotation_evidence_file_id, created_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_proposal.id, v_revision_id,
    v_supplier_id, target_input->>'currencyCode', v_evidence_id, auth.uid()
  )
  returning * into v_order;

  for v_allocation in select entry.value from jsonb_array_elements(target_input->'allocations') as entry(value)
  loop
    insert into public.material_order_allocations(
      tenant_id, company_id, project_id, order_id, proposal_id, approved_revision_id,
      proposal_line_id, quantity, unit_price, quotation_material_name, mapping_confirmed
    ) values (
      v_tenant_id,
      target_company_id,
      target_project_id,
      v_order.id,
      v_proposal.id,
      v_revision_id,
      private.c1_material_uuid(v_allocation->'proposalLineId'),
      private.c1_material_positive(v_allocation->'quantity'),
      private.c1_material_positive(v_allocation->'unitPrice'),
      private.c1_material_short_text(v_allocation->'quotationMaterialName'),
      true
    );
  end loop;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.create_order', target_idempotency_key, v_hash,
    v_order.id, v_order.version, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id,
      'proposalId', v_proposal.id,
      'approvedRevisionId', v_revision_id,
      'supplierId', v_supplier_id
    )
  );
  return private.c1_material_ack(v_order.id, v_order.version, false);
end;
$$;

create function private.c1_material_list_orders(
  target_company_id uuid,
  target_project_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_result jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id) then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  select coalesce(jsonb_agg(
    private.c1_material_order_json(v_tenant_id, target_company_id, target_project_id, material_order.id)
    order by material_order.created_at desc, material_order.id
  ), '[]'::jsonb)
  into v_result
  from public.material_orders as material_order
  where material_order.tenant_id = v_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id
    and material_order.state <> 'cancelled';
  return v_result;
end;
$$;

create function private.c1_material_read_order(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id) then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  return private.c1_material_order_json(
    v_tenant_id, target_company_id, target_project_id, target_id
  );
end;
$$;

create function public.c1_material_list_projects(target_company_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.c1_material_list_projects(target_company_id);
$$;
create function public.c1_material_list_items(target_company_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.c1_material_list_items(target_company_id);
$$;
create function public.c1_material_create_item(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_create_item(target_company_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_update_item(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_update_item(target_company_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_list_supplier_names(target_company_id uuid,target_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.c1_material_list_supplier_names(target_company_id,target_id);
$$;
create function public.c1_material_record_supplier_name(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_record_supplier_name(target_company_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_resolve_supplier(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_resolve_supplier(target_company_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_list_proposals(target_company_id uuid,target_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.c1_material_list_proposals(target_company_id,target_project_id);
$$;
create function public.c1_material_read_proposal(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.c1_material_read_proposal(target_company_id,target_project_id,target_id);
$$;
create function public.c1_material_create_proposal(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_create_proposal(target_company_id,target_project_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_update_proposal(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_update_proposal(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_submit_proposal(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_submit_proposal(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_decide_proposal(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_decide_proposal(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_create_order(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select private.c1_material_create_order(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_list_orders(target_company_id uuid,target_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.c1_material_list_orders(target_company_id,target_project_id);
$$;
create function public.c1_material_read_order(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.c1_material_read_order(target_company_id,target_project_id,target_id);
$$;

revoke all on function
  private.c1_material_context(uuid,text),
  private.c1_material_short_text(jsonb),
  private.c1_material_uuid(jsonb),
  private.c1_material_version(jsonb),
  private.c1_material_positive(jsonb),
  private.c1_material_ack(uuid,bigint,boolean,text),
  private.c1_material_require_project(uuid,uuid,uuid),
  private.c1_material_proposal_json(uuid,uuid,uuid,uuid),
  private.c1_material_order_json(uuid,uuid,uuid,uuid),
  private.c1_material_list_projects(uuid),
  private.c1_material_list_items(uuid),
  private.c1_material_create_item(uuid,jsonb,uuid,uuid),
  private.c1_material_update_item(uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_list_supplier_names(uuid,uuid),
  private.c1_material_record_supplier_name(uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_resolve_supplier(uuid,jsonb,uuid,uuid),
  private.c1_material_list_proposals(uuid,uuid),
  private.c1_material_read_proposal(uuid,uuid,uuid),
  private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_decide_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_list_orders(uuid,uuid),
  private.c1_material_read_order(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

revoke all on function
  public.c1_material_list_projects(uuid),
  public.c1_material_list_items(uuid),
  public.c1_material_create_item(uuid,jsonb,uuid,uuid),
  public.c1_material_update_item(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_list_supplier_names(uuid,uuid),
  public.c1_material_record_supplier_name(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_resolve_supplier(uuid,jsonb,uuid,uuid),
  public.c1_material_list_proposals(uuid,uuid),
  public.c1_material_read_proposal(uuid,uuid,uuid),
  public.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_decide_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_list_orders(uuid,uuid),
  public.c1_material_read_order(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

grant execute on function
  public.c1_material_list_projects(uuid),
  public.c1_material_list_items(uuid),
  public.c1_material_create_item(uuid,jsonb,uuid,uuid),
  public.c1_material_update_item(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_list_supplier_names(uuid,uuid),
  public.c1_material_record_supplier_name(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_resolve_supplier(uuid,jsonb,uuid,uuid),
  public.c1_material_list_proposals(uuid,uuid),
  public.c1_material_read_proposal(uuid,uuid,uuid),
  public.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_decide_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_list_orders(uuid,uuid),
  public.c1_material_read_order(uuid,uuid,uuid)
to authenticated;
