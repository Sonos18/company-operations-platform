set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 57);

-- A4/A5 small orders without a contract (spec 2026-10-16, rules R1-R6, R10-R12).
-- An order whose total is below 5000000 VND may be recorded as 'quotation_only':
-- no contract number, no contract file, VAT 0, one generated 100% installment and a
-- signed quotation (PDF/JPEG/PNG) as the only document. The record reuses
-- material_contracts, so payment requests, installments, invoices and reads keep
-- working on contract_id.
--
-- Each function below is copied from its latest definition and changes only what
-- is listed; signatures (except link_request_invoices), security definer,
-- search_path and grants stay as they were.
--   record_contract, amend_contract          20261015090500
--   evidence_mime_allowed, create_evidence_intent  20261015090400
--   link_request_invoices (re-created), create_payment_request,
--   resubmit_payment_request, payment_payload  20261015090200
--   decide_payment_request, notify_contract_saved,
--   emit_installment_reminders               20261015090600
--   read_contract, order_json                20261015090100
--   finance_facts                            20261015090300
--   proposal_json contractStatus             anchor patch over 20261015090600
-- c1_material_record_payment and material_payments belong to 20261016090100.

-- Tables -----------------------------------------------------------------------

-- Existing rows take documentation = 'contract'. The existing contract_no check
-- (trimmed, non-empty, at most 100 characters) still applies whenever it has a value.
alter table public.material_contracts
  add column documentation text not null default 'contract'
    constraint material_contracts_documentation_check
    check (documentation in ('contract', 'quotation_only')),
  alter column contract_no drop not null,
  add constraint material_contracts_documentation_contract_no_check
    check ((documentation = 'contract') = (contract_no is not null));

-- Safety net only: a CHECK cannot read the parent documentation or the order
-- currency, so the exact rule (documentation and VND) lives in record_contract.
alter table public.material_contract_versions
  alter column contract_file_id drop not null,
  add constraint material_contract_versions_contract_file_check
    check (contract_file_id is not null or (kind = 'original' and vat_amount = 0 and total < 5000000));

-- Helpers ----------------------------------------------------------------------

-- The cash-law threshold (R1). shared/constants/material-finance.ts holds the same
-- value as MATERIAL_SMALL_ORDER_THRESHOLD; a guard test keeps the two in sync.
create function private.c1_material_small_order_threshold()
returns numeric language sql immutable set search_path = '' as $$
  select 5000000::numeric;
$$;

-- Strictly below the threshold and only in VND (R1, R2). Unknown values are not small.
create function private.c1_material_is_small_amount(target_total numeric, target_currency text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    target_currency = 'VND' and target_total < private.c1_material_small_order_threshold(),
    false
  );
$$;

