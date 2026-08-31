create function private.assert_stage01_config_taxonomies(
  target_taxonomies jsonb,
  allow_semantic_key boolean
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  taxonomy_keys constant text[] := array[
    'customer_type', 'contact_relationship', 'scope', 'lead_source',
    'referrer_type', 'engagement_status', 'invalid_reason', 'budget_status',
    'timeline_status', 'priority', 'intake_channel', 'blocker_category'
  ];
begin
  if target_taxonomies is null
     or pg_catalog.jsonb_typeof(target_taxonomies) <> 'object'
     or not (target_taxonomies ?& taxonomy_keys)
     or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(target_taxonomies)) <> 12 then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(target_taxonomies) as taxonomy(taxonomy_key, values_json)
    where pg_catalog.jsonb_typeof(taxonomy.values_json) <> 'array'
       or pg_catalog.jsonb_array_length(taxonomy.values_json) = 0
  ) or exists (
    select 1
    from pg_catalog.jsonb_each(target_taxonomies) as taxonomy(taxonomy_key, values_json)
    cross join lateral pg_catalog.jsonb_array_elements(taxonomy.values_json) as entry(value)
    where pg_catalog.jsonb_typeof(entry.value) <> 'object'
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(target_taxonomies) as taxonomy(taxonomy_key, values_json)
    cross join lateral pg_catalog.jsonb_array_elements(taxonomy.values_json) as entry(value)
    where not (entry.value ?& array['code', 'label'])
       or exists (
         select 1
         from pg_catalog.jsonb_object_keys(entry.value) as supplied(key)
         where not (
           supplied.key = any(
             case
               when taxonomy.taxonomy_key = 'lead_source' and allow_semantic_key
                 then array['code', 'label', 'behavior', 'semanticKey']
               when taxonomy.taxonomy_key = 'lead_source'
                 then array['code', 'label', 'behavior']
               when allow_semantic_key
                 then array['code', 'label', 'semanticKey']
               else array['code', 'label']
             end
           )
         )
       )
       or nullif(pg_catalog.btrim(entry.value ->> 'code'), '') is null
       or nullif(pg_catalog.btrim(entry.value ->> 'label'), '') is null
       or (
         entry.value ? 'semanticKey'
         and (
           not allow_semantic_key
           or pg_catalog.jsonb_typeof(entry.value -> 'semanticKey') <> 'string'
           or nullif(pg_catalog.btrim(entry.value ->> 'semanticKey'), '') is null
         )
       )
       or (
         taxonomy.taxonomy_key <> 'lead_source'
         and entry.value ? 'behavior'
       )
       or (
         taxonomy.taxonomy_key = 'lead_source'
         and entry.value ? 'behavior'
         and (
           pg_catalog.jsonb_typeof(entry.value -> 'behavior') <> 'object'
           or exists (
             select 1
             from pg_catalog.jsonb_object_keys(entry.value -> 'behavior') as behavior_key(key)
             where behavior_key.key <> 'requiresReferrer'
           )
           or (
             entry.value -> 'behavior' ? 'requiresReferrer'
             and pg_catalog.jsonb_typeof(entry.value #> '{behavior,requiresReferrer}') <> 'boolean'
           )
         )
       )
  ) or exists (
    select 1
    from pg_catalog.jsonb_each(target_taxonomies) as taxonomy(taxonomy_key, values_json)
    cross join lateral pg_catalog.jsonb_array_elements(taxonomy.values_json) as entry(value)
    group by taxonomy.taxonomy_key, entry.value ->> 'code'
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;
end;
$$;

create function private.assert_stage01_config_criteria(target_criteria jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  required_dimensions constant text[] := array[
    'customer_need', 'scope_capability', 'resources_schedule',
    'commercial_viability', 'risk_special_conditions'
  ];
  allowed_criteria_keys constant text[] := array[
    'key', 'dimensionKey', 'label', 'description', 'criticality',
    'applicabilityMode', 'allowsNotApplicable', 'displayOrder'
  ];
begin
  if target_criteria is null
     or pg_catalog.jsonb_typeof(target_criteria) <> 'array'
     or pg_catalog.jsonb_array_length(target_criteria) < 5
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(target_criteria) as criterion(value)
       where pg_catalog.jsonb_typeof(criterion.value) <> 'object'
     ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_criteria) as criterion(value)
    where not (criterion.value ?& allowed_criteria_keys)
       or exists (
         select 1
         from pg_catalog.jsonb_object_keys(criterion.value) as supplied(key)
         where not (supplied.key = any(allowed_criteria_keys))
       )
       or nullif(pg_catalog.btrim(criterion.value ->> 'key'), '') is null
       or nullif(pg_catalog.btrim(criterion.value ->> 'label'), '') is null
       or nullif(pg_catalog.btrim(criterion.value ->> 'description'), '') is null
       or criterion.value ->> 'dimensionKey' <> all(required_dimensions)
       or criterion.value ->> 'criticality' not in ('required', 'optional', 'conditional')
       or criterion.value ->> 'applicabilityMode' not in ('always', 'manual')
       or pg_catalog.jsonb_typeof(criterion.value -> 'allowsNotApplicable') <> 'boolean'
       or pg_catalog.jsonb_typeof(criterion.value -> 'displayOrder') <> 'number'
       or not (criterion.value ->> 'displayOrder' ~ '^(0|[1-9][0-9]*)$')
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_criteria) as criterion(value)
    group by criterion.value ->> 'key'
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from unnest(required_dimensions) as required(dimension_key)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(target_criteria) as criterion(value)
      where criterion.value ->> 'dimensionKey' = required.dimension_key
    )
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;
end;
$$;

