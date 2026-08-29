create function private.assert_stage01_evaluation_config(target_definition jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  begin
    perform private.assert_valid_stage01_definition(target_definition);
  exception when others then
    raise exception using errcode = 'P0001', message = 'STAGE01_EVALUATION_CONFIG_UNAVAILABLE';
  end;
end;
$$;

create function private.stage01_cycle_evaluations_satisfied(
  target_definition jsonb,
  target_cycle_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  satisfied boolean;
begin
  perform private.assert_stage01_evaluation_config(target_definition);
  select not exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_definition -> 'criteria') as criterion(value)
    left join lateral (
      select evaluation.applicability, evaluation.result
      from public.stage01_criterion_evaluations as evaluation
      where evaluation.decision_cycle_id = target_cycle_id
        and evaluation.criterion_key = criterion.value ->> 'key'
      order by evaluation.revision desc
      limit 1
    ) as current_evaluation on true
    where criterion.value ->> 'criticality' <> 'optional'
      and not coalesce((
        (
          current_evaluation.applicability = 'applicable'
          and current_evaluation.result in ('fit', 'concern', 'not_fit')
        )
        or (
          current_evaluation.applicability = 'not_applicable'
          and current_evaluation.result is null
          and (criterion.value ->> 'allowsNotApplicable')::boolean
        )
      ), false)
  ) into satisfied;
  return satisfied;
end;
$$;

