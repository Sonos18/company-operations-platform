begin;

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
    'stage01_taxonomy_values',
    'contacts',
    'contact_methods',
    'opportunity_contacts',
    'opportunity_scopes',
    'opportunity_referrers',
    'opportunity_intake_records',
    'opportunity_duplicate_concerns',
    'stage01_intake_completion_baselines'
  ] loop
    if to_regclass(format('public.%I', relation_name)) is null then
      raise exception 'DB-S01-SCHEMA relation public.% is missing', relation_name;
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
    ('stage01_taxonomy_values', 'id'),
    ('stage01_taxonomy_values', 'tenant_id'),
    ('stage01_taxonomy_values', 'company_id'),
    ('stage01_taxonomy_values', 'taxonomy_key'),
    ('stage01_taxonomy_values', 'code'),
    ('stage01_taxonomy_values', 'label'),
    ('stage01_taxonomy_values', 'semantic_key'),
    ('stage01_taxonomy_values', 'behavior'),
    ('stage01_taxonomy_values', 'is_active'),
    ('stage01_taxonomy_values', 'created_at'),
    ('stage01_taxonomy_values', 'updated_at'),
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
    ('stage01_intake_completion_baselines', 'created_at')
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
    'stage01_taxonomy_values',
    'contacts',
    'contact_methods',
    'opportunity_contacts',
    'opportunity_scopes',
    'opportunity_referrers',
    'opportunity_intake_records',
    'opportunity_duplicate_concerns',
    'stage01_intake_completion_baselines'
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
    ('stage01_taxonomy_values_company_fk', 'f'),
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
    ('opportunities_id_scope_key', 'u'),
    ('stage01_taxonomy_values_company_key_code', 'u'),
    ('stage01_intake_baselines_execution_version_key', 'u')
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

select 'PASS DB-S01-SCHEMA Stage 01 foundation relations' as result;

rollback;
