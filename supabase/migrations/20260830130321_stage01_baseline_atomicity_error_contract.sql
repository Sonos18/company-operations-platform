create function private.complete_stage01_intake_atomic(
  target_company_id uuid,
  target_execution_id uuid,
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
  context jsonb;
  actor_id uuid;
  tenant_id uuid;
  workflow_id uuid;
  opportunity_id uuid;
  node_key text;
  definition_json jsonb;
  opportunity_row public.opportunities%rowtype;
  execution_row public.workflow_node_executions%rowtype;
  primary_contact_id uuid;
  primary_contact_json jsonb;
  usable_methods_json jsonb;
  active_scopes_json jsonb;
  primary_referrer_json jsonb;
  intake_records_json jsonb;
  intake_owner_json jsonb;
  lead_source_entry jsonb;
  lead_source_requires_referrer boolean := false;
  conditional_referrer_satisfied boolean := false;
  no_open_blocking_blocker boolean := false;
  no_unresolved_duplicate_concern boolean := false;
  meaningful_need boolean := false;
  primary_referrer_count bigint := 0;
  completion_at timestamptz;
  completion_execution_version bigint;
  baseline_id uuid;
  baseline_version integer;
  baseline_snapshot jsonb;
  event_id bigint;
begin
  if target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;
  perform private.assert_stage01_command_keys(
    target_input,
    array['expectedOpportunityVersion', 'expectedExecutionVersion']
  );
  perform private.assert_stage01_required_keys(
    target_input,
    array['expectedOpportunityVersion', 'expectedExecutionVersion']
  );

  context := private.stage01_actor_context(
    target_company_id, 'journey.node.complete'
  );
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

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
  where execution.id = target_execution_id
    and execution.tenant_id = tenant_id
    and execution.company_id = target_company_id
    and workflow.subject_type = 'opportunity';
  if opportunity_id is null then
    raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
  end if;

  select opportunity.*
  into opportunity_row
  from public.opportunities as opportunity
  where opportunity.id = opportunity_id
    and opportunity.tenant_id = tenant_id
    and opportunity.company_id = target_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  select execution.*
  into execution_row
  from public.workflow_node_executions as execution
  where execution.id = target_execution_id
    and execution.tenant_id = tenant_id
    and execution.company_id = target_company_id
    and execution.superseded_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'WORKFLOW_RESOURCE_NOT_FOUND';
  end if;

  select relationship.contact_id,
         pg_catalog.jsonb_build_object(
           'relationshipId', relationship.id,
           'contactId', relationship.contact_id,
           'relationshipCode', relationship.relationship_code
         )
  into primary_contact_id, primary_contact_json
  from public.opportunity_contacts as relationship
  where relationship.opportunity_id = opportunity_id
    and relationship.tenant_id = tenant_id
    and relationship.company_id = target_company_id
    and relationship.is_primary
    and relationship.ended_at is null
  order by relationship.created_at, relationship.id
  limit 1;

  if primary_contact_id is not null then
    perform 1
    from public.contacts as contact
    where contact.id = primary_contact_id
      and contact.tenant_id = tenant_id
      and contact.company_id = target_company_id
    for update;
    if not found then
      primary_contact_id := null;
      primary_contact_json := null;
    end if;
  end if;

  if opportunity_row.version is distinct from
       (target_input ->> 'expectedOpportunityVersion')::bigint
     or execution_row.version is distinct from
       (target_input ->> 'expectedExecutionVersion')::bigint then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if node_key <> '01.1'
     or execution_row.phase <> 'active'
     or execution_row.needs_revalidation
     or opportunity_row.validity_state <> 'valid' then
    raise exception using errcode = 'P0001', message = 'STAGE01_INTAKE_NOT_COMPLETABLE';
  end if;

  select pg_catalog.jsonb_build_object(
    'assignmentId', assignment.id,
    'assigneeUserId', assignment.assignee_user_id,
    'assignedAt', assignment.assigned_at
  )
  into intake_owner_json
  from public.workflow_node_assignments as assignment
  where assignment.node_execution_id = target_execution_id
    and assignment.tenant_id = tenant_id
    and assignment.company_id = target_company_id
    and assignment.assignment_kind = 'accountable_owner'
    and assignment.ended_at is null
  order by assignment.assigned_at, assignment.id
  limit 1;
  if intake_owner_json is null then
    raise exception using errcode = 'P0001', message = 'STAGE01_ACCOUNTABLE_OWNER_REQUIRED';
  end if;

  perform private.assert_stage01_opportunity_taxonomies(
    target_company_id, opportunity_id
  );
  lead_source_entry := private.stage01_taxonomy_entry(
    definition_json, 'lead_source', opportunity_row.primary_lead_source_code
  );
  lead_source_requires_referrer := coalesce(
    (lead_source_entry #>> '{behavior,requiresReferrer}')::boolean,
    false
  );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'contactMethodId', method.id,
        'contactId', method.contact_id,
        'methodType', method.method_type,
        'isUsableAtCompletion', method.is_usable
      ) order by method.created_at, method.id
    ),
    '[]'::jsonb
  )
  into usable_methods_json
  from public.contact_methods as method
  where method.tenant_id = tenant_id
    and method.company_id = target_company_id
    and method.contact_id = primary_contact_id
    and method.is_usable;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'scopeId', scope.id,
        'scopeCode', scope.scope_code
      ) order by scope.created_at, scope.id
    ),
    '[]'::jsonb
  )
  into active_scopes_json
  from public.opportunity_scopes as scope
  where scope.opportunity_id = opportunity_id
    and scope.tenant_id = tenant_id
    and scope.company_id = target_company_id
    and scope.retired_at is null;

  select pg_catalog.count(*),
         (
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'referrerId', referrer.id,
               'referrerTypeCode', referrer.referrer_type_code,
               'contactId', referrer.contact_id,
               'displayName', referrer.display_name
             ) order by referrer.created_at, referrer.id
           ) -> 0
         )
  into primary_referrer_count, primary_referrer_json
  from public.opportunity_referrers as referrer
  where referrer.opportunity_id = opportunity_id
    and referrer.tenant_id = tenant_id
    and referrer.company_id = target_company_id
    and referrer.is_primary
    and referrer.ended_at is null;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'intakeRecordId', intake.id,
        'channelCode', intake.channel_code,
        'createdAt', intake.created_at
      ) order by intake.created_at, intake.id
    ),
    '[]'::jsonb
  )
  into intake_records_json
  from public.opportunity_intake_records as intake
  where intake.opportunity_id = opportunity_id
    and intake.tenant_id = tenant_id
    and intake.company_id = target_company_id;

  select not exists (
    select 1
    from public.workflow_blockers as blocker
    where blocker.node_execution_id = target_execution_id
      and blocker.tenant_id = tenant_id
      and blocker.company_id = target_company_id
      and blocker.effect = 'blocking'
      and blocker.resolved_at is null
  ) into no_open_blocking_blocker;
  select not exists (
    select 1
    from public.opportunity_duplicate_concerns as concern
    where concern.opportunity_id = opportunity_id
      and concern.tenant_id = tenant_id
      and concern.company_id = target_company_id
      and concern.resolved_at is null
  ) into no_unresolved_duplicate_concern;

  meaningful_need := nullif(pg_catalog.btrim(opportunity_row.primary_customer_name), '') is not null
    and nullif(pg_catalog.btrim(opportunity_row.customer_type_code), '') is not null
    and nullif(pg_catalog.btrim(opportunity_row.need_description), '') is not null
    and opportunity_row.location_status is not null
    and nullif(pg_catalog.btrim(opportunity_row.primary_lead_source_code), '') is not null
    and nullif(pg_catalog.btrim(opportunity_row.engagement_status_code), '') is not null;
  conditional_referrer_satisfied := not lead_source_requires_referrer
    or primary_referrer_count = 1;

  if not meaningful_need
     or primary_contact_json is null
     or nullif(pg_catalog.btrim(primary_contact_json ->> 'relationshipCode'), '') is null
     or pg_catalog.jsonb_array_length(usable_methods_json) = 0
     or pg_catalog.jsonb_array_length(active_scopes_json) = 0
     or pg_catalog.jsonb_array_length(intake_records_json) = 0
     or not no_open_blocking_blocker
     or not no_unresolved_duplicate_concern
     or not conditional_referrer_satisfied then
    raise exception using errcode = 'P0001', message = 'STAGE01_INTAKE_GATES_NOT_SATISFIED';
  end if;

  completion_at := pg_catalog.statement_timestamp();
  completion_execution_version := execution_row.version + 1;
  baseline_id := pg_catalog.gen_random_uuid();
  select coalesce(pg_catalog.max(baseline.baseline_version), 0) + 1
  into baseline_version
  from public.stage01_intake_completion_baselines as baseline
  where baseline.node_execution_id = target_execution_id
    and baseline.tenant_id = tenant_id
    and baseline.company_id = target_company_id;

  baseline_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'opportunity', pg_catalog.jsonb_build_object(
      'id', opportunity_row.id,
      'primaryCustomerName', opportunity_row.primary_customer_name,
      'customerTypeCode', opportunity_row.customer_type_code,
      'needDescription', opportunity_row.need_description,
      'locationStatus', opportunity_row.location_status,
      'locationText', opportunity_row.location_text,
      'primaryLeadSourceCode', opportunity_row.primary_lead_source_code,
      'engagementStatusCode', opportunity_row.engagement_status_code
    ),
    'primaryContact', primary_contact_json,
    'usableContactMethods', usable_methods_json,
    'activeScopes', active_scopes_json,
    'primaryReferrer', primary_referrer_json,
    'intakeRecordRefs', intake_records_json,
    'intakeOwnerAssignment', intake_owner_json,
    'gates', pg_catalog.jsonb_build_object(
      'opportunityValid', true,
      'meaningfulNeed', true,
      'hasPrimaryContact', true,
      'hasUsableContactMethod', true,
      'hasActiveScope', true,
      'hasIntakeRecord', true,
      'noOpenBlockingBlocker', true,
      'noUnresolvedDuplicateConcern', true,
      'leadSourceRequiresReferrer', lead_source_requires_referrer,
      'conditionalReferrerSatisfied', true,
      'actorHadCompletionPermission', true,
      'executionWasActive', true
    ),
    'completion', pg_catalog.jsonb_build_object(
      'actorId', actor_id,
      'completedAt', completion_at,
      'opportunityVersion', opportunity_row.version,
      'executionVersion', completion_execution_version
    )
  );

  update public.workflow_node_executions as execution
  set phase = 'completed',
      completed_by = actor_id,
      completed_at = completion_at,
      version = completion_execution_version
  where execution.id = target_execution_id
    and execution.tenant_id = tenant_id
    and execution.company_id = target_company_id;

  insert into public.workflow_node_events (
    tenant_id, company_id, node_execution_id, event_type, actor_id,
    payload, request_id
  ) values (
    tenant_id, target_company_id, target_execution_id, 'completed', actor_id,
    pg_catalog.jsonb_build_object(
      'nodeKey', node_key,
      'baselineId', baseline_id,
      'executionVersion', completion_execution_version,
      'completedAt', completion_at
    ),
    target_request_id
  ) returning id into event_id;

  insert into public.stage01_intake_completion_baselines (
    id, tenant_id, company_id, opportunity_id, node_execution_id,
    completion_event_id, baseline_version, snapshot, snapshot_hash, created_by
  ) values (
    baseline_id, tenant_id, target_company_id, opportunity_id,
    target_execution_id, event_id, baseline_version, baseline_snapshot,
    pg_catalog.encode(
      extensions.digest(baseline_snapshot::text, 'sha256'), 'hex'
    ),
    actor_id
  );

  perform private.write_stage01_audit(
    tenant_id, target_company_id, actor_id, 'journey.intake_completed',
    'workflow_node_execution', target_execution_id::text,
    target_request_id, null,
    pg_catalog.jsonb_build_object(
      'opportunityId', opportunity_id,
      'completionEventId', event_id,
      'baselineId', baseline_id,
      'baselineVersion', baseline_version,
      'executionVersion', completion_execution_version,
      'completedAt', completion_at
    )
  );

  return pg_catalog.jsonb_build_object(
    'opportunityId', opportunity_id,
    'nodeExecutionId', target_execution_id,
    'executionVersion', completion_execution_version,
    'baselineId', baseline_id,
    'baselineVersion', baseline_version,
    'completionEventId', event_id
  );
