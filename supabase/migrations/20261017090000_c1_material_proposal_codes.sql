set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 61);

-- Proposal numbers and order codes (spec 2026-10-17 proposal codes, N1-N4, N6).
--   N1  Every proposal carries proposal_no, numbered per project from 1, assigned on
--       insert (drafts included), never changed and never reused.
--   N2  Every order carries order_seq, numbered per proposal from 1, assigned on insert,
--       never changed and never reused; a cancelled order keeps its number.
--   N3  Summaries of a proposal or an order: the first two material names and the line
--       count, ordered by material_proposal_lines.created_at, then name, then line id.
--   N4  The five read functions return the new keys. Each is renamed to *_core and a
--       wrapper with the same name and signature adds the keys, so every caller (list,
--       read and public wrappers) gets them without being rewritten.
--   N6  Existing rows are numbered by creation order (created_at, then id).
--
-- The backfill writes only the new number columns: no version bump, no updated_at
-- change and no history rows. material_proposals has no update trigger yet, and
-- material_signed_order_guard compares six other columns only, so neither blocks it.

-- Columns and backfill -------------------------------------------------------------------
-- Proposals are locked before orders, the order the commands use.

alter table public.material_proposals add column proposal_no integer;
alter table public.material_orders add column order_seq integer;

update public.material_proposals as target
set proposal_no = numbered.proposal_no
from (
  select proposal.id,
    row_number() over (partition by proposal.project_id order by proposal.created_at, proposal.id) as proposal_no
  from public.material_proposals as proposal
) as numbered
where numbered.id = target.id;

update public.material_orders as target
set order_seq = numbered.order_seq
from (
  select material_order.id,
    row_number() over (partition by material_order.proposal_id order by material_order.created_at, material_order.id) as order_seq
  from public.material_orders as material_order
) as numbered
where numbered.id = target.id;

alter table public.material_proposals
  alter column proposal_no set not null,
  add constraint material_proposals_proposal_no_check check (proposal_no > 0),
  add constraint material_proposals_project_proposal_no_key unique (project_id, proposal_no);

alter table public.material_orders
  alter column order_seq set not null,
  add constraint material_orders_order_seq_check check (order_seq > 0),
  add constraint material_orders_proposal_order_seq_key unique (proposal_id, order_seq);

-- Number assignment -----------------------------------------------------------------------
-- Two creators in the same project serialize on the project row (proposals) or the
-- proposal row (orders); the unique constraints stay as the backstop. A value sent by
-- the client is always overwritten. The maximum counts every row, cancelled orders and
-- abandoned drafts included, so a number is never handed out twice.

create function private.c1_material_assign_proposal_no()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1
  from public.projects as project
  where project.id = new.project_id
    and project.tenant_id = new.tenant_id
    and project.company_id = new.company_id
  for no key update;
  new.proposal_no := coalesce((
    select max(proposal.proposal_no)
    from public.material_proposals as proposal
    where proposal.project_id = new.project_id
  ), 0) + 1;
  return new;
end;
$$;

create trigger material_proposal_no_assign before insert on public.material_proposals
for each row execute function private.c1_material_assign_proposal_no();

create function private.c1_material_assign_order_seq()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1
  from public.material_proposals as proposal
  where proposal.id = new.proposal_id
    and proposal.tenant_id = new.tenant_id
    and proposal.company_id = new.company_id
    and proposal.project_id = new.project_id
  for no key update;
  new.order_seq := coalesce((
    select max(material_order.order_seq)
    from public.material_orders as material_order
    where material_order.proposal_id = new.proposal_id
  ), 0) + 1;
  return new;
end;
$$;

create trigger material_order_seq_assign before insert on public.material_orders
for each row execute function private.c1_material_assign_order_seq();

-- Immutability (created after the backfill) ------------------------------------------------

