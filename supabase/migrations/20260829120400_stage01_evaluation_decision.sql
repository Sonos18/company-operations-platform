create table public.stage01_decision_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid not null,
  node_execution_id uuid not null,
  cycle_no integer not null,
  decision_authority_user_id uuid references auth.users (id) on delete restrict,
  authority_resolution_reference text,
  reactivation_reason text,
  final_outcome text,
  final_decision_by uuid references auth.users (id) on delete restrict,
  final_decision_at timestamptz,
  final_rationale text,
  final_recommendation_id uuid,
  override_rationale text,
  version bigint not null default 0,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stage01_decision_cycles_opportunity_fk foreign key (opportunity_id, tenant_id, company_id)
    references public.opportunities (id, tenant_id, company_id) on delete restrict,
  constraint stage01_decision_cycles_execution_fk foreign key (node_execution_id, tenant_id, company_id)
    references public.workflow_node_executions (id, tenant_id, company_id) on delete restrict,
  constraint stage01_decision_cycles_cycle_no_positive check (cycle_no > 0),
  constraint stage01_decision_cycles_authority_fields_check check (
    (decision_authority_user_id is null and authority_resolution_reference is null)
    or (
      decision_authority_user_id is not null
      and authority_resolution_reference is not null
      and btrim(authority_resolution_reference) <> ''
    )
  ),
  constraint stage01_decision_cycles_reactivation_reason_not_blank check (
    reactivation_reason is null or btrim(reactivation_reason) <> ''
  ),
  constraint stage01_decision_cycles_final_fields_check check (
    (
      final_outcome is null
      and final_decision_by is null
      and final_decision_at is null
      and final_rationale is null
      and final_recommendation_id is null
      and override_rationale is null
    )
    or (
      final_outcome in ('proceed', 'not_proceeding')
      and final_decision_by is not null
      and final_decision_at is not null
      and final_rationale is not null
      and btrim(final_rationale) <> ''
      and final_recommendation_id is not null
      and final_decision_by = decision_authority_user_id
      and (override_rationale is null or btrim(override_rationale) <> '')
    )
  ),
  constraint stage01_decision_cycles_version_nonnegative check (version >= 0),
  constraint stage01_decision_cycles_opportunity_cycle_key unique (opportunity_id, cycle_no),
  constraint stage01_decision_cycles_node_execution_key unique (node_execution_id),
  constraint stage01_decision_cycles_id_scope_key unique (id, tenant_id, company_id)
);

create index stage01_decision_cycles_scope_opportunity_idx
  on public.stage01_decision_cycles (tenant_id, company_id, opportunity_id, cycle_no desc);

create table public.stage01_criterion_evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  decision_cycle_id uuid not null,
  criterion_key text not null,
  revision integer not null,
  applicability text not null,
  result text,
  rationale text,
  evidence jsonb not null default '[]'::jsonb,
  evaluated_by uuid not null references auth.users (id) on delete restrict,
  evaluated_at timestamptz not null default now(),
  constraint stage01_criterion_evaluations_cycle_fk foreign key (decision_cycle_id, tenant_id, company_id)
    references public.stage01_decision_cycles (id, tenant_id, company_id) on delete restrict,
  constraint stage01_criterion_evaluations_key_not_blank check (btrim(criterion_key) <> ''),
  constraint stage01_criterion_evaluations_revision_positive check (revision > 0),
  constraint stage01_criterion_evaluations_applicability_result_check check (
    (applicability = 'applicable' and result in ('fit', 'concern', 'not_fit', 'insufficient_information'))
    or (applicability = 'not_applicable' and result is null)
  ),
  constraint stage01_criterion_evaluations_rationale_not_blank check (
    rationale is null or btrim(rationale) <> ''
  ),
  constraint stage01_criterion_evaluations_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint stage01_criterion_evaluations_cycle_criterion_revision_key
    unique (decision_cycle_id, criterion_key, revision),
  constraint stage01_criterion_evaluations_id_scope_key unique (id, tenant_id, company_id)
);

create index stage01_criterion_evaluations_scope_cycle_idx
  on public.stage01_criterion_evaluations (tenant_id, company_id, decision_cycle_id, criterion_key, revision desc);

create table public.stage01_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  decision_cycle_id uuid not null,
  version integer not null,
  recommendation text not null,
  rationale text not null,
  evidence jsonb not null default '[]'::jsonb,
  submitted_by uuid not null references auth.users (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  constraint stage01_recommendations_cycle_fk foreign key (decision_cycle_id, tenant_id, company_id)
    references public.stage01_decision_cycles (id, tenant_id, company_id) on delete restrict,
  constraint stage01_recommendations_version_positive check (version > 0),
  constraint stage01_recommendations_value_check check (
    recommendation in ('recommend_proceed', 'recommend_not_proceeding')
  ),
  constraint stage01_recommendations_rationale_not_blank check (btrim(rationale) <> ''),
  constraint stage01_recommendations_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint stage01_recommendations_cycle_version_key unique (decision_cycle_id, version),
  constraint stage01_recommendations_id_scope_key unique (id, tenant_id, company_id)
);

create index stage01_recommendations_scope_cycle_idx
  on public.stage01_recommendations (tenant_id, company_id, decision_cycle_id, version desc);

alter table public.stage01_decision_cycles
  add constraint stage01_decision_cycles_final_recommendation_fk
    foreign key (final_recommendation_id, tenant_id, company_id)
    references public.stage01_recommendations (id, tenant_id, company_id) on delete restrict;

create table public.stage01_clarification_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  decision_cycle_id uuid not null,
  recommendation_id uuid not null,
  reason text not null,
  returned_by uuid not null references auth.users (id) on delete restrict,
  returned_at timestamptz not null default now(),
  constraint stage01_clarification_returns_cycle_fk foreign key (decision_cycle_id, tenant_id, company_id)
    references public.stage01_decision_cycles (id, tenant_id, company_id) on delete restrict,
  constraint stage01_clarification_returns_recommendation_fk foreign key (recommendation_id, tenant_id, company_id)
    references public.stage01_recommendations (id, tenant_id, company_id) on delete restrict,
  constraint stage01_clarification_returns_reason_not_blank check (btrim(reason) <> ''),
  constraint stage01_clarification_returns_id_scope_key unique (id, tenant_id, company_id)
);

create index stage01_clarification_returns_scope_cycle_idx
  on public.stage01_clarification_returns (tenant_id, company_id, decision_cycle_id, returned_at, id);

alter table public.stage01_decision_cycles enable row level security;
alter table public.stage01_criterion_evaluations enable row level security;
alter table public.stage01_recommendations enable row level security;
alter table public.stage01_clarification_returns enable row level security;

revoke all on table public.stage01_decision_cycles from anon, authenticated;
revoke all on table public.stage01_criterion_evaluations from anon, authenticated;
revoke all on table public.stage01_recommendations from anon, authenticated;
revoke all on table public.stage01_clarification_returns from anon, authenticated;
