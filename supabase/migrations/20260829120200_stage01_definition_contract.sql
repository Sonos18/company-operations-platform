create function private.assert_valid_stage01_definition(target_definition jsonb)
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
  if target_definition is null or jsonb_typeof(target_definition) <> 'object' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_typeof(target_definition -> 'nodes') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'dependencies') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'dimensions') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'taxonomies') is distinct from 'object'
     or jsonb_typeof(target_definition -> 'criteria') is distinct from 'array'
     or jsonb_typeof(target_definition -> 'capabilities') is distinct from 'object'
     or jsonb_typeof(target_definition -> 'gates') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_array_length(target_definition -> 'nodes') <> 2
     or (select count(distinct node ->> 'key') from jsonb_array_elements(target_definition -> 'nodes') as node) <> 2
     or exists (
       select 1
       from jsonb_array_elements(target_definition -> 'nodes') as node
       where jsonb_typeof(node) <> 'object'
          or node ->> 'key' not in ('01.1', '01.2')
          or node ->> 'type' is distinct from 'sub_stage'
          or jsonb_typeof(node -> 'parentNodeKey') is distinct from 'null'
     ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_array_length(target_definition -> 'dependencies') <> 1
     or not (target_definition -> 'dependencies') @> '[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}]'::jsonb
     or exists (
       select 1
       from jsonb_array_elements(target_definition -> 'dependencies') as dependency
       where jsonb_typeof(dependency) <> 'object'
          or dependency ->> 'from' is distinct from '01.1'
          or dependency ->> 'to' is distinct from '01.2'
          or dependency ->> 'requires' is distinct from 'completed_current_valid'
     ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_array_length(target_definition -> 'dimensions') <> 5
     or (select count(distinct value) from jsonb_array_elements_text(target_definition -> 'dimensions') as value) <> 5
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
    'invalid_reason'
  ]) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    where jsonb_typeof(taxonomy.values_json) <> 'array'
       or jsonb_array_length(taxonomy.values_json) = 0
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    cross join lateral jsonb_array_elements(taxonomy.values_json) as taxonomy_value
    where jsonb_typeof(taxonomy_value) <> 'object'
       or nullif(btrim(taxonomy_value ->> 'code'), '') is null
       or nullif(btrim(taxonomy_value ->> 'label'), '') is null
       or (
         taxonomy.taxonomy_key = 'lead_source'
         and taxonomy_value ? 'behavior'
         and (
           jsonb_typeof(taxonomy_value -> 'behavior') <> 'object'
           or (
             (taxonomy_value -> 'behavior') ? 'requiresReferrer'
             and jsonb_typeof(taxonomy_value #> '{behavior,requiresReferrer}') <> 'boolean'
           )
         )
       )
  ) or exists (
    select 1
    from jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
    cross join lateral jsonb_array_elements(taxonomy.values_json) as taxonomy_value
    group by taxonomy.taxonomy_key, taxonomy_value ->> 'code'
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_array_length(target_definition -> 'criteria') < 5
     or exists (
       select 1
       from jsonb_array_elements(target_definition -> 'criteria') as criterion
       where jsonb_typeof(criterion) <> 'object'
          or nullif(btrim(criterion ->> 'key'), '') is null
          or nullif(btrim(criterion ->> 'label'), '') is null
          or nullif(btrim(criterion ->> 'description'), '') is null
          or criterion ->> 'dimensionKey' not in (
            'customer_need',
            'scope_capability',
            'resources_schedule',
            'commercial_viability',
            'risk_special_conditions'
          )
          or criterion ->> 'criticality' not in ('required', 'optional', 'conditional')
          or criterion ->> 'applicabilityMode' not in ('always', 'manual')
          or jsonb_typeof(criterion -> 'allowsNotApplicable') <> 'boolean'
          or case
            when jsonb_typeof(criterion -> 'displayOrder') = 'number'
              then (criterion ->> 'displayOrder')::numeric < 0
            else true
          end
     )
     or (select count(distinct criterion ->> 'key') from jsonb_array_elements(target_definition -> 'criteria') as criterion)
        <> jsonb_array_length(target_definition -> 'criteria')
     or exists (
       select 1
       from jsonb_array_elements_text(required_dimensions) as required_dimension(dimension_key)
       where not exists (
         select 1
         from jsonb_array_elements(target_definition -> 'criteria') as criterion
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
    from jsonb_each(target_definition -> 'capabilities') as capability(capability_key, permission_value)
    where jsonb_typeof(capability.permission_value) <> 'string'
       or nullif(btrim(capability.permission_value #>> '{}'), '') is null
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if jsonb_typeof(target_definition #> '{gates,intake}') is distinct from 'array'
     or jsonb_typeof(target_definition #> '{gates,evaluation}') is distinct from 'array'
     or not (target_definition #> '{gates,intake}') @> required_intake_gates
     or not (target_definition #> '{gates,evaluation}') @> required_evaluation_gates then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;
end;
$$;

revoke all on function private.assert_valid_stage01_definition(jsonb) from public, anon, authenticated;
