create table public.workflow_definition_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  workflow_key text not null,
  template_version integer not null,
  schema_version integer not null,
  definition jsonb not null,
  definition_hash text not null,
  created_at timestamptz not null default now(),
  constraint workflow_definition_snapshots_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete restrict,
  constraint workflow_definition_snapshots_workflow_key_not_blank check (btrim(workflow_key) <> ''),
  constraint workflow_definition_snapshots_template_version_positive check (template_version > 0),
  constraint workflow_definition_snapshots_schema_version_positive check (schema_version > 0),
  constraint workflow_definition_snapshots_definition_object check (jsonb_typeof(definition) = 'object'),
  constraint workflow_definition_snapshots_hash_not_blank check (btrim(definition_hash) <> ''),
  constraint workflow_definition_snapshots_id_scope_key unique (id, tenant_id, company_id)
);

create unique index workflow_definition_snapshots_company_key_version_key
  on public.workflow_definition_snapshots (company_id, workflow_key, template_version);
create index workflow_definition_snapshots_scope_key_idx
  on public.workflow_definition_snapshots (tenant_id, company_id, workflow_key, template_version desc);

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  subject_type text not null,
  subject_id uuid not null,
  definition_snapshot_id uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint workflow_instances_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete restrict,
  constraint workflow_instances_definition_fk foreign key (definition_snapshot_id, tenant_id, company_id)
    references public.workflow_definition_snapshots (id, tenant_id, company_id) on delete restrict,
  constraint workflow_instances_subject_type_not_blank check (btrim(subject_type) <> ''),
  constraint workflow_instances_subject_key unique (company_id, subject_type, subject_id),
  constraint workflow_instances_id_scope_key unique (id, tenant_id, company_id)
);

create index workflow_instances_scope_subject_idx
  on public.workflow_instances (tenant_id, company_id, subject_type, subject_id);

create table public.workflow_node_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  workflow_instance_id uuid not null,
  node_key text not null,
  node_type text not null,
  parent_node_key text,
  created_at timestamptz not null default now(),
  constraint workflow_node_instances_workflow_fk foreign key (workflow_instance_id, tenant_id, company_id)
    references public.workflow_instances (id, tenant_id, company_id) on delete restrict,
  constraint workflow_node_instances_node_key_not_blank check (btrim(node_key) <> ''),
  constraint workflow_node_instances_node_type_not_blank check (btrim(node_type) <> ''),
  constraint workflow_node_instances_parent_key_not_blank check (parent_node_key is null or btrim(parent_node_key) <> ''),
  constraint workflow_node_instances_workflow_node_key unique (workflow_instance_id, node_key),
  constraint workflow_node_instances_id_scope_key unique (id, tenant_id, company_id)
);

create index workflow_node_instances_scope_workflow_idx
  on public.workflow_node_instances (tenant_id, company_id, workflow_instance_id, node_key);

create table public.workflow_node_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  node_instance_id uuid not null,
  execution_no integer not null,
  phase text not null default 'not_started',
  needs_revalidation boolean not null default false,
  started_by uuid references auth.users (id) on delete restrict,
  started_at timestamptz,
  completed_by uuid references auth.users (id) on delete restrict,
  completed_at timestamptz,
  superseded_at timestamptz,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint workflow_node_executions_node_fk foreign key (node_instance_id, tenant_id, company_id)
    references public.workflow_node_instances (id, tenant_id, company_id) on delete restrict,
  constraint workflow_node_executions_execution_no_positive check (execution_no > 0),
  constraint workflow_node_executions_phase_check check (phase in ('not_started', 'active', 'completed', 'not_applicable')),
  constraint workflow_node_executions_version_nonnegative check (version >= 0),
  constraint workflow_node_executions_started_pair check ((started_by is null) = (started_at is null)),
  constraint workflow_node_executions_completed_pair check ((completed_by is null) = (completed_at is null)),
  constraint workflow_node_executions_phase_timestamps check (
    (phase = 'not_started' and started_at is null and completed_at is null)
    or (phase = 'active' and started_at is not null and completed_at is null)
    or (phase = 'completed' and started_at is not null and completed_at is not null)
    or (phase = 'not_applicable' and completed_at is null)
  ),
  constraint workflow_node_executions_completion_order check (completed_at is null or completed_at >= started_at),
  constraint workflow_node_executions_supersession_order check (superseded_at is null or superseded_at >= created_at),
  constraint workflow_node_executions_node_execution_key unique (node_instance_id, execution_no),
  constraint workflow_node_executions_id_scope_key unique (id, tenant_id, company_id)
);

create unique index workflow_node_executions_one_current
  on public.workflow_node_executions (node_instance_id)
  where superseded_at is null;
