set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 59);

-- C1: proposals no longer carry an engineer-proposed or buyer-override invoice name.
-- The accountant's invoice line name (material_invoice_lines.invoice_material_name)
-- is the only invoice name left. Existing name data is dropped, not migrated.
--
-- The four proposal functions are patched by anchor over their current definitions,
-- which are layered patches (20261008125304 baseline, then 20261009092319,
-- 20261009103933, 20261010032646, 20261015090600, 20261016090000). Each anchor must
-- occur exactly once, so every other earlier patch (line notes, currentRevisionId,
-- contractStatus with documentation, orderProgress) is preserved unchanged.
-- pg_get_functiondef returns LF line endings; CR is stripped from the definition and
-- from every anchor and replacement so a CRLF checkout of this file still matches.

-- Proposal JSON ------------------------------------------------------------------
do $$
declare
  v_anchors text[] := array[
    $anchor$
  left join public.material_proposal_invoice_name_overrides as override
    on v_proposal.review_state in ('submitted','approved')
   and override.revision_id = snapshot.revision_id
   and override.proposal_line_id = line.id
   and override.tenant_id = line.tenant_id
   and override.company_id = line.company_id
   and override.project_id = line.project_id
  where line.proposal_id = v_proposal.id$anchor$,
    $anchor$
      'engineerProposedInvoiceName', case when v_proposal.review_state in ('submitted','approved')
        then snapshot.engineer_proposed_invoice_name else line.engineer_proposed_invoice_name end,
      'buyerProposedInvoiceName', override.proposed_invoice_name,
      'effectiveInvoiceDisplayName', coalesce(
        override.proposed_invoice_name,
        case when v_proposal.review_state in ('submitted','approved')
          then snapshot.engineer_proposed_invoice_name else line.engineer_proposed_invoice_name end,
        case when v_proposal.review_state in ('submitted','approved')
          then snapshot.material_name else item.name end
      ),
      'invoiceDisplayNameSource', case
        when override.proposed_invoice_name is not null then 'buyer'
        when (case when v_proposal.review_state in ('submitted','approved')
          then snapshot.engineer_proposed_invoice_name else line.engineer_proposed_invoice_name end) is not null then 'engineer'
        else 'canonical'
      end,
      'buyerOverrideVersion', coalesce(override.version, 0),
      'buyerInvoiceNameEditable', v_proposal.review_state in ('submitted','approved')
        and snapshot.revision_id = v_proposal.current_revision_id
        and not exists (
          select 1
          from public.material_order_allocations as allocation
          join public.material_orders as material_order
            on material_order.id = allocation.order_id
           and material_order.tenant_id = allocation.tenant_id
           and material_order.company_id = allocation.company_id
           and material_order.project_id = allocation.project_id
          where allocation.approved_revision_id = snapshot.revision_id
            and allocation.proposal_line_id = line.id
            and allocation.tenant_id = line.tenant_id
            and allocation.company_id = line.company_id
            and allocation.project_id = line.project_id
            and material_order.state <> 'cancelled'
        ),
      'allocatedQuantity',$anchor$
  ];
  v_replacements text[] := array[
    $replacement$
  where line.proposal_id = v_proposal.id$replacement$,
    $replacement$
      'allocatedQuantity',$replacement$
  ];
  v_forbidden text[] := array[
    'engineerProposedInvoiceName', 'buyerProposedInvoiceName', 'effectiveInvoiceDisplayName',
    'invoiceDisplayNameSource', 'buyerOverrideVersion', 'buyerInvoiceNameEditable',
    'engineer_proposed_invoice_name', 'material_proposal_invoice_name_overrides', 'override.'
  ];
  v_required text[] := array[
    $marker$'currentRevisionId', v_proposal.current_revision_id$marker$,
    $marker$then snapshot.notes else line.notes end$marker$,
    $marker$'documentation', contract.documentation$marker$,
    $marker$'orderProgress'$marker$,
    $marker$'allocatedQuantity'$marker$
  ];
  v_definition text;
  v_anchor text;
  v_marker text;
  v_index integer;
