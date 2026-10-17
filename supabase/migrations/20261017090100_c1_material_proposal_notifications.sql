set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 62);

-- Proposal notifications and order labels (spec 2026-10-17 proposal codes, section 7, N4/N5).
--   N5  Submitting a proposal notifies every company member who can decide proposals; approving
--       or returning it notifies the user who submitted the decided revision. Source
--       material_proposal, events material.proposal.submitted / approved / returned, link
--       /materials/{projectId}/proposals/{proposalId}, one notification per revision and event.
--   N4  Every notification about an order, contract, installment or payment request gains
--       projectName, proposalNo and orderSeq of its order (keys already in the payload win).
--       material.order.created also carries the summary of the order's own lines, so it now
--       fires when the transaction commits, after create_order has written the allocations.
--
-- Payload values are strings, numbers or null only (the client schema rejects anything else),
-- so summaries are flattened into summaryName1, summaryName2 and summaryTotal.
-- Recipients are checked by their own permissions; the acting user is never notified
-- (c1_material_notify_users skips auth.uid(), and the triggers also skip the actor row).

-- Notification kinds ------------------------------------------------------------------------

alter table public.app_notifications
  drop constraint app_notifications_event_kind_check,
  add constraint app_notifications_event_kind_check check (event_kind in (
    'material.order.created','material.contract.recorded','material.contract.amended',
    'material.installment.due_soon','material.installment.overdue',
    'material.payment.submitted','material.payment.returned','material.payment.paid','material.payment.approved',
    'material.proposal.submitted','material.proposal.approved','material.proposal.returned'));

alter table public.app_notifications
  drop constraint app_notifications_source_type_check,
  add constraint app_notifications_source_type_check check (source_type in (
    'material_order','material_contract','material_installment','material_payment_request','material_proposal'));

-- People ------------------------------------------------------------------------------------

-- The employee name of the user in the company, else the sign-in email (null when neither).
create function private.c1_material_user_display_name(
  target_tenant_id uuid, target_company_id uuid, target_user_id uuid
)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (
      select employee.full_name
      from public.employees as employee
      where employee.tenant_id = target_tenant_id
        and employee.company_id = target_company_id
        and employee.user_id = target_user_id
    ),
    (
      select account.email::text
      from auth.users as account
      where account.id = target_user_id
    )
  );
$$;

-- c1_material_can_read_proposal for a given user instead of the acting session: material.read,
-- and the creator of the proposal or a holder of decide, order.manage or contract.record.
create function private.c1_material_user_can_read_proposal(
  target_tenant_id uuid, target_company_id uuid, target_user_id uuid, target_proposal_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id is not null
    and private.c1_workflow_user_has_permission(target_tenant_id, target_company_id, target_user_id, 'material.read')
    and exists (
      select 1
      from public.material_proposals as proposal
      where proposal.id = target_proposal_id
        and proposal.tenant_id = target_tenant_id
        and proposal.company_id = target_company_id
        and (
          proposal.created_by = target_user_id
          or private.c1_workflow_user_has_permission(target_tenant_id, target_company_id, target_user_id, 'material.proposal.decide')
          or private.c1_workflow_user_has_permission(target_tenant_id, target_company_id, target_user_id, 'material.order.manage')
          or private.c1_workflow_user_has_permission(target_tenant_id, target_company_id, target_user_id, 'material.contract.record')
        )
    );
$$;

-- Payload pieces ----------------------------------------------------------------------------

-- {"names": [...], "total": n} -> {"summaryName1", "summaryName2", "summaryTotal"}.
create function private.c1_material_summary_payload(target_summary jsonb)
returns jsonb language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object(
    'summaryName1', target_summary->'names'->>0,
    'summaryName2', target_summary->'names'->>1,
    'summaryTotal', coalesce((target_summary->>'total')::integer, 0)
  );
$$;

-- projectName, proposalNo, revisionNo, actorName and the flattened proposal summary.
-- The summary follows c1_material_proposal_summary: while the proposal is still a draft or
-- returned (the submit trigger) it reads the active lines, which are exactly the lines the
-- revision is about to snapshot; once submitted or approved (the decision trigger) it reads
-- the current revision snapshot.
create function private.c1_material_proposal_notification_payload(
  target_proposal_id uuid, target_revision_no bigint, target_actor_id uuid
)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'projectName', project.name,
    'proposalNo', proposal.proposal_no,
    'revisionNo', target_revision_no,
    'actorName', private.c1_material_user_display_name(proposal.tenant_id, proposal.company_id, target_actor_id)
  ) || private.c1_material_summary_payload(private.c1_material_proposal_summary(proposal.id))
  from public.material_proposals as proposal
  join public.projects as project
    on project.id = proposal.project_id
   and project.tenant_id = proposal.tenant_id
   and project.company_id = proposal.company_id
  where proposal.id = target_proposal_id;
