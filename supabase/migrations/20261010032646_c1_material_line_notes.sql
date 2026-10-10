set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 49);

alter table public.material_proposal_lines
  add column notes text,
  add constraint material_proposal_lines_notes_normalized_check
  check (
    notes is null
    or (
      notes !~ '^[[:space:]]*$'
      and notes = regexp_replace(notes, '^[[:space:]]+|[[:space:]]+$', '', 'g')
      and char_length(notes) <= 2000
    )
  );

alter table public.material_proposal_revision_lines
  add column notes text,
  add constraint material_proposal_revision_lines_notes_normalized_check
  check (
    notes is null
    or (
      notes !~ '^[[:space:]]*$'
      and notes = regexp_replace(notes, '^[[:space:]]+|[[:space:]]+$', '', 'g')
      and char_length(notes) <= 2000
    )
  );

create function private.c1_material_line_notes(target_value jsonb)
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
  v_value := nullif(regexp_replace(target_value #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  if v_value is not null and char_length(v_value) > 2000 then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  return v_value;
end;
$$;

revoke all on function private.c1_material_line_notes(jsonb) from public, anon, authenticated, service_role;

do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := $anchor$
      'unit', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.unit else item.unit end,
      'engineerProposedInvoiceName',$anchor$;
  v_replacement text := $replacement$
      'unit', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.unit else item.unit end,
      'notes', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.notes else line.notes end,
      'engineerProposedInvoiceName',$replacement$;
begin
  if to_regprocedure('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor)
    or position('then snapshot.notes else line.notes end' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_anchor, v_replacement);
  if v_corrected = v_definition
    or position('then snapshot.notes else line.notes end' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;

do $$
declare
  v_definition text;
  v_corrected text;
  v_keys_anchor text := $anchor$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity','proposedInvoiceName']$anchor$;
  v_keys_replacement text := $replacement$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity','proposedInvoiceName','notes']$replacement$;
  v_variable_anchor text := '  v_engineer_proposed_invoice_name text;';
  v_parse_anchor text := '    v_engineer_proposed_invoice_name := private.c1_material_engineer_invoice_name(v_line->''proposedInvoiceName'');';
  v_columns_anchor text := '      id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, engineer_proposed_invoice_name, created_by';
  v_values_anchor text := '      v_engineer_proposed_invoice_name,' || chr(10) || '      auth.uid()';
begin
  if to_regprocedure('private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_keys_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_keys_anchor, '')) <> length(v_keys_anchor)
    or length(v_definition) - length(replace(v_definition, v_variable_anchor, '')) <> length(v_variable_anchor)
    or length(v_definition) - length(replace(v_definition, v_parse_anchor, '')) <> length(v_parse_anchor)
    or length(v_definition) - length(replace(v_definition, v_columns_anchor, '')) <> length(v_columns_anchor)
    or length(v_definition) - length(replace(v_definition, v_values_anchor, '')) <> length(v_values_anchor)
    or position('v_line_notes' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_keys_anchor, v_keys_replacement);
  v_corrected := replace(v_corrected, v_variable_anchor, v_variable_anchor || chr(10) || '  v_line_notes text;');
  v_corrected := replace(
    v_corrected,
    v_parse_anchor,
    v_parse_anchor || chr(10) || '    v_line_notes := private.c1_material_line_notes(v_line->''notes'');'
  );
  v_corrected := replace(v_corrected, v_columns_anchor, replace(v_columns_anchor, ', created_by', ', notes, created_by'));
  v_corrected := replace(v_corrected, v_values_anchor, '      v_engineer_proposed_invoice_name,' || chr(10) || '      v_line_notes,' || chr(10) || '      auth.uid()');
  if v_corrected = v_definition
    or position('private.c1_material_line_notes(v_line->''notes'')' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;

do $$
declare
  v_definition text;
  v_corrected text;
  v_keys_anchor text := $anchor$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity','proposedInvoiceName']$anchor$;
  v_keys_replacement text := $replacement$      v_line, array['lineId','materialId','quantity'], array['lineId','materialId','quantity','proposedInvoiceName','notes']$replacement$;
  v_variable_anchor text := '  v_engineer_proposed_invoice_name text;';
  v_parse_anchor text := '    v_engineer_proposed_invoice_name := private.c1_material_engineer_invoice_name(v_line->''proposedInvoiceName'');';
  v_new_line_anchor text := '    if v_existing_line.id is null then';
  v_columns_anchor text := '        id, tenant_id, company_id, project_id, proposal_id, material_id, quantity, engineer_proposed_invoice_name, created_by';
  v_values_anchor text := '        v_proposal.id, v_material_id, v_quantity, v_engineer_proposed_invoice_name, auth.uid()';
  v_update_anchor text := '      set quantity = v_quantity, engineer_proposed_invoice_name = v_engineer_proposed_invoice_name,' || chr(10) || '          is_active = true, updated_at = now()';
begin
  if to_regprocedure('private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_keys_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_keys_anchor, '')) <> length(v_keys_anchor)
    or length(v_definition) - length(replace(v_definition, v_variable_anchor, '')) <> length(v_variable_anchor)
    or length(v_definition) - length(replace(v_definition, v_parse_anchor, '')) <> length(v_parse_anchor)
    or length(v_definition) - length(replace(v_definition, v_new_line_anchor, '')) <> length(v_new_line_anchor)
    or length(v_definition) - length(replace(v_definition, v_columns_anchor, '')) <> length(v_columns_anchor)
    or length(v_definition) - length(replace(v_definition, v_values_anchor, '')) <> length(v_values_anchor)
    or length(v_definition) - length(replace(v_definition, v_update_anchor, '')) <> length(v_update_anchor)
    or position('v_line_notes' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_keys_anchor, v_keys_replacement);
  v_corrected := replace(v_corrected, v_variable_anchor, v_variable_anchor || chr(10) || '  v_line_notes text;');
  v_corrected := replace(
    v_corrected,
    v_new_line_anchor,
    '    if v_existing_line.id is null or v_line ? ''notes'' then' || chr(10)
      || '      v_line_notes := private.c1_material_line_notes(v_line->''notes'');' || chr(10)
      || '    else' || chr(10)
      || '      v_line_notes := v_existing_line.notes;' || chr(10)
      || '    end if;' || chr(10) || chr(10)
      || v_new_line_anchor
  );
  v_corrected := replace(v_corrected, v_columns_anchor, replace(v_columns_anchor, ', created_by', ', notes, created_by'));
  v_corrected := replace(v_corrected, v_values_anchor, '        v_proposal.id, v_material_id, v_quantity, v_engineer_proposed_invoice_name, v_line_notes, auth.uid()');
  v_corrected := replace(
    v_corrected,
    v_update_anchor,
    '      set quantity = v_quantity, engineer_proposed_invoice_name = v_engineer_proposed_invoice_name,' || chr(10)
      || '          notes = v_line_notes, is_active = true, updated_at = now()'
  );
  if v_corrected = v_definition
    or position('v_line ? ''notes''' in v_corrected) = 0
    or position('notes = v_line_notes' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;

do $$
declare
  v_definition text;
  v_corrected text;
  v_columns_anchor text := $anchor$    material_id, material_name, specification, unit, quantity, engineer_proposed_invoice_name$anchor$;
  v_values_anchor text := '    line.engineer_proposed_invoice_name';
begin
  if to_regprocedure('private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_columns_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_columns_anchor, '')) <> length(v_columns_anchor)
    or length(v_definition) - length(replace(v_definition, v_values_anchor, '')) <> length(v_values_anchor)
    or position('line.notes' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_columns_anchor, v_columns_anchor || ', notes');
  v_corrected := replace(v_corrected, v_values_anchor, v_values_anchor || ',' || chr(10) || '    line.notes');
  if v_corrected = v_definition
    or position('line.notes' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;