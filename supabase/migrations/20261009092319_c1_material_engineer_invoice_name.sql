set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 47);

alter table public.material_proposal_lines
  add column engineer_proposed_invoice_name text
  check (
    engineer_proposed_invoice_name is null
    or (
      btrim(engineer_proposed_invoice_name) <> ''
      and char_length(engineer_proposed_invoice_name) <= 200
    )
  );

alter table public.material_proposal_revision_lines
  add column engineer_proposed_invoice_name text
  check (
    engineer_proposed_invoice_name is null
    or (
      btrim(engineer_proposed_invoice_name) <> ''
      and char_length(engineer_proposed_invoice_name) <= 200
    )
  );

create function private.c1_material_engineer_invoice_name(target_value jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare
  v_value text;
begin
  if target_value is null or target_value = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(target_value) is distinct from 'string' then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  v_value := nullif(btrim(target_value #>> '{}'), '');
  if v_value is not null and char_length(v_value) > 200 then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  return v_value;
end;
$$;

revoke all on function private.c1_material_engineer_invoice_name(jsonb) from public, anon, authenticated, service_role;

do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := $anchor$
      'unit', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.unit else item.unit end,
      'allocatedQuantity',$anchor$;
  v_replacement text := $replacement$
      'unit', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.unit else item.unit end,
      'engineerProposedInvoiceName', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.engineer_proposed_invoice_name else line.engineer_proposed_invoice_name end,
      'buyerProposedInvoiceName', null,
      'effectiveInvoiceDisplayName', coalesce(
        case when v_proposal.review_state in ('submitted','approved')
          then snapshot.engineer_proposed_invoice_name else line.engineer_proposed_invoice_name end,
        case when v_proposal.review_state in ('submitted','approved')
          then snapshot.material_name else item.name end
      ),
      'invoiceDisplayNameSource', case when (
        case when v_proposal.review_state in ('submitted','approved')
          then snapshot.engineer_proposed_invoice_name else line.engineer_proposed_invoice_name end
      ) is null then 'canonical' else 'engineer' end,
      'buyerOverrideVersion', 0,
      'allocatedQuantity',$replacement$;
begin
  if to_regprocedure('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor)
    or position('engineerProposedInvoiceName' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_anchor, v_replacement);
  if v_corrected = v_definition then
    raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT';
  end if;
  execute v_corrected;
end;
$$;

do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := $anchor$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity']$anchor$;
  v_replacement text := $replacement$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity','proposedInvoiceName']$replacement$;
begin
  if to_regprocedure('private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor)
    or length(v_definition) - length(replace(v_definition, '  v_material_id uuid;', '')) <> length('  v_material_id uuid;')
    or length(v_definition) - length(replace(v_definition, '    v_material_id := private.c1_material_uuid(v_line->''materialId'');', '')) <> length('    v_material_id := private.c1_material_uuid(v_line->''materialId'');')
    or length(v_definition) - length(replace(v_definition, '      id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by', '')) <> length('      id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by')
    or length(v_definition) - length(replace(v_definition, '      private.c1_material_positive(v_line->''quantity''),' || chr(10) || '      auth.uid()', '')) <> length('      private.c1_material_positive(v_line->''quantity''),' || chr(10) || '      auth.uid()')
    or position('engineer_proposed_invoice_name' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, '  v_material_id uuid;', '  v_material_id uuid;' || chr(10) || '  v_engineer_proposed_invoice_name text;');
  v_corrected := replace(v_corrected, v_anchor, v_replacement);
  v_corrected := replace(
    v_corrected,
    '    v_material_id := private.c1_material_uuid(v_line->''materialId'');',
    '    v_material_id := private.c1_material_uuid(v_line->''materialId'');' || chr(10)
      || '    v_engineer_proposed_invoice_name := private.c1_material_engineer_invoice_name(v_line->''proposedInvoiceName'');'
  );
  v_corrected := replace(
    v_corrected,
    '      id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by',
    '      id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, engineer_proposed_invoice_name, created_by'
  );
  v_corrected := replace(
    v_corrected,
    '      private.c1_material_positive(v_line->''quantity''),' || chr(10) || '      auth.uid()',
    '      private.c1_material_positive(v_line->''quantity''),' || chr(10)
      || '      v_engineer_proposed_invoice_name,' || chr(10) || '      auth.uid()'
  );
  if v_corrected = v_definition
    or position('v_engineer_proposed_invoice_name' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;

do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := $anchor$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity']$anchor$;
  v_replacement text := $replacement$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity','proposedInvoiceName']$replacement$;
begin
  if to_regprocedure('private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor)
    or length(v_definition) - length(replace(v_definition, '  v_quantity numeric;', '')) <> length('  v_quantity numeric;')
    or length(v_definition) - length(replace(v_definition, '    v_quantity := private.c1_material_positive(v_line->''quantity'');', '')) <> length('    v_quantity := private.c1_material_positive(v_line->''quantity'');')
    or length(v_definition) - length(replace(v_definition, '        id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by', '')) <> length('        id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by')
    or length(v_definition) - length(replace(v_definition, '        v_proposal.id, v_material_id, v_quantity, auth.uid()', '')) <> length('        v_proposal.id, v_material_id, v_quantity, auth.uid()')
    or length(v_definition) - length(replace(v_definition, '      set quantity = v_quantity, is_active = true, updated_at = now()', '')) <> length('      set quantity = v_quantity, is_active = true, updated_at = now()')
    or position('engineer_proposed_invoice_name' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, '  v_quantity numeric;', '  v_quantity numeric;' || chr(10) || '  v_engineer_proposed_invoice_name text;');
  v_corrected := replace(v_corrected, v_anchor, v_replacement);
  v_corrected := replace(
    v_corrected,
    '    v_quantity := private.c1_material_positive(v_line->''quantity'');',
    '    v_quantity := private.c1_material_positive(v_line->''quantity'');' || chr(10)
      || '    v_engineer_proposed_invoice_name := private.c1_material_engineer_invoice_name(v_line->''proposedInvoiceName'');'
  );
  v_corrected := replace(
    v_corrected,
    '        id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, created_by',
    '        id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, engineer_proposed_invoice_name, created_by'
  );
  v_corrected := replace(
    v_corrected,
    '        v_proposal.id, v_material_id, v_quantity, auth.uid()',
    '        v_proposal.id, v_material_id, v_quantity, v_engineer_proposed_invoice_name, auth.uid()'
  );
  v_corrected := replace(
    v_corrected,
    '      set quantity = v_quantity, is_active = true, updated_at = now()',
    '      set quantity = v_quantity, engineer_proposed_invoice_name = v_engineer_proposed_invoice_name,' || chr(10)
      || '          is_active = true, updated_at = now()'
  );
  if v_corrected = v_definition
    or position('v_engineer_proposed_invoice_name' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;

do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := $anchor$    material_id, material_name, specification, unit, quantity$anchor$;
  v_replacement text := $replacement$    material_id, material_name, specification, unit, quantity, engineer_proposed_invoice_name$replacement$;
begin
  if to_regprocedure('private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor)
    or length(v_definition) - length(replace(v_definition, '    item.unit,' || chr(10) || '    line.quantity', '')) <> length('    item.unit,' || chr(10) || '    line.quantity')
    or position('engineer_proposed_invoice_name' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_anchor, v_replacement);
  v_corrected := replace(
    v_corrected,
    '    item.unit,' || chr(10) || '    line.quantity',
    '    item.unit,' || chr(10) || '    line.quantity,' || chr(10) || '    line.engineer_proposed_invoice_name'
  );
  if v_corrected = v_definition
    or position('line.engineer_proposed_invoice_name' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;
