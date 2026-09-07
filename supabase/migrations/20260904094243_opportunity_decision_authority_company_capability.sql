-- Amendment 31: company capability and policy are intentionally separate.
-- The Amendment 25 policy snapshot migration is already applied and immutable.
create table public.company_opportunity_decision_capabilities (
  tenant_id uuid not null,
  company_id uuid not null,
  capability_key text not null check (capability_key = 'opportunity.decision_authority'),
  enabled boolean not null,
  version bigint not null default 1 check (version > 0),
  configured_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, company_id, capability_key),
  foreign key (company_id, tenant_id) references public.companies (id, tenant_id) on delete restrict
);
alter table public.company_opportunity_decision_capabilities enable row level security;
revoke all on table public.company_opportunity_decision_capabilities from public, anon, authenticated;

insert into public.company_opportunity_decision_capabilities (
  tenant_id, company_id, capability_key, enabled, version
)
select
  '10000000-0000-4000-8000-000000000010'::uuid,
  '10000000-0000-4000-8000-000000000020'::uuid,
  'opportunity.decision_authority', true, 1
where exists (
  select 1 from public.companies company
  where company.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
    and company.id = '10000000-0000-4000-8000-000000000020'::uuid
)
on conflict (tenant_id, company_id, capability_key) do nothing;

create or replace function private.company_opportunity_decision_authority_enabled(
  target_tenant_id uuid, target_company_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select capability.enabled
    from public.company_opportunity_decision_capabilities capability
    where capability.tenant_id = target_tenant_id
      and capability.company_id = target_company_id
      and capability.capability_key = 'opportunity.decision_authority'
  ), false)
$$;

create or replace function private.bind_new_stage01_decision_cycle_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare active_policy public.opportunity_decision_policy_snapshots%rowtype;
begin
  if not private.company_opportunity_decision_authority_enabled(new.tenant_id, new.company_id) then
    if new.decision_policy_snapshot_id is not null then
      raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_POINTER_INVALID';
    end if;
    return new;
  end if;

  select * into active_policy
  from private.active_opportunity_decision_policy_snapshot(new.tenant_id, new.company_id);
  if active_policy.id is null then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_UNAVAILABLE';
  end if;
  if new.decision_policy_snapshot_id is null then
    new.decision_policy_snapshot_id := active_policy.id;
  elsif new.decision_policy_snapshot_id is distinct from active_policy.id then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_POINTER_INVALID';
  end if;
  return new;
end;
$$;

create or replace function private.audit_new_stage01_decision_cycle_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.company_opportunity_decision_authority_enabled(new.tenant_id, new.company_id) then
    return new;
  end if;
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

