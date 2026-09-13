create table private.controlled_import_adapter_versions (
  workbook_family text not null,
  adapter_id text not null,
  adapter_version text not null,
  primary key (workbook_family, adapter_id, adapter_version)
);
revoke all on private.controlled_import_adapter_versions from public, anon, authenticated;

create table public.controlled_import_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  run_id uuid not null,
  actor_id uuid not null references auth.users(id),
  command_name text not null default 'controlled_import',
  idempotency_key uuid not null,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  manifest_digest text not null check (manifest_digest ~ '^[a-f0-9]{64}$'),
  input_digests text[] not null,
  workbook_family text not null,
  adapter_id text not null,
  adapter_version text not null,
  manifest_snapshot jsonb not null check (jsonb_typeof(manifest_snapshot) = 'object'),
  result jsonb,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  unique (company_id, run_id),
  unique (company_id, command_name, idempotency_key),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id)
);

create table public.accounting_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  code text not null,
  title text not null,
  source_system text not null,
  suggested_project_id uuid,
  is_archived boolean not null default false,
  version bigint not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  unique (company_id, code),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id),
  foreign key (suggested_project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id)
);

create table public.accounting_source_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  source_id uuid not null,
  import_run_id uuid not null,
  version_no bigint not null check (version_no > 0),
  input_file_identity text not null,
  input_file_sha256 text not null check (input_file_sha256 ~ '^[a-f0-9]{64}$'),
  original_filename text not null,
  raw_file_reference text,
  source_version_label text,
  source_period_text text,
  source_as_of_text text,
  status text not null default 'draft' check (status in ('draft', 'shared')),
  version bigint not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  shared_by uuid references auth.users(id),
  shared_at timestamptz,
  unique (id, tenant_id, company_id),
  unique (source_id, version_no),
  unique (source_id, input_file_identity, input_file_sha256),
  foreign key (source_id, tenant_id, company_id) references public.accounting_sources(id, tenant_id, company_id),
  foreign key (import_run_id, tenant_id, company_id) references public.controlled_import_runs(id, tenant_id, company_id)
);

alter table public.project_engagements
  add constraint project_engagements_scope_project_unique unique (id, tenant_id, company_id, project_id);
alter table public.engagement_components
  add constraint engagement_components_scope_engagement_unique unique (id, tenant_id, company_id, engagement_id);

create table public.source_selections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  source_version_id uuid not null,
  import_run_id uuid not null,
  locator jsonb not null check (jsonb_typeof(locator) = 'object'),
  locator_key text not null,
  mapping_state text not null check (mapping_state in ('confirmed', 'pending', 'reference_only', 'excluded')),
  reviewed_mapping jsonb not null check (jsonb_typeof(reviewed_mapping) = 'object'),
  mapped_project_id uuid,
  mapped_party_id uuid,
  mapped_engagement_id uuid,
  mapped_component_id uuid,
  observed_labels text[] not null,
  raw_values text[] not null,
  unresolved_issues text[] not null,
  version bigint not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  unique (source_version_id, locator_key),
  foreign key (source_version_id, tenant_id, company_id) references public.accounting_source_versions(id, tenant_id, company_id),
  foreign key (import_run_id, tenant_id, company_id) references public.controlled_import_runs(id, tenant_id, company_id),
  foreign key (mapped_project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id),
  foreign key (mapped_party_id, tenant_id, company_id) references public.business_parties(id, tenant_id, company_id),
  foreign key (mapped_engagement_id, tenant_id, company_id, mapped_project_id) references public.project_engagements(id, tenant_id, company_id, project_id),
  foreign key (mapped_component_id, tenant_id, company_id, mapped_engagement_id) references public.engagement_components(id, tenant_id, company_id, engagement_id),
  check (mapped_engagement_id is null or mapped_project_id is not null),
  check (mapped_component_id is null or mapped_engagement_id is not null)
);

create table public.source_reported_figures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  source_selection_id uuid not null,
  import_run_id uuid not null,
  figure_identity text not null check (figure_identity ~ '^[a-f0-9]{64}$'),
  label text not null,
  raw_value_text text not null,
  value_state text not null check (value_state in ('known', 'blank', 'formula_error', 'missing_cached', 'not_numeric')),
  amount_text text,
  amount numeric(20,4),
  currency_code text check (currency_code is null or char_length(currency_code) = 3),
  metric_kind text not null check (metric_kind in ('cost_total', 'labor_total', 'commitment_total', 'cash_total', 'reported_balance', 'unclassified')),
  basis text not null check (basis in ('net', 'gross', 'payable_basis', 'cash', 'mixed', 'unknown')),
  balance_kind text check (balance_kind is null or balance_kind in ('total_outstanding', 'outside_retention', 'unallocated_cash', 'unknown')),
  rounding_basis text not null check (rounding_basis in ('exact', 'source_rounded', 'unknown')),
  rounding_note text,
  period_basis text not null check (period_basis in ('activity_range', 'cumulative_as_of', 'unknown')),
  period_from date,
  period_to date,
  as_of_date date,
  mapping_state text not null check (mapping_state in ('confirmed', 'pending', 'reference_only', 'excluded')),
  reviewed_mapping jsonb not null check (jsonb_typeof(reviewed_mapping) = 'object'),
  project_id uuid,
  party_id uuid,
  engagement_id uuid,
  component_id uuid,
  scope_kind text not null check (scope_kind in ('subcontractors_only', 'whole_project', 'mixed', 'unknown')),
  scope_description text not null,
  confirmation text not null check (confirmation in ('unverified', 'confirmed_external', 'disputed')),
  confirmation_reference text,
  status text not null default 'draft' check (status in ('draft', 'shared')),
  version bigint not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  shared_by uuid references auth.users(id),
  shared_at timestamptz,
  unique (id, tenant_id, company_id),
  unique (source_selection_id, figure_identity),
  foreign key (source_selection_id, tenant_id, company_id) references public.source_selections(id, tenant_id, company_id),
  foreign key (import_run_id, tenant_id, company_id) references public.controlled_import_runs(id, tenant_id, company_id),
  foreign key (project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id),
  foreign key (party_id, tenant_id, company_id) references public.business_parties(id, tenant_id, company_id),
  foreign key (engagement_id, tenant_id, company_id, project_id) references public.project_engagements(id, tenant_id, company_id, project_id),
  foreign key (component_id, tenant_id, company_id, engagement_id) references public.engagement_components(id, tenant_id, company_id, engagement_id),
  check ((value_state = 'known' and amount_text is not null and amount is not null) or (value_state <> 'known' and amount_text is null and amount is null)),
  check (amount_text is null or amount_text ~ '^-?[0-9]{1,16}(\.[0-9]{1,4})?$'),
  check (amount_text is null or amount_text::numeric = amount),
  check (engagement_id is null or project_id is not null),
  check (component_id is null or engagement_id is not null)
);

create table public.source_review_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  source_selection_id uuid not null,
  import_run_id uuid not null,
  issue_identity text not null check (issue_identity ~ '^[a-f0-9]{64}$'),
  issue_kind text not null check (issue_kind in ('scope_uncertain', 'party_uncertain', 'semantics_uncertain', 'date_conflict', 'rounding_difference', 'formula_error', 'possible_duplicate', 'coverage_overlap', 'other')),
  impact text not null check (impact in ('blocks_normalization', 'comparison_only')),
  description text not null,
  reference text,
  affected_mapping jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  version bigint not null default 0,
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  unique (id, tenant_id, company_id),
  unique (source_selection_id, issue_identity),
  foreign key (source_selection_id, tenant_id, company_id) references public.source_selections(id, tenant_id, company_id),
  foreign key (import_run_id, tenant_id, company_id) references public.controlled_import_runs(id, tenant_id, company_id)
);

