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
    'workflow_blockers'
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
    ('workflow_blockers', 'version')
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
    'workflow_blockers'
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
end $$;

select 'PASS DB-S01-SCHEMA workflow core relations' as result;

rollback;
