set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 53);

-- A4/A5 material finance reads: contract/installment facts, role inbox,
-- in-app notification list/read and the daily installment reminder emitter.
-- Money sums stay in SQL; due-status classification (Vietnam today) is done in TypeScript.

create function private.c1_material_finance_facts(target_company_id uuid, target_project_id uuid)
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

create function private.c1_material_finance_inbox_facts(target_company_id uuid, target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_awaiting jsonb := '[]'::jsonb;
  v_returned jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_approved jsonb := '[]'::jsonb;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if not private.c1_material_can_read_finance(v_tenant_id, target_company_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if target_project_id is not null then
    perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  end if;

  if private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.contract.record') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'projectId', material_order.project_id,
      'projectName', project.name,
      'orderId', material_order.id,
      'supplierName', supplier.display_name,
      'orderSubtotal', round(coalesce((
        select sum(allocation.quantity * allocation.unit_price)
        from public.material_order_allocations as allocation
        where allocation.order_id = material_order.id
          and allocation.tenant_id = material_order.tenant_id
          and allocation.company_id = material_order.company_id
          and allocation.project_id = material_order.project_id
      ), 0), 4)::text,
      'createdAt', material_order.created_at
    ) order by material_order.created_at, material_order.id), '[]'::jsonb)
    into v_awaiting
    from public.material_orders as material_order
    join public.projects as project
      on project.id = material_order.project_id
     and project.tenant_id = material_order.tenant_id and project.company_id = material_order.company_id
    join public.business_parties as supplier
      on supplier.id = material_order.supplier_id
     and supplier.tenant_id = material_order.tenant_id and supplier.company_id = material_order.company_id
    where material_order.tenant_id = v_tenant_id
      and material_order.company_id = target_company_id
      and material_order.state = 'active'
      and (target_project_id is null or material_order.project_id = target_project_id)
      and not exists (
        select 1 from public.material_contracts as contract where contract.order_id = material_order.id
      );
  end if;

  if private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.payment.request') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'projectId', request.project_id,
      'projectName', project.name,
      'orderId', contract.order_id,
      'supplierName', supplier.display_name,
      'contractId', request.contract_id,
      'requestId', request.id,
      'amount', request.amount::text,
      'reason', latest.reason
    ) order by request.updated_at, request.id), '[]'::jsonb)
    into v_returned
    from public.material_payment_requests as request
    join public.material_contracts as contract
      on contract.id = request.contract_id
     and contract.tenant_id = request.tenant_id and contract.company_id = request.company_id
    join public.projects as project
      on project.id = request.project_id
     and project.tenant_id = request.tenant_id and project.company_id = request.company_id
    join public.business_parties as supplier
      on supplier.id = contract.supplier_id
     and supplier.tenant_id = contract.tenant_id and supplier.company_id = contract.company_id
    join lateral (
      select decision.reason
      from public.material_payment_decisions as decision
      where decision.payment_request_id = request.id and decision.decision = 'return'
      order by decision.decided_at desc, decision.request_revision_no desc
      limit 1
    ) as latest on true
    where request.tenant_id = v_tenant_id
      and request.company_id = target_company_id
      and request.state = 'returned'
      and (target_project_id is null or request.project_id = target_project_id);
  end if;

  if private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.payment.approve') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'projectId', request.project_id,
      'projectName', project.name,
      'orderId', contract.order_id,
      'supplierName', supplier.display_name,
      'contractId', request.contract_id,
      'requestId', request.id,
      'amount', request.amount::text,
      'submittedBy', request.submitted_by,
      'submittedAt', request.submitted_at
    ) order by request.submitted_at, request.id), '[]'::jsonb)
    into v_pending
    from public.material_payment_requests as request
    join public.material_contracts as contract
      on contract.id = request.contract_id
     and contract.tenant_id = request.tenant_id and contract.company_id = request.company_id
    join public.projects as project
      on project.id = request.project_id
     and project.tenant_id = request.tenant_id and project.company_id = request.company_id
    join public.business_parties as supplier
      on supplier.id = contract.supplier_id
     and supplier.tenant_id = contract.tenant_id and supplier.company_id = contract.company_id
    where request.tenant_id = v_tenant_id
      and request.company_id = target_company_id
      and request.state = 'submitted'
      and (target_project_id is null or request.project_id = target_project_id);
  end if;

  if private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.payment.execute') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'projectId', request.project_id,
      'projectName', project.name,
      'orderId', contract.order_id,
      'supplierName', supplier.display_name,
      'contractId', request.contract_id,
      'requestId', request.id,
      'amount', request.amount::text,
      'approvedAt', latest.decided_at
    ) order by latest.decided_at, request.id), '[]'::jsonb)
    into v_approved
    from public.material_payment_requests as request
    join public.material_contracts as contract
      on contract.id = request.contract_id
     and contract.tenant_id = request.tenant_id and contract.company_id = request.company_id
    join public.projects as project
      on project.id = request.project_id
     and project.tenant_id = request.tenant_id and project.company_id = request.company_id
    join public.business_parties as supplier
      on supplier.id = contract.supplier_id
     and supplier.tenant_id = contract.tenant_id and supplier.company_id = contract.company_id
    join lateral (
      select decision.decided_at
      from public.material_payment_decisions as decision
      where decision.payment_request_id = request.id and decision.decision = 'approve'
      order by decision.decided_at desc, decision.request_revision_no desc
      limit 1
    ) as latest on true
    where request.tenant_id = v_tenant_id
      and request.company_id = target_company_id
      and request.state = 'approved'
      and (target_project_id is null or request.project_id = target_project_id);
  end if;

  return jsonb_build_object(
    'awaitingContract', v_awaiting,
    'returnedRequests', v_returned,
    'pendingApproval', v_pending,
    'approvedAwaitingPayment', v_approved
  );
