BEGIN;

do $$
declare
  canonical_permission_count bigint;
begin
  if exists (
    select 1
    from (values
      ('stage01.config.read', 'stage01', 'Read Stage 01 configuration', 'Read published Stage 01 configuration and active drafts'),
      ('stage01.config.update', 'stage01', 'Update Stage 01 configuration', 'Create, update, and discard Stage 01 configuration drafts'),
      ('stage01.config.publish', 'stage01', 'Publish Stage 01 configuration', 'Publish immutable Stage 01 configuration snapshots')
    ) as expected(code, module, name, description)
    left join public.permissions as actual on actual.code = expected.code
    where actual.module is distinct from expected.module
       or actual.name is distinct from expected.name
       or actual.description is distinct from expected.description
  ) then
    raise exception 'DB-S01-CONFIG-SEC permission catalog contract mismatch';
  end if;

  select count(*)
    into canonical_permission_count
    from public.role_permissions as mapping
   where mapping.role_id = '10000000-0000-4000-8000-000000000308'::uuid
     and mapping.permission_code in ('stage01.config.read', 'stage01.config.update', 'stage01.config.publish');

  if canonical_permission_count <> 3 then
    raise exception 'DB-S01-CONFIG-SEC canonical VQH company_admin mapping is incomplete';
  end if;

  if exists (
    select 1
    from public.role_permissions as mapping
    join public.roles as company_role on company_role.id = mapping.role_id
    where mapping.permission_code in ('stage01.config.read', 'stage01.config.update', 'stage01.config.publish')
      and company_role.id <> '10000000-0000-4000-8000-000000000308'::uuid
  ) then
    raise exception 'DB-S01-CONFIG-SEC config permission leaked beyond canonical VQH company_admin';
  end if;

  if not has_table_privilege('authenticated', 'public.workflow_definition_drafts', 'select')
     or has_table_privilege('authenticated', 'public.workflow_definition_drafts', 'insert')
     or has_table_privilege('authenticated', 'public.workflow_definition_drafts', 'update')
     or has_table_privilege('authenticated', 'public.workflow_definition_drafts', 'delete')
     or has_table_privilege('anon', 'public.workflow_definition_drafts', 'select')
     or has_table_privilege('anon', 'public.workflow_definition_drafts', 'insert')
     or has_table_privilege('anon', 'public.workflow_definition_drafts', 'update')
     or has_table_privilege('anon', 'public.workflow_definition_drafts', 'delete') then
    raise exception 'DB-S01-CONFIG-SEC draft table privilege contract mismatch';
  end if;

  if not has_table_privilege('authenticated', 'public.workflow_taxonomy_values', 'select')
     or has_table_privilege('authenticated', 'public.workflow_taxonomy_values', 'insert')
     or has_table_privilege('authenticated', 'public.workflow_taxonomy_values', 'update')
     or has_table_privilege('authenticated', 'public.workflow_taxonomy_values', 'delete')
     or has_table_privilege('anon', 'public.workflow_taxonomy_values', 'select')
     or has_table_privilege('anon', 'public.workflow_taxonomy_values', 'insert')
     or has_table_privilege('anon', 'public.workflow_taxonomy_values', 'update')
     or has_table_privilege('anon', 'public.workflow_taxonomy_values', 'delete') then
    raise exception 'DB-S01-CONFIG-SEC workflow taxonomy table privilege contract mismatch';
  end if;

  if has_function_privilege(
       'public', 'private.sync_stage01_config_taxonomy_values(uuid,uuid,jsonb)', 'execute'
     )
     or has_function_privilege(
       'anon', 'private.sync_stage01_config_taxonomy_values(uuid,uuid,jsonb)', 'execute'
     )
     or has_function_privilege(
       'authenticated', 'private.sync_stage01_config_taxonomy_values(uuid,uuid,jsonb)', 'execute'
     ) then
    raise exception 'DB-S01-CONFIG-SEC private workflow taxonomy synchronizer must not be executable by API roles';
  end if;
end $$;