create function private.stage01_current_recommendation_id(target_cycle_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select recommendation.id
  from public.stage01_recommendations as recommendation
  where recommendation.decision_cycle_id = target_cycle_id
    and not exists (
      select 1
      from public.stage01_criterion_evaluations as evaluation
      where evaluation.decision_cycle_id = target_cycle_id
        and evaluation.evaluated_at > recommendation.submitted_at
    )
    and not exists (
      select 1
      from public.stage01_clarification_returns as clarification
      where clarification.decision_cycle_id = target_cycle_id
        and clarification.returned_at > recommendation.submitted_at
    )
  order by recommendation.version desc
  limit 1;
$$;

create function private.execute_stage01_decision_command(
  command_name text,
  target_company_id uuid,
  target_resource_id uuid,
  target_criterion_key text,
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

create function private.record_stage01_criterion_evaluation(target_company_id uuid, target_opportunity_id uuid, target_criterion_key text, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_decision_command('record_criterion', target_company_id, target_opportunity_id, target_criterion_key, target_input, target_request_id) $$;
create function public.record_stage01_criterion_evaluation(target_company_id uuid, target_opportunity_id uuid, target_criterion_key text, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.record_stage01_criterion_evaluation(target_company_id, target_opportunity_id, target_criterion_key, target_input, target_request_id) $$;

create function private.submit_stage01_recommendation(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_decision_command('submit_recommendation', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.submit_stage01_recommendation(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.submit_stage01_recommendation(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.return_stage01_for_clarification(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_decision_command('return_clarification', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.return_stage01_for_clarification(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.return_stage01_for_clarification(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.record_stage01_final_decision(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_decision_command('record_final_decision', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.record_stage01_final_decision(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.record_stage01_final_decision(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.complete_stage01_evaluation(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_decision_command('complete_evaluation', target_company_id, target_execution_id, null, target_input, target_request_id) $$;
create function public.complete_stage01_evaluation(target_company_id uuid, target_execution_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.complete_stage01_evaluation(target_company_id, target_execution_id, target_input, target_request_id) $$;

create function private.reactivate_stage01(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_decision_command('reactivate_stage01', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.reactivate_stage01(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.reactivate_stage01(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create or replace function private.execute_stage01_decision_command(
  command_name text,
  target_company_id uuid,
  target_resource_id uuid,
  target_criterion_key text,
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
  workflow_id uuid;
  node_instance_id uuid;
  execution_id uuid;
  intake_execution_id uuid;
  cycle_id uuid;
  definition_json jsonb;
  criterion_definition jsonb;
  execution_phase text;
  execution_needs_revalidation boolean;
  execution_version bigint;
  intake_phase text;
  intake_needs_revalidation boolean;
  opportunity_version bigint;
  opportunity_validity text;
  cycle_version bigint;
  cycle_no integer;
  final_outcome text;
  authority_user_id uuid;
  authority_reference text;
  current_recommendation_id uuid;
  current_recommendation_value text;
  created_id uuid;
  created_execution_id uuid;
  created_cycle_id uuid;
  created_revision integer;
  created_version integer;
  event_id bigint;
  old_cycle_summary jsonb;
begin
  permission_code := case command_name
    when 'record_criterion' then 'stage01.evaluation.update'
    when 'submit_recommendation' then 'stage01.recommendation.submit'
    when 'return_clarification' then 'stage01.clarification.return'
    when 'record_final_decision' then 'stage01.decision.record'
    when 'complete_evaluation' then 'journey.node.complete'
    when 'reactivate_stage01' then 'stage01.reactivate'
    else null
  end;
  if permission_code is null or target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

  context := private.stage01_actor_context(target_company_id, permission_code);
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  if command_name = 'complete_evaluation' then
    perform private.assert_stage01_command_keys(target_input, array[
      'expectedExecutionVersion', 'expectedCycleVersion'
    ]);
    perform private.assert_stage01_required_keys(target_input, array[
      'expectedExecutionVersion', 'expectedCycleVersion'
    ]);
    execution_id := target_resource_id;

    select workflow.id, workflow.subject_id, node.id, definition.definition,
           cycle.id
    into workflow_id, opportunity_id, node_instance_id, definition_json, cycle_id
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
    join public.stage01_decision_cycles as cycle
      on cycle.node_execution_id = execution.id
     and cycle.tenant_id = execution.tenant_id
     and cycle.company_id = execution.company_id
    where execution.id = execution_id
      and execution.tenant_id = tenant_id
      and execution.company_id = target_company_id
      and node.node_key = '01.2'
      and workflow.subject_type = 'opportunity';
    if cycle_id is null then
      raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
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

    select cycle.version, cycle.final_outcome
    into cycle_version, final_outcome
    from public.stage01_decision_cycles as cycle
    where cycle.id = cycle_id
      and cycle.tenant_id = tenant_id
      and cycle.company_id = target_company_id
    for update;
    if cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    select opportunity.validity_state into opportunity_validity
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id;
    select intake_execution.phase, intake_execution.needs_revalidation
    into intake_phase, intake_needs_revalidation
    from public.workflow_node_instances as intake_node
    join public.workflow_node_executions as intake_execution
      on intake_execution.node_instance_id = intake_node.id
     and intake_execution.tenant_id = intake_node.tenant_id
     and intake_execution.company_id = intake_node.company_id
    where intake_node.workflow_instance_id = workflow_id
      and intake_node.node_key = '01.1'
      and intake_execution.superseded_at is null;

    current_recommendation_id := private.stage01_current_recommendation_id(cycle_id);
    if execution_phase <> 'active' or execution_needs_revalidation
       or opportunity_validity <> 'valid'
       or intake_phase <> 'completed' or intake_needs_revalidation
       or final_outcome is null
       or not private.stage01_cycle_evaluations_satisfied(definition_json, cycle_id)
       or current_recommendation_id is null
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

    update public.workflow_node_executions as execution
    set phase = 'completed',
        completed_by = actor_id,
        completed_at = pg_catalog.clock_timestamp(),
        version = execution.version + 1
    where execution.id = execution_id
    returning execution.version into execution_version;
    insert into public.workflow_node_events (
      tenant_id, company_id, node_execution_id, event_type, actor_id, payload, request_id
    ) values (
      tenant_id, target_company_id, execution_id, 'completed', actor_id,
      pg_catalog.jsonb_build_object(
        'nodeKey', '01.2', 'decisionCycleId', cycle_id,
        'finalOutcome', final_outcome, 'executionVersion', execution_version
      ), target_request_id
    ) returning id into event_id;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'journey.evaluation_completed',
      'workflow_node_execution', execution_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object(
        'opportunityId', opportunity_id, 'decisionCycleId', cycle_id,
        'completionEventId', event_id, 'executionVersion', execution_version
      )
    );
    return pg_catalog.jsonb_build_object(
      'opportunityId', opportunity_id, 'nodeExecutionId', execution_id,
      'decisionCycleId', cycle_id, 'executionVersion', execution_version,
      'cycleVersion', cycle_version
    );
  end if;

  if command_name = 'reactivate_stage01' then
    perform private.assert_stage01_command_keys(target_input, array[
      'reason', 'expectedOpportunityVersion', 'expectedExecutionVersion', 'expectedCycleVersion'
    ]);
    perform private.assert_stage01_required_keys(target_input, array[
      'reason', 'expectedOpportunityVersion', 'expectedExecutionVersion', 'expectedCycleVersion'
    ]);
    if nullif(pg_catalog.btrim(target_input ->> 'reason'), '') is null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;
    opportunity_id := target_resource_id;

    select workflow.id, node.id, execution.id, execution.version,
           cycle.id, cycle.version, cycle.cycle_no, cycle.final_outcome
    into workflow_id, node_instance_id, execution_id, execution_version,
         cycle_id, cycle_version, cycle_no, final_outcome
    from public.workflow_instances as workflow
    join public.workflow_node_instances as node
      on node.workflow_instance_id = workflow.id
     and node.tenant_id = workflow.tenant_id
     and node.company_id = workflow.company_id
     and node.node_key = '01.2'
    join public.workflow_node_executions as execution
      on execution.node_instance_id = node.id
     and execution.tenant_id = node.tenant_id
     and execution.company_id = node.company_id
     and execution.superseded_at is null
    join public.stage01_decision_cycles as cycle
      on cycle.node_execution_id = execution.id
     and cycle.tenant_id = execution.tenant_id
     and cycle.company_id = execution.company_id
    where workflow.subject_type = 'opportunity'
      and workflow.subject_id = opportunity_id
      and workflow.tenant_id = tenant_id
      and workflow.company_id = target_company_id;
    if cycle_id is null then
      raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
    end if;

    select opportunity.version, opportunity.validity_state
    into opportunity_version, opportunity_validity
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id
    for update;
    if opportunity_version is null then
      raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
    end if;
    if opportunity_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    select intake_execution.id, intake_execution.phase, intake_execution.needs_revalidation
    into intake_execution_id, intake_phase, intake_needs_revalidation
    from public.workflow_node_instances as intake_node
    join public.workflow_node_executions as intake_execution
      on intake_execution.node_instance_id = intake_node.id
     and intake_execution.tenant_id = intake_node.tenant_id
     and intake_execution.company_id = intake_node.company_id
    where intake_node.workflow_instance_id = workflow_id
      and intake_node.node_key = '01.1'
      and intake_execution.superseded_at is null
    for update of intake_execution;
    select execution.phase, execution.version
    into execution_phase, execution_version
    from public.workflow_node_executions as execution
    where execution.id = execution_id
      and execution.tenant_id = tenant_id
      and execution.company_id = target_company_id
      and execution.superseded_at is null
    for update;
    select cycle.version, cycle.cycle_no, cycle.final_outcome, pg_catalog.to_jsonb(cycle)
    into cycle_version, cycle_no, final_outcome, old_cycle_summary
    from public.stage01_decision_cycles as cycle
    where cycle.id = cycle_id
      and cycle.tenant_id = tenant_id
      and cycle.company_id = target_company_id
    for update;

    if execution_version is distinct from (target_input ->> 'expectedExecutionVersion')::bigint
       or cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;
    if intake_needs_revalidation then
      raise exception using errcode = 'P0001', message = 'STAGE01_INTAKE_REVALIDATION_REQUIRED';
    end if;
    if opportunity_validity <> 'valid' or intake_phase <> 'completed'
       or execution_phase <> 'completed' or final_outcome is distinct from 'not_proceeding'
       or exists (
         select 1 from public.stage01_decision_cycles as newer_cycle
         where newer_cycle.opportunity_id = opportunity_id
           and newer_cycle.tenant_id = tenant_id
           and newer_cycle.company_id = target_company_id
           and newer_cycle.cycle_no > cycle_no
       ) then
      raise exception using errcode = 'P0001', message = 'STAGE01_NOT_REACTIVATABLE';
    end if;

    update public.workflow_node_executions as execution
    set superseded_at = pg_catalog.clock_timestamp(),
        version = execution.version + 1
    where execution.id = execution_id;

    created_execution_id := pg_catalog.gen_random_uuid();
    created_cycle_id := pg_catalog.gen_random_uuid();
    insert into public.workflow_node_executions (
      id, tenant_id, company_id, node_instance_id, execution_no
    ) values (
      created_execution_id, tenant_id, target_company_id, node_instance_id, cycle_no + 1
    );
    insert into public.stage01_decision_cycles (
      id, tenant_id, company_id, opportunity_id, node_execution_id,
      cycle_no, reactivation_reason, created_by
    ) values (
      created_cycle_id, tenant_id, target_company_id, opportunity_id,
      created_execution_id, cycle_no + 1, pg_catalog.btrim(target_input ->> 'reason'), actor_id
    );
    insert into public.workflow_node_events (
      tenant_id, company_id, node_execution_id, event_type, actor_id, reason, payload, request_id
    ) values (
      tenant_id, target_company_id, created_execution_id, 'created', actor_id,
      pg_catalog.btrim(target_input ->> 'reason'),
      pg_catalog.jsonb_build_object(
        'nodeKey', '01.2', 'executionNo', cycle_no + 1,
        'decisionCycleId', created_cycle_id,
        'reactivatedFromExecutionId', execution_id,
        'reactivatedFromCycleId', cycle_id
      ), target_request_id
    );
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'stage01.reactivated',
      'stage01_decision_cycle', created_cycle_id::text, target_request_id,
      old_cycle_summary,
      pg_catalog.jsonb_build_object(
        'opportunityId', opportunity_id,
        'previousExecutionId', execution_id,
        'previousCycleId', cycle_id,
        'nodeExecutionId', created_execution_id,
        'decisionCycleId', created_cycle_id,
        'cycleNo', cycle_no + 1,
        'reason', pg_catalog.btrim(target_input ->> 'reason')
      )
    );
    return pg_catalog.jsonb_build_object(
      'opportunityId', opportunity_id,
      'previousExecutionId', execution_id,
      'previousCycleId', cycle_id,
      'nodeExecutionId', created_execution_id,
      'decisionCycleId', created_cycle_id,
      'executionNo', cycle_no + 1,
      'cycleNo', cycle_no + 1,
      'executionVersion', 0,
      'cycleVersion', 0,
      'opportunityVersion', opportunity_version
    );
  end if;

  opportunity_id := target_resource_id;
  select workflow.id, execution.id, cycle.id, definition.definition
  into workflow_id, execution_id, cycle_id, definition_json
  from public.workflow_instances as workflow
  join public.workflow_definition_snapshots as definition
    on definition.id = workflow.definition_snapshot_id
   and definition.tenant_id = workflow.tenant_id
   and definition.company_id = workflow.company_id
  join public.workflow_node_instances as node
    on node.workflow_instance_id = workflow.id
   and node.tenant_id = workflow.tenant_id
   and node.company_id = workflow.company_id
   and node.node_key = '01.2'
  join public.workflow_node_executions as execution
    on execution.node_instance_id = node.id
   and execution.tenant_id = node.tenant_id
   and execution.company_id = node.company_id
   and execution.superseded_at is null
  join public.stage01_decision_cycles as cycle
    on cycle.node_execution_id = execution.id
   and cycle.tenant_id = execution.tenant_id
   and cycle.company_id = execution.company_id
  where workflow.subject_type = 'opportunity'
    and workflow.subject_id = opportunity_id
    and workflow.tenant_id = tenant_id
    and workflow.company_id = target_company_id;
  if cycle_id is null then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  select cycle.version, cycle.final_outcome, cycle.decision_authority_user_id,
         cycle.authority_resolution_reference, pg_catalog.to_jsonb(cycle)
  into cycle_version, final_outcome, authority_user_id, authority_reference, old_cycle_summary
  from public.stage01_decision_cycles as cycle
  where cycle.id = cycle_id
    and cycle.tenant_id = tenant_id
    and cycle.company_id = target_company_id
  for update;

  if command_name = 'record_criterion' then
    perform private.assert_stage01_command_keys(target_input, array[
      'expectedCycleVersion', 'applicability', 'result', 'rationale', 'evidence'
    ]);
    perform private.assert_stage01_required_keys(target_input, array[
      'expectedCycleVersion', 'applicability', 'result', 'rationale', 'evidence'
    ]);
  elsif command_name = 'submit_recommendation' then
    perform private.assert_stage01_command_keys(target_input, array[
      'expectedCycleVersion', 'recommendation', 'rationale', 'evidence'
    ]);
    perform private.assert_stage01_required_keys(target_input, array[
      'expectedCycleVersion', 'recommendation', 'rationale', 'evidence'
    ]);
  elsif command_name = 'return_clarification' then
    perform private.assert_stage01_command_keys(target_input, array[
      'expectedCycleVersion', 'recommendationId', 'reason'
    ]);
    perform private.assert_stage01_required_keys(target_input, array[
      'expectedCycleVersion', 'recommendationId', 'reason'
    ]);
  else
    perform private.assert_stage01_command_keys(target_input, array[
      'expectedCycleVersion', 'outcome', 'rationale', 'overrideRationale'
    ]);
    perform private.assert_stage01_required_keys(target_input, array[
      'expectedCycleVersion', 'outcome', 'rationale'
    ]);
  end if;
  if cycle_version is distinct from (target_input ->> 'expectedCycleVersion')::bigint then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if final_outcome is not null then
    raise exception using errcode = 'P0001', message = 'STAGE01_FINAL_DECISION_EXISTS';
  end if;

  select execution.phase into execution_phase
  from public.workflow_node_executions as execution
  where execution.id = execution_id
    and execution.tenant_id = tenant_id
    and execution.company_id = target_company_id
    and execution.superseded_at is null;

  if command_name = 'record_criterion' then
    if execution_phase <> 'active' or nullif(pg_catalog.btrim(target_criterion_key), '') is null
       or pg_catalog.jsonb_typeof(target_input -> 'evidence') is distinct from 'array'
       or (
         nullif(pg_catalog.btrim(target_input ->> 'rationale'), '') is null
         and pg_catalog.jsonb_array_length(target_input -> 'evidence') = 0
       ) then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;
    perform private.assert_stage01_evaluation_config(definition_json);
    select criterion.value into criterion_definition
    from pg_catalog.jsonb_array_elements(definition_json -> 'criteria') as criterion(value)
    where criterion.value ->> 'key' = target_criterion_key;
    if criterion_definition is null then
      raise exception using errcode = 'P0001', message = 'STAGE01_EVALUATION_CONFIG_UNAVAILABLE';
    end if;
    if target_input ->> 'applicability' = 'applicable' then
      if target_input ->> 'result' is null
         or target_input ->> 'result' not in ('fit', 'concern', 'not_fit', 'insufficient_information') then
        raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
      end if;
    elsif target_input ->> 'applicability' = 'not_applicable' then
      if target_input ->> 'result' is not null
         or not (criterion_definition ->> 'allowsNotApplicable')::boolean then
        raise exception using errcode = 'P0001', message = 'STAGE01_CRITERION_NOT_APPLICABLE_FORBIDDEN';
      end if;
    else
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;
    select coalesce(pg_catalog.max(evaluation.revision), 0) + 1
    into created_revision
    from public.stage01_criterion_evaluations as evaluation
    where evaluation.decision_cycle_id = cycle_id
      and evaluation.criterion_key = target_criterion_key;
    created_id := pg_catalog.gen_random_uuid();
    insert into public.stage01_criterion_evaluations (
      id, tenant_id, company_id, decision_cycle_id, criterion_key, revision,
      applicability, result, rationale, evidence, evaluated_by, evaluated_at
    ) values (
      created_id, tenant_id, target_company_id, cycle_id, target_criterion_key,
      created_revision, target_input ->> 'applicability', target_input ->> 'result',
      nullif(pg_catalog.btrim(target_input ->> 'rationale'), ''), target_input -> 'evidence',
      actor_id, pg_catalog.clock_timestamp()
    );
  elsif command_name = 'submit_recommendation' then
    if execution_phase <> 'active'
       or target_input ->> 'recommendation' is null
       or target_input ->> 'recommendation' not in ('recommend_proceed', 'recommend_not_proceeding')
       or nullif(pg_catalog.btrim(target_input ->> 'rationale'), '') is null
       or pg_catalog.jsonb_typeof(target_input -> 'evidence') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;
    if not private.stage01_cycle_evaluations_satisfied(definition_json, cycle_id) then
      raise exception using errcode = 'P0001', message = 'STAGE01_EVALUATION_GATES_NOT_SATISFIED';
    end if;
    select coalesce(pg_catalog.max(recommendation.version), 0) + 1
    into created_version
    from public.stage01_recommendations as recommendation
    where recommendation.decision_cycle_id = cycle_id;
    created_id := pg_catalog.gen_random_uuid();
    insert into public.stage01_recommendations (
      id, tenant_id, company_id, decision_cycle_id, version, recommendation,
      rationale, evidence, submitted_by, submitted_at
    ) values (
      created_id, tenant_id, target_company_id, cycle_id, created_version,
      target_input ->> 'recommendation', pg_catalog.btrim(target_input ->> 'rationale'),
      target_input -> 'evidence', actor_id, pg_catalog.clock_timestamp()
    );
  elsif command_name = 'return_clarification' then
    if execution_phase <> 'active' or nullif(pg_catalog.btrim(target_input ->> 'reason'), '') is null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;
    current_recommendation_id := private.stage01_current_recommendation_id(cycle_id);
    if current_recommendation_id is null
       or current_recommendation_id is distinct from (target_input ->> 'recommendationId')::uuid then
      raise exception using errcode = 'P0001', message = 'STAGE01_CURRENT_RECOMMENDATION_REQUIRED';
    end if;
    created_id := pg_catalog.gen_random_uuid();
    insert into public.stage01_clarification_returns (
      id, tenant_id, company_id, decision_cycle_id, recommendation_id,
      reason, returned_by, returned_at
    ) values (
      created_id, tenant_id, target_company_id, cycle_id, current_recommendation_id,
      pg_catalog.btrim(target_input ->> 'reason'), actor_id, pg_catalog.clock_timestamp()
    );
  else
    if authority_user_id is null or nullif(pg_catalog.btrim(authority_reference), '') is null then
      raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_UNRESOLVED';
    end if;
    if actor_id <> authority_user_id then
      raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_AUTHORITY_MISMATCH';
    end if;
    if execution_phase <> 'active'
       or target_input ->> 'outcome' is null
       or target_input ->> 'outcome' not in ('proceed', 'not_proceeding')
       or nullif(pg_catalog.btrim(target_input ->> 'rationale'), '') is null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;
    select opportunity.validity_state into opportunity_validity
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id;
    select intake_execution.phase, intake_execution.needs_revalidation
    into intake_phase, intake_needs_revalidation
    from public.workflow_node_instances as intake_node
    join public.workflow_node_executions as intake_execution
      on intake_execution.node_instance_id = intake_node.id
     and intake_execution.tenant_id = intake_node.tenant_id
     and intake_execution.company_id = intake_node.company_id
    where intake_node.workflow_instance_id = workflow_id
      and intake_node.node_key = '01.1'
      and intake_execution.superseded_at is null;
    current_recommendation_id := private.stage01_current_recommendation_id(cycle_id);
    if opportunity_validity <> 'valid' or intake_phase <> 'completed' or intake_needs_revalidation
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
    if current_recommendation_id is null then
      raise exception using errcode = 'P0001', message = 'STAGE01_CURRENT_RECOMMENDATION_REQUIRED';
    end if;
    select recommendation.recommendation into current_recommendation_value
    from public.stage01_recommendations as recommendation
    where recommendation.id = current_recommendation_id;
    if (target_input ->> 'outcome' = case current_recommendation_value
          when 'recommend_proceed' then 'proceed' else 'not_proceeding' end)
       and target_input ->> 'overrideRationale' is not null then
      raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_OVERRIDE_INVALID';
    elsif target_input ->> 'outcome' <> (case current_recommendation_value
          when 'recommend_proceed' then 'proceed' else 'not_proceeding' end)
          and nullif(pg_catalog.btrim(target_input ->> 'overrideRationale'), '') is null then
      raise exception using errcode = 'P0001', message = 'STAGE01_OVERRIDE_RATIONALE_REQUIRED';
    end if;
    update public.stage01_decision_cycles as cycle
    set final_outcome = target_input ->> 'outcome',
        final_decision_by = actor_id,
        final_decision_at = pg_catalog.clock_timestamp(),
        final_rationale = pg_catalog.btrim(target_input ->> 'rationale'),
        final_recommendation_id = current_recommendation_id,
        override_rationale = nullif(pg_catalog.btrim(target_input ->> 'overrideRationale'), ''),
        version = cycle.version + 1
    where cycle.id = cycle_id
    returning cycle.version into cycle_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'stage01.final_decision_recorded',
      'stage01_decision_cycle', cycle_id::text, target_request_id, old_cycle_summary,
      pg_catalog.jsonb_build_object(
        'opportunityId', opportunity_id, 'outcome', target_input ->> 'outcome',
        'recommendationId', current_recommendation_id, 'cycleVersion', cycle_version
      )
    );
    return pg_catalog.jsonb_build_object(
      'opportunityId', opportunity_id, 'decisionCycleId', cycle_id,
      'finalRecommendationId', current_recommendation_id,
      'finalOutcome', target_input ->> 'outcome', 'cycleVersion', cycle_version
    );
  end if;

  update public.stage01_decision_cycles as cycle
  set version = cycle.version + 1
  where cycle.id = cycle_id
  returning cycle.version into cycle_version;
  perform private.write_stage01_audit(
    tenant_id, target_company_id, actor_id,
    case command_name
      when 'record_criterion' then 'stage01.criterion_evaluated'
      when 'submit_recommendation' then 'stage01.recommendation_submitted'
      else 'stage01.clarification_returned' end,
    case command_name
      when 'record_criterion' then 'stage01_criterion_evaluation'
      when 'submit_recommendation' then 'stage01_recommendation'
      else 'stage01_clarification_return' end,
    created_id::text, target_request_id, null,
    pg_catalog.jsonb_build_object(
      'opportunityId', opportunity_id, 'decisionCycleId', cycle_id,
      'criterionKey', target_criterion_key,
      'revision', case when command_name = 'record_criterion' then created_revision end,
      'version', case when command_name = 'submit_recommendation' then created_version end,
      'cycleVersion', cycle_version
    )
  );
  return pg_catalog.jsonb_build_object(
    'opportunityId', opportunity_id,
    'decisionCycleId', cycle_id,
    case command_name
      when 'record_criterion' then 'criterionEvaluationId'
      when 'submit_recommendation' then 'recommendationId'
      else 'clarificationReturnId' end,
    created_id,
    'criterionRevision', case when command_name = 'record_criterion' then created_revision end,
    'recommendationVersion', case when command_name = 'submit_recommendation' then created_version end,
    'cycleVersion', cycle_version
  );
end;
$$;

revoke all on function private.assert_stage01_evaluation_config(jsonb) from public, anon, authenticated;
revoke all on function private.stage01_cycle_evaluations_satisfied(jsonb, uuid) from public, anon, authenticated;
revoke all on function private.stage01_current_recommendation_id(uuid) from public, anon, authenticated;
revoke all on function private.execute_stage01_decision_command(text, uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'record_stage01_criterion_evaluation(uuid,uuid,text,jsonb,uuid)',
    'submit_stage01_recommendation(uuid,uuid,jsonb,uuid)',
    'return_stage01_for_clarification(uuid,uuid,jsonb,uuid)',
    'record_stage01_final_decision(uuid,uuid,jsonb,uuid)',
    'complete_stage01_evaluation(uuid,uuid,jsonb,uuid)',
    'reactivate_stage01(uuid,uuid,jsonb,uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', function_signature);
    execute format('grant execute on function public.%s to authenticated', function_signature);
    execute format('revoke execute on function private.%s from public, anon, authenticated', function_signature);
    execute format('grant execute on function private.%s to authenticated', function_signature);
  end loop;
end $$;
