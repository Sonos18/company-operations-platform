alter table public.opportunities
  add column current_invalid_reason_code text,
  add column current_invalid_reason_semantic_key text,
  add column current_invalidation_reason text,
  add column invalidated_by uuid,
  add column invalidated_at timestamptz;

create index opportunities_invalidated_by_idx
  on public.opportunities (invalidated_by)
  where invalidated_by is not null;

create function private.stage01_taxonomy_entry(
  target_definition jsonb,
  target_taxonomy_key text,
  target_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  matched_entry jsonb;
  matched_count bigint;
begin
  if nullif(pg_catalog.btrim(target_taxonomy_key), '') is null
     or nullif(pg_catalog.btrim(target_code), '') is null
     or pg_catalog.jsonb_typeof(target_definition #> array['taxonomies', target_taxonomy_key])
        is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  select (pg_catalog.jsonb_agg(entry.value) -> 0), pg_catalog.count(*)
  into matched_entry, matched_count
  from pg_catalog.jsonb_array_elements(
    target_definition #> array['taxonomies', target_taxonomy_key]
  ) as entry(value)
  where entry.value ->> 'code' = pg_catalog.btrim(target_code);

  if matched_count <> 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  return matched_entry;
end;
$$;

revoke all on function private.stage01_taxonomy_entry(jsonb, text, text)
  from public, anon, authenticated;

create function private.stage01_bound_definition(
  target_company_id uuid,
  target_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bound_definition jsonb;
begin
  select definition.definition
  into bound_definition
  from public.workflow_instances as workflow
  join public.workflow_definition_snapshots as definition
    on definition.id = workflow.definition_snapshot_id
   and definition.tenant_id = workflow.tenant_id
   and definition.company_id = workflow.company_id
  where workflow.company_id = target_company_id
    and workflow.subject_type = 'opportunity'
    and workflow.subject_id = target_opportunity_id;

  if bound_definition is null then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  return bound_definition;
end;
$$;

revoke all on function private.stage01_bound_definition(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.assert_valid_stage01_definition(target_definition jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_dimensions constant jsonb := '["customer_need","scope_capability","resources_schedule","commercial_viability","risk_special_conditions"]'::jsonb;
  required_intake_gates constant jsonb := '["approved_minimum","duplicate_resolved","no_blocking_blocker"]'::jsonb;
  required_evaluation_gates constant jsonb := '["required_applicable_evaluated","recommendation_current","final_decision_recorded"]'::jsonb;
begin
  if target_definition is null or pg_catalog.jsonb_typeof(target_definition) <> 'object' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if pg_catalog.jsonb_typeof(target_definition -> 'nodes') is distinct from 'array'
     or pg_catalog.jsonb_typeof(target_definition -> 'dependencies') is distinct from 'array'
     or pg_catalog.jsonb_typeof(target_definition -> 'dimensions') is distinct from 'array'
     or pg_catalog.jsonb_typeof(target_definition -> 'taxonomies') is distinct from 'object'
     or pg_catalog.jsonb_typeof(target_definition -> 'criteria') is distinct from 'array'
     or pg_catalog.jsonb_typeof(target_definition -> 'capabilities') is distinct from 'object'
     or pg_catalog.jsonb_typeof(target_definition -> 'gates') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if pg_catalog.jsonb_array_length(target_definition -> 'nodes') <> 2
     or (select pg_catalog.count(distinct node ->> 'key')
         from pg_catalog.jsonb_array_elements(target_definition -> 'nodes') as node) <> 2
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(target_definition -> 'nodes') as node
       where pg_catalog.jsonb_typeof(node) <> 'object'
          or node ->> 'key' not in ('01.1', '01.2')
          or node ->> 'type' is distinct from 'sub_stage'
          or pg_catalog.jsonb_typeof(node -> 'parentNodeKey') is distinct from 'null'
     ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if pg_catalog.jsonb_array_length(target_definition -> 'dependencies') <> 1
     or not (target_definition -> 'dependencies') @> '[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}]'::jsonb
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(target_definition -> 'dependencies') as dependency
       where pg_catalog.jsonb_typeof(dependency) <> 'object'
          or dependency ->> 'from' is distinct from '01.1'
          or dependency ->> 'to' is distinct from '01.2'
          or dependency ->> 'requires' is distinct from 'completed_current_valid'
     ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if pg_catalog.jsonb_array_length(target_definition -> 'dimensions') <> 5
     or (select pg_catalog.count(distinct value)
         from pg_catalog.jsonb_array_elements_text(target_definition -> 'dimensions') as value) <> 5
     or not (target_definition -> 'dimensions') @> required_dimensions
     or not required_dimensions @> (target_definition -> 'dimensions') then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if not ((target_definition -> 'taxonomies') ?& array[
    'customer_type',
    'contact_relationship',
    'scope',
    'lead_source',
    'referrer_type',
    'engagement_status',
    'invalid_reason',
    'budget_status',
    'timeline_status',
    'priority',
    'intake_channel',
    'blocker_category'
  ]) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    where pg_catalog.jsonb_typeof(taxonomy.values_json) <> 'array'
       or pg_catalog.jsonb_array_length(taxonomy.values_json) = 0
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    cross join lateral pg_catalog.jsonb_array_elements(taxonomy.values_json) as taxonomy_value
    where pg_catalog.jsonb_typeof(taxonomy_value) <> 'object'
       or nullif(pg_catalog.btrim(taxonomy_value ->> 'code'), '') is null
       or nullif(pg_catalog.btrim(taxonomy_value ->> 'label'), '') is null
       or (
         taxonomy.taxonomy_key = 'lead_source'
         and taxonomy_value ? 'behavior'
         and (
           pg_catalog.jsonb_typeof(taxonomy_value -> 'behavior') <> 'object'
           or (
             (taxonomy_value -> 'behavior') ? 'requiresReferrer'
             and pg_catalog.jsonb_typeof(taxonomy_value #> '{behavior,requiresReferrer}') <> 'boolean'
           )
         )
       )
  ) or exists (
    select 1
    from pg_catalog.jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    cross join lateral pg_catalog.jsonb_array_elements(taxonomy.values_json) as taxonomy_value
    group by taxonomy.taxonomy_key, taxonomy_value ->> 'code'
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if pg_catalog.jsonb_array_length(target_definition -> 'criteria') < 5
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(target_definition -> 'criteria') as criterion
       where pg_catalog.jsonb_typeof(criterion) <> 'object'
          or nullif(pg_catalog.btrim(criterion ->> 'key'), '') is null
          or nullif(pg_catalog.btrim(criterion ->> 'label'), '') is null
          or nullif(pg_catalog.btrim(criterion ->> 'description'), '') is null
          or criterion ->> 'dimensionKey' not in (
            'customer_need',
            'scope_capability',
            'resources_schedule',
            'commercial_viability',
            'risk_special_conditions'
          )
          or criterion ->> 'criticality' not in ('required', 'optional', 'conditional')
          or criterion ->> 'applicabilityMode' not in ('always', 'manual')
          or pg_catalog.jsonb_typeof(criterion -> 'allowsNotApplicable') <> 'boolean'
          or case
            when pg_catalog.jsonb_typeof(criterion -> 'displayOrder') = 'number'
              then (criterion ->> 'displayOrder')::numeric < 0
            else true
          end
     )
     or (select pg_catalog.count(distinct criterion ->> 'key')
         from pg_catalog.jsonb_array_elements(target_definition -> 'criteria') as criterion)
        <> pg_catalog.jsonb_array_length(target_definition -> 'criteria')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements_text(required_dimensions) as required_dimension(dimension_key)
       where not exists (
         select 1
         from pg_catalog.jsonb_array_elements(target_definition -> 'criteria') as criterion
         where criterion ->> 'dimensionKey' = required_dimension.dimension_key
       )
     ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if not ((target_definition -> 'capabilities') ?& array[
    'intakeOwner',
    'evaluationOwner',
    'start',
    'complete',
    'decision'
  ]) or exists (
    select 1
    from pg_catalog.jsonb_each(target_definition -> 'capabilities') as capability(capability_key, permission_value)
    where pg_catalog.jsonb_typeof(capability.permission_value) <> 'string'
       or nullif(pg_catalog.btrim(capability.permission_value #>> '{}'), '') is null
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if pg_catalog.jsonb_typeof(target_definition #> '{gates,intake}') is distinct from 'array'
     or pg_catalog.jsonb_typeof(target_definition #> '{gates,evaluation}') is distinct from 'array'
     or not (target_definition #> '{gates,intake}') @> required_intake_gates
     or not (target_definition #> '{gates,evaluation}') @> required_evaluation_gates then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;
end;
$$;

revoke all on function private.assert_valid_stage01_definition(jsonb)
  from public, anon, authenticated;

create function private.assert_stage01_opportunity_taxonomies(
  target_company_id uuid,
  target_opportunity_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bound_definition jsonb;
  taxonomy_value record;
begin
  bound_definition := private.stage01_bound_definition(
    target_company_id, target_opportunity_id
  );

  for taxonomy_value in
    select values_to_check.taxonomy_key, values_to_check.supplied_code
    from (
      select 'customer_type'::text, opportunity.customer_type_code
      from public.opportunities as opportunity
      where opportunity.id = target_opportunity_id
        and opportunity.company_id = target_company_id
      union all
      select 'lead_source', opportunity.primary_lead_source_code
      from public.opportunities as opportunity
      where opportunity.id = target_opportunity_id
        and opportunity.company_id = target_company_id
      union all
      select 'engagement_status', opportunity.engagement_status_code
      from public.opportunities as opportunity
      where opportunity.id = target_opportunity_id
        and opportunity.company_id = target_company_id
      union all
      select 'budget_status', opportunity.budget_status_code
      from public.opportunities as opportunity
      where opportunity.id = target_opportunity_id
        and opportunity.company_id = target_company_id
      union all
      select 'timeline_status', opportunity.timeline_status_code
      from public.opportunities as opportunity
      where opportunity.id = target_opportunity_id
        and opportunity.company_id = target_company_id
      union all
      select 'priority', opportunity.priority_code
      from public.opportunities as opportunity
      where opportunity.id = target_opportunity_id
        and opportunity.company_id = target_company_id
      union all
      select 'contact_relationship', relationship.relationship_code
      from public.opportunity_contacts as relationship
      where relationship.opportunity_id = target_opportunity_id
        and relationship.company_id = target_company_id
      union all
      select 'scope', scope.scope_code
      from public.opportunity_scopes as scope
      where scope.opportunity_id = target_opportunity_id
        and scope.company_id = target_company_id
      union all
      select 'referrer_type', referrer.referrer_type_code
      from public.opportunity_referrers as referrer
      where referrer.opportunity_id = target_opportunity_id
        and referrer.company_id = target_company_id
      union all
      select 'intake_channel', intake.channel_code
      from public.opportunity_intake_records as intake
      where intake.opportunity_id = target_opportunity_id
        and intake.company_id = target_company_id
      union all
      select 'invalid_reason', opportunity.current_invalid_reason_code
      from public.opportunities as opportunity
      where opportunity.id = target_opportunity_id
        and opportunity.company_id = target_company_id
        and opportunity.current_invalid_reason_code is distinct from 'system_same_need_duplicate'
      union all
      select 'blocker_category', blocker.category_code
      from public.workflow_instances as workflow
      join public.workflow_node_instances as node
        on node.workflow_instance_id = workflow.id
       and node.tenant_id = workflow.tenant_id
       and node.company_id = workflow.company_id
      join public.workflow_node_executions as execution
        on execution.node_instance_id = node.id
       and execution.tenant_id = node.tenant_id
       and execution.company_id = node.company_id
      join public.workflow_blockers as blocker
        on blocker.node_execution_id = execution.id
       and blocker.tenant_id = execution.tenant_id
       and blocker.company_id = execution.company_id
      where workflow.subject_type = 'opportunity'
        and workflow.subject_id = target_opportunity_id
        and workflow.company_id = target_company_id
    ) as values_to_check(taxonomy_key, supplied_code)
    where nullif(pg_catalog.btrim(values_to_check.supplied_code), '') is not null
  loop
    perform private.stage01_taxonomy_entry(
      bound_definition,
      taxonomy_value.taxonomy_key,
      taxonomy_value.supplied_code
    );
  end loop;
end;
$$;

revoke all on function private.assert_stage01_opportunity_taxonomies(uuid, uuid)
  from public, anon, authenticated;

create function private.stage01_current_invalidation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transition_mode text;
  invalid_reason_entry jsonb;
  invalid_reason_semantic text;
begin
  if old.validity_state = 'valid' and new.validity_state = 'invalid' then
    transition_mode := pg_catalog.current_setting(
      'stage01.current_invalidation_mode', true
    );

    if transition_mode = 'same_need_duplicate' then
      if new.canonical_opportunity_id is null then
        raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
      end if;
      new.current_invalid_reason_code := 'system_same_need_duplicate';
      new.current_invalid_reason_semantic_key := 'duplicate_merged';
    elsif transition_mode = 'explicit_invalidation' then
      invalid_reason_entry := private.stage01_taxonomy_entry(
        private.stage01_bound_definition(new.company_id, new.id),
        'invalid_reason',
        pg_catalog.current_setting('stage01.current_invalid_reason_code', true)
      );
      invalid_reason_semantic := nullif(
        pg_catalog.btrim(invalid_reason_entry ->> 'semanticKey'), ''
      );
      if invalid_reason_semantic is null
         or (invalid_reason_semantic = 'duplicate_merged'
             and new.canonical_opportunity_id is null) then
        raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
      end if;
      new.current_invalid_reason_code := invalid_reason_entry ->> 'code';
      new.current_invalid_reason_semantic_key := invalid_reason_semantic;
    else
      raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
    end if;

    new.current_invalidation_reason := nullif(
      pg_catalog.btrim(
        pg_catalog.current_setting('stage01.current_invalidation_reason', true)
      ), ''
    );
    new.invalidated_by := auth.uid();
    new.invalidated_at := pg_catalog.statement_timestamp();

    if new.current_invalidation_reason is null or new.invalidated_by is null then
      raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.stage01_current_invalidation_guard()
  from public, anon, authenticated;

create trigger opportunities_current_invalidation_guard
  before update of validity_state, canonical_opportunity_id
  on public.opportunities
  for each row
  execute function private.stage01_current_invalidation_guard();

create or replace function private.resolve_opportunity_duplicate(
  target_company_id uuid,
  target_opportunity_id uuid,
  target_concern_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  command_result jsonb;
begin
  if target_input ->> 'resolution' = 'same_need' then
    perform pg_catalog.set_config(
      'stage01.current_invalidation_mode', 'same_need_duplicate', true
    );
    perform pg_catalog.set_config(
      'stage01.current_invalidation_reason',
      coalesce(target_input ->> 'resolutionNote', ''), true
    );
  end if;

  command_result := private.execute_stage01_workflow_command(
    'resolve_duplicate', target_company_id, target_opportunity_id,
    target_concern_id, target_input, target_request_id
  );

  perform pg_catalog.set_config('stage01.current_invalidation_mode', '', true);
  perform pg_catalog.set_config('stage01.current_invalidation_reason', '', true);
  return command_result;
end;
$$;

create or replace function private.invalidate_opportunity(
  target_company_id uuid,
  target_opportunity_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  command_result jsonb;
begin
  perform pg_catalog.set_config(
    'stage01.current_invalidation_mode', 'explicit_invalidation', true
  );
  perform pg_catalog.set_config(
    'stage01.current_invalid_reason_code',
    coalesce(target_input ->> 'invalidReasonCode', ''), true
  );
  perform pg_catalog.set_config(
    'stage01.current_invalidation_reason',
    coalesce(target_input ->> 'reason', ''), true
  );

  command_result := private.execute_stage01_workflow_command(
    'invalidate_opportunity', target_company_id, target_opportunity_id,
    null, target_input, target_request_id
  );

  perform pg_catalog.set_config('stage01.current_invalidation_mode', '', true);
  perform pg_catalog.set_config('stage01.current_invalid_reason_code', '', true);
  perform pg_catalog.set_config('stage01.current_invalidation_reason', '', true);
  return command_result;
end;
$$;

with invalidation_candidates as (
  select
    opportunity.id as opportunity_id,
    audit.created_at as transition_at,
    'audit:' || audit.id::text as transition_key,
    audit.after_summary ->> 'invalidReasonCode' as reason_code,
    invalid_reason.entry ->> 'semanticKey' as semantic_key,
    audit.after_summary ->> 'reason' as transition_reason,
    audit.actor_id,
    audit.created_at as invalidated_at
  from public.opportunities as opportunity
  join public.audit_events as audit
    on audit.company_id = opportunity.company_id
   and audit.action = 'opportunity.invalidated'
   and audit.resource_type = 'opportunity'
   and audit.resource_id = opportunity.id::text
  join public.workflow_instances as workflow
    on workflow.company_id = opportunity.company_id
   and workflow.subject_type = 'opportunity'
   and workflow.subject_id = opportunity.id
  join public.workflow_definition_snapshots as definition
    on definition.id = workflow.definition_snapshot_id
   and definition.tenant_id = workflow.tenant_id
   and definition.company_id = workflow.company_id
  cross join lateral (
    select private.stage01_taxonomy_entry(
      definition.definition,
      'invalid_reason',
      audit.after_summary ->> 'invalidReasonCode'
    ) as entry
  ) as invalid_reason
  where opportunity.validity_state = 'invalid'

  union all

  select
    opportunity.id,
    concern.resolved_at,
    'duplicate:' || concern.id::text,
    'system_same_need_duplicate',
    'duplicate_merged',
    concern.resolution_note,
    concern.resolved_by,
    concern.resolved_at
  from public.opportunities as opportunity
  join public.opportunity_duplicate_concerns as concern
    on concern.opportunity_id = opportunity.id
   and concern.company_id = opportunity.company_id
   and concern.resolution = 'same_need'
   and concern.canonical_opportunity_id = opportunity.canonical_opportunity_id
  where opportunity.validity_state = 'invalid'
), ranked_candidates as (
  select
    candidate.*,
    pg_catalog.row_number() over (
      partition by candidate.opportunity_id
      order by candidate.transition_at desc, candidate.transition_key desc
    ) as candidate_rank
  from invalidation_candidates as candidate
)
update public.opportunities as opportunity
set current_invalid_reason_code = candidate.reason_code,
    current_invalid_reason_semantic_key = candidate.semantic_key,
    current_invalidation_reason = candidate.transition_reason,
    invalidated_by = candidate.actor_id,
    invalidated_at = candidate.invalidated_at
from ranked_candidates as candidate
where candidate.candidate_rank = 1
  and opportunity.id = candidate.opportunity_id
  and opportunity.validity_state = 'invalid';

do $$
declare
  unresolved_ids text;
begin
  select pg_catalog.string_agg(opportunity.id::text, ',' order by opportunity.id)
  into unresolved_ids
  from public.opportunities as opportunity
  where opportunity.validity_state = 'invalid'
    and (
      nullif(pg_catalog.btrim(opportunity.current_invalid_reason_code), '') is null
      or nullif(pg_catalog.btrim(opportunity.current_invalid_reason_semantic_key), '') is null
      or nullif(pg_catalog.btrim(opportunity.current_invalidation_reason), '') is null
      or opportunity.invalidated_by is null
      or opportunity.invalidated_at is null
      or (
        opportunity.current_invalid_reason_semantic_key = 'duplicate_merged'
        and opportunity.canonical_opportunity_id is null
      )
    );

  if unresolved_ids is not null then
    raise exception using
      errcode = 'P0001',
      message = 'STAGE01_INVALIDATION_METADATA_BACKFILL_REQUIRED',
      detail = unresolved_ids;
  end if;
end;
$$;

alter table public.opportunities
  add constraint opportunities_invalidated_by_fk
    foreign key (invalidated_by)
    references auth.users (id)
    on delete restrict
    not valid,
  add constraint opportunities_current_invalidation_check
    check (
      (
        validity_state = 'valid'
        and canonical_opportunity_id is null
        and current_invalid_reason_code is null
        and current_invalid_reason_semantic_key is null
        and current_invalidation_reason is null
        and invalidated_by is null
        and invalidated_at is null
      )
      or
      (
        validity_state = 'invalid'
        and nullif(pg_catalog.btrim(current_invalid_reason_code), '') is not null
        and nullif(pg_catalog.btrim(current_invalid_reason_semantic_key), '') is not null
        and nullif(pg_catalog.btrim(current_invalidation_reason), '') is not null
        and invalidated_by is not null
        and invalidated_at is not null
        and (
          current_invalid_reason_semantic_key <> 'duplicate_merged'
          or canonical_opportunity_id is not null
        )
      )
    ) not valid;

alter table public.opportunities
  validate constraint opportunities_invalidated_by_fk;

alter table public.opportunities
  validate constraint opportunities_current_invalidation_check;

create or replace function private.restore_opportunity(
  target_company_id uuid,
  target_opportunity_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  context jsonb;
  actor_id uuid;
  tenant_id uuid;
  opportunity_version bigint;
  current_validity text;
  current_canonical_id uuid;
  current_reason_code text;
  current_semantic_key text;
  current_reason text;
  current_invalidated_by uuid;
  current_invalidated_at timestamptz;
  old_summary jsonb;
  new_summary jsonb;
  supplied_evidence jsonb;
begin
  context := private.stage01_actor_context(
    target_company_id, 'opportunity.restore'
  );
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  perform private.assert_stage01_command_keys(
    target_input, array['reason', 'evidence', 'expectedOpportunityVersion']
  );
  perform private.assert_stage01_required_keys(
    target_input, array['reason', 'expectedOpportunityVersion']
  );
  if nullif(pg_catalog.btrim(target_input ->> 'reason'), '') is null
     or (
       target_input ? 'evidence'
       and pg_catalog.jsonb_typeof(target_input -> 'evidence') is distinct from 'array'
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  select
    opportunity.version,
    opportunity.validity_state,
    opportunity.canonical_opportunity_id,
    opportunity.current_invalid_reason_code,
    opportunity.current_invalid_reason_semantic_key,
    opportunity.current_invalidation_reason,
    opportunity.invalidated_by,
    opportunity.invalidated_at,
    pg_catalog.to_jsonb(opportunity)
  into
    opportunity_version,
    current_validity,
    current_canonical_id,
    current_reason_code,
    current_semantic_key,
    current_reason,
    current_invalidated_by,
    current_invalidated_at,
    old_summary
  from public.opportunities as opportunity
  where opportunity.id = target_opportunity_id
    and opportunity.tenant_id = tenant_id
    and opportunity.company_id = target_company_id
  for update;

  if opportunity_version is null then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if opportunity_version is distinct from
     (target_input ->> 'expectedOpportunityVersion')::bigint then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if current_validity <> 'invalid'
     or nullif(pg_catalog.btrim(current_reason_code), '') is null
     or nullif(pg_catalog.btrim(current_semantic_key), '') is null
     or nullif(pg_catalog.btrim(current_reason), '') is null
     or current_invalidated_by is null
     or current_invalidated_at is null then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  supplied_evidence := target_input -> 'evidence';
  if current_semantic_key = 'duplicate_merged' then
    if current_canonical_id is null
       or pg_catalog.jsonb_typeof(supplied_evidence) is distinct from 'array'
       or pg_catalog.jsonb_array_length(supplied_evidence) = 0 then
      raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
    end if;
  elsif current_canonical_id is not null then
    raise exception using errcode = 'P0001', message = 'STAGE01_INVALID_VALIDITY_TRANSITION';
  end if;

  update public.opportunities as opportunity
  set validity_state = 'valid',
      canonical_opportunity_id = null,
      current_invalid_reason_code = null,
      current_invalid_reason_semantic_key = null,
      current_invalidation_reason = null,
      invalidated_by = null,
      invalidated_at = null,
      version = opportunity.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where opportunity.id = target_opportunity_id
    and opportunity.tenant_id = tenant_id
    and opportunity.company_id = target_company_id
  returning opportunity.version, pg_catalog.to_jsonb(opportunity)
  into opportunity_version, new_summary;

  perform private.write_stage01_audit(
    tenant_id, target_company_id, actor_id,
    'opportunity.restored', 'opportunity', target_opportunity_id::text,
    target_request_id, old_summary,
    new_summary || pg_catalog.jsonb_build_object(
      'reason', pg_catalog.btrim(target_input ->> 'reason'),
      'evidence', supplied_evidence,
      'restoredInvalidReasonCode', current_reason_code,
      'restoredInvalidReasonSemanticKey', current_semantic_key
    )
  );

  return pg_catalog.jsonb_build_object(
    'opportunityId', target_opportunity_id,
    'validityState', 'valid',
    'opportunityVersion', opportunity_version
  );
end;
$$;

create function private.stage01_node_execution_acceptance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_opportunity_id uuid;
  target_node_key text;
begin
  if old.phase = 'active' and new.phase = 'completed' then
    select workflow.subject_id, node.node_key
    into target_opportunity_id, target_node_key
    from public.workflow_node_instances as node
    join public.workflow_instances as workflow
      on workflow.id = node.workflow_instance_id
     and workflow.tenant_id = node.tenant_id
     and workflow.company_id = node.company_id
    where node.id = new.node_instance_id
      and node.tenant_id = new.tenant_id
      and node.company_id = new.company_id
      and workflow.subject_type = 'opportunity';

    if target_node_key = '01.1' then
      perform private.assert_stage01_opportunity_taxonomies(
        new.company_id, target_opportunity_id
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.stage01_node_execution_acceptance_guard()
  from public, anon, authenticated;

create trigger workflow_node_executions_stage01_acceptance_guard
  before update of phase
  on public.workflow_node_executions
  for each row
  execute function private.stage01_node_execution_acceptance_guard();

create function private.stage01_node_event_acceptance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_json jsonb;
  completed_at timestamptz;
begin
  if new.event_type = 'revalidated' then
    evidence_json := new.payload -> 'evidence';
    if pg_catalog.jsonb_typeof(evidence_json) is distinct from 'array'
       or pg_catalog.jsonb_array_length(evidence_json) = 0 then
      raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
    end if;
  elsif new.event_type = 'completed' then
    select execution.completed_at
    into completed_at
    from public.workflow_node_executions as execution
    where execution.id = new.node_execution_id
      and execution.tenant_id = new.tenant_id
      and execution.company_id = new.company_id;

    if completed_at is not null then
      new.payload := new.payload || pg_catalog.jsonb_build_object(
        'completedAt', completed_at
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.stage01_node_event_acceptance_guard()
  from public, anon, authenticated;

create trigger workflow_node_events_stage01_acceptance_guard
  before insert
  on public.workflow_node_events
  for each row
  execute function private.stage01_node_event_acceptance_guard();

create function private.stage01_baseline_snapshot_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  select
    pg_catalog.jsonb_build_object(
      'id', opportunity.id,
      'primaryCustomerName', opportunity.primary_customer_name,
      'customerTypeCode', opportunity.customer_type_code,
      'needDescription', opportunity.need_description,
      'locationStatus', opportunity.location_status,
      'primaryLeadSourceCode', opportunity.primary_lead_source_code,
      'engagementStatusCode', opportunity.engagement_status_code
    ),
    opportunity.version
  into opportunity_json, completion_opportunity_version
  from public.opportunities as opportunity
  where opportunity.id = new.opportunity_id
    and opportunity.tenant_id = new.tenant_id
    and opportunity.company_id = new.company_id;

  select pg_catalog.jsonb_build_object(
    'relationshipId', relationship.id,
    'contactId', relationship.contact_id,
    'relationshipCode', relationship.relationship_code
  )
  into primary_contact_json
  from public.opportunity_contacts as relationship
  where relationship.opportunity_id = new.opportunity_id
    and relationship.tenant_id = new.tenant_id
    and relationship.company_id = new.company_id
    and relationship.is_primary
    and relationship.ended_at is null;

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
  from public.opportunity_contacts as relationship
  join public.contact_methods as method
    on method.contact_id = relationship.contact_id
   and method.tenant_id = relationship.tenant_id
   and method.company_id = relationship.company_id
  where relationship.opportunity_id = new.opportunity_id
    and relationship.tenant_id = new.tenant_id
    and relationship.company_id = new.company_id
    and relationship.is_primary
    and relationship.ended_at is null
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
  where scope.opportunity_id = new.opportunity_id
    and scope.tenant_id = new.tenant_id
    and scope.company_id = new.company_id
    and scope.retired_at is null;

  select pg_catalog.jsonb_build_object(
    'referrerId', referrer.id,
    'referrerTypeCode', referrer.referrer_type_code,
    'contactId', referrer.contact_id,
    'displayName', referrer.display_name
  )
  into primary_referrer_json
  from public.opportunity_referrers as referrer
  where referrer.opportunity_id = new.opportunity_id
    and referrer.tenant_id = new.tenant_id
    and referrer.company_id = new.company_id
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
  where intake.opportunity_id = new.opportunity_id
    and intake.tenant_id = new.tenant_id
    and intake.company_id = new.company_id;

  select pg_catalog.jsonb_build_object(
    'assignmentId', assignment.id,
    'assigneeUserId', assignment.assignee_user_id,
    'assignedAt', assignment.created_at
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

create trigger stage01_intake_baselines_snapshot_v1
  before insert
  on public.stage01_intake_completion_baselines
  for each row
  execute function private.stage01_baseline_snapshot_v1();

create function private.stage01_audit_acceptance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_opportunity_id uuid;
  target_execution_id uuid;
  evidence_json jsonb;
  completed_at timestamptz;
begin
  if new.action = 'journey.node_revalidated' then
    target_execution_id := new.resource_id::uuid;
    select event.payload -> 'evidence'
    into evidence_json
    from public.workflow_node_events as event
    where event.company_id = new.company_id
      and event.node_execution_id = target_execution_id
      and event.event_type = 'revalidated'
      and event.request_id = new.request_id;
    new.after_summary := new.after_summary || pg_catalog.jsonb_build_object(
      'evidence', evidence_json
    );
  elsif new.action = 'journey.intake_completed' then
    target_execution_id := new.resource_id::uuid;
    select execution.completed_at
    into completed_at
    from public.workflow_node_executions as execution
    where execution.id = target_execution_id
      and execution.company_id = new.company_id;
    new.after_summary := new.after_summary || pg_catalog.jsonb_build_object(
      'completedAt', completed_at
    );
  end if;

  if new.action in ('opportunity.created', 'opportunity.updated', 'opportunity.invalidated') then
    target_opportunity_id := new.resource_id::uuid;
  elsif new.action in (
    'opportunity.contact_linked',
    'opportunity.primary_contact_changed',
    'opportunity.scope_added',
    'opportunity.referrer_added',
    'opportunity.primary_referrer_changed',
    'opportunity.intake_record_added',
    'opportunity.intake_record_corrected',
    'opportunity.duplicate_resolved'
  ) then
    target_opportunity_id := (new.after_summary ->> 'opportunityId')::uuid;
  elsif new.action = 'journey.blocker_raised' then
    target_execution_id := (new.after_summary ->> 'nodeExecutionId')::uuid;
    select workflow.subject_id
    into target_opportunity_id
    from public.workflow_node_executions as execution
    join public.workflow_node_instances as node
      on node.id = execution.node_instance_id
     and node.tenant_id = execution.tenant_id
     and node.company_id = execution.company_id
    join public.workflow_instances as workflow
      on workflow.id = node.workflow_instance_id
     and workflow.tenant_id = node.tenant_id
     and workflow.company_id = node.company_id
    where execution.id = target_execution_id
      and execution.company_id = new.company_id
      and workflow.subject_type = 'opportunity';
  end if;

  if target_opportunity_id is not null then
    perform private.assert_stage01_opportunity_taxonomies(
      new.company_id, target_opportunity_id
    );
  end if;

  return new;
end;
$$;

revoke all on function private.stage01_audit_acceptance_guard()
  from public, anon, authenticated;

create trigger audit_events_stage01_acceptance_guard
  before insert
  on public.audit_events
  for each row
  execute function private.stage01_audit_acceptance_guard();
