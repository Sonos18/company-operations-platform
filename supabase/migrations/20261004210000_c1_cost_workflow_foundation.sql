set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 31);
-- Additive, inactive by default. No business history, account grants or ownership backfill.

create table public.cost_workflow_companies (
 tenant_id uuid not null, company_id uuid primary key,
 mode text not null default 'legacy' check(mode in ('legacy','document_backed_v1')),
 notification_recipient_id uuid references auth.users(id) on delete restrict,
 version bigint not null default 0 check(version >= 0),
 foreign key(company_id,tenant_id) references public.companies(id,tenant_id) on delete restrict
);
create table public.cost_workflow_party_classifications (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null,
 party_id uuid not null, version bigint not null check(version > 0),
 crew_ownership text not null check(crew_ownership in ('vqh_internal','external')),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
 unique(party_id,tenant_id,company_id,version),
 foreign key(party_id,tenant_id,company_id) references public.business_parties(id,tenant_id,company_id) on delete restrict
);

create table public.cost_workflow_manager_assignments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 manager_user_id uuid not null references auth.users(id), assignment_version bigint not null check(assignment_version > 0),
 assigned_by uuid not null references auth.users(id), reason text not null check(btrim(reason) <> ''), created_at timestamptz not null default now(),
 unique(tenant_id,company_id,project_id,assignment_version)
);
create index cost_workflow_manager_assignments_project_idx on public.cost_workflow_manager_assignments(tenant_id,company_id,project_id);

create table public.cost_workflow_contracts (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 party_id uuid not null, reference text not null check(btrim(reference) <> ''), currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 current_version bigint not null default 1 check(current_version > 0), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(party_id,tenant_id,company_id) references public.business_parties(id,tenant_id,company_id) on delete restrict
);
create index cost_workflow_contracts_project_idx on public.cost_workflow_contracts(tenant_id,company_id,project_id);

