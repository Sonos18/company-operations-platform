set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 51);

-- A4 material contracts: record, amend and read commands, contract-level order
-- reads and contract notifications. Tables, RLS and notification helpers come
-- from 20261015090000.

-- Evidence gate shared by contract, amendment (and later invoice/payment) commands.
-- A file is usable only when it is finalized in the same scope, carries the exact
-- evidence scope (target, role, order/contract) and has not been attached anywhere yet.
create function private.c1_material_require_contract_file(
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

-- Validates the money block shared by record and amend and returns it.
-- A subtotal that differs from the order subtotal needs a variance reason; an
-- equal subtotal never keeps one (version table check).
create function private.c1_material_contract_money(target_input jsonb, target_order_id uuid)
returns table(subtotal numeric, vat_amount numeric, total numeric, order_subtotal numeric, variance_reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_subtotal numeric(20,4);
  v_vat numeric(20,4);
  v_total numeric(20,4);
  v_order_subtotal numeric(20,4);
  v_variance text;
begin
  v_subtotal := private.c1_workflow_money(target_input->'subtotal', 4);
  v_vat := private.c1_workflow_money(target_input->'vatAmount', 4);
  v_total := private.c1_workflow_money(target_input->'total', 4);
  if v_subtotal <= 0 or v_total <= 0 or v_total <> v_subtotal + v_vat then
    raise exception using errcode = 'P0001', message = 'CONTRACT_TOTAL_MISMATCH';
  end if;
  if jsonb_typeof(target_input->'varianceReason') not in ('null', 'string') then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if jsonb_typeof(target_input->'varianceReason') = 'string' then
    v_variance := private.c1_workflow_text(target_input->'varianceReason');
    if char_length(v_variance) > 1000 then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
  end if;
  select coalesce(sum(allocation.quantity * allocation.unit_price), 0)::numeric(20,4) into v_order_subtotal
  from public.material_order_allocations as allocation
  where allocation.order_id = target_order_id;
  if v_subtotal <> v_order_subtotal and v_variance is null then
    raise exception using errcode = 'P0001', message = 'VARIANCE_REASON_REQUIRED';
  end if;
  if v_subtotal = v_order_subtotal then v_variance := null; end if;
  return query select v_subtotal, v_vat, v_total, v_order_subtotal, v_variance;
end;
$$;

-- Inserts the payment schedule of one contract version. Items are numbered in
-- array order starting at 1; the schedule must add up to the version total.
create function private.c1_material_insert_installments(
  target_contract public.material_contracts, target_version_id uuid, items jsonb, target_total numeric
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_seq integer := 0;
  v_sum numeric(20,4) := 0;
  v_amount numeric(20,4);
  v_key uuid;
  v_keys uuid[] := array[]::uuid[];
  v_advance jsonb;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  for v_item in select element.item from jsonb_array_elements(items) with ordinality as element(item, ord) order by element.ord loop
    perform private.c1_workflow_require_keys(
      v_item,
      array['installmentKey','name','amount','dueOn','isAdvance'],
      array['installmentKey','name','amount','dueOn','isAdvance']
    );
    v_key := private.c1_material_uuid(v_item->'installmentKey');
    if v_key = any(v_keys) then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_keys := v_keys || v_key;
    v_amount := private.c1_workflow_money(v_item->'amount', 4);
    v_advance := v_item->'isAdvance';
    if v_amount <= 0 or jsonb_typeof(v_advance) is distinct from 'boolean' then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_seq := v_seq + 1;
    v_sum := v_sum + v_amount;
    insert into public.material_contract_installments(
      tenant_id, company_id, project_id, contract_id, contract_version_id,
      seq, installment_key, name, amount, due_on, is_advance
    ) values (
      target_contract.tenant_id, target_contract.company_id, target_contract.project_id, target_contract.id, target_version_id,
      v_seq, v_key, private.c1_material_short_text(v_item->'name'), v_amount,
      private.c1_workflow_date(v_item->'dueOn'), (v_advance#>>'{}')::boolean
    );
  end loop;
  if v_sum <> target_total then
    raise exception using errcode = 'P0001', message = 'INSTALLMENT_TOTAL_MISMATCH';
  end if;
end;
$$;

-- Contract notifications. Finance readers get the money-bearing payload; buyers
-- and engineers (selected by user id, not by finance permission) never see the
-- total. Both calls share one dedupe key, so a user who is both a finance reader
-- and the buyer keeps only the first (money-bearing) row.
create function private.c1_material_notify_contract_saved(
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
  perform private.c1_material_notify_users(
    target_contract.tenant_id, target_contract.company_id, target_contract.project_id,
    array[target_order.created_by, proposal_creator],
    v_event, 'material_contract', target_contract.id, v_link,
    jsonb_build_object(
      'supplierName', v_supplier_name, 'contractNo', target_contract.contract_no, 'versionNo', version_no
    ),
    v_dedupe
  );
end;
$$;

create function private.c1_material_record_contract(
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

create function private.c1_material_amend_contract(
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
    return private.c1_material_ack(v_contract.id, v_contract.version, true);
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

-- Contract detail for one order (target_id is the order id). Returns null when
-- the order has no contract yet. Money is returned only to finance readers.
create function private.c1_material_read_contract(
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

-- Order reads: copy of the T0 definition (20261015090000) with only the contract
-- and cash fields replaced. Money is visible to finance readers only.
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
        'id', contract.id, 'contractNo', contract.contract_no, 'signedOn', contract.signed_on,
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

create function public.c1_material_read_contract(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.c1_material_read_contract(target_company_id,target_project_id,target_id);
$$;
create function public.c1_material_record_contract(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_record_contract(
    target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id
  );
$$;
create function public.c1_material_amend_contract(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_amend_contract(
    target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id
  );
$$;

revoke all on function
  private.c1_material_require_contract_file(uuid,uuid,uuid,uuid,text,text,uuid,uuid),
  private.c1_material_contract_money(jsonb,uuid),
  private.c1_material_insert_installments(public.material_contracts,uuid,jsonb,numeric),
  private.c1_material_notify_contract_saved(public.material_contracts,public.material_orders,uuid,integer,numeric),
  private.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_read_contract(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function
  public.c1_material_read_contract(uuid,uuid,uuid),
  public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.c1_material_read_contract(uuid,uuid,uuid),
  public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid)
to authenticated;

notify pgrst, 'reload schema';
