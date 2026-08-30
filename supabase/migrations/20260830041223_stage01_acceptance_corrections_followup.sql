create or replace function private.stage01_baseline_snapshot_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_snapshot jsonb;
  source_opportunity jsonb;
  opportunity_json jsonb;
  primary_contact_json jsonb;
  usable_methods_json jsonb;
  active_scopes_json jsonb;
  primary_referrer_json jsonb;
  intake_records_json jsonb;
  intake_owner_json jsonb;
  completion_actor_id uuid;
  completion_at timestamptz;
  completion_execution_version bigint;
  completion_opportunity_version bigint;
  lead_source_entry jsonb;
  lead_source_requires_referrer boolean;
begin
  if not (new.snapshot ? 'capturedAt' and new.snapshot ? 'opportunity') then
    return new;
  end if;

  source_snapshot := new.snapshot;
  source_opportunity := source_snapshot -> 'opportunity';
  completion_opportunity_version := (source_opportunity ->> 'version')::bigint;
  opportunity_json := pg_catalog.jsonb_build_object(
    'id', source_opportunity -> 'id',
    'primaryCustomerName', source_opportunity -> 'primary_customer_name',
    'customerTypeCode', source_opportunity -> 'customer_type_code',
    'needDescription', source_opportunity -> 'need_description',
    'locationStatus', source_opportunity -> 'location_status',
    'primaryLeadSourceCode', source_opportunity -> 'primary_lead_source_code',
    'engagementStatusCode', source_opportunity -> 'engagement_status_code'
  );

  select pg_catalog.jsonb_build_object(
    'relationshipId', relationship.value -> 'id',
    'contactId', relationship.value -> 'contact_id',
    'relationshipCode', relationship.value -> 'relationship_code'
  )
  into primary_contact_json
  from pg_catalog.jsonb_array_elements(source_snapshot -> 'contacts')
       with ordinality as relationship(value, ordinal)
  where relationship.value ->> 'is_primary' = 'true'
    and pg_catalog.jsonb_typeof(relationship.value -> 'ended_at') = 'null'
  order by relationship.ordinal
  limit 1;

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
  where method.tenant_id = new.tenant_id
    and method.company_id = new.company_id
    and method.contact_id = (primary_contact_json ->> 'contactId')::uuid
    and method.is_usable;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'scopeId', scope.value -> 'id',
        'scopeCode', scope.value -> 'scope_code'
      ) order by scope.ordinal
    ),
    '[]'::jsonb
  )
  into active_scopes_json
  from pg_catalog.jsonb_array_elements(source_snapshot -> 'scopes')
       with ordinality as scope(value, ordinal)
  where pg_catalog.jsonb_typeof(scope.value -> 'retired_at') = 'null';

  select pg_catalog.jsonb_build_object(
    'referrerId', referrer.value -> 'id',
    'referrerTypeCode', referrer.value -> 'referrer_type_code',
    'contactId', referrer.value -> 'contact_id',
    'displayName', referrer.value -> 'display_name'
  )
  into primary_referrer_json
  from pg_catalog.jsonb_array_elements(source_snapshot -> 'referrers')
       with ordinality as referrer(value, ordinal)
  where referrer.value ->> 'is_primary' = 'true'
    and pg_catalog.jsonb_typeof(referrer.value -> 'ended_at') = 'null'
  order by referrer.ordinal
  limit 1;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'intakeRecordId', intake.value -> 'id',
        'channelCode', intake.value -> 'channel_code',
        'createdAt', intake.value -> 'created_at'
      ) order by intake.ordinal
    ),
    '[]'::jsonb
  )
  into intake_records_json
  from pg_catalog.jsonb_array_elements(source_snapshot -> 'intakeRecords')
       with ordinality as intake(value, ordinal);

  select pg_catalog.jsonb_build_object(
    'assignmentId', assignment.id,
    'assigneeUserId', assignment.assignee_user_id,
    'assignedAt', assignment.assigned_at
  )
  into intake_owner_json
  from public.workflow_node_assignments as assignment
  where assignment.node_execution_id = new.node_execution_id
    and assignment.tenant_id = new.tenant_id
    and assignment.company_id = new.company_id
    and assignment.assignment_kind = 'accountable_owner'
    and assignment.ended_at is null;

  select execution.completed_by, execution.completed_at, execution.version
  into completion_actor_id, completion_at, completion_execution_version
  from public.workflow_node_executions as execution
  where execution.id = new.node_execution_id
    and execution.tenant_id = new.tenant_id
    and execution.company_id = new.company_id;

  lead_source_entry := private.stage01_taxonomy_entry(
    private.stage01_bound_definition(new.company_id, new.opportunity_id),
    'lead_source',
    opportunity_json ->> 'primaryLeadSourceCode'
  );
  lead_source_requires_referrer := coalesce(
    (lead_source_entry #>> '{behavior,requiresReferrer}')::boolean, false
  );

  new.snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'opportunity', opportunity_json,
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
      'actorId', completion_actor_id,
      'completedAt', completion_at,
      'opportunityVersion', completion_opportunity_version,
      'executionVersion', completion_execution_version
    )
  );
  new.snapshot_hash := pg_catalog.encode(
    extensions.digest(new.snapshot::text, 'sha256'), 'hex'
  );
  return new;
end;
$$;

revoke all on function private.stage01_baseline_snapshot_v1()
  from public, anon, authenticated;
