set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 60);

-- A4/A5 finance flow adjustments (spec 2026-10-16 flow adjustments, C2-C4).
--   C2  A record without a contract ('quotation_only') may carry VAT. vatAmount and
--       total are optional; the order subtotal and the total after VAT must both be
--       below 5000000 VND. Its payment requests need an invoice like any other
--       non-advance installment (small order rule R6 is withdrawn).
--   C3  An invoice has two stages on the same row: 'draft' (a draft or signed copy
--       from the supplier) and 'official'. Officializing only attaches the official
--       file; the content and the first file stay. Invoices also accept photos.
--   C4  The accountant who requested a payment may record it (the self-decision
--       block moves off record_payment and stays on decide_payment_request). An
--       approval notifies the submitter; a payment notifies the latest approver.
--
-- Each function below is copied from its latest definition and changes only what is
-- listed; signatures, security definer, search_path and grants stay as they were.
--   record_contract, installment_requires_invoice,
--   evidence_mime_allowed, decide_payment_request,
--   finance_facts, read_contract               20261016090000
--   record_payment                             20261016090100
--   require_contract_file                      20261015090100
--   record_invoice, list_invoices              20261015090200
--   app_notifications event_kind check         20261015090000
-- officialize_invoice is new and follows void_invoice (20261015090200).
-- Proposal functions are not touched here.

-- Tables -----------------------------------------------------------------------------

-- C2: a version without a contract file may now carry VAT. The exact rule (record
-- without a contract, VND, order subtotal and total below the threshold) lives in
-- record_contract; the CHECK stays a safety net.
alter table public.material_contract_versions
  drop constraint material_contract_versions_contract_file_check,
  add constraint material_contract_versions_contract_file_check
    check (contract_file_id is not null or (kind = 'original' and total < 5000000));

-- C3: existing rows were recorded as official invoices and take stage = 'official'
-- with no officialization columns, the second allowed combination below.
-- official_file_id is null for an invoice recorded as official, because file_id is
-- already its official file. file_id keeps meaning the first file and never changes.
alter table public.material_invoices
  add column stage text not null default 'official'
    constraint material_invoices_stage_check
    check (stage in ('draft', 'official')),
  add column official_file_id uuid
    constraint material_invoices_official_file_id_key unique,
  add column officialized_by uuid references auth.users(id) on delete restrict,
  add column officialized_at timestamptz,
  add constraint material_invoices_official_file_fkey
    foreign key (official_file_id, tenant_id, company_id, project_id) references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict,
  add constraint material_invoices_stage_official_check check (
    (stage = 'draft' and official_file_id is null and officialized_by is null and officialized_at is null)
    or (stage = 'official' and official_file_id is null and officialized_by is null and officialized_at is null)
    or (stage = 'official' and official_file_id is not null and officialized_by is not null and officialized_at is not null)
  );

-- C4: the treasurer's approval notifies the submitter.
alter table public.app_notifications
  drop constraint app_notifications_event_kind_check,
  add constraint app_notifications_event_kind_check check (event_kind in (
    'material.order.created','material.contract.recorded','material.contract.amended',
    'material.installment.due_soon','material.installment.overdue',
    'material.payment.submitted','material.payment.returned','material.payment.paid','material.payment.approved'));

-- installment_requires_invoice (20261016090000) --------------------------------------
-- Change: a record without a contract no longer skips the invoice (R6 withdrawn, C2).
-- The contract argument stays so every caller keeps its call unchanged.

