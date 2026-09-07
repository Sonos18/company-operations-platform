-- Amendment 25 / Slice 1: Opportunity Decision Authority on transitional
-- Stage 01 decision-cycle storage.  The authority business objects are
-- deliberately generic; VQH policy is bound through its immutable snapshot.

insert into public.permissions (code, module, name, description) values
  ('opportunity.decision_authority.assign', 'opportunity_decision', 'Assign decision authority', 'Assign the explicit authority for an Opportunity Decision cycle'),
  ('opportunity.decision.record', 'opportunity_decision', 'Record Opportunity decisions', 'Record the immutable final decision for an Opportunity Decision cycle')
on conflict (code) do update set module = excluded.module, name = excluded.name, description = excluded.description;

-- Permissions remain global catalogue entries.  Their grants are constrained
-- to the canonical VQH company role; no code-based cross-company propagation.
insert into public.role_permissions (role_id, permission_code)
values
  ('10000000-0000-4000-8000-000000000308'::uuid, 'opportunity.decision_authority.assign'),
  ('10000000-0000-4000-8000-000000000308'::uuid, 'opportunity.decision.record')
on conflict do nothing;

create table public.opportunity_decision_authority_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  decision_cycle_id uuid not null,
  request_id uuid not null,
  request_fingerprint text not null,
  assignment_cycle_version bigint not null,
  action text not null,
  previous_authority_user_id uuid references auth.users (id) on delete restrict,
  authority_user_id uuid references auth.users (id) on delete restrict,
  performed_by_user_id uuid not null references auth.users (id) on delete restrict,
  reason text,
  authority_display_name_snapshot text,
  authority_position_snapshot text,
  performer_display_name_snapshot text not null,
  performer_position_snapshot text,
  created_at timestamptz not null default now(),
  constraint opportunity_decision_authority_events_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete restrict,
  constraint opportunity_decision_authority_events_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_decision_authority_events_cycle_fk foreign key (decision_cycle_id, tenant_id, company_id)
    references public.stage01_decision_cycles (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_decision_authority_events_action_check check (action in ('assigned', 'reassigned', 'unassigned')),
  constraint opportunity_decision_authority_events_fingerprint_not_blank check (btrim(request_fingerprint) <> ''),
  constraint opportunity_decision_authority_events_reason_not_blank check (reason is null or btrim(reason) <> ''),
  constraint opportunity_decision_authority_events_assigned_target check (
    (action in ('assigned', 'reassigned') and authority_user_id is not null)
    or (action = 'unassigned' and authority_user_id is null)
  ),
  constraint opportunity_decision_authority_events_id_scope_key unique (id, tenant_id, company_id),
  constraint opportunity_decision_authority_events_idempotency_key unique (tenant_id, company_id, request_id)
);

create index opportunity_decision_authority_events_cycle_idx
  on public.opportunity_decision_authority_events (tenant_id, company_id, decision_cycle_id, created_at desc);

alter table public.opportunity_decision_authority_events enable row level security;
revoke all on table public.opportunity_decision_authority_events from public, anon, authenticated;

alter table public.stage01_decision_cycles
  add column authority_resolution_event_id uuid;
alter table public.stage01_decision_cycles
  add constraint stage01_decision_cycles_authority_event_fk
  foreign key (authority_resolution_event_id, tenant_id, company_id)
  references public.opportunity_decision_authority_events (id, tenant_id, company_id) on delete restrict;

create or replace function private.prevent_opportunity_decision_authority_event_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_HISTORY_IMMUTABLE';
end;
$$;
revoke all on function private.prevent_opportunity_decision_authority_event_mutation() from public, anon, authenticated;
create trigger opportunity_decision_authority_events_prevent_mutation
  before update or delete on public.opportunity_decision_authority_events
  for each row execute function private.prevent_opportunity_decision_authority_event_mutation();

create or replace function private.guard_opportunity_decision_authority_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1
    from public.stage01_decision_cycles as cycle
    where cycle.id = new.decision_cycle_id
      and cycle.tenant_id = new.tenant_id
      and cycle.company_id = new.company_id
      and cycle.opportunity_id = new.opportunity_id
  ) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_EVENT_CYCLE_MISMATCH';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_opportunity_decision_authority_event() from public, anon, authenticated;
create trigger opportunity_decision_authority_events_guard_cycle
  before insert on public.opportunity_decision_authority_events
  for each row execute function private.guard_opportunity_decision_authority_event();

create or replace function private.opportunity_decision_authority_eligible(
  target_tenant_id uuid, target_company_id uuid, target_user_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.employees employee
      on employee.tenant_id = membership.tenant_id and employee.company_id = membership.company_id
     and employee.user_id = membership.user_id and employee.employment_status = 'active'
    where membership.tenant_id = target_tenant_id
      and membership.company_id = target_company_id
      and membership.user_id = target_user_id
      and membership.is_active
      and exists (
        select 1
        from public.company_role_assignments assignment
        join public.roles role on role.id = assignment.role_id and role.tenant_id = assignment.tenant_id and role.company_id = assignment.company_id and role.is_active
        join public.role_permissions permission on permission.role_id = role.id and permission.permission_code = 'opportunity.decision.record'
        where assignment.tenant_id = membership.tenant_id
          and assignment.company_id = membership.company_id
          and assignment.user_id = membership.user_id
          and assignment.revoked_at is null
      )
  );
