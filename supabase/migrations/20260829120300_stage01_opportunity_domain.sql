create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  validity_state text not null default 'valid',
  canonical_opportunity_id uuid,
  primary_customer_name text,
  customer_type_code text,
  need_description text,
  location_status text not null default 'unknown',
  location_text text,
  primary_lead_source_code text,
  engagement_status_code text,
  budget_status_code text,
  budget_min numeric,
  budget_max numeric,
  currency_code text,
  budget_note text,
  timeline_status_code text,
  timeline_start_date date,
  timeline_end_date date,
  timeline_note text,
  priority_code text,
  version bigint not null default 0,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete restrict,
  constraint opportunities_validity_state_check check (validity_state in ('valid', 'invalid')),
  constraint opportunities_location_status_check check (location_status in ('unknown', 'area_known', 'relative', 'exact')),
  constraint opportunities_canonical_not_self check (canonical_opportunity_id is null or canonical_opportunity_id <> id),
  constraint opportunities_customer_name_not_blank check (primary_customer_name is null or btrim(primary_customer_name) <> ''),
  constraint opportunities_need_not_blank check (need_description is null or btrim(need_description) <> ''),
  constraint opportunities_location_not_blank check (location_text is null or btrim(location_text) <> ''),
  constraint opportunities_budget_status_not_blank check (budget_status_code is null or btrim(budget_status_code) <> ''),
  constraint opportunities_budget_values_nonnegative check (
    (budget_min is null or budget_min >= 0)
    and (budget_max is null or budget_max >= 0)
    and (budget_min is null or budget_max is null or budget_min <= budget_max)
  ),
  constraint opportunities_currency_not_blank check (currency_code is null or btrim(currency_code) <> ''),
  constraint opportunities_timeline_status_not_blank check (timeline_status_code is null or btrim(timeline_status_code) <> ''),
  constraint opportunities_timeline_order check (
    timeline_start_date is null or timeline_end_date is null or timeline_start_date <= timeline_end_date
  ),
  constraint opportunities_version_nonnegative check (version >= 0),
  constraint opportunities_id_scope_key unique (id, tenant_id, company_id)
);

alter table public.opportunities
  add constraint opportunities_canonical_fk foreign key (canonical_opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict;

create index opportunities_scope_created_idx
  on public.opportunities (tenant_id, company_id, created_at desc);
create index opportunities_canonical_idx
  on public.opportunities (tenant_id, company_id, canonical_opportunity_id)
  where canonical_opportunity_id is not null;

create table public.stage01_taxonomy_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  taxonomy_key text not null,
  code text not null,
  label text not null,
  semantic_key text,
  behavior jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage01_taxonomy_values_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete restrict,
  constraint stage01_taxonomy_values_key_not_blank check (btrim(taxonomy_key) <> ''),
  constraint stage01_taxonomy_values_code_not_blank check (btrim(code) <> ''),
  constraint stage01_taxonomy_values_label_not_blank check (btrim(label) <> ''),
  constraint stage01_taxonomy_values_semantic_not_blank check (semantic_key is null or btrim(semantic_key) <> ''),
  constraint stage01_taxonomy_values_behavior_object check (jsonb_typeof(behavior) = 'object'),
  constraint stage01_taxonomy_values_company_key_code unique (company_id, taxonomy_key, code),
  constraint stage01_taxonomy_values_id_scope_key unique (id, tenant_id, company_id)
);

create index stage01_taxonomy_values_scope_key_idx
  on public.stage01_taxonomy_values (tenant_id, company_id, taxonomy_key, is_active, code);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  display_name text not null,
  notes text,
  version bigint not null default 0,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete restrict,
  constraint contacts_display_name_not_blank check (btrim(display_name) <> ''),
  constraint contacts_notes_not_blank check (notes is null or btrim(notes) <> ''),
  constraint contacts_version_nonnegative check (version >= 0),
  constraint contacts_id_scope_key unique (id, tenant_id, company_id)
);

create index contacts_scope_display_name_idx
  on public.contacts (tenant_id, company_id, display_name);

create table public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  contact_id uuid not null,
  method_type text not null,
  value text not null,
  is_usable boolean not null default true,
  reliability_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_methods_contact_fk foreign key (contact_id, tenant_id, company_id)
    references public.contacts (id, tenant_id, company_id) on delete restrict,
  constraint contact_methods_type_check check (method_type in ('phone', 'email', 'other')),
  constraint contact_methods_value_not_blank check (btrim(value) <> ''),
  constraint contact_methods_reliability_check check (
    reliability_state is null or reliability_state in ('unverified', 'confirmed', 'disputed')
  ),
  constraint contact_methods_id_scope_key unique (id, tenant_id, company_id)
);