create or replace function private.c1_material_installment_requires_invoice(
  target_contract public.material_contracts, target_installment public.material_contract_installments
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(not target_installment.is_advance, true);
$$;

-- record_contract (20261016090000) ---------------------------------------------------
-- Change: the quotation_only branch accepts optional vatAmount and total; a missing
-- vatAmount means 0 and a missing total means subtotal + vatAmount. The shared money
-- check validates them as for a contract, and the threshold applies to the order
-- subtotal and to the total after VAT.

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
  v_vat_input jsonb;
  v_total_input jsonb;
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
    -- No contract number, contract file or schedule: the server derives the schedule.
    -- VAT and total are optional (C2).
    perform private.c1_workflow_require_keys(
      target_input,
      array['documentation','expectedOrderVersion','signedOn','subtotal','varianceReason','signedQuotationFileId'],
      array['documentation','expectedOrderVersion','signedOn','subtotal','vatAmount','total','varianceReason','signedQuotationFileId']
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
    -- A missing vatAmount means 0 and a missing total means subtotal + vatAmount (C2).
    -- The shared money check then requires total = subtotal + VAT as for a contract
    -- (CONTRACT_TOTAL_MISMATCH), computes the order subtotal and enforces the
    -- variance reason (R3).
    v_vat_input := case when target_input ? 'vatAmount' then target_input->'vatAmount' else to_jsonb('0'::text) end;
    v_total_input := case
      when target_input ? 'total' then target_input->'total'
      else to_jsonb((private.c1_workflow_money(target_input->'subtotal', 4) + private.c1_workflow_money(v_vat_input, 4))::text)
    end;
    select * into v_money from private.c1_material_contract_money(
      jsonb_build_object(
        'subtotal', target_input->'subtotal', 'vatAmount', v_vat_input, 'total', v_total_input,
        'varianceReason', target_input->'varianceReason'
      ),
      v_order.id
    );
    -- The order subtotal and the total after VAT must both be below the threshold,
    -- in VND (R1-R3, C2). VAT is never negative, so the total covers the subtotal.
    if not private.c1_material_is_small_amount(v_money.order_subtotal, v_order.currency_code)
      or not private.c1_material_is_small_amount(v_money.total, v_order.currency_code)
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
    -- One server-generated installment: 100% of the total after VAT, due on the
    -- recorded date (R4).
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

-- require_contract_file (20261015090100) ---------------------------------------------
-- Change: a file already used as the official file of an invoice is used too, so one
-- file can never back two invoices (C3).

create or replace function private.c1_material_require_contract_file(
  t uuid, c uuid, p uuid, file_id uuid, target_kind text, role text, order_id uuid, contract_id uuid
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if c1_material_require_contract_file.file_id is null
    or not exists (
      select 1
      from public.cost_evidence_files as evidence
      join public.material_evidence_scopes as scope
        on scope.evidence_file_id = evidence.id
       and scope.tenant_id = evidence.tenant_id
       and scope.company_id = evidence.company_id
       and scope.project_id = evidence.project_id
      where evidence.id = c1_material_require_contract_file.file_id
        and evidence.tenant_id = t and evidence.company_id = c and evidence.project_id = p
        and evidence.status = 'finalized'
        and scope.target_kind = c1_material_require_contract_file.target_kind
        and scope.evidence_role = c1_material_require_contract_file.role
        and scope.order_id is not distinct from c1_material_require_contract_file.order_id
        and scope.contract_id is not distinct from c1_material_require_contract_file.contract_id
    )
    or exists (
      select 1 from public.material_contract_versions as ver
      where ver.contract_file_id = c1_material_require_contract_file.file_id
         or ver.signed_quotation_file_id = c1_material_require_contract_file.file_id
    )
    or exists (
      select 1 from public.material_invoices as invoice
      where invoice.file_id = c1_material_require_contract_file.file_id
         or invoice.official_file_id = c1_material_require_contract_file.file_id
    )
    or exists (
      select 1 from public.material_payments as payment
      where payment.proof_file_id = c1_material_require_contract_file.file_id
    )
  then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_INVALID';
  end if;
end;
$$;

-- evidence_mime_allowed (20261016090000) ---------------------------------------------
-- Change: invoices may also be photos taken on site (C3), draft or official.

create or replace function private.c1_material_evidence_mime_allowed(target_role text, target_mime text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    case target_role
      when 'unsigned_quotation' then target_mime = 'application/pdf'
      when 'signed_quotation' then target_mime in ('application/pdf','image/jpeg','image/png')
      when 'signed_contract' then target_mime = 'application/pdf'
      when 'contract_amendment' then target_mime = 'application/pdf'
      when 'invoice' then target_mime in ('application/pdf','application/xml','text/xml','image/jpeg','image/png')
      when 'payment_proof' then target_mime in ('application/pdf','image/jpeg','image/png')
      else false
    end,
    false
  );
$$;

-- record_invoice (20261015090200) ----------------------------------------------------
-- Change: accepts an optional stage ('draft' | 'official'); a missing key means
-- 'official', so older clients keep working. Every other check is unchanged: a draft
-- carries the same symbol, number, date and amounts as its official copy.

create or replace function private.c1_material_record_invoice(
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
  v_invoice public.material_invoices%rowtype;
  v_symbol text;
  v_number text;
  v_issued_on date;
  v_subtotal numeric(20,4);
  v_vat numeric(20,4);
  v_total numeric(20,4);
  v_contract_total numeric(20,4);
  v_recorded numeric(20,4);
  v_line jsonb;
  v_line_id uuid;
  v_line_name text;
  v_material_id uuid;
  v_seen uuid[] := '{}';
  v_constraint text;
  v_stage text;
begin
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.contract.record', target_input,
    array['invoiceSymbol','invoiceNo','issuedOn','subtotal','vatAmount','total','fileId','lines'],
    array['invoiceSymbol','invoiceNo','issuedOn','subtotal','vatAmount','total','fileId','lines','stage']
  );

  v_contract := private.c1_material_lock_contract(v_tenant_id, target_company_id, target_project_id, target_id);

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.record_invoice', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  if target_input ? 'stage' and jsonb_typeof(target_input->'stage') is distinct from 'string' then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_stage := coalesce(target_input->>'stage', 'official');
  if v_stage not in ('draft','official') then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  v_symbol := private.c1_workflow_text(target_input->'invoiceSymbol');
  v_number := private.c1_workflow_text(target_input->'invoiceNo');
  if char_length(v_symbol) > 20 or char_length(v_number) > 50 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_issued_on := private.c1_workflow_date(target_input->'issuedOn');
  if v_issued_on > private.c1_material_vietnam_today() then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_subtotal := private.c1_material_positive(target_input->'subtotal');
  v_vat := private.c1_workflow_money(target_input->'vatAmount', 4);
  v_total := private.c1_material_positive(target_input->'total');
  if v_total <> v_subtotal + v_vat then
    raise exception using errcode = 'P0001', message = 'INVOICE_TOTAL_MISMATCH';
  end if;
  if jsonb_typeof(target_input->'lines') is distinct from 'array' or jsonb_array_length(target_input->'lines') > 1000 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  select version_row.total into v_contract_total
  from public.material_contract_versions as version_row
  where version_row.contract_id = v_contract.id and version_row.version_no = v_contract.current_version_no;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  select coalesce(sum(invoice.total), 0) into v_recorded from public.material_invoices as invoice
  where invoice.contract_id = v_contract.id and invoice.state = 'recorded';
  if v_recorded + v_total > v_contract_total then
    raise exception using errcode = 'P0001', message = 'INVOICE_TOTAL_EXCEEDED';
  end if;

  if exists (
    select 1 from public.material_invoices as invoice
    where invoice.company_id = target_company_id and invoice.supplier_id = v_contract.supplier_id
      and invoice.invoice_symbol = v_symbol and invoice.invoice_no = v_number and invoice.state = 'recorded'
  ) then
    raise exception using errcode = 'P0001', message = 'INVOICE_DUPLICATE';
  end if;

  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, private.c1_material_uuid(target_input->'fileId'),
    'material_contract', 'invoice', null::uuid, v_contract.id);

  begin
    insert into public.material_invoices(
      tenant_id, company_id, project_id, contract_id, supplier_id, invoice_symbol, invoice_no, issued_on,
      subtotal, vat_amount, total, file_id, stage, recorded_by
    ) values (
      v_tenant_id, target_company_id, target_project_id, v_contract.id, v_contract.supplier_id, v_symbol, v_number, v_issued_on,
      v_subtotal, v_vat, v_total, private.c1_material_uuid(target_input->'fileId'), v_stage, v_actor_id
    ) returning * into v_invoice;
  exception when unique_violation then
    -- A concurrent invoice on another contract of the same supplier won the race.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'material_invoices_recorded_identity_idx' then
      raise exception using errcode = 'P0001', message = 'INVOICE_DUPLICATE';
    end if;
    raise exception using errcode = 'P0001', message = 'EVIDENCE_INVALID';
  end;

  for v_line in select value from jsonb_array_elements(target_input->'lines') loop
    perform private.c1_workflow_require_keys(v_line, array['proposalLineId','invoiceMaterialName'], array['proposalLineId','invoiceMaterialName']);
    v_line_id := private.c1_material_uuid(v_line->'proposalLineId');
    v_line_name := private.c1_workflow_text(v_line->'invoiceMaterialName');
    if char_length(v_line_name) > 300 or v_line_id = any(v_seen) then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_seen := v_seen || v_line_id;

    -- The line must be allocated to this contract's order; the material comes
    -- from the approved revision snapshot of that allocation.
    select snapshot.material_id into v_material_id
    from public.material_order_allocations as allocation
    join public.material_proposal_revision_lines as snapshot
      on snapshot.revision_id = allocation.approved_revision_id
     and snapshot.proposal_line_id = allocation.proposal_line_id
     and snapshot.tenant_id = allocation.tenant_id
     and snapshot.company_id = allocation.company_id
     and snapshot.project_id = allocation.project_id
    where allocation.order_id = v_contract.order_id
      and allocation.proposal_line_id = v_line_id
      and allocation.tenant_id = v_tenant_id
      and allocation.company_id = target_company_id
      and allocation.project_id = target_project_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;

    insert into public.material_invoice_lines(invoice_id, tenant_id, company_id, project_id, proposal_line_id, invoice_material_name)
    values (v_invoice.id, v_tenant_id, target_company_id, target_project_id, v_line_id, v_line_name);

    -- material_supplier_names.name is limited to 200 characters; longer invoice
    -- names stay on the invoice line only.
    if char_length(v_line_name) <= 200 then
      insert into public.material_supplier_names(tenant_id, company_id, material_id, supplier_id, document_kind, name, created_by)
      values (v_tenant_id, target_company_id, v_material_id, v_contract.supplier_id, 'invoice', v_line_name, v_actor_id)
      on conflict (material_id, supplier_id, document_kind, name) do nothing;
    end if;
  end loop;

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.record_invoice', target_idempotency_key, v_hash,
    v_invoice.id, v_invoice.version, 'c1.material_invoice.recorded', 'material_invoice', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'total', v_total::text,
      'invoiceSymbol', v_symbol, 'invoiceNo', v_number, 'stage', v_stage)
  );
  return private.c1_material_ack(v_invoice.id, v_invoice.version, false);
