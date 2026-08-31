begin;

do $$
declare
  catalog_relation regclass;
  catalog_row_count bigint;
  catalog_fingerprint text;
begin
  if to_regclass('public.workflow_taxonomy_values') is not null then
    catalog_relation := 'public.workflow_taxonomy_values'::regclass;
    execute format(
      $query$
        select
          count(*),
          encode(
            extensions.digest(
              coalesce(
                string_agg(
                  jsonb_build_array(
                    id, tenant_id, company_id, taxonomy_key, code, label,
                    semantic_key, behavior, is_active,
                    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                    to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                  )::text,
                  E'\\n'
                  order by id, tenant_id, company_id, taxonomy_key, code, label,
                    semantic_key, behavior::text, is_active, created_at, updated_at
                ),
                ''
              ),
              'sha256'
            ),
            'hex'
          )
        from %s
        where workflow_key = 'vqh.stage01'
      $query$,
      catalog_relation
    ) into catalog_row_count, catalog_fingerprint;
  elsif to_regclass(format('public.%s%s', 'stage01_', 'taxonomy_values')) is not null then
    catalog_relation := to_regclass(format('public.%s%s', 'stage01_', 'taxonomy_values'));
    execute format(
      $query$
        select
          count(*),
          encode(
            extensions.digest(
              coalesce(
                string_agg(
                  jsonb_build_array(
                    id, tenant_id, company_id, taxonomy_key, code, label,
                    semantic_key, behavior, is_active,
                    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                    to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                  )::text,
                  E'\\n'
                  order by id, tenant_id, company_id, taxonomy_key, code, label,
                    semantic_key, behavior::text, is_active, created_at, updated_at
                ),
                ''
              ),
              'sha256'
            ),
            'hex'
          )
        from %s
      $query$,
      catalog_relation
    ) into catalog_row_count, catalog_fingerprint;
  else
    raise exception 'DB-S01-SCHEMA neither current nor legacy taxonomy catalog relation is available for preservation checkpoint';
  end if;

  perform set_config('stage01_schema.catalog_preservation_count', catalog_row_count::text, true);
  perform set_config('stage01_schema.catalog_preservation_sha256', catalog_fingerprint, true);
  raise notice 'DB-S01-SCHEMA catalog preservation checkpoint count=% sha256=%', catalog_row_count, catalog_fingerprint;
end $$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'workflow_definition_snapshots',
    'workflow_instances',
    'workflow_node_instances',
    'workflow_node_executions',
    'workflow_node_events',
    'workflow_node_assignments',
    'workflow_blockers',
    'opportunities',
    'workflow_taxonomy_values',
    'contacts',
    'contact_methods',
    'opportunity_contacts',
    'opportunity_scopes',
    'opportunity_referrers',
    'opportunity_intake_records',
    'opportunity_duplicate_concerns',
    'stage01_intake_completion_baselines',
    'stage01_decision_cycles',
    'stage01_criterion_evaluations',
    'stage01_recommendations',
    'stage01_clarification_returns'
  ] loop
    if to_regclass(format('public.%I', relation_name)) is null then
      raise exception 'DB-S01-SCHEMA relation public.% is missing; catalog preservation checkpoint count=% sha256=%',
        relation_name,
        current_setting('stage01_schema.catalog_preservation_count', true),
        current_setting('stage01_schema.catalog_preservation_sha256', true);
    end if;
  end loop;
end $$;

do $$
declare
  missing_column text;
  relation_name text;
