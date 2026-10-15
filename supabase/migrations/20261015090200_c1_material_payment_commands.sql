set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 52);

-- A5 material payments: invoices, payment requests, treasurer decisions and
-- recorded bank transfers.
--
-- Every command follows the c1_material_cancel_order frame:
--   context and permission -> require_project (completed => PROJECT_COMPLETED)
--   -> lock_actor -> require_keys -> lock contract, then payment request/invoice
--   -> receipt -> version -> business rules -> writes -> notifications
--   -> receipt, audit, ack.
-- Lock order is always material_contracts -> material_payment_requests (or
-- material_invoices). T1 amendments lock material_orders -> material_contracts
-- and never touch requests, so the two paths cannot deadlock.
--
-- private.c1_material_require_contract_file(t, c, p, file_id, target_kind, role, order_id, contract_id)
-- is created by 20261015090100_c1_material_contract_commands.sql (applied before
-- this migration) and is only called here.

-- Shared helpers --------------------------------------------------------------

create function private.c1_material_finance_command_start(
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
  perform private.c1_workflow_require_keys(target_input, target_required, target_allowed);
  return v_tenant_id;
end;
$$;

create function private.c1_material_finance_finish(
  t uuid,
  c uuid,
  target_command text,
  target_idempotency_key uuid,
  target_hash text,
  target_resource_id uuid,
  target_version bigint,
  target_action text,
  target_resource_type text,
  target_request_id uuid,
  target_summary jsonb
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version
  ) values (
    t, c, auth.uid(), target_command, target_idempotency_key, target_hash, target_resource_id, target_version
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    t, c, auth.uid(), target_action, target_resource_type, target_resource_id::text, target_request_id, target_summary
  );
end;
$$;

create function private.c1_material_finance_reason(target_value jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare v_value text;
begin
  v_value := private.c1_workflow_text(target_value);
  if char_length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  return v_value;
end;
$$;

create function private.c1_material_finance_note(target_value jsonb)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if target_value is null or jsonb_typeof(target_value) = 'null' then
    return null;
  end if;
  return private.c1_material_finance_reason(target_value);
end;
$$;

create function private.c1_material_vietnam_today()
returns date language sql stable set search_path = '' as $$
  select (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

create function private.c1_material_lock_contract(t uuid, c uuid, p uuid, target_contract_id uuid)
returns public.material_contracts language plpgsql volatile security definer set search_path = '' as $$
declare v_contract public.material_contracts%rowtype;
begin
  select contract.* into v_contract from public.material_contracts as contract
  where contract.id = target_contract_id and contract.tenant_id = t and contract.company_id = c and contract.project_id = p
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return v_contract;
end;
$$;

-- Resolve the contract of a request or invoice without locking it, so callers
-- can lock the contract first and the child row second.
create function private.c1_material_request_contract_id(t uuid, c uuid, p uuid, target_request_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_contract_id uuid;
begin
  select request.contract_id into v_contract_id from public.material_payment_requests as request
  where request.id = target_request_id and request.tenant_id = t and request.company_id = c and request.project_id = p;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return v_contract_id;
end;
$$;

create function private.c1_material_invoice_contract_id(t uuid, c uuid, p uuid, target_invoice_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_contract_id uuid;
begin
  select invoice.contract_id into v_contract_id from public.material_invoices as invoice
  where invoice.id = target_invoice_id and invoice.tenant_id = t and invoice.company_id = c and invoice.project_id = p;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return v_contract_id;
end;
$$;

-- Caller must already hold the contract lock (contract -> request order).
create function private.c1_material_lock_payment_request(target_contract public.material_contracts, target_request_id uuid)
returns public.material_payment_requests language plpgsql volatile security definer set search_path = '' as $$
declare v_request public.material_payment_requests%rowtype;
begin
  select request.* into v_request from public.material_payment_requests as request
  where request.id = target_request_id and request.contract_id = target_contract.id
    and request.tenant_id = target_contract.tenant_id and request.company_id = target_contract.company_id
    and request.project_id = target_contract.project_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return v_request;
end;
$$;

create function private.c1_material_current_installment(target_contract public.material_contracts, target_key uuid)
returns public.material_contract_installments language plpgsql stable security definer set search_path = '' as $$
declare v_installment public.material_contract_installments%rowtype;
begin
  select installment.* into v_installment
  from public.material_contract_installments as installment
  join public.material_contract_versions as version_row on version_row.id = installment.contract_version_id
  where installment.contract_id = target_contract.id
    and version_row.version_no = target_contract.current_version_no
    and installment.installment_key = target_key;
  if not found then raise exception using errcode = 'P0001', message = 'INSTALLMENT_NOT_FOUND'; end if;
  return v_installment;
end;
$$;

-- Capacity check: excluding_request_id lets resubmit ignore its own previous amount (it is 'returned', so already excluded).
-- The contract row is (re)locked for update here so every capacity decision is
-- serialised per contract even if a caller forgot to lock, and the current
-- version is read under that lock rather than from the caller's copy.
create function private.c1_material_require_capacity(
  target_contract public.material_contracts, target_key uuid, target_amount numeric, excluding_request_id uuid
) returns public.material_contract_installments language plpgsql volatile security definer set search_path = '' as $$
declare
  v_contract public.material_contracts%rowtype;
  v_installment public.material_contract_installments%rowtype;
  v_used numeric(20,4);
begin
  select contract.* into v_contract from public.material_contracts as contract
  where contract.id = target_contract.id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  v_installment := private.c1_material_current_installment(v_contract, target_key);
  select coalesce(sum(payment.amount), 0) into v_used from public.material_payments as payment
  where payment.contract_id = v_contract.id and payment.installment_key = target_key;
  select v_used + coalesce(sum(request.amount), 0) into v_used from public.material_payment_requests as request
  where request.contract_id = v_contract.id and request.installment_key = target_key
    and request.state in ('submitted','approved')
    and request.id is distinct from excluding_request_id;
  if v_used + target_amount > v_installment.amount then
    raise exception using errcode = 'P0001', message = 'INSTALLMENT_CAPACITY_EXCEEDED';
  end if;
  return v_installment;
end;
$$;

create function private.c1_material_link_request_invoices(
  target_request public.material_payment_requests, target_invoice_ids jsonb, target_is_advance boolean
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
  if not target_is_advance and cardinality(v_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'INVOICE_REQUIRED';
  end if;
  delete from public.material_payment_request_invoices where payment_request_id = target_request.id;
  insert into public.material_payment_request_invoices(payment_request_id, invoice_id, tenant_id, company_id, project_id, contract_id)
  select target_request.id, invoice_id, target_request.tenant_id, target_request.company_id, target_request.project_id, target_request.contract_id
  from unnest(v_ids) as invoice_id;
  return v_ids;
end;
$$;

create function private.c1_material_payment_link(target_contract public.material_contracts)
returns text language sql immutable set search_path = '' as $$
  select '/materials/' || target_contract.project_id::text || '/orders/' || target_contract.order_id::text;
$$;

-- Payload for payment notifications. Recipients are approvers (finance
-- permission) or the submitter of the request; the only money value is the
-- request amount, never contract totals.
create function private.c1_material_payment_payload(target_contract public.material_contracts, target_amount numeric)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'supplierName', (
      select party.display_name from public.business_parties as party
      where party.id = target_contract.supplier_id and party.tenant_id = target_contract.tenant_id
        and party.company_id = target_contract.company_id
    ),
    'contractNo', target_contract.contract_no,
    'amount', target_amount::numeric(20,4)::text
  );
$$;

-- record_invoice ---------------------------------------------------------------

create function private.c1_material_record_invoice(
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
begin
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.contract.record', target_input,
    array['invoiceSymbol','invoiceNo','issuedOn','subtotal','vatAmount','total','fileId','lines'],
    array['invoiceSymbol','invoiceNo','issuedOn','subtotal','vatAmount','total','fileId','lines']
  );

  v_contract := private.c1_material_lock_contract(v_tenant_id, target_company_id, target_project_id, target_id);

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.record_invoice', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
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
      subtotal, vat_amount, total, file_id, recorded_by
    ) values (
      v_tenant_id, target_company_id, target_project_id, v_contract.id, v_contract.supplier_id, v_symbol, v_number, v_issued_on,
      v_subtotal, v_vat, v_total, private.c1_material_uuid(target_input->'fileId'), v_actor_id
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
      'invoiceSymbol', v_symbol, 'invoiceNo', v_number)
  );
  return private.c1_material_ack(v_invoice.id, v_invoice.version, false);
end;
$$;

-- void_invoice -----------------------------------------------------------------

create function private.c1_material_void_invoice(
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
  v_reason text;
begin
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.contract.record', target_input,
    array['expectedVersion','reason'], array['expectedVersion','reason']
  );

  v_contract := private.c1_material_lock_contract(
    v_tenant_id, target_company_id, target_project_id,
    private.c1_material_invoice_contract_id(v_tenant_id, target_company_id, target_project_id, target_id));
  select invoice.* into v_invoice from public.material_invoices as invoice
  where invoice.id = target_id and invoice.contract_id = v_contract.id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.void_invoice', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    return private.c1_material_ack(v_receipt.result_resource_id, v_receipt.result_version, true);
  end if;

  if v_invoice.version <> private.c1_material_version(target_input->'expectedVersion') or v_invoice.state = 'voided' then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  v_reason := private.c1_material_finance_reason(target_input->'reason');

  if exists (
    select 1
    from public.material_payment_request_invoices as link
    join public.material_payment_requests as request on request.id = link.payment_request_id
    where link.invoice_id = v_invoice.id and request.state <> 'cancelled'
  ) then
    raise exception using errcode = 'P0001', message = 'INVOICE_IN_USE';
  end if;

  update public.material_invoices as invoice
  set state = 'voided', void_reason = v_reason, voided_by = v_actor_id, voided_at = now(), version = invoice.version + 1
  where invoice.id = v_invoice.id
  returning invoice.* into v_invoice;

  perform private.c1_material_finance_finish(
    v_tenant_id, target_company_id, 'material.void_invoice', target_idempotency_key, v_hash,
    v_invoice.id, v_invoice.version, 'c1.material_invoice.voided', 'material_invoice', target_request_id,
    jsonb_build_object('projectId', target_project_id, 'contractId', v_contract.id, 'reason', v_reason)
  );
  return private.c1_material_ack(v_invoice.id, v_invoice.version, false);
end;
$$;

-- create_payment_request -------------------------------------------------------

create function private.c1_material_create_payment_request(
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

  v_invoice_ids := private.c1_material_link_request_invoices(v_request, target_input->'invoiceIds', v_installment.is_advance);

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

-- resubmit_payment_request -----------------------------------------------------

create function private.c1_material_resubmit_payment_request(
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

  v_invoice_ids := private.c1_material_link_request_invoices(v_request, target_input->'invoiceIds', v_installment.is_advance);

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

-- cancel_payment_request -------------------------------------------------------

create function private.c1_material_cancel_payment_request(
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
  v_tenant_id := private.c1_material_finance_command_start(
    target_company_id, target_project_id, 'material.payment.request', target_input,
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

-- decide_payment_request -------------------------------------------------------

create function private.c1_material_decide_payment_request(
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
      private.c1_material_payment_payload(v_contract, v_request.amount) || jsonb_build_object('reason', v_reason),
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

-- record_payment ---------------------------------------------------------------

create function private.c1_material_record_payment(
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
    private.c1_material_payment_payload(v_contract, v_request.amount),
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

-- Reads ------------------------------------------------------------------------

create function private.c1_material_require_finance_contract(
  target_company_id uuid, target_project_id uuid, target_contract_id uuid
)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not private.c1_material_can_read_finance(v_tenant_id, target_company_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if not exists (
    select 1 from public.material_contracts as contract
    where contract.id = target_contract_id and contract.tenant_id = v_tenant_id
      and contract.company_id = target_company_id and contract.project_id = target_project_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  return v_tenant_id;
end;
$$;

create function private.c1_material_list_invoices(
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

create function private.c1_material_list_payment_requests(
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

-- Public wrappers --------------------------------------------------------------

create function public.c1_material_record_invoice(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_record_invoice(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_void_invoice(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_void_invoice(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_create_payment_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_create_payment_request(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_resubmit_payment_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_resubmit_payment_request(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_cancel_payment_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_cancel_payment_request(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_decide_payment_request(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_decide_payment_request(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_record_payment(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_record_payment(target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id);
$$;
create function public.c1_material_list_invoices(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.c1_material_list_invoices(target_company_id,target_project_id,target_id);
$$;
create function public.c1_material_list_payment_requests(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.c1_material_list_payment_requests(target_company_id,target_project_id,target_id);
$$;

revoke all on function
  private.c1_material_finance_command_start(uuid,uuid,text,jsonb,text[],text[]),
  private.c1_material_finance_finish(uuid,uuid,text,uuid,text,uuid,bigint,text,text,uuid,jsonb),
  private.c1_material_finance_reason(jsonb),
  private.c1_material_finance_note(jsonb),
  private.c1_material_vietnam_today(),
  private.c1_material_lock_contract(uuid,uuid,uuid,uuid),
  private.c1_material_request_contract_id(uuid,uuid,uuid,uuid),
  private.c1_material_invoice_contract_id(uuid,uuid,uuid,uuid),
  private.c1_material_lock_payment_request(public.material_contracts,uuid),
  private.c1_material_current_installment(public.material_contracts,uuid),
  private.c1_material_require_capacity(public.material_contracts,uuid,numeric,uuid),
  private.c1_material_link_request_invoices(public.material_payment_requests,jsonb,boolean),
  private.c1_material_payment_link(public.material_contracts),
  private.c1_material_payment_payload(public.material_contracts,numeric),
  private.c1_material_record_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_void_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_create_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_resubmit_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_cancel_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_require_finance_contract(uuid,uuid,uuid),
  private.c1_material_list_invoices(uuid,uuid,uuid),
  private.c1_material_list_payment_requests(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

revoke all on function
  public.c1_material_record_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_void_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_create_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_resubmit_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_cancel_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_list_invoices(uuid,uuid,uuid),
  public.c1_material_list_payment_requests(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.c1_material_record_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_void_invoice(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_create_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_resubmit_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_cancel_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_list_invoices(uuid,uuid,uuid),
  public.c1_material_list_payment_requests(uuid,uuid,uuid)
to authenticated;

notify pgrst, 'reload schema';