-- A payment against a non-advance installment needs a recorded invoice, unless the
-- record has no contract (R6). Unknown values require the invoice.
create function private.c1_material_installment_requires_invoice(
  target_contract public.material_contracts, target_installment public.material_contract_installments
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(not target_installment.is_advance and target_contract.documentation = 'contract', true);
$$;

-- record_contract (20261015090500) -------------------------------------------

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
  v_documentation text;
  v_contract_file_id uuid;
  v_quotation_file_id uuid;
  v_quotation_mime text;
begin
  v_context := private.c1_material_context(target_company_id, 'material.contract.record');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.contract.record');
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.read');
  -- A missing documentation key means 'contract', so older clients keep working.
  if target_input ? 'documentation' and jsonb_typeof(target_input->'documentation') is distinct from 'string' then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_documentation := coalesce(target_input->>'documentation', 'contract');
  if v_documentation = 'contract' then
    perform private.c1_workflow_require_keys(
      target_input,
      array['expectedOrderVersion','contractNo','signedOn','subtotal','vatAmount','total','varianceReason','contractFileId','signedQuotationFileId','installments'],
      array['documentation','expectedOrderVersion','contractNo','signedOn','subtotal','vatAmount','total','varianceReason','contractFileId','signedQuotationFileId','installments']
    );
  elsif v_documentation = 'quotation_only' then
    -- No contract number, contract file, VAT, total or schedule: the server derives them.
    perform private.c1_workflow_require_keys(
      target_input,
      array['documentation','expectedOrderVersion','signedOn','subtotal','varianceReason','signedQuotationFileId'],
      array['documentation','expectedOrderVersion','signedOn','subtotal','varianceReason','signedQuotationFileId']
    );
  else
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

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
  if v_documentation = 'quotation_only' then
    -- VAT 0 and total = subtotal; the shared money check still computes the order
    -- subtotal and enforces the variance reason (R3).
    select * into v_money from private.c1_material_contract_money(
      jsonb_build_object(
        'subtotal', target_input->'subtotal', 'vatAmount', '0', 'total', target_input->'subtotal',
        'varianceReason', target_input->'varianceReason'
      ),
      v_order.id
    );
    -- Both the order and the entered subtotal must be below the threshold, in VND (R1-R3).
    if not private.c1_material_is_small_amount(v_money.order_subtotal, v_order.currency_code)
      or not private.c1_material_is_small_amount(v_money.subtotal, v_order.currency_code)
    then
      raise exception using errcode = 'P0001', message = 'CONTRACT_REQUIRED';
    end if;
  else
    select * into v_money from private.c1_material_contract_money(target_input, v_order.id);
  end if;

  if v_documentation = 'contract' then
    v_contract_file_id := private.c1_material_uuid(target_input->'contractFileId');
    perform private.c1_material_require_contract_file(
      v_tenant_id, target_company_id, target_project_id, v_contract_file_id,
      'material_order', 'signed_contract', v_order.id, null);
  end if;
  v_quotation_file_id := private.c1_material_uuid(target_input->'signedQuotationFileId');
  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, v_quotation_file_id,
    'material_order', 'signed_quotation', v_order.id, null);
  if v_documentation = 'contract' then
    -- Image quotations are accepted at upload for quotation-only records; a contract
    -- record still needs a PDF quotation (R10).
    select evidence.verified_mime_type into v_quotation_mime
    from public.cost_evidence_files as evidence
    where evidence.id = v_quotation_file_id and evidence.tenant_id = v_tenant_id
      and evidence.company_id = target_company_id and evidence.project_id = target_project_id;
    if v_quotation_mime is distinct from 'application/pdf' then
      raise exception using errcode = 'P0001', message = 'EVIDENCE_INVALID';
    end if;
  end if;

  insert into public.material_contracts(
    tenant_id, company_id, project_id, order_id, supplier_id, currency_code, documentation, contract_no, signed_on, created_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_order.id, v_order.supplier_id, v_order.currency_code, v_documentation,
    case when v_documentation = 'contract' then private.c1_workflow_text(target_input->'contractNo') end, v_signed_on, v_actor_id
  ) returning * into v_contract;

  insert into public.material_contract_versions(
    tenant_id, company_id, project_id, contract_id, version_no, kind, subtotal, vat_amount, total,
    order_subtotal_snapshot, variance_reason, contract_file_id, signed_quotation_file_id, reason, recorded_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_contract.id, 1, 'original',
    v_money.subtotal, v_money.vat_amount, v_money.total, v_money.order_subtotal, v_money.variance_reason,
    v_contract_file_id, v_quotation_file_id,
    null, v_actor_id
  ) returning id into v_version_id;

  if v_documentation = 'quotation_only' then
    -- One server-generated installment: 100% due on the recorded date (R4).
    insert into public.material_contract_installments(
      tenant_id, company_id, project_id, contract_id, contract_version_id,
      seq, installment_key, name, amount, due_on, is_advance
    ) values (
      v_tenant_id, target_company_id, target_project_id, v_contract.id, v_version_id,
      1, gen_random_uuid(), 'Thanh toán 100%', v_money.total, v_signed_on, false
    );
  else
    perform private.c1_material_insert_installments(v_contract, v_version_id, target_input->'installments', v_money.total);
  end if;

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
    target_request_id, jsonb_build_object('projectId', target_project_id, 'orderId', v_order.id, 'total', v_money.total::text, 'versionNo', 1,
      'documentation', v_documentation)
  );
  return private.c1_material_ack(v_contract.id, 1, false);
end;
$$;

-- amend_contract (20261015090500) --------------------------------------------

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
  -- A record without a contract has no amendments (R5).
  if v_contract.documentation = 'quotation_only' then
    raise exception using errcode = 'P0001', message = 'CONTRACT_AMENDMENT_UNAVAILABLE';
  end if;

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