create table public.controlled_import_descriptor_map (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  import_run_id uuid not null,
  descriptor_kind text not null check (descriptor_kind in ('source', 'source_version', 'section', 'figure', 'review_issue')),
  descriptor_id text not null,
  descriptor_ordinal integer not null check (descriptor_ordinal >= 0),
  persisted_resource_id uuid not null,
  created_at timestamptz not null default now(),
  unique (import_run_id, descriptor_kind, descriptor_id),
  unique (import_run_id, descriptor_kind, descriptor_ordinal),
  foreign key (import_run_id, tenant_id, company_id) references public.controlled_import_runs(id, tenant_id, company_id)
);

create index controlled_import_runs_scope_created_idx on public.controlled_import_runs(tenant_id, company_id, created_at, id);
create index accounting_sources_scope_created_idx on public.accounting_sources(tenant_id, company_id, created_at, id);
create index accounting_source_versions_source_idx on public.accounting_source_versions(tenant_id, company_id, source_id, version_no);
create index source_selections_version_idx on public.source_selections(tenant_id, company_id, source_version_id, created_at, id);
create index source_reported_figures_selection_idx on public.source_reported_figures(tenant_id, company_id, source_selection_id, created_at, id);
create index source_review_issues_selection_idx on public.source_review_issues(tenant_id, company_id, source_selection_id, status, opened_at, id);
create index controlled_import_descriptor_map_run_idx on public.controlled_import_descriptor_map(tenant_id, company_id, import_run_id, descriptor_kind, descriptor_ordinal);

alter table public.controlled_import_runs enable row level security;
alter table public.accounting_sources enable row level security;
alter table public.accounting_source_versions enable row level security;
alter table public.source_selections enable row level security;
alter table public.source_reported_figures enable row level security;
alter table public.source_review_issues enable row level security;
alter table public.controlled_import_descriptor_map enable row level security;
alter table public.controlled_import_runs force row level security;
alter table public.accounting_sources force row level security;
alter table public.accounting_source_versions force row level security;
alter table public.source_selections force row level security;
alter table public.source_reported_figures force row level security;
alter table public.source_review_issues force row level security;
alter table public.controlled_import_descriptor_map force row level security;

revoke all on public.controlled_import_runs, public.accounting_sources, public.accounting_source_versions,
  public.source_selections, public.source_reported_figures, public.source_review_issues,
  public.controlled_import_descriptor_map from public, anon, authenticated;
grant select on public.controlled_import_runs, public.accounting_sources, public.accounting_source_versions,
  public.source_selections, public.source_reported_figures, public.source_review_issues,
  public.controlled_import_descriptor_map to authenticated;

create function private.c1_can_read_import_draft(target_tenant_id uuid, target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_cost_settings settings
    where settings.tenant_id = target_tenant_id and settings.company_id = target_company_id and settings.enabled
  )
  and private.has_company_permission(target_tenant_id, target_company_id, 'cost.source.read')
  and private.has_company_permission(target_tenant_id, target_company_id, 'cost.prepare');
$$;

create policy c1_controlled_import_runs_select on public.controlled_import_runs for select to authenticated using (
  private.c1_can_read_import_draft(tenant_id, company_id)
);
create policy c1_accounting_sources_select on public.accounting_sources for select to authenticated using (
  private.c1_can_read_import_draft(tenant_id, company_id)
);
create policy c1_accounting_source_versions_select on public.accounting_source_versions for select to authenticated using (
  private.c1_can_read_import_draft(tenant_id, company_id)
);
create policy c1_source_selections_select on public.source_selections for select to authenticated using (
  private.c1_can_read_import_draft(tenant_id, company_id)
);
create policy c1_source_reported_figures_select on public.source_reported_figures for select to authenticated using (
  private.c1_can_read_import_draft(tenant_id, company_id)
);
create policy c1_source_review_issues_select on public.source_review_issues for select to authenticated using (
  private.c1_can_read_import_draft(tenant_id, company_id)
);
create policy c1_controlled_import_descriptor_map_select on public.controlled_import_descriptor_map for select to authenticated using (
  private.c1_can_read_import_draft(tenant_id, company_id)
);

grant select on public.cost_document_events to authenticated;
create policy c1_controlled_import_events_select on public.cost_document_events for select to authenticated using (
  resource_type = 'controlled_import_run'
  and private.c1_can_read_import_draft(tenant_id, company_id)
);

create function private.c1_jsonb_canonical_text(target_value jsonb)
returns text
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare v_value_type text := jsonb_typeof(target_value); v_result text;
begin
  if v_value_type = 'object' then
    select coalesce('{' || string_agg(to_jsonb(entry.key)::text || ':' || private.c1_jsonb_canonical_text(entry.value), ',' order by entry.key) || '}', '{}')
    into v_result from jsonb_each(target_value) entry;
    return v_result;
  end if;
  if v_value_type = 'array' then
    select coalesce('[' || string_agg(private.c1_jsonb_canonical_text(entry.value), ',' order by entry.ordinality) || ']', '[]')
    into v_result from jsonb_array_elements(target_value) with ordinality entry(value, ordinality);
    return v_result;
  end if;
  return target_value::text;
end;
$$;

create function private.c1_jsonb_is_string_array(target_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(target_value) is distinct from 'array' then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(target_value) item
    where jsonb_typeof(item) is distinct from 'string'
  );
end;
$$;