$$;

-- Proposal submitted ------------------------------------------------------------------------
-- submit_proposal inserts the revision before its lines and before the proposal turns
-- submitted, so this runs while the proposal is still draft or returned.

create function private.c1_material_notify_proposal_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.c1_material_notify_users(
    new.tenant_id, new.company_id, new.project_id,
    array(
      select membership.user_id
      from public.company_memberships as membership
      where membership.tenant_id = new.tenant_id
        and membership.company_id = new.company_id
        and membership.is_active
        and membership.user_id is distinct from new.submitted_by
        and private.c1_workflow_user_has_permission(new.tenant_id, new.company_id, membership.user_id, 'material.proposal.decide')
        and private.c1_material_user_can_read_proposal(new.tenant_id, new.company_id, membership.user_id, new.proposal_id)
    ),
    'material.proposal.submitted', 'material_proposal', new.proposal_id,
    '/materials/' || new.project_id::text || '/proposals/' || new.proposal_id::text,
    coalesce(private.c1_material_proposal_notification_payload(new.proposal_id, new.revision_no, new.submitted_by), '{}'::jsonb),
    'proposal:' || new.proposal_id::text || ':sub:' || new.revision_no::text
  );
  return null;
end;
$$;

create trigger material_proposal_submitted_notify after insert on public.material_proposal_revisions
for each row execute function private.c1_material_notify_proposal_submitted();

-- Proposal approved or returned -------------------------------------------------------------
-- decide_proposal inserts the decision before it changes the proposal, so the summary still
-- reads the decided revision. The recipient is the user who submitted that revision.

create function private.c1_material_notify_proposal_decided()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_revision public.material_proposal_revisions%rowtype;
  v_event_kind text;
  v_dedupe_kind text;
  v_payload jsonb;
begin
  select revision.* into v_revision
  from public.material_proposal_revisions as revision
  where revision.id = new.revision_id
    and revision.proposal_id = new.proposal_id
    and revision.tenant_id = new.tenant_id
    and revision.company_id = new.company_id
    and revision.project_id = new.project_id;
  if not found then
    return null;
  end if;
  if v_revision.submitted_by is not distinct from new.decided_by then
    return null;
  end if;
  if not private.c1_material_user_can_read_proposal(new.tenant_id, new.company_id, v_revision.submitted_by, new.proposal_id) then
    return null;
  end if;

  if new.decision = 'approve' then
    v_event_kind := 'material.proposal.approved';
    v_dedupe_kind := 'appr';
  else
    v_event_kind := 'material.proposal.returned';
    v_dedupe_kind := 'ret';
  end if;

  v_payload := coalesce(
    private.c1_material_proposal_notification_payload(new.proposal_id, v_revision.revision_no, new.decided_by),
    '{}'::jsonb
  );
  if new.decision = 'return' then
    v_payload := v_payload || jsonb_build_object('reason', new.reason);
  end if;

  perform private.c1_material_notify_users(
    new.tenant_id, new.company_id, new.project_id, array[v_revision.submitted_by],
    v_event_kind, 'material_proposal', new.proposal_id,
    '/materials/' || new.project_id::text || '/proposals/' || new.proposal_id::text,
    v_payload,
    'proposal:' || new.proposal_id::text || ':' || v_dedupe_kind || ':' || v_revision.revision_no::text
  );
  return null;
end;
$$;

create trigger material_proposal_decided_notify after insert on public.material_proposal_decisions
for each row execute function private.c1_material_notify_proposal_decided();

