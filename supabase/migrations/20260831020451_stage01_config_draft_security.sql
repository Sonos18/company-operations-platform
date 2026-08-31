create table public.workflow_definition_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  workflow_key text not null,
  base_snapshot_id uuid not null,
  definition jsonb not null,
  version bigint not null default 0,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint workflow_definition_drafts_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete restrict,
  constraint workflow_definition_drafts_base_snapshot_fk foreign key (base_snapshot_id, tenant_id, company_id)
    references public.workflow_definition_snapshots (id, tenant_id, company_id) on delete restrict,
  constraint workflow_definition_drafts_workflow_key_not_blank check (btrim(workflow_key) <> ''),
  constraint workflow_definition_drafts_company_workflow_key unique (company_id, workflow_key),
  constraint workflow_definition_drafts_version_nonnegative check (version >= 0),
  constraint workflow_definition_drafts_definition_object check (jsonb_typeof(definition) = 'object')
);

create index workflow_definition_drafts_scope_key_idx
  on public.workflow_definition_drafts (tenant_id, company_id, workflow_key);
create index workflow_definition_drafts_base_snapshot_scope_idx
  on public.workflow_definition_drafts (base_snapshot_id, tenant_id, company_id);

insert into public.permissions (code, module, name, description) values
  ('stage01.config.read', 'stage01', 'Read Stage 01 configuration', 'Read published Stage 01 configuration and active drafts'),
  ('stage01.config.update', 'stage01', 'Update Stage 01 configuration', 'Create, update, and discard Stage 01 configuration drafts'),
  ('stage01.config.publish', 'stage01', 'Publish Stage 01 configuration', 'Publish immutable Stage 01 configuration snapshots')
on conflict (code) do update set
  module = excluded.module,
  name = excluded.name,
  description = excluded.description;

do $$
begin
  if not exists (
    select 1
    from public.roles as company_role
    where company_role.id = '10000000-0000-4000-8000-000000000308'::uuid
      and company_role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'::uuid
      and company_role.code = 'company_admin'
      and company_role.is_active
  ) then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
end $$;

insert into public.role_permissions (role_id, permission_code)
select
  '10000000-0000-4000-8000-000000000308'::uuid,
  config_permission.code
from (values
  ('stage01.config.read'),
  ('stage01.config.update'),
  ('stage01.config.publish')
) as config_permission(code)
on conflict do nothing;

alter table public.workflow_definition_drafts enable row level security;

revoke all on table public.workflow_definition_drafts from anon, authenticated;
grant select on table public.workflow_definition_drafts to authenticated;

create policy stage01_workflow_definition_drafts_config_read
  on public.workflow_definition_drafts
  for select
  to authenticated
  using (private.has_company_permission(tenant_id, company_id, 'stage01.config.read'));

create policy stage01_workflow_definition_snapshots_config_read
  on public.workflow_definition_snapshots
  for select
  to authenticated
  using (
    workflow_key = 'vqh.stage01'
    and private.has_company_permission(tenant_id, company_id, 'stage01.config.read')
  );