end;
$$;

-- officialize_invoice (new, follows void_invoice of 20261015090200) ------------------
-- Attaches the official file to a recorded draft invoice. The content and file_id stay;
-- links to payment requests and the invoiced total do not change. The acting
-- accountant is the only party, so no one else is told.

create function private.c1_material_officialize_invoice(
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
  v_invoice public.material_invoices%rowtype;
  v_official_file_id uuid;
begin
  -- finance_command_start requires the given permission plus material.read (T8 hardening A),
  -- so officialize needs material.contract.record and material.read, as the spec says.
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.contract.record', target_input,
    array['expectedVersion','officialFileId'], array['expectedVersion','officialFileId']
  );

  v_contract := private.c1_material_lock_contract(
    v_tenant_id, target_company_id, target_project_id,
    private.c1_material_invoice_contract_id(v_tenant_id, target_company_id, target_project_id, target_id));
  select invoice.* into v_invoice from public.material_invoices as invoice
  where invoice.id = target_id and invoice.contract_id = v_contract.id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.officialize_invoice', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  -- Only a recorded draft can become official; an official or voided invoice is a
  -- version conflict, as is a second officialize with the same expected version.
  if v_invoice.version <> private.c1_material_version(target_input->'expectedVersion')
    or v_invoice.state <> 'recorded' or v_invoice.stage <> 'draft'
  then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  -- An invoice file of this contract, finalized and not used anywhere: not as the
  -- first file or the official file of any invoice, nor by a contract or payment.
  v_official_file_id := private.c1_material_uuid(target_input->'officialFileId');
  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, v_official_file_id,
    'material_contract', 'invoice', null::uuid, v_contract.id);

  begin
    update public.material_invoices as invoice
    set stage = 'official', official_file_id = v_official_file_id,
        officialized_by = v_actor_id, officialized_at = now(), version = invoice.version + 1
    where invoice.id = v_invoice.id
    returning invoice.* into v_invoice;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_INVALID';
  end;

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.officialize_invoice', target_idempotency_key, v_hash,
    v_invoice.id, v_invoice.version, 'c1.material_invoice.officialized', 'material_invoice', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'officialFileId', v_official_file_id)
  );
  return private.c1_material_ack(v_invoice.id, v_invoice.version, false);