begin
  select format('%s.%s', expected.table_name, expected.column_name)
  into missing_column
  from (values
    ('workflow_definition_snapshots', 'id'),
    ('workflow_definition_snapshots', 'tenant_id'),
    ('workflow_definition_snapshots', 'company_id'),
    ('workflow_definition_snapshots', 'workflow_key'),
    ('workflow_definition_snapshots', 'template_version'),
    ('workflow_definition_snapshots', 'schema_version'),
    ('workflow_definition_snapshots', 'definition'),
    ('workflow_definition_snapshots', 'definition_hash'),
    ('workflow_instances', 'subject_type'),
    ('workflow_instances', 'subject_id'),
    ('workflow_instances', 'definition_snapshot_id'),
    ('workflow_node_instances', 'workflow_instance_id'),
    ('workflow_node_instances', 'node_key'),
    ('workflow_node_instances', 'node_type'),
    ('workflow_node_instances', 'parent_node_key'),
    ('workflow_node_executions', 'node_instance_id'),
    ('workflow_node_executions', 'execution_no'),
    ('workflow_node_executions', 'phase'),
    ('workflow_node_executions', 'needs_revalidation'),
    ('workflow_node_executions', 'superseded_at'),
    ('workflow_node_executions', 'version'),
    ('workflow_node_events', 'node_execution_id'),
    ('workflow_node_events', 'event_type'),
    ('workflow_node_events', 'payload'),
    ('workflow_node_events', 'request_id'),
    ('workflow_node_assignments', 'assignment_kind'),
    ('workflow_node_assignments', 'assignee_user_id'),
    ('workflow_node_assignments', 'ended_at'),
    ('workflow_blockers', 'effect'),
    ('workflow_blockers', 'category_code'),
    ('workflow_blockers', 'responsible_user_id'),
    ('workflow_blockers', 'resolved_at'),
    ('workflow_blockers', 'version'),
    ('opportunities', 'id'),
    ('opportunities', 'tenant_id'),
    ('opportunities', 'company_id'),
    ('opportunities', 'validity_state'),
    ('opportunities', 'canonical_opportunity_id'),
    ('opportunities', 'current_invalid_reason_code'),
    ('opportunities', 'current_invalid_reason_semantic_key'),
    ('opportunities', 'current_invalidation_reason'),
    ('opportunities', 'invalidated_by'),
    ('opportunities', 'invalidated_at'),
    ('opportunities', 'primary_customer_name'),
    ('opportunities', 'customer_type_code'),
    ('opportunities', 'need_description'),
    ('opportunities', 'location_status'),
    ('opportunities', 'location_text'),
    ('opportunities', 'primary_lead_source_code'),
    ('opportunities', 'engagement_status_code'),
    ('opportunities', 'budget_status_code'),
    ('opportunities', 'budget_min'),
    ('opportunities', 'budget_max'),
    ('opportunities', 'currency_code'),
    ('opportunities', 'budget_note'),
    ('opportunities', 'timeline_status_code'),
    ('opportunities', 'timeline_start_date'),
    ('opportunities', 'timeline_end_date'),
    ('opportunities', 'timeline_note'),
    ('opportunities', 'priority_code'),
    ('opportunities', 'version'),
    ('opportunities', 'created_by'),
    ('opportunities', 'created_at'),
    ('opportunities', 'updated_at'),
    ('workflow_taxonomy_values', 'id'),
    ('workflow_taxonomy_values', 'tenant_id'),
    ('workflow_taxonomy_values', 'company_id'),
    ('workflow_taxonomy_values', 'workflow_key'),
    ('workflow_taxonomy_values', 'taxonomy_key'),
    ('workflow_taxonomy_values', 'code'),
    ('workflow_taxonomy_values', 'label'),
    ('workflow_taxonomy_values', 'semantic_key'),
    ('workflow_taxonomy_values', 'behavior'),
    ('workflow_taxonomy_values', 'is_active'),
    ('workflow_taxonomy_values', 'created_at'),
    ('workflow_taxonomy_values', 'updated_at'),
    ('contacts', 'id'),
    ('contacts', 'tenant_id'),
    ('contacts', 'company_id'),
    ('contacts', 'display_name'),
    ('contacts', 'notes'),
    ('contacts', 'version'),
    ('contacts', 'created_by'),
    ('contacts', 'created_at'),
    ('contacts', 'updated_at'),
    ('contact_methods', 'id'),
    ('contact_methods', 'tenant_id'),
    ('contact_methods', 'company_id'),
    ('contact_methods', 'contact_id'),
    ('contact_methods', 'method_type'),
    ('contact_methods', 'value'),
    ('contact_methods', 'is_usable'),
    ('contact_methods', 'reliability_state'),
    ('contact_methods', 'created_at'),
    ('contact_methods', 'updated_at'),
    ('opportunity_contacts', 'id'),
    ('opportunity_contacts', 'tenant_id'),
    ('opportunity_contacts', 'company_id'),
    ('opportunity_contacts', 'opportunity_id'),
    ('opportunity_contacts', 'contact_id'),
    ('opportunity_contacts', 'relationship_code'),
    ('opportunity_contacts', 'is_primary'),
    ('opportunity_contacts', 'reliability_state'),
    ('opportunity_contacts', 'created_by'),
    ('opportunity_contacts', 'created_at'),
    ('opportunity_contacts', 'ended_by'),
    ('opportunity_contacts', 'ended_at'),
    ('opportunity_contacts', 'end_reason'),
    ('opportunity_scopes', 'id'),
    ('opportunity_scopes', 'tenant_id'),
    ('opportunity_scopes', 'company_id'),
    ('opportunity_scopes', 'opportunity_id'),
    ('opportunity_scopes', 'scope_code'),
    ('opportunity_scopes', 'note'),
    ('opportunity_scopes', 'reliability_state'),
    ('opportunity_scopes', 'created_by'),
    ('opportunity_scopes', 'created_at'),
    ('opportunity_scopes', 'retired_by'),
    ('opportunity_scopes', 'retired_at'),
    ('opportunity_scopes', 'retire_reason'),
    ('opportunity_referrers', 'id'),
    ('opportunity_referrers', 'tenant_id'),
    ('opportunity_referrers', 'company_id'),
    ('opportunity_referrers', 'opportunity_id'),
    ('opportunity_referrers', 'referrer_type_code'),
    ('opportunity_referrers', 'display_name'),
    ('opportunity_referrers', 'contact_id'),
    ('opportunity_referrers', 'note'),
    ('opportunity_referrers', 'reliability_state'),
    ('opportunity_referrers', 'is_primary'),
    ('opportunity_referrers', 'created_by'),
    ('opportunity_referrers', 'created_at'),
    ('opportunity_referrers', 'ended_by'),
    ('opportunity_referrers', 'ended_at'),
    ('opportunity_referrers', 'end_reason'),
    ('opportunity_intake_records', 'id'),
    ('opportunity_intake_records', 'tenant_id'),
    ('opportunity_intake_records', 'company_id'),
    ('opportunity_intake_records', 'opportunity_id'),
    ('opportunity_intake_records', 'channel_code'),
    ('opportunity_intake_records', 'summary'),
    ('opportunity_intake_records', 'correction_of_record_id'),
    ('opportunity_intake_records', 'correction_reason'),
    ('opportunity_intake_records', 'created_by'),
    ('opportunity_intake_records', 'created_at'),
    ('opportunity_duplicate_concerns', 'id'),
    ('opportunity_duplicate_concerns', 'tenant_id'),
    ('opportunity_duplicate_concerns', 'company_id'),
    ('opportunity_duplicate_concerns', 'opportunity_id'),
    ('opportunity_duplicate_concerns', 'suspected_duplicate_opportunity_id'),
    ('opportunity_duplicate_concerns', 'description'),
    ('opportunity_duplicate_concerns', 'raised_by'),
    ('opportunity_duplicate_concerns', 'raised_at'),
    ('opportunity_duplicate_concerns', 'resolution'),
    ('opportunity_duplicate_concerns', 'canonical_opportunity_id'),
    ('opportunity_duplicate_concerns', 'resolution_note'),
    ('opportunity_duplicate_concerns', 'resolved_by'),
    ('opportunity_duplicate_concerns', 'resolved_at'),
    ('stage01_intake_completion_baselines', 'id'),
    ('stage01_intake_completion_baselines', 'tenant_id'),
    ('stage01_intake_completion_baselines', 'company_id'),
    ('stage01_intake_completion_baselines', 'opportunity_id'),
    ('stage01_intake_completion_baselines', 'node_execution_id'),
    ('stage01_intake_completion_baselines', 'completion_event_id'),
    ('stage01_intake_completion_baselines', 'baseline_version'),
    ('stage01_intake_completion_baselines', 'snapshot'),
    ('stage01_intake_completion_baselines', 'snapshot_hash'),
    ('stage01_intake_completion_baselines', 'created_by'),
    ('stage01_intake_completion_baselines', 'created_at'),
    ('stage01_decision_cycles', 'id'),
    ('stage01_decision_cycles', 'tenant_id'),
    ('stage01_decision_cycles', 'company_id'),
    ('stage01_decision_cycles', 'opportunity_id'),
    ('stage01_decision_cycles', 'node_execution_id'),
    ('stage01_decision_cycles', 'cycle_no'),
    ('stage01_decision_cycles', 'decision_authority_user_id'),
    ('stage01_decision_cycles', 'authority_resolution_reference'),
    ('stage01_decision_cycles', 'reactivation_reason'),
    ('stage01_decision_cycles', 'final_outcome'),
    ('stage01_decision_cycles', 'final_decision_by'),
    ('stage01_decision_cycles', 'final_decision_at'),
    ('stage01_decision_cycles', 'final_rationale'),
    ('stage01_decision_cycles', 'final_recommendation_id'),
    ('stage01_decision_cycles', 'override_rationale'),
    ('stage01_decision_cycles', 'version'),
    ('stage01_decision_cycles', 'created_by'),
    ('stage01_decision_cycles', 'created_at'),
    ('stage01_criterion_evaluations', 'id'),
    ('stage01_criterion_evaluations', 'tenant_id'),
    ('stage01_criterion_evaluations', 'company_id'),
    ('stage01_criterion_evaluations', 'decision_cycle_id'),
    ('stage01_criterion_evaluations', 'criterion_key'),
    ('stage01_criterion_evaluations', 'revision'),
    ('stage01_criterion_evaluations', 'applicability'),
    ('stage01_criterion_evaluations', 'result'),
    ('stage01_criterion_evaluations', 'rationale'),
    ('stage01_criterion_evaluations', 'evidence'),
    ('stage01_criterion_evaluations', 'evaluated_by'),
    ('stage01_criterion_evaluations', 'evaluated_at'),
    ('stage01_recommendations', 'id'),
    ('stage01_recommendations', 'tenant_id'),
    ('stage01_recommendations', 'company_id'),
    ('stage01_recommendations', 'decision_cycle_id'),
    ('stage01_recommendations', 'version'),
    ('stage01_recommendations', 'recommendation'),
    ('stage01_recommendations', 'rationale'),
    ('stage01_recommendations', 'evidence'),
    ('stage01_recommendations', 'submitted_by'),
    ('stage01_recommendations', 'submitted_at'),
    ('stage01_clarification_returns', 'id'),
    ('stage01_clarification_returns', 'tenant_id'),
    ('stage01_clarification_returns', 'company_id'),
    ('stage01_clarification_returns', 'decision_cycle_id'),
    ('stage01_clarification_returns', 'recommendation_id'),
    ('stage01_clarification_returns', 'reason'),
    ('stage01_clarification_returns', 'returned_by'),
    ('stage01_clarification_returns', 'returned_at')
  ) as expected(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = expected.table_name
      and actual.column_name = expected.column_name
  )
  limit 1;

  if missing_column is not null then
    raise exception 'DB-S01-SCHEMA required column % is missing', missing_column;
  end if;

  foreach relation_name in array array[
    'workflow_definition_snapshots',
    'workflow_instances',
    'workflow_node_instances',
    'workflow_node_executions',
    'workflow_node_events',
    'workflow_node_assignments',
    'workflow_blockers',
    'opportunities',
    'workflow_taxonomy_values',
    'contacts',
    'contact_methods',
    'opportunity_contacts',
    'opportunity_scopes',
    'opportunity_referrers',
    'opportunity_intake_records',
    'opportunity_duplicate_concerns',
    'stage01_intake_completion_baselines',
    'stage01_decision_cycles',
    'stage01_criterion_evaluations',
    'stage01_recommendations',
    'stage01_clarification_returns'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = relation_name
        and relation.relrowsecurity
    ) then
      raise exception 'DB-S01-SCHEMA RLS is not enabled on public.%', relation_name;
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'workflow_node_executions_phase_check'
      and pg_get_constraintdef(oid) like '%not_started%active%completed%not_applicable%'
  ) then
    raise exception 'DB-S01-SCHEMA workflow execution phase check is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'workflow_definition_snapshots_company_key_version_key'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'DB-S01-SCHEMA definition company/key/version uniqueness is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'workflow_node_executions_one_current'
      and indexdef like 'CREATE UNIQUE INDEX%WHERE (superseded_at IS NULL)'
  ) then
    raise exception 'DB-S01-SCHEMA current execution uniqueness is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'workflow_node_assignments_one_active_owner'
      and indexdef like 'CREATE UNIQUE INDEX%accountable_owner%ended_at IS NULL%'
  ) then
    raise exception 'DB-S01-SCHEMA active accountable-owner uniqueness is missing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'opportunities'
      and column_name = 'received_at'
  ) then
    raise exception 'DB-S01-SCHEMA opportunities.received_at must not exist';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'opportunity_contacts_one_active_primary'
      and indexdef like 'CREATE UNIQUE INDEX%is_primary%ended_at IS NULL%'
  ) then
    raise exception 'DB-S01-SCHEMA active Primary Contact uniqueness is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'opportunity_referrers_one_active_primary'
      and indexdef like 'CREATE UNIQUE INDEX%is_primary%ended_at IS NULL%'
  ) then
    raise exception 'DB-S01-SCHEMA active Primary Referrer uniqueness is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'stage01_intake_baselines_completion_event_key'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'DB-S01-SCHEMA baseline completion-event uniqueness is missing';
  end if;
