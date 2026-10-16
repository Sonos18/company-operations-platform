set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 56);

-- A4/A5 T8 access fixes. Functions are copied from their latest definition and
-- change only what is listed; signatures, security definer, search_path and
-- grants stay as they were.
--   C1. c1_material_read_order / c1_material_list_orders also admit finance readers
--       (c1_material_can_read_finance). c1_material_can_read_order is unchanged: it
--       still drives the A3 RLS policies. c1_material_order_json is security definer
--       and already hides contract money from non-finance readers.
--   I1. Contract notifications to the proposal creator link to the proposal, and the
--       proposal JSON lists the contract status of its orders (no money).
--   M4. Installment reminder dedupe keys include the contract id.
--   M6. Cancelling an approved payment request requires material.payment.approve.
--   M7. Approving and paying re-check INVOICE_REQUIRED against the current installment.

-- C1 ---------------------------------------------------------------------------

create or replace function private.c1_material_read_order(
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
  -- Finance readers (treasurer, director, accountant) open the order page too (T8 C1).
  if not (private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id)
    or private.c1_material_can_read_finance(v_tenant_id, target_company_id)) then
    raise exception using errcode='P0001', message='PERMISSION_DENIED';
  end if;
  return private.c1_material_order_json(
    v_tenant_id, target_company_id, target_project_id, target_id
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
  -- Finance readers (treasurer, director, accountant) list orders too (T8 C1).
  if not (private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id)
    or private.c1_material_can_read_finance(v_tenant_id, target_company_id)) then
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

-- I1 ---------------------------------------------------------------------------