end;
$$;

create function public.c1_material_officialize_invoice(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_officialize_invoice(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;

-- list_invoices (20261015090200) -----------------------------------------------------
-- Change: each invoice also carries stage, officialFileId and officializedAt.

create or replace function private.c1_material_list_invoices(
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
    'id', invoice.id,
    'contractId', invoice.contract_id,
    'invoiceSymbol', invoice.invoice_symbol,
    'invoiceNo', invoice.invoice_no,
    'issuedOn', invoice.issued_on,
    'subtotal', invoice.subtotal::text,
    'vatAmount', invoice.vat_amount::text,
    'total', invoice.total::text,
    'fileId', invoice.file_id,
    'stage', invoice.stage,
    'officialFileId', invoice.official_file_id,
    'officializedAt', to_jsonb(invoice.officialized_at),
    'state', invoice.state,
    'voidReason', invoice.void_reason,
    'version', invoice.version,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'proposalLineId', line.proposal_line_id,
        'invoiceMaterialName', line.invoice_material_name
      ) order by line.proposal_line_id), '[]'::jsonb)
      from public.material_invoice_lines as line
      where line.invoice_id = invoice.id
    )
  ) order by invoice.issued_on desc, invoice.id), '[]'::jsonb)
  into v_result
  from public.material_invoices as invoice
  where invoice.contract_id = target_id
    and invoice.tenant_id = v_tenant_id
    and invoice.company_id = target_company_id
    and invoice.project_id = target_project_id;
  return v_result;
