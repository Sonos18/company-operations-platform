set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 55);

-- A4/A5 T8 hardening. Each function below is copied from its latest definition
-- and changes only what is listed; signatures, security definer, search_path and
-- grants stay as they were.
--   A. Every A4/A5 write command also requires material.read:
--      private.c1_material_finance_command_start (20261015090200, all 7 payment
--      commands), private.c1_material_record_contract and
--      private.c1_material_amend_contract (20261015090100).
--   C. material.payment.returned and material.payment.paid go to the submitter by
--      user id, so their payloads drop the amount (decide_payment_request and
--      record_payment, 20261015090200).
--   D. An amend_contract replay returns the version stored in its receipt.
--   B. public.c1_material_evidence_read_target (20261015090400) also returns
--      declaredMimeType so the server can force XML evidence to download.
-- private.c1_material_context stays module-wide and is not touched.

-- A ----------------------------------------------------------------------------

create or replace function private.c1_material_finance_command_start(
  target_company_id uuid,
  target_project_id uuid,
  target_permission text,
  target_input jsonb,
  target_required text[],
  target_allowed text[]
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
begin
  v_context := private.c1_material_context(target_company_id, target_permission);
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, target_permission);
  -- Every A4/A5 write also requires module read access (T8 hardening A).
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.read');
  perform private.c1_workflow_require_keys(target_input, target_required, target_allowed);
  return v_tenant_id;
end;
$$;

create or replace function private.c1_material_record_contract(
  target_company_id uuid, target_project_id uuid, target_id uuid,
  target_input jsonb, target_idempotency_key uuid, target_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_order public.material_orders%rowtype;
  v_contract public.material_contracts%rowtype;
  v_money record;
  v_version_id uuid;
  v_signed_on date;
  v_proposal_creator uuid;
begin
  v_context := private.c1_material_context(target_company_id, 'material.contract.record');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.contract.record');
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.read');
  perform private.c1_workflow_require_keys(
    target_input,
    array['expectedOrderVersion','contractNo','signedOn','subtotal','vatAmount','total','varianceReason','contractFileId','signedQuotationFileId','installments'],
    array['expectedOrderVersion','contractNo','signedOn','subtotal','vatAmount','total','varianceReason','contractFileId','signedQuotationFileId','installments']
  );

  -- Lock proposal, proposal lines (stable id order), then the order, matching
  -- c1_material_cancel_order so record and cancel serialize without deadlock.
  select material_order.* into v_order from public.material_orders as material_order
  where material_order.id = target_id and material_order.tenant_id = v_tenant_id
    and material_order.company_id = target_company_id and material_order.project_id = target_project_id;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  perform proposal.id from public.material_proposals as proposal
  where proposal.id = v_order.proposal_id and proposal.tenant_id = v_order.tenant_id
    and proposal.company_id = v_order.company_id and proposal.project_id = v_order.project_id
  for update;
  perform line.id from public.material_proposal_lines as line
  where line.proposal_id = v_order.proposal_id and line.tenant_id = v_order.tenant_id
    and line.company_id = v_order.company_id and line.project_id = v_order.project_id
  order by line.id for update;
  select material_order.* into v_order from public.material_orders as material_order
  where material_order.id = target_id for update of material_order;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.record_contract', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    select contract.* into v_contract from public.material_contracts as contract where contract.order_id = v_order.id;
    if not found or v_receipt.result_resource_id <> v_contract.id then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return private.c1_material_ack(v_contract.id, 1, true);
  end if;

  if v_order.version <> private.c1_material_version(target_input->'expectedOrderVersion') then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if exists (select 1 from public.material_contracts as contract where contract.order_id = v_order.id) then
    raise exception using errcode = 'P0001', message = 'CONTRACT_EXISTS';
  end if;
  if v_order.state <> 'active' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_ACTIVE';
  end if;

  v_signed_on := private.c1_workflow_date(target_input->'signedOn');
  if v_signed_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  select * into v_money from private.c1_material_contract_money(target_input, v_order.id);

  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, private.c1_material_uuid(target_input->'contractFileId'),
    'material_order', 'signed_contract', v_order.id, null);
  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, private.c1_material_uuid(target_input->'signedQuotationFileId'),
    'material_order', 'signed_quotation', v_order.id, null);

  insert into public.material_contracts(
    tenant_id, company_id, project_id, order_id, supplier_id, currency_code, contract_no, signed_on, created_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_order.id, v_order.supplier_id, v_order.currency_code,
    private.c1_workflow_text(target_input->'contractNo'), v_signed_on, v_actor_id
  ) returning * into v_contract;

  insert into public.material_contract_versions(
    tenant_id, company_id, project_id, contract_id, version_no, kind, subtotal, vat_amount, total,
    order_subtotal_snapshot, variance_reason, contract_file_id, signed_quotation_file_id, reason, recorded_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_contract.id, 1, 'original',
    v_money.subtotal, v_money.vat_amount, v_money.total, v_money.order_subtotal, v_money.variance_reason,
    private.c1_material_uuid(target_input->'contractFileId'), private.c1_material_uuid(target_input->'signedQuotationFileId'),
    null, v_actor_id
  ) returning id into v_version_id;

  perform private.c1_material_insert_installments(v_contract, v_version_id, target_input->'installments', v_money.total);

  insert into public.material_order_contracts(order_id, tenant_id, company_id, project_id, contract_id, created_by)
  values (v_order.id, v_tenant_id, target_company_id, target_project_id, v_contract.id, v_actor_id);

  select proposal.created_by into v_proposal_creator from public.material_proposals as proposal where proposal.id = v_order.proposal_id;
  perform private.c1_material_notify_contract_saved(v_contract, v_order, v_proposal_creator, 1, v_money.total);

  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'material.record_contract', target_idempotency_key, v_hash, v_contract.id, 1
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.material_contract.recorded', 'material_contract', v_contract.id::text,
    target_request_id, jsonb_build_object('projectId', target_project_id, 'orderId', v_order.id, 'total', v_money.total::text, 'versionNo', 1)
  );
  return private.c1_material_ack(v_contract.id, 1, false);