-- evidence (20261015090400) --------------------------------------------------

-- Signed quotations may be photos (R10). record_contract still requires a PDF
-- quotation for records with a contract.
create or replace function private.c1_material_evidence_mime_allowed(target_role text, target_mime text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    case target_role
      when 'unsigned_quotation' then target_mime = 'application/pdf'
      when 'signed_quotation' then target_mime in ('application/pdf','image/jpeg','image/png')
      when 'signed_contract' then target_mime = 'application/pdf'
      when 'contract_amendment' then target_mime = 'application/pdf'
      when 'invoice' then target_mime in ('application/pdf','application/xml','text/xml')
      when 'payment_proof' then target_mime in ('application/pdf','image/jpeg','image/png')
      else false
    end,
    false
  );
$$;

-- Same body as 20261015090400; signed_quotation leaves the PDF-only branch that keeps
-- the historical FILE_TYPE_UNSUPPORTED code.
create or replace function private.c1_material_create_evidence_intent(
  target_company_id uuid,
  target_project_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_permission text;
  v_role text;
  v_mime text;
  v_target_kind text;
  v_proposal_id uuid;
  v_revision_id uuid;
  v_order_id uuid;
  v_contract_id uuid;
  v_size_bytes bigint;
  v_file_id uuid := gen_random_uuid();
  v_path text;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_file public.cost_evidence_files%rowtype;
begin
  perform private.c1_workflow_require_keys(
    target_input,
    array['originalFilename','mimeType','sizeBytes','sha256','evidenceRole','target'],
    array['originalFilename','mimeType','sizeBytes','sha256','evidenceRole','target']
  );
  v_role := target_input->>'evidenceRole';
  v_mime := target_input->>'mimeType';
  v_target_kind := target_input#>>'{target,kind}';
  if jsonb_typeof(target_input->'originalFilename') is distinct from 'string'
    or btrim(target_input->>'originalFilename') = ''
    or jsonb_typeof(target_input->'mimeType') is distinct from 'string'
    or not private.c1_material_evidence_mime_allowed(v_role, v_mime)
    or jsonb_typeof(target_input->'sha256') is distinct from 'string'
    or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(target_input->'target') is distinct from 'object'
    or jsonb_typeof(target_input->'evidenceRole') is distinct from 'string'
    or jsonb_typeof(target_input#>'{target,kind}') is distinct from 'string'
    or v_role is null
    or v_role <> all(array['unsigned_quotation','signed_quotation','signed_contract','contract_amendment','invoice','payment_proof'])
    or v_target_kind is null
    or v_target_kind <> all(array['material_proposal','material_order','material_contract'])
  then
    -- A type outside the supported set, or a non-PDF file for one of the original
    -- PDF-only roles, keeps the historical code. A supported type that the new
    -- contract-level role does not accept is a plain input error.
    if coalesce(v_mime <> all(array['application/pdf','application/xml','text/xml','image/jpeg','image/png']), true)
      or (v_role in ('unsigned_quotation','signed_contract') and coalesce(v_mime <> 'application/pdf', true))
    then
      raise exception using errcode = 'P0001', message = 'FILE_TYPE_UNSUPPORTED';
    end if;
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_size_bytes := private.c1_material_size_bytes(target_input->'sizeBytes');

  if v_target_kind = 'material_proposal' then
    perform private.c1_workflow_require_keys(
      target_input->'target', array['kind','proposalId','revisionId'], array['kind','proposalId','revisionId']
    );
    if v_role <> 'unsigned_quotation' then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_proposal_id := private.c1_material_uuid(target_input#>'{target,proposalId}');
    v_revision_id := private.c1_material_uuid(target_input#>'{target,revisionId}');
  elsif v_target_kind = 'material_order' then
    perform private.c1_workflow_require_keys(
      target_input->'target', array['kind','orderId'], array['kind','orderId']
    );
    if v_role not in ('signed_quotation','signed_contract') then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_order_id := private.c1_material_uuid(target_input#>'{target,orderId}');
  else
    perform private.c1_workflow_require_keys(
      target_input->'target', array['kind','contractId'], array['kind','contractId']
    );
    if v_role not in ('contract_amendment','invoice','payment_proof') then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_contract_id := private.c1_material_uuid(target_input#>'{target,contractId}');
  end if;
  v_permission := private.c1_material_evidence_role_permission(v_role);

  v_context := private.c1_material_context(target_company_id, v_permission);
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if v_actor_id is null or (v_context->>'actorId')::uuid is distinct from v_actor_id
    or target_idempotency_key is null or target_request_id is null
  then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;

  if v_target_kind = 'material_proposal' then
    perform proposal.id
    from public.material_proposals as proposal
    where proposal.id = v_proposal_id
      and proposal.tenant_id = v_tenant_id
      and proposal.company_id = target_company_id
      and proposal.project_id = target_project_id
      and proposal.review_state = 'approved'
      and proposal.approved_revision_id = v_revision_id
    for share;
  elsif v_target_kind = 'material_order' then
    perform material_order.id
    from public.material_orders as material_order
    where material_order.id = v_order_id
      and material_order.tenant_id = v_tenant_id
      and material_order.company_id = target_company_id
      and material_order.project_id = target_project_id
      and material_order.state = 'active'
    for share;
  else
    perform contract.id
    from public.material_contracts as contract
    where contract.id = v_contract_id
      and contract.tenant_id = v_tenant_id
      and contract.company_id = target_company_id
      and contract.project_id = target_project_id
    for share;
  end if;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_project_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.evidence_intent', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    select evidence.* into v_file
    from public.cost_evidence_files as evidence
    join public.material_evidence_scopes as scope
      on scope.evidence_file_id = evidence.id
     and scope.tenant_id = evidence.tenant_id
     and scope.company_id = evidence.company_id
     and scope.project_id = evidence.project_id
    where evidence.id = v_receipt.result_resource_id
      and evidence.tenant_id = v_tenant_id
      and evidence.company_id = target_company_id
      and evidence.project_id = target_project_id
      and scope.evidence_role = v_role;
    if not found then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object(
      'evidenceFileId', v_file.id, 'version', v_file.version,
      'bucketId', v_file.bucket_id, 'objectPath', v_file.object_path,
      'expiresAt', v_file.intent_expires_at, 'replayed', true
    );
  end if;

  v_path := v_tenant_id::text || '/' || target_company_id::text || '/' || target_project_id::text || '/' || v_file_id::text;
  perform set_config('taskovia.c1_material_evidence.intent', v_file_id::text, true);
  insert into public.cost_evidence_files(
    id, tenant_id, company_id, project_id, object_path, original_filename,
    declared_mime_type, declared_size_bytes, declared_sha256, intent_expires_at, created_by
  ) values (
    v_file_id, v_tenant_id, target_company_id, target_project_id, v_path,
    btrim(target_input->>'originalFilename'), v_mime,
    v_size_bytes, target_input->>'sha256',
    now() + interval '15 minutes', v_actor_id
  ) returning * into v_file;
  perform set_config('taskovia.c1_material_evidence.intent', '', true);

  insert into public.material_evidence_scopes(
    evidence_file_id, tenant_id, company_id, project_id, target_kind,
    proposal_id, revision_id, order_id, contract_id, evidence_role, created_by
  ) values (
    v_file.id, v_tenant_id, target_company_id, target_project_id, v_target_kind,
    v_proposal_id, v_revision_id, v_order_id, v_contract_id, v_role, v_actor_id
  );
  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key,
    request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'material.evidence_intent', target_idempotency_key,
    v_hash, v_file.id, v_file.version
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.material_evidence.intent_created',
    'cost_evidence_file', v_file.id::text, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id, 'evidenceRole', v_role,
      'targetKind', v_target_kind, 'proposalId', v_proposal_id,
      'revisionId', v_revision_id, 'orderId', v_order_id, 'contractId', v_contract_id,
      'mimeType', v_file.declared_mime_type, 'sizeBytes', v_file.declared_size_bytes,
      'sha256', v_file.declared_sha256, 'version', v_file.version
    )
  );
  return jsonb_build_object(
    'evidenceFileId', v_file.id, 'version', v_file.version,
    'bucketId', v_file.bucket_id, 'objectPath', v_file.object_path,
    'expiresAt', v_file.intent_expires_at, 'replayed', false
  );
end;
$$;

-- invoice requirement (20261015090200, 20261015090600) -----------------------

-- The flag changes meaning (is_advance -> requires_invoice), so the function is
-- dropped and re-created rather than replaced. Its only callers are create and
-- resubmit below; the grants stay as in 20261015090200 (private: revoke only).
drop function private.c1_material_link_request_invoices(public.material_payment_requests, jsonb, boolean);
create function private.c1_material_link_request_invoices(
  target_request public.material_payment_requests, target_invoice_ids jsonb, target_requires_invoice boolean
) returns uuid[] language plpgsql volatile security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  if jsonb_typeof(target_invoice_ids) is distinct from 'array' or jsonb_array_length(target_invoice_ids) > 50 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  select coalesce(array_agg(distinct private.c1_material_uuid(value) order by private.c1_material_uuid(value)), '{}')
  into v_ids from jsonb_array_elements(target_invoice_ids) as value;
  if cardinality(v_ids) <> jsonb_array_length(target_invoice_ids) then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if (select count(*) from public.material_invoices as invoice
      where invoice.id = any(v_ids) and invoice.contract_id = target_request.contract_id and invoice.state = 'recorded'
      ) <> cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = 'INVOICE_NOT_RECORDED';
  end if;
  if target_requires_invoice is not false and cardinality(v_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'INVOICE_REQUIRED';
  end if;
  delete from public.material_payment_request_invoices where payment_request_id = target_request.id;
  insert into public.material_payment_request_invoices(payment_request_id, invoice_id, tenant_id, company_id, project_id, contract_id)
  select target_request.id, invoice_id, target_request.tenant_id, target_request.company_id, target_request.project_id, target_request.contract_id
  from unnest(v_ids) as invoice_id;
  return v_ids;
end;
$$;

create or replace function private.c1_material_create_payment_request(
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
  v_installment public.material_contract_installments%rowtype;
  v_request public.material_payment_requests%rowtype;
  v_key uuid;
  v_amount numeric(20,4);
  v_note text;
  v_invoice_ids uuid[];
begin
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.payment.request', target_input,
    array['installmentKey','amount','invoiceIds','note'], array['installmentKey','amount','invoiceIds','note']
  );

  v_contract := private.c1_material_lock_contract(v_tenant_id, target_company_id, target_project_id, target_id);

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.create_payment_request', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  v_key := private.c1_material_uuid(target_input->'installmentKey');
  v_amount := private.c1_material_positive(target_input->'amount');
  v_note := private.c1_material_finance_note(target_input->'note');

  v_installment := private.c1_material_require_capacity(v_contract, v_key, v_amount, null);

  insert into public.material_payment_requests(
    tenant_id, company_id, project_id, contract_id, installment_key, amount, note, state, revision_no,
    submitted_by, created_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_contract.id, v_key, v_amount, v_note, 'submitted', 1,
    v_actor_id, v_actor_id
  ) returning * into v_request;

  v_invoice_ids := private.c1_material_link_request_invoices(v_request, target_input->'invoiceIds', private.c1_material_installment_requires_invoice(v_contract, v_installment));

  insert into public.material_payment_request_revisions(
    tenant_id, company_id, project_id, payment_request_id, revision_no, installment_key, amount, invoice_ids, note, submitted_by, submitted_at
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_request.id, 1, v_key, v_amount, v_invoice_ids, v_note, v_actor_id, v_request.submitted_at
  );

  perform private.c1_material_notify_permission(
    v_tenant_id, target_company_id, target_project_id, 'material.payment.approve',
    'material.payment.submitted', 'material_payment_request', v_request.id,
    private.c1_material_payment_link(v_contract),
    private.c1_material_payment_payload(v_contract, v_amount),
    'pr:' || v_request.id::text || ':sub:1'
  );

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.create_payment_request', target_idempotency_key, v_hash,
    v_request.id, v_request.version, 'c1.material_payment_request.submitted', 'material_payment_request', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'installmentKey', v_key,
      'amount', v_amount::text, 'revisionNo', 1)
  );
  return private.c1_material_ack(v_request.id, v_request.version, false);
end;
$$;

create or replace function private.c1_material_resubmit_payment_request(
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
  v_installment public.material_contract_installments%rowtype;
  v_request public.material_payment_requests%rowtype;
  v_amount numeric(20,4);
  v_note text;
  v_invoice_ids uuid[];
begin
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.payment.request', target_input,
    array['expectedVersion','amount','invoiceIds','note'], array['expectedVersion','amount','invoiceIds','note']
  );

  v_contract := private.c1_material_lock_contract(
    v_tenant_id, target_company_id, target_project_id,
    private.c1_material_request_contract_id(v_tenant_id, target_company_id, target_project_id, target_id));
  v_request := private.c1_material_lock_payment_request(v_contract, target_id);

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.resubmit_payment_request', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  if v_request.version <> private.c1_material_version(target_input->'expectedVersion') or v_request.state <> 'returned' then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  v_amount := private.c1_material_positive(target_input->'amount');
  v_note := private.c1_material_finance_note(target_input->'note');

  -- Raises INSTALLMENT_NOT_FOUND when an amendment removed the installment
  -- from the current contract version (Review Focus 1).
  v_installment := private.c1_material_require_capacity(v_contract, v_request.installment_key, v_amount, v_request.id);

  update public.material_payment_requests as request
  set amount = v_amount,
      note = v_note,
      state = 'submitted',
      revision_no = request.revision_no + 1,
      submitted_by = v_actor_id,
      submitted_at = now(),
      version = request.version + 1,
      updated_at = now()
  where request.id = v_request.id
  returning request.* into v_request;

  v_invoice_ids := private.c1_material_link_request_invoices(v_request, target_input->'invoiceIds', private.c1_material_installment_requires_invoice(v_contract, v_installment));

  insert into public.material_payment_request_revisions(
    tenant_id, company_id, project_id, payment_request_id, revision_no, installment_key, amount, invoice_ids, note, submitted_by, submitted_at
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_request.id, v_request.revision_no, v_request.installment_key,
    v_amount, v_invoice_ids, v_note, v_actor_id, v_request.submitted_at
  );

  perform private.c1_material_notify_permission(
    v_tenant_id, target_company_id, target_project_id, 'material.payment.approve',
    'material.payment.submitted', 'material_payment_request', v_request.id,
    private.c1_material_payment_link(v_contract),
    private.c1_material_payment_payload(v_contract, v_amount),
    'pr:' || v_request.id::text || ':sub:' || v_request.revision_no::text
  );

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.resubmit_payment_request', target_idempotency_key, v_hash,
    v_request.id, v_request.version, 'c1.material_payment_request.resubmitted', 'material_payment_request', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'amount', v_amount::text,
      'revisionNo', v_request.revision_no)
  );
  return private.c1_material_ack(v_request.id, v_request.version, false);
end;
$$;

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
    -- A record without a contract never requires one (R6).
    if private.c1_material_installment_requires_invoice(v_contract, private.c1_material_current_installment(v_contract, v_request.installment_key))
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

-- reads and notification payloads ------------------------------------------

create or replace function private.c1_material_read_contract(
  target_company_id uuid, target_project_id uuid, target_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_contract public.material_contracts%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not private.c1_material_can_read_finance(v_tenant_id, target_company_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if not exists (
    select 1 from public.material_orders as material_order
    where material_order.id = target_id and material_order.tenant_id = v_tenant_id
      and material_order.company_id = target_company_id and material_order.project_id = target_project_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  select contract.* into v_contract from public.material_contracts as contract
  where contract.order_id = target_id and contract.tenant_id = v_tenant_id
    and contract.company_id = target_company_id and contract.project_id = target_project_id;
  if not found then return null; end if;

  return jsonb_build_object(
    'id', v_contract.id,
    'orderId', v_contract.order_id,
    'projectId', v_contract.project_id,
    'supplierId', v_contract.supplier_id,
    'supplierName', (
      select party.display_name from public.business_parties as party
      where party.id = v_contract.supplier_id and party.tenant_id = v_contract.tenant_id and party.company_id = v_contract.company_id),
    'currencyCode', v_contract.currency_code,
    'documentation', v_contract.documentation,
    'contractNo', v_contract.contract_no,
    'signedOn', v_contract.signed_on,
    'currentVersionNo', v_contract.current_version_no,
    'version', v_contract.version,
    'invoiced', coalesce((
      select sum(invoice.total) from public.material_invoices as invoice
      where invoice.contract_id = v_contract.id and invoice.state = 'recorded'), 0)::numeric(20,4)::text,
    'versions', (
      select jsonb_agg(jsonb_build_object(
        'versionNo', ver.version_no,
        'kind', ver.kind,
        'subtotal', ver.subtotal::text,
        'vatAmount', ver.vat_amount::text,
        'total', ver.total::text,
        'orderSubtotalSnapshot', ver.order_subtotal_snapshot::text,
        'varianceReason', ver.variance_reason,
        'contractFileId', ver.contract_file_id,
        'signedQuotationFileId', ver.signed_quotation_file_id,
        'reason', ver.reason,
        'recordedBy', ver.recorded_by,
        'recordedAt', ver.recorded_at
      ) order by ver.version_no)
      from public.material_contract_versions as ver
      where ver.contract_id = v_contract.id),
    'installments', (
      select jsonb_agg(jsonb_build_object(
        'installmentKey', item.installment_key,
        'seq', item.seq,
        'name', item.name,
        'amount', item.amount::text,
        'dueOn', item.due_on,
        'isAdvance', item.is_advance,
        'paid', coalesce(usage.paid, 0)::numeric(20,4)::text,
        'pending', coalesce(usage.pending, 0)::numeric(20,4)::text
      ) order by item.seq)
      from public.material_contract_installments as item
      join public.material_contract_versions as current_version
        on current_version.id = item.contract_version_id
       and current_version.version_no = v_contract.current_version_no
      left join private.c1_material_installment_usage(v_contract.id) as usage
        on usage.installment_key = item.installment_key
      where item.contract_id = v_contract.id)
  );
end;
$$;

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
    'contract', (
      select jsonb_build_object(
        'id', contract.id, 'documentation', contract.documentation,
        'contractNo', contract.contract_no, 'signedOn', contract.signed_on,
        'currentVersionNo', contract.current_version_no,
        'total', case when private.c1_material_can_read_finance(contract.tenant_id, contract.company_id)
          then current_version.total::text else null end)
      from public.material_contracts as contract
      join public.material_contract_versions as current_version
        on current_version.contract_id = contract.id and current_version.version_no = contract.current_version_no
      where contract.order_id = v_order.id),
    'cash', (
      select jsonb_build_object(
        'committed', current_version.total::text,
        'paid', coalesce(sum(usage.paid), 0)::numeric(20,4)::text,
        'pending', coalesce(sum(usage.pending), 0)::numeric(20,4)::text,
        'remaining', (current_version.total - coalesce(sum(usage.paid), 0))::numeric(20,4)::text)
      from public.material_contracts as contract
      join public.material_contract_versions as current_version
        on current_version.contract_id = contract.id and current_version.version_no = contract.current_version_no
      left join lateral private.c1_material_installment_usage(contract.id) as usage on true
      where contract.order_id = v_order.id
        and private.c1_material_can_read_finance(contract.tenant_id, contract.company_id)
      group by current_version.total)
  );
end;
$$;

create or replace function private.c1_material_finance_facts(target_company_id uuid, target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_currency text;
  v_contracts jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if not private.c1_material_can_read_finance(v_tenant_id, target_company_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if target_project_id is not null then
    perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  end if;
  select settings.default_currency_code into v_currency
  from public.company_cost_settings as settings
  where settings.company_id = target_company_id and settings.tenant_id = v_tenant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'contractId', contract.id,
    'projectId', contract.project_id,
    'projectName', project.name,
    'orderId', contract.order_id,
    'supplierId', contract.supplier_id,
    'supplierName', supplier.display_name,
    'documentation', contract.documentation,
    'contractNo', contract.contract_no,
    'total', version.total::text,
    'invoiced', coalesce((
      select sum(invoice.total) from public.material_invoices as invoice
      where invoice.contract_id = contract.id and invoice.state = 'recorded'
    ), 0)::text,
    'installments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'installmentKey', installment.installment_key,
        'name', installment.name,
        'amount', installment.amount::text,
        'dueOn', installment.due_on::text,
        'paid', coalesce(used.paid, 0)::text,
        'pending', coalesce(used.pending, 0)::text
      ) order by installment.seq), '[]'::jsonb)
      from public.material_contract_installments as installment
      left join private.c1_material_installment_usage(contract.id) as used
        on used.installment_key = installment.installment_key
      where installment.contract_version_id = version.id
    )
  ) order by project.name, contract.contract_no, contract.id), '[]'::jsonb)
  into v_contracts
  from public.material_contracts as contract
  join public.material_contract_versions as version
    on version.contract_id = contract.id and version.version_no = contract.current_version_no
  join public.projects as project
    on project.id = contract.project_id
   and project.tenant_id = contract.tenant_id and project.company_id = contract.company_id
  join public.business_parties as supplier
    on supplier.id = contract.supplier_id
   and supplier.tenant_id = contract.tenant_id and supplier.company_id = contract.company_id
  where contract.tenant_id = v_tenant_id
    and contract.company_id = target_company_id
    and (target_project_id is null or contract.project_id = target_project_id);

  return jsonb_build_object('currencyCode', coalesce(v_currency, 'VND'), 'contracts', v_contracts);