end;
$$;

revoke all on function private.complete_stage01_intake_atomic(
  uuid, uuid, jsonb, uuid
) from public, anon, authenticated;

create or replace function private.complete_stage01_intake(
  target_company_id uuid,
  target_execution_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.complete_stage01_intake_atomic(
    target_company_id, target_execution_id, target_input, target_request_id
  )
$$;

create or replace function private.stage01_baseline_snapshot_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.snapshot ->> 'schemaVersion' is distinct from '1'
     or pg_catalog.jsonb_typeof(new.snapshot -> 'opportunity') is distinct from 'object'
     or not (new.snapshot -> 'opportunity' ? 'locationText')
     or new.snapshot #>> '{opportunity,id}' is distinct from new.opportunity_id::text
     or pg_catalog.jsonb_typeof(new.snapshot -> 'usableContactMethods') is distinct from 'array'
     or pg_catalog.jsonb_typeof(new.snapshot -> 'activeScopes') is distinct from 'array'
     or pg_catalog.jsonb_typeof(new.snapshot -> 'intakeRecordRefs') is distinct from 'array'
     or pg_catalog.jsonb_typeof(new.snapshot -> 'gates') is distinct from 'object'
     or pg_catalog.jsonb_typeof(new.snapshot -> 'completion') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  new.snapshot_hash := pg_catalog.encode(
    extensions.digest(new.snapshot::text, 'sha256'), 'hex'
  );
  return new;
end;
$$;

revoke all on function private.stage01_baseline_snapshot_v1()
  from public, anon, authenticated;
