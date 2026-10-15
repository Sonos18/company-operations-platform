set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 50);

-- A4/A5 material finance foundation: contracts, invoices, payment requests,
-- payments and in-app notifications. Commands and reads are added by later
-- migrations; this one only defines tables, RLS, shared helpers and wiring.

insert into public.permissions(code, module, name, description) values
  ('material.payment.request', 'cost', 'Request material payments', 'Create, resubmit and cancel material payment requests'),
  ('material.payment.approve', 'cost', 'Approve material payments', 'Approve or return material payment requests'),
  ('material.payment.execute', 'cost', 'Execute material payments', 'Record bank transfers for approved material payment requests'),
  ('material.finance.read', 'cost', 'Read material finance', 'Read material contracts, invoices, payments and supplier balances')
on conflict (code) do nothing;

create table public.material_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  order_id uuid not null unique,
  supplier_id uuid not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  contract_no text not null check (btrim(contract_no) = contract_no and contract_no <> '' and char_length(contract_no) <= 100),
  signed_on date not null,
  current_version_no integer not null default 1 check (current_version_no > 0),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  unique (id, supplier_id),
  foreign key (order_id, tenant_id, company_id, project_id)
    references public.material_orders(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (supplier_id, tenant_id, company_id)
    references public.business_parties(id, tenant_id, company_id) on delete restrict
);
create index material_contracts_project_idx on public.material_contracts(tenant_id, company_id, project_id);
create index material_contracts_supplier_idx on public.material_contracts(tenant_id, company_id, supplier_id);