insert into auth.users (id, email) values
  ('62000000-0000-4000-8000-000000000001', 'stage01-config-reader-a@test.invalid'),
  ('62000000-0000-4000-8000-000000000002', 'stage01-config-updater-a@test.invalid'),
  ('62000000-0000-4000-8000-000000000003', 'stage01-config-journey-a@test.invalid'),
  ('62000000-0000-4000-8000-000000000004', 'stage01-config-reader-b@test.invalid');

insert into public.tenants (id, code, name) values
  ('62000000-0000-4000-8000-000000000010', 'stage01-config-security-a', 'Stage 01 config security tenant A'),
  ('62000000-0000-4000-8000-000000000011', 'stage01-config-security-b', 'Stage 01 config security tenant B');

insert into public.companies (id, tenant_id, code, name) values
  ('62000000-0000-4000-8000-000000000020', '62000000-0000-4000-8000-000000000010', 'S01-CONFIG-SEC-A', 'Stage 01 config security company A'),
  ('62000000-0000-4000-8000-000000000021', '62000000-0000-4000-8000-000000000011', 'S01-CONFIG-SEC-B', 'Stage 01 config security company B');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000010', array['member']),
  ('62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000010', array['member']),
  ('62000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000010', array['member']),
  ('62000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000011', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020', array['member']),
  ('62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020', array['member']),
  ('62000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020', array['member']),
  ('62000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000011', '62000000-0000-4000-8000-000000000021', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  (
    '62000000-0000-4000-8000-000000000101', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'stage01_config_read_a',
    'Stage 01 config read A', 'Test-only Stage 01 configuration read role', false
  ),
  (
    '62000000-0000-4000-8000-000000000102', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'stage01_config_update_publish_a',
    'Stage 01 config update/publish A', 'Test-only Stage 01 configuration mutation role', false
  ),
  (
    '62000000-0000-4000-8000-000000000103', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'stage01_config_journey_a',
    'Stage 01 config Journey A', 'Test-only Journey reader role', false
  ),
  (
    '62000000-0000-4000-8000-000000000104', '62000000-0000-4000-8000-000000000011',
    '62000000-0000-4000-8000-000000000021', 'stage01_config_read_b',
    'Stage 01 config read B', 'Test-only second-tenant configuration read role', false
  );

insert into public.role_permissions (role_id, permission_code) values
  ('62000000-0000-4000-8000-000000000101', 'stage01.config.read'),
  ('62000000-0000-4000-8000-000000000102', 'stage01.config.update'),
  ('62000000-0000-4000-8000-000000000102', 'stage01.config.publish'),
  ('62000000-0000-4000-8000-000000000103', 'journey.read'),
  ('62000000-0000-4000-8000-000000000104', 'stage01.config.read');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values
  (
    '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
    '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000101',
    '62000000-0000-4000-8000-000000000001', 'Stage 01 config reader A fixture'
  ),
  (
    '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
    '62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000102',
    '62000000-0000-4000-8000-000000000002', 'Stage 01 config update/publish fixture'
  ),
  (
    '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
    '62000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000103',
    '62000000-0000-4000-8000-000000000003', 'Stage 01 Journey reader fixture'
  ),
  (
    '62000000-0000-4000-8000-000000000011', '62000000-0000-4000-8000-000000000021',
    '62000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000104',
    '62000000-0000-4000-8000-000000000004', 'Stage 01 config reader B fixture'
  );

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values
  (
    '62000000-0000-4000-8000-000000000030', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'vqh.stage01', 1, 1, '{}'::jsonb, 'config-security-stage01-a'
  ),
  (
    '62000000-0000-4000-8000-000000000031', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'other.workflow', 1, 1, '{}'::jsonb, 'config-security-other-a'
  ),
  (
    '62000000-0000-4000-8000-000000000032', '62000000-0000-4000-8000-000000000011',
    '62000000-0000-4000-8000-000000000021', 'vqh.stage01', 1, 1, '{}'::jsonb, 'config-security-stage01-b'
  );

insert into public.workflow_definition_drafts (
  id, tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
  created_by, updated_by
) values
  (
    '62000000-0000-4000-8000-000000000040', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'vqh.stage01',
    '62000000-0000-4000-8000-000000000030', '{}'::jsonb, 0,
    '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001'
  ),
  (
    '62000000-0000-4000-8000-000000000041', '62000000-0000-4000-8000-000000000011',
    '62000000-0000-4000-8000-000000000021', 'vqh.stage01',
    '62000000-0000-4000-8000-000000000032', '{}'::jsonb, 0,
    '62000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000004'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  if (select count(*) from public.workflow_definition_drafts) <> 1
     or not exists (
       select 1 from public.workflow_definition_drafts
       where id = '62000000-0000-4000-8000-000000000040'
     ) then
    raise exception 'DB-S01-CONFIG-SEC read permission did not isolate tenant A drafts';
  end if;

  if (select count(*) from public.workflow_definition_snapshots) <> 1
     or not exists (
       select 1 from public.workflow_definition_snapshots
       where id = '62000000-0000-4000-8000-000000000030'
          and workflow_key = 'vqh.stage01'
     ) then
    raise exception 'DB-S01-CONFIG-SEC read permission did not limit tenant A snapshots to vqh.stage01';
  end if;
end $$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $$
begin
  if (select count(*) from public.workflow_definition_drafts) <> 1
     or not exists (
       select 1 from public.workflow_definition_drafts
       where id = '62000000-0000-4000-8000-000000000041'
     ) then
    raise exception 'DB-S01-CONFIG-SEC read permission did not isolate tenant B drafts';
  end if;

  if (select count(*) from public.workflow_definition_snapshots) <> 1
     or not exists (
       select 1 from public.workflow_definition_snapshots
       where id = '62000000-0000-4000-8000-000000000032'
          and workflow_key = 'vqh.stage01'
     ) then
    raise exception 'DB-S01-CONFIG-SEC read permission did not isolate tenant B snapshots';
  end if;
end $$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  if (select count(*) from public.workflow_definition_drafts) <> 0
     or (select count(*) from public.workflow_definition_snapshots) <> 0 then
    raise exception 'DB-S01-CONFIG-SEC update/publish permissions unexpectedly granted config read';
  end if;

  if (select count(*) from public.workflow_taxonomy_values) <> 0 then
    raise exception 'DB-S01-CONFIG-SEC config permissions unexpectedly granted workflow taxonomy read';
  end if;

  begin
    insert into public.workflow_definition_drafts (
      tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
      created_by, updated_by
    ) values (
      '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
      'vqh.stage01.direct-insert', '62000000-0000-4000-8000-000000000030', '{}'::jsonb, 0,
      '62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002'
    );
    raise exception 'DB-S01-CONFIG-SEC direct draft insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.workflow_definition_drafts
       set version = version + 1
     where id = '62000000-0000-4000-8000-000000000040';
    raise exception 'DB-S01-CONFIG-SEC direct draft update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.workflow_definition_drafts
     where id = '62000000-0000-4000-8000-000000000040';
    raise exception 'DB-S01-CONFIG-SEC direct draft delete unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.workflow_taxonomy_values (
      tenant_id, company_id, workflow_key, taxonomy_key, code, label, semantic_key, behavior, is_active
    ) values (
      '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
      'vqh.stage01', 'customer_type', 'forbidden_config_direct_insert', 'Forbidden config direct insert', null, '{}'::jsonb, true
    );
    raise exception 'DB-S01-CONFIG-SEC config permissions unexpectedly granted workflow taxonomy insert';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $$
begin
  if (select count(*) from public.workflow_definition_drafts) <> 0 then
    raise exception 'DB-S01-CONFIG-SEC Journey permission unexpectedly granted draft read';
  end if;

  if (select count(*) from public.workflow_definition_snapshots) <> 2
     or not exists (
       select 1 from public.workflow_definition_snapshots
       where id = '62000000-0000-4000-8000-000000000031'
          and workflow_key = 'other.workflow'
     ) then
    raise exception 'DB-S01-CONFIG-SEC config policy weakened existing Journey read access';
  end if;
end $$;

reset role;

select 'PASS DB-S01-CONFIG-SEC draft grants, tenant isolation, and snapshot config-read policy' as result;

ROLLBACK;
