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
end $$;

insert into auth.users (id, email) values
  ('62000000-0000-4000-8000-000000000001', 'stage01-config-security@test.invalid');

insert into public.tenants (id, code, name) values
  ('62000000-0000-4000-8000-000000000010', 'stage01-config-security', 'Stage 01 config security test');

insert into public.companies (id, tenant_id, code, name) values
  ('62000000-0000-4000-8000-000000000020', '62000000-0000-4000-8000-000000000010', 'S01-CONFIG-SEC-A', 'Stage 01 config security A'),
  ('62000000-0000-4000-8000-000000000021', '62000000-0000-4000-8000-000000000010', 'S01-CONFIG-SEC-B', 'Stage 01 config security B');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020', array['member']),
  ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000021', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  (
    '62000000-0000-4000-8000-000000000101', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'stage01_config_security_admin',
    'Stage 01 config security admin', 'Test-only Stage 01 configuration role', false
  ),
  (
    '62000000-0000-4000-8000-000000000102', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000020', 'stage01_config_security_journey_reader',
    'Stage 01 config security Journey reader', 'Test-only Journey read role', false
  );

insert into public.role_permissions (role_id, permission_code) values
  ('62000000-0000-4000-8000-000000000101', 'stage01.config.read'),
  ('62000000-0000-4000-8000-000000000101', 'stage01.config.update'),
  ('62000000-0000-4000-8000-000000000101', 'stage01.config.publish'),
  ('62000000-0000-4000-8000-000000000102', 'journey.read');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values (
  '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
  '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000101',
  '62000000-0000-4000-8000-000000000001', 'Stage 01 config security fixture'
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
    '62000000-0000-4000-8000-000000000032', '62000000-0000-4000-8000-000000000010',
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
    '62000000-0000-4000-8000-000000000041', '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000021', 'vqh.stage01',
    '62000000-0000-4000-8000-000000000032', '{}'::jsonb, 0,
    '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001'
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
    raise exception 'DB-S01-CONFIG-SEC draft RLS did not enforce tenant/company scope';
  end if;

  if (select count(*) from public.workflow_definition_snapshots) <> 1
     or not exists (
       select 1 from public.workflow_definition_snapshots
       where id = '62000000-0000-4000-8000-000000000030'
          and workflow_key = 'vqh.stage01'
     ) then
    raise exception 'DB-S01-CONFIG-SEC config read did not limit snapshots to scoped vqh.stage01';
  end if;

  begin
    insert into public.workflow_definition_drafts (
      tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
      created_by, updated_by
    ) values (
      '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
      'vqh.stage01.direct-insert', '62000000-0000-4000-8000-000000000030', '{}'::jsonb, 0,
      '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001'
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
end $$;

reset role;

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values (
  '62000000-0000-4000-8000-000000000010', '62000000-0000-4000-8000-000000000020',
  '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000102',
  '62000000-0000-4000-8000-000000000001', 'Verify Journey read remains independent'
);

set local role authenticated;

do $$
begin
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

select 'PASS DB-S01-CONFIG-SEC draft grants, RLS, and snapshot config-read policy' as result;

ROLLBACK;
