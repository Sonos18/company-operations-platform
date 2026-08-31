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

  if not exists (
    select 1
    from pg_constraint as draft_constraint
    join pg_class as referenced_relation on referenced_relation.oid = draft_constraint.confrelid
    join pg_namespace as referenced_schema on referenced_schema.oid = referenced_relation.relnamespace
    where draft_constraint.conrelid = 'public.workflow_definition_drafts'::regclass
      and draft_constraint.conname = 'workflow_definition_drafts_company_fk'
      and referenced_schema.nspname = 'public'
      and referenced_relation.relname = 'companies'
      and (
        select array_agg(attribute.attname order by key_column.ordinality)
        from unnest(draft_constraint.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute as attribute
          on attribute.attrelid = draft_constraint.conrelid
         and attribute.attnum = key_column.attnum
      ) = array['company_id', 'tenant_id']::text[]
      and (
        select array_agg(attribute.attname order by reference_column.ordinality)
        from unnest(draft_constraint.confkey) with ordinality as reference_column(attnum, ordinality)
        join pg_attribute as attribute
          on attribute.attrelid = draft_constraint.confrelid
         and attribute.attnum = reference_column.attnum
      ) = array['id', 'tenant_id']::text[]
  ) then
    raise exception 'DB-S01-CONFIG-SCHEMA company foreign-key column order mismatch';
  end if;

  if not exists (
    select 1
    from pg_constraint as draft_constraint
    join pg_class as referenced_relation on referenced_relation.oid = draft_constraint.confrelid
    join pg_namespace as referenced_schema on referenced_schema.oid = referenced_relation.relnamespace
    where draft_constraint.conrelid = 'public.workflow_definition_drafts'::regclass
      and draft_constraint.conname = 'workflow_definition_drafts_base_snapshot_fk'
      and referenced_schema.nspname = 'public'
      and referenced_relation.relname = 'workflow_definition_snapshots'
      and (
        select array_agg(attribute.attname order by key_column.ordinality)
        from unnest(draft_constraint.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute as attribute
          on attribute.attrelid = draft_constraint.conrelid
         and attribute.attnum = key_column.attnum
      ) = array['base_snapshot_id', 'tenant_id', 'company_id']::text[]
      and (
        select array_agg(attribute.attname order by reference_column.ordinality)
        from unnest(draft_constraint.confkey) with ordinality as reference_column(attnum, ordinality)
        join pg_attribute as attribute
          on attribute.attrelid = draft_constraint.confrelid
         and attribute.attnum = reference_column.attnum
      ) = array['id', 'tenant_id', 'company_id']::text[]
  ) then
    raise exception 'DB-S01-CONFIG-SCHEMA base snapshot foreign-key column order mismatch';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from (values
      ('workflow_definition_drafts_company_workflow_key', true, array['company_id', 'workflow_key']::text[]),
      ('workflow_definition_drafts_scope_key_idx', false, array['tenant_id', 'company_id', 'workflow_key']::text[]),
      ('workflow_definition_drafts_base_snapshot_scope_idx', false, array['base_snapshot_id', 'tenant_id', 'company_id']::text[]),
      ('workflow_definition_drafts_created_by_idx', false, array['created_by']::text[]),
      ('workflow_definition_drafts_updated_by_idx', false, array['updated_by']::text[])
    ) as expected(index_name, is_unique, column_names)
    left join lateral (
      select
        index_definition.indisunique as is_unique,
        array_agg(attribute.attname order by index_column.ordinality) as column_names
      from pg_class as index_relation
      join pg_namespace as index_schema on index_schema.oid = index_relation.relnamespace
      join pg_index as index_definition on index_definition.indexrelid = index_relation.oid
      join unnest(index_definition.indkey) with ordinality as index_column(attnum, ordinality) on true
      join pg_attribute as attribute
        on attribute.attrelid = index_definition.indrelid
       and attribute.attnum = index_column.attnum
      where index_schema.nspname = 'public'
        and index_relation.relname = expected.index_name
      group by index_definition.indisunique
    ) as actual on true
    where actual.is_unique is distinct from expected.is_unique
       or actual.column_names is distinct from expected.column_names
  ) then
    raise exception 'DB-S01-CONFIG-SCHEMA draft index uniqueness or column order mismatch';
  end if;
end $$;

insert into auth.users (id, email) values
  ('61000000-0000-4000-8000-000000000001', 'stage01-config-schema@test.invalid');

insert into public.tenants (id, code, name) values
  ('61000000-0000-4000-8000-000000000010', 'stage01-config-schema', 'Stage 01 config schema test'),
  ('61000000-0000-4000-8000-000000000011', 'stage01-config-schema-other', 'Stage 01 config schema other tenant');

insert into public.companies (id, tenant_id, code, name) values
  ('61000000-0000-4000-8000-000000000020', '61000000-0000-4000-8000-000000000010', 'S01-CONFIG-A', 'Stage 01 config A'),
  ('61000000-0000-4000-8000-000000000021', '61000000-0000-4000-8000-000000000010', 'S01-CONFIG-B', 'Stage 01 config B'),
  ('61000000-0000-4000-8000-000000000022', '61000000-0000-4000-8000-000000000011', 'S01-CONFIG-C', 'Stage 01 config C');

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
  ),
  (
    '61000000-0000-4000-8000-000000000032', '61000000-0000-4000-8000-000000000011',
    '61000000-0000-4000-8000-000000000022', 'vqh.stage01', 1, 1, '{}'::jsonb, 'config-schema-c'
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
      '61000000-0000-4000-8000-000000000011', '61000000-0000-4000-8000-000000000020',
      'vqh.stage01.cross-tenant-company', '61000000-0000-4000-8000-000000000030', '{}'::jsonb, 0,
      '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-CONFIG-SCHEMA accepted a cross-tenant company scope';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.workflow_definition_drafts (
      tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
      created_by, updated_by
    ) values (
      '61000000-0000-4000-8000-000000000010', '61000000-0000-4000-8000-000000000020',
      'vqh.stage01.cross-tenant-snapshot', '61000000-0000-4000-8000-000000000032', '{}'::jsonb, 0,
      '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-CONFIG-SCHEMA accepted a cross-tenant base snapshot';
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