-- Order labels on finance notifications -----------------------------------------------------
-- The order is found from the source: the order itself, the contract's order, the order of
-- the request's contract, or for installments the contract id inside the dedupe key
-- (inst:{contract_id}:{installment_key}:...), because installment keys repeat across
-- contracts. Proposal notifications and anything that resolves to no order keep their
-- payload unchanged; a lookup never fails the insert.

create function private.c1_material_label_app_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid;
  v_contract_id uuid;
  v_label jsonb;
begin
  if new.source_type = 'material_order' then
    select material_order.id into v_order_id
    from public.material_orders as material_order
    where material_order.id = new.source_id
      and material_order.tenant_id = new.tenant_id
      and material_order.company_id = new.company_id;
  elsif new.source_type = 'material_contract' then
    select contract.order_id into v_order_id
    from public.material_contracts as contract
    where contract.id = new.source_id
      and contract.tenant_id = new.tenant_id
      and contract.company_id = new.company_id;
  elsif new.source_type = 'material_payment_request' then
    select contract.order_id into v_order_id
    from public.material_payment_requests as request
    join public.material_contracts as contract
      on contract.id = request.contract_id
     and contract.tenant_id = request.tenant_id
     and contract.company_id = request.company_id
    where request.id = new.source_id
      and request.tenant_id = new.tenant_id
      and request.company_id = new.company_id;
  elsif new.source_type = 'material_installment' then
    -- Checked before the cast, in its own statement, so a malformed key cannot raise.
    if split_part(new.dedupe_key, ':', 1) = 'inst'
      and split_part(new.dedupe_key, ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      v_contract_id := split_part(new.dedupe_key, ':', 2)::uuid;
      select contract.order_id into v_order_id
      from public.material_contracts as contract
      where contract.id = v_contract_id
        and contract.tenant_id = new.tenant_id
        and contract.company_id = new.company_id;
    end if;
  end if;

  if v_order_id is null then
    return new;
  end if;
  v_label := private.c1_material_order_label(v_order_id);
  if v_label is not null and jsonb_typeof(new.payload) = 'object' then
    new.payload := v_label || new.payload;
  end if;
  return new;
end;
$$;

create trigger app_notifications_order_label before insert on public.app_notifications
for each row execute function private.c1_material_label_app_notification();

-- Order created (20261015090000) ------------------------------------------------------------
-- Change: the payload adds the order summary. create_order writes the allocations after the
-- order row, so the trigger is deferred to commit time, when the allocations exist. The
-- acting user is still the request's auth.uid() at commit.

drop trigger material_order_created_notify on public.material_orders;

create or replace function private.c1_material_notify_order_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_supplier_name text;
begin
  select party.display_name into v_supplier_name from public.business_parties as party
  where party.id = new.supplier_id and party.tenant_id = new.tenant_id and party.company_id = new.company_id;
  perform private.c1_material_notify_permission(
    new.tenant_id, new.company_id, new.project_id, 'material.contract.record',
    'material.order.created', 'material_order', new.id,
    '/materials/' || new.project_id::text || '/orders/' || new.id::text,
    jsonb_build_object('supplierName', v_supplier_name)
      || private.c1_material_summary_payload(private.c1_material_order_summary(new.id)),
    'order:' || new.id::text
  );
  return null;
end;
$$;

create constraint trigger material_order_created_notify after insert on public.material_orders
deferrable initially deferred
for each row execute function private.c1_material_notify_order_created();

-- Grants ------------------------------------------------------------------------------------
-- create or replace keeps the revoked grants of c1_material_notify_order_created; it is listed
-- again so every function this migration writes is visibly private.
revoke all on function
  private.c1_material_user_display_name(uuid,uuid,uuid),
  private.c1_material_user_can_read_proposal(uuid,uuid,uuid,uuid),
  private.c1_material_summary_payload(jsonb),
  private.c1_material_proposal_notification_payload(uuid,bigint,uuid),
  private.c1_material_notify_proposal_submitted(),
  private.c1_material_notify_proposal_decided(),
  private.c1_material_label_app_notification(),
  private.c1_material_notify_order_created()
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