create function private.c1_material_guard_codes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'material_proposals' then
    if new.proposal_no is distinct from old.proposal_no then
      raise exception using errcode = 'P0001', message = 'MATERIAL_CODE_IMMUTABLE';
    end if;
  elsif new.order_seq is distinct from old.order_seq then
    raise exception using errcode = 'P0001', message = 'MATERIAL_CODE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger material_codes_immutable before update on public.material_proposals
for each row execute function private.c1_material_guard_codes();
create trigger material_codes_immutable before update on public.material_orders
for each row execute function private.c1_material_guard_codes();

-- Summaries and labels --------------------------------------------------------------------

-- {"names": the first two names, "total": the number of lines}.
create function private.c1_material_name_summary(target_names text[])
returns jsonb language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object(
    'names', to_jsonb(coalesce(target_names[1:2], array[]::text[])),
    'total', coalesce(cardinality(target_names), 0)
  );
$$;

-- The lines the proposal page shows: the current revision snapshot once submitted or
-- approved, otherwise the active lines with their catalog names.
create function private.c1_material_proposal_summary(target_proposal_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_proposal public.material_proposals%rowtype;
  v_names text[];
begin
  select proposal.* into v_proposal
  from public.material_proposals as proposal
  where proposal.id = target_proposal_id;
  if not found then
    return null;
  end if;

  if v_proposal.review_state in ('submitted', 'approved') then
    select array_agg(snapshot.material_name order by line.created_at, snapshot.material_name, snapshot.proposal_line_id)
    into v_names
    from public.material_proposal_revision_lines as snapshot
    join public.material_proposal_lines as line
      on line.id = snapshot.proposal_line_id
     and line.proposal_id = snapshot.proposal_id
     and line.tenant_id = snapshot.tenant_id
     and line.company_id = snapshot.company_id
     and line.project_id = snapshot.project_id
    where snapshot.revision_id = v_proposal.current_revision_id
      and snapshot.proposal_id = v_proposal.id
      and snapshot.tenant_id = v_proposal.tenant_id
      and snapshot.company_id = v_proposal.company_id
      and snapshot.project_id = v_proposal.project_id;
  else
    select array_agg(item.name order by line.created_at, item.name, line.id)
    into v_names
    from public.material_proposal_lines as line
    join public.material_items as item
      on item.id = line.material_id
     and item.tenant_id = line.tenant_id
     and item.company_id = line.company_id
    where line.proposal_id = v_proposal.id
      and line.tenant_id = v_proposal.tenant_id
      and line.company_id = v_proposal.company_id
      and line.project_id = v_proposal.project_id
      and line.is_active;
  end if;

  return private.c1_material_name_summary(v_names);
end;
$$;

-- An order's own allocations, named from the approved revision snapshot as order_json does.
create function private.c1_material_order_summary(target_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.c1_material_name_summary(
    array_agg(snapshot.material_name order by line.created_at, snapshot.material_name, allocation.proposal_line_id)
  )
  from public.material_orders as material_order
  join public.material_order_allocations as allocation
    on allocation.order_id = material_order.id
   and allocation.tenant_id = material_order.tenant_id
   and allocation.company_id = material_order.company_id
   and allocation.project_id = material_order.project_id
  join public.material_proposal_revision_lines as snapshot
    on snapshot.revision_id = material_order.approved_revision_id
   and snapshot.proposal_line_id = allocation.proposal_line_id
   and snapshot.tenant_id = allocation.tenant_id
   and snapshot.company_id = allocation.company_id
   and snapshot.project_id = allocation.project_id
  join public.material_proposal_lines as line
    on line.id = allocation.proposal_line_id
   and line.proposal_id = material_order.proposal_id
   and line.tenant_id = allocation.tenant_id
   and line.company_id = allocation.company_id
   and line.project_id = allocation.project_id
  where material_order.id = target_order_id;
$$;

-- {"projectName", "proposalNo", "orderSeq"} of an order, or null when it does not exist.
create function private.c1_material_order_label(target_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'projectName', project.name,
    'proposalNo', proposal.proposal_no,
    'orderSeq', material_order.order_seq
  )
  from public.material_orders as material_order
  join public.material_proposals as proposal
    on proposal.id = material_order.proposal_id
   and proposal.tenant_id = material_order.tenant_id
   and proposal.company_id = material_order.company_id
   and proposal.project_id = material_order.project_id
  join public.projects as project
    on project.id = material_order.project_id
   and project.tenant_id = material_order.tenant_id
   and project.company_id = material_order.company_id
  where material_order.id = target_order_id;
$$;

-- Adds proposalNo and orderSeq to every element of an array that names an orderId;
-- other elements and non-array input are returned unchanged, in the same order.
create function private.c1_material_with_order_codes(items jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when jsonb_typeof(items) is distinct from 'array' then items else coalesce((
    select jsonb_agg(
      case when code.order_seq is null then entry.value
        else entry.value || jsonb_build_object('proposalNo', code.proposal_no, 'orderSeq', code.order_seq)
      end
      order by entry.ordinality
    )
    from jsonb_array_elements(items) with ordinality as entry(value, ordinality)
    left join lateral (
      select proposal.proposal_no, material_order.order_seq
      from public.material_orders as material_order
      join public.material_proposals as proposal
        on proposal.id = material_order.proposal_id
       and proposal.tenant_id = material_order.tenant_id
       and proposal.company_id = material_order.company_id
       and proposal.project_id = material_order.project_id
      where jsonb_typeof(entry.value->'orderId') = 'string'
        and material_order.id = (entry.value->>'orderId')::uuid
    ) as code on true
  ), '[]'::jsonb) end;
$$;

-- Read wrappers ----------------------------------------------------------------------------
-- Rename keeps each core's body, owner and (revoked) grants. Callers resolve functions by
-- name at run time (plpgsql and non-atomic sql bodies), so they reach the wrappers below.

alter function private.c1_material_proposal_json(uuid, uuid, uuid, uuid) rename to c1_material_proposal_json_core;
alter function private.c1_material_order_json(uuid, uuid, uuid, uuid) rename to c1_material_order_json_core;
alter function private.c1_material_read_contract(uuid, uuid, uuid) rename to c1_material_read_contract_core;
alter function private.c1_material_finance_facts(uuid, uuid) rename to c1_material_finance_facts_core;
alter function private.c1_material_finance_inbox_facts(uuid, uuid) rename to c1_material_finance_inbox_facts_core;

-- proposal view: proposalNo, revisionNo (of current_revision_id, null before the first
-- submit), summary; every contractStatus element gains orderSeq.
create function private.c1_material_proposal_json(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_core jsonb;
  v_proposal_no integer;
  v_revision_no bigint;
  v_contract_status jsonb;
begin
  v_core := private.c1_material_proposal_json_core(target_tenant_id, target_company_id, target_project_id, target_id);
  if v_core is null then
    return null;
  end if;

  select proposal.proposal_no, revision.revision_no
  into v_proposal_no, v_revision_no
  from public.material_proposals as proposal
  left join public.material_proposal_revisions as revision
    on revision.id = proposal.current_revision_id
   and revision.proposal_id = proposal.id
  where proposal.id = target_id
    and proposal.tenant_id = target_tenant_id
    and proposal.company_id = target_company_id
    and proposal.project_id = target_project_id;

  v_core := v_core || jsonb_build_object(
    'proposalNo', v_proposal_no,
    'revisionNo', v_revision_no,
    'summary', private.c1_material_proposal_summary(target_id)
  );

  if jsonb_typeof(v_core->'contractStatus') = 'array' then
    select coalesce(jsonb_agg(
      entry.value || jsonb_build_object('orderSeq', material_order.order_seq)
      order by entry.ordinality
    ), '[]'::jsonb)
    into v_contract_status
    from jsonb_array_elements(v_core->'contractStatus') with ordinality as entry(value, ordinality)
    left join public.material_orders as material_order
      on jsonb_typeof(entry.value->'orderId') = 'string'
     and material_order.id = (entry.value->>'orderId')::uuid
     and material_order.proposal_id = target_id;
    v_core := v_core || jsonb_build_object('contractStatus', v_contract_status);
  end if;

  return v_core;
end;
$$;

-- order view: proposalNo, orderSeq, summary.
create function private.c1_material_order_json(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_core jsonb;
  v_proposal_no integer;
  v_order_seq integer;
begin
  v_core := private.c1_material_order_json_core(target_tenant_id, target_company_id, target_project_id, target_id);
  if v_core is null then
    return null;
  end if;

  select proposal.proposal_no, material_order.order_seq
  into v_proposal_no, v_order_seq
  from public.material_orders as material_order
  join public.material_proposals as proposal
    on proposal.id = material_order.proposal_id
   and proposal.tenant_id = material_order.tenant_id
   and proposal.company_id = material_order.company_id
   and proposal.project_id = material_order.project_id
  where material_order.id = target_id
    and material_order.tenant_id = target_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id;

  return v_core || jsonb_build_object(
    'proposalNo', v_proposal_no,
    'orderSeq', v_order_seq,
    'summary', private.c1_material_order_summary(target_id)
  );
end;
$$;

-- contract view: projectName, proposalNo, orderSeq of its order. No contract stays null.
create function private.c1_material_read_contract(
  target_company_id uuid, target_project_id uuid, target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_core jsonb;
begin
  v_core := private.c1_material_read_contract_core(target_company_id, target_project_id, target_id);
  if v_core is null then
    return null;
  end if;
  return v_core || coalesce(private.c1_material_order_label((v_core->>'orderId')::uuid), '{}'::jsonb);
end;
$$;

-- finance facts: every contract gains proposalNo and orderSeq (projectName is already there).
create function private.c1_material_finance_facts(target_company_id uuid, target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_core jsonb;
begin
  v_core := private.c1_material_finance_facts_core(target_company_id, target_project_id);
  if v_core is null or not (v_core ? 'contracts') then
    return v_core;
  end if;
  return v_core || jsonb_build_object('contracts', private.c1_material_with_order_codes(v_core->'contracts'));
end;
$$;

-- finance inbox facts: every row of the four lists gains proposalNo and orderSeq.
create function private.c1_material_finance_inbox_facts(target_company_id uuid, target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_core jsonb;
  v_key text;
begin
  v_core := private.c1_material_finance_inbox_facts_core(target_company_id, target_project_id);
  if v_core is null then
    return null;
  end if;
  foreach v_key in array array['awaitingContract', 'returnedRequests', 'pendingApproval', 'approvedAwaitingPayment']
  loop
    if v_core ? v_key then
      v_core := v_core || jsonb_build_object(v_key, private.c1_material_with_order_codes(v_core->v_key));
    end if;
  end loop;
  return v_core;
end;
$$;

-- Grants -----------------------------------------------------------------------------------
-- The renamed cores keep their revoked grants. New functions start with PUBLIC execute;
-- every private function stays callable only through the existing public wrappers.
revoke all on function
  private.c1_material_assign_proposal_no(),
  private.c1_material_assign_order_seq(),
  private.c1_material_guard_codes(),
  private.c1_material_name_summary(text[]),
  private.c1_material_proposal_summary(uuid),
  private.c1_material_order_summary(uuid),
  private.c1_material_order_label(uuid),
  private.c1_material_with_order_codes(jsonb),
  private.c1_material_proposal_json(uuid,uuid,uuid,uuid),
  private.c1_material_order_json(uuid,uuid,uuid,uuid),
  private.c1_material_read_contract(uuid,uuid,uuid),
  private.c1_material_finance_facts(uuid,uuid),
  private.c1_material_finance_inbox_facts(uuid,uuid)
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