create table public.material_contract_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  version_no integer not null check (version_no > 0),
  kind text not null check (kind in ('original','amendment')),
  subtotal numeric(20,4) not null check (subtotal > 0),
  vat_amount numeric(20,4) not null check (vat_amount >= 0),
  total numeric(20,4) not null check (total > 0 and total = subtotal + vat_amount),
  order_subtotal_snapshot numeric(20,4) not null check (order_subtotal_snapshot > 0),
  variance_reason text check (variance_reason is null or (btrim(variance_reason) <> '' and char_length(variance_reason) <= 1000)),
  contract_file_id uuid not null unique,
  signed_quotation_file_id uuid unique,
  reason text check (reason is null or (btrim(reason) <> '' and char_length(reason) <= 1000)),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (contract_id, version_no),
  unique (id, tenant_id, company_id, project_id),
  unique (id, contract_id),
  check ((subtotal = order_subtotal_snapshot) = (variance_reason is null)),
  check ((kind = 'original') = (signed_quotation_file_id is not null)),
  check ((kind = 'amendment') = (reason is not null)),
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (contract_file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (signed_quotation_file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_contract_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  contract_version_id uuid not null,
  seq integer not null check (seq > 0),
  installment_key uuid not null,
  name text not null check (btrim(name) = name and name <> '' and char_length(name) <= 200),
  amount numeric(20,4) not null check (amount > 0),
  due_on date not null,
  is_advance boolean not null,
  unique (contract_version_id, seq),
  unique (contract_version_id, installment_key),
  unique (id, tenant_id, company_id, project_id),
  foreign key (contract_version_id, tenant_id, company_id, project_id)
    references public.material_contract_versions(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict,
  -- An installment must belong to a version of the same contract.
  foreign key (contract_version_id, contract_id)
    references public.material_contract_versions(id, contract_id) on delete restrict
);
create index material_contract_installments_contract_idx
on public.material_contract_installments(contract_id, installment_key);

create table public.material_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  supplier_id uuid not null,
  invoice_symbol text not null check (btrim(invoice_symbol) = invoice_symbol and invoice_symbol <> '' and char_length(invoice_symbol) <= 20),
  invoice_no text not null check (btrim(invoice_no) = invoice_no and invoice_no <> '' and char_length(invoice_no) <= 50),
  issued_on date not null,
  subtotal numeric(20,4) not null check (subtotal > 0),
  vat_amount numeric(20,4) not null check (vat_amount >= 0),
  total numeric(20,4) not null check (total = subtotal + vat_amount),
  file_id uuid not null unique,
  state text not null default 'recorded' check (state in ('recorded','voided')),
  void_reason text,
  voided_by uuid references auth.users(id) on delete restrict,
  voided_at timestamptz,
  version bigint not null default 1 check (version > 0),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  unique (id, contract_id),
  check ((state = 'voided') = (void_reason is not null and voided_by is not null and voided_at is not null)),
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict,
  -- The invoice supplier must be the contract supplier.
  foreign key (contract_id, supplier_id)
    references public.material_contracts(id, supplier_id) on delete restrict,
  foreign key (supplier_id, tenant_id, company_id)
    references public.business_parties(id, tenant_id, company_id) on delete restrict,
  foreign key (file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict
);
create unique index material_invoices_recorded_identity_idx
on public.material_invoices(company_id, supplier_id, invoice_symbol, invoice_no) where state = 'recorded';
create index material_invoices_contract_idx on public.material_invoices(contract_id, state);

create table public.material_invoice_lines (
  invoice_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  proposal_line_id uuid not null,
  invoice_material_name text not null check (btrim(invoice_material_name) = invoice_material_name and invoice_material_name <> '' and char_length(invoice_material_name) <= 300),
  primary key (invoice_id, proposal_line_id),
  foreign key (invoice_id, tenant_id, company_id, project_id)
    references public.material_invoices(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_payment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  installment_key uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  note text check (note is null or char_length(note) <= 1000),
  state text not null default 'submitted' check (state in ('submitted','returned','approved','paid','cancelled')),
  revision_no integer not null default 1 check (revision_no > 0),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  cancel_reason text check (cancel_reason is null or (btrim(cancel_reason) <> '' and char_length(cancel_reason) <= 1000)),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  unique (id, contract_id),
  unique (id, contract_id, installment_key),
  check ((state = 'cancelled') = (cancel_reason is not null)),
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict
);
create index material_payment_requests_capacity_idx
on public.material_payment_requests(contract_id, installment_key, state);

create table public.material_payment_request_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  payment_request_id uuid not null,
  revision_no integer not null check (revision_no > 0),
  installment_key uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  invoice_ids uuid[] not null,
  note text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (payment_request_id, revision_no),
  unique (id, tenant_id, company_id, project_id),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_payment_request_invoices (
  payment_request_id uuid not null,
  invoice_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  primary key (payment_request_id, invoice_id),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete cascade,
  foreign key (invoice_id, tenant_id, company_id, project_id)
    references public.material_invoices(id, tenant_id, company_id, project_id) on delete restrict,
  -- Request and invoice must belong to the same contract.
  foreign key (payment_request_id, contract_id)
    references public.material_payment_requests(id, contract_id) on delete cascade,
  foreign key (invoice_id, contract_id)
    references public.material_invoices(id, contract_id) on delete restrict
);
create index material_payment_request_invoices_invoice_idx
on public.material_payment_request_invoices(invoice_id);

create table public.material_payment_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  payment_request_id uuid not null,
  request_revision_no integer not null,
  decision text not null check (decision in ('approve','return')),
  reason text check (reason is null or (btrim(reason) <> '' and char_length(reason) <= 1000)),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (payment_request_id, request_revision_no),
  unique (id, tenant_id, company_id, project_id),
  check ((decision = 'return') = (reason is not null)),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  payment_request_id uuid not null unique,
  contract_id uuid not null,
  installment_key uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  paid_on date not null,
  bank_reference text not null check (btrim(bank_reference) = bank_reference and bank_reference <> '' and char_length(bank_reference) <= 100),
  proof_file_id uuid not null unique,
  proof_sha256 text not null check (proof_sha256 ~ '^[a-f0-9]{64}$'),
  paid_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (company_id, proof_sha256),
  unique (id, tenant_id, company_id, project_id),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete restrict,
  -- A payment snapshots the contract and installment of its own request.
  foreign key (payment_request_id, contract_id, installment_key)
    references public.material_payment_requests(id, contract_id, installment_key) on delete restrict,
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (proof_file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict
);
create index material_payments_contract_idx on public.material_payments(contract_id, installment_key);

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null check (event_kind in (
    'material.order.created','material.contract.recorded','material.contract.amended',
    'material.installment.due_soon','material.installment.overdue',
    'material.payment.submitted','material.payment.returned','material.payment.paid')),
  source_type text not null check (source_type in ('material_order','material_contract','material_installment','material_payment_request')),
  source_id uuid not null,
  link_path text not null check (link_path like '/%' and char_length(link_path) <= 500),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, dedupe_key),
  foreign key (company_id, tenant_id)
    references public.companies(id, tenant_id) on delete restrict,
  -- MATCH SIMPLE: company-level notifications (project_id null) skip this check.
  foreign key (project_id, tenant_id, company_id)
    references public.projects(id, tenant_id, company_id) on delete restrict
);
create index app_notifications_recipient_idx on public.app_notifications(recipient_id, company_id, created_at desc, id);

-- Re-point the empty signed-order flag table from cost_workflow_contracts to material_contracts.
do $$
declare v_constraint text;
begin
  if exists (select 1 from public.material_order_contracts) then
    raise exception using errcode = 'P0001', message = 'C1_MATERIAL_ORDER_CONTRACTS_NOT_EMPTY';
  end if;
  select constraint_row.conname into v_constraint
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.material_order_contracts'::regclass
    and constraint_row.confrelid = 'public.cost_workflow_contracts'::regclass
    and constraint_row.contype = 'f';
  if v_constraint is null then
    raise exception using errcode = 'P0001', message = 'C1_MATERIAL_ORDER_CONTRACTS_BASELINE_MISSING';
  end if;
  execute format('alter table public.material_order_contracts drop constraint %I', v_constraint);
end;
$$;
alter table public.material_order_contracts
  add constraint material_order_contracts_material_contract_fkey
  foreign key (contract_id, tenant_id, company_id, project_id)
  references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict;

-- Evidence scope: contract-level target.
-- Baseline (20261008125023) declares two unnamed checks on material_evidence_scopes:
--   * the inline column check on target_kind, which PostgreSQL names
--     material_evidence_scopes_target_kind_check;
--   * a table check pinning the proposal/order target shape (auto-named, looked up below).
-- Both must be replaced, otherwise a material_contract scope row violates the shape check.
alter table public.material_evidence_scopes add column contract_id uuid;
alter table public.material_evidence_scopes drop constraint material_evidence_scopes_target_kind_check;
alter table public.material_evidence_scopes add constraint material_evidence_scopes_target_kind_check
  check (target_kind in ('material_proposal','material_order','material_contract'));
do $$
declare v_constraints text[];
begin
  select array_agg(constraint_row.conname) into v_constraints
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.material_evidence_scopes'::regclass
    and constraint_row.contype = 'c'
    and constraint_row.conname <> all(array[
      'material_evidence_scopes_target_kind_check',
      'material_evidence_scopes_role_target_check'
    ])
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%target_kind%'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%revision_id%'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%order_id%';
  if coalesce(cardinality(v_constraints), 0) <> 1 then
    raise exception using errcode = 'P0001', message = 'C1_MATERIAL_EVIDENCE_SCOPE_BASELINE_MISSING';
  end if;
  execute format('alter table public.material_evidence_scopes drop constraint %I', v_constraints[1]);
end;
$$;
alter table public.material_evidence_scopes add constraint material_evidence_scopes_target_shape_check check (
  (target_kind = 'material_proposal' and proposal_id is not null and revision_id is not null and order_id is null and contract_id is null)
  or (target_kind = 'material_order' and proposal_id is null and revision_id is null and order_id is not null and contract_id is null)
  or (target_kind = 'material_contract' and proposal_id is null and revision_id is null and order_id is null and contract_id is not null)
);
alter table public.material_evidence_scopes drop constraint material_evidence_scopes_role_target_check;
alter table public.material_evidence_scopes add constraint material_evidence_scopes_role_target_check check (
  (target_kind = 'material_proposal' and evidence_role = 'unsigned_quotation')
  or (target_kind = 'material_order' and evidence_role in ('signed_quotation','signed_contract'))
  or (target_kind = 'material_contract' and evidence_role in ('contract_amendment','invoice','payment_proof') and contract_id is not null)
);
alter table public.material_evidence_scopes
  add constraint material_evidence_scopes_contract_fkey
  foreign key (contract_id, tenant_id, company_id, project_id)
  references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict;
create index material_evidence_scopes_contract_idx
on public.material_evidence_scopes(tenant_id, company_id, project_id, contract_id) where target_kind = 'material_contract';

-- Shared helpers. RLS predicates run as authenticated; the rest are only
-- reachable from SECURITY DEFINER RPCs and triggers.
create function private.c1_material_can_read_finance(t uuid, c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.c1_material_actor_has_permission(t, c, 'material.read')
    and (
      private.c1_material_actor_has_permission(t, c, 'material.finance.read')
      or private.c1_material_actor_has_permission(t, c, 'material.contract.record')
      or private.c1_material_actor_has_permission(t, c, 'material.payment.request')
      or private.c1_material_actor_has_permission(t, c, 'material.payment.approve')
      or private.c1_material_actor_has_permission(t, c, 'material.payment.execute')
    );
$$;

create function private.c1_material_can_see_contract_status(t uuid, c uuid, p uuid, target_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.c1_material_can_read_finance(t, c)
    or private.c1_material_can_read_order(t, c, p)
    or exists (
      select 1
      from public.material_orders as material_order
      join public.material_proposals as proposal
        on proposal.id = material_order.proposal_id
       and proposal.tenant_id = material_order.tenant_id
       and proposal.company_id = material_order.company_id
       and proposal.project_id = material_order.project_id
      where material_order.id = target_order_id
        and material_order.tenant_id = t and material_order.company_id = c and material_order.project_id = p
        and proposal.created_by = auth.uid()
        and private.c1_material_actor_has_permission(t, c, 'material.read')
    );
$$;

create function private.c1_material_installment_usage(target_contract_id uuid)
returns table(installment_key uuid, paid numeric, pending numeric)
language sql stable security definer set search_path = '' as $$
  select keys.installment_key,
    coalesce((select sum(payment.amount) from public.material_payments as payment
      where payment.contract_id = target_contract_id and payment.installment_key = keys.installment_key), 0),
    coalesce((select sum(request.amount) from public.material_payment_requests as request
      where request.contract_id = target_contract_id and request.installment_key = keys.installment_key
        and request.state in ('submitted','approved')), 0)
  from (
    select distinct request.installment_key from public.material_payment_requests as request
    where request.contract_id = target_contract_id
  ) as keys;
$$;

-- Row level security for every new material finance table.
alter table public.material_contracts enable row level security;
alter table public.material_contracts force row level security;
revoke all on public.material_contracts from public,anon,authenticated,service_role;
grant select on public.material_contracts to authenticated;
create policy material_contracts_finance_read on public.material_contracts
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));
create policy material_contracts_status_read on public.material_contracts
for select to authenticated using (private.c1_material_can_see_contract_status(tenant_id, company_id, project_id, order_id));

alter table public.material_contract_versions enable row level security;
alter table public.material_contract_versions force row level security;
revoke all on public.material_contract_versions from public,anon,authenticated,service_role;
grant select on public.material_contract_versions to authenticated;
create policy material_contract_versions_finance_read on public.material_contract_versions
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_contract_installments enable row level security;
alter table public.material_contract_installments force row level security;
revoke all on public.material_contract_installments from public,anon,authenticated,service_role;
grant select on public.material_contract_installments to authenticated;
create policy material_contract_installments_finance_read on public.material_contract_installments
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_invoices enable row level security;
alter table public.material_invoices force row level security;
revoke all on public.material_invoices from public,anon,authenticated,service_role;
grant select on public.material_invoices to authenticated;
create policy material_invoices_finance_read on public.material_invoices
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_invoice_lines enable row level security;
alter table public.material_invoice_lines force row level security;
revoke all on public.material_invoice_lines from public,anon,authenticated,service_role;
grant select on public.material_invoice_lines to authenticated;
create policy material_invoice_lines_finance_read on public.material_invoice_lines
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_payment_requests enable row level security;
alter table public.material_payment_requests force row level security;
revoke all on public.material_payment_requests from public,anon,authenticated,service_role;
grant select on public.material_payment_requests to authenticated;
create policy material_payment_requests_finance_read on public.material_payment_requests
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_payment_request_revisions enable row level security;
alter table public.material_payment_request_revisions force row level security;
revoke all on public.material_payment_request_revisions from public,anon,authenticated,service_role;
grant select on public.material_payment_request_revisions to authenticated;
create policy material_payment_request_revisions_finance_read on public.material_payment_request_revisions
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_payment_request_invoices enable row level security;
alter table public.material_payment_request_invoices force row level security;
revoke all on public.material_payment_request_invoices from public,anon,authenticated,service_role;
grant select on public.material_payment_request_invoices to authenticated;
create policy material_payment_request_invoices_finance_read on public.material_payment_request_invoices
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_payment_decisions enable row level security;
alter table public.material_payment_decisions force row level security;
revoke all on public.material_payment_decisions from public,anon,authenticated,service_role;
grant select on public.material_payment_decisions to authenticated;
create policy material_payment_decisions_finance_read on public.material_payment_decisions
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.material_payments enable row level security;
alter table public.material_payments force row level security;
revoke all on public.material_payments from public,anon,authenticated,service_role;
grant select on public.material_payments to authenticated;
create policy material_payments_finance_read on public.material_payments
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));