end $$;

do $$
declare
  missing_constraint text;
begin
  select expected.constraint_name
  into missing_constraint
  from (values
    ('opportunities_company_fk', 'f'),
    ('opportunities_canonical_fk', 'f'),
    ('opportunities_invalidated_by_fk', 'f'),
    ('opportunities_current_invalidation_check', 'c'),
    ('workflow_taxonomy_values_company_fk', 'f'),
    ('contacts_company_fk', 'f'),
    ('contact_methods_contact_fk', 'f'),
    ('opportunity_contacts_opportunity_fk', 'f'),
    ('opportunity_contacts_contact_fk', 'f'),
    ('opportunity_scopes_opportunity_fk', 'f'),
    ('opportunity_referrers_opportunity_fk', 'f'),
    ('opportunity_referrers_contact_fk', 'f'),
    ('opportunity_intake_records_opportunity_fk', 'f'),
    ('opportunity_intake_records_correction_fk', 'f'),
    ('opportunity_duplicate_concerns_opportunity_fk', 'f'),
    ('opportunity_duplicate_concerns_suspected_fk', 'f'),
    ('opportunity_duplicate_concerns_canonical_fk', 'f'),
    ('stage01_intake_baselines_opportunity_fk', 'f'),
    ('stage01_intake_baselines_execution_fk', 'f'),
    ('stage01_intake_baselines_event_fk', 'f'),
    ('stage01_decision_cycles_opportunity_fk', 'f'),
    ('stage01_decision_cycles_execution_fk', 'f'),
    ('stage01_decision_cycles_final_recommendation_fk', 'f'),
    ('stage01_criterion_evaluations_cycle_fk', 'f'),
    ('stage01_recommendations_cycle_fk', 'f'),
    ('stage01_clarification_returns_cycle_fk', 'f'),
    ('stage01_clarification_returns_recommendation_fk', 'f'),
    ('opportunities_id_scope_key', 'u'),
    ('workflow_taxonomy_values_company_workflow_taxonomy_code_key', 'u'),
    ('stage01_intake_baselines_execution_version_key', 'u'),
    ('stage01_decision_cycles_opportunity_cycle_key', 'u'),
    ('stage01_decision_cycles_node_execution_key', 'u'),
    ('stage01_criterion_evaluations_cycle_criterion_revision_key', 'u'),
    ('stage01_recommendations_cycle_version_key', 'u')
  ) as expected(constraint_name, constraint_type)
  where not exists (
    select 1
    from pg_catalog.pg_constraint as actual
    where actual.conname = expected.constraint_name
      and actual.contype::text = expected.constraint_type
  )
  limit 1;

  if missing_constraint is not null then
    raise exception 'DB-S01-SCHEMA required constraint % is missing', missing_constraint;
  end if;