create or replace function public.list_opportunity_decision_authority_candidates(
  target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare context jsonb; tenant_id uuid;
begin
  context := private.stage01_actor_context(target_company_id, 'opportunity.decision_authority.assign');
  tenant_id := (context ->> 'tenantId')::uuid;
  if not private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED';
  end if;
  if not exists (
    select 1 from public.stage01_decision_cycles cycle
    where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id
      and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id
  ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
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
  if not private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED';
  end if;
  fingerprint := md5(target_opportunity_id::text || ':' || target_cycle_id::text || ':' || coalesce(target_input - 'requestId', '{}'::jsonb)::text);
  select * into existing_event from public.opportunity_decision_authority_events event where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
  if found then
    if existing_event.request_fingerprint <> fingerprint then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id, 'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id, 'cycleVersion', existing_event.assignment_cycle_version);
  end if;
  select cycle.version, cycle.final_outcome, cycle.opportunity_id, cycle.decision_authority_user_id, cycle.authority_resolution_reference, cycle.authority_resolution_event_id, cycle.decision_policy_snapshot_id
  into cycle_version, final_outcome, cycle_opportunity_id, cycle_authority_user_id, cycle_authority_reference, cycle_authority_event_id, policy_snapshot_id
  from public.stage01_decision_cycles cycle
  join public.workflow_node_executions execution on execution.id = cycle.node_execution_id and execution.tenant_id = cycle.tenant_id and execution.company_id = cycle.company_id and execution.superseded_at is null
  join public.workflow_node_instances node on node.id = execution.node_instance_id and node.tenant_id = execution.tenant_id and node.company_id = execution.company_id and node.node_key = '01.2'
  where cycle.id = target_cycle_id and cycle.tenant_id = tenant_id and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id for update of cycle;
  if cycle_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  select * into existing_event from public.opportunity_decision_authority_events event where event.tenant_id = tenant_id and event.company_id = target_company_id and event.request_id = request_id;
  if found then
    if existing_event.request_fingerprint <> fingerprint then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('opportunityId', existing_event.opportunity_id, 'decisionCycleId', existing_event.decision_cycle_id, 'authorityResolutionEventId', existing_event.id, 'authorityUserId', existing_event.authority_user_id, 'cycleVersion', existing_event.assignment_cycle_version);
  end if;
  if final_outcome is not null then raise exception using errcode = 'P0001', message = 'STAGE01_FINAL_DECISION_EXISTS'; end if;
  if cycle_authority_user_id is not null or cycle_authority_reference is not null or cycle_authority_event_id is not null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_ALREADY_RESOLVED'; end if;
  if cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  select policy.policy into policy_json from public.opportunity_decision_policy_snapshots policy where policy.id = policy_snapshot_id and policy.tenant_id = tenant_id and policy.company_id = target_company_id and policy.status = 'published' and policy.published_at is not null and policy.approved_at is not null;
  perform private.assert_opportunity_decision_authority_policy(policy_json);
  if not private.opportunity_decision_authority_eligible(tenant_id, target_company_id, authority_user_id) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;
  select employee.full_name, position.name into actor_name, actor_position from public.employees employee left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id where employee.tenant_id = tenant_id and employee.company_id = target_company_id and employee.user_id = actor_id and employee.employment_status = 'active';
  select employee.full_name, position.name into authority_name, authority_position from public.employees employee left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id where employee.tenant_id = tenant_id and employee.company_id = target_company_id and employee.user_id = authority_user_id and employee.employment_status = 'active';
  if actor_name is null or authority_name is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;
  begin
    insert into public.opportunity_decision_authority_events (tenant_id, company_id, opportunity_id, decision_cycle_id, request_id, request_fingerprint, assignment_cycle_version, action, authority_user_id, performed_by_user_id, reason, authority_display_name_snapshot, authority_position_snapshot, performer_display_name_snapshot, performer_position_snapshot)
    values (tenant_id, target_company_id, target_opportunity_id, target_cycle_id, request_id, fingerprint, cycle_version + 1, 'assigned', authority_user_id, actor_id, nullif(btrim(target_input ->> 'reason'),''), authority_name, authority_position, actor_name, actor_position) returning id into event_id;
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
declare context jsonb; actor_id uuid; tenant_id uuid; cycle_id uuid; cycle_version bigint; final_outcome text; authority_user_id uuid; authority_event_id uuid; authority_reference text; policy_snapshot_id uuid; policy_json jsonb; authority_required boolean; execution_id uuid; execution_phase text; execution_needs_revalidation boolean; workflow_id uuid; opportunity_validity text; intake_phase text; intake_needs_revalidation boolean; recommendation_id uuid; recommendation_value text; event public.opportunity_decision_authority_events%rowtype;
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
  authority_required := private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id);
  if authority_required then
    select policy.policy into policy_json from public.opportunity_decision_policy_snapshots policy where policy.id = policy_snapshot_id and policy.tenant_id = tenant_id and policy.company_id = target_company_id and policy.status = 'published' and policy.published_at is not null and policy.approved_at is not null;
    perform private.assert_opportunity_decision_authority_policy(policy_json);
    select * into event from public.opportunity_decision_authority_events event_row where event_row.id = authority_event_id and event_row.tenant_id = tenant_id and event_row.company_id = target_company_id and event_row.opportunity_id = target_opportunity_id and event_row.decision_cycle_id = cycle_id;
    if authority_user_id is null or authority_event_id is null or event.id is null then raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_UNRESOLVED'; end if;
    if event.authority_user_id is distinct from authority_user_id or authority_reference is distinct from event.id::text or actor_id <> authority_user_id then raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_MISMATCH'; end if;
    if not private.opportunity_decision_authority_eligible(tenant_id, target_company_id, authority_user_id) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE'; end if;
  end if;
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
  where cycle_row.id = target_cycle_id and cycle_row.tenant_id = tenant_id
    and cycle_row.company_id = target_company_id and cycle_row.opportunity_id = target_opportunity_id;
  if cycle.id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  if not private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id) then
    return jsonb_build_object(
      'status', 'not_required', 'userId', null, 'employeeId', null, 'displayName', null,
      'positionTitle', null, 'currentActorIsAuthority', false, 'locked', cycle.final_outcome is not null,
      'policyBinding', jsonb_build_object('status', 'not_required', 'policySnapshotId', null, 'transitionEligible', false)
    );
  end if;
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

revoke all on function private.company_opportunity_decision_authority_enabled(uuid, uuid) from public, anon, authenticated;
