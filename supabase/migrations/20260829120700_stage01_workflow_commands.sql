create function private.execute_stage01_workflow_command(
  command_name text,
  target_company_id uuid,
  target_resource_id uuid,
  target_secondary_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
end;
$$;

create function private.resolve_opportunity_duplicate(target_company_id uuid, target_opportunity_id uuid, target_concern_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('resolve_duplicate', target_company_id, target_opportunity_id, target_concern_id, target_input, target_request_id) $$;
create function public.resolve_opportunity_duplicate(target_company_id uuid, target_opportunity_id uuid, target_concern_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.resolve_opportunity_duplicate(target_company_id, target_opportunity_id, target_concern_id, target_input, target_request_id) $$;

create function private.assign_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('assign_node', target_company_id, target_execution_id, null, target_input, target_request_id) $$;
create function public.assign_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.assign_workflow_node(target_company_id, target_execution_id, target_input, target_request_id) $$;

create function private.end_workflow_assignment(target_company_id uuid, target_assignment_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('end_assignment', target_company_id, target_assignment_id, null, target_input, target_request_id) $$;
create function public.end_workflow_assignment(target_company_id uuid, target_assignment_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.end_workflow_assignment(target_company_id, target_assignment_id, target_input, target_request_id) $$;

create function private.raise_workflow_blocker(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('raise_blocker', target_company_id, target_execution_id, null, target_input, target_request_id) $$;
create function public.raise_workflow_blocker(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.raise_workflow_blocker(target_company_id, target_execution_id, target_input, target_request_id) $$;

create function private.resolve_workflow_blocker(target_company_id uuid, target_blocker_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('resolve_blocker', target_company_id, target_blocker_id, null, target_input, target_request_id) $$;
create function public.resolve_workflow_blocker(target_company_id uuid, target_blocker_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.resolve_workflow_blocker(target_company_id, target_blocker_id, target_input, target_request_id) $$;

create function private.start_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('start_node', target_company_id, target_execution_id, null, target_input, target_request_id) $$;
create function public.start_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.start_workflow_node(target_company_id, target_execution_id, target_input, target_request_id) $$;

create function private.complete_stage01_intake(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('complete_intake', target_company_id, target_execution_id, null, target_input, target_request_id) $$;
create function public.complete_stage01_intake(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.complete_stage01_intake(target_company_id, target_execution_id, target_input, target_request_id) $$;

create function private.invalidate_opportunity(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('invalidate_opportunity', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.invalidate_opportunity(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.invalidate_opportunity(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.restore_opportunity(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('restore_opportunity', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.restore_opportunity(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.restore_opportunity(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.reopen_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('reopen_node', target_company_id, target_execution_id, null, target_input, target_request_id) $$;
create function public.reopen_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.reopen_workflow_node(target_company_id, target_execution_id, target_input, target_request_id) $$;

create function private.revalidate_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_workflow_command('revalidate_node', target_company_id, target_execution_id, null, target_input, target_request_id) $$;
create function public.revalidate_workflow_node(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.revalidate_workflow_node(target_company_id, target_execution_id, target_input, target_request_id) $$;

create or replace function private.execute_stage01_workflow_command(
  command_name text,
  target_company_id uuid,
  target_resource_id uuid,
  target_secondary_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  permission_code text;
  context jsonb;
  actor_id uuid;
  tenant_id uuid;
  opportunity_id uuid;
  execution_id uuid;
  assignment_id uuid;
  blocker_id uuid;
  node_key text;
  workflow_id uuid;
  definition_json jsonb;
  execution_phase text;
  execution_needs_revalidation boolean;
  execution_version bigint;
  opportunity_version bigint;
  opportunity_validity text;
  canonical_opportunity_id uuid;
  current_owner_id uuid;
  created_id uuid;
  event_id bigint;
  baseline_id uuid;
  baseline_version integer;
  baseline_snapshot jsonb;
  lead_source_requires_referrer boolean := false;
  assignment_kind text;
  old_summary jsonb;
  new_summary jsonb;
begin
  permission_code := case command_name
    when 'resolve_duplicate' then 'opportunity.duplicate.resolve'
    when 'assign_node' then 'journey.assignment.manage'
    when 'end_assignment' then 'journey.assignment.manage'
    when 'raise_blocker' then 'journey.blocker.raise'
    when 'resolve_blocker' then 'journey.blocker.resolve'
    when 'start_node' then 'journey.node.start'
    when 'complete_intake' then 'journey.node.complete'
    when 'invalidate_opportunity' then 'opportunity.invalidate'
    when 'restore_opportunity' then 'opportunity.restore'
    when 'reopen_node' then 'journey.node.reopen'
    when 'revalidate_node' then 'journey.node.revalidate'
    else null
  end;

  if permission_code is null or target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

  context := private.stage01_actor_context(target_company_id, permission_code);
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  if command_name = 'resolve_duplicate' then
    perform private.assert_stage01_command_keys(target_input, array[
      'resolution', 'canonicalOpportunityId', 'resolutionNote', 'expectedOpportunityVersion'
    ]);
    perform private.assert_stage01_required_keys(target_input, array[
      'resolution', 'resolutionNote', 'expectedOpportunityVersion'
    ]);
    if target_input ->> 'resolution' not in ('same_need', 'different_need')
       or nullif(pg_catalog.btrim(target_input ->> 'resolutionNote'), '') is null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;

    select opportunity.version, opportunity.validity_state, opportunity.canonical_opportunity_id,
           pg_catalog.to_jsonb(opportunity)
    into opportunity_version, opportunity_validity, canonical_opportunity_id, old_summary
    from public.opportunities as opportunity
    where opportunity.id = target_resource_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id
    for update;
    if opportunity_version is null then
      raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
    end if;
    if opportunity_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    perform 1
    from public.opportunity_duplicate_concerns as concern
    where concern.id = target_secondary_id
      and concern.opportunity_id = target_resource_id
      and concern.tenant_id = tenant_id
      and concern.company_id = target_company_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
    end if;
    if exists (
      select 1 from public.opportunity_duplicate_concerns as concern
      where concern.id = target_secondary_id and concern.resolved_at is not null
    ) then
      raise exception using errcode = 'P0001', message = 'STAGE01_RESOURCE_ALREADY_RESOLVED';
    end if;

    canonical_opportunity_id := case when target_input ->> 'resolution' = 'same_need'
      then (target_input ->> 'canonicalOpportunityId')::uuid end;
    if target_input ->> 'resolution' = 'same_need' then
      if canonical_opportunity_id is null or canonical_opportunity_id = target_resource_id
         or not exists (
           select 1 from public.opportunities as canonical
           where canonical.id = canonical_opportunity_id
             and canonical.tenant_id = tenant_id
             and canonical.company_id = target_company_id
         ) then
        raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
      end if;
    elsif target_input ? 'canonicalOpportunityId'
          and target_input ->> 'canonicalOpportunityId' is not null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;

    update public.opportunity_duplicate_concerns as concern
    set resolution = target_input ->> 'resolution',
        canonical_opportunity_id = canonical_opportunity_id,
        resolution_note = pg_catalog.btrim(target_input ->> 'resolutionNote'),
        resolved_by = actor_id,
        resolved_at = pg_catalog.statement_timestamp()
    where concern.id = target_secondary_id
      and concern.opportunity_id = target_resource_id
      and concern.tenant_id = tenant_id
      and concern.company_id = target_company_id;

    update public.opportunities as opportunity
    set validity_state = case when target_input ->> 'resolution' = 'same_need' then 'invalid' else opportunity.validity_state end,
        canonical_opportunity_id = case when target_input ->> 'resolution' = 'same_need' then canonical_opportunity_id else opportunity.canonical_opportunity_id end,
        version = opportunity.version + 1,
        updated_at = pg_catalog.statement_timestamp()
    where opportunity.id = target_resource_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id
    returning opportunity.version, pg_catalog.to_jsonb(opportunity)
    into opportunity_version, new_summary;

    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'opportunity.duplicate_resolved',
      'opportunity_duplicate_concern', target_secondary_id::text, target_request_id,
      old_summary, pg_catalog.jsonb_build_object(
        'resolution', target_input ->> 'resolution',
        'canonicalOpportunityId', canonical_opportunity_id,
        'opportunityVersion', opportunity_version
      )
    );
    return pg_catalog.jsonb_build_object(
      'duplicateConcernId', target_secondary_id,
      'opportunityId', target_resource_id,
      'opportunityVersion', opportunity_version
    );
  end if;

  if command_name in ('invalidate_opportunity', 'restore_opportunity') then
    perform private.assert_stage01_command_keys(
      target_input,
      case when command_name = 'invalidate_opportunity'
        then array['invalidReasonCode', 'reason', 'canonicalOpportunityId', 'expectedOpportunityVersion']
        else array['reason', 'expectedOpportunityVersion'] end
    );
    perform private.assert_stage01_required_keys(
      target_input,
      case when command_name = 'invalidate_opportunity'
        then array['invalidReasonCode', 'reason', 'expectedOpportunityVersion']
        else array['reason', 'expectedOpportunityVersion'] end
    );
    if nullif(pg_catalog.btrim(target_input ->> 'reason'), '') is null
       or (command_name = 'invalidate_opportunity'
           and nullif(pg_catalog.btrim(target_input ->> 'invalidReasonCode'), '') is null) then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;

    select opportunity.version, opportunity.validity_state, opportunity.canonical_opportunity_id,
           pg_catalog.to_jsonb(opportunity)
    into opportunity_version, opportunity_validity, canonical_opportunity_id, old_summary
    from public.opportunities as opportunity
    where opportunity.id = target_resource_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id
    for update;
    if opportunity_version is null then
      raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
    end if;
    if opportunity_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    if command_name = 'invalidate_opportunity' then
      if opportunity_validity <> 'valid' then
        raise exception using errcode = 'P0001', message = 'STAGE01_INVALID_VALIDITY_TRANSITION';
      end if;
      canonical_opportunity_id := case when target_input ->> 'canonicalOpportunityId' is not null
        then (target_input ->> 'canonicalOpportunityId')::uuid end;
      if canonical_opportunity_id is not null and (
        canonical_opportunity_id = target_resource_id or not exists (
          select 1 from public.opportunities as canonical
          where canonical.id = canonical_opportunity_id
            and canonical.tenant_id = tenant_id
            and canonical.company_id = target_company_id
        )
      ) then
        raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
      end if;
      update public.opportunities as opportunity
      set validity_state = 'invalid',
          canonical_opportunity_id = canonical_opportunity_id,
          version = opportunity.version + 1,
          updated_at = pg_catalog.statement_timestamp()
      where opportunity.id = target_resource_id
        and opportunity.tenant_id = tenant_id
        and opportunity.company_id = target_company_id
      returning opportunity.version, pg_catalog.to_jsonb(opportunity)
      into opportunity_version, new_summary;
    else
      if opportunity_validity <> 'invalid' or canonical_opportunity_id is not null then
        raise exception using errcode = 'P0001', message = 'STAGE01_INVALID_VALIDITY_TRANSITION';
      end if;
      update public.opportunities as opportunity
      set validity_state = 'valid',
          version = opportunity.version + 1,
          updated_at = pg_catalog.statement_timestamp()
      where opportunity.id = target_resource_id
        and opportunity.tenant_id = tenant_id
        and opportunity.company_id = target_company_id
      returning opportunity.version, pg_catalog.to_jsonb(opportunity)
      into opportunity_version, new_summary;
    end if;

    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case when command_name = 'invalidate_opportunity' then 'opportunity.invalidated' else 'opportunity.restored' end,
      'opportunity', target_resource_id::text, target_request_id, old_summary,
      new_summary || pg_catalog.jsonb_build_object(
        'reason', pg_catalog.btrim(target_input ->> 'reason'),
        'invalidReasonCode', case when command_name = 'invalidate_opportunity' then target_input ->> 'invalidReasonCode' end
      )
    );
    return pg_catalog.jsonb_build_object(
      'opportunityId', target_resource_id,
      'validityState', case when command_name = 'invalidate_opportunity' then 'invalid' else 'valid' end,
      'opportunityVersion', opportunity_version
    );
  end if;

  if command_name in ('assign_node', 'end_assignment', 'raise_blocker', 'resolve_blocker') then
    if command_name = 'assign_node' then
      perform private.assert_stage01_command_keys(target_input, array[
        'assignmentKind', 'assigneeUserId', 'assignmentReason', 'expectedExecutionVersion'
      ]);
      perform private.assert_stage01_required_keys(target_input, array[
        'assignmentKind', 'assigneeUserId', 'expectedExecutionVersion'
      ]);
      if target_input ->> 'assignmentKind' not in ('accountable_owner', 'contributor') then
        raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
      end if;
      execution_id := target_resource_id;
    elsif command_name = 'end_assignment' then
      perform private.assert_stage01_command_keys(target_input, array['endReason', 'expectedExecutionVersion']);
      perform private.assert_stage01_required_keys(target_input, array['endReason', 'expectedExecutionVersion']);
      if nullif(pg_catalog.btrim(target_input ->> 'endReason'), '') is null then
        raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
      end if;
      assignment_id := target_resource_id;
      select assignment.node_execution_id into execution_id
      from public.workflow_node_assignments as assignment
      where assignment.id = assignment_id
        and assignment.tenant_id = tenant_id
        and assignment.company_id = target_company_id;
    elsif command_name = 'raise_blocker' then
      perform private.assert_stage01_command_keys(target_input, array[
        'effect', 'categoryCode', 'description', 'responsibleUserId', 'expectedExecutionVersion'
      ]);
      perform private.assert_stage01_required_keys(target_input, array[
        'effect', 'categoryCode', 'description', 'expectedExecutionVersion'
      ]);
      if target_input ->> 'effect' not in ('blocking', 'non_blocking')
         or nullif(pg_catalog.btrim(target_input ->> 'categoryCode'), '') is null
         or nullif(pg_catalog.btrim(target_input ->> 'description'), '') is null then
        raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
      end if;
      execution_id := target_resource_id;
    else
      perform private.assert_stage01_command_keys(target_input, array['resolution', 'expectedExecutionVersion']);
      perform private.assert_stage01_required_keys(target_input, array['resolution', 'expectedExecutionVersion']);
      if nullif(pg_catalog.btrim(target_input ->> 'resolution'), '') is null then
        raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
      end if;
      blocker_id := target_resource_id;
      select blocker.node_execution_id into execution_id
      from public.workflow_blockers as blocker
      where blocker.id = blocker_id
        and blocker.tenant_id = tenant_id
        and blocker.company_id = target_company_id;
    end if;

    if execution_id is null then
      raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
    end if;
    select execution.version into execution_version
    from public.workflow_node_executions as execution
    where execution.id = execution_id
      and execution.tenant_id = tenant_id
      and execution.company_id = target_company_id
      and execution.superseded_at is null
    for update;
    if execution_version is null then
      raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
    end if;
    if execution_version is distinct from (target_input ->> 'expectedExecutionVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    if command_name = 'assign_node' then
      if not exists (
        select 1 from public.company_memberships as membership
        where membership.company_id = target_company_id
          and membership.tenant_id = tenant_id
          and membership.user_id = (target_input ->> 'assigneeUserId')::uuid
          and membership.is_active
      ) then
        raise exception using errcode = 'P0001', message = 'COMPANY_MEMBER_NOT_FOUND';
      end if;
      assignment_kind := target_input ->> 'assignmentKind';
      if assignment_kind = 'accountable_owner' then
        update public.workflow_node_assignments as assignment
        set ended_by = actor_id,
            ended_at = pg_catalog.statement_timestamp(),
            end_reason = 'Replaced by accountable owner assignment'
        where assignment.node_execution_id = execution_id
          and assignment.tenant_id = tenant_id
          and assignment.company_id = target_company_id
          and assignment.assignment_kind = 'accountable_owner'
          and assignment.ended_at is null;
      end if;
      created_id := pg_catalog.gen_random_uuid();
      insert into public.workflow_node_assignments (
        id, tenant_id, company_id, node_execution_id, assignment_kind,
        assignee_user_id, assigned_by, assignment_reason
      ) values (
        created_id, tenant_id, target_company_id, execution_id, assignment_kind,
        (target_input ->> 'assigneeUserId')::uuid, actor_id,
        nullif(pg_catalog.btrim(target_input ->> 'assignmentReason'), '')
      );
    elsif command_name = 'end_assignment' then
      select assignment.assignment_kind into assignment_kind
      from public.workflow_node_assignments as assignment
      where assignment.id = assignment_id
        and assignment.node_execution_id = execution_id
        and assignment.tenant_id = tenant_id
        and assignment.company_id = target_company_id
      for update;
      if assignment_kind is null then
        raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
      end if;
      if exists (
        select 1 from public.workflow_node_assignments as assignment
        where assignment.id = assignment_id and assignment.ended_at is not null
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE01_RESOURCE_ALREADY_ENDED';
      end if;
      update public.workflow_node_assignments as assignment
      set ended_by = actor_id,
          ended_at = pg_catalog.statement_timestamp(),
          end_reason = pg_catalog.btrim(target_input ->> 'endReason')
      where assignment.id = assignment_id;
      created_id := assignment_id;
    elsif command_name = 'raise_blocker' then
      if target_input ->> 'responsibleUserId' is not null and not exists (
        select 1 from public.company_memberships as membership
        where membership.company_id = target_company_id
          and membership.tenant_id = tenant_id
          and membership.user_id = (target_input ->> 'responsibleUserId')::uuid
          and membership.is_active
      ) then
        raise exception using errcode = 'P0001', message = 'COMPANY_MEMBER_NOT_FOUND';
      end if;
      created_id := pg_catalog.gen_random_uuid();
      insert into public.workflow_blockers (
        id, tenant_id, company_id, node_execution_id, effect, category_code,
        description, raised_by, responsible_user_id
      ) values (
        created_id, tenant_id, target_company_id, execution_id,
        target_input ->> 'effect', pg_catalog.btrim(target_input ->> 'categoryCode'),
        pg_catalog.btrim(target_input ->> 'description'), actor_id,
        case when target_input ->> 'responsibleUserId' is not null
          then (target_input ->> 'responsibleUserId')::uuid end
      );
    else
      perform 1
      from public.workflow_blockers as blocker
      where blocker.id = blocker_id
        and blocker.node_execution_id = execution_id
        and blocker.tenant_id = tenant_id
        and blocker.company_id = target_company_id
      for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
      end if;
      if exists (
        select 1 from public.workflow_blockers as blocker
        where blocker.id = blocker_id and blocker.resolved_at is not null
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE01_RESOURCE_ALREADY_RESOLVED';
      end if;
      update public.workflow_blockers as blocker
      set resolved_by = actor_id,
          resolved_at = pg_catalog.statement_timestamp(),
          resolution = pg_catalog.btrim(target_input ->> 'resolution'),
          version = blocker.version + 1
      where blocker.id = blocker_id;
      created_id := blocker_id;
    end if;

    update public.workflow_node_executions as execution
    set version = execution.version + 1
    where execution.id = execution_id
      and execution.tenant_id = tenant_id
      and execution.company_id = target_company_id
    returning execution.version into execution_version;

    insert into public.workflow_node_events (
      tenant_id, company_id, node_execution_id, event_type, actor_id, reason, payload, request_id
    ) values (
      tenant_id, target_company_id, execution_id,
      case command_name
        when 'assign_node' then 'assignment_added'
        when 'end_assignment' then 'assignment_ended'
        when 'raise_blocker' then 'blocker_raised'
        else 'blocker_resolved' end,
      actor_id,
      case when command_name = 'end_assignment' then pg_catalog.btrim(target_input ->> 'endReason')
           when command_name = 'resolve_blocker' then pg_catalog.btrim(target_input ->> 'resolution') end,
      pg_catalog.jsonb_build_object(
        'resourceId', created_id,
        'executionVersion', execution_version,
        'effect', case when command_name = 'raise_blocker' then target_input ->> 'effect' end
      ),
      target_request_id
    );
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case command_name
        when 'assign_node' then 'journey.assignment_added'
        when 'end_assignment' then 'journey.assignment_ended'
        when 'raise_blocker' then 'journey.blocker_raised'
        else 'journey.blocker_resolved' end,
      case when command_name in ('assign_node', 'end_assignment') then 'workflow_node_assignment' else 'workflow_blocker' end,
      created_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object('nodeExecutionId', execution_id, 'executionVersion', execution_version)
    );
    return pg_catalog.jsonb_build_object(
      case when command_name in ('assign_node', 'end_assignment') then 'assignmentId' else 'blockerId' end,
      created_id,
      'nodeExecutionId', execution_id,
      'executionVersion', execution_version
    );
  end if;

  if command_name in ('start_node', 'complete_intake', 'reopen_node', 'revalidate_node') then
    perform private.assert_stage01_command_keys(
      target_input,
      case command_name
        when 'complete_intake' then array['expectedOpportunityVersion', 'expectedExecutionVersion']
        when 'reopen_node' then array['reason', 'expectedExecutionVersion']
        when 'revalidate_node' then array['reason', 'evidence', 'expectedExecutionVersion']
        else array['expectedExecutionVersion'] end
    );
    perform private.assert_stage01_required_keys(
      target_input,
      case command_name
        when 'complete_intake' then array['expectedOpportunityVersion', 'expectedExecutionVersion']
        when 'reopen_node' then array['reason', 'expectedExecutionVersion']
        when 'revalidate_node' then array['reason', 'expectedExecutionVersion']
        else array['expectedExecutionVersion'] end
    );
    if command_name in ('reopen_node', 'revalidate_node')
       and nullif(pg_catalog.btrim(target_input ->> 'reason'), '') is null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;

    execution_id := target_resource_id;
    select workflow.id, workflow.subject_id, node.node_key, definition.definition
    into workflow_id, opportunity_id, node_key, definition_json
    from public.workflow_node_executions as execution
    join public.workflow_node_instances as node
      on node.id = execution.node_instance_id
     and node.tenant_id = execution.tenant_id
     and node.company_id = execution.company_id
    join public.workflow_instances as workflow
      on workflow.id = node.workflow_instance_id
     and workflow.tenant_id = node.tenant_id
     and workflow.company_id = node.company_id
    join public.workflow_definition_snapshots as definition
      on definition.id = workflow.definition_snapshot_id
     and definition.tenant_id = workflow.tenant_id
     and definition.company_id = workflow.company_id
    where execution.id = execution_id
      and execution.tenant_id = tenant_id
      and execution.company_id = target_company_id
      and workflow.subject_type = 'opportunity';
    if opportunity_id is null then
      raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
    end if;

    if command_name = 'complete_intake' then
      select opportunity.version, opportunity.validity_state, pg_catalog.to_jsonb(opportunity)
      into opportunity_version, opportunity_validity, baseline_snapshot
      from public.opportunities as opportunity
      where opportunity.id = opportunity_id
        and opportunity.tenant_id = tenant_id
        and opportunity.company_id = target_company_id
      for update;
      if opportunity_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
        raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
      end if;
    end if;

    select execution.phase, execution.needs_revalidation, execution.version
    into execution_phase, execution_needs_revalidation, execution_version
    from public.workflow_node_executions as execution
    where execution.id = execution_id
      and execution.tenant_id = tenant_id
      and execution.company_id = target_company_id
      and execution.superseded_at is null
    for update;
    if execution_version is null then
      raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
    end if;
    if execution_version is distinct from (target_input ->> 'expectedExecutionVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    if command_name = 'start_node' then
      select opportunity.validity_state into opportunity_validity
      from public.opportunities as opportunity
      where opportunity.id = opportunity_id
        and opportunity.tenant_id = tenant_id
        and opportunity.company_id = target_company_id;
      if execution_phase <> 'not_started' or execution_needs_revalidation or opportunity_validity <> 'valid' then
        raise exception using errcode = 'P0001', message = 'STAGE01_NODE_NOT_STARTABLE';
      end if;
      if not exists (
        select 1 from public.workflow_node_assignments as assignment
        where assignment.node_execution_id = execution_id
          and assignment.tenant_id = tenant_id
          and assignment.company_id = target_company_id
          and assignment.assignment_kind = 'accountable_owner'
          and assignment.ended_at is null
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE01_ACCOUNTABLE_OWNER_REQUIRED';
      end if;
      if node_key = '01.2' and not exists (
        select 1
        from public.workflow_node_instances as intake_node
        join public.workflow_node_executions as intake_execution
          on intake_execution.node_instance_id = intake_node.id
         and intake_execution.tenant_id = intake_node.tenant_id
         and intake_execution.company_id = intake_node.company_id
        where intake_node.workflow_instance_id = workflow_id
          and intake_node.node_key = '01.1'
          and intake_execution.superseded_at is null
          and intake_execution.phase = 'completed'
          and not intake_execution.needs_revalidation
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE01_DEPENDENCY_NOT_SATISFIED';
      end if;
      update public.workflow_node_executions as execution
      set phase = 'active',
          started_by = actor_id,
          started_at = pg_catalog.statement_timestamp(),
          version = execution.version + 1
      where execution.id = execution_id
      returning execution.version into execution_version;
      insert into public.workflow_node_events (
        tenant_id, company_id, node_execution_id, event_type, actor_id, payload, request_id
      ) values (
        tenant_id, target_company_id, execution_id, 'started', actor_id,
        pg_catalog.jsonb_build_object('nodeKey', node_key, 'executionVersion', execution_version),
        target_request_id
      );
    elsif command_name = 'complete_intake' then
      if node_key <> '01.1' or execution_phase <> 'active' or execution_needs_revalidation
         or opportunity_validity <> 'valid' then
        raise exception using errcode = 'P0001', message = 'STAGE01_INTAKE_NOT_COMPLETABLE';
      end if;
      if not exists (
        select 1 from public.workflow_node_assignments as assignment
        where assignment.node_execution_id = execution_id
          and assignment.tenant_id = tenant_id
          and assignment.company_id = target_company_id
          and assignment.assignment_kind = 'accountable_owner'
          and assignment.ended_at is null
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE01_ACCOUNTABLE_OWNER_REQUIRED';
      end if;

      select exists (
        select 1
        from pg_catalog.jsonb_array_elements(definition_json #> array['taxonomies', 'lead_source']) as lead_source(value)
        where lead_source.value ->> 'code' = opportunity.primary_lead_source_code
          and pg_catalog.lower(lead_source.value #>> array['behavior', 'requiresReferrer']) = 'true'
      )
      into lead_source_requires_referrer
      from public.opportunities as opportunity
      where opportunity.id = opportunity_id
        and opportunity.tenant_id = tenant_id
        and opportunity.company_id = target_company_id;

      if not exists (
        select 1 from public.opportunities as opportunity
        where opportunity.id = opportunity_id
          and opportunity.tenant_id = tenant_id
          and opportunity.company_id = target_company_id
          and nullif(pg_catalog.btrim(opportunity.primary_customer_name), '') is not null
          and nullif(pg_catalog.btrim(opportunity.customer_type_code), '') is not null
          and nullif(pg_catalog.btrim(opportunity.need_description), '') is not null
          and opportunity.location_status is not null
          and nullif(pg_catalog.btrim(opportunity.primary_lead_source_code), '') is not null
          and nullif(pg_catalog.btrim(opportunity.engagement_status_code), '') is not null
      ) or not exists (
        select 1
        from public.opportunity_contacts as relationship
        join public.contact_methods as method
          on method.contact_id = relationship.contact_id
         and method.tenant_id = relationship.tenant_id
         and method.company_id = relationship.company_id
        where relationship.opportunity_id = opportunity_id
          and relationship.tenant_id = tenant_id
          and relationship.company_id = target_company_id
          and relationship.is_primary
          and relationship.ended_at is null
          and nullif(pg_catalog.btrim(relationship.relationship_code), '') is not null
          and method.is_usable
      ) or not exists (
        select 1 from public.opportunity_scopes as scope
        where scope.opportunity_id = opportunity_id
          and scope.tenant_id = tenant_id
          and scope.company_id = target_company_id
          and scope.retired_at is null
      ) or not exists (
        select 1 from public.opportunity_intake_records as intake
        where intake.opportunity_id = opportunity_id
          and intake.tenant_id = tenant_id
          and intake.company_id = target_company_id
      ) or exists (
        select 1 from public.workflow_blockers as blocker
        where blocker.node_execution_id = execution_id
          and blocker.tenant_id = tenant_id
          and blocker.company_id = target_company_id
          and blocker.effect = 'blocking'
          and blocker.resolved_at is null
      ) or exists (
        select 1 from public.opportunity_duplicate_concerns as concern
        where concern.opportunity_id = opportunity_id
          and concern.tenant_id = tenant_id
          and concern.company_id = target_company_id
          and concern.resolved_at is null
      ) or (lead_source_requires_referrer and (
        select pg_catalog.count(*)
        from public.opportunity_referrers as referrer
        where referrer.opportunity_id = opportunity_id
          and referrer.tenant_id = tenant_id
          and referrer.company_id = target_company_id
          and referrer.is_primary
          and referrer.ended_at is null
      ) <> 1) then
        raise exception using errcode = 'P0001', message = 'STAGE01_INTAKE_GATES_NOT_SATISFIED';
      end if;

      update public.workflow_node_executions as execution
      set phase = 'completed',
          completed_by = actor_id,
          completed_at = pg_catalog.statement_timestamp(),
          version = execution.version + 1
      where execution.id = execution_id
      returning execution.version into execution_version;

      baseline_id := pg_catalog.gen_random_uuid();
      select coalesce(pg_catalog.max(baseline.baseline_version), 0) + 1
      into baseline_version
      from public.stage01_intake_completion_baselines as baseline
      where baseline.node_execution_id = execution_id
        and baseline.tenant_id = tenant_id
        and baseline.company_id = target_company_id;

      select pg_catalog.jsonb_build_object(
        'opportunity', pg_catalog.to_jsonb(opportunity),
        'contacts', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(relationship) order by relationship.created_at, relationship.id)
          from public.opportunity_contacts as relationship
          where relationship.opportunity_id = opportunity_id
            and relationship.tenant_id = tenant_id
            and relationship.company_id = target_company_id
        ), '[]'::jsonb),
        'scopes', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(scope) order by scope.created_at, scope.id)
          from public.opportunity_scopes as scope
          where scope.opportunity_id = opportunity_id
            and scope.tenant_id = tenant_id
            and scope.company_id = target_company_id
        ), '[]'::jsonb),
        'referrers', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(referrer) order by referrer.created_at, referrer.id)
          from public.opportunity_referrers as referrer
          where referrer.opportunity_id = opportunity_id
            and referrer.tenant_id = tenant_id
            and referrer.company_id = target_company_id
        ), '[]'::jsonb),
        'intakeRecords', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(intake) order by intake.created_at, intake.id)
          from public.opportunity_intake_records as intake
          where intake.opportunity_id = opportunity_id
            and intake.tenant_id = tenant_id
            and intake.company_id = target_company_id
        ), '[]'::jsonb),
        'capturedAt', pg_catalog.statement_timestamp()
      ) into baseline_snapshot
      from public.opportunities as opportunity
      where opportunity.id = opportunity_id
        and opportunity.tenant_id = tenant_id
        and opportunity.company_id = target_company_id;

      insert into public.workflow_node_events (
        tenant_id, company_id, node_execution_id, event_type, actor_id, payload, request_id
      ) values (
        tenant_id, target_company_id, execution_id, 'completed', actor_id,
        pg_catalog.jsonb_build_object(
          'nodeKey', node_key,
          'baselineId', baseline_id,
          'executionVersion', execution_version
        ),
        target_request_id
      ) returning id into event_id;

      insert into public.stage01_intake_completion_baselines (
        id, tenant_id, company_id, opportunity_id, node_execution_id,
        completion_event_id, baseline_version, snapshot, snapshot_hash, created_by
      ) values (
        baseline_id, tenant_id, target_company_id, opportunity_id, execution_id,
        event_id, baseline_version, baseline_snapshot,
        pg_catalog.encode(extensions.digest(baseline_snapshot::text, 'sha256'), 'hex'), actor_id
      );

      perform private.write_stage01_audit(
        tenant_id, target_company_id, actor_id, 'journey.intake_completed',
        'workflow_node_execution', execution_id::text, target_request_id, null,
        pg_catalog.jsonb_build_object(
          'opportunityId', opportunity_id,
          'completionEventId', event_id,
          'baselineId', baseline_id,
          'baselineVersion', baseline_version,
          'executionVersion', execution_version
        )
      );
      return pg_catalog.jsonb_build_object(
        'opportunityId', opportunity_id,
        'nodeExecutionId', execution_id,
        'executionVersion', execution_version,
        'baselineId', baseline_id,
        'baselineVersion', baseline_version,
        'completionEventId', event_id
      );
    elsif command_name = 'reopen_node' then
      if execution_phase <> 'completed' then
        raise exception using errcode = 'P0001', message = 'STAGE01_NODE_NOT_REOPENABLE';
      end if;
      update public.workflow_node_executions as execution
      set phase = 'active',
          completed_by = null,
          completed_at = null,
          version = execution.version + 1
      where execution.id = execution_id
      returning execution.version into execution_version;
      if node_key = '01.1' then
        update public.workflow_node_executions as descendant_execution
        set needs_revalidation = true,
            version = descendant_execution.version + 1
        from public.workflow_node_instances as descendant_node
        where descendant_execution.node_instance_id = descendant_node.id
          and descendant_node.workflow_instance_id = workflow_id
          and descendant_node.tenant_id = tenant_id
          and descendant_node.company_id = target_company_id
          and descendant_node.node_key = '01.2'
          and descendant_execution.superseded_at is null
          and not descendant_execution.needs_revalidation;
      end if;
      insert into public.workflow_node_events (
        tenant_id, company_id, node_execution_id, event_type, actor_id, reason, payload, request_id
      ) values (
        tenant_id, target_company_id, execution_id, 'reopened', actor_id,
        pg_catalog.btrim(target_input ->> 'reason'),
        pg_catalog.jsonb_build_object('nodeKey', node_key, 'executionVersion', execution_version),
        target_request_id
      );
    else
      if not execution_needs_revalidation then
        raise exception using errcode = 'P0001', message = 'STAGE01_REVALIDATION_NOT_REQUIRED';
      end if;
      if node_key = '01.2' and (
        not exists (
          select 1
          from public.workflow_node_instances as intake_node
          join public.workflow_node_executions as intake_execution
            on intake_execution.node_instance_id = intake_node.id
           and intake_execution.tenant_id = intake_node.tenant_id
           and intake_execution.company_id = intake_node.company_id
          where intake_node.workflow_instance_id = workflow_id
            and intake_node.node_key = '01.1'
            and intake_execution.superseded_at is null
            and intake_execution.phase = 'completed'
            and not intake_execution.needs_revalidation
        ) or not exists (
          select 1 from public.opportunities as opportunity
          where opportunity.id = opportunity_id
            and opportunity.tenant_id = tenant_id
            and opportunity.company_id = target_company_id
            and opportunity.validity_state = 'valid'
        )
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE01_DEPENDENCY_NOT_SATISFIED';
      end if;
      update public.workflow_node_executions as execution
      set needs_revalidation = false,
          version = execution.version + 1
      where execution.id = execution_id
      returning execution.version into execution_version;
      insert into public.workflow_node_events (
        tenant_id, company_id, node_execution_id, event_type, actor_id, reason, payload, request_id
      ) values (
        tenant_id, target_company_id, execution_id, 'revalidated', actor_id,
        pg_catalog.btrim(target_input ->> 'reason'),
        pg_catalog.jsonb_build_object(
          'nodeKey', node_key,
          'evidence', coalesce(target_input -> 'evidence', '[]'::jsonb),
          'executionVersion', execution_version
        ), target_request_id
      );
    end if;

    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case command_name
        when 'start_node' then 'journey.node_started'
        when 'reopen_node' then 'journey.node_reopened'
        else 'journey.node_revalidated' end,
      'workflow_node_execution', execution_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object(
        'opportunityId', opportunity_id,
        'nodeKey', node_key,
        'executionVersion', execution_version,
        'reason', target_input ->> 'reason'
      )
    );
    return pg_catalog.jsonb_build_object(
      'opportunityId', opportunity_id,
      'nodeExecutionId', execution_id,
      'executionVersion', execution_version
    );
  end if;

  raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
end;
$$;

revoke all on function private.execute_stage01_workflow_command(text, uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'resolve_opportunity_duplicate(uuid,uuid,uuid,jsonb,uuid)',
    'assign_workflow_node(uuid,uuid,jsonb,uuid)',
    'end_workflow_assignment(uuid,uuid,jsonb,uuid)',
    'raise_workflow_blocker(uuid,uuid,jsonb,uuid)',
    'resolve_workflow_blocker(uuid,uuid,jsonb,uuid)',
    'start_workflow_node(uuid,uuid,jsonb,uuid)',
    'complete_stage01_intake(uuid,uuid,jsonb,uuid)',
    'invalidate_opportunity(uuid,uuid,jsonb,uuid)',
    'restore_opportunity(uuid,uuid,jsonb,uuid)',
    'reopen_workflow_node(uuid,uuid,jsonb,uuid)',
    'revalidate_workflow_node(uuid,uuid,jsonb,uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', function_signature);
    execute format('grant execute on function public.%s to authenticated', function_signature);
    execute format('revoke execute on function private.%s from public, anon, authenticated', function_signature);
    execute format('grant execute on function private.%s to authenticated', function_signature);
  end loop;
end $$;