end $$;

do $$
begin
  if to_regclass(format('public.%s%s', 'stage01_', 'taxonomy_values')) is not null then
    raise exception 'DB-S01-SCHEMA legacy Stage 01 taxonomy catalog must not remain after generalization';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as taxonomy_constraint
    join pg_catalog.pg_class as referenced_relation on referenced_relation.oid = taxonomy_constraint.confrelid
    join pg_catalog.pg_namespace as referenced_schema on referenced_schema.oid = referenced_relation.relnamespace
    where taxonomy_constraint.conrelid = 'public.workflow_taxonomy_values'::regclass
      and taxonomy_constraint.conname = 'workflow_taxonomy_values_company_fk'
      and taxonomy_constraint.contype = 'f'
      and taxonomy_constraint.confdeltype = 'r'
      and referenced_schema.nspname = 'public'
      and referenced_relation.relname = 'companies'
      and (
        select array_agg(attribute.attname::text order by key_column.ordinality)
        from unnest(taxonomy_constraint.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = taxonomy_constraint.conrelid
         and attribute.attnum = key_column.attnum
      ) = array['company_id', 'tenant_id']::text[]
      and (
        select array_agg(attribute.attname::text order by reference_column.ordinality)
        from unnest(taxonomy_constraint.confkey) with ordinality as reference_column(attnum, ordinality)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = taxonomy_constraint.confrelid
         and attribute.attnum = reference_column.attnum
      ) = array['id', 'tenant_id']::text[]
  ) then
    raise exception 'DB-S01-SCHEMA workflow taxonomy company scope foreign key mismatch';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as taxonomy_constraint
    where taxonomy_constraint.conrelid = 'public.workflow_taxonomy_values'::regclass
      and taxonomy_constraint.conname = 'workflow_taxonomy_values_company_workflow_taxonomy_code_key'
      and taxonomy_constraint.contype = 'u'
      and (
        select array_agg(attribute.attname::text order by key_column.ordinality)
        from unnest(taxonomy_constraint.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = taxonomy_constraint.conrelid
         and attribute.attnum = key_column.attnum
      ) = array['company_id', 'workflow_key', 'taxonomy_key', 'code']::text[]
  ) then
    raise exception 'DB-S01-SCHEMA workflow taxonomy uniqueness mismatch';
  end if;

  if exists (
    select 1
    from (values
      ('workflow_taxonomy_values_workflow_key_not_blank', '%btrim(workflow_key) <> ''''%'::text),
      ('workflow_taxonomy_values_key_not_blank', '%btrim(taxonomy_key) <> ''''%'::text),
      ('workflow_taxonomy_values_code_not_blank', '%btrim(code) <> ''''%'::text),
      ('workflow_taxonomy_values_label_not_blank', '%btrim(label) <> ''''%'::text),
      ('workflow_taxonomy_values_semantic_not_blank', '%semantic_key IS NULL%) OR (btrim(semantic_key) <> ''''%'::text),
      ('workflow_taxonomy_values_behavior_object', '%jsonb_typeof(behavior) = ''object''%'::text)
    ) as expected(constraint_name, definition_pattern)
    left join pg_catalog.pg_constraint as actual
      on actual.conrelid = 'public.workflow_taxonomy_values'::regclass
     and actual.conname = expected.constraint_name
     and actual.contype = 'c'
     and pg_get_constraintdef(actual.oid) like expected.definition_pattern
    where actual.oid is null
  ) then
    raise exception 'DB-S01-SCHEMA workflow taxonomy validation check mismatch';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes as taxonomy_index
    where taxonomy_index.schemaname = 'public'
      and taxonomy_index.tablename = 'workflow_taxonomy_values'
      and taxonomy_index.indexdef like '%(tenant_id, company_id, workflow_key%'
  ) then
    raise exception 'DB-S01-SCHEMA workflow taxonomy scope index is missing';
  end if;
end $$;

do $$
begin
  if to_regprocedure('private.stage01_taxonomy_entry(jsonb,text,text)') is null then
    raise exception 'DB-S01-SCHEMA private taxonomy helper is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.oid = 'private.stage01_taxonomy_entry(jsonb,text,text)'::regprocedure
      and procedure.prosecdef
      and coalesce(procedure.proconfig, array[]::text[]) @> array['search_path=""']
  ) then
    raise exception 'DB-S01-SCHEMA private taxonomy helper is not hardened SECURITY DEFINER';
  end if;
end $$;

insert into auth.users (id, email) values
  ('51000000-0000-4000-8000-000000000001', 'stage01-schema-authority@test.invalid'),
  ('51000000-0000-4000-8000-000000000002', 'stage01-schema-other@test.invalid');

insert into public.tenants (id, code, name) values
  ('51000000-0000-4000-8000-000000000010', 'stage01-schema', 'Stage 01 schema test');

insert into public.companies (id, tenant_id, code, name) values
  ('51000000-0000-4000-8000-000000000020', '51000000-0000-4000-8000-000000000010', 'S01-SCHEMA', 'Stage 01 schema company');

insert into public.opportunities (
  id, tenant_id, company_id, primary_customer_name, created_by
) values (
  '51000000-0000-4000-8000-000000000030',
  '51000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000020',
  'Schema customer',
  '51000000-0000-4000-8000-000000000001'
);

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values (
  '51000000-0000-4000-8000-000000000040',
  '51000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000020',
  'stage01-schema-test', 1, 1, '{}'::jsonb, 'stage01-schema-hash'
);

insert into public.workflow_instances (
  id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by
) values (
  '51000000-0000-4000-8000-000000000050',
  '51000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000020',
  'opportunity',
  '51000000-0000-4000-8000-000000000030',
  '51000000-0000-4000-8000-000000000040',
  '51000000-0000-4000-8000-000000000001'
);

insert into public.workflow_node_instances (
  id, tenant_id, company_id, workflow_instance_id, node_key, node_type
) values (
  '51000000-0000-4000-8000-000000000060',
  '51000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000020',
  '51000000-0000-4000-8000-000000000050',
  '01.2', 'child_stage'
);

insert into public.workflow_node_executions (
  id, tenant_id, company_id, node_instance_id, execution_no
) values (
  '51000000-0000-4000-8000-000000000070',
  '51000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000020',
  '51000000-0000-4000-8000-000000000060', 1
);

insert into public.stage01_decision_cycles (
  id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no,
  decision_authority_user_id, authority_resolution_reference, created_by
) values (
  '51000000-0000-4000-8000-000000000080',
  '51000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000020',
  '51000000-0000-4000-8000-000000000030',
  '51000000-0000-4000-8000-000000000070', 1,
  '51000000-0000-4000-8000-000000000001', 'schema-test-authority',
  '51000000-0000-4000-8000-000000000001'
);

insert into public.stage01_recommendations (
  id, tenant_id, company_id, decision_cycle_id, version, recommendation,
  rationale, evidence, submitted_by
) values (
  '51000000-0000-4000-8000-000000000090',
  '51000000-0000-4000-8000-000000000010',
  '51000000-0000-4000-8000-000000000020',
  '51000000-0000-4000-8000-000000000080', 1, 'recommend_proceed',
  'Schema test recommendation', '[]'::jsonb,
  '51000000-0000-4000-8000-000000000001'
);

do $$
declare
  violated_constraint text;
begin
  begin
    update public.opportunities
    set current_invalid_reason_code = 'partial_invalid_state'
    where id = '51000000-0000-4000-8000-000000000030';
    raise exception 'DB-S01-SCHEMA accepted partial current invalidation metadata';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'opportunities_current_invalidation_check' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_rationale = 'decision-bearing field without outcome'
    where id = '51000000-0000-4000-8000-000000000080';
    raise exception 'DB-S01-SCHEMA accepted final fields without final_outcome';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'stage01_decision_cycles_final_fields_check' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_outcome = 'proceed',
        final_decision_by = '51000000-0000-4000-8000-000000000001',
        final_decision_at = now(),
        final_rationale = ' ',
        final_recommendation_id = '51000000-0000-4000-8000-000000000090'
    where id = '51000000-0000-4000-8000-000000000080';
    raise exception 'DB-S01-SCHEMA accepted blank final_rationale';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'stage01_decision_cycles_final_fields_check' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_outcome = 'proceed',
        final_decision_by = '51000000-0000-4000-8000-000000000001',
        final_decision_at = now(),
        final_rationale = 'Decision without recommendation'
    where id = '51000000-0000-4000-8000-000000000080';
    raise exception 'DB-S01-SCHEMA accepted decision without final_recommendation_id';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'stage01_decision_cycles_final_fields_check' then
      raise;
    end if;
  when raise_exception then
    if sqlerrm <> 'STAGE01_FINAL_RECOMMENDATION_CYCLE_MISMATCH' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_outcome = 'proceed',
        final_decision_by = '51000000-0000-4000-8000-000000000002',
        final_decision_at = now(),
        final_rationale = 'Wrong actor',
        final_recommendation_id = '51000000-0000-4000-8000-000000000090'
    where id = '51000000-0000-4000-8000-000000000080';
    raise exception 'DB-S01-SCHEMA accepted non-authority final_decision_by';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'stage01_decision_cycles_final_fields_check' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_outcome = 'proceed',
        final_decision_by = '51000000-0000-4000-8000-000000000001',
        final_decision_at = now(),
        final_rationale = 'Decision rationale',
        final_recommendation_id = '51000000-0000-4000-8000-000000000090',
        override_rationale = ' '
    where id = '51000000-0000-4000-8000-000000000080';
    raise exception 'DB-S01-SCHEMA accepted blank override_rationale';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'stage01_decision_cycles_final_fields_check' then
      raise;
    end if;
  when raise_exception then
    if sqlerrm <> 'STAGE01_DECISION_OVERRIDE_INVALID' then
      raise;
    end if;
  end;
end $$;

select
  'PASS DB-S01-SCHEMA Stage 01 foundation relations' as result,
  current_setting('stage01_schema.catalog_preservation_count', true)::bigint
    as catalog_preservation_count,
  current_setting('stage01_schema.catalog_preservation_sha256', true)
    as catalog_preservation_sha256;

rollback;