end;
$$;

-- read_contract (20261016090000) -----------------------------------------------------
-- Change: the contract also carries draftInvoiced, the total of its recorded draft
-- invoices, in the same format as invoiced (which still counts drafts too, C3).

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
    'draftInvoiced', coalesce((
      select sum(invoice.total) from public.material_invoices as invoice
      where invoice.contract_id = v_contract.id and invoice.state = 'recorded' and invoice.stage = 'draft'), 0)::numeric(20,4)::text,
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

-- decide_payment_request (20261016090000) --------------------------------------------
-- Change: an approval (the treasurer confirming the bank order) notifies the submitter
-- with material.payment.approved, by user id and without money. A submitter still
-- cannot decide their own request. The invoice requirement comment follows C2.

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
    -- A record without a contract needs one too (C2).
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
  else
    -- The treasurer has created the bank order: the submitting accountant now waits for
    -- the director and then uploads the transfer receipt (C4).
    perform private.c1_material_notify_users(
      v_tenant_id, target_company_id, target_project_id, array[v_request.submitted_by],
      'material.payment.approved', 'material_payment_request', v_request.id,
      private.c1_material_payment_link(v_contract),
      -- Addressed to the submitter by user id: project, contract and supplier only, never money.
      (private.c1_material_payment_payload(v_contract, v_request.amount) - 'amount')
        || jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id),
      'pr:' || v_request.id::text || ':appr:' || v_request.revision_no::text
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

-- record_payment (20261016090100) ----------------------------------------------------
-- Changes: the submitter may record the payment (the accountant who requested it
-- uploads the transfer receipt, C4); the paid notification goes to the latest
-- approver instead of the submitter; the invoice requirement comment follows C2.

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
  v_approver uuid;
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
  -- No self-decision check here: the accountant who requested the payment records it
  -- after the treasurer approved it (C4). The approval itself still blocks the submitter.
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
  -- A record without a contract needs one too (C2); a draft invoice counts (C3).
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

  -- The treasurer who approved the current revision learns that the money went out (C4).
  select decision.decided_by into v_approver
  from public.material_payment_decisions as decision
  where decision.payment_request_id = v_request.id and decision.decision = 'approve'
  order by decision.request_revision_no desc, decision.decided_at desc
  limit 1;

  perform private.c1_material_notify_users(
    v_tenant_id, target_company_id, target_project_id, array[v_approver],
    'material.payment.paid', 'material_payment_request', v_request.id,
    private.c1_material_payment_link(v_contract),
    -- Addressed to the approver by user id: supplier and contract only, never money.
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

-- finance_facts (20261016090000) -----------------------------------------------------
-- Change: each contract also carries draftInvoiced, the total of its recorded draft
-- invoices ("Hóa đơn chờ bản chính thức"). invoiced still counts drafts too (C3).

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
    'draftInvoiced', coalesce((
      select sum(invoice.total) from public.material_invoices as invoice
      where invoice.contract_id = contract.id and invoice.state = 'recorded' and invoice.stage = 'draft'
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

-- Grants -------------------------------------------------------------------------------
-- create or replace keeps the grants of the rewritten functions; the revoke repeats the
-- private state so a fresh database ends the same way. The new private command starts
-- with PUBLIC execute and is revoked here; only its public wrapper is granted, to
-- authenticated.
revoke all on function
  private.c1_material_installment_requires_invoice(public.material_contracts,public.material_contract_installments),
  private.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_require_contract_file(uuid,uuid,uuid,uuid,text,text,uuid,uuid),
  private.c1_material_evidence_mime_allowed(text,text),
  private.c1_material_record_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_list_invoices(uuid,uuid,uuid),
  private.c1_material_read_contract(uuid,uuid,uuid),
  private.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_finance_facts(uuid,uuid)
from public,anon,authenticated,service_role;

revoke all on function public.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