create or replace function private.c1_material_notify_contract_saved(
  target_contract public.material_contracts, target_order public.material_orders,
  proposal_creator uuid, version_no integer, target_total numeric
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_supplier_name text;
  v_event text := case when version_no > 1 then 'material.contract.amended' else 'material.contract.recorded' end;
  v_link text := '/materials/' || target_contract.project_id::text || '/orders/' || target_order.id::text;
  v_dedupe text := 'contract:' || target_contract.id::text || ':v' || version_no::text;
begin
  select party.display_name into v_supplier_name from public.business_parties as party
  where party.id = target_contract.supplier_id
    and party.tenant_id = target_contract.tenant_id and party.company_id = target_contract.company_id;
  perform private.c1_material_notify_permission(
    target_contract.tenant_id, target_contract.company_id, target_contract.project_id, 'material.finance.read',
    v_event, 'material_contract', target_contract.id, v_link,
    jsonb_build_object(
      'supplierName', v_supplier_name, 'contractNo', target_contract.contract_no,
      'total', target_total::numeric(20,4)::text, 'versionNo', version_no
    ),
    v_dedupe
  );
  -- The buyer opens the order page. The proposal creator (an engineer, who cannot
  -- read orders) gets a link to the proposal, which lists the contract status.
  perform private.c1_material_notify_users(
    target_contract.tenant_id, target_contract.company_id, target_contract.project_id,
    array[target_order.created_by],
    v_event, 'material_contract', target_contract.id, v_link,
    jsonb_build_object(
      'supplierName', v_supplier_name, 'contractNo', target_contract.contract_no, 'versionNo', version_no
    ),
    v_dedupe
  );
  perform private.c1_material_notify_users(
    target_contract.tenant_id, target_contract.company_id, target_contract.project_id,
    array[proposal_creator],
    v_event, 'material_contract', target_contract.id,
    '/materials/' || target_contract.project_id::text || '/proposals/' || target_order.proposal_id::text,
    jsonb_build_object(
      'supplierName', v_supplier_name, 'contractNo', target_contract.contract_no, 'versionNo', version_no
    ),
    v_dedupe
  );
end;
$$;

-- Same anchor-replacement pattern as 20261009092319, 20261009103933 and
-- 20261010032646, so every earlier patch of the proposal JSON is preserved.
do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := $anchor$
    'orderProgress', jsonb_build_object($anchor$;
  v_replacement text := $replacement$
    'contractStatus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', material_order.id,
        'contractNo', contract.contract_no,
        'signedOn', to_char(contract.signed_on, 'YYYY-MM-DD')
      ) order by contract.signed_on, material_order.id)
      from public.material_orders as material_order
      join public.material_contracts as contract
        on contract.order_id = material_order.id
       and contract.tenant_id = material_order.tenant_id
       and contract.company_id = material_order.company_id
       and contract.project_id = material_order.project_id
      where material_order.proposal_id = v_proposal.id
        and material_order.tenant_id = v_proposal.tenant_id
        and material_order.company_id = v_proposal.company_id
        and material_order.project_id = v_proposal.project_id
    ), '[]'::jsonb),
    'orderProgress', jsonb_build_object($replacement$;
begin
  -- pg_get_functiondef returns LF line endings; strip CR so a CRLF checkout of this file still matches.
  v_anchor := replace(v_anchor, chr(13), '');
  v_replacement := replace(v_replacement, chr(13), '');
  if to_regprocedure('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_BASELINE_MISSING';
  end if;
  select pg_get_functiondef('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)'::regprocedure)
  into v_definition;
  if position(v_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition, v_anchor, '')) <> length(v_anchor)
    or position('contractStatus' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_anchor, v_replacement);
  if v_corrected = v_definition or position('contractStatus' in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;

-- M4 ---------------------------------------------------------------------------

create or replace function private.c1_material_emit_installment_reminders(target_today date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row record;
  v_kind text;
  v_inserted bigint;
  v_soon bigint := 0;
  v_overdue bigint := 0;
begin
  if target_today is null then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  for v_row in
    select contract.id as contract_id, contract.tenant_id, contract.company_id, contract.project_id, contract.order_id,
           supplier.display_name as supplier_name, contract.contract_no,
           installment.installment_key, installment.name as installment_name, installment.due_on,
           installment.amount - coalesce(used.paid, 0) as remaining
    from public.material_contracts as contract
    join public.material_contract_versions as version
      on version.contract_id = contract.id and version.version_no = contract.current_version_no
    join public.material_contract_installments as installment
      on installment.contract_version_id = version.id
    join public.business_parties as supplier
      on supplier.id = contract.supplier_id
     and supplier.tenant_id = contract.tenant_id and supplier.company_id = contract.company_id
    left join private.c1_material_installment_usage(contract.id) as used
      on used.installment_key = installment.installment_key
    where installment.amount - coalesce(used.paid, 0) > 0
      and installment.due_on <= target_today + 3
    order by installment.due_on, contract.id, installment.seq
  loop
    v_kind := case when v_row.due_on < target_today then 'overdue' else 'due_soon' end;
    with inserted as (
      insert into public.app_notifications(
        tenant_id, company_id, project_id, recipient_id, event_kind, source_type, source_id, link_path, payload, dedupe_key
      )
      select v_row.tenant_id, v_row.company_id, v_row.project_id, membership.user_id,
        'material.installment.' || v_kind, 'material_installment', v_row.installment_key,
        '/materials/' || v_row.project_id::text || '/orders/' || v_row.order_id::text,
        jsonb_build_object(
          'supplierName', v_row.supplier_name,
          'contractNo', v_row.contract_no,
          'installmentName', v_row.installment_name,
          'dueOn', v_row.due_on::text,
          'remaining', v_row.remaining::text
        ),
        -- The contract id keeps keys apart even if two contracts share an installment key.
        'inst:' || v_row.contract_id::text || ':' || v_row.installment_key::text || ':' || v_kind || ':' || v_row.due_on::text
      from public.company_memberships as membership
      where membership.tenant_id = v_row.tenant_id
        and membership.company_id = v_row.company_id
        and membership.is_active
        and private.c1_workflow_user_has_permission(v_row.tenant_id, v_row.company_id, membership.user_id, 'material.contract.record')
        and private.c1_workflow_user_has_permission(v_row.tenant_id, v_row.company_id, membership.user_id, 'material.read')
      on conflict (recipient_id, dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_inserted from inserted;
    if v_kind = 'overdue' then
      v_overdue := v_overdue + v_inserted;
    else
      v_soon := v_soon + v_inserted;
    end if;
  end loop;

  return jsonb_build_object('dueSoon', v_soon, 'overdue', v_overdue);
end;
$$;

-- M6 ---------------------------------------------------------------------------

create or replace function private.c1_material_cancel_payment_request(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant_id uuid;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_contract public.material_contracts%rowtype;
  v_request public.material_payment_requests%rowtype;
  v_reason text;
begin
  -- Coarse gate before any lookup: only requesters and approvers may cancel.
  if not exists (
    select 1 from public.company_memberships as membership
    where membership.company_id = target_company_id and membership.user_id = auth.uid() and membership.is_active
      and (private.c1_workflow_user_has_permission(membership.tenant_id, target_company_id, auth.uid(), 'material.payment.request')
        or private.c1_workflow_user_has_permission(membership.tenant_id, target_company_id, auth.uid(), 'material.payment.approve'))
  ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.read', target_input,
    array['expectedVersion','reason'], array['expectedVersion','reason']
  );

  v_contract := private.c1_material_lock_contract(
    v_tenant_id, target_company_id, target_project_id,
    private.c1_material_request_contract_id(v_tenant_id, target_company_id, target_project_id, target_id));
  v_request := private.c1_material_lock_payment_request(v_contract, target_id);

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.cancel_payment_request', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  -- Per-state permission, checked under the request lock and after the replay
  -- check, so an approver repeating a successful cancel (the request is now
  -- cancelled) gets the stored result instead of PERMISSION_DENIED.
  -- Accountants (material.payment.request) cancel submitted or returned requests;
  -- an approved request can be cancelled only by an approver (T8 M6).
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id,
    case when v_request.state = 'approved' then 'material.payment.approve' else 'material.payment.request' end);

  if v_request.version <> private.c1_material_version(target_input->'expectedVersion')
    or v_request.state not in ('submitted','returned','approved')
  then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  v_reason := private.c1_material_finance_reason(target_input->'reason');

  update public.material_payment_requests as request
  set state = 'cancelled', cancel_reason = v_reason, version = request.version + 1, updated_at = now()
  where request.id = v_request.id
  returning request.* into v_request;

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.cancel_payment_request', target_idempotency_key, v_hash,
    v_request.id, v_request.version, 'c1.material_payment_request.cancelled', 'material_payment_request', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'reason', v_reason)
  );
  return private.c1_material_ack(v_request.id, v_request.version, false);
end;
$$;

-- M7 ---------------------------------------------------------------------------

create or replace function private.c1_material_decide_payment_request(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_contract public.material_contracts%rowtype;
  v_request public.material_payment_requests%rowtype;
  v_decision text;
  v_reason text;
begin
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.payment.approve', target_input,
    array['expectedVersion','decision'], array['expectedVersion','decision','reason']
  );

  v_contract := private.c1_material_lock_contract(
    v_tenant_id, target_company_id, target_project_id,
    private.c1_material_request_contract_id(v_tenant_id, target_company_id, target_project_id, target_id));
  v_request := private.c1_material_lock_payment_request(v_contract, target_id);

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.decide_payment_request', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  if v_request.version <> private.c1_material_version(target_input->'expectedVersion') or v_request.state <> 'submitted' then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  -- The latest submitter (not the original creator) may not decide (Review Focus 4).
  if v_actor_id = v_request.submitted_by then
    raise exception using errcode = 'P0001', message = 'SELF_DECISION_FORBIDDEN';
  end if;

  v_decision := target_input->>'decision';
  if jsonb_typeof(target_input->'decision') is distinct from 'string' or v_decision not in ('approve','return') then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if v_decision = 'return' then
    v_reason := private.c1_material_finance_reason(target_input->'reason');
  elsif target_input->'reason' is not null and jsonb_typeof(target_input->'reason') <> 'null' then
    -- material_payment_decisions stores a reason only for returns.
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  if v_decision = 'approve' then
    -- An amendment may have turned an advance installment into a normal one: the
    -- current installment decides whether a recorded invoice is required (T8 M7).
    if not (private.c1_material_current_installment(v_contract, v_request.installment_key)).is_advance
      and not exists (
        select 1 from public.material_payment_request_invoices as link
        join public.material_invoices as invoice on invoice.id = link.invoice_id and invoice.contract_id = link.contract_id
        where link.payment_request_id = v_request.id and invoice.state = 'recorded'
      )
    then
      raise exception using errcode = 'P0001', message = 'INVOICE_REQUIRED';
    end if;
  end if;

  -- Decisions carry no FK to revisions; the decided revision must be the
  -- request's current one with the same installment and amount.
  if not exists (
    select 1 from public.material_payment_request_revisions as revision
    where revision.payment_request_id = v_request.id and revision.revision_no = v_request.revision_no
      and revision.installment_key = v_request.installment_key and revision.amount = v_request.amount
  ) then
    raise exception using errcode = 'P0001', message = 'C1_MATERIAL_PAYMENT_REVISION_MISSING';
  end if;

  insert into public.material_payment_decisions(
    tenant_id, company_id, project_id, payment_request_id, request_revision_no, decision, reason, decided_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_request.id, v_request.revision_no, v_decision, v_reason, v_actor_id
  );

  update public.material_payment_requests as request
  set state = case when v_decision = 'approve' then 'approved' else 'returned' end,
      version = request.version + 1,
      updated_at = now()
  where request.id = v_request.id
  returning request.* into v_request;

  if v_decision = 'return' then
    perform private.c1_material_notify_users(
      v_tenant_id, target_company_id, target_project_id, array[v_request.submitted_by],
      'material.payment.returned', 'material_payment_request', v_request.id,
      private.c1_material_payment_link(v_contract),
      -- Addressed to the submitter by user id: supplier, contract and reason only, never money.
      (private.c1_material_payment_payload(v_contract, v_request.amount) - 'amount') || jsonb_build_object('reason', v_reason),
      'pr:' || v_request.id::text || ':ret:' || v_request.revision_no::text
    );
  end if;

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.decide_payment_request', target_idempotency_key, v_hash,
    v_request.id, v_request.version,
    case when v_decision = 'approve' then 'c1.material_payment_request.approved' else 'c1.material_payment_request.returned' end,
    'material_payment_request', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'decision', v_decision,
      'revisionNo', v_request.revision_no, 'reason', v_reason)
  );
  return private.c1_material_ack(v_request.id, v_request.version, false);
end;
$$;

create or replace function private.c1_material_record_payment(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_contract public.material_contracts%rowtype;
  v_request public.material_payment_requests%rowtype;
  v_paid_on date;
  v_bank_reference text;
  v_proof_file_id uuid;
  v_sha256 text;
  v_constraint text;
begin
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.payment.execute', target_input,
    array['expectedVersion','paidOn','bankReference','proofFileId'], array['expectedVersion','paidOn','bankReference','proofFileId']
  );

  v_contract := private.c1_material_lock_contract(
    v_tenant_id, target_company_id, target_project_id,
    private.c1_material_request_contract_id(v_tenant_id, target_company_id, target_project_id, target_id));
  v_request := private.c1_material_lock_payment_request(v_contract, target_id);

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.record_payment', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  if v_request.version <> private.c1_material_version(target_input->'expectedVersion') or v_request.state <> 'approved' then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if v_actor_id = v_request.submitted_by then
    raise exception using errcode = 'P0001', message = 'SELF_DECISION_FORBIDDEN';
  end if;
  v_paid_on := private.c1_workflow_date(target_input->'paidOn');
  if v_paid_on > private.c1_material_vietnam_today() then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_bank_reference := private.c1_workflow_text(target_input->'bankReference');
  if char_length(v_bank_reference) > 100 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_proof_file_id := private.c1_material_uuid(target_input->'proofFileId');

  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, v_proof_file_id,
    'material_contract', 'payment_proof', null::uuid, v_contract.id);

  select file.verified_sha256 into v_sha256 from public.cost_evidence_files as file
  where file.id = v_proof_file_id and file.tenant_id = v_tenant_id and file.company_id = target_company_id
    and file.project_id = target_project_id and file.status = 'finalized';
  if v_sha256 is null or v_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_INVALID';
  end if;
  -- The same transfer proof may back only one payment in the company, even
  -- across contracts; the advisory lock serialises the check per hash.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'material.payment_proof:' || v_tenant_id::text || ':' || target_company_id::text || ':' || v_sha256, 0));
  if exists (
    select 1 from public.material_payments as payment
    where payment.company_id = target_company_id and payment.proof_sha256 = v_sha256
  ) then
    raise exception using errcode = 'P0001', message = 'PROOF_ALREADY_USED';
  end if;

  -- An amendment may have turned an advance installment into a normal one: the
  -- current installment decides whether a recorded invoice is required (T8 M7).
  if not (private.c1_material_current_installment(v_contract, v_request.installment_key)).is_advance
    and not exists (
      select 1 from public.material_payment_request_invoices as link
      join public.material_invoices as invoice on invoice.id = link.invoice_id and invoice.contract_id = link.contract_id
      where link.payment_request_id = v_request.id and invoice.state = 'recorded'
    )
  then
    raise exception using errcode = 'P0001', message = 'INVOICE_REQUIRED';
  end if;

  -- An amendment may have lowered the installment since approval; re-check
  -- the request amount against the current version.
  perform private.c1_material_require_capacity(v_contract, v_request.installment_key, v_request.amount, v_request.id);

  begin
    insert into public.material_payments(
      tenant_id, company_id, project_id, payment_request_id, contract_id, installment_key, amount,
      paid_on, bank_reference, proof_file_id, proof_sha256, paid_by
    ) values (
      v_tenant_id, target_company_id, target_project_id, v_request.id, v_contract.id, v_request.installment_key, v_request.amount,
      v_paid_on, v_bank_reference, v_proof_file_id, v_sha256, v_actor_id
    );
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'material_payments_company_id_proof_sha256_key' then
      raise exception using errcode = 'P0001', message = 'PROOF_ALREADY_USED';
    end if;
    raise exception using errcode = 'P0001', message = 'EVIDENCE_INVALID';
  end;

  update public.material_payment_requests as request
  set state = 'paid', version = request.version + 1, updated_at = now()
  where request.id = v_request.id
  returning request.* into v_request;

  perform private.c1_material_notify_users(
    v_tenant_id, target_company_id, target_project_id, array[v_request.submitted_by],
    'material.payment.paid', 'material_payment_request', v_request.id,
    private.c1_material_payment_link(v_contract),
    -- Addressed to the submitter by user id: supplier and contract only, never money.
    private.c1_material_payment_payload(v_contract, v_request.amount) - 'amount',
    'pr:' || v_request.id::text || ':paid'
  );

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.record_payment', target_idempotency_key, v_hash,
    v_request.id, v_request.version, 'c1.material_payment.recorded', 'material_payment_request', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'amount', v_request.amount::text,
      'paidOn', v_paid_on, 'bankReference', v_bank_reference)
  );
  return private.c1_material_ack(v_request.id, v_request.version, false);
end;
$$;

revoke all on function
  private.c1_material_read_order(uuid,uuid,uuid),
  private.c1_material_list_orders(uuid,uuid),
  private.c1_material_notify_contract_saved(public.material_contracts,public.material_orders,uuid,integer,numeric),
  private.c1_material_proposal_json(uuid,uuid,uuid,uuid),
  private.c1_material_emit_installment_reminders(date),
  private.c1_material_cancel_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