end;
$$;

-- Notifications belong to the signed-in user; no material permission is needed,
-- only active membership of the company.
-- The cursor is an opaque keyset over (created_at, id): hex of "<utc timestamp>|<uuid>".
-- Rows written by one statement share created_at, so id breaks the ties and a page
-- is always at most target_limit rows.
create function private.c1_list_app_notifications(target_company_id uuid, target_cursor text, target_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cursor_text text;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_items jsonb;
  v_last jsonb;
  v_next text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.company_memberships as membership
    where membership.user_id = auth.uid() and membership.company_id = target_company_id and membership.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if target_limit is null or target_limit < 1 or target_limit > 50 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  if target_cursor is not null then
    if target_cursor !~ '^([0-9a-f]{2}){1,100}$' then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    begin
      v_cursor_text := convert_from(decode(target_cursor, 'hex'), 'UTF8');
      if v_cursor_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
      end if;
      v_cursor_at := split_part(v_cursor_text, '|', 1)::timestamptz;
      v_cursor_id := split_part(v_cursor_text, '|', 2)::uuid;
    exception when others then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end;
  end if;

  select coalesce(jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_rows
  from (
    select notification.created_at, notification.id, jsonb_build_object(
      'id', notification.id,
      'eventKind', notification.event_kind,
      'projectId', notification.project_id,
      'linkPath', notification.link_path,
      'payload', notification.payload,
      'createdAt', notification.created_at,
      'readAt', notification.read_at
    ) as item
    from public.app_notifications as notification
    where notification.recipient_id = auth.uid()
      and notification.company_id = target_company_id
      and (v_cursor_id is null or (notification.created_at, notification.id) < (v_cursor_at, v_cursor_id))
    order by notification.created_at desc, notification.id desc
    limit target_limit + 1
  ) as page;

  if jsonb_array_length(v_rows) > target_limit then
    select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(v_rows) with ordinality as entry(value, ordinality)
    where entry.ordinality <= target_limit;
    v_last := v_items->(target_limit - 1);
    v_next := encode(convert_to(
      to_char((v_last->>'createdAt')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        || '|' || (v_last->>'id'),
      'UTF8'), 'hex');
  else
    v_items := v_rows;
  end if;
  return jsonb_build_object('items', v_items, 'nextCursor', v_next);
end;
$$;

-- Marking read is naturally idempotent (first read time wins), so it needs no command receipt.
create function private.c1_read_app_notification(target_company_id uuid, target_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_read_before timestamptz;
begin
  if auth.uid() is null or not exists (
    select 1 from public.company_memberships as membership
    where membership.user_id = auth.uid() and membership.company_id = target_company_id and membership.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  select notification.read_at into v_read_before
  from public.app_notifications as notification
  where notification.id = target_id
    and notification.recipient_id = auth.uid()
    and notification.company_id = target_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  update public.app_notifications as notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = target_id
    and notification.recipient_id = auth.uid();
  return private.c1_material_ack(target_id, 1, v_read_before is not null);
end;
$$;

-- Daily reminder run (service_role only; no auth.uid()). Recipients are the
-- contract recorders with material.read (same rule as c1_material_notify_users);
-- the dedupe key includes the due date, so an amendment that moves a due date
-- produces a fresh reminder. Concurrent runs are safe: the unique
-- (recipient_id, dedupe_key) index drops duplicates, and the counts come from the
-- rows this call actually inserted.
create function private.c1_material_emit_installment_reminders(target_today date)
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
    select contract.tenant_id, contract.company_id, contract.project_id, contract.order_id,
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
        'inst:' || v_row.installment_key::text || ':' || v_kind || ':' || v_row.due_on::text
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

create function public.c1_material_finance_facts(target_company_id uuid, target_project_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.c1_material_finance_facts(target_company_id, target_project_id);
$$;
create function public.c1_material_finance_inbox_facts(target_company_id uuid, target_project_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.c1_material_finance_inbox_facts(target_company_id, target_project_id);
$$;
create function public.c1_list_app_notifications(target_company_id uuid, target_cursor text, target_limit integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.c1_list_app_notifications(target_company_id, target_cursor, target_limit);
$$;
create function public.c1_read_app_notification(target_company_id uuid, target_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_read_app_notification(target_company_id, target_id);
$$;
create function public.c1_material_emit_installment_reminders(target_today date) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select private.c1_material_emit_installment_reminders(target_today);
$$;

revoke all on function
  private.c1_material_finance_facts(uuid,uuid),
  private.c1_material_finance_inbox_facts(uuid,uuid),
  private.c1_list_app_notifications(uuid,text,integer),
  private.c1_read_app_notification(uuid,uuid),
  private.c1_material_emit_installment_reminders(date)
from public,anon,authenticated,service_role;

revoke all on function
  public.c1_material_finance_facts(uuid,uuid),
  public.c1_material_finance_inbox_facts(uuid,uuid),
  public.c1_list_app_notifications(uuid,text,integer),
  public.c1_read_app_notification(uuid,uuid),
  public.c1_material_emit_installment_reminders(date)
from public,anon,authenticated,service_role;

grant execute on function
  public.c1_material_finance_facts(uuid,uuid),
  public.c1_material_finance_inbox_facts(uuid,uuid),
  public.c1_list_app_notifications(uuid,text,integer),
  public.c1_read_app_notification(uuid,uuid)
to authenticated;

-- The reminder emitter is reachable only with the service-role key (scheduled job).
grant execute on function public.c1_material_emit_installment_reminders(date) to service_role;

notify pgrst, 'reload schema';
