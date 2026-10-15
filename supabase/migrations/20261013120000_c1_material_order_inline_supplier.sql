set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Order creation resolves the externally chosen supplier inside the same transaction by a code derived
-- from its name: reuse it (overwriting differing fields the buyer sent) or create it. Changing or creating
-- the supplier requires material.supplier.record. The create_order signature is unchanged, so its grants
-- and the generated types stay as they are.

-- Supplier identity code: the name in NFC, Vietnamese diacritics removed, only [a-z0-9] kept, lower-cased.
-- e.g. 'CÔNG TY TNHH SX-TM-XNK NGŨ KIM TRUNG NAM' -> 'congtytnhhsxtmxnkngukimtrungnam'.
create or replace function private.c1_material_supplier_code(target_name text)
returns text language sql immutable set search_path='' as $$
  select lower(regexp_replace(
    translate(normalize(target_name, NFC), 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'),
    '[^A-Za-z0-9]+', '', 'g'
  ))
$$;

revoke all on function private.c1_material_supplier_code(text) from public,anon,authenticated,service_role;

create or replace function private.c1_material_create_order(
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
  v_supplier_input jsonb;
  v_supplier_code text;
  v_supplier_name text;
  v_supplier_tax text;
  v_supplier_contact_name text;
  v_supplier_contact_phone text;
  v_supplier public.business_parties%rowtype;
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
    array['approvedRevisionId','supplier','currencyCode','unsignedQuotationEvidenceFileId','allocations'],
    array['approvedRevisionId','supplier','currencyCode','unsignedQuotationEvidenceFileId','allocations']
  );
  v_revision_id := private.c1_material_uuid(target_input->'approvedRevisionId');
  v_supplier_input := target_input->'supplier';
  if jsonb_typeof(v_supplier_input) is distinct from 'object' then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  perform private.c1_workflow_require_keys(
    v_supplier_input,
    array['displayName'],
    array['displayName','taxIdentifier','contactDisplayName','contactPhone']
  );
  v_supplier_name := private.c1_material_short_text(v_supplier_input->'displayName');
  v_supplier_tax := case when v_supplier_input ? 'taxIdentifier' then private.c1_workflow_text(v_supplier_input->'taxIdentifier') end;
  v_supplier_contact_name := case when v_supplier_input ? 'contactDisplayName' then private.c1_workflow_text(v_supplier_input->'contactDisplayName') end;
  v_supplier_contact_phone := case when v_supplier_input ? 'contactPhone' then private.c1_workflow_text(v_supplier_input->'contactPhone') end;
  v_supplier_code := private.c1_material_supplier_code(v_supplier_name);
  if v_supplier_code = '' then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
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

  -- Resolve the externally chosen supplier by its name-derived code plus the same company name: reuse
  -- (overwriting fields the buyer sent that differ) or create. Changing or creating it requires
  -- material.supplier.record.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'material.supplier:' || v_tenant_id::text || ':' || target_company_id::text || ':' || v_supplier_code,
    0
  ));
  select supplier.* into v_supplier
  from public.business_parties as supplier
  where supplier.tenant_id = v_tenant_id
    and supplier.company_id = target_company_id
    and supplier.code = v_supplier_code
  for update;
  if found then
    if v_supplier.party_kind <> 'organization' or not v_supplier.is_active then
      raise exception using errcode='P0001', message='SUPPLIER_UNAVAILABLE';
    end if;
    -- Company names are unique: the same code under a name that differs beyond case and spacing
    -- (diacritics, punctuation) belongs to another company and must not be merged or overwritten.
    if lower(regexp_replace(btrim(normalize(v_supplier.display_name, NFC)), '\s+', ' ', 'g'))
      is distinct from lower(regexp_replace(btrim(normalize(v_supplier_name, NFC)), '\s+', ' ', 'g'))
    then
      raise exception using errcode='P0001', message='SUPPLIER_CODE_CONFLICT';
    end if;
    if v_supplier.display_name is distinct from v_supplier_name
      or (v_supplier_tax is not null and v_supplier.tax_identifier is distinct from v_supplier_tax)
      or (v_supplier_contact_name is not null and v_supplier.contact_display_name is distinct from v_supplier_contact_name)
      or (v_supplier_contact_phone is not null and v_supplier.contact_phone is distinct from v_supplier_contact_phone)
    then
      if not private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.supplier.record') then
        raise exception using errcode='P0001', message='PERMISSION_DENIED';
      end if;
      update public.business_parties
      set display_name = v_supplier_name,
          tax_identifier = coalesce(v_supplier_tax, tax_identifier),
          contact_display_name = coalesce(v_supplier_contact_name, contact_display_name),
          contact_phone = coalesce(v_supplier_contact_phone, contact_phone),
          version = version + 1,
          updated_at = now()
      where id = v_supplier.id
      returning * into v_supplier;
    end if;
  else
    if not private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.supplier.record') then
      raise exception using errcode='P0001', message='PERMISSION_DENIED';
    end if;
    insert into public.business_parties(
      tenant_id, company_id, code, display_name, party_kind,
      tax_identifier, contact_display_name, contact_phone, created_by
    ) values (
      v_tenant_id, target_company_id, v_supplier_code, v_supplier_name, 'organization',
      v_supplier_tax, v_supplier_contact_name, v_supplier_contact_phone, auth.uid()
    )
    returning * into v_supplier;
  end if;
  v_supplier_id := v_supplier.id;

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