alter table public.app_notifications enable row level security;
alter table public.app_notifications force row level security;
revoke all on public.app_notifications from public,anon,authenticated,service_role;
grant select on public.app_notifications to authenticated;
create policy app_notifications_recipient_read on public.app_notifications
for select to authenticated using (recipient_id = auth.uid());

-- Immutable finance history.
create trigger material_contract_versions_history_immutable
before update or delete on public.material_contract_versions
for each row execute function private.c1_material_retain_history();
create trigger material_contract_installments_history_immutable
before update or delete on public.material_contract_installments
for each row execute function private.c1_material_retain_history();
create trigger material_invoice_lines_history_immutable
before update or delete on public.material_invoice_lines
for each row execute function private.c1_material_retain_history();
create trigger material_payment_request_revisions_history_immutable
before update or delete on public.material_payment_request_revisions
for each row execute function private.c1_material_retain_history();
create trigger material_payment_decisions_history_immutable
before update or delete on public.material_payment_decisions
for each row execute function private.c1_material_retain_history();
create trigger material_payments_history_immutable
before update or delete on public.material_payments
for each row execute function private.c1_material_retain_history();

-- In-app notifications. The acting user never notifies themself; recipients
-- must still hold material.read in the company.
-- c1_material_notify_users selects recipients by user id only (for example buyers
-- or engineers without finance permission), so its payload must never carry money
-- values. Money-bearing payloads go only through c1_material_notify_permission
-- with a finance permission.
create function private.c1_material_notify_users(
  t uuid, c uuid, p uuid, user_ids uuid[], event_kind text, source_type text, source_id uuid,
  link_path text, payload jsonb, dedupe_key text
) returns void language sql volatile security definer set search_path = '' as $$
  insert into public.app_notifications(
    tenant_id, company_id, project_id, recipient_id, event_kind, source_type, source_id, link_path, payload, dedupe_key
  )
  select t, c, p, recipient.user_id, event_kind, source_type, source_id, link_path, payload, dedupe_key
  from (select distinct unnest(user_ids) as user_id) as recipient
  where recipient.user_id is not null
    and recipient.user_id is distinct from auth.uid()
    and private.c1_workflow_user_has_permission(t, c, recipient.user_id, 'material.read')
  on conflict (recipient_id, dedupe_key) do nothing;