end;
$$;

-- A + D ------------------------------------------------------------------------

create or replace function private.c1_material_amend_contract(
  target_company_id uuid, target_project_id uuid, target_id uuid,
  target_input jsonb, target_idempotency_key uuid, target_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_order public.material_orders%rowtype;
  v_contract public.material_contracts%rowtype;
  v_money record;
  v_reason text;
  v_version_id uuid;
  v_version_no integer;
  v_proposal_creator uuid;
begin
  v_context := private.c1_material_context(target_company_id, 'material.contract.record');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.contract.record');
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.read');
  perform private.c1_workflow_require_keys(
    target_input,
    array['expectedVersion','subtotal','vatAmount','total','varianceReason','amendmentFileId','reason','installments'],
    array['expectedVersion','subtotal','vatAmount','total','varianceReason','amendmentFileId','reason','installments']
  );

  -- Lock order first, then contract (the same order every contract command uses).
  select contract.* into v_contract from public.material_contracts as contract
  where contract.id = target_id and contract.tenant_id = v_tenant_id
    and contract.company_id = target_company_id and contract.project_id = target_project_id;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  select material_order.* into v_order from public.material_orders as material_order
  where material_order.id = v_contract.order_id for update of material_order;
  select contract.* into v_contract from public.material_contracts as contract
  where contract.id = target_id for update of contract;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.amend_contract', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    if v_receipt.result_resource_id <> v_contract.id then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    -- A replay answers with the version this key produced, not the contract's current one.
    return private.c1_material_ack(v_contract.id, v_receipt.result_version, true);
  end if;

  if v_contract.version <> private.c1_material_version(target_input->'expectedVersion') then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  select * into v_money from private.c1_material_contract_money(target_input, v_order.id);
  v_reason := private.c1_workflow_text(target_input->'reason');
  if char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, private.c1_material_uuid(target_input->'amendmentFileId'),
    'material_contract', 'contract_amendment', null, v_contract.id);

  v_version_no := v_contract.current_version_no + 1;
  insert into public.material_contract_versions(
    tenant_id, company_id, project_id, contract_id, version_no, kind, subtotal, vat_amount, total,
    order_subtotal_snapshot, variance_reason, contract_file_id, signed_quotation_file_id, reason, recorded_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_contract.id, v_version_no, 'amendment',
    v_money.subtotal, v_money.vat_amount, v_money.total, v_money.order_subtotal, v_money.variance_reason,
    private.c1_material_uuid(target_input->'amendmentFileId'), null, v_reason, v_actor_id
  ) returning id into v_version_id;
  perform private.c1_material_insert_installments(v_contract, v_version_id, target_input->'installments', v_money.total);

  -- Money already paid or pending against an installment stays committed: the new
  -- schedule must keep that installment with at least that amount.
  if exists (
    select 1
    from private.c1_material_installment_usage(v_contract.id) as usage
    where usage.paid + usage.pending > 0
      and not exists (
        select 1 from public.material_contract_installments as item
        where item.contract_version_id = v_version_id
          and item.installment_key = usage.installment_key
          and item.amount >= usage.paid + usage.pending
      )
  ) then
    raise exception using errcode = 'P0001', message = 'AMENDMENT_BELOW_COMMITTED';
  end if;
  if v_money.total < coalesce((
    select sum(invoice.total) from public.material_invoices as invoice
    where invoice.contract_id = v_contract.id and invoice.state = 'recorded'
  ), 0) then
    raise exception using errcode = 'P0001', message = 'INVOICE_TOTAL_EXCEEDED';
  end if;

  update public.material_contracts as contract
  set current_version_no = v_version_no, version = contract.version + 1, updated_at = now()
  where contract.id = v_contract.id
  returning contract.* into v_contract;

  select proposal.created_by into v_proposal_creator from public.material_proposals as proposal where proposal.id = v_order.proposal_id;
  perform private.c1_material_notify_contract_saved(v_contract, v_order, v_proposal_creator, v_version_no, v_money.total);

  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'material.amend_contract', target_idempotency_key, v_hash, v_contract.id, v_contract.version
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.material_contract.amended', 'material_contract', v_contract.id::text,
    target_request_id, jsonb_build_object(
      'projectId', target_project_id, 'orderId', v_order.id, 'total', v_money.total::text,
      'versionNo', v_version_no, 'reason', v_reason
    )
  );
  return private.c1_material_ack(v_contract.id, v_contract.version, false);
