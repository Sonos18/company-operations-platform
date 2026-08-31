BEGIN;

do $$
declare
  unexpected_column text;
begin
  select actual.column_name
    into unexpected_column
    from information_schema.columns as actual
   where actual.table_schema = 'public'
     and actual.table_name = 'workflow_definition_drafts'
  except
  select expected.column_name
    from (values
      ('id'),
      ('tenant_id'),
      ('company_id'),
      ('workflow_key'),
      ('base_snapshot_id'),
      ('definition'),
      ('version'),
      ('created_by'),
      ('created_at'),
      ('updated_by'),
      ('updated_at')
    ) as expected(column_name);

  if unexpected_column is not null then
    raise exception 'DB-S01-CONFIG-SCHEMA unexpected draft column %', unexpected_column;
  end if;

  if (select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'workflow_definition_drafts') <> 11 then
    raise exception 'DB-S01-CONFIG-SCHEMA draft column contract is incomplete';
  end if;

  if exists (
    select 1
    from (values
      ('id', 'uuid', 'NO'),
      ('tenant_id', 'uuid', 'NO'),
      ('company_id', 'uuid', 'NO'),
      ('workflow_key', 'text', 'NO'),
      ('base_snapshot_id', 'uuid', 'NO'),
      ('definition', 'jsonb', 'NO'),
      ('version', 'bigint', 'NO'),
      ('created_by', 'uuid', 'NO'),
      ('created_at', 'timestamp with time zone', 'NO'),
      ('updated_by', 'uuid', 'NO'),
      ('updated_at', 'timestamp with time zone', 'NO')
    ) as expected(column_name, data_type, is_nullable)
    left join information_schema.columns as actual
      on actual.table_schema = 'public'
     and actual.table_name = 'workflow_definition_drafts'
     and actual.column_name = expected.column_name
    where actual.data_type is distinct from expected.data_type
       or actual.is_nullable is distinct from expected.is_nullable
  ) then
    raise exception 'DB-S01-CONFIG-SCHEMA draft type or nullability contract mismatch';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workflow_definition_drafts'::regclass
      and conname = 'workflow_definition_drafts_company_fk'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workflow_definition_drafts'::regclass
      and conname = 'workflow_definition_drafts_base_snapshot_fk'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workflow_definition_drafts'::regclass
      and conname = 'workflow_definition_drafts_company_workflow_key'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workflow_definition_drafts'::regclass
      and conname = 'workflow_definition_drafts_version_nonnegative'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workflow_definition_drafts'::regclass
      and conname = 'workflow_definition_drafts_definition_object'
  ) then
    raise exception 'DB-S01-CONFIG-SCHEMA required draft constraint is missing';
  end if;
end $$;

do $$
begin
  if to_regclass('public.workflow_definition_drafts_scope_key_idx') is null
     or to_regclass('public.workflow_definition_drafts_base_snapshot_scope_idx') is null then
    raise exception 'DB-S01-CONFIG-SCHEMA foreign-key or RLS lookup index is missing';
  end if;
end $$;

insert into auth.users (id, email) values
  ('61000000-0000-4000-8000-000000000001', 'stage01-config-schema@test.invalid');

insert into public.tenants (id, code, name) values
  ('61000000-0000-4000-8000-000000000010', 'stage01-config-schema', 'Stage 01 config schema test');

insert into public.companies (id, tenant_id, code, name) values
  ('61000000-0000-4000-8000-000000000020', '61000000-0000-4000-8000-000000000010', 'S01-CONFIG-A', 'Stage 01 config A'),
  ('61000000-0000-4000-8000-000000000021', '61000000-0000-4000-8000-000000000010', 'S01-CONFIG-B', 'Stage 01 config B');

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values
  (
    '61000000-0000-4000-8000-000000000030', '61000000-0000-4000-8000-000000000010',
    '61000000-0000-4000-8000-000000000020', 'vqh.stage01', 1, 1, '{}'::jsonb, 'config-schema-a'
  ),
  (
    '61000000-0000-4000-8000-000000000031', '61000000-0000-4000-8000-000000000010',
    '61000000-0000-4000-8000-000000000021', 'vqh.stage01', 1, 1, '{}'::jsonb, 'config-schema-b'
  );

insert into public.workflow_definition_drafts (
  id, tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
  created_by, updated_by
) values (
  '61000000-0000-4000-8000-000000000040', '61000000-0000-4000-8000-000000000010',
  '61000000-0000-4000-8000-000000000020', 'vqh.stage01',
  '61000000-0000-4000-8000-000000000030', '{}'::jsonb, 0,
  '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
);

do $$
declare
  violated_constraint text;
begin
  begin
    insert into public.workflow_definition_drafts (
      tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
      created_by, updated_by
    ) values (
      '61000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000020',
      'vqh.stage01', '61000000-0000-4000-8000-000000000030', '{}'::jsonb, 0,
      '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-CONFIG-SCHEMA accepted a second active company/workflow draft';
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'workflow_definition_drafts_company_workflow_key' then raise; end if;
  end;

  begin
    insert into public.workflow_definition_drafts (
      tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
      created_by, updated_by
    ) values (
      '61000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000021',
      'vqh.stage01', '61000000-0000-4000-8000-000000000030', '{}'::jsonb, 0,
      '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-CONFIG-SCHEMA accepted a cross-company base snapshot';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.workflow_definition_drafts (
      tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
      created_by, updated_by
    ) values (
      '61000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000020',
      'vqh.stage01.invalid-definition', '61000000-0000-4000-8000-000000000030', '[]'::jsonb, 0,
      '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-CONFIG-SCHEMA accepted non-object definition';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'workflow_definition_drafts_definition_object' then raise; end if;
  end;

  begin
    insert into public.workflow_definition_drafts (
      tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
      created_by, updated_by
    ) values (
      '61000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000020',
      'vqh.stage01.negative-version', '61000000-0000-4000-8000-000000000030', '{}'::jsonb, -1,
      '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-CONFIG-SCHEMA accepted a negative draft version';
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint <> 'workflow_definition_drafts_version_nonnegative' then raise; end if;
  end;
end $$;

select 'PASS DB-S01-CONFIG-SCHEMA draft persistence contract' as result;

ROLLBACK;
