set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 58);

-- A4/A5 cash payments for small orders (spec 2026-10-16, rules R7-R9).
-- A payment is recorded either by bank transfer (a bank reference is required, as
-- before) or in cash. Cash is allowed only while the current contract version total is
-- below 5000000 VND, and a cash payment never carries a bank reference.
--
-- Each function below is copied from its latest definition and changes only what is
-- listed; signatures, security definer, search_path and grants stay as they were.
--   record_payment             20261015090600
--   list_payment_requests      20261015090200
-- It builds on the helpers of 20261016090000: c1_material_is_small_amount and
-- c1_material_installment_requires_invoice.

-- Table ------------------------------------------------------------------------------

-- Existing rows are bank transfers with a bank reference, so the new tie between
-- method and bank_reference holds for them. The earlier bank_reference check (trimmed,
-- non-empty, at most 100 characters) still applies whenever it has a value.
alter table public.material_payments
  add column method text not null default 'bank_transfer'
    constraint material_payments_method_check
    check (method in ('bank_transfer', 'cash')),
  alter column bank_reference drop not null,
  add constraint material_payments_method_bank_reference_check
    check ((method = 'bank_transfer') = (bank_reference is not null));

-- record_payment (20261015090600) ----------------------------------------------------
-- Changes: reads method (a missing key means 'bank_transfer'); cash requires a null or
-- absent bankReference, and a current total and order subtotal snapshot below the
-- threshold; the invoice
-- requirement goes through the shared helper; the payment stores method.

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
  v_method text;
  v_bank_reference text;
  v_contract_total numeric;
  v_order_subtotal numeric;
  v_proof_file_id uuid;
  v_sha256 text;
  v_constraint text;
begin
  -- bankReference and method are validated below: bankReference is required for a
  -- bank transfer only, and method may be missing.
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.payment.execute', target_input,
    array['expectedVersion','paidOn','proofFileId'], array['expectedVersion','paidOn','method','bankReference','proofFileId']
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

  -- A missing method key means a bank transfer, so older clients keep working.
  if target_input ? 'method' and jsonb_typeof(target_input->'method') is distinct from 'string' then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_method := coalesce(target_input->>'method', 'bank_transfer');
  if v_method = 'cash' then
    -- A cash payment has no bank reference: the key is absent or null, never a string.
    if target_input ? 'bankReference' and jsonb_typeof(target_input->'bankReference') is distinct from 'null' then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_bank_reference := null;
    -- The contract is locked above, so the current version cannot change under us.
    -- An amendment may have raised the total past the threshold after the request
    -- was approved (R9). The order subtotal snapshot must also be small: a large order
    -- recorded as a contract with a low contract subtotal is not a small order (R7).
    select version_row.total, version_row.order_subtotal_snapshot into v_contract_total, v_order_subtotal
    from public.material_contract_versions as version_row
    where version_row.contract_id = v_contract.id and version_row.version_no = v_contract.current_version_no;
    if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
    if not private.c1_material_is_small_amount(v_contract_total, v_contract.currency_code)
      or not private.c1_material_is_small_amount(v_order_subtotal, v_contract.currency_code)
    then
      raise exception using errcode = 'P0001', message = 'CASH_PAYMENT_NOT_ALLOWED';
    end if;
  elsif v_method = 'bank_transfer' then
    v_bank_reference := private.c1_workflow_text(target_input->'bankReference');
    if char_length(v_bank_reference) > 100 then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
  else
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
  -- A record without a contract needs no invoice (R6).
  if private.c1_material_installment_requires_invoice(v_contract, private.c1_material_current_installment(v_contract, v_request.installment_key))
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
      paid_on, method, bank_reference, proof_file_id, proof_sha256, paid_by
    ) values (
      v_tenant_id, target_company_id, target_project_id, v_request.id, v_contract.id, v_request.installment_key, v_request.amount,
      v_paid_on, v_method, v_bank_reference, v_proof_file_id, v_sha256, v_actor_id
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
      'paidOn', v_paid_on, 'method', v_method, 'bankReference', v_bank_reference)
  );
  return private.c1_material_ack(v_request.id, v_request.version, false);
end;
$$;

-- list_payment_requests (20261015090200) ----------------------------------------------
-- Change: the payment of a request also carries method; bankReference is null for cash.

create or replace function private.c1_material_list_payment_requests(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  v_tenant_id := private.c1_material_require_finance_contract(target_company_id, target_project_id, target_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id,
    'contractId', request.contract_id,
    'installmentKey', request.installment_key,
    'amount', request.amount::text,
    'note', request.note,
    'state', request.state,
    'revisionNo', request.revision_no,
    'submittedBy', request.submitted_by,
    'submittedAt', to_jsonb(request.submitted_at),
    'invoiceIds', (
      select coalesce(jsonb_agg(link.invoice_id order by link.invoice_id), '[]'::jsonb)
      from public.material_payment_request_invoices as link
      where link.payment_request_id = request.id
    ),
    'cancelReason', request.cancel_reason,
    'version', request.version,
    'decisions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'revisionNo', decision.request_revision_no,
        'decision', decision.decision,
        'reason', decision.reason,
        'decidedBy', decision.decided_by,
        'decidedAt', to_jsonb(decision.decided_at)
      ) order by decision.request_revision_no), '[]'::jsonb)
      from public.material_payment_decisions as decision
      where decision.payment_request_id = request.id
    ),
    'payment', (
      select jsonb_build_object(
        'id', payment.id,
        'paidOn', payment.paid_on,
        'method', payment.method,
        'bankReference', payment.bank_reference,
        'proofFileId', payment.proof_file_id,
        'paidBy', payment.paid_by,
        'recordedAt', to_jsonb(payment.recorded_at)
      )
      from public.material_payments as payment
      where payment.payment_request_id = request.id
    )
  ) order by request.created_at desc, request.id), '[]'::jsonb)
  into v_result
  from public.material_payment_requests as request
  where request.contract_id = target_id
    and request.tenant_id = v_tenant_id
    and request.company_id = target_company_id
    and request.project_id = target_project_id;
  return v_result;
end;
$$;

-- Grants -------------------------------------------------------------------------------
-- create or replace keeps the grants of both functions. They are private and callable
-- only through their public wrappers, whose signatures did not change; the revoke below
-- repeats the private grants so a fresh database ends in the same state.
revoke all on function
  private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_list_payment_requests(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