end;
$$;

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
      'documentation', target_contract.documentation,
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
      'supplierName', v_supplier_name, 'contractNo', target_contract.contract_no,
      'documentation', target_contract.documentation, 'versionNo', version_no
    ),
    v_dedupe
  );
  perform private.c1_material_notify_users(
    target_contract.tenant_id, target_contract.company_id, target_contract.project_id,
    array[proposal_creator],
    v_event, 'material_contract', target_contract.id,
    '/materials/' || target_contract.project_id::text || '/proposals/' || target_order.proposal_id::text,
    jsonb_build_object(
      'supplierName', v_supplier_name, 'contractNo', target_contract.contract_no,
      'documentation', target_contract.documentation, 'versionNo', version_no
    ),
    v_dedupe
  );
end;
$$;

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
           supplier.display_name as supplier_name, contract.contract_no, contract.documentation,
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
          'documentation', v_row.documentation,
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

create or replace function private.c1_material_payment_payload(target_contract public.material_contracts, target_amount numeric)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'supplierName', (
      select party.display_name from public.business_parties as party
      where party.id = target_contract.supplier_id and party.tenant_id = target_contract.tenant_id
        and party.company_id = target_contract.company_id
    ),
    'contractNo', target_contract.contract_no,
    'documentation', target_contract.documentation,
    'amount', target_amount::numeric(20,4)::text
  );