create function private.c1_assert_controlled_import_mapping(
  target_tenant_id uuid,
  target_company_id uuid,
  target_mapping jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project_id uuid; v_party_id uuid; v_engagement_id uuid; v_component_id uuid;
begin
  if jsonb_typeof(target_mapping) is distinct from 'object'
    or not (target_mapping ? 'state')
    or jsonb_typeof(target_mapping->'state') is distinct from 'string'
    or target_mapping->>'state' not in ('confirmed', 'pending', 'reference_only', 'excluded')
    or exists (select 1 from jsonb_object_keys(target_mapping) key where key not in ('state', 'projectId', 'partyId', 'engagementId', 'componentId', 'note'))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  if target_mapping ? 'note' and jsonb_typeof(target_mapping->'note') is distinct from 'string' then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  if target_mapping ? 'projectId' then
    if jsonb_typeof(target_mapping->'projectId') is distinct from 'string' or target_mapping->>'projectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    v_project_id := (target_mapping->>'projectId')::uuid;
    if not exists (select 1 from public.projects project where project.id = v_project_id and project.tenant_id = target_tenant_id and project.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  if target_mapping ? 'partyId' then
    if jsonb_typeof(target_mapping->'partyId') is distinct from 'string' or target_mapping->>'partyId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    v_party_id := (target_mapping->>'partyId')::uuid;
    if not exists (select 1 from public.business_parties party where party.id = v_party_id and party.tenant_id = target_tenant_id and party.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  if target_mapping ? 'engagementId' then
    if jsonb_typeof(target_mapping->'engagementId') is distinct from 'string' or target_mapping->>'engagementId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or v_project_id is null then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    v_engagement_id := (target_mapping->>'engagementId')::uuid;
    if not exists (select 1 from public.project_engagements engagement where engagement.id = v_engagement_id and engagement.tenant_id = target_tenant_id and engagement.company_id = target_company_id and engagement.project_id = v_project_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
  if target_mapping ? 'componentId' then
    if jsonb_typeof(target_mapping->'componentId') is distinct from 'string' or target_mapping->>'componentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or v_engagement_id is null then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    v_component_id := (target_mapping->>'componentId')::uuid;
    if not exists (select 1 from public.engagement_components component where component.id = v_component_id and component.tenant_id = target_tenant_id and component.company_id = target_company_id and component.engagement_id = v_engagement_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  end if;
end;
$$;

create function private.c1_normalize_import_cell_range(target_range text)
returns text
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  v_match text[];
  v_left_column numeric := 0;
  v_right_column numeric := 0;
  v_left_row numeric;
  v_right_row numeric;
  v_current numeric;
  v_left_label text := '';
  v_right_label text := '';
  v_index integer;
begin
  v_match := regexp_match(target_range, '^([A-Z]+)([1-9][0-9]*):([A-Z]+)([1-9][0-9]*)$');
  if v_match is null then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  for v_index in 1..char_length(v_match[1]) loop v_left_column := v_left_column * 26 + ascii(substr(v_match[1], v_index, 1)) - 64; end loop;
  for v_index in 1..char_length(v_match[3]) loop v_right_column := v_right_column * 26 + ascii(substr(v_match[3], v_index, 1)) - 64; end loop;
  v_left_row := v_match[2]::numeric;
  v_right_row := v_match[4]::numeric;
  v_current := least(v_left_column, v_right_column);
  while v_current > 0 loop v_left_label := chr(65 + mod(v_current - 1, 26)::integer) || v_left_label; v_current := floor((v_current - 1) / 26); end loop;
  v_current := greatest(v_left_column, v_right_column);
  while v_current > 0 loop v_right_label := chr(65 + mod(v_current - 1, 26)::integer) || v_right_label; v_current := floor((v_current - 1) / 26); end loop;
  return v_left_label || least(v_left_row, v_right_row)::text || ':' || v_right_label || greatest(v_left_row, v_right_row)::text;
end;
$$;

create function private.c1_reject_import_history_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE';
end;
$$;

create trigger c1_accounting_source_versions_immutable before update or delete on public.accounting_source_versions for each row execute function private.c1_reject_import_history_mutation();
create trigger c1_source_selections_immutable before update or delete on public.source_selections for each row execute function private.c1_reject_import_history_mutation();
create trigger c1_source_reported_figures_immutable before update or delete on public.source_reported_figures for each row execute function private.c1_reject_import_history_mutation();
create trigger c1_source_review_issues_immutable before update or delete on public.source_review_issues for each row execute function private.c1_reject_import_history_mutation();
create trigger c1_controlled_import_descriptor_map_immutable before update or delete on public.controlled_import_descriptor_map for each row execute function private.c1_reject_import_history_mutation();
create trigger c1_controlled_import_events_immutable before update or delete on public.cost_document_events for each row when (old.resource_type = 'controlled_import_run') execute function private.c1_reject_import_history_mutation();

create function private.c1_persist_controlled_import(
  target_company_id uuid,
  target_request jsonb,
  target_payload_digest text,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_actor_id uuid;
  v_tenant_id uuid;
  v_manifest jsonb;
  v_manifest_digest text;
  v_actual_input_digests text[];
  v_manifest_input_digests text[];
  v_input_digest_text text;
  v_computed_payload_digest text;
  v_requested_run_id uuid;
  v_requested_idempotency_key uuid;
  v_import_run_id uuid := gen_random_uuid();
  v_existing_run public.controlled_import_runs%rowtype;
  v_descriptor jsonb;
  v_source_row public.accounting_sources%rowtype;
  v_version_row public.accounting_source_versions%rowtype;
  v_selection_row public.source_selections%rowtype;
  v_figure_row public.source_reported_figures%rowtype;
  v_issue_row public.source_review_issues%rowtype;
  v_source_database_id uuid;
  v_version_database_id uuid;
  v_section_database_id uuid;
  v_next_version bigint;
  v_locator_key text;
  v_identity_digest text;
  v_ordinal_index integer;
  v_result jsonb;
begin
  v_context := private.c1_master_context(target_company_id, 'cost.source.read');
  v_actor_id := (v_context->>'actorId')::uuid;
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if not private.has_company_permission(v_tenant_id, target_company_id, 'cost.prepare') then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;

  if jsonb_typeof(target_request) is distinct from 'object' then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if not (target_request ?& array['runId', 'idempotencyKey', 'approvedManifestDigest', 'actualInputDigests', 'manifest'])
    or exists (select 1 from jsonb_object_keys(target_request) key where key not in ('runId', 'idempotencyKey', 'approvedManifestDigest', 'actualInputDigests', 'manifest'))
    or jsonb_typeof(target_request->'runId') is distinct from 'string'
    or jsonb_typeof(target_request->'idempotencyKey') is distinct from 'string'
    or jsonb_typeof(target_request->'approvedManifestDigest') is distinct from 'string'
    or target_request->>'runId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or target_request->>'idempotencyKey' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or target_request->>'approvedManifestDigest' !~ '^[a-f0-9]{64}$'
    or target_payload_digest is null
    or target_payload_digest !~ '^[a-f0-9]{64}$'
    or not private.c1_jsonb_is_string_array(target_request->'actualInputDigests')
    or jsonb_typeof(target_request->'manifest') is distinct from 'object'
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if jsonb_array_length(target_request->'actualInputDigests') = 0 then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  v_requested_run_id := (target_request->>'runId')::uuid;
  v_requested_idempotency_key := (target_request->>'idempotencyKey')::uuid;
  v_manifest := target_request->'manifest';
  if not (v_manifest ?& array['schemaVersion', 'workbookFamily', 'adapter', 'targetCompanyId', 'inputs', 'sources', 'sourceVersions', 'sections', 'figures', 'reviewIssues', 'duplicateCandidates', 'expected'])
    or exists (select 1 from jsonb_object_keys(v_manifest) key where key not in ('schemaVersion', 'workbookFamily', 'adapter', 'targetCompanyId', 'inputs', 'sources', 'sourceVersions', 'sections', 'figures', 'reviewIssues', 'duplicateCandidates', 'expected'))
    or jsonb_typeof(v_manifest->'schemaVersion') is distinct from 'string'
    or v_manifest->>'schemaVersion' <> '1.2'
    or jsonb_typeof(v_manifest->'targetCompanyId') is distinct from 'string'
    or v_manifest->>'targetCompanyId' <> target_company_id::text
    or jsonb_typeof(v_manifest->'workbookFamily') is distinct from 'string'
    or coalesce(v_manifest->>'workbookFamily', '') = ''
    or jsonb_typeof(v_manifest->'adapter') is distinct from 'object'
    or jsonb_typeof(v_manifest->'inputs') is distinct from 'array'
    or jsonb_typeof(v_manifest->'sources') is distinct from 'array'
    or jsonb_typeof(v_manifest->'sourceVersions') is distinct from 'array'
    or jsonb_typeof(v_manifest->'sections') is distinct from 'array'
    or jsonb_typeof(v_manifest->'figures') is distinct from 'array'
    or jsonb_typeof(v_manifest->'reviewIssues') is distinct from 'array'
    or jsonb_typeof(v_manifest->'duplicateCandidates') is distinct from 'array'
    or jsonb_typeof(v_manifest->'expected') is distinct from 'object'
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if not ((v_manifest->'adapter') ?& array['id', 'version'])
    or exists (select 1 from jsonb_object_keys(v_manifest->'adapter') key where key not in ('id', 'version'))
    or jsonb_typeof(v_manifest#>'{adapter,id}') is distinct from 'string'
    or jsonb_typeof(v_manifest#>'{adapter,version}') is distinct from 'string'
    or coalesce(v_manifest#>>'{adapter,id}', '') = ''
    or coalesce(v_manifest#>>'{adapter,version}', '') = ''
    or not ((v_manifest->'expected') ?& array['sources', 'versions', 'sections', 'figures', 'reviewIssues'])
    or exists (select 1 from jsonb_object_keys(v_manifest->'expected') key where key not in ('sources', 'versions', 'sections', 'figures', 'reviewIssues'))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if jsonb_array_length(v_manifest->'inputs') = 0 or jsonb_array_length(v_manifest->'sources') = 0 or jsonb_array_length(v_manifest->'sourceVersions') = 0 or jsonb_array_length(v_manifest->'sections') = 0
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if not exists (
    select 1 from private.controlled_import_adapter_versions adapter
    where adapter.workbook_family = v_manifest->>'workbookFamily'
      and adapter.adapter_id = v_manifest#>>'{adapter,id}'
      and adapter.adapter_version = v_manifest#>>'{adapter,version}'
  ) then raise exception using errcode = 'P0001', message = 'ADAPTER_NOT_PERMITTED'; end if;

  if jsonb_typeof(v_manifest#>'{expected,sources}') is distinct from 'number'
    or jsonb_typeof(v_manifest#>'{expected,versions}') is distinct from 'number'
    or jsonb_typeof(v_manifest#>'{expected,sections}') is distinct from 'number'
    or jsonb_typeof(v_manifest#>'{expected,figures}') is distinct from 'number'
    or jsonb_typeof(v_manifest#>'{expected,reviewIssues}') is distinct from 'number'
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if (v_manifest#>>'{expected,sources}')::numeric < 0 or mod((v_manifest#>>'{expected,sources}')::numeric, 1) <> 0
    or (v_manifest#>>'{expected,versions}')::numeric < 0 or mod((v_manifest#>>'{expected,versions}')::numeric, 1) <> 0
    or (v_manifest#>>'{expected,sections}')::numeric < 0 or mod((v_manifest#>>'{expected,sections}')::numeric, 1) <> 0
    or (v_manifest#>>'{expected,figures}')::numeric < 0 or mod((v_manifest#>>'{expected,figures}')::numeric, 1) <> 0
    or (v_manifest#>>'{expected,reviewIssues}')::numeric < 0 or mod((v_manifest#>>'{expected,reviewIssues}')::numeric, 1) <> 0
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if (v_manifest#>>'{expected,sources}')::numeric is distinct from jsonb_array_length(v_manifest->'sources')::numeric
    or (v_manifest#>>'{expected,versions}')::numeric is distinct from jsonb_array_length(v_manifest->'sourceVersions')::numeric
    or (v_manifest#>>'{expected,sections}')::numeric is distinct from jsonb_array_length(v_manifest->'sections')::numeric
    or (v_manifest#>>'{expected,figures}')::numeric is distinct from jsonb_array_length(v_manifest->'figures')::numeric
    or (v_manifest#>>'{expected,reviewIssues}')::numeric is distinct from jsonb_array_length(v_manifest->'reviewIssues')::numeric
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  if exists (
    select 1 from (
      select item->>'id' descriptor_id from jsonb_array_elements(v_manifest->'sources') item
      union all select item->>'id' from jsonb_array_elements(v_manifest->'sourceVersions') item
      union all select item->>'id' from jsonb_array_elements(v_manifest->'sections') item
      union all select item->>'id' from jsonb_array_elements(v_manifest->'figures') item
      union all select item->>'id' from jsonb_array_elements(v_manifest->'reviewIssues') item
      union all select item->>'id' from jsonb_array_elements(v_manifest->'duplicateCandidates') item
    ) ids group by descriptor_id having descriptor_id is null or descriptor_id = '' or count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if exists (select 1 from jsonb_array_elements(v_manifest->'inputs') item group by item->>'fileIdentity' having item->>'fileIdentity' is null or item->>'fileIdentity' = '' or count(*) > 1)
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if exists (select 1 from jsonb_array_elements(v_manifest->'inputs') item where jsonb_typeof(item) is distinct from 'object')
    or exists (select 1 from jsonb_array_elements(v_manifest->'sources') item where jsonb_typeof(item) is distinct from 'object')
    or exists (select 1 from jsonb_array_elements(v_manifest->'sourceVersions') item where jsonb_typeof(item) is distinct from 'object')
    or exists (select 1 from jsonb_array_elements(v_manifest->'sections') item where jsonb_typeof(item) is distinct from 'object')
    or exists (select 1 from jsonb_array_elements(v_manifest->'figures') item where jsonb_typeof(item) is distinct from 'object')
    or exists (select 1 from jsonb_array_elements(v_manifest->'reviewIssues') item where jsonb_typeof(item) is distinct from 'object')
    or exists (select 1 from jsonb_array_elements(v_manifest->'duplicateCandidates') item where jsonb_typeof(item) is distinct from 'object')
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_manifest->'inputs') item
    where not (item ?& array['fileIdentity', 'sha256', 'originalFilename'])
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('fileIdentity', 'sha256', 'originalFilename', 'rawFileReference'))
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'sources') item
    where not (item ?& array['id', 'code', 'title', 'sourceSystem'])
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('id', 'code', 'title', 'sourceSystem', 'suggestedProjectId'))
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'sourceVersions') item
    where not (item ?& array['id', 'sourceId', 'inputFileIdentity', 'inputFileSha256', 'originalFilename', 'rawFileReference', 'sourceVersionLabel', 'sourcePeriodText', 'sourceAsOfText'])
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('id', 'sourceId', 'inputFileIdentity', 'inputFileSha256', 'originalFilename', 'rawFileReference', 'sourceVersionLabel', 'sourcePeriodText', 'sourceAsOfText'))
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'sections') item
    where not (item ?& array['id', 'sourceVersionId', 'inputSha256', 'locator', 'mapping', 'observedLabels', 'rawValues', 'unresolvedIssues'])
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('id', 'sourceVersionId', 'inputSha256', 'locator', 'mapping', 'observedLabels', 'rawValues', 'unresolvedIssues'))
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'figures') item
    where not (item ?& array['id', 'sectionId', 'label', 'rawValueText', 'valueState', 'amount', 'currencyCode', 'metricKind', 'basis', 'balanceKind', 'roundingBasis', 'roundingNote', 'periodBasis', 'periodFrom', 'periodTo', 'asOfDate', 'mapping', 'scopeKind', 'scopeDescription', 'confirmation', 'confirmationReference'])
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('id', 'sectionId', 'label', 'rawValueText', 'valueState', 'amount', 'currencyCode', 'metricKind', 'basis', 'balanceKind', 'roundingBasis', 'roundingNote', 'periodBasis', 'periodFrom', 'periodTo', 'asOfDate', 'mapping', 'scopeKind', 'scopeDescription', 'confirmation', 'confirmationReference'))
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'reviewIssues') item
    where not (item ?& array['id', 'sectionId', 'kind', 'impact', 'description', 'reference'])
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('id', 'sectionId', 'kind', 'impact', 'description', 'reference', 'affectedMapping'))
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'duplicateCandidates') item
    where not (item ?& array['id', 'sectionId', 'candidateSectionId', 'reason'])
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('id', 'sectionId', 'candidateSectionId', 'reason'))
  ) then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  if exists (
    select 1 from jsonb_array_elements(v_manifest->'inputs') item
    where jsonb_typeof(item->'fileIdentity') is distinct from 'string'
      or jsonb_typeof(item->'sha256') is distinct from 'string'
      or jsonb_typeof(item->'originalFilename') is distinct from 'string'
      or (item ? 'rawFileReference' and jsonb_typeof(item->'rawFileReference') is distinct from 'string')
      or coalesce(item->>'fileIdentity', '') = '' or coalesce(item->>'originalFilename', '') = ''
      or item->>'sha256' !~* '^[a-f0-9]{64}$'
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'sources') item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'code') is distinct from 'string'
      or jsonb_typeof(item->'title') is distinct from 'string'
      or jsonb_typeof(item->'sourceSystem') is distinct from 'string'
      or (item ? 'suggestedProjectId' and (jsonb_typeof(item->'suggestedProjectId') is distinct from 'string' or item->>'suggestedProjectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
      or coalesce(item->>'id', '') = '' or coalesce(item->>'code', '') = '' or coalesce(item->>'title', '') = '' or coalesce(item->>'sourceSystem', '') = ''
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'sourceVersions') item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'sourceId') is distinct from 'string'
      or jsonb_typeof(item->'inputFileIdentity') is distinct from 'string'
      or jsonb_typeof(item->'inputFileSha256') is distinct from 'string'
      or jsonb_typeof(item->'originalFilename') is distinct from 'string'
      or jsonb_typeof(item->'rawFileReference') not in ('string', 'null')
      or jsonb_typeof(item->'sourceVersionLabel') not in ('string', 'null')
      or jsonb_typeof(item->'sourcePeriodText') not in ('string', 'null')
      or jsonb_typeof(item->'sourceAsOfText') not in ('string', 'null')
      or coalesce(item->>'id', '') = '' or coalesce(item->>'sourceId', '') = '' or coalesce(item->>'inputFileIdentity', '') = '' or coalesce(item->>'originalFilename', '') = ''
      or item->>'inputFileSha256' !~* '^[a-f0-9]{64}$'
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'sections') item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'sourceVersionId') is distinct from 'string'
      or jsonb_typeof(item->'inputSha256') is distinct from 'string'
      or jsonb_typeof(item->'locator') is distinct from 'object'
      or jsonb_typeof(item->'mapping') is distinct from 'object'
      or not private.c1_jsonb_is_string_array(item->'observedLabels')
      or not private.c1_jsonb_is_string_array(item->'rawValues')
      or not private.c1_jsonb_is_string_array(item->'unresolvedIssues')
      or coalesce(item->>'id', '') = '' or coalesce(item->>'sourceVersionId', '') = ''
      or item->>'inputSha256' !~* '^[a-f0-9]{64}$'
  ) then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  if exists (
    select 1 from jsonb_array_elements(v_manifest->'figures') item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'sectionId') is distinct from 'string'
      or jsonb_typeof(item->'label') is distinct from 'string'
      or jsonb_typeof(item->'rawValueText') is distinct from 'string'
      or jsonb_typeof(item->'valueState') is distinct from 'string'
      or jsonb_typeof(item->'metricKind') is distinct from 'string'
      or jsonb_typeof(item->'basis') is distinct from 'string'
      or jsonb_typeof(item->'roundingBasis') is distinct from 'string'
      or jsonb_typeof(item->'periodBasis') is distinct from 'string'
      or jsonb_typeof(item->'mapping') is distinct from 'object'
      or jsonb_typeof(item->'scopeKind') is distinct from 'string'
      or jsonb_typeof(item->'scopeDescription') is distinct from 'string'
      or jsonb_typeof(item->'confirmation') is distinct from 'string'
      or jsonb_typeof(item->'currencyCode') not in ('string', 'null')
      or jsonb_typeof(item->'balanceKind') not in ('string', 'null')
      or jsonb_typeof(item->'roundingNote') not in ('string', 'null')
      or jsonb_typeof(item->'periodFrom') not in ('string', 'null')
      or jsonb_typeof(item->'periodTo') not in ('string', 'null')
      or jsonb_typeof(item->'asOfDate') not in ('string', 'null')
      or jsonb_typeof(item->'confirmationReference') not in ('string', 'null')
      or coalesce(item->>'id', '') = '' or coalesce(item->>'sectionId', '') = '' or coalesce(item->>'label', '') = '' or coalesce(item->>'scopeDescription', '') = ''
      or item->>'valueState' not in ('known', 'blank', 'formula_error', 'missing_cached', 'not_numeric')
      or item->>'metricKind' not in ('cost_total', 'labor_total', 'commitment_total', 'cash_total', 'reported_balance', 'unclassified')
      or item->>'basis' not in ('net', 'gross', 'payable_basis', 'cash', 'mixed', 'unknown')
      or (jsonb_typeof(item->'balanceKind') = 'string' and item->>'balanceKind' not in ('total_outstanding', 'outside_retention', 'unallocated_cash', 'unknown'))
      or item->>'roundingBasis' not in ('exact', 'source_rounded', 'unknown')
      or item->>'periodBasis' not in ('activity_range', 'cumulative_as_of', 'unknown')
      or item->>'scopeKind' not in ('subcontractors_only', 'whole_project', 'mixed', 'unknown')
      or item->>'confirmation' not in ('unverified', 'confirmed_external', 'disputed')
      or (jsonb_typeof(item->'currencyCode') = 'string' and char_length(item->>'currencyCode') <> 3)
      or (jsonb_typeof(item->'periodFrom') = 'string' and item->>'periodFrom' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      or (jsonb_typeof(item->'periodTo') = 'string' and item->>'periodTo' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      or (jsonb_typeof(item->'asOfDate') = 'string' and item->>'asOfDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      or (item->>'valueState' = 'known' and (jsonb_typeof(item->'amount') is distinct from 'string' or item->>'amount' !~ '^-?[0-9]{1,16}(\.[0-9]{1,4})?$'))
      or (item->>'valueState' <> 'known' and jsonb_typeof(item->'amount') is distinct from 'null')
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'reviewIssues') item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'sectionId') is distinct from 'string'
      or jsonb_typeof(item->'kind') is distinct from 'string'
      or jsonb_typeof(item->'impact') is distinct from 'string'
      or jsonb_typeof(item->'description') is distinct from 'string'
      or jsonb_typeof(item->'reference') not in ('string', 'null')
      or (item ? 'affectedMapping' and jsonb_typeof(item->'affectedMapping') is distinct from 'object')
      or coalesce(item->>'id', '') = '' or coalesce(item->>'sectionId', '') = '' or coalesce(item->>'description', '') = ''
      or item->>'kind' not in ('scope_uncertain', 'party_uncertain', 'semantics_uncertain', 'date_conflict', 'rounding_difference', 'formula_error', 'possible_duplicate', 'coverage_overlap', 'other')
      or item->>'impact' not in ('blocks_normalization', 'comparison_only')
  ) or exists (
    select 1 from jsonb_array_elements(v_manifest->'duplicateCandidates') item
    where jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'sectionId') is distinct from 'string'
      or jsonb_typeof(item->'candidateSectionId') is distinct from 'string'
      or jsonb_typeof(item->'reason') is distinct from 'string'
      or coalesce(item->>'id', '') = '' or coalesce(item->>'sectionId', '') = '' or coalesce(item->>'candidateSectionId', '') = '' or coalesce(item->>'reason', '') = ''
  ) then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  select array_agg(value order by ordinality), string_agg(value, ',' order by ordinality)
  into v_actual_input_digests, v_input_digest_text
  from jsonb_array_elements_text(target_request->'actualInputDigests') with ordinality digests(value, ordinality);
  select array_agg(item->>'sha256' order by ordinality)
  into v_manifest_input_digests
  from jsonb_array_elements(v_manifest->'inputs') with ordinality inputs(item, ordinality);
  if v_actual_input_digests is distinct from v_manifest_input_digests
    or exists (select 1 from unnest(v_actual_input_digests) digest where digest !~* '^[a-f0-9]{64}$')
  then raise exception using errcode = 'P0001', message = 'INPUT_DIGEST_MISMATCH'; end if;

  v_manifest_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_manifest), 'UTF8'), 'sha256'), 'hex');
  if v_manifest_digest is distinct from target_request->>'approvedManifestDigest' then raise exception using errcode = 'P0001', message = 'MANIFEST_DIGEST_MISMATCH'; end if;
  v_computed_payload_digest := encode(extensions.digest(convert_to(v_requested_run_id::text || '|' || v_manifest_digest || '|' || v_input_digest_text || '|' || v_manifest_digest, 'UTF8'), 'sha256'), 'hex');
  if v_computed_payload_digest is distinct from target_payload_digest then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  for v_descriptor in select value from jsonb_array_elements(v_manifest->'sourceVersions') loop
    if not exists (select 1 from jsonb_array_elements(v_manifest->'sources') source where source->>'id' = v_descriptor->>'sourceId')
      or not exists (select 1 from jsonb_array_elements(v_manifest->'inputs') input where input->>'fileIdentity' = v_descriptor->>'inputFileIdentity' and input->>'sha256' = v_descriptor->>'inputFileSha256' and input->>'originalFilename' = v_descriptor->>'originalFilename')
    then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  end loop;
  for v_descriptor in select value from jsonb_array_elements(v_manifest->'sections') loop
    if not exists (select 1 from jsonb_array_elements(v_manifest->'sourceVersions') version where version->>'id' = v_descriptor->>'sourceVersionId' and version->>'inputFileSha256' = v_descriptor->>'inputSha256')
      or jsonb_typeof(v_descriptor->'locator') is distinct from 'object'
      or jsonb_typeof(v_descriptor->'mapping') is distinct from 'object'
    then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    if jsonb_typeof(v_descriptor#>'{locator,kind}') is distinct from 'string' or v_descriptor#>>'{locator,kind}' not in ('cell_range', 'logical_section', 'whole_file') then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    if v_descriptor#>>'{locator,kind}' = 'cell_range' then
      if not ((v_descriptor->'locator') ?& array['kind', 'sheetName', 'range'])
        or exists (select 1 from jsonb_object_keys(v_descriptor->'locator') key where key not in ('kind', 'sheetName', 'range'))
        or jsonb_typeof(v_descriptor#>'{locator,sheetName}') is distinct from 'string'
        or jsonb_typeof(v_descriptor#>'{locator,range}') is distinct from 'string'
        or coalesce(v_descriptor#>>'{locator,sheetName}', '') = ''
        or (v_descriptor#>>'{locator,range}') !~ '^[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$'
        or (v_descriptor#>>'{locator,range}') <> private.c1_normalize_import_cell_range(v_descriptor#>>'{locator,range}')
      then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    elsif v_descriptor#>>'{locator,kind}' = 'logical_section' then
      if not ((v_descriptor->'locator') ?& array['kind', 'section'])
        or exists (select 1 from jsonb_object_keys(v_descriptor->'locator') key where key not in ('kind', 'section'))
        or jsonb_typeof(v_descriptor#>'{locator,section}') is distinct from 'string'
        or coalesce(v_descriptor#>>'{locator,section}', '') = ''
      then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    elsif exists (select 1 from jsonb_object_keys(v_descriptor->'locator') key where key not in ('kind', 'note'))
      or (v_descriptor->'locator' ? 'note' and jsonb_typeof(v_descriptor#>'{locator,note}') is distinct from 'string')
    then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    perform private.c1_assert_controlled_import_mapping(v_tenant_id, target_company_id, v_descriptor->'mapping');
  end loop;
  for v_descriptor in select value from jsonb_array_elements(v_manifest->'figures') loop
    if not exists (select 1 from jsonb_array_elements(v_manifest->'sections') section where section->>'id' = v_descriptor->>'sectionId') then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    perform private.c1_assert_controlled_import_mapping(v_tenant_id, target_company_id, v_descriptor->'mapping');
  end loop;
  for v_descriptor in select value from jsonb_array_elements(v_manifest->'reviewIssues') loop
    if not exists (select 1 from jsonb_array_elements(v_manifest->'sections') section where section->>'id' = v_descriptor->>'sectionId') then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    if v_descriptor ? 'affectedMapping' then perform private.c1_assert_controlled_import_mapping(v_tenant_id, target_company_id, v_descriptor->'affectedMapping'); end if;
  end loop;
  for v_descriptor in select value from jsonb_array_elements(v_manifest->'duplicateCandidates') loop
    if not exists (select 1 from jsonb_array_elements(v_manifest->'sections') section where section->>'id' = v_descriptor->>'sectionId')
      or not exists (select 1 from jsonb_array_elements(v_manifest->'sections') section where section->>'id' = v_descriptor->>'candidateSectionId')
    then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('c1_controlled_import:' || target_company_id::text, 0));
  select * into v_existing_run from public.controlled_import_runs run where run.company_id = target_company_id and run.command_name = 'controlled_import' and run.idempotency_key = v_requested_idempotency_key;
  if found then
    if v_existing_run.payload_digest <> target_payload_digest then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return v_existing_run.result || jsonb_build_object('replayed', true);
  end if;
  if exists (select 1 from public.controlled_import_runs run where run.company_id = target_company_id and run.run_id = v_requested_run_id) then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;

  insert into public.controlled_import_runs(id, tenant_id, company_id, run_id, actor_id, idempotency_key, payload_digest, manifest_digest, input_digests, workbook_family, adapter_id, adapter_version, manifest_snapshot, request_id)
  values (v_import_run_id, v_tenant_id, target_company_id, v_requested_run_id, v_actor_id, v_requested_idempotency_key, target_payload_digest, v_manifest_digest, v_actual_input_digests, v_manifest->>'workbookFamily', v_manifest#>>'{adapter,id}', v_manifest#>>'{adapter,version}', v_manifest, target_request_id);

  for v_descriptor, v_ordinal_index in select value, ordinality - 1 from jsonb_array_elements(v_manifest->'sources') with ordinality loop
    if v_descriptor->>'code' is null or v_descriptor->>'title' is null or v_descriptor->>'sourceSystem' is null then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    select * into v_source_row from public.accounting_sources source where source.company_id = target_company_id and source.code = v_descriptor->>'code' for update;
    if not found then
      if v_descriptor ? 'suggestedProjectId' and not exists (select 1 from public.projects project where project.id = (v_descriptor->>'suggestedProjectId')::uuid and project.tenant_id = v_tenant_id and project.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
      insert into public.accounting_sources(tenant_id, company_id, code, title, source_system, suggested_project_id, created_by)
      values (v_tenant_id, target_company_id, v_descriptor->>'code', v_descriptor->>'title', v_descriptor->>'sourceSystem', (v_descriptor->>'suggestedProjectId')::uuid, v_actor_id) returning * into v_source_row;
    elsif v_source_row.title <> v_descriptor->>'title' or v_source_row.source_system <> v_descriptor->>'sourceSystem' or v_source_row.suggested_project_id is distinct from (v_descriptor->>'suggestedProjectId')::uuid then
      raise exception using errcode = 'P0001', message = 'SOURCE_IDENTITY_CONFLICT';
    end if;
    insert into public.controlled_import_descriptor_map(tenant_id, company_id, import_run_id, descriptor_kind, descriptor_id, descriptor_ordinal, persisted_resource_id)
    values (v_tenant_id, target_company_id, v_import_run_id, 'source', v_descriptor->>'id', v_ordinal_index, v_source_row.id);
  end loop;

  for v_descriptor, v_ordinal_index in select value, ordinality - 1 from jsonb_array_elements(v_manifest->'sourceVersions') with ordinality loop
    select map.persisted_resource_id into v_source_database_id from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'source' and map.descriptor_id = v_descriptor->>'sourceId';
    select * into v_version_row from public.accounting_source_versions version where version.source_id = v_source_database_id and version.input_file_identity = v_descriptor->>'inputFileIdentity' and version.input_file_sha256 = lower(v_descriptor->>'inputFileSha256');
    if not found then
      select coalesce(max(version.version_no), 0) + 1 into v_next_version from public.accounting_source_versions version where version.source_id = v_source_database_id;
      insert into public.accounting_source_versions(tenant_id, company_id, source_id, import_run_id, version_no, input_file_identity, input_file_sha256, original_filename, raw_file_reference, source_version_label, source_period_text, source_as_of_text, created_by)
      values (v_tenant_id, target_company_id, v_source_database_id, v_import_run_id, v_next_version, v_descriptor->>'inputFileIdentity', lower(v_descriptor->>'inputFileSha256'), v_descriptor->>'originalFilename', v_descriptor->>'rawFileReference', v_descriptor->>'sourceVersionLabel', v_descriptor->>'sourcePeriodText', v_descriptor->>'sourceAsOfText', v_actor_id) returning * into v_version_row;
    elsif v_version_row.original_filename <> v_descriptor->>'originalFilename' or v_version_row.raw_file_reference is distinct from v_descriptor->>'rawFileReference' or v_version_row.source_version_label is distinct from v_descriptor->>'sourceVersionLabel' or v_version_row.source_period_text is distinct from v_descriptor->>'sourcePeriodText' or v_version_row.source_as_of_text is distinct from v_descriptor->>'sourceAsOfText' then
      raise exception using errcode = 'P0001', message = 'SOURCE_IDENTITY_CONFLICT';
    end if;
    insert into public.controlled_import_descriptor_map(tenant_id, company_id, import_run_id, descriptor_kind, descriptor_id, descriptor_ordinal, persisted_resource_id)
    values (v_tenant_id, target_company_id, v_import_run_id, 'source_version', v_descriptor->>'id', v_ordinal_index, v_version_row.id);
  end loop;

  for v_descriptor, v_ordinal_index in select value, ordinality - 1 from jsonb_array_elements(v_manifest->'sections') with ordinality loop
    select map.persisted_resource_id into v_version_database_id from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'source_version' and map.descriptor_id = v_descriptor->>'sourceVersionId';
    v_locator_key := case v_descriptor #>> '{locator,kind}'
      when 'whole_file' then 'whole_file'
      when 'logical_section' then 'logical_section|' || (v_descriptor #>> '{locator,section}')
      else 'cell_range|' || (v_descriptor #>> '{locator,sheetName}') || '|' || (v_descriptor #>> '{locator,range}')
    end;
    select * into v_selection_row from public.source_selections selection where selection.source_version_id = v_version_database_id and selection.locator_key = v_locator_key;
    if not found then
      insert into public.source_selections(tenant_id, company_id, source_version_id, import_run_id, locator, locator_key, mapping_state, reviewed_mapping, mapped_project_id, mapped_party_id, mapped_engagement_id, mapped_component_id, observed_labels, raw_values, unresolved_issues, created_by)
      values (v_tenant_id, target_company_id, v_version_database_id, v_import_run_id, v_descriptor->'locator', v_locator_key, v_descriptor#>>'{mapping,state}', v_descriptor->'mapping', (v_descriptor#>>'{mapping,projectId}')::uuid, (v_descriptor#>>'{mapping,partyId}')::uuid, (v_descriptor#>>'{mapping,engagementId}')::uuid, (v_descriptor#>>'{mapping,componentId}')::uuid, array(select jsonb_array_elements_text(v_descriptor->'observedLabels')), array(select jsonb_array_elements_text(v_descriptor->'rawValues')), array(select jsonb_array_elements_text(v_descriptor->'unresolvedIssues')), v_actor_id) returning * into v_selection_row;
    elsif v_selection_row.locator is distinct from v_descriptor->'locator' or v_selection_row.reviewed_mapping is distinct from v_descriptor->'mapping' or v_selection_row.observed_labels is distinct from array(select jsonb_array_elements_text(v_descriptor->'observedLabels')) or v_selection_row.raw_values is distinct from array(select jsonb_array_elements_text(v_descriptor->'rawValues')) or v_selection_row.unresolved_issues is distinct from array(select jsonb_array_elements_text(v_descriptor->'unresolvedIssues')) then
      raise exception using errcode = 'P0001', message = 'SOURCE_IDENTITY_CONFLICT';
    end if;
    insert into public.controlled_import_descriptor_map(tenant_id, company_id, import_run_id, descriptor_kind, descriptor_id, descriptor_ordinal, persisted_resource_id)
    values (v_tenant_id, target_company_id, v_import_run_id, 'section', v_descriptor->>'id', v_ordinal_index, v_selection_row.id);
  end loop;

  for v_descriptor, v_ordinal_index in select value, ordinality - 1 from jsonb_array_elements(v_manifest->'figures') with ordinality loop
    select map.persisted_resource_id into v_section_database_id from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'section' and map.descriptor_id = v_descriptor->>'sectionId';
    v_identity_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_descriptor), 'UTF8'), 'sha256'), 'hex');
    select * into v_figure_row from public.source_reported_figures figure where figure.source_selection_id = v_section_database_id and figure.figure_identity = v_identity_digest;
    if not found then
      insert into public.source_reported_figures(tenant_id, company_id, source_selection_id, import_run_id, figure_identity, label, raw_value_text, value_state, amount_text, amount, currency_code, metric_kind, basis, balance_kind, rounding_basis, rounding_note, period_basis, period_from, period_to, as_of_date, mapping_state, reviewed_mapping, project_id, party_id, engagement_id, component_id, scope_kind, scope_description, confirmation, confirmation_reference, created_by)
      values (v_tenant_id, target_company_id, v_section_database_id, v_import_run_id, v_identity_digest, v_descriptor->>'label', v_descriptor->>'rawValueText', v_descriptor->>'valueState', v_descriptor->>'amount', (v_descriptor->>'amount')::numeric, v_descriptor->>'currencyCode', v_descriptor->>'metricKind', v_descriptor->>'basis', v_descriptor->>'balanceKind', v_descriptor->>'roundingBasis', v_descriptor->>'roundingNote', v_descriptor->>'periodBasis', (v_descriptor->>'periodFrom')::date, (v_descriptor->>'periodTo')::date, (v_descriptor->>'asOfDate')::date, v_descriptor#>>'{mapping,state}', v_descriptor->'mapping', (v_descriptor#>>'{mapping,projectId}')::uuid, (v_descriptor#>>'{mapping,partyId}')::uuid, (v_descriptor#>>'{mapping,engagementId}')::uuid, (v_descriptor#>>'{mapping,componentId}')::uuid, v_descriptor->>'scopeKind', v_descriptor->>'scopeDescription', v_descriptor->>'confirmation', v_descriptor->>'confirmationReference', v_actor_id) returning * into v_figure_row;
    end if;
    insert into public.controlled_import_descriptor_map(tenant_id, company_id, import_run_id, descriptor_kind, descriptor_id, descriptor_ordinal, persisted_resource_id)
    values (v_tenant_id, target_company_id, v_import_run_id, 'figure', v_descriptor->>'id', v_ordinal_index, v_figure_row.id);
  end loop;

  for v_descriptor, v_ordinal_index in select value, ordinality - 1 from jsonb_array_elements(v_manifest->'reviewIssues') with ordinality loop
    select map.persisted_resource_id into v_section_database_id from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'section' and map.descriptor_id = v_descriptor->>'sectionId';
    v_identity_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_descriptor), 'UTF8'), 'sha256'), 'hex');
    select * into v_issue_row from public.source_review_issues issue where issue.source_selection_id = v_section_database_id and issue.issue_identity = v_identity_digest;
    if not found then
      insert into public.source_review_issues(tenant_id, company_id, source_selection_id, import_run_id, issue_identity, issue_kind, impact, description, reference, affected_mapping, opened_by)
      values (v_tenant_id, target_company_id, v_section_database_id, v_import_run_id, v_identity_digest, v_descriptor->>'kind', v_descriptor->>'impact', v_descriptor->>'description', v_descriptor->>'reference', v_descriptor->'affectedMapping', v_actor_id) returning * into v_issue_row;
    end if;
    insert into public.controlled_import_descriptor_map(tenant_id, company_id, import_run_id, descriptor_kind, descriptor_id, descriptor_ordinal, persisted_resource_id)
    values (v_tenant_id, target_company_id, v_import_run_id, 'review_issue', v_descriptor->>'id', v_ordinal_index, v_issue_row.id);
  end loop;

  v_result := jsonb_build_object(
    'run_id', v_requested_run_id,
    'source_ids', coalesce((select jsonb_agg(map.persisted_resource_id order by map.descriptor_ordinal) from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'source'), '[]'::jsonb),
    'version_ids', coalesce((select jsonb_agg(map.persisted_resource_id order by map.descriptor_ordinal) from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'source_version'), '[]'::jsonb),
    'section_ids', coalesce((select jsonb_agg(map.persisted_resource_id order by map.descriptor_ordinal) from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'section'), '[]'::jsonb),
    'figure_ids', coalesce((select jsonb_agg(map.persisted_resource_id order by map.descriptor_ordinal) from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'figure'), '[]'::jsonb),
    'review_issue_ids', coalesce((select jsonb_agg(map.persisted_resource_id order by map.descriptor_ordinal) from public.controlled_import_descriptor_map map where map.import_run_id = v_import_run_id and map.descriptor_kind = 'review_issue'), '[]'::jsonb),
    'replayed', false
  );
  update public.controlled_import_runs run set result = v_result where run.id = v_import_run_id;
  insert into public.cost_command_receipts(tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version)
  values (v_tenant_id, target_company_id, v_actor_id, 'controlled_import', v_requested_idempotency_key, target_payload_digest, v_import_run_id, 0);
  insert into public.cost_document_events(tenant_id, company_id, resource_type, resource_id, event_kind, actor_id, request_id, after_summary)
  values (v_tenant_id, target_company_id, 'controlled_import_run', v_import_run_id, 'controlled_import.persisted', v_actor_id, target_request_id, jsonb_build_object('manifestDigest', v_manifest_digest, 'sources', v_manifest#>>'{expected,sources}', 'versions', v_manifest#>>'{expected,versions}', 'sections', v_manifest#>>'{expected,sections}', 'figures', v_manifest#>>'{expected,figures}', 'reviewIssues', v_manifest#>>'{expected,reviewIssues}'));
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'controlled_import.persisted', 'controlled_import_run', v_import_run_id::text, target_request_id, jsonb_build_object('manifestDigest', v_manifest_digest, 'recordCounts', v_manifest->'expected'));
  return v_result;
end;
$$;

create function private.c1_get_controlled_import_result(target_company_id uuid, target_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_context jsonb; v_tenant_id uuid; v_result jsonb;
begin
  v_context := private.c1_master_context(target_company_id, 'cost.source.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if not private.has_company_permission(v_tenant_id, target_company_id, 'cost.prepare') then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  select run.result into v_result from public.controlled_import_runs run where run.tenant_id = v_tenant_id and run.company_id = target_company_id and run.run_id = target_run_id;
  if v_result is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

create function public.c1_persist_controlled_import(target_company_id uuid, target_request jsonb, target_payload_digest text, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.c1_persist_controlled_import(target_company_id, target_request, target_payload_digest, target_request_id); $$;
create function public.c1_get_controlled_import_result(target_company_id uuid, target_run_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.c1_get_controlled_import_result(target_company_id, target_run_id); $$;

revoke all on function public.c1_persist_controlled_import(uuid, jsonb, text, uuid), public.c1_get_controlled_import_result(uuid, uuid) from public, anon, authenticated;
grant execute on function public.c1_persist_controlled_import(uuid, jsonb, text, uuid), public.c1_get_controlled_import_result(uuid, uuid) to authenticated;
revoke all on function private.c1_can_read_import_draft(uuid, uuid) from public, anon, authenticated;
grant execute on function private.c1_can_read_import_draft(uuid, uuid) to authenticated;
revoke all on function private.c1_jsonb_canonical_text(jsonb), private.c1_jsonb_is_string_array(jsonb), private.c1_assert_controlled_import_mapping(uuid, uuid, jsonb), private.c1_normalize_import_cell_range(text), private.c1_reject_import_history_mutation(), private.c1_persist_controlled_import(uuid, jsonb, text, uuid), private.c1_get_controlled_import_result(uuid, uuid) from public, anon, authenticated;