create index contact_methods_scope_contact_idx
  on public.contact_methods (tenant_id, company_id, contact_id, is_usable);

create table public.opportunity_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  contact_id uuid not null,
  relationship_code text not null,
  is_primary boolean not null default false,
  reliability_state text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_by uuid references auth.users (id) on delete restrict,
  ended_at timestamptz,
  end_reason text,
  constraint opportunity_contacts_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_contacts_contact_fk foreign key (contact_id, tenant_id, company_id)
    references public.contacts (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_contacts_relationship_not_blank check (btrim(relationship_code) <> ''),
  constraint opportunity_contacts_reliability_check check (
    reliability_state is null or reliability_state in ('unverified', 'confirmed', 'disputed')
  ),
  constraint opportunity_contacts_end_fields check (
    (ended_by is null and ended_at is null and end_reason is null)
    or (ended_by is not null and ended_at is not null and end_reason is not null and btrim(end_reason) <> '' and ended_at >= created_at)
  ),
  constraint opportunity_contacts_id_scope_key unique (id, tenant_id, company_id)
);

create unique index opportunity_contacts_one_active_primary
  on public.opportunity_contacts (opportunity_id)
  where is_primary and ended_at is null;
create index opportunity_contacts_scope_opportunity_idx
  on public.opportunity_contacts (tenant_id, company_id, opportunity_id, created_at desc);
create index opportunity_contacts_contact_idx
  on public.opportunity_contacts (contact_id) where ended_at is null;

create table public.opportunity_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  scope_code text not null,
  note text,
  reliability_state text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  retired_by uuid references auth.users (id) on delete restrict,
  retired_at timestamptz,
  retire_reason text,
  constraint opportunity_scopes_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_scopes_code_not_blank check (btrim(scope_code) <> ''),
  constraint opportunity_scopes_note_not_blank check (note is null or btrim(note) <> ''),
  constraint opportunity_scopes_reliability_check check (
    reliability_state is null or reliability_state in ('unverified', 'confirmed', 'disputed')
  ),
  constraint opportunity_scopes_retirement_fields check (
    (retired_by is null and retired_at is null and retire_reason is null)
    or (retired_by is not null and retired_at is not null and retire_reason is not null and btrim(retire_reason) <> '' and retired_at >= created_at)
  ),
  constraint opportunity_scopes_id_scope_key unique (id, tenant_id, company_id)
);

create index opportunity_scopes_scope_opportunity_idx
  on public.opportunity_scopes (tenant_id, company_id, opportunity_id, created_at desc);

create table public.opportunity_referrers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  referrer_type_code text not null,
  display_name text not null,
  contact_id uuid,
  note text,
  reliability_state text,
  is_primary boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_by uuid references auth.users (id) on delete restrict,
  ended_at timestamptz,
  end_reason text,
  constraint opportunity_referrers_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_referrers_contact_fk foreign key (contact_id, tenant_id, company_id)
    references public.contacts (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_referrers_type_not_blank check (btrim(referrer_type_code) <> ''),
  constraint opportunity_referrers_display_name_not_blank check (btrim(display_name) <> ''),
  constraint opportunity_referrers_note_not_blank check (note is null or btrim(note) <> ''),
  constraint opportunity_referrers_reliability_check check (
    reliability_state is null or reliability_state in ('unverified', 'confirmed', 'disputed')
  ),
  constraint opportunity_referrers_end_fields check (
    (ended_by is null and ended_at is null and end_reason is null)
    or (ended_by is not null and ended_at is not null and end_reason is not null and btrim(end_reason) <> '' and ended_at >= created_at)
  ),
  constraint opportunity_referrers_id_scope_key unique (id, tenant_id, company_id)
);

create unique index opportunity_referrers_one_active_primary
  on public.opportunity_referrers (opportunity_id)
  where is_primary and ended_at is null;
create index opportunity_referrers_scope_opportunity_idx
  on public.opportunity_referrers (tenant_id, company_id, opportunity_id, created_at desc);

create table public.opportunity_intake_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  channel_code text not null,
  summary text not null,
  correction_of_record_id uuid,
  correction_reason text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint opportunity_intake_records_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_intake_records_channel_not_blank check (btrim(channel_code) <> ''),
  constraint opportunity_intake_records_summary_not_blank check (btrim(summary) <> ''),
  constraint opportunity_intake_records_correction_pair check (
    (correction_of_record_id is null and correction_reason is null)
    or (correction_of_record_id is not null and correction_reason is not null and btrim(correction_reason) <> '')
  ),
  constraint opportunity_intake_records_correction_not_self check (
    correction_of_record_id is null or correction_of_record_id <> id
  ),
  constraint opportunity_intake_records_id_scope_key unique (id, tenant_id, company_id)
);

