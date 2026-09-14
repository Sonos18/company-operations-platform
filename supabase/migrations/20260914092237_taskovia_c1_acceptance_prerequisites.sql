do $$
begin
  if exists (select 1 from public.tenants where id = 'c1000000-0000-4000-8000-000000000010'::uuid)
    and not exists (select 1 from public.tenants where id = 'c1000000-0000-4000-8000-000000000010'::uuid and code = 'c1-acceptance' and name = 'Taskovia C1 Acceptance' and deployment_mode = 'shared')
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;
  if exists (select 1 from public.tenants where code = 'c1-acceptance' and id <> 'c1000000-0000-4000-8000-000000000010'::uuid)
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;

  insert into public.tenants (id, code, name, deployment_mode)
  select 'c1000000-0000-4000-8000-000000000010'::uuid, 'c1-acceptance', 'Taskovia C1 Acceptance', 'shared'
  where not exists (select 1 from public.tenants where id = 'c1000000-0000-4000-8000-000000000010'::uuid);

  if exists (select 1 from public.companies where id = 'c1000000-0000-4000-8000-000000000020'::uuid)
    and not exists (select 1 from public.companies where id = 'c1000000-0000-4000-8000-000000000020'::uuid and tenant_id = 'c1000000-0000-4000-8000-000000000010'::uuid and code = 'C1-ACCEPTANCE-A1' and name = 'Taskovia C1 Acceptance Primary')
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;
  if exists (select 1 from public.companies where tenant_id = 'c1000000-0000-4000-8000-000000000010'::uuid and code = 'C1-ACCEPTANCE-A1' and id <> 'c1000000-0000-4000-8000-000000000020'::uuid)
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;

  insert into public.companies (id, tenant_id, code, name)
  select 'c1000000-0000-4000-8000-000000000020'::uuid, 'c1000000-0000-4000-8000-000000000010'::uuid, 'C1-ACCEPTANCE-A1', 'Taskovia C1 Acceptance Primary'
  where not exists (select 1 from public.companies where id = 'c1000000-0000-4000-8000-000000000020'::uuid);

  if exists (select 1 from public.companies where id = 'c1000000-0000-4000-8000-000000000021'::uuid)
    and not exists (select 1 from public.companies where id = 'c1000000-0000-4000-8000-000000000021'::uuid and tenant_id = 'c1000000-0000-4000-8000-000000000010'::uuid and code = 'C1-ACCEPTANCE-A2' and name = 'Taskovia C1 Acceptance Denial Target')
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;
  if exists (select 1 from public.companies where tenant_id = 'c1000000-0000-4000-8000-000000000010'::uuid and code = 'C1-ACCEPTANCE-A2' and id <> 'c1000000-0000-4000-8000-000000000021'::uuid)
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;

  insert into public.companies (id, tenant_id, code, name)
  select 'c1000000-0000-4000-8000-000000000021'::uuid, 'c1000000-0000-4000-8000-000000000010'::uuid, 'C1-ACCEPTANCE-A2', 'Taskovia C1 Acceptance Denial Target'
  where not exists (select 1 from public.companies where id = 'c1000000-0000-4000-8000-000000000021'::uuid);

  if exists (select 1 from public.roles where id = 'c1000000-0000-4000-8000-000000000911'::uuid)
    and not exists (select 1 from public.roles where id = 'c1000000-0000-4000-8000-000000000911'::uuid and tenant_id = 'c1000000-0000-4000-8000-000000000010'::uuid and company_id = 'c1000000-0000-4000-8000-000000000020'::uuid and code = 'c1_acceptance_importer' and name = 'C1 acceptance importer' and description = 'Synthetic C1 acceptance import capability' and is_privileged = false and is_system = false and is_active = true)
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;
  if exists (select 1 from public.roles where company_id = 'c1000000-0000-4000-8000-000000000020'::uuid and code = 'c1_acceptance_importer' and id <> 'c1000000-0000-4000-8000-000000000911'::uuid)
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;

  insert into public.roles (id, tenant_id, company_id, code, name, description, is_privileged, is_system, is_active)
  select 'c1000000-0000-4000-8000-000000000911'::uuid, 'c1000000-0000-4000-8000-000000000010'::uuid, 'c1000000-0000-4000-8000-000000000020'::uuid, 'c1_acceptance_importer', 'C1 acceptance importer', 'Synthetic C1 acceptance import capability', false, false, true
  where not exists (select 1 from public.roles where id = 'c1000000-0000-4000-8000-000000000911'::uuid);

  if exists (select 1 from public.roles where id = 'c1000000-0000-4000-8000-000000000912'::uuid)
    and not exists (select 1 from public.roles where id = 'c1000000-0000-4000-8000-000000000912'::uuid and tenant_id = 'c1000000-0000-4000-8000-000000000010'::uuid and company_id = 'c1000000-0000-4000-8000-000000000020'::uuid and code = 'c1_acceptance_source_only' and name = 'C1 acceptance source-only' and description = 'Synthetic C1 acceptance source-only capability' and is_privileged = false and is_system = false and is_active = true)
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;
  if exists (select 1 from public.roles where company_id = 'c1000000-0000-4000-8000-000000000020'::uuid and code = 'c1_acceptance_source_only' and id <> 'c1000000-0000-4000-8000-000000000912'::uuid)
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;

  insert into public.roles (id, tenant_id, company_id, code, name, description, is_privileged, is_system, is_active)
  select 'c1000000-0000-4000-8000-000000000912'::uuid, 'c1000000-0000-4000-8000-000000000010'::uuid, 'c1000000-0000-4000-8000-000000000020'::uuid, 'c1_acceptance_source_only', 'C1 acceptance source-only', 'Synthetic C1 acceptance source-only capability', false, false, true
  where not exists (select 1 from public.roles where id = 'c1000000-0000-4000-8000-000000000912'::uuid);

  if (select count(*) from public.permissions where code in ('cost.source.read', 'cost.prepare')) <> 2
  then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;
end $$;

insert into public.role_permissions (role_id, permission_code) values
  ('c1000000-0000-4000-8000-000000000911'::uuid, 'cost.source.read'),
  ('c1000000-0000-4000-8000-000000000911'::uuid, 'cost.prepare'),
  ('c1000000-0000-4000-8000-000000000912'::uuid, 'cost.source.read')
on conflict do nothing;

do $$
begin
  if exists (
    (select permission_code from public.role_permissions where role_id = 'c1000000-0000-4000-8000-000000000911'::uuid
      except select unnest(array['cost.source.read', 'cost.prepare']::text[]))
    union all
    (select unnest(array['cost.source.read', 'cost.prepare']::text[])
      except select permission_code from public.role_permissions where role_id = 'c1000000-0000-4000-8000-000000000911'::uuid)
    union all
    (select permission_code from public.role_permissions where role_id = 'c1000000-0000-4000-8000-000000000912'::uuid
      except select unnest(array['cost.source.read']::text[]))
    union all
    (select unnest(array['cost.source.read']::text[])
      except select permission_code from public.role_permissions where role_id = 'c1000000-0000-4000-8000-000000000912'::uuid)
  ) then raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'; end if;
end $$;

insert into private.controlled_import_adapter_versions (workbook_family, adapter_id, adapter_version)
values ('taskovia-vqh-project-cost-workbooks-v1', 'taskovia-vqh-project-cost-workbooks', '0.1.0-candidate')
on conflict do nothing;