$$;
revoke all on function private.opportunity_decision_authority_eligible(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.assert_vqh_decision_authority_policy(target_definition jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if target_definition #> '{decisionGovernance,authority}' is distinct from jsonb_build_object(
    'required', true,
    'resolutionMode', 'explicit_per_cycle',
    'requiredBeforeFinalDecision', true,
    'requiredBeforeEvaluation', false,
    'selfAssignmentAllowed', true,
    'carryForwardOnNewCycle', false,
    'showPreviousAuthorityAsSuggestion', true,
    'assignPermission', 'opportunity.decision_authority.assign',
    'decisionPermission', 'opportunity.decision.record',
    'eligibility', jsonb_build_object('requireActiveMembership', true, 'requireAccountBacking', true, 'requireActiveEmployee', true)
  ) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_POLICY_UNAVAILABLE';
  end if;
end;
$$;
revoke all on function private.assert_vqh_decision_authority_policy(jsonb) from public, anon, authenticated;

create or replace function private.assign_opportunity_decision_authority(
  target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid, target_input jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  context jsonb;
  actor_id uuid;
  tenant_id uuid;
  cycle_version bigint;
  final_outcome text;
  cycle_opportunity_id uuid;
  cycle_authority_user_id uuid;
  cycle_authority_reference text;
  cycle_authority_event_id uuid;
  definition_json jsonb;
  authority_user_id uuid;
  request_id uuid;
  fingerprint text;
  existing_event public.opportunity_decision_authority_events%rowtype;
  event_id uuid;
  actor_name text;
  actor_position text;
  authority_name text;
  authority_position text;
begin
  if target_input is null
     or not (target_input ?& array['requestId', 'action', 'authorityUserId', 'expectedCycleVersion', 'reason'])
     or target_input ->> 'action' <> 'assign'
     or nullif(target_input ->> 'requestId', '') is null
     or nullif(target_input ->> 'authorityUserId', '') is null
     or jsonb_typeof(target_input -> 'expectedCycleVersion') <> 'number'
     or (target_input -> 'reason' is not null and jsonb_typeof(target_input -> 'reason') not in ('null', 'string'))
     or (jsonb_typeof(target_input -> 'reason') = 'string' and nullif(btrim(target_input ->> 'reason'), '') is null) then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;

  context := private.stage01_actor_context(target_company_id, 'opportunity.decision_authority.assign');
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;
  authority_user_id := (target_input ->> 'authorityUserId')::uuid;
  request_id := (target_input ->> 'requestId')::uuid;
  fingerprint := pg_catalog.encode(extensions.digest(jsonb_build_object(
    'opportunityId', target_opportunity_id, 'decisionCycleId', target_cycle_id,
    'action', 'assign', 'authorityUserId', authority_user_id, 'expectedCycleVersion', target_input -> 'expectedCycleVersion', 'reason', target_input -> 'reason'
  )::text, 'sha256'), 'hex');

  select event.* into existing_event
  from public.opportunity_decision_authority_events event
  where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id,
      'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id,
      'cycleVersion', existing_event.assignment_cycle_version);
  end if;

  select cycle.version, cycle.final_outcome, cycle.opportunity_id,
         cycle.decision_authority_user_id, cycle.authority_resolution_reference,
         cycle.authority_resolution_event_id, definition.definition
  into cycle_version, final_outcome, cycle_opportunity_id,
       cycle_authority_user_id, cycle_authority_reference, cycle_authority_event_id,
       definition_json
  from public.stage01_decision_cycles cycle
  join public.workflow_node_executions execution on execution.id = cycle.node_execution_id and execution.tenant_id = cycle.tenant_id and execution.company_id = cycle.company_id and execution.superseded_at is null
  join public.workflow_node_instances node on node.id = execution.node_instance_id and node.tenant_id = execution.tenant_id and node.company_id = execution.company_id and node.node_key = '01.2'
  join public.workflow_instances workflow on workflow.id = node.workflow_instance_id and workflow.tenant_id = node.tenant_id and workflow.company_id = node.company_id and workflow.subject_type = 'opportunity'
  join public.workflow_definition_snapshots definition on definition.id = workflow.definition_snapshot_id and definition.tenant_id = workflow.tenant_id and definition.company_id = workflow.company_id
  where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id
  for update of cycle;
  if cycle_opportunity_id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  -- Recheck only after the row lock. A concurrent same-request caller can
  -- miss the first lookup, wait here, then observe the committed event.
  select event.* into existing_event
  from public.opportunity_decision_authority_events as event
  where event.tenant_id = tenant_id
    and event.company_id = target_company_id
    and event.request_id = request_id;
  if found then
    if existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id,
      'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id,
      'cycleVersion', existing_event.assignment_cycle_version);
  end if;
  if final_outcome is not null then raise exception using errcode = 'P0001', message = 'STAGE01_FINAL_DECISION_EXISTS'; end if;
  if cycle_authority_user_id is not null
     or cycle_authority_reference is not null
     or cycle_authority_event_id is not null then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_ALREADY_RESOLVED';
  end if;
  if cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  perform private.assert_vqh_decision_authority_policy(definition_json);
  if not private.opportunity_decision_authority_eligible(tenant_id, target_company_id, authority_user_id) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE';
  end if;

  select employee.full_name, position.name into actor_name, actor_position
  from public.employees employee left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id
  where employee.tenant_id = tenant_id and employee.company_id = target_company_id and employee.user_id = actor_id and employee.employment_status = 'active';
  select employee.full_name, position.name into authority_name, authority_position
  from public.employees employee left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id
  where employee.tenant_id = tenant_id and employee.company_id = target_company_id and employee.user_id = authority_user_id and employee.employment_status = 'active';
  if actor_name is null or authority_name is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;

  begin
    insert into public.opportunity_decision_authority_events (
      tenant_id, company_id, opportunity_id, decision_cycle_id, request_id, request_fingerprint, assignment_cycle_version, action,
      authority_user_id, performed_by_user_id, reason, authority_display_name_snapshot, authority_position_snapshot,
      performer_display_name_snapshot, performer_position_snapshot
    ) values (
      tenant_id, target_company_id, target_opportunity_id, target_cycle_id, request_id, fingerprint, cycle_version + 1, 'assigned',
      authority_user_id, actor_id, nullif(btrim(target_input ->> 'reason'), ''), authority_name, authority_position, actor_name, actor_position
    ) returning id into event_id;
  exception when unique_violation then
    select event.* into existing_event from public.opportunity_decision_authority_events event
    where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
    if existing_event.id is null or existing_event.request_fingerprint <> fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id,
      'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id,
      'cycleVersion', existing_event.assignment_cycle_version);
  end;
  update public.stage01_decision_cycles cycle
  set decision_authority_user_id = authority_user_id, authority_resolution_event_id = event_id,
      authority_resolution_reference = event_id::text, version = cycle.version + 1
  where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id;
  perform private.write_stage01_audit(tenant_id, target_company_id, actor_id, 'opportunity.decision_authority.assigned',
    'opportunity_decision_authority_event', event_id::text, request_id, null,
    jsonb_build_object('opportunityId', target_opportunity_id, 'decisionCycleId', target_cycle_id, 'authorityUserId', authority_user_id));
  return jsonb_build_object('opportunityId', target_opportunity_id, 'decisionCycleId', target_cycle_id,
    'authorityResolutionEventId', event_id, 'authorityUserId', authority_user_id, 'cycleVersion', cycle_version + 1);
end;
$$;

create function public.assign_opportunity_decision_authority(target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid, target_input jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.assign_opportunity_decision_authority(target_company_id, target_opportunity_id, target_cycle_id, target_input)
$$;

create function public.list_opportunity_decision_authority_candidates(target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare context jsonb; tenant_id uuid;
begin
  context := private.stage01_actor_context(target_company_id, 'opportunity.decision_authority.assign');
  tenant_id := (context ->> 'tenantId')::uuid;
  if not exists (select 1 from public.stage01_decision_cycles cycle where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
    'userId', employee.user_id, 'employeeId', employee.id, 'displayName', employee.full_name, 'positionTitle', position.name
  ) order by employee.full_name, employee.id)
  from public.employees employee
  join public.company_memberships membership on membership.tenant_id = employee.tenant_id and membership.company_id = employee.company_id and membership.user_id = employee.user_id and membership.is_active
  left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id
  where employee.tenant_id = tenant_id and employee.company_id = target_company_id and employee.employment_status = 'active'
    and private.opportunity_decision_authority_eligible(tenant_id, target_company_id, employee.user_id)), '[]'::jsonb));
end;
$$;