alter table public.opportunity_intake_records
  add constraint opportunity_intake_records_correction_fk
    foreign key (correction_of_record_id, tenant_id, company_id)
    references public.opportunity_intake_records (id, tenant_id, company_id) on delete restrict;

create index opportunity_intake_records_scope_opportunity_idx
  on public.opportunity_intake_records (tenant_id, company_id, opportunity_id, created_at, id);

create table public.opportunity_duplicate_concerns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  suspected_duplicate_opportunity_id uuid,
  description text not null,
  raised_by uuid not null references auth.users (id) on delete restrict,
  raised_at timestamptz not null default now(),
  resolution text,
  canonical_opportunity_id uuid,
  resolution_note text,
  resolved_by uuid references auth.users (id) on delete restrict,
  resolved_at timestamptz,
  constraint opportunity_duplicate_concerns_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_duplicate_concerns_suspected_fk foreign key (suspected_duplicate_opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_duplicate_concerns_canonical_fk foreign key (canonical_opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint opportunity_duplicate_concerns_description_not_blank check (btrim(description) <> ''),
  constraint opportunity_duplicate_concerns_resolution_check check (
    resolution is null or resolution in ('same_need', 'different_need')
  ),
  constraint opportunity_duplicate_concerns_resolution_fields check (
    (resolution is null and canonical_opportunity_id is null and resolution_note is null and resolved_by is null and resolved_at is null)
    or (
      resolution is not null
      and resolution_note is not null
      and btrim(resolution_note) <> ''
      and resolved_by is not null
      and resolved_at is not null
      and resolved_at >= raised_at
      and ((resolution = 'same_need' and canonical_opportunity_id is not null) or (resolution = 'different_need' and canonical_opportunity_id is null))
    )
  ),
  constraint opportunity_duplicate_concerns_suspected_not_self check (
    suspected_duplicate_opportunity_id is null or suspected_duplicate_opportunity_id <> opportunity_id
  ),
  constraint opportunity_duplicate_concerns_id_scope_key unique (id, tenant_id, company_id)
);

create index opportunity_duplicate_concerns_scope_open_idx
  on public.opportunity_duplicate_concerns (tenant_id, company_id, opportunity_id, raised_at)
  where resolved_at is null;

alter table public.workflow_node_events
  add constraint workflow_node_events_id_scope_key unique (id, tenant_id, company_id);

create table public.stage01_intake_completion_baselines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  node_execution_id uuid not null,
  completion_event_id bigint not null,
  baseline_version integer not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stage01_intake_baselines_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint stage01_intake_baselines_execution_fk foreign key (node_execution_id, tenant_id, company_id)
    references public.workflow_node_executions (id, tenant_id, company_id) on delete restrict,
  constraint stage01_intake_baselines_event_fk foreign key (completion_event_id, tenant_id, company_id)
    references public.workflow_node_events (id, tenant_id, company_id) on delete restrict,
  constraint stage01_intake_baselines_version_positive check (baseline_version > 0),
  constraint stage01_intake_baselines_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint stage01_intake_baselines_hash_not_blank check (btrim(snapshot_hash) <> ''),
  constraint stage01_intake_baselines_execution_version_key unique (node_execution_id, baseline_version),
  constraint stage01_intake_completion_baselines_id_scope_key unique (id, tenant_id, company_id)
);

create unique index stage01_intake_baselines_completion_event_key
  on public.stage01_intake_completion_baselines (completion_event_id);
create index stage01_intake_baselines_scope_opportunity_idx
  on public.stage01_intake_completion_baselines (tenant_id, company_id, opportunity_id, baseline_version desc);

alter table public.opportunities enable row level security;
alter table public.stage01_taxonomy_values enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_methods enable row level security;
alter table public.opportunity_contacts enable row level security;
alter table public.opportunity_scopes enable row level security;
alter table public.opportunity_referrers enable row level security;
alter table public.opportunity_intake_records enable row level security;
alter table public.opportunity_duplicate_concerns enable row level security;
alter table public.stage01_intake_completion_baselines enable row level security;

revoke all on table public.opportunities from anon, authenticated;
revoke all on table public.stage01_taxonomy_values from anon, authenticated;
revoke all on table public.contacts from anon, authenticated;
revoke all on table public.contact_methods from anon, authenticated;
revoke all on table public.opportunity_contacts from anon, authenticated;
revoke all on table public.opportunity_scopes from anon, authenticated;
revoke all on table public.opportunity_referrers from anon, authenticated;
revoke all on table public.opportunity_intake_records from anon, authenticated;
revoke all on table public.opportunity_duplicate_concerns from anon, authenticated;
revoke all on table public.stage01_intake_completion_baselines from anon, authenticated;