create table public.cost_workflow_contract_versions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 contract_id uuid not null, version bigint not null check(version > 0),
 cap numeric(20,4) not null check(cap >= 0), evidence_file_ids uuid[] not null check(cardinality(evidence_file_ids)>0),
 basis_state text not null check(basis_state in ('reviewed_reference','approved_adjustment')),
 reviewed_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), reason text,
 created_at timestamptz not null default now(),
 check((basis_state='reviewed_reference' and approved_by is null) or (basis_state='approved_adjustment' and approved_by is not null and reason is not null and btrim(reason)<>'')),
 unique(contract_id,version), foreign key(contract_id, tenant_id, company_id, project_id) references public.cost_workflow_contracts(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_contract_versions_project_idx on public.cost_workflow_contract_versions(tenant_id,company_id,project_id);

create table public.cost_workflow_requests (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 kind text not null check(kind in ('installment','contract_adjustment','refund','correction')),
 state text not null default 'working' check(state in ('working','submitted','returned','approved')),
 party_id uuid not null, category_id uuid, contract_id uuid, source_payment_id uuid,
 working_input jsonb not null check(jsonb_typeof(working_input)='object'),
 version bigint not null default 0 check(version >= 0), submitted_version_id uuid,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((kind='installment' and category_id is not null and source_payment_id is null) or (kind='contract_adjustment' and contract_id is not null and source_payment_id is null) or (kind in ('refund','correction') and source_payment_id is not null)),
 foreign key(party_id,tenant_id,company_id) references public.business_parties(id,tenant_id,company_id) on delete restrict,
 foreign key(category_id,tenant_id,company_id) references public.cost_categories(id,tenant_id,company_id) on delete restrict,
 foreign key(contract_id, tenant_id, company_id, project_id) references public.cost_workflow_contracts(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_requests_project_idx on public.cost_workflow_requests(tenant_id,company_id,project_id);

create table public.cost_workflow_request_versions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 request_id uuid not null, version bigint not null check(version > 0),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), amount numeric(20,4) not null check(amount >= 0),
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'), evidence_file_ids uuid[] not null check(cardinality(evidence_file_ids)>0),
 manager_assignment_id uuid not null, submitted_by uuid not null references auth.users(id), submitted_at timestamptz not null default now(),
 unique(request_id,version), foreign key(request_id, tenant_id, company_id, project_id) references public.cost_workflow_requests(id, tenant_id, company_id, project_id) on delete restrict, foreign key(manager_assignment_id, tenant_id, company_id, project_id) references public.cost_workflow_manager_assignments(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_request_versions_project_idx on public.cost_workflow_request_versions(tenant_id,company_id,project_id);

create table public.cost_workflow_decisions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 submitted_version_id uuid not null, decision text not null check(decision in ('approve','return')),
 manager_assignment_id uuid not null, decided_by uuid not null references auth.users(id),
 reason text, decided_at timestamptz not null default now(),
 check(decision <> 'return' or (reason is not null and btrim(reason)<>'')),
 unique(submitted_version_id), foreign key(submitted_version_id, tenant_id, company_id, project_id) references public.cost_workflow_request_versions(id, tenant_id, company_id, project_id) on delete restrict, foreign key(manager_assignment_id, tenant_id, company_id, project_id) references public.cost_workflow_manager_assignments(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_decisions_project_idx on public.cost_workflow_decisions(tenant_id,company_id,project_id);

create table public.cost_workflow_installments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 request_id uuid not null, decision_id uuid not null, contract_id uuid, contract_version_id uuid,
 party_id uuid not null, category_id uuid not null, authorized_amount numeric(20,4) not null check(authorized_amount >= 0),
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'), approved_at timestamptz not null,
 check((contract_id is null and contract_version_id is null) or (contract_id is not null and contract_version_id is not null)),
 unique(request_id), unique(decision_id), foreign key(request_id, tenant_id, company_id, project_id) references public.cost_workflow_requests(id, tenant_id, company_id, project_id) on delete restrict, foreign key(decision_id, tenant_id, company_id, project_id) references public.cost_workflow_decisions(id, tenant_id, company_id, project_id) on delete restrict,
 foreign key(contract_id, tenant_id, company_id, project_id) references public.cost_workflow_contracts(id, tenant_id, company_id, project_id) on delete restrict, foreign key(contract_version_id, tenant_id, company_id, project_id) references public.cost_workflow_contract_versions(id, tenant_id, company_id, project_id) on delete restrict,
 foreign key(party_id,tenant_id,company_id) references public.business_parties(id,tenant_id,company_id) on delete restrict,
 foreign key(category_id,tenant_id,company_id) references public.cost_categories(id,tenant_id,company_id) on delete restrict
);
create index cost_workflow_installments_project_idx on public.cost_workflow_installments(tenant_id,company_id,project_id);

create table public.cost_workflow_payments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 installment_id uuid not null, cash_kind text not null check(cash_kind in ('ordinary','subcontract')),
 ordinary_amount numeric(20,4), subcontract_payment_id uuid,
 -- Canonical subcontract row is the only subcontract cash amount; command checks matching currency.

 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'), payment_date date not null, reference text not null check(btrim(reference) <> ''),
 evidence_file_ids uuid[] not null check(cardinality(evidence_file_ids)>0),
 confirmed_by uuid not null references auth.users(id), confirmed_at timestamptz not null default now(),
 check((cash_kind='ordinary' and ordinary_amount is not null and ordinary_amount>0 and subcontract_payment_id is null) or (cash_kind='subcontract' and ordinary_amount is null and subcontract_payment_id is not null)),
 unique(subcontract_payment_id), foreign key(installment_id, tenant_id, company_id, project_id) references public.cost_workflow_installments(id, tenant_id, company_id, project_id) on delete restrict,
 foreign key(subcontract_payment_id,tenant_id,company_id,project_id) references public.project_subcontract_payments(id,tenant_id,company_id,project_id) on delete restrict
);
create index cost_workflow_payments_project_idx on public.cost_workflow_payments(tenant_id,company_id,project_id);

create table public.cost_workflow_consumptions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 installment_id uuid not null, payment_id uuid not null,
 amount numeric(20,4) not null check(amount > 0), consumed_at timestamptz not null default now(),
 unique(payment_id), foreign key(installment_id, tenant_id, company_id, project_id) references public.cost_workflow_installments(id, tenant_id, company_id, project_id) on delete restrict, foreign key(payment_id, tenant_id, company_id, project_id) references public.cost_workflow_payments(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_consumptions_project_idx on public.cost_workflow_consumptions(tenant_id,company_id,project_id);

create table public.cost_workflow_refunds (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 source_payment_id uuid not null, request_id uuid not null, decision_id uuid not null,
 amount numeric(20,4) not null check(amount > 0), received_date date not null,
 evidence_file_ids uuid[] not null check(cardinality(evidence_file_ids)>0), confirmed_by uuid not null references auth.users(id), confirmed_at timestamptz not null default now(),
 unique(request_id), foreign key(source_payment_id, tenant_id, company_id, project_id) references public.cost_workflow_payments(id, tenant_id, company_id, project_id) on delete restrict, foreign key(request_id, tenant_id, company_id, project_id) references public.cost_workflow_requests(id, tenant_id, company_id, project_id) on delete restrict, foreign key(decision_id, tenant_id, company_id, project_id) references public.cost_workflow_decisions(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_refunds_project_idx on public.cost_workflow_refunds(tenant_id,company_id,project_id);

create table public.cost_workflow_corrections (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 source_payment_id uuid not null, request_id uuid not null, decision_id uuid not null,
 corrected_outgoing numeric(20,4) not null check(corrected_outgoing >= 0),
 evidence_file_ids uuid[] not null check(cardinality(evidence_file_ids)>0), applied_by uuid not null references auth.users(id), applied_at timestamptz not null default now(),
 unique(request_id), foreign key(source_payment_id, tenant_id, company_id, project_id) references public.cost_workflow_payments(id, tenant_id, company_id, project_id) on delete restrict, foreign key(request_id, tenant_id, company_id, project_id) references public.cost_workflow_requests(id, tenant_id, company_id, project_id) on delete restrict, foreign key(decision_id, tenant_id, company_id, project_id) references public.cost_workflow_decisions(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_corrections_project_idx on public.cost_workflow_corrections(tenant_id,company_id,project_id);

create table public.cost_workflow_notifications (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 decision_id uuid not null, recipient_id uuid not null references auth.users(id),
 delivery_state text not null check(delivery_state in ('available','undelivered')),
 read_at timestamptz, created_at timestamptz not null default now(),
 unique(decision_id,recipient_id), foreign key(decision_id, tenant_id, company_id, project_id) references public.cost_workflow_decisions(id, tenant_id, company_id, project_id) on delete restrict
);
create index cost_workflow_notifications_project_idx on public.cost_workflow_notifications(tenant_id,company_id,project_id);

create table public.cost_workflow_extractions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null,
  unique(id, tenant_id, company_id, project_id),
  foreign key(project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
 request_id uuid not null, evidence_file_id uuid not null,
 method_version text not null, status text not null check(status in ('ready','needs_review','unavailable','failed')),
 result jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(request_id, tenant_id, company_id, project_id) references public.cost_workflow_requests(id, tenant_id, company_id, project_id) on delete restrict,
 foreign key(evidence_file_id,tenant_id,company_id,project_id) references public.cost_evidence_files(id,tenant_id,company_id,project_id) on delete restrict
);
create index cost_workflow_extractions_project_idx on public.cost_workflow_extractions(tenant_id,company_id,project_id);

alter table public.cost_workflow_requests add constraint cost_workflow_request_submitted_fk foreign key(submitted_version_id, tenant_id, company_id, project_id) references public.cost_workflow_request_versions(id, tenant_id, company_id, project_id) on delete restrict;
alter table public.cost_workflow_requests add constraint cost_workflow_request_payment_fk foreign key(source_payment_id, tenant_id, company_id, project_id) references public.cost_workflow_payments(id, tenant_id, company_id, project_id) on delete restrict;