begin
  if to_regprocedure('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_BASELINE_MISSING';
  end if;
  v_definition := replace(
    pg_get_functiondef('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)'::regprocedure), chr(13), ''
  );
  for v_index in 1 .. cardinality(v_anchors) loop
    v_anchor := replace(v_anchors[v_index], chr(13), '');
    if length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor) then
      raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT';
    end if;
    v_definition := replace(v_definition, v_anchor, replace(v_replacements[v_index], chr(13), ''));
  end loop;
  foreach v_marker in array v_forbidden loop
    if position(v_marker in v_definition) > 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT';
    end if;
  end loop;
  foreach v_marker in array v_required loop
    if position(v_marker in v_definition) = 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT';
    end if;
  end loop;
  execute v_definition;
end;
$$;

-- Create proposal: lines accept only lineId, materialId, quantity and notes -------
do $$
declare
  v_anchors text[] := array[
    $anchor$
  v_engineer_proposed_invoice_name text;$anchor$,
    $anchor$array['lineId','materialId','quantity','proposedInvoiceName','notes']$anchor$,
    $anchor$
    v_engineer_proposed_invoice_name := private.c1_material_engineer_invoice_name(v_line->'proposedInvoiceName');$anchor$,
    $anchor$quantity, engineer_proposed_invoice_name, notes, created_by$anchor$,
    $anchor$
      v_engineer_proposed_invoice_name,
      v_line_notes,$anchor$
  ];
  v_replacements text[] := array[
    '',
    $replacement$array['lineId','materialId','quantity','notes']$replacement$,
    '',
    $replacement$quantity, notes, created_by$replacement$,
    $replacement$
      v_line_notes,$replacement$
  ];
  v_forbidden text[] := array[
    'engineer_proposed_invoice_name', 'proposedInvoiceName', 'c1_material_engineer_invoice_name'
  ];
  v_required text[] := array[
    $marker$array['lineId','materialId','quantity'], array['lineId','materialId','quantity','notes']$marker$,
    $marker$v_line_notes := private.c1_material_line_notes(v_line->'notes');$marker$,
    $marker$quantity, notes, created_by$marker$
  ];
  v_definition text;
  v_anchor text;
  v_marker text;
  v_index integer;
begin
  if to_regprocedure('private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_BASELINE_MISSING';
  end if;
  v_definition := replace(
    pg_get_functiondef('private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)'::regprocedure), chr(13), ''
  );
  for v_index in 1 .. cardinality(v_anchors) loop
    v_anchor := replace(v_anchors[v_index], chr(13), '');
    if length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor) then
      raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_FUNCTION_DRIFT';
    end if;
    v_definition := replace(v_definition, v_anchor, replace(v_replacements[v_index], chr(13), ''));
  end loop;
  foreach v_marker in array v_forbidden loop
    if position(v_marker in v_definition) > 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_FUNCTION_DRIFT';
    end if;
  end loop;
  foreach v_marker in array v_required loop
    if position(v_marker in v_definition) = 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_CREATE_PROPOSAL_FUNCTION_DRIFT';
    end if;
  end loop;
  execute v_definition;
end;
$$;

-- Update proposal: same line keys; notes keep their omitted-key behavior ----------
do $$
declare
  v_anchors text[] := array[
    $anchor$
  v_engineer_proposed_invoice_name text;$anchor$,
    $anchor$array['lineId','materialId','quantity','proposedInvoiceName','notes']$anchor$,
    $anchor$
    v_engineer_proposed_invoice_name := private.c1_material_engineer_invoice_name(v_line->'proposedInvoiceName');$anchor$,
    $anchor$quantity, engineer_proposed_invoice_name, notes, created_by$anchor$,
    $anchor$v_quantity, v_engineer_proposed_invoice_name, v_line_notes, auth.uid()$anchor$,
    $anchor$
      set quantity = v_quantity, engineer_proposed_invoice_name = v_engineer_proposed_invoice_name,
          notes = v_line_notes, is_active = true, updated_at = now()$anchor$
  ];
  v_replacements text[] := array[
    '',
    $replacement$array['lineId','materialId','quantity','notes']$replacement$,
    '',
    $replacement$quantity, notes, created_by$replacement$,
    $replacement$v_quantity, v_line_notes, auth.uid()$replacement$,
    $replacement$
      set quantity = v_quantity, notes = v_line_notes, is_active = true, updated_at = now()$replacement$
  ];
  v_forbidden text[] := array[
    'engineer_proposed_invoice_name', 'proposedInvoiceName', 'c1_material_engineer_invoice_name'
  ];
  v_required text[] := array[
    $marker$array['lineId','materialId','quantity'], array['lineId','materialId','quantity','notes']$marker$,
    $marker$v_line ? 'notes'$marker$,
    $marker$set quantity = v_quantity, notes = v_line_notes, is_active = true, updated_at = now()$marker$
  ];
  v_definition text;
  v_anchor text;
  v_marker text;
  v_index integer;