create function private.assert_stage01_config_business_input(
  target_taxonomies jsonb,
  target_criteria jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  perform private.assert_stage01_config_taxonomies(target_taxonomies, false);
  perform private.assert_stage01_config_criteria(target_criteria);
end;
$$;

create function private.assert_valid_stage01_config_definition(target_definition jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if target_definition is null
     or pg_catalog.jsonb_typeof(target_definition) <> 'object' then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  perform private.assert_stage01_config_taxonomies(target_definition -> 'taxonomies', true);
  perform private.assert_stage01_config_criteria(target_definition -> 'criteria');
  perform private.assert_valid_stage01_definition(target_definition);
end;
$$;

create function private.merge_stage01_config_taxonomies(
  target_base_definition jsonb,
  target_business_taxonomies jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  taxonomy_keys constant text[] := array[
    'customer_type', 'contact_relationship', 'scope', 'lead_source',
    'referrer_type', 'engagement_status', 'invalid_reason', 'budget_status',
    'timeline_status', 'priority', 'intake_channel', 'blocker_category'
  ];
  taxonomy_key text;
  merged_taxonomies jsonb := '{}'::jsonb;
  merged_values jsonb;
begin
  perform private.assert_stage01_config_business_input(
    target_business_taxonomies,
    target_base_definition -> 'criteria'
  );

  if exists (
    select 1
    from pg_catalog.jsonb_each(target_base_definition -> 'taxonomies') as base_taxonomy(taxonomy_key, values_json)
    cross join lateral pg_catalog.jsonb_array_elements(base_taxonomy.values_json) as base_entry(value)
    where base_entry.value ? 'semanticKey'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          target_business_taxonomies -> base_taxonomy.taxonomy_key
        ) as proposed_entry(value)
        where proposed_entry.value ->> 'code' = base_entry.value ->> 'code'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  foreach taxonomy_key in array taxonomy_keys loop
    select pg_catalog.jsonb_agg(
      case
        when reserved_entry.value is null then proposed_entry.value
        else proposed_entry.value || pg_catalog.jsonb_build_object(
          'semanticKey', reserved_entry.value -> 'semanticKey'
        )
      end
      order by proposed_entry.ordinality
    )
    into merged_values
    from pg_catalog.jsonb_array_elements(
      target_business_taxonomies -> taxonomy_key
    ) with ordinality as proposed_entry(value, ordinality)
    left join lateral (
      select base_entry.value
      from pg_catalog.jsonb_array_elements(
        target_base_definition #> array['taxonomies', taxonomy_key]
      ) as base_entry(value)
      where base_entry.value ->> 'code' = proposed_entry.value ->> 'code'
        and base_entry.value ? 'semanticKey'
      limit 1
    ) as reserved_entry on true;

    merged_taxonomies := merged_taxonomies || pg_catalog.jsonb_build_object(
      taxonomy_key, merged_values
    );
  end loop;

  return merged_taxonomies;
end;
$$;

create function private.assert_stage01_config_reserved_identity(
  target_base_definition jsonb,
  target_candidate_definition jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from pg_catalog.jsonb_each(target_base_definition -> 'taxonomies') as base_taxonomy(taxonomy_key, values_json)
    cross join lateral pg_catalog.jsonb_array_elements(base_taxonomy.values_json) as base_entry(value)
    where base_entry.value ? 'semanticKey'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          target_candidate_definition #> array['taxonomies', base_taxonomy.taxonomy_key]
        ) as candidate_entry(value)
        where candidate_entry.value ->> 'code' = base_entry.value ->> 'code'
          and candidate_entry.value ->> 'semanticKey' = base_entry.value ->> 'semanticKey'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;
end;
$$;

create function private.assert_stage01_config_criterion_identity(
  target_base_definition jsonb,
  target_candidate_definition jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(target_base_definition -> 'criteria') as base_criterion(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(target_candidate_definition -> 'criteria') as candidate_criterion(value)
      where candidate_criterion.value ->> 'key' = base_criterion.value ->> 'key'
    )
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;
end;
$$;

create function private.stage01_config_business_taxonomies(target_taxonomies jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_object_agg(
    taxonomy.taxonomy_key,
    entries.values_json
  )
  from pg_catalog.jsonb_each(target_taxonomies) as taxonomy(taxonomy_key, source_values)
  cross join lateral (
    select pg_catalog.jsonb_agg(entry.value - 'semanticKey' order by entry.ordinality) as values_json
    from pg_catalog.jsonb_array_elements(taxonomy.source_values)
      with ordinality as entry(value, ordinality)
  ) as entries;
$$;

create function private.stage01_config_draft_result(
  target_draft public.workflow_definition_drafts
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', target_draft.id,
    'baseSnapshotId', target_draft.base_snapshot_id,
    'version', target_draft.version,
    'createdBy', target_draft.created_by,
    'createdAt', target_draft.created_at,
    'updatedBy', target_draft.updated_by,
    'updatedAt', target_draft.updated_at,
    'taxonomies', private.stage01_config_business_taxonomies(
      target_draft.definition -> 'taxonomies'
    ),
    'criteria', target_draft.definition -> 'criteria'
  );
$$;

create function private.stage01_config_expected_draft_version(target_input jsonb)
returns bigint
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  version_text text;
begin
  version_text := target_input ->> 'expectedDraftVersion';
  if pg_catalog.jsonb_typeof(target_input -> 'expectedDraftVersion') <> 'number'
     or version_text !~ '^(0|[1-9][0-9]*)$' then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;
  return version_text::bigint;
end;
$$;

create function private.sync_stage01_config_taxonomy_values(
  target_tenant_id uuid,
  target_company_id uuid,
  target_definition jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  taxonomy_keys constant text[] := array[
    'customer_type', 'contact_relationship', 'scope', 'lead_source',
    'referrer_type', 'engagement_status', 'invalid_reason', 'budget_status',
    'timeline_status', 'priority', 'intake_channel', 'blocker_category'
  ];
begin
  insert into public.stage01_taxonomy_values (
    tenant_id, company_id, taxonomy_key, code, label, semantic_key,
    behavior, is_active, updated_at
  )
  select
    target_tenant_id,
    target_company_id,
    taxonomy.taxonomy_key,
    entry.value ->> 'code',
    entry.value ->> 'label',
    entry.value ->> 'semanticKey',
    coalesce(entry.value -> 'behavior', '{}'::jsonb),
    true,
    pg_catalog.statement_timestamp()
  from pg_catalog.jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
  cross join lateral pg_catalog.jsonb_array_elements(taxonomy.values_json) as entry(value)
  on conflict (company_id, taxonomy_key, code) do update
    set label = excluded.label,
        semantic_key = excluded.semantic_key,
        behavior = excluded.behavior,
        is_active = true,
        updated_at = excluded.updated_at;

  update public.stage01_taxonomy_values as catalog
     set is_active = false,
         updated_at = pg_catalog.statement_timestamp()
   where catalog.tenant_id = target_tenant_id
     and catalog.company_id = target_company_id
     and catalog.taxonomy_key = any(taxonomy_keys)
     and catalog.semantic_key is null
     and catalog.is_active
     and not exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         target_definition #> array['taxonomies', catalog.taxonomy_key]
       ) as published_entry(value)
       where published_entry.value ->> 'code' = catalog.code
     );
end;
$$;

create function private.create_stage01_config_draft(
  target_company_id uuid,
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
  expected_snapshot_id uuid;
  latest_snapshot_id uuid;
  latest_definition jsonb;
  draft_row public.workflow_definition_drafts%rowtype;
begin
  if target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;
  perform private.assert_stage01_command_keys(
    target_input, array['expectedPublishedSnapshotId']
  );
  perform private.assert_stage01_required_keys(
    target_input, array['expectedPublishedSnapshotId']
  );
  if pg_catalog.jsonb_typeof(target_input -> 'expectedPublishedSnapshotId') <> 'string'
     or not (target_input ->> 'expectedPublishedSnapshotId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;
  expected_snapshot_id := (target_input ->> 'expectedPublishedSnapshotId')::uuid;

  context := private.stage01_actor_context(target_company_id, 'stage01.config.update');
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      tenant_id::text || ':' || target_company_id::text || ':vqh.stage01:config', 0
    )
  );

  select snapshot.id, snapshot.definition
    into latest_snapshot_id, latest_definition
    from public.workflow_definition_snapshots as snapshot
   where snapshot.tenant_id = tenant_id
     and snapshot.company_id = target_company_id
     and snapshot.workflow_key = 'vqh.stage01'
   order by snapshot.template_version desc
   limit 1
   for key share;
  if latest_snapshot_id is null then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE';
  end if;
  perform private.assert_valid_stage01_config_definition(latest_definition);
  if latest_snapshot_id is distinct from expected_snapshot_id then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  if exists (
    select 1
    from public.workflow_definition_drafts as draft
    where draft.tenant_id = tenant_id
      and draft.company_id = target_company_id
      and draft.workflow_key = 'vqh.stage01'
    for update
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_CONFIG_DRAFT_EXISTS';
  end if;

  insert into public.workflow_definition_drafts (
    tenant_id, company_id, workflow_key, base_snapshot_id, definition,
    version, created_by, updated_by
  ) values (
    tenant_id, target_company_id, 'vqh.stage01', latest_snapshot_id,
    latest_definition, 0, actor_id, actor_id
  ) returning * into draft_row;

  perform private.write_stage01_audit(
    tenant_id, target_company_id, actor_id, 'stage01.config_draft.created',
    'workflow_definition_draft', draft_row.id::text, target_request_id, null,
    pg_catalog.jsonb_build_object(
      'companyId', target_company_id,
      'actorId', actor_id,
      'draftId', draft_row.id,
      'baseSnapshotId', latest_snapshot_id,
      'draftVersion', draft_row.version,
      'requestId', target_request_id
    )
  );

  return private.stage01_config_draft_result(draft_row);
end;
$$;

create function public.create_stage01_config_draft(
  target_company_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_stage01_config_draft(
    target_company_id, target_input, target_request_id
  );
$$;

create function private.update_stage01_config_draft(
  target_company_id uuid,
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
  expected_draft_version bigint;
  draft_row public.workflow_definition_drafts%rowtype;
  base_definition jsonb;
  candidate_definition jsonb;
begin
  if target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;
  perform private.assert_stage01_command_keys(
    target_input, array['expectedDraftVersion', 'taxonomies', 'criteria']
  );
  perform private.assert_stage01_required_keys(
    target_input, array['expectedDraftVersion', 'taxonomies', 'criteria']
  );
  expected_draft_version := private.stage01_config_expected_draft_version(target_input);

  context := private.stage01_actor_context(target_company_id, 'stage01.config.update');
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  select draft.*
    into draft_row
    from public.workflow_definition_drafts as draft
   where draft.tenant_id = tenant_id
     and draft.company_id = target_company_id
     and draft.workflow_key = 'vqh.stage01'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'STAGE01_CONFIG_DRAFT_NOT_FOUND';
  end if;
  if draft_row.version is distinct from expected_draft_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  select snapshot.definition
    into base_definition
    from public.workflow_definition_snapshots as snapshot
   where snapshot.id = draft_row.base_snapshot_id
     and snapshot.tenant_id = tenant_id
     and snapshot.company_id = target_company_id
     and snapshot.workflow_key = 'vqh.stage01';
  if base_definition is null then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE';
  end if;

  perform private.assert_stage01_config_business_input(
    target_input -> 'taxonomies', target_input -> 'criteria'
  );
  candidate_definition := draft_row.definition || pg_catalog.jsonb_build_object(
    'taxonomies', private.merge_stage01_config_taxonomies(
      base_definition, target_input -> 'taxonomies'
    ),
    'criteria', target_input -> 'criteria'
  );
  perform private.assert_valid_stage01_config_definition(candidate_definition);
  perform private.assert_stage01_config_reserved_identity(
    base_definition, candidate_definition
  );
  perform private.assert_stage01_config_criterion_identity(
    base_definition, candidate_definition
  );

  update public.workflow_definition_drafts as draft
     set definition = candidate_definition,
         version = draft.version + 1,
         updated_by = actor_id,
         updated_at = pg_catalog.statement_timestamp()
   where draft.id = draft_row.id
     and draft.tenant_id = tenant_id
     and draft.company_id = target_company_id
  returning * into draft_row;

  perform private.write_stage01_audit(
    tenant_id, target_company_id, actor_id, 'stage01.config_draft.updated',
    'workflow_definition_draft', draft_row.id::text, target_request_id,
    pg_catalog.jsonb_build_object(
      'draftId', draft_row.id,
      'draftVersion', draft_row.version - 1
    ),
    pg_catalog.jsonb_build_object(
      'companyId', target_company_id,
      'actorId', actor_id,
      'draftId', draft_row.id,
      'draftVersion', draft_row.version,
      'requestId', target_request_id
    )
  );

  return private.stage01_config_draft_result(draft_row);
end;
$$;

create function public.update_stage01_config_draft(
  target_company_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.update_stage01_config_draft(
    target_company_id, target_input, target_request_id
  );
$$;

create function private.discard_stage01_config_draft(
  target_company_id uuid,
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
  expected_draft_version bigint;
  draft_row public.workflow_definition_drafts%rowtype;
begin
  if target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;
  perform private.assert_stage01_command_keys(target_input, array['expectedDraftVersion']);
  perform private.assert_stage01_required_keys(target_input, array['expectedDraftVersion']);
  expected_draft_version := private.stage01_config_expected_draft_version(target_input);

  context := private.stage01_actor_context(target_company_id, 'stage01.config.update');
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  select draft.*
    into draft_row
    from public.workflow_definition_drafts as draft
   where draft.tenant_id = tenant_id
     and draft.company_id = target_company_id
     and draft.workflow_key = 'vqh.stage01'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'STAGE01_CONFIG_DRAFT_NOT_FOUND';
  end if;
  if draft_row.version is distinct from expected_draft_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  perform private.write_stage01_audit(
    tenant_id, target_company_id, actor_id, 'stage01.config_draft.discarded',
    'workflow_definition_draft', draft_row.id::text, target_request_id,
    pg_catalog.jsonb_build_object(
      'draftId', draft_row.id,
      'baseSnapshotId', draft_row.base_snapshot_id,
      'draftVersion', draft_row.version
    ),
    pg_catalog.jsonb_build_object(
      'companyId', target_company_id,
      'actorId', actor_id,
      'draftId', draft_row.id,
      'baseSnapshotId', draft_row.base_snapshot_id,
      'draftVersion', draft_row.version,
      'requestId', target_request_id
    )
  );

  delete from public.workflow_definition_drafts as draft
   where draft.id = draft_row.id
     and draft.tenant_id = tenant_id
     and draft.company_id = target_company_id;

  return '{}'::jsonb;
end;
$$;

create function public.discard_stage01_config_draft(
  target_company_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.discard_stage01_config_draft(
    target_company_id, target_input, target_request_id
  );
$$;

create function private.publish_stage01_config_draft(
  target_company_id uuid,
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
  expected_draft_version bigint;
  draft_row public.workflow_definition_drafts%rowtype;
  latest_snapshot_id uuid;
  latest_template_version integer;
  latest_schema_version integer;
  latest_definition jsonb;
  new_snapshot_id uuid;
  new_template_version integer;
  definition_hash text;
  published_at timestamptz;
begin
  if target_request_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;
  perform private.assert_stage01_command_keys(target_input, array['expectedDraftVersion']);
  perform private.assert_stage01_required_keys(target_input, array['expectedDraftVersion']);
  expected_draft_version := private.stage01_config_expected_draft_version(target_input);

  context := private.stage01_actor_context(target_company_id, 'stage01.config.publish');
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      tenant_id::text || ':' || target_company_id::text || ':vqh.stage01:config', 0
    )
  );

  select draft.*
    into draft_row
    from public.workflow_definition_drafts as draft
   where draft.tenant_id = tenant_id
     and draft.company_id = target_company_id
     and draft.workflow_key = 'vqh.stage01'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'STAGE01_CONFIG_DRAFT_NOT_FOUND';
  end if;
  if draft_row.version is distinct from expected_draft_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  select snapshot.id, snapshot.template_version, snapshot.schema_version, snapshot.definition
    into latest_snapshot_id, latest_template_version, latest_schema_version, latest_definition
    from public.workflow_definition_snapshots as snapshot
   where snapshot.tenant_id = tenant_id
     and snapshot.company_id = target_company_id
     and snapshot.workflow_key = 'vqh.stage01'
   order by snapshot.template_version desc
   limit 1
   for update;
  if latest_snapshot_id is null then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE';
  end if;
  if draft_row.base_snapshot_id is distinct from latest_snapshot_id then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;

  perform private.assert_valid_stage01_config_definition(draft_row.definition);
  perform private.assert_stage01_config_reserved_identity(
    latest_definition, draft_row.definition
  );
  perform private.assert_stage01_config_criterion_identity(
    latest_definition, draft_row.definition
  );

  new_template_version := latest_template_version + 1;
  definition_hash := pg_catalog.encode(
    extensions.digest(draft_row.definition::text, 'sha256'), 'hex'
  );
  if nullif(pg_catalog.btrim(definition_hash), '') is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

  insert into public.workflow_definition_snapshots (
    tenant_id, company_id, workflow_key, template_version, schema_version,
    definition, definition_hash
  ) values (
    tenant_id, target_company_id, 'vqh.stage01', new_template_version,
    latest_schema_version, draft_row.definition, definition_hash
  ) returning id, created_at into new_snapshot_id, published_at;

  perform private.sync_stage01_config_taxonomy_values(
    tenant_id, target_company_id, draft_row.definition
  );

  perform private.write_stage01_audit(
    tenant_id, target_company_id, actor_id, 'stage01.config.published',
    'workflow_definition_snapshot', new_snapshot_id::text, target_request_id,
    pg_catalog.jsonb_build_object(
      'draftId', draft_row.id,
      'baseSnapshotId', draft_row.base_snapshot_id,
      'draftVersion', draft_row.version
    ),
    pg_catalog.jsonb_build_object(
      'companyId', target_company_id,
      'actorId', actor_id,
      'draftId', draft_row.id,
      'baseSnapshotId', draft_row.base_snapshot_id,
      'draftVersion', draft_row.version,
      'newSnapshotId', new_snapshot_id,
      'templateVersion', new_template_version,
      'definitionHash', definition_hash,
      'requestId', target_request_id,
      'publishedAt', published_at
    )
  );

  delete from public.workflow_definition_drafts as draft
   where draft.id = draft_row.id
     and draft.tenant_id = tenant_id
     and draft.company_id = target_company_id;

  return pg_catalog.jsonb_build_object(
    'snapshotId', new_snapshot_id,
    'templateVersion', new_template_version,
    'schemaVersion', latest_schema_version,
    'definitionHash', definition_hash,
    'publishedAt', published_at
  );
end;
$$;

create function public.publish_stage01_config_draft(
  target_company_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.publish_stage01_config_draft(
    target_company_id, target_input, target_request_id
  );
$$;

revoke all on function private.assert_stage01_config_taxonomies(jsonb, boolean) from public, anon, authenticated;
revoke all on function private.assert_stage01_config_criteria(jsonb) from public, anon, authenticated;
revoke all on function private.assert_stage01_config_business_input(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.assert_valid_stage01_config_definition(jsonb) from public, anon, authenticated;
revoke all on function private.merge_stage01_config_taxonomies(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.assert_stage01_config_reserved_identity(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.assert_stage01_config_criterion_identity(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.stage01_config_business_taxonomies(jsonb) from public, anon, authenticated;
revoke all on function private.stage01_config_draft_result(public.workflow_definition_drafts) from public, anon, authenticated;
revoke all on function private.stage01_config_expected_draft_version(jsonb) from public, anon, authenticated;
revoke all on function private.sync_stage01_config_taxonomy_values(uuid, uuid, jsonb) from public, anon, authenticated;

revoke all on function private.create_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.update_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.discard_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.publish_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.create_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.discard_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.publish_stage01_config_draft(uuid, jsonb, uuid) from public, anon, authenticated;

grant execute on function private.create_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function private.update_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function private.discard_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function private.publish_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.create_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.update_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.discard_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.publish_stage01_config_draft(uuid, jsonb, uuid) to authenticated;