end;
$$;

-- C ----------------------------------------------------------------------------

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

-- B ----------------------------------------------------------------------------

create or replace function public.c1_material_evidence_read_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_tenant_id uuid; v_file public.cost_evidence_files%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not (
    private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id)
    or private.c1_material_can_read_finance(v_tenant_id, target_company_id)
  ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  select evidence.* into v_file
  from public.cost_evidence_files as evidence
  join public.material_evidence_scopes as scope
    on scope.evidence_file_id = evidence.id
   and scope.tenant_id = evidence.tenant_id
   and scope.company_id = evidence.company_id
   and scope.project_id = evidence.project_id
  where evidence.id = target_id
    and evidence.tenant_id = v_tenant_id
    and evidence.company_id = target_company_id
    and evidence.project_id = target_project_id
    and evidence.status = 'finalized';
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if not private.c1_material_can_read_evidence(v_tenant_id, target_company_id, target_project_id, v_file.id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  -- The server forces a download for anything that is not PDF/PNG/JPEG (XML invoices).
  return jsonb_build_object(
    'bucketId', v_file.bucket_id, 'objectPath', v_file.object_path, 'declaredMimeType', v_file.declared_mime_type
  );
end;
$$;

revoke all on function
  private.c1_material_finance_command_start(uuid,uuid,text,jsonb,text[],text[]),
  private.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;

revoke all on function public.c1_material_evidence_read_target(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.c1_material_evidence_read_target(uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