$$;

-- Proposal contractStatus --------------------------------------------------------
-- Anchor-replacement over the block 20261015090600 inserted, so every earlier patch
-- of the proposal JSON is preserved. Still money-free.
do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := $anchor$
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
    ), '[]'::jsonb),$anchor$;
  v_replacement text := $replacement$
    'contractStatus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', material_order.id,
        'contractNo', contract.contract_no,
        'signedOn', to_char(contract.signed_on, 'YYYY-MM-DD'),
        'documentation', contract.documentation
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
    ), '[]'::jsonb),$replacement$;
  v_marker text := $marker$'documentation', contract.documentation$marker$;
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
    or position(v_marker in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  v_corrected := replace(v_definition, v_anchor, v_replacement);
  if v_corrected = v_definition or position(v_marker in v_corrected) = 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_PROPOSAL_JSON_FUNCTION_DRIFT'; end if;
  execute v_corrected;
end;
$$;

-- Grants -------------------------------------------------------------------------
-- New helpers and the re-created link_request_invoices start with PUBLIC execute;
-- every private function stays callable only through its public wrapper.
revoke all on function
  private.c1_material_small_order_threshold(),
  private.c1_material_is_small_amount(numeric,text),
  private.c1_material_installment_requires_invoice(public.material_contracts,public.material_contract_installments),
  private.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_evidence_mime_allowed(text,text),
  private.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_link_request_invoices(public.material_payment_requests,jsonb,boolean),
  private.c1_material_create_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_resubmit_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_read_contract(uuid,uuid,uuid),
  private.c1_material_order_json(uuid,uuid,uuid,uuid),
  private.c1_material_finance_facts(uuid,uuid),
  private.c1_material_notify_contract_saved(public.material_contracts,public.material_orders,uuid,integer,numeric),
  private.c1_material_emit_installment_reminders(date),
  private.c1_material_payment_payload(public.material_contracts,numeric),
  private.c1_material_proposal_json(uuid,uuid,uuid,uuid)
from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