begin
  if to_regprocedure('private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_BASELINE_MISSING';
  end if;
  v_definition := replace(
    pg_get_functiondef('private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure), chr(13), ''
  );
  for v_index in 1 .. cardinality(v_anchors) loop
    v_anchor := replace(v_anchors[v_index], chr(13), '');
    if length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor) then
      raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_FUNCTION_DRIFT';
    end if;
    v_definition := replace(v_definition, v_anchor, replace(v_replacements[v_index], chr(13), ''));
  end loop;
  foreach v_marker in array v_forbidden loop
    if position(v_marker in v_definition) > 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_FUNCTION_DRIFT';
    end if;
  end loop;
  foreach v_marker in array v_required loop
    if position(v_marker in v_definition) = 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_UPDATE_PROPOSAL_FUNCTION_DRIFT';
    end if;
  end loop;
  execute v_definition;
end;
$$;

-- Submit proposal: the revision snapshot no longer copies an engineer name --------
do $$
declare
  v_anchors text[] := array[
    $anchor$    material_id, material_name, specification, unit, quantity, engineer_proposed_invoice_name, notes$anchor$,
    $anchor$
    line.quantity,
    line.engineer_proposed_invoice_name,
    line.notes$anchor$
  ];
  v_replacements text[] := array[
    $replacement$    material_id, material_name, specification, unit, quantity, notes$replacement$,
    $replacement$
    line.quantity,
    line.notes$replacement$
  ];
  v_forbidden text[] := array['engineer_proposed_invoice_name'];
  v_required text[] := array[
    $marker$material_id, material_name, specification, unit, quantity, notes$marker$,
    $marker$line.notes$marker$
  ];
  v_definition text;
  v_anchor text;
  v_marker text;
  v_index integer;
begin
  if to_regprocedure('private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_BASELINE_MISSING';
  end if;
  v_definition := replace(
    pg_get_functiondef('private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure), chr(13), ''
  );
  for v_index in 1 .. cardinality(v_anchors) loop
    v_anchor := replace(v_anchors[v_index], chr(13), '');
    if length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor) then
      raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_FUNCTION_DRIFT';
    end if;
    v_definition := replace(v_definition, v_anchor, replace(v_replacements[v_index], chr(13), ''));
  end loop;
  foreach v_marker in array v_forbidden loop
    if position(v_marker in v_definition) > 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_FUNCTION_DRIFT';
    end if;
  end loop;
  foreach v_marker in array v_required loop
    if position(v_marker in v_definition) = 0 then
      raise exception using errcode='P0001', message='C1_MATERIAL_SUBMIT_PROPOSAL_FUNCTION_DRIFT';
    end if;
  end loop;
  execute v_definition;
end;
$$;

-- Drop the buyer override command, its table and the engineer name helper ---------
-- Nothing else references these objects; the table has no inbound foreign keys.
drop function public.c1_material_set_proposal_invoice_name(uuid,uuid,uuid,uuid,jsonb,uuid,uuid);
drop function private.c1_material_set_proposal_invoice_name(uuid,uuid,uuid,uuid,jsonb,uuid,uuid);
drop table public.material_proposal_invoice_name_overrides;
drop function private.c1_material_engineer_invoice_name(jsonb);

-- Drop the engineer name columns. The column CHECK added with each column goes with it;
-- the whitespace CHECK from 20261009103933 is dropped explicitly, spelled as it was
-- created there (Postgres truncates the revision-line name to 63 bytes both times).
alter table public.material_proposal_lines
  drop constraint material_proposal_lines_engineer_invoice_name_whitespace_check,
  drop column engineer_proposed_invoice_name;

alter table public.material_proposal_revision_lines
  drop constraint material_proposal_revision_lines_engineer_invoice_name_whitespace_check,
  drop column engineer_proposed_invoice_name;

-- create or replace keeps existing privileges; restate the private-only rule anyway.
revoke all on function
  private.c1_material_proposal_json(uuid,uuid,uuid,uuid),
  private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