create function public.get_opportunity_decision_authority_projection(target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare context jsonb; tenant_id uuid; cycle public.stage01_decision_cycles%rowtype; event public.opportunity_decision_authority_events%rowtype; employee_id uuid; eligible boolean;
begin
  context := private.stage01_actor_context(target_company_id, 'opportunity.read');
  tenant_id := (context ->> 'tenantId')::uuid;
  select * into cycle from public.stage01_decision_cycles cycle_row
  where cycle_row.id = target_cycle_id and cycle_row.tenant_id = tenant_id and cycle_row.company_id = target_company_id and cycle_row.opportunity_id = target_opportunity_id;
  if cycle.id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  if cycle.authority_resolution_event_id is null then
    if cycle.decision_authority_user_id is null and cycle.authority_resolution_reference is null then
      return jsonb_build_object('status','unresolved','userId',null,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',false,'locked',cycle.final_outcome is not null);
    end if;
    if cycle.decision_authority_user_id is not null and cycle.authority_resolution_reference is null then
      return jsonb_build_object('status','legacy_unknown','userId',cycle.decision_authority_user_id,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',auth.uid() = cycle.decision_authority_user_id,'locked',cycle.final_outcome is not null);
    end if;
    return jsonb_build_object('status','invalid','userId',cycle.decision_authority_user_id,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',false,'locked',cycle.final_outcome is not null);
  end if;
  select * into event from public.opportunity_decision_authority_events event_row
  where event_row.id = cycle.authority_resolution_event_id
    and event_row.tenant_id = cycle.tenant_id
    and event_row.company_id = cycle.company_id
    and event_row.opportunity_id = cycle.opportunity_id
    and event_row.decision_cycle_id = cycle.id;
  select employee.id into employee_id from public.employees employee where employee.tenant_id = cycle.tenant_id and employee.company_id = cycle.company_id and employee.user_id = cycle.decision_authority_user_id;
  eligible := event.id is not null
    and cycle.decision_authority_user_id = event.authority_user_id
    and cycle.authority_resolution_reference = event.id::text
    and private.opportunity_decision_authority_eligible(cycle.tenant_id, cycle.company_id, cycle.decision_authority_user_id);
  return jsonb_build_object('status', case when eligible then 'resolved' else 'invalid' end, 'userId',cycle.decision_authority_user_id,
    'employeeId',employee_id,'displayName',event.authority_display_name_snapshot,'positionTitle',event.authority_position_snapshot,
    'currentActorIsAuthority',auth.uid() = cycle.decision_authority_user_id,'locked',cycle.final_outcome is not null);
end;
$$;

create or replace function private.record_opportunity_decision_final_decision(
  target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare context jsonb; actor_id uuid; tenant_id uuid; cycle_id uuid; cycle_version bigint; final_outcome text; authority_user_id uuid; authority_event_id uuid; authority_reference text; definition_json jsonb; execution_id uuid; execution_phase text; execution_needs_revalidation boolean; workflow_id uuid; opportunity_validity text; intake_phase text; intake_needs_revalidation boolean; recommendation_id uuid; recommendation_value text; event public.opportunity_decision_authority_events%rowtype;
begin
  if target_input is null or target_request_id is null or not (target_input ?& array['expectedCycleVersion','outcome','rationale'])
     or target_input ->> 'outcome' not in ('proceed','not_proceeding') or nullif(btrim(target_input ->> 'rationale'),'') is null then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;
  context := private.stage01_actor_context(target_company_id, 'opportunity.decision.record'); actor_id := (context ->> 'actorId')::uuid; tenant_id := (context ->> 'tenantId')::uuid;
  select cycle.id, cycle.version, cycle.final_outcome, cycle.decision_authority_user_id, cycle.authority_resolution_event_id, cycle.authority_resolution_reference, definition.definition, execution.id, execution.phase, execution.needs_revalidation, workflow.id
  into cycle_id, cycle_version, final_outcome, authority_user_id, authority_event_id, authority_reference, definition_json, execution_id, execution_phase, execution_needs_revalidation, workflow_id
  from public.stage01_decision_cycles cycle
  join public.workflow_node_executions execution on execution.id = cycle.node_execution_id and execution.tenant_id = cycle.tenant_id and execution.company_id = cycle.company_id and execution.superseded_at is null
  join public.workflow_node_instances node on node.id = execution.node_instance_id and node.tenant_id = execution.tenant_id and node.company_id = execution.company_id and node.node_key = '01.2'
  join public.workflow_instances workflow on workflow.id = node.workflow_instance_id and workflow.tenant_id = node.tenant_id and workflow.company_id = node.company_id and workflow.subject_type = 'opportunity'
  join public.workflow_definition_snapshots definition on definition.id = workflow.definition_snapshot_id and definition.tenant_id = workflow.tenant_id and definition.company_id = workflow.company_id
  where cycle.tenant_id = tenant_id and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id for update of cycle;
  if cycle_id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  if cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  if final_outcome is not null then raise exception using errcode = 'P0001', message = 'STAGE01_FINAL_DECISION_EXISTS'; end if;
  perform private.assert_vqh_decision_authority_policy(definition_json);
  select * into event from public.opportunity_decision_authority_events event_row
  where event_row.id = authority_event_id
    and event_row.tenant_id = tenant_id
    and event_row.company_id = target_company_id
    and event_row.opportunity_id = target_opportunity_id
    and event_row.decision_cycle_id = cycle_id;
  if authority_user_id is null or authority_event_id is null or event.id is null then raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_UNRESOLVED'; end if;
  if event.authority_user_id is distinct from authority_user_id
     or authority_reference is distinct from event.id::text
     or actor_id <> authority_user_id then
    raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_MISMATCH';
  end if;
  if not private.opportunity_decision_authority_eligible(tenant_id, target_company_id, authority_user_id) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;
  select opportunity.validity_state into opportunity_validity
  from public.opportunities as opportunity
  where opportunity.id = target_opportunity_id
    and opportunity.tenant_id = tenant_id
    and opportunity.company_id = target_company_id;
  select intake_execution.phase, intake_execution.needs_revalidation into intake_phase, intake_needs_revalidation
  from public.workflow_node_instances as intake_node
  join public.workflow_node_executions as intake_execution
    on intake_execution.node_instance_id = intake_node.id
   and intake_execution.tenant_id = intake_node.tenant_id
   and intake_execution.company_id = intake_node.company_id
   and intake_execution.superseded_at is null
  where intake_node.workflow_instance_id = workflow_id
    and intake_node.node_key = '01.1';
  recommendation_id := private.stage01_current_recommendation_id(cycle_id);
  if execution_phase <> 'active' or execution_needs_revalidation
     or opportunity_validity <> 'valid'
     or intake_phase is distinct from 'completed' or coalesce(intake_needs_revalidation, true)
     or not private.stage01_cycle_evaluations_satisfied(definition_json, cycle_id)
     or exists (
       select 1 from public.workflow_blockers as blocker
       where blocker.node_execution_id = execution_id
         and blocker.tenant_id = tenant_id
         and blocker.company_id = target_company_id
         and blocker.effect = 'blocking'
         and blocker.resolved_at is null
     ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_EVALUATION_GATES_NOT_SATISFIED';
  end if;
  if recommendation_id is null then
    raise exception using errcode = 'P0001', message = 'STAGE01_CURRENT_RECOMMENDATION_REQUIRED';
  end if;
  select recommendation into recommendation_value from public.stage01_recommendations where id = recommendation_id;
  if target_input ->> 'outcome' = (case recommendation_value when 'recommend_proceed' then 'proceed' else 'not_proceeding' end) then
    if target_input ? 'overrideRationale' and nullif(btrim(target_input ->> 'overrideRationale'),'') is not null then raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_OVERRIDE_INVALID'; end if;
  elsif nullif(btrim(target_input ->> 'overrideRationale'),'') is null then raise exception using errcode = 'P0001', message = 'STAGE01_OVERRIDE_RATIONALE_REQUIRED'; end if;
  update public.stage01_decision_cycles cycle set final_outcome = target_input ->> 'outcome', final_decision_by = actor_id, final_decision_at = clock_timestamp(), final_rationale = btrim(target_input ->> 'rationale'), final_recommendation_id = recommendation_id, override_rationale = nullif(btrim(target_input ->> 'overrideRationale'),''), version = cycle.version + 1 where cycle.id = cycle_id returning version into cycle_version;
  perform private.write_stage01_audit(tenant_id,target_company_id,actor_id,'opportunity.decision.final_recorded','stage01_decision_cycle',cycle_id::text,target_request_id,null,jsonb_build_object('opportunityId',target_opportunity_id,'decisionCycleId',cycle_id,'cycleVersion',cycle_version));
  return jsonb_build_object('opportunityId',target_opportunity_id,'decisionCycleId',cycle_id,'finalRecommendationId',recommendation_id,'finalOutcome',target_input ->> 'outcome','cycleVersion',cycle_version);
end;
$$;

create or replace function public.record_stage01_final_decision(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.record_opportunity_decision_final_decision(target_company_id, target_opportunity_id, target_input, target_request_id)
$$;

-- Permit authority pointer updates while retaining all other lifecycle guards.
create or replace function private.guard_stage01_decision_cycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_record jsonb; new_record jsonb; mutable_fields text[] := array[
  'decision_authority_user_id', 'authority_resolution_reference', 'authority_resolution_event_id',
  'final_outcome', 'final_decision_by', 'final_decision_at', 'final_rationale', 'final_recommendation_id', 'override_rationale', 'version'
];
begin
  if tg_op = 'DELETE' then raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE'; end if;
  old_record := to_jsonb(old); new_record := to_jsonb(new);
  if (old_record - mutable_fields) is distinct from (new_record - mutable_fields) then raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE'; end if;
  if old.final_outcome is not null and old_record is distinct from new_record then raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE'; end if;
  -- Existing pre-Amendment rows are allowed to remain untouched. Any new
  -- authority transition is an atomic null triple or an exact event triple.
  if (old.decision_authority_user_id, old.authority_resolution_event_id, old.authority_resolution_reference)
       is distinct from (new.decision_authority_user_id, new.authority_resolution_event_id, new.authority_resolution_reference)
     and ((new.decision_authority_user_id is null)::int + (new.authority_resolution_event_id is null)::int + (new.authority_resolution_reference is null)::int) not in (0, 3) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID';
  end if;
  if new.authority_resolution_event_id is not null and not exists (
    select 1
    from public.opportunity_decision_authority_events as authority_event
    where authority_event.id = new.authority_resolution_event_id
      and authority_event.tenant_id = new.tenant_id
      and authority_event.company_id = new.company_id
      and authority_event.opportunity_id = new.opportunity_id
      and authority_event.decision_cycle_id = new.id
      and authority_event.authority_user_id = new.decision_authority_user_id
      and new.authority_resolution_reference = authority_event.id::text
  ) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function private.assign_opportunity_decision_authority(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.assign_opportunity_decision_authority(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.assign_opportunity_decision_authority(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.assign_opportunity_decision_authority(uuid, uuid, uuid, jsonb) to authenticated;
revoke all on function public.list_opportunity_decision_authority_candidates(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_opportunity_decision_authority_candidates(uuid, uuid, uuid) to authenticated;
revoke all on function public.get_opportunity_decision_authority_projection(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_opportunity_decision_authority_projection(uuid, uuid, uuid) to authenticated;
revoke all on function private.record_opportunity_decision_final_decision(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function private.record_opportunity_decision_final_decision(uuid, uuid, jsonb, uuid) to authenticated;
revoke all on function public.record_stage01_final_decision(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.record_stage01_final_decision(uuid, uuid, jsonb, uuid) to authenticated;

-- Amendment 25 Transition Addendum: authority policy is a domain snapshot, not
-- a workflow-definition projection. Existing cycles remain untouched until the
-- explicitly scoped B4 transition binds an immutable policy snapshot.
create table public.opportunity_decision_policy_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  policy_key text not null check (policy_key = 'opportunity.decision_authority'),
  policy_version integer not null check (policy_version > 0),
  policy jsonb not null,
  policy_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  approved_at timestamptz,
  source_policy_snapshot_id uuid references public.opportunity_decision_policy_snapshots (id) on delete restrict,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id, company_id),
  unique (tenant_id, company_id, policy_key, policy_version),
  constraint opportunity_decision_policy_snapshots_publication_state_check check (
    (status = 'draft' and published_at is null and approved_at is null)
    or (status = 'published' and published_at is not null and approved_at is not null)
  )
);
alter table public.opportunity_decision_policy_snapshots enable row level security;
revoke all on table public.opportunity_decision_policy_snapshots from public, anon, authenticated;

create table public.opportunity_decision_policy_binding_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  decision_cycle_id uuid not null,
  previous_policy_snapshot_id uuid,
  policy_snapshot_id uuid not null,
  request_id uuid not null,
  request_fingerprint text not null,
  binding_cycle_version bigint not null,
  action text not null check (action in ('new_cycle', 'legacy_transition')),
  transition_code text,
  reason text,
  performed_by_user_id uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id, company_id),
  unique (tenant_id, company_id, request_id),
  constraint opportunity_decision_policy_binding_events_transition_metadata_check check (
    (action = 'new_cycle' and transition_code is null and reason is null)
    or (action = 'legacy_transition' and transition_code is not distinct from 'b4_acceptance_policy_transition'
      and nullif(btrim(reason), '') is not null)
  ),
  foreign key (policy_snapshot_id, tenant_id, company_id)
    references public.opportunity_decision_policy_snapshots (id, tenant_id, company_id) on delete restrict
);
alter table public.opportunity_decision_policy_binding_events enable row level security;
revoke all on table public.opportunity_decision_policy_binding_events from public, anon, authenticated;

alter table public.stage01_decision_cycles add column decision_policy_snapshot_id uuid;
alter table public.stage01_decision_cycles add constraint stage01_decision_cycles_decision_policy_snapshot_fk
  foreign key (decision_policy_snapshot_id, tenant_id, company_id)
  references public.opportunity_decision_policy_snapshots (id, tenant_id, company_id) on delete restrict;

insert into public.opportunity_decision_policy_snapshots (
  tenant_id, company_id, policy_key, policy_version, policy, policy_hash, status, published_at, approved_at
)
select '10000000-0000-4000-8000-000000000010'::uuid, '10000000-0000-4000-8000-000000000020'::uuid,
  'opportunity.decision_authority', 1,
  jsonb_build_object('authority', jsonb_build_object(
    'required', true, 'resolutionMode', 'explicit_per_cycle', 'requiredBeforeFinalDecision', true,
    'requiredBeforeEvaluation', false, 'selfAssignmentAllowed', true, 'carryForwardOnNewCycle', false,
    'showPreviousAuthorityAsSuggestion', true, 'assignPermission', 'opportunity.decision_authority.assign',
    'decisionPermission', 'opportunity.decision.record',
    'eligibility', jsonb_build_object('requireActiveMembership', true, 'requireAccountBacking', true, 'requireActiveEmployee', true)
  )), 'vqh-opportunity-decision-authority-v1', 'published', clock_timestamp(), clock_timestamp()
where exists (
  select 1 from public.companies company
  where company.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
    and company.id = '10000000-0000-4000-8000-000000000020'::uuid
)
on conflict (tenant_id, company_id, policy_key, policy_version) do nothing;

create or replace function private.prevent_opportunity_decision_policy_snapshot_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_SNAPSHOT_IMMUTABLE';
end;
$$;
create trigger opportunity_decision_policy_snapshots_prevent_mutation
before update or delete on public.opportunity_decision_policy_snapshots
for each row execute function private.prevent_opportunity_decision_policy_snapshot_mutation();

create or replace function private.prevent_opportunity_decision_policy_binding_event_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_BINDING_IMMUTABLE';
end;
$$;
create or replace function private.guard_opportunity_decision_policy_binding_event_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.stage01_decision_cycles cycle
    where cycle.id = new.decision_cycle_id and cycle.tenant_id = new.tenant_id and cycle.company_id = new.company_id
      and cycle.opportunity_id = new.opportunity_id and cycle.decision_policy_snapshot_id = new.policy_snapshot_id
  ) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_BINDING_SCOPE_INVALID';
  end if;
  if new.previous_policy_snapshot_id is not null then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_BINDING_SCOPE_INVALID';
  end if;
  return new;
end;
$$;
create trigger opportunity_decision_policy_binding_events_guard_scope
before insert on public.opportunity_decision_policy_binding_events
for each row execute function private.guard_opportunity_decision_policy_binding_event_scope();
create trigger opportunity_decision_policy_binding_events_prevent_mutation
before update or delete on public.opportunity_decision_policy_binding_events
for each row execute function private.prevent_opportunity_decision_policy_binding_event_mutation();

create or replace function private.assert_opportunity_decision_authority_policy(target_policy jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if target_policy is null or target_policy <> jsonb_build_object('authority', jsonb_build_object(
    'required', true, 'resolutionMode', 'explicit_per_cycle', 'requiredBeforeFinalDecision', true,
    'requiredBeforeEvaluation', false, 'selfAssignmentAllowed', true, 'carryForwardOnNewCycle', false,
    'showPreviousAuthorityAsSuggestion', true, 'assignPermission', 'opportunity.decision_authority.assign',
    'decisionPermission', 'opportunity.decision.record',
    'eligibility', jsonb_build_object('requireActiveMembership', true, 'requireAccountBacking', true, 'requireActiveEmployee', true)
  )) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_UNAVAILABLE';
  end if;
end;
$$;

create or replace function private.active_opportunity_decision_policy_snapshot(target_tenant_id uuid, target_company_id uuid)
returns public.opportunity_decision_policy_snapshots language sql stable security definer set search_path = '' as $$
  select policy.* from public.opportunity_decision_policy_snapshots policy
  where policy.tenant_id = target_tenant_id and policy.company_id = target_company_id
    and policy.policy_key = 'opportunity.decision_authority' and policy.status = 'published'
    and policy.published_at is not null and policy.approved_at is not null
  order by policy.policy_version desc
  limit 1
$$;

create or replace function private.bind_new_stage01_decision_cycle_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare active_policy public.opportunity_decision_policy_snapshots%rowtype;
begin
  select * into active_policy from private.active_opportunity_decision_policy_snapshot(new.tenant_id, new.company_id);
  if active_policy.id is null then
    if new.tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid
       and new.company_id = 'b4000000-0000-4000-8000-000000000020'::uuid then
      perform private.b4_opportunity_decision_policy_snapshot(new.tenant_id, new.company_id, new.created_by);
      select * into active_policy from private.active_opportunity_decision_policy_snapshot(new.tenant_id, new.company_id);
    else
      raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_UNAVAILABLE';
    end if;
  end if;
  if new.decision_policy_snapshot_id is null then
    new.decision_policy_snapshot_id := active_policy.id;
  elsif new.decision_policy_snapshot_id is distinct from active_policy.id then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_POINTER_INVALID';
  end if;
  return new;
end;
$$;
create trigger stage01_decision_cycles_bind_decision_policy
before insert on public.stage01_decision_cycles
for each row execute function private.bind_new_stage01_decision_cycle_policy();

create or replace function private.audit_new_stage01_decision_cycle_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.opportunity_decision_policy_binding_events (
    tenant_id, company_id, opportunity_id, decision_cycle_id, policy_snapshot_id,
    request_id, request_fingerprint, binding_cycle_version, action, performed_by_user_id
  ) values (
    new.tenant_id, new.company_id, new.opportunity_id, new.id, new.decision_policy_snapshot_id,
    gen_random_uuid(), md5('new_cycle:' || new.id::text || ':' || new.decision_policy_snapshot_id::text), new.version,
    'new_cycle', new.created_by
  );
  return new;
end;
$$;
create trigger stage01_decision_cycles_audit_decision_policy
after insert on public.stage01_decision_cycles
for each row execute function private.audit_new_stage01_decision_cycle_policy();

create or replace function private.guard_stage01_decision_cycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_record jsonb; new_record jsonb; mutable_fields text[] := array[
  'decision_authority_user_id', 'authority_resolution_reference', 'authority_resolution_event_id', 'decision_policy_snapshot_id',
  'final_outcome', 'final_decision_by', 'final_decision_at', 'final_rationale', 'final_recommendation_id', 'override_rationale', 'version'
];
begin
  if tg_op = 'DELETE' then raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE'; end if;
  old_record := to_jsonb(old); new_record := to_jsonb(new);
  if (old_record - mutable_fields) is distinct from (new_record - mutable_fields) then raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE'; end if;
  if old.final_outcome is not null and old_record is distinct from new_record then raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE'; end if;
  if old.decision_policy_snapshot_id is not null and old.decision_policy_snapshot_id is distinct from new.decision_policy_snapshot_id then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_POINTER_IMMUTABLE';
  end if;
  if old.decision_policy_snapshot_id is distinct from new.decision_policy_snapshot_id and (
    new.decision_policy_snapshot_id is null or not exists (
      select 1 from public.opportunity_decision_policy_snapshots policy
      where policy.id = new.decision_policy_snapshot_id and policy.tenant_id = new.tenant_id and policy.company_id = new.company_id
        and policy.policy_key = 'opportunity.decision_authority' and policy.status = 'published'
        and policy.published_at is not null and policy.approved_at is not null
    )
  ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_POINTER_INVALID'; end if;
  if (old.decision_authority_user_id, old.authority_resolution_event_id, old.authority_resolution_reference)
       is distinct from (new.decision_authority_user_id, new.authority_resolution_event_id, new.authority_resolution_reference)
     and ((new.decision_authority_user_id is null)::int + (new.authority_resolution_event_id is null)::int + (new.authority_resolution_reference is null)::int) not in (0, 3) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID';
  end if;
  if new.authority_resolution_event_id is not null and not exists (
    select 1 from public.opportunity_decision_authority_events authority_event
    where authority_event.id = new.authority_resolution_event_id and authority_event.tenant_id = new.tenant_id
      and authority_event.company_id = new.company_id and authority_event.opportunity_id = new.opportunity_id
      and authority_event.decision_cycle_id = new.id and authority_event.authority_user_id = new.decision_authority_user_id
      and new.authority_resolution_reference = authority_event.id::text
  ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID'; end if;
  return new;
end;
$$;

create or replace function private.b4_opportunity_decision_policy_snapshot(target_tenant_id uuid, target_company_id uuid, actor_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare policy_id uuid; canonical_policy_id uuid; canonical_policy jsonb; canonical_policy_hash text;
begin
  if target_tenant_id <> 'b4000000-0000-4000-8000-000000000010'::uuid
     or target_company_id <> 'b4000000-0000-4000-8000-000000000020'::uuid then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_TRANSITION_SCOPE_DENIED';
  end if;
  select id into policy_id from private.active_opportunity_decision_policy_snapshot(target_tenant_id, target_company_id);
  if policy_id is not null then return policy_id; end if;
  select id, policy, policy_hash into canonical_policy_id, canonical_policy, canonical_policy_hash
  from public.opportunity_decision_policy_snapshots policy
  where policy.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
    and policy.company_id = '10000000-0000-4000-8000-000000000020'::uuid
    and policy.policy_key = 'opportunity.decision_authority' and policy.status = 'published'
    and policy.published_at is not null and policy.approved_at is not null
  order by policy.policy_version desc
  limit 1;
  if canonical_policy_id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_UNAVAILABLE'; end if;
  insert into public.opportunity_decision_policy_snapshots (
    tenant_id, company_id, policy_key, policy_version, policy, policy_hash, status, published_at, approved_at, source_policy_snapshot_id, created_by
  ) values (
    target_tenant_id, target_company_id, 'opportunity.decision_authority', 1,
    canonical_policy, canonical_policy_hash, 'published', clock_timestamp(), clock_timestamp(), canonical_policy_id, actor_id
  ) on conflict (tenant_id, company_id, policy_key, policy_version) do nothing
  returning id into policy_id;
  if policy_id is null then
    select id into policy_id from private.active_opportunity_decision_policy_snapshot(target_tenant_id, target_company_id);
  end if;
  if policy_id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_UNAVAILABLE'; end if;
  return policy_id;
end;
$$;

create or replace function private.transition_b4_legacy_opportunity_decision_policy(
  target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid, target_input jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare context jsonb; tenant_id uuid; actor_id uuid; request_id uuid; expected_version bigint; transition_code text; transition_reason text; fingerprint text;
  policy_id uuid; cycle_policy_id uuid; cycle_version bigint; final_outcome text; authority_user_id uuid; authority_event_id uuid; authority_reference text;
  execution_phase text; existing public.opportunity_decision_policy_binding_events%rowtype;
begin
  if target_input is null or not (target_input ?& array['requestId', 'expectedCycleVersion', 'transitionCode', 'reason'])
     or target_input ->> 'transitionCode' <> 'b4_acceptance_policy_transition'
     or nullif(btrim(target_input ->> 'reason'), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;
  request_id := (target_input ->> 'requestId')::uuid; expected_version := (target_input ->> 'expectedCycleVersion')::bigint;
  transition_code := target_input ->> 'transitionCode'; transition_reason := btrim(target_input ->> 'reason');
  context := private.stage01_actor_context(target_company_id, 'opportunity.decision_authority.assign');
  tenant_id := (context ->> 'tenantId')::uuid; actor_id := (context ->> 'actorId')::uuid;
  fingerprint := md5(target_opportunity_id::text || ':' || target_cycle_id::text || ':' || expected_version::text || ':' || transition_code || ':' || transition_reason);
  select * into existing from public.opportunity_decision_policy_binding_events event
  where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
  if found then
    if existing.request_fingerprint <> fingerprint then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('opportunityId', existing.opportunity_id, 'decisionCycleId', existing.decision_cycle_id,
      'policySnapshotId', existing.policy_snapshot_id, 'cycleVersion', existing.binding_cycle_version);
  end if;
  if tenant_id <> 'b4000000-0000-4000-8000-000000000010'::uuid
     or target_company_id <> 'b4000000-0000-4000-8000-000000000020'::uuid then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_TRANSITION_SCOPE_DENIED';
  end if;
  select cycle.version, cycle.decision_policy_snapshot_id, cycle.final_outcome, cycle.decision_authority_user_id, cycle.authority_resolution_event_id,
         cycle.authority_resolution_reference, execution.phase
  into cycle_version, cycle_policy_id, final_outcome, authority_user_id, authority_event_id, authority_reference, execution_phase
  from public.stage01_decision_cycles cycle
  join public.workflow_node_executions execution on execution.id = cycle.node_execution_id and execution.tenant_id = cycle.tenant_id
    and execution.company_id = cycle.company_id and execution.superseded_at is null
  where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id
    and cycle.opportunity_id = target_opportunity_id
  for update of cycle;
  if cycle_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_TRANSITION_INELIGIBLE'; end if;
  select * into existing from public.opportunity_decision_policy_binding_events event
  where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
  if found then
    if existing.request_fingerprint <> fingerprint then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('opportunityId', existing.opportunity_id, 'decisionCycleId', existing.decision_cycle_id,
      'policySnapshotId', existing.policy_snapshot_id, 'cycleVersion', existing.binding_cycle_version);
  end if;
  if cycle_policy_id is not null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_TRANSITION_INELIGIBLE'; end if;
  if cycle_version is distinct from expected_version then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  if final_outcome is not null then raise exception using errcode = 'P0001', message = 'STAGE01_FINAL_DECISION_EXISTS'; end if;
  if authority_user_id is not null or authority_event_id is not null or authority_reference is not null then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_ALREADY_RESOLVED';
  end if;
  if execution_phase <> 'active' then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_TRANSITION_INELIGIBLE'; end if;
  policy_id := private.b4_opportunity_decision_policy_snapshot(tenant_id, target_company_id, actor_id);
  update public.stage01_decision_cycles cycle set decision_policy_snapshot_id = policy_id, version = cycle.version + 1
  where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id;
  insert into public.opportunity_decision_policy_binding_events (
    tenant_id, company_id, opportunity_id, decision_cycle_id, previous_policy_snapshot_id, policy_snapshot_id, request_id,
    request_fingerprint, binding_cycle_version, action, transition_code, reason, performed_by_user_id
  ) values (tenant_id, target_company_id, target_opportunity_id, target_cycle_id, null, policy_id, request_id,
    fingerprint, cycle_version + 1, 'legacy_transition', transition_code, transition_reason, actor_id);
  return jsonb_build_object('opportunityId', target_opportunity_id, 'decisionCycleId', target_cycle_id,
    'policySnapshotId', policy_id, 'cycleVersion', cycle_version + 1);
end;
$$;
create or replace function public.transition_b4_legacy_opportunity_decision_policy(target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid, target_input jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.transition_b4_legacy_opportunity_decision_policy(target_company_id, target_opportunity_id, target_cycle_id, target_input)
$$;

create or replace function public.transition_opportunity_decision_policy(target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid, target_input jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.transition_b4_legacy_opportunity_decision_policy(target_company_id, target_opportunity_id, target_cycle_id, target_input)
$$;

create or replace function public.get_opportunity_decision_authority_projection(target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  context jsonb;
  tenant_id uuid;
  cycle public.stage01_decision_cycles%rowtype;
  event public.opportunity_decision_authority_events%rowtype;
  employee_id uuid;
  eligible boolean;
  policy_binding jsonb;
begin
  context := private.stage01_actor_context(target_company_id, 'opportunity.read');
  tenant_id := (context ->> 'tenantId')::uuid;
  select * into cycle from public.stage01_decision_cycles cycle_row
  where cycle_row.id = target_cycle_id and cycle_row.tenant_id = tenant_id and cycle_row.company_id = target_company_id and cycle_row.opportunity_id = target_opportunity_id;
  if cycle.id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  policy_binding := jsonb_build_object(
    'status', case when cycle.decision_policy_snapshot_id is null then 'legacy_unbound' else 'bound' end,
    'policySnapshotId', cycle.decision_policy_snapshot_id,
    'transitionEligible', cycle.tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid
      and cycle.company_id = 'b4000000-0000-4000-8000-000000000020'::uuid
      and cycle.decision_policy_snapshot_id is null and cycle.final_outcome is null
      and cycle.decision_authority_user_id is null and cycle.authority_resolution_event_id is null and cycle.authority_resolution_reference is null
      and exists (select 1 from public.workflow_node_executions execution
        where execution.id = cycle.node_execution_id and execution.tenant_id = cycle.tenant_id and execution.company_id = cycle.company_id
          and execution.phase = 'active' and execution.superseded_at is null)
  );
  if cycle.authority_resolution_event_id is null then
    if cycle.decision_authority_user_id is null and cycle.authority_resolution_reference is null then
      return jsonb_build_object('status','unresolved','userId',null,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',false,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
    end if;
    if cycle.decision_authority_user_id is not null and cycle.authority_resolution_reference is null then
      return jsonb_build_object('status','legacy_unknown','userId',cycle.decision_authority_user_id,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',auth.uid() = cycle.decision_authority_user_id,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
    end if;
    return jsonb_build_object('status','invalid','userId',cycle.decision_authority_user_id,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',false,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
  end if;
  select * into event from public.opportunity_decision_authority_events event_row
  where event_row.id = cycle.authority_resolution_event_id
    and event_row.tenant_id = cycle.tenant_id and event_row.company_id = cycle.company_id
    and event_row.opportunity_id = cycle.opportunity_id and event_row.decision_cycle_id = cycle.id;
  select employee.id into employee_id from public.employees employee
  where employee.tenant_id = cycle.tenant_id and employee.company_id = cycle.company_id and employee.user_id = cycle.decision_authority_user_id;
  eligible := event.id is not null and cycle.decision_authority_user_id = event.authority_user_id
    and cycle.authority_resolution_reference = event.id::text
    and private.opportunity_decision_authority_eligible(cycle.tenant_id, cycle.company_id, cycle.decision_authority_user_id);
  return jsonb_build_object('status', case when eligible then 'resolved' else 'invalid' end, 'userId',cycle.decision_authority_user_id,
    'employeeId',employee_id,'displayName',event.authority_display_name_snapshot,'positionTitle',event.authority_position_snapshot,
    'currentActorIsAuthority',auth.uid() = cycle.decision_authority_user_id,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
end;
$$;

create or replace function private.assign_opportunity_decision_authority(
  target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid, target_input jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare context jsonb; actor_id uuid; tenant_id uuid; cycle_version bigint; final_outcome text; cycle_opportunity_id uuid;
  cycle_authority_user_id uuid; cycle_authority_reference text; cycle_authority_event_id uuid; policy_snapshot_id uuid; policy_json jsonb;
  authority_user_id uuid; request_id uuid; fingerprint text; existing_event public.opportunity_decision_authority_events%rowtype;
  actor_name text; actor_position text; authority_name text; authority_position text; event_id uuid;
begin
  if target_input is null or not (target_input ?& array['requestId','action','authorityUserId','expectedCycleVersion'])
     or target_input ->> 'action' <> 'assign' or nullif(target_input ->> 'requestId','') is null
     or nullif(target_input ->> 'authorityUserId','') is null then raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT'; end if;
  request_id := (target_input ->> 'requestId')::uuid; authority_user_id := (target_input ->> 'authorityUserId')::uuid;
  context := private.stage01_actor_context(target_company_id, 'opportunity.decision_authority.assign'); actor_id := (context ->> 'actorId')::uuid; tenant_id := (context ->> 'tenantId')::uuid;
  fingerprint := md5(target_opportunity_id::text || ':' || target_cycle_id::text || ':' || coalesce(target_input - 'requestId', '{}'::jsonb)::text);
  select * into existing_event from public.opportunity_decision_authority_events event
  where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
  if found then
    if existing_event.request_fingerprint <> fingerprint then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id,
      'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id, 'cycleVersion', existing_event.assignment_cycle_version);
  end if;
  select cycle.version, cycle.final_outcome, cycle.opportunity_id, cycle.decision_authority_user_id,
         cycle.authority_resolution_reference, cycle.authority_resolution_event_id, cycle.decision_policy_snapshot_id
  into cycle_version, final_outcome, cycle_opportunity_id, cycle_authority_user_id, cycle_authority_reference, cycle_authority_event_id, policy_snapshot_id
  from public.stage01_decision_cycles cycle
  join public.workflow_node_executions execution on execution.id = cycle.node_execution_id and execution.tenant_id = cycle.tenant_id and execution.company_id = cycle.company_id and execution.superseded_at is null
  join public.workflow_node_instances node on node.id = execution.node_instance_id and node.tenant_id = execution.tenant_id and node.company_id = execution.company_id and node.node_key = '01.2'
  where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id
  for update of cycle;
  if cycle_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  select * into existing_event from public.opportunity_decision_authority_events event
  where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
  if found then
    if existing_event.request_fingerprint <> fingerprint then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id,
      'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id, 'cycleVersion', existing_event.assignment_cycle_version);
  end if;
  if final_outcome is not null then raise exception using errcode = 'P0001', message = 'STAGE01_FINAL_DECISION_EXISTS'; end if;
  if cycle_authority_user_id is not null or cycle_authority_reference is not null or cycle_authority_event_id is not null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_ALREADY_RESOLVED'; end if;
  if cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  select policy.policy into policy_json from public.opportunity_decision_policy_snapshots policy
  where policy.id = policy_snapshot_id and policy.tenant_id = tenant_id and policy.company_id = target_company_id
    and policy.status = 'published' and policy.published_at is not null and policy.approved_at is not null;
  perform private.assert_opportunity_decision_authority_policy(policy_json);
  if not private.opportunity_decision_authority_eligible(tenant_id, target_company_id, authority_user_id) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;
  select employee.full_name, position.name into actor_name, actor_position from public.employees employee left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id where employee.tenant_id = tenant_id and employee.company_id = target_company_id and employee.user_id = actor_id and employee.employment_status = 'active';
  select employee.full_name, position.name into authority_name, authority_position from public.employees employee left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id where employee.tenant_id = tenant_id and employee.company_id = target_company_id and employee.user_id = authority_user_id and employee.employment_status = 'active';
  if actor_name is null or authority_name is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;
  begin
    insert into public.opportunity_decision_authority_events (tenant_id, company_id, opportunity_id, decision_cycle_id, request_id, request_fingerprint, assignment_cycle_version, action, authority_user_id, performed_by_user_id, reason, authority_display_name_snapshot, authority_position_snapshot, performer_display_name_snapshot, performer_position_snapshot)
    values (tenant_id, target_company_id, target_opportunity_id, target_cycle_id, request_id, fingerprint, cycle_version + 1, 'assigned', authority_user_id, actor_id, nullif(btrim(target_input ->> 'reason'),''), authority_name, authority_position, actor_name, actor_position)
    returning id into event_id;
  exception when unique_violation then
    select * into existing_event from public.opportunity_decision_authority_events event where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
    if existing_event.id is null or existing_event.request_fingerprint <> fingerprint then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id, 'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id, 'cycleVersion', existing_event.assignment_cycle_version);
  end;
  update public.stage01_decision_cycles cycle set decision_authority_user_id = authority_user_id, authority_resolution_event_id = event_id, authority_resolution_reference = event_id::text, version = cycle.version + 1 where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id;
  perform private.write_stage01_audit(tenant_id, target_company_id, actor_id, 'opportunity.decision_authority.assigned', 'opportunity_decision_authority_event', event_id::text, request_id, null, jsonb_build_object('opportunityId', target_opportunity_id, 'decisionCycleId', target_cycle_id, 'authorityUserId', authority_user_id));
  return jsonb_build_object('opportunityId', target_opportunity_id, 'decisionCycleId', target_cycle_id, 'authorityResolutionEventId', event_id, 'authorityUserId', authority_user_id, 'cycleVersion', cycle_version + 1);
end;
$$;

create or replace function private.record_opportunity_decision_final_decision(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare context jsonb; actor_id uuid; tenant_id uuid; cycle_id uuid; cycle_version bigint; final_outcome text; authority_user_id uuid; authority_event_id uuid; authority_reference text; policy_snapshot_id uuid; policy_json jsonb; execution_id uuid; execution_phase text; execution_needs_revalidation boolean; workflow_id uuid; opportunity_validity text; intake_phase text; intake_needs_revalidation boolean; recommendation_id uuid; recommendation_value text; event public.opportunity_decision_authority_events%rowtype;
begin
  if target_input is null or target_request_id is null or not (target_input ?& array['expectedCycleVersion','outcome','rationale']) or target_input ->> 'outcome' not in ('proceed','not_proceeding') or nullif(btrim(target_input ->> 'rationale'),'') is null then raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT'; end if;
  context := private.stage01_actor_context(target_company_id, 'opportunity.decision.record'); actor_id := (context ->> 'actorId')::uuid; tenant_id := (context ->> 'tenantId')::uuid;
  select cycle.id, cycle.version, cycle.final_outcome, cycle.decision_authority_user_id, cycle.authority_resolution_event_id, cycle.authority_resolution_reference, cycle.decision_policy_snapshot_id, execution.id, execution.phase, execution.needs_revalidation, workflow.id
  into cycle_id, cycle_version, final_outcome, authority_user_id, authority_event_id, authority_reference, policy_snapshot_id, execution_id, execution_phase, execution_needs_revalidation, workflow_id
  from public.stage01_decision_cycles cycle join public.workflow_node_executions execution on execution.id = cycle.node_execution_id and execution.tenant_id = cycle.tenant_id and execution.company_id = cycle.company_id and execution.superseded_at is null join public.workflow_node_instances node on node.id = execution.node_instance_id and node.tenant_id = execution.tenant_id and node.company_id = execution.company_id and node.node_key = '01.2' join public.workflow_instances workflow on workflow.id = node.workflow_instance_id and workflow.tenant_id = node.tenant_id and workflow.company_id = node.company_id and workflow.subject_type = 'opportunity'
  where cycle.tenant_id = tenant_id and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id for update of cycle;
  if cycle_id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  if cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  if final_outcome is not null then raise exception using errcode = 'P0001', message = 'STAGE01_FINAL_DECISION_EXISTS'; end if;
  select policy.policy into policy_json from public.opportunity_decision_policy_snapshots policy
  where policy.id = policy_snapshot_id and policy.tenant_id = tenant_id and policy.company_id = target_company_id
    and policy.status = 'published' and policy.published_at is not null and policy.approved_at is not null;
  perform private.assert_opportunity_decision_authority_policy(policy_json);
  select * into event from public.opportunity_decision_authority_events event_row where event_row.id = authority_event_id and event_row.tenant_id = tenant_id and event_row.company_id = target_company_id and event_row.opportunity_id = target_opportunity_id and event_row.decision_cycle_id = cycle_id;
  if authority_user_id is null or authority_event_id is null or event.id is null then raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_UNRESOLVED'; end if;
  if event.authority_user_id is distinct from authority_user_id or authority_reference is distinct from event.id::text or actor_id <> authority_user_id then raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_MISMATCH'; end if;
  if not private.opportunity_decision_authority_eligible(tenant_id, target_company_id, authority_user_id) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;
  select opportunity.validity_state into opportunity_validity from public.opportunities opportunity where opportunity.id = target_opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id;
  select intake_execution.phase, intake_execution.needs_revalidation into intake_phase, intake_needs_revalidation from public.workflow_node_instances intake_node join public.workflow_node_executions intake_execution on intake_execution.node_instance_id = intake_node.id and intake_execution.tenant_id = intake_node.tenant_id and intake_execution.company_id = intake_node.company_id and intake_execution.superseded_at is null where intake_node.workflow_instance_id = workflow_id and intake_node.node_key = '01.1';
  recommendation_id := private.stage01_current_recommendation_id(cycle_id);
  if execution_phase <> 'active' or execution_needs_revalidation or opportunity_validity <> 'valid' or intake_phase is distinct from 'completed' or coalesce(intake_needs_revalidation, true) or not private.stage01_cycle_evaluations_satisfied((select definition from public.workflow_definition_snapshots where id = (select definition_snapshot_id from public.workflow_instances where id = workflow_id)), cycle_id) or exists (select 1 from public.workflow_blockers blocker where blocker.node_execution_id = execution_id and blocker.tenant_id = tenant_id and blocker.company_id = target_company_id and blocker.effect = 'blocking' and blocker.resolved_at is null) then raise exception using errcode = 'P0001', message = 'STAGE01_EVALUATION_GATES_NOT_SATISFIED'; end if;
  if recommendation_id is null then raise exception using errcode = 'P0001', message = 'STAGE01_CURRENT_RECOMMENDATION_REQUIRED'; end if;
  select recommendation into recommendation_value from public.stage01_recommendations where id = recommendation_id;
  if target_input ->> 'outcome' = (case recommendation_value when 'recommend_proceed' then 'proceed' else 'not_proceeding' end) then if target_input ? 'overrideRationale' and nullif(btrim(target_input ->> 'overrideRationale'),'') is not null then raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_OVERRIDE_INVALID'; end if; elsif nullif(btrim(target_input ->> 'overrideRationale'),'') is null then raise exception using errcode = 'P0001', message = 'STAGE01_OVERRIDE_RATIONALE_REQUIRED'; end if;
  update public.stage01_decision_cycles cycle set final_outcome = target_input ->> 'outcome', final_decision_by = actor_id, final_decision_at = clock_timestamp(), final_rationale = btrim(target_input ->> 'rationale'), final_recommendation_id = recommendation_id, override_rationale = nullif(btrim(target_input ->> 'overrideRationale'),''), version = cycle.version + 1 where cycle.id = cycle_id returning version into cycle_version;
  perform private.write_stage01_audit(tenant_id,target_company_id,actor_id,'opportunity.decision.final_recorded','stage01_decision_cycle',cycle_id::text,target_request_id,null,jsonb_build_object('opportunityId',target_opportunity_id,'decisionCycleId',cycle_id,'cycleVersion',cycle_version));
  return jsonb_build_object('opportunityId',target_opportunity_id,'decisionCycleId',cycle_id,'finalRecommendationId',recommendation_id,'finalOutcome',target_input ->> 'outcome','cycleVersion',cycle_version);
end;
$$;

revoke all on function private.transition_b4_legacy_opportunity_decision_policy(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.prevent_opportunity_decision_policy_snapshot_mutation() from public, anon, authenticated;
revoke all on function private.prevent_opportunity_decision_policy_binding_event_mutation() from public, anon, authenticated;
revoke all on function private.guard_opportunity_decision_policy_binding_event_scope() from public, anon, authenticated;
revoke all on function private.assert_opportunity_decision_authority_policy(jsonb) from public, anon, authenticated;
revoke all on function private.active_opportunity_decision_policy_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function private.bind_new_stage01_decision_cycle_policy() from public, anon, authenticated;
revoke all on function private.audit_new_stage01_decision_cycle_policy() from public, anon, authenticated;
revoke all on function private.guard_stage01_decision_cycle() from public, anon, authenticated;
revoke all on function private.b4_opportunity_decision_policy_snapshot(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.transition_b4_legacy_opportunity_decision_policy(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.transition_opportunity_decision_policy(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.transition_opportunity_decision_policy(uuid, uuid, uuid, jsonb) to authenticated;