$$;

create function private.c1_material_notify_permission(
  t uuid, c uuid, p uuid, permission text, event_kind text, source_type text, source_id uuid,
  link_path text, payload jsonb, dedupe_key text
) returns void language sql volatile security definer set search_path = '' as $$
  select private.c1_material_notify_users(
    t, c, p,
    array(
      select membership.user_id from public.company_memberships as membership
      where membership.tenant_id = t and membership.company_id = c and membership.is_active
        and private.c1_workflow_user_has_permission(t, c, membership.user_id, permission)
    ),
    event_kind, source_type, source_id, link_path, payload, dedupe_key
  );
$$;

create function private.c1_material_notify_order_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_supplier_name text;
begin
  select party.display_name into v_supplier_name from public.business_parties as party
  where party.id = new.supplier_id and party.tenant_id = new.tenant_id and party.company_id = new.company_id;
  perform private.c1_material_notify_permission(
    new.tenant_id, new.company_id, new.project_id, 'material.contract.record',
    'material.order.created', 'material_order', new.id,
    '/materials/' || new.project_id::text || '/orders/' || new.id::text,
    jsonb_build_object('supplierName', v_supplier_name),
    'order:' || new.id::text
  );
  return new;
end;
$$;
create trigger material_order_created_notify after insert on public.material_orders
for each row execute function private.c1_material_notify_order_created();