create index workflow_node_executions_scope_node_idx
  on public.workflow_node_executions (tenant_id, company_id, node_instance_id, execution_no desc);

create table public.workflow_node_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  node_execution_id uuid not null,
  event_type text not null,
  actor_id uuid not null references auth.users (id) on delete restrict,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint workflow_node_events_execution_fk foreign key (node_execution_id, tenant_id, company_id)
    references public.workflow_node_executions (id, tenant_id, company_id) on delete restrict,
  constraint workflow_node_events_event_type_not_blank check (btrim(event_type) <> ''),
  constraint workflow_node_events_reason_not_blank check (reason is null or btrim(reason) <> ''),
  constraint workflow_node_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index workflow_node_events_scope_execution_idx
  on public.workflow_node_events (tenant_id, company_id, node_execution_id, id);
create index workflow_node_events_request_id_idx
  on public.workflow_node_events (request_id);

create table public.workflow_node_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  node_execution_id uuid not null,
  assignment_kind text not null,
  assignee_user_id uuid not null references auth.users (id) on delete restrict,
  assigned_by uuid not null references auth.users (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assignment_reason text,
  ended_by uuid references auth.users (id) on delete restrict,
  ended_at timestamptz,
  end_reason text,
  constraint workflow_node_assignments_execution_fk foreign key (node_execution_id, tenant_id, company_id)
    references public.workflow_node_executions (id, tenant_id, company_id) on delete restrict,
  constraint workflow_node_assignments_kind_check check (assignment_kind in ('accountable_owner', 'contributor')),
  constraint workflow_node_assignments_reason_not_blank check (assignment_reason is null or btrim(assignment_reason) <> ''),
  constraint workflow_node_assignments_end_fields check (
    (ended_by is null and ended_at is null and end_reason is null)
    or (ended_by is not null and ended_at is not null and end_reason is not null and btrim(end_reason) <> '' and ended_at >= assigned_at)
  ),
  constraint workflow_node_assignments_id_scope_key unique (id, tenant_id, company_id)
);

create unique index workflow_node_assignments_one_active_owner
  on public.workflow_node_assignments (node_execution_id)
  where assignment_kind = 'accountable_owner' and ended_at is null;
create index workflow_node_assignments_scope_execution_idx
  on public.workflow_node_assignments (tenant_id, company_id, node_execution_id, assigned_at desc);
create index workflow_node_assignments_assignee_idx
  on public.workflow_node_assignments (assignee_user_id) where ended_at is null;

create table public.workflow_blockers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  node_execution_id uuid not null,
  effect text not null,
  category_code text not null,
  description text not null,
  raised_by uuid not null references auth.users (id) on delete restrict,
  raised_at timestamptz not null default now(),
  responsible_user_id uuid references auth.users (id) on delete restrict,
  resolved_by uuid references auth.users (id) on delete restrict,
  resolved_at timestamptz,
  resolution text,
  version bigint not null default 0,
  constraint workflow_blockers_execution_fk foreign key (node_execution_id, tenant_id, company_id)
    references public.workflow_node_executions (id, tenant_id, company_id) on delete restrict,
  constraint workflow_blockers_effect_check check (effect in ('blocking', 'non_blocking')),
  constraint workflow_blockers_category_not_blank check (btrim(category_code) <> ''),
  constraint workflow_blockers_description_not_blank check (btrim(description) <> ''),
  constraint workflow_blockers_version_nonnegative check (version >= 0),
  constraint workflow_blockers_resolution_fields check (
    (resolved_by is null and resolved_at is null and resolution is null)
    or (resolved_by is not null and resolved_at is not null and resolution is not null and btrim(resolution) <> '' and resolved_at >= raised_at)
  ),
  constraint workflow_blockers_id_scope_key unique (id, tenant_id, company_id)
);

create index workflow_blockers_scope_execution_open_idx
  on public.workflow_blockers (tenant_id, company_id, node_execution_id, effect)
  where resolved_at is null;
create index workflow_blockers_responsible_user_idx
  on public.workflow_blockers (responsible_user_id) where resolved_at is null;

alter table public.workflow_definition_snapshots enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_node_instances enable row level security;
alter table public.workflow_node_executions enable row level security;
alter table public.workflow_node_events enable row level security;
alter table public.workflow_node_assignments enable row level security;
alter table public.workflow_blockers enable row level security;

revoke all on table public.workflow_definition_snapshots from anon, authenticated;
revoke all on table public.workflow_instances from anon, authenticated;
revoke all on table public.workflow_node_instances from anon, authenticated;
revoke all on table public.workflow_node_executions from anon, authenticated;
revoke all on table public.workflow_node_events from anon, authenticated;
revoke all on table public.workflow_node_assignments from anon, authenticated;
revoke all on table public.workflow_blockers from anon, authenticated;
