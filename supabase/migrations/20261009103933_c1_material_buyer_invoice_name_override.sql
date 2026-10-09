set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 48);

alter table public.material_proposal_lines
  add constraint material_proposal_lines_engineer_invoice_name_whitespace_check
  check (
    engineer_proposed_invoice_name is null
    or engineer_proposed_invoice_name !~ '^[[:space:]]*$'
  );

alter table public.material_proposal_revision_lines
  add constraint material_proposal_revision_lines_engineer_invoice_name_whitespace_check
  check (
    engineer_proposed_invoice_name is null
    or engineer_proposed_invoice_name !~ '^[[:space:]]*$'
  );

create or replace function private.c1_material_engineer_invoice_name(target_value jsonb)
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
  if v_value is not null and char_length(v_value) > 200 then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  return v_value;
end;
$$;

revoke all on function private.c1_material_engineer_invoice_name(jsonb) from public, anon, authenticated, service_role;

create table public.material_proposal_invoice_name_overrides (
  revision_id uuid not null,
  proposal_line_id uuid not null,
  proposal_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  proposed_invoice_name text,
  version bigint not null default 0 check (version >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (revision_id, proposal_line_id),
  unique (revision_id, proposal_line_id, tenant_id, company_id, project_id),
  check (
    proposed_invoice_name is null
    or (
      proposed_invoice_name !~ '^[[:space:]]*$'
      and char_length(proposed_invoice_name) <= 200
    )
  ),
  foreign key (revision_id, proposal_id, tenant_id, company_id, project_id)
    references public.material_proposal_revisions(id, proposal_id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (proposal_line_id, proposal_id, tenant_id, company_id, project_id)
    references public.material_proposal_lines(id, proposal_id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (revision_id, proposal_line_id, tenant_id, company_id, project_id)
    references public.material_proposal_revision_lines(revision_id, proposal_line_id, tenant_id, company_id, project_id) on delete restrict
);

create index material_proposal_invoice_name_overrides_scope_idx
  on public.material_proposal_invoice_name_overrides(tenant_id, company_id, project_id, proposal_id, revision_id, proposal_line_id);

alter table public.material_proposal_invoice_name_overrides enable row level security;
alter table public.material_proposal_invoice_name_overrides force row level security;
revoke all on public.material_proposal_invoice_name_overrides from public, anon, authenticated, service_role;

create function private.c1_material_set_proposal_invoice_name(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_line_id uuid,
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
  v_expected_version bigint;
  v_proposed_invoice_name text;
  v_receipt public.cost_command_receipts%rowtype;
  v_proposal public.material_proposals%rowtype;
  v_line public.material_proposal_lines%rowtype;
  v_override public.material_proposal_invoice_name_overrides%rowtype;
  v_previous_name text;
  v_previous_version bigint := 0;
begin
  v_context := private.c1_material_context(target_company_id, 'material.order.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.order.manage');
  perform private.c1_workflow_require_keys(
    target_input,
    array['revisionId','proposedInvoiceName','expectedOverrideVersion'],
    array['revisionId','proposedInvoiceName','expectedOverrideVersion']
  );
  v_revision_id := private.c1_material_uuid(target_input->'revisionId');
  v_expected_version := private.c1_material_version(target_input->'expectedOverrideVersion');
  v_proposed_invoice_name := private.c1_material_engineer_invoice_name(target_input->'proposedInvoiceName');
  v_hash := private.c1_workflow_hash(
    target_project_id, target_id, jsonb_build_object('proposalLineId', target_line_id) || target_input
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'c1_material_proposal_invoice_name:' || v_tenant_id::text || ':' || target_company_id::text
      || ':' || auth.uid()::text || ':material.set_proposal_invoice_name:' || target_idempotency_key::text,
    0
  ));
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.set_proposal_invoice_name', target_idempotency_key, v_hash
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
  if v_proposal.review_state not in ('submitted','approved')
    or v_proposal.current_revision_id is distinct from v_revision_id
  then
    raise exception using errcode='P0001', message='VERSION_CONFLICT';
  end if;

  select line.* into v_line
  from public.material_proposal_lines as line
  where line.id = target_line_id
    and line.proposal_id = v_proposal.id
    and line.tenant_id = v_tenant_id
    and line.company_id = target_company_id
    and line.project_id = target_project_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if not exists (
    select 1
    from public.material_proposal_revision_lines as revision_line
    where revision_line.revision_id = v_revision_id
      and revision_line.proposal_line_id = v_line.id
      and revision_line.proposal_id = v_proposal.id
      and revision_line.tenant_id = v_tenant_id
      and revision_line.company_id = target_company_id
      and revision_line.project_id = target_project_id
  ) then
    raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND';
  end if;
  if exists (
    select 1
    from public.material_order_allocations as allocation
    join public.material_orders as material_order
      on material_order.id = allocation.order_id
     and material_order.tenant_id = allocation.tenant_id
     and material_order.company_id = allocation.company_id
     and material_order.project_id = allocation.project_id
    where allocation.approved_revision_id = v_revision_id
      and allocation.proposal_line_id = v_line.id
      and allocation.tenant_id = v_tenant_id
      and allocation.company_id = target_company_id
      and allocation.project_id = target_project_id
      and material_order.state <> 'cancelled'
  ) then
    raise exception using errcode='P0001', message='HISTORY_IMMUTABLE';
  end if;

  select override.* into v_override
  from public.material_proposal_invoice_name_overrides as override
  where override.revision_id = v_revision_id
    and override.proposal_line_id = v_line.id
    and override.tenant_id = v_tenant_id
    and override.company_id = target_company_id
    and override.project_id = target_project_id
  for update;
  if found then
    v_previous_name := v_override.proposed_invoice_name;
    v_previous_version := v_override.version;
  end if;
  if v_expected_version <> v_previous_version then
    raise exception using errcode='P0001', message='VERSION_CONFLICT';
  end if;

  if v_override.revision_id is null then
    insert into public.material_proposal_invoice_name_overrides(
      revision_id, proposal_line_id, proposal_id, tenant_id, company_id, project_id,
      proposed_invoice_name, version, created_by, updated_by
    ) values (
      v_revision_id, v_line.id, v_proposal.id, v_tenant_id, target_company_id, target_project_id,
      v_proposed_invoice_name, 1, auth.uid(), auth.uid()
    ) returning * into v_override;
  else
    update public.material_proposal_invoice_name_overrides as override
    set proposed_invoice_name = v_proposed_invoice_name,
        version = override.version + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where override.revision_id = v_override.revision_id
      and override.proposal_line_id = v_override.proposal_line_id
    returning * into v_override;
  end if;

  perform private.c1_workflow_record_command(
    v_tenant_id, target_company_id, 'material.set_proposal_invoice_name',
    target_idempotency_key, v_hash, v_proposal.id, v_override.version, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id,
      'revisionId', v_revision_id,
      'lineId', v_line.id,
      'overrideVersion', v_override.version
    )
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id,
    before_summary, after_summary
  ) values (
    v_tenant_id, target_company_id, auth.uid(),
    case when v_proposed_invoice_name is null
      then 'c1.material_proposal.invoice_name_override_cleared'
      else 'c1.material_proposal.invoice_name_override_set'
    end,
    'material_proposal_invoice_name_override', v_revision_id::text || ':' || v_line.id::text, target_request_id,
    jsonb_build_object('proposedInvoiceName', v_previous_name, 'version', v_previous_version),
    jsonb_build_object(
      'projectId', target_project_id,
      'proposalId', v_proposal.id,
      'revisionId', v_revision_id,
      'lineId', v_line.id,
      'proposedInvoiceName', v_override.proposed_invoice_name,
      'version', v_override.version
    )
  );
  return private.c1_material_ack(
    v_proposal.id, v_override.version, false, v_proposal.review_state
  );
end;
$$;

create function public.c1_material_set_proposal_invoice_name(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_line_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language sql volatile security definer set search_path='' as $$
  select private.c1_material_set_proposal_invoice_name(
    target_company_id, target_project_id, target_id, target_line_id,
    target_input, target_idempotency_key, target_request_id
  );
$$;

revoke all on function
  private.c1_material_set_proposal_invoice_name(uuid,uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_set_proposal_invoice_name(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)
from public, anon, authenticated, service_role;
grant execute on function
  public.c1_material_set_proposal_invoice_name(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)
to authenticated;

do $$
declare
  v_definition text;
  v_corrected text;
  v_join_anchor text := $anchor$
  left join public.material_proposal_revision_lines as snapshot
    on snapshot.revision_id = v_proposal.current_revision_id
   and snapshot.proposal_line_id = line.id
   and snapshot.tenant_id = line.tenant_id
   and snapshot.company_id = line.company_id
   and snapshot.project_id = line.project_id
  where line.proposal_id = v_proposal.id$anchor$;
  v_join_replacement text := $replacement$
  left join public.material_proposal_revision_lines as snapshot
    on snapshot.revision_id = v_proposal.current_revision_id
   and snapshot.proposal_line_id = line.id
   and snapshot.tenant_id = line.tenant_id
   and snapshot.company_id = line.company_id
   and snapshot.project_id = line.project_id
  left join public.material_proposal_invoice_name_overrides as override
    on v_proposal.review_state in ('submitted','approved')
   and override.revision_id = snapshot.revision_id
   and override.proposal_line_id = line.id
   and override.tenant_id = line.tenant_id
   and override.company_id = line.company_id
   and override.project_id = line.project_id
  where line.proposal_id = v_proposal.id$replacement$;
  v_line_anchor text := $anchor$
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
      'buyerOverrideVersion', 0,$anchor$;
  v_line_replacement text := $replacement$
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
        ),$replacement$;
  v_top_anchor text := $anchor$    'approvedRevisionId', v_proposal.approved_revision_id,$anchor$;
  v_top_replacement text := $replacement$    'approvedRevisionId', v_proposal.approved_revision_id,
    'currentRevisionId', v_proposal.current_revision_id,$replacement$;
begin
  if to_regprocedure('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_join_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_join_anchor, '')) <> length(v_join_anchor)
    or position(v_line_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_line_anchor, '')) <> length(v_line_anchor)
    or position(v_top_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_top_anchor, '')) <> length(v_top_anchor)
    or position('buyerInvoiceNameEditable' in v_definition) > 0
    or position('currentRevisionId' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_join_anchor, v_join_replacement);
  v_corrected := replace(v_corrected, v_line_anchor, v_line_replacement);
  v_corrected := replace(v_corrected, v_top_anchor, v_top_replacement);
  if v_corrected = v_definition
    or position('override.proposed_invoice_name' in v_corrected) = 0
    or position('buyerInvoiceNameEditable' in v_corrected) = 0
    or position('currentRevisionId' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;