-- Order reads: the legacy cost-workflow cash shape is retired. Copied from
-- 20261008140823 (latest definition); only the contract and cash fields change.
-- Later tasks fill these from material_contracts.
create or replace function private.c1_material_order_json(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_order public.material_orders%rowtype;
  v_supplier_name text;
  v_allocations jsonb;
begin
  select material_order.* into v_order
  from public.material_orders as material_order
  where material_order.id = target_id
    and material_order.tenant_id = target_tenant_id
    and material_order.company_id = target_company_id
    and material_order.project_id = target_project_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select supplier.display_name into v_supplier_name
  from public.business_parties as supplier
  where supplier.id = v_order.supplier_id
    and supplier.tenant_id = v_order.tenant_id
    and supplier.company_id = v_order.company_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderLineId', allocation.id,
    'proposalLineId', allocation.proposal_line_id,
    'materialId', snapshot.material_id,
    'materialName', snapshot.material_name,
    'specification', snapshot.specification,
    'unit', snapshot.unit,
    'quantity', allocation.quantity::text,
    'unitPrice', allocation.unit_price::text,
    'quotationMaterialName', allocation.quotation_material_name,
    'mappingConfirmed', allocation.mapping_confirmed
  ) order by allocation.id), '[]'::jsonb)
  into v_allocations
  from public.material_order_allocations as allocation
  join public.material_proposal_revision_lines as snapshot
    on snapshot.revision_id = v_order.approved_revision_id
   and snapshot.proposal_line_id = allocation.proposal_line_id
   and snapshot.tenant_id = allocation.tenant_id
   and snapshot.company_id = allocation.company_id
   and snapshot.project_id = allocation.project_id
  where allocation.order_id = v_order.id
    and allocation.tenant_id = v_order.tenant_id
    and allocation.company_id = v_order.company_id
    and allocation.project_id = v_order.project_id;

  return jsonb_build_object(
    'id', v_order.id,
    'version', v_order.version,
    'orderState', v_order.state,
    'proposalId', v_order.proposal_id,
    'approvedRevisionId', v_order.approved_revision_id,
    'supplierId', v_order.supplier_id,
    'supplierName', v_supplier_name,
    'currencyCode', v_order.currency_code,
    'allocations', v_allocations,
    'unsignedQuotationEvidenceFileId', v_order.unsigned_quotation_evidence_file_id,
    'contract', null,
    'cash', null
  );
end;
$$;

revoke all on function
  private.c1_material_order_json(uuid,uuid,uuid,uuid),
  private.c1_material_can_read_finance(uuid,uuid),
  private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid),
  private.c1_material_installment_usage(uuid),
  private.c1_material_notify_users(uuid,uuid,uuid,uuid[],text,text,uuid,text,jsonb,text),
  private.c1_material_notify_permission(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,text),
  private.c1_material_notify_order_created()
from public,anon,authenticated,service_role;
-- RLS policies call these as authenticated (see 20261010072624).
grant execute on function
  private.c1_material_can_read_finance(uuid,uuid),
  private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid)
to authenticated;

notify pgrst, 'reload schema';
